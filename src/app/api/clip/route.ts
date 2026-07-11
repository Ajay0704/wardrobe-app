import { requireUser } from "@/lib/auth-server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Category, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "wardrobe-images";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ExtractResult = {
  name?: string;
  imageUrl?: string;
  imageData?: string;
  price?: number;
  brand?: string;
  description?: string;
};

/** Best-effort category from product title — clip otherwise always saved as "top". */
function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/\b(dress|gown|romper|jumpsuit|overall)\b/.test(n)) return "dress";
  if (/\b(jean|pant|trouser|skirt|short|legging|chino)\b/.test(n)) return "bottom";
  if (/\b(shoe|sneaker|boot|heel|sandal|loafer|slipper)\b/.test(n)) return "shoes";
  if (/\b(jacket|coat|blazer|parka|puffer|cardigan|hoodie)\b/.test(n))
    return "outerwear";
  if (/\b(bag|tote|purse|backpack|clutch|crossbody)\b/.test(n)) return "bag";
  if (/\b(hat|belt|scarf|jewelry|earring|necklace|bracelet|watch|sunglass)\b/.test(n))
    return "accessory";
  return "top";
}

/** Re-host extract imageData (or remote URL) into Storage so cards don't die on hotlink blocks. */
async function durableImageUrl(
  admin: SupabaseClient,
  userId: string,
  extracted: ExtractResult,
): Promise<string> {
  let bytes: Buffer | null = null;
  let contentType = "image/jpeg";

  if (extracted.imageData?.startsWith("data:")) {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(extracted.imageData);
    if (m) {
      contentType = m[1] || contentType;
      bytes = Buffer.from(m[2], "base64");
    }
  }

  if (!bytes && extracted.imageUrl) {
    try {
      const res = await fetch(extracted.imageUrl, {
        headers: { Accept: "image/*" },
        signal: AbortSignal.timeout(10000),
      });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("image/")) {
        contentType = type;
        bytes = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      /* fall through */
    }
  }

  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 8_000_000) {
    return extracted.imageUrl || "";
  }

  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.warn("[clip] storage upload failed:", error.message);
    return extracted.imageUrl || "";
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl || extracted.imageUrl || "";
}

/**
 * Browser extension / deep-link: extract a product URL and append it to the
 * signed-in user's wishlist in wardrobe_snapshots.
 */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return json({ error: "Sign in required." }, 401);
  }

  const admin = adminClient();
  if (!admin) {
    return json(
      { error: "Server clip is not configured (SUPABASE_SERVICE_ROLE_KEY)." },
      503,
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    title?: string;
  };
  const url = (body.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return json({ error: "A valid http(s) product URL is required." }, 400);
  }

  const auth = request.headers.get("authorization") || "";
  const extractRes = await fetch(new URL("/api/extract", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({ url }),
  });

  let extracted: ExtractResult = {};
  if (extractRes.ok) {
    extracted = (await extractRes.json()) as ExtractResult;
  }

  const { data: row, error: pullError } = await admin
    .from("wardrobe_snapshots")
    .select("items, outfits, trips, calendar, profile, theme, draft")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pullError) {
    return json({ error: pullError.message }, 500);
  }

  const items = Array.isArray(row?.items) ? ([...row.items] as WardrobeItem[]) : [];
  const existing = items.find(
    (it) =>
      it.wishlist &&
      it.productUrl &&
      it.productUrl.replace(/\/$/, "") === url.replace(/\/$/, ""),
  );
  if (existing) {
    return json({
      ok: true,
      duplicate: true,
      item: { id: existing.id, name: existing.name },
    });
  }

  const name =
    extracted.name?.trim() ||
    body.title?.trim() ||
    "Wishlist item";

  const imageUrl = await durableImageUrl(admin, user.id, extracted);

  const item: WardrobeItem = {
    id: crypto.randomUUID(),
    name,
    imageUrl,
    productUrl: url,
    category: guessCategory(name),
    color: "#a8a29e",
    tags: [],
    seasons: [],
    brand: extracted.brand,
    price: extracted.price,
    notes: extracted.description?.slice(0, 280),
    wishlist: true,
    createdAt: Date.now(),
  };

  items.unshift(item);

  const payload = {
    user_id: user.id,
    items,
    outfits: row?.outfits ?? [],
    trips: row?.trips ?? [],
    calendar: row?.calendar ?? [],
    profile: row?.profile ?? {},
    theme: row?.theme ?? "light",
    draft: row?.draft ?? {},
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await admin
    .from("wardrobe_snapshots")
    .upsert(payload, { onConflict: "user_id" });

  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({
    ok: true,
    item: { id: item.id, name: item.name, imageUrl: item.imageUrl },
  });
}
