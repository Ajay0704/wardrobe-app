/**
 * Postmark inbound webhook (AJA-114). A trusted user forwards an order email to
 * their unique +token address; we parse clothing line-items with Gemini and STAGE
 * them as import_candidates for review (never write to the closet here).
 *
 * Auth: HTTP Basic (INBOUND_WEBHOOK_USER/PASS) — set on the Postmark webhook URL.
 * Routing: Postmark MailboxHash = the +token -> import_allow.inbox_token -> user.
 */

import { adminClient, dedupeKey, guessCategory, storeImage } from "@/lib/import-item";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-3.5-flash";
const MAX_ITEMS = 20; // cap image fetches to stay within the function limit
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_BATCHES = 5;

function ok(msg = "ok") {
  return Response.json({ ok: true, msg });
}

/** Constant-time-ish Basic auth check against env creds. */
function basicAuthOK(req: Request): boolean {
  const user = process.env.INBOUND_WEBHOOK_USER;
  const pass = process.env.INBOUND_WEBHOOK_PASS;
  if (!user || !pass) return false;
  const header = req.headers.get("authorization") || "";
  const m = /^Basic\s+(.+)$/i.exec(header);
  if (!m) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
}

function stripHtml(html: string, max = 12000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

interface ParsedItem {
  name?: string;
  brand?: string;
  price?: number | null;
  imageUrl?: string | null;
  productUrl?: string | null;
}

/** Ask Gemini for the clothing line-items in an order email. */
async function parseReceipt(subject: string, html: string, text: string): Promise<ParsedItem[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  // Pull absolute image URLs out of the HTML so Gemini can match them to items.
  const imgUrls = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi))
    .map((m) => m[1])
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 40);
  const body = stripHtml(html) || text.slice(0, 12000);
  const prompt =
    `This is a retail order-confirmation email. Extract ONLY purchased clothing / ` +
    `footwear / accessories line items (skip shipping, tax, totals, promos, gift cards, ` +
    `non-apparel). Return JSON only: {"items":[{"name":"short garment name","brand":"brand or null",` +
    `"price":number_or_null,"imageUrl":"absolute image url from the list or null","productUrl":"absolute product url or null"}]}. ` +
    `Match each item to the most relevant image URL from the candidates.\n\n` +
    `Subject: ${subject}\n` +
    `Image URL candidates: ${JSON.stringify(imgUrls)}\n` +
    `Email text: ${body}`;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1, thinkingConfig: { thinkingLevel: "minimal" } },
        }),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    };
    const raw = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim()) as { items?: ParsedItem[] };
    return Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

interface PostmarkInbound {
  FromFull?: { Email?: string };
  MailboxHash?: string;
  MessageID?: string;
  Subject?: string;
  HtmlBody?: string;
  TextBody?: string;
}

export async function POST(request: Request) {
  // 1. Basic auth (in addition to the per-user token below).
  if (!basicAuthOK(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return ok("unconfigured");

  const p = (await request.json().catch(() => ({}))) as PostmarkInbound;
  const token = (p.MailboxHash || "").trim();
  const messageId = (p.MessageID || "").trim();
  const sender = (p.FromFull?.Email || "").trim().toLowerCase();
  if (!token) return ok("no token");

  // 2. Routing: token -> user (must be allowlisted + not disabled).
  const { data: allow } = await admin
    .from("import_allow")
    .select("user_id, verified_senders, disabled")
    .eq("inbox_token", token)
    .maybeSingle();
  if (!allow || allow.disabled) return ok("unknown token");
  const userId = allow.user_id as string;

  // 3. Idempotency: same MessageID can't create a second batch.
  if (messageId) {
    const { error: insErr } = await admin
      .from("import_processed")
      .insert({ user_id: userId, message_id: messageId });
    if (insErr) return ok("already processed"); // PK conflict = seen before
  }

  // 4. Rate-limit: cap batches per user per minute.
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("import_processed")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) > RATE_MAX_BATCHES) return ok("rate limited");

  // 5. Sender gate: unverified sender -> held (needs_verification), never pending.
  const verified = (allow.verified_senders as string[] | null) ?? [];
  const held = !sender || !verified.map((s) => s.toLowerCase()).includes(sender);
  const status = held ? "needs_verification" : "pending";

  // 6. Parse the receipt.
  const items = await parseReceipt(p.Subject || "", p.HtmlBody || "", p.TextBody || "");
  if (!items.length) return ok("no items");

  // Dedupe against existing candidates for this user.
  const { data: existing } = await admin
    .from("import_candidates")
    .select("dedupe_key")
    .eq("user_id", userId)
    .in("status", ["pending", "needs_verification", "accepted"]);
  const seen = new Set((existing ?? []).map((r) => (r as { dedupe_key: string }).dedupe_key));

  // 7. Capture images durably now (retailer URLs expire), best-effort.
  const rows: Record<string, unknown>[] = [];
  for (const it of items) {
    const name = (it.name || "").trim();
    if (!name) continue;
    const key = dedupeKey({ name, brand: it.brand ?? undefined, price: it.price ?? undefined, productUrl: it.productUrl ?? undefined });
    if (seen.has(key)) continue;
    seen.add(key);
    let imageUrl: string | null = null;
    if (it.imageUrl) imageUrl = await storeImage(admin, userId, { imageUrl: it.imageUrl }, 6000);
    rows.push({
      user_id: userId,
      source: "email",
      message_id: messageId || null,
      sender: sender || null,
      name,
      brand: it.brand || null,
      price: it.price ?? null,
      product_url: it.productUrl || null,
      image_url: imageUrl,
      image_status: imageUrl ? "ok" : "unavailable",
      category: guessCategory(name),
      dedupe_key: key,
      status,
    });
  }
  if (rows.length) await admin.from("import_candidates").insert(rows);
  return ok(`staged ${rows.length}`);
}
