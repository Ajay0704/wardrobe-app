import { safeFetch } from "@/lib/net";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 20;

interface Extracted {
  name?: string;
  imageUrl?: string;
  /** Compressed base64 data URL of the product image, for re-hosting client-side. */
  imageData?: string;
  price?: number;
  brand?: string;
  description?: string;
}

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
    const u = (v as { url?: unknown; contentUrl?: unknown }).url ??
      (v as { contentUrl?: unknown }).contentUrl;
    return typeof u === "string" ? u : undefined;
  }
  return undefined;
}

function parsePrice(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = raw.replace(/,/g, "").match(/\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : undefined;
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
      if (img) out.imageUrl ??= img;
      const brand =
        typeof o.brand === "string"
          ? o.brand
          : (o.brand as { name?: string })?.name;
      if (typeof brand === "string") out.brand ??= decode(brand);
      const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
      const price = (offers as { price?: unknown })?.price;
      if (price != null) out.price ??= parsePrice(String(price));
    }
  }
  return out;
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
  const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];

  const result: Extracted = {
    name: ld.name ?? meta(html, "og:title") ?? (titleTag && decode(titleTag)),
    imageUrl:
      ld.imageUrl ??
      meta(html, "og:image:secure_url") ??
      meta(html, "og:image") ??
      meta(html, "twitter:image"),
    price:
      ld.price ??
      parsePrice(
        meta(html, "product:price:amount") ?? meta(html, "og:price:amount"),
      ),
    brand:
      ld.brand ?? meta(html, "product:brand") ?? meta(html, "og:site_name"),
    description: ld.description ?? meta(html, "og:description"),
  };

  // Resolve a relative og:image against the page URL.
  if (result.imageUrl) {
    try {
      result.imageUrl = new URL(result.imageUrl, target).toString();
    } catch {
      delete result.imageUrl;
    }
  }

  if (!result.name && !result.imageUrl) {
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
        headers: { Accept: "image/*" },
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
