import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export type ProductCandidate = {
  title: string;
  link: string;
  source?: string;
  thumbnail?: string;
  price?: number;
  priceLabel?: string;
};

type LensMatch = {
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
  price?:
    | {
        value?: string;
        extracted_value?: number;
        currency?: string;
      }
    | string;
  extracted_price?: number;
};

const EMPTY_RESULT_RE =
  /hasn'?t returned any results|no results|could not download|unable to download|unsupported image/i;

const RETAIL_HINT =
  /amazon\.|nordstrom|zara\.|hm\.com|uniqlo|gap\.com|oldnavy|bananarepublic|jcrew|asos\.|nike\.|adidas|lululemon|anthropologie|freepeople|ssense|farfetch|shopbop|macys|bloomingdale|target\.com|walmart|ebay\.|etsy\.|poshmark|thredup|therealreal|revolve|shopify|myshopify|garmentory|everlane|cos\.com|arcteryx|patagonia|rei\.com|dickssportinggoods|footlocker|sneakers|boutiqu/i;

const NOISE_HOST =
  /linkedin\.|instagram\.|facebook\.|twitter\.|x\.com|tiktok\.|pinterest\.|youtube\.|reddit\.|medium\.com|wikipedia\./i;

function isEmptySerpError(msg: string | undefined): boolean {
  return !!msg && EMPTY_RESULT_RE.test(msg);
}

function normalizeCandidates(matches: LensMatch[]): ProductCandidate[] {
  const out: ProductCandidate[] = [];
  const seen = new Set<string>();

  for (const m of matches) {
    const link = (m.link || "").trim();
    if (!/^https?:\/\//i.test(link)) continue;
    const key = link.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const title = (m.title || m.source || "Product").trim();
    let price: number | undefined;
    let priceLabel: string | undefined;

    if (typeof m.price === "object" && m.price) {
      if (
        typeof m.price.extracted_value === "number" &&
        Number.isFinite(m.price.extracted_value)
      ) {
        price = m.price.extracted_value;
      }
      priceLabel = m.price.value;
    } else if (typeof m.price === "string" && m.price.trim()) {
      priceLabel = m.price.trim();
      const n = Number(m.price.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n > 0) price = n;
    }
    if (
      price == null &&
      typeof m.extracted_price === "number" &&
      Number.isFinite(m.extracted_price)
    ) {
      price = m.extracted_price;
    }

    out.push({
      title,
      link,
      source: m.source,
      thumbnail: m.thumbnail,
      price,
      priceLabel,
    });
    if (out.length >= 20) break;
  }
  return out;
}

function shopScore(c: ProductCandidate): number {
  let s = 0;
  if (c.price != null) s += 5;
  if (c.priceLabel) s += 2;
  if (RETAIL_HINT.test(c.link) || RETAIL_HINT.test(c.source || "")) s += 6;
  if (NOISE_HOST.test(c.link)) s -= 8;
  return s;
}

function mergeCandidates(
  base: ProductCandidate[],
  extra: ProductCandidate[],
  limit = 8,
): ProductCandidate[] {
  const seen = new Set(base.map((c) => c.link.replace(/\/$/, "").toLowerCase()));
  const out = [...base];
  for (const c of extra) {
    const k = c.link.replace(/\/$/, "").toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

async function serpLens(
  apiKey: string,
  imageUrl: string,
  type: "products" | "visual_matches" | "exact_matches" | "all",
  q?: string,
): Promise<{ matches: LensMatch[]; error?: string }> {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_lens");
  u.searchParams.set("url", imageUrl);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("type", type);
  u.searchParams.set("hl", "en");
  if (q?.trim()) u.searchParams.set("q", q.trim());

  const res = await fetch(u.toString(), {
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as {
    error?: string;
    visual_matches?: LensMatch[];
    exact_matches?: LensMatch[];
    products?: LensMatch[];
  };

  if (data.error) {
    // Soft empty — caller tries the next Lens tab.
    if (isEmptySerpError(data.error)) {
      return { matches: [], error: data.error };
    }
    throw new Error(data.error);
  }
  if (!res.ok) {
    throw new Error(`SerpAPI error (${res.status})`);
  }

  const matches = [
    ...(Array.isArray(data.visual_matches) ? data.visual_matches : []),
    ...(Array.isArray(data.exact_matches) ? data.exact_matches : []),
    ...(Array.isArray(data.products) ? data.products : []),
  ];
  return { matches };
}

/**
 * Closet photo → shopping candidates via SerpAPI Google Lens (AJA-79).
 * Client then runs /api/extract on the URL the user picks.
 */
export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }

  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Product search is not configured (SERPAPI_API_KEY). Add it in Vercel env.",
      },
      { status: 503 },
    );
  }

  let body: { imageUrl?: string; hint?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const imageUrl = (body.imageUrl || "").trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return Response.json(
      {
        error:
          "Need a public http(s) image URL. Re-upload the photo while signed in so it’s on Storage.",
      },
      { status: 400 },
    );
  }

  const hint = (body.hint || "").trim().slice(0, 80);

  try {
    let candidates: ProductCandidate[] = [];
    const softErrors: string[] = [];

    // Prefer shopping tab, then visual, then all — never hard-fail on empty tabs.
    for (const type of ["products", "visual_matches", "all"] as const) {
      if (candidates.filter((c) => shopScore(c) > 0).length >= 3) break;
      try {
        const { matches, error } = await serpLens(
          apiKey,
          imageUrl,
          type,
          // Refinement helps products/visual when we know garment type.
          type === "products" || type === "visual_matches" ? hint || undefined : undefined,
        );
        if (error) softErrors.push(`${type}: ${error}`);
        candidates = mergeCandidates(candidates, normalizeCandidates(matches), 20);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        softErrors.push(`${type}: ${msg}`);
        // Continue to next type unless it's a hard auth/quota failure
        if (/invalid api key|rate limit|run out of searches/i.test(msg)) {
          throw err;
        }
      }
    }

    candidates.sort((a, b) => shopScore(b) - shopScore(a));

    // Drop obvious social noise when we have any retail-ish hit
    const shoppy = candidates.filter((c) => shopScore(c) >= 0);
    if (shoppy.length) candidates = shoppy;

    candidates = candidates.slice(0, 5);

    if (!candidates.length) {
      console.warn("[find-product] empty", softErrors.join(" | "));
      return Response.json({
        candidates: [],
        message:
          "Couldn't find a matching product listing. Try a clearer packshot (item only, plain background) or paste a shop link.",
      });
    }

    return Response.json({ candidates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Product search failed.";
    console.warn("[find-product]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
