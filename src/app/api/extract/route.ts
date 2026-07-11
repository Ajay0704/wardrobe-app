import { safeFetch } from "@/lib/net";
import { requireUser } from "@/lib/auth-server";
import { brandFromHost, splitTitleAndBrand } from "@/lib/extract-product";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Extracted {
  name?: string;
  imageUrl?: string;
  /** Compressed base64 data URL of the product image, for re-hosting client-side. */
  imageData?: string;
  price?: number;
  brand?: string;
  description?: string;
}

const MODEL = "gemini-3.5-flash";

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const decode = (s: string) =>
  stripTags(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

/** Read a <meta property|name="key" content="..."> (either attribute order). */
function meta(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return decode(m[1]);
  }
  return undefined;
}

function itemprop(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<[^>]+itemprop=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${key}["']`,
      "i",
    ),
    new RegExp(`<[^>]+itemprop=["']${key}["'][^>]*>([^<]+)<`, "i"),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return decode(m[1]);
  }
  return undefined;
}

/** Resolve a JSON-LD image value: string, ImageObject {url}, or an array of either. */
function firstImage(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    for (const el of v) {
      const r = firstImage(el);
      if (r) return r;
    }
    return undefined;
  }
  if (typeof v === "object") {
    const u =
      (v as { url?: unknown; contentUrl?: unknown }).url ??
      (v as { contentUrl?: unknown }).contentUrl;
    return typeof u === "string" ? u : undefined;
  }
  return undefined;
}

function parsePrice(raw?: string | number | null): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const m = String(raw).replace(/,/g, "").match(/\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function isLikelyLogo(url: string): boolean {
  return /logo|favicon|sprite|icon|placeholder|1x1|pixel|badge|wordmark/i.test(
    url,
  );
}

function priceFromOffers(offers: unknown): number | undefined {
  if (!offers) return undefined;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const rec = o as Record<string, unknown>;
    const direct =
      parsePrice(rec.price as string | number | undefined) ??
      parsePrice(rec.lowPrice as string | number | undefined) ??
      parsePrice(rec.highPrice as string | number | undefined);
    if (direct != null) return direct;
    if (rec.priceSpecification) {
      const specs = Array.isArray(rec.priceSpecification)
        ? rec.priceSpecification
        : [rec.priceSpecification];
      for (const s of specs) {
        if (s && typeof s === "object") {
          const p = parsePrice((s as { price?: unknown }).price as string);
          if (p != null) return p;
        }
      }
    }
  }
  return undefined;
}

/** Pull name/image/brand/price from a JSON-LD Product block if present. */
function fromJsonLd(html: string): Extracted {
  const out: Extracted = {};
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    const graph = nodes.flatMap((n) =>
      n && typeof n === "object" && "@graph" in n
        ? ((n as { "@graph": unknown[] })["@graph"] ?? [])
        : [n],
    );
    for (const node of graph) {
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const type = String(o["@type"] ?? "");
      if (!/product/i.test(type)) continue;
      if (typeof o.name === "string") out.name ??= decode(o.name);
      if (typeof o.description === "string")
        out.description ??= decode(o.description);
      const img = firstImage(o.image);
      if (img && !isLikelyLogo(img)) out.imageUrl ??= img;
      const brand =
        typeof o.brand === "string"
          ? o.brand
          : (o.brand as { name?: string })?.name;
      if (typeof brand === "string") out.brand ??= decode(brand);
      const price = priceFromOffers(o.offers);
      if (price != null) out.price ??= price;
    }
  }
  return out;
}

/** Shopify and similar embed product JSON in the page. */
function fromEmbeddedJson(html: string): Extracted {
  const out: Extracted = {};
  const shopify = /<script[^>]+id=["']ProductJson-?[^"']*["'][^>]*>([\s\S]*?)<\/script>/i.exec(
    html,
  );
  if (shopify) {
    try {
      const p = JSON.parse(shopify[1]) as Record<string, unknown>;
      if (typeof p.title === "string") out.name ??= decode(p.title);
      if (typeof p.vendor === "string") out.brand ??= decode(p.vendor);
      const variants = p.variants as Array<{ price?: unknown }> | undefined;
      const price =
        parsePrice(p.price as string | number | undefined) ??
        (variants?.[0] ? parsePrice(variants[0].price as string | number) : undefined);
      // Shopify prices are often cents.
      if (price != null) {
        out.price ??= price > 1000 && Number.isInteger(price) ? price / 100 : price;
      }
      const img = firstImage(p.featured_image ?? p.images);
      if (img && !isLikelyLogo(img)) out.imageUrl ??= img.startsWith("//")
        ? `https:${img}`
        : img;
    } catch {
      /* ignore */
    }
  }

  // Generic "price": 49.95 near product context
  if (out.price == null) {
    const m =
      /"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i.exec(html) ??
      /"current_price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i.exec(html) ??
      /"salePrice"\s*:\s*"?(\d+(?:\.\d+)?)"?/i.exec(html);
    if (m) out.price = parsePrice(m[1]);
  }
  return out;
}

function linkImage(html: string): string | undefined {
  const m =
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html) ??
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i.exec(html);
  return m ? decode(m[1]) : undefined;
}

function pickImage(...cands: Array<string | undefined>): string | undefined {
  for (const c of cands) {
    if (c && !isLikelyLogo(c)) return c;
  }
  // Last resort: allow logo-ish only if nothing else
  return cands.find((c) => !!c);
}

/** Visible text sample for Gemini when OG/JSON-LD is empty (SPA retailers). */
function textSample(html: string, max = 6000): string {
  return stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function geminiEnrich(
  url: string,
  partial: Extracted,
  html: string,
): Promise<Partial<Extracted>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return {};
  // Only call when we're missing something important.
  if (partial.name && partial.imageUrl && partial.brand && partial.price != null) {
    return {};
  }

  const sample = textSample(html);
  const prompt =
    `Extract product listing fields from this shop URL and page text. ` +
    `Return JSON only: {"name":"short garment name without brand suffix","brand":"brand or null","price":number_or_null,"imageUrl":"absolute https image url or null"}. ` +
    `Name must be a short clothing name (e.g. "Long-Sleeve Polo"), NOT "Title | Brand". ` +
    `Prefer a product photo URL (not logo). If unknown, use null.\n\n` +
    `URL: ${url}\n` +
    `Known so far: ${JSON.stringify(partial)}\n` +
    `Page text (may be incomplete for JS sites):\n${sample}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!resp.ok) return {};
    const data = (await resp.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as Record<
      string,
      unknown
    >;
    const out: Partial<Extracted> = {};
    if (typeof parsed.name === "string" && parsed.name.trim())
      out.name = parsed.name.trim();
    if (typeof parsed.brand === "string" && parsed.brand.trim())
      out.brand = parsed.brand.trim();
    const price = parsePrice(parsed.price as string | number | null);
    if (price != null) out.price = price;
    if (typeof parsed.imageUrl === "string" && /^https?:\/\//i.test(parsed.imageUrl)) {
      if (!isLikelyLogo(parsed.imageUrl)) out.imageUrl = parsed.imageUrl;
    }
    return out;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL((body.url ?? "").trim());
  } catch {
    return Response.json({ error: "Enter a valid product link." }, { status: 400 });
  }

  let html: string;
  try {
    const res = await safeFetch(target.toString(), {
      headers: {
        // Look like a real browser so pages return their SEO meta tags.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return Response.json(
        { error: `The site returned an error (${res.status}).` },
        { status: 502 },
      );
    }
    html = (await res.text()).slice(0, 1_500_000); // cap parsing work
  } catch (e) {
    const blocked = e instanceof Error && e.message.startsWith("blocked");
    return Response.json(
      {
        error: blocked
          ? "That link can't be fetched."
          : "Couldn't reach that link. Fill the details in manually.",
      },
      { status: blocked ? 400 : 502 },
    );
  }

  const ld = fromJsonLd(html);
  const embedded = fromEmbeddedJson(html);
  const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
  const hostBrand = brandFromHost(target.hostname);

  let result: Extracted = {
    name:
      ld.name ??
      embedded.name ??
      meta(html, "og:title") ??
      meta(html, "twitter:title") ??
      itemprop(html, "name") ??
      (titleTag && decode(titleTag)),
    imageUrl: pickImage(
      ld.imageUrl,
      embedded.imageUrl,
      meta(html, "og:image:secure_url"),
      meta(html, "og:image"),
      meta(html, "twitter:image"),
      itemprop(html, "image"),
      linkImage(html),
    ),
    price:
      ld.price ??
      embedded.price ??
      parsePrice(
        meta(html, "product:price:amount") ??
          meta(html, "og:price:amount") ??
          itemprop(html, "price"),
      ),
    brand:
      ld.brand ??
      embedded.brand ??
      meta(html, "product:brand") ??
      itemprop(html, "brand") ??
      hostBrand ??
      meta(html, "og:site_name"),
    description:
      ld.description ?? meta(html, "og:description") ?? itemprop(html, "description"),
  };

  // Clean "Name | Brand" titles and back-fill brand from the suffix.
  const split = splitTitleAndBrand(result.name, result.brand);
  result.name = split.name;
  result.brand = split.brand ?? result.brand;

  // SPA retailers (Gap / Banana Republic) often ship empty OG tags — ask Gemini.
  const enriched = await geminiEnrich(target.toString(), result, html);
  result = {
    name: result.name ?? enriched.name,
    imageUrl: result.imageUrl ?? enriched.imageUrl,
    price: result.price ?? enriched.price,
    brand: result.brand ?? enriched.brand ?? hostBrand,
    description: result.description,
  };
  // Re-clean if Gemini returned a pipe title.
  const split2 = splitTitleAndBrand(result.name, result.brand);
  result.name = split2.name;
  result.brand = split2.brand ?? result.brand;

  // Resolve a relative og:image against the page URL.
  if (result.imageUrl) {
    try {
      result.imageUrl = new URL(result.imageUrl, target).toString();
    } catch {
      delete result.imageUrl;
    }
  }

  if (!result.name && !result.imageUrl && result.brand == null && result.price == null) {
    return Response.json(
      { error: "Couldn't read details from that link. Add them manually." },
      { status: 422 },
    );
  }

  // Fetch the image bytes server-side (no CORS, redirect-safe) so the client
  // can re-host it in Storage instead of relying on a fragile retailer URL.
  if (result.imageUrl) {
    try {
      const img = await safeFetch(result.imageUrl, {
        headers: {
          Accept: "image/*",
          Referer: target.origin + "/",
        },
        signal: AbortSignal.timeout(10000),
      });
      const type = img.headers.get("content-type") || "";
      const buf = Buffer.from(await img.arrayBuffer());
      if (img.ok && type.startsWith("image/") && buf.byteLength <= 8_000_000) {
        result.imageData = `data:${type};base64,${buf.toString("base64")}`;
      }
    } catch {
      // Leave imageData unset; the client falls back to the remote imageUrl.
    }
  }

  return Response.json(result);
}
