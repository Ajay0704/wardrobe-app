import { EDITORIAL, unsplashUrl, type Gender } from "./editorial";
import type { FeedProduct } from "./types";

/**
 * Composes the content feed from the raw product catalogue: styled outfit
 * "looks", editorial inspiration, and a few trending single products —
 * interleaved so the feed feels varied (Pinterest/TikTok-style), not a catalogue.
 */

export interface LookRow {
  id: string;
  kind: "look" | "editorial" | "product";
  gender: Gender;
  title: string;
  subtitle: string | null;
  vibes: string[];
  ratio: number;
  hero_image: string | null;
  product_ids: string[];
}

// Occasion themes that turn products into "ways to dress".
const THEMES: { key: string; title: string; subtitle: string; vibes: string[] }[] = [
  { key: "smart-casual", title: "Smart-casual Friday", subtitle: "Polished, not stuffy", vibes: ["work", "minimal", "casual"] },
  { key: "weekend", title: "Weekend off-duty", subtitle: "Relaxed and easy", vibes: ["casual", "streetwear"] },
  { key: "date-night", title: "Date night", subtitle: "Dressed up a notch", vibes: ["party", "formal"] },
  { key: "cozy", title: "Cozy day in", subtitle: "Soft and warm", vibes: ["cozy", "minimal"] },
  { key: "city", title: "Out & about", subtitle: "City-ready layers", vibes: ["streetwear", "casual"] },
  { key: "office", title: "Office polish", subtitle: "Sharp and simple", vibes: ["work", "formal"] },
  { key: "elevated", title: "Elevated basics", subtitle: "Quiet luxury", vibes: ["minimal", "formal"] },
  { key: "sunny", title: "Sun's out", subtitle: "Lightweight fits", vibes: ["casual", "minimal"] },
];

function matchesGender(p: FeedProduct, gender: Gender): boolean {
  return p.gender === gender || p.gender === "unisex";
}

function pick(
  products: FeedProduct[],
  gender: Gender,
  vibes: string[],
  category: string,
  used: Set<string>,
  offset: number,
): FeedProduct | null {
  const pool = products.filter(
    (p) =>
      matchesGender(p, gender) &&
      p.category === category &&
      (vibes.length === 0 || (p.vibeTags ?? []).some((v) => vibes.includes(v))),
  );
  if (!pool.length) return null;
  for (let i = 0; i < pool.length; i++) {
    const cand = pool[(i + offset) % pool.length];
    if (!used.has(cand.id)) return cand;
  }
  return pool[offset % pool.length]; // allow reuse when a pool is small
}

function composeLooks(products: FeedProduct[]): LookRow[] {
  const rows: LookRow[] = [];
  let n = 0;
  for (const gender of ["male", "female"] as Gender[]) {
    const used = new Set<string>();
    for (const theme of THEMES) {
      const ids: string[] = [];
      const add = (p: FeedProduct | null) => {
        if (p && !ids.includes(p.id)) {
          ids.push(p.id);
          used.add(p.id);
        }
      };
      // A women's look can be dress-led; otherwise top (+ bottom when available).
      const dress = gender === "female" ? pick(products, gender, theme.vibes, "dress", used, n) : null;
      if (dress) add(dress);
      else {
        add(pick(products, gender, theme.vibes, "top", used, n));
        add(pick(products, gender, theme.vibes, "bottom", used, n));
      }
      add(pick(products, gender, theme.vibes, "outerwear", used, n + 1));
      add(pick(products, gender, theme.vibes, "shoes", used, n));
      add(
        pick(products, gender, theme.vibes, "accessory", used, n) ??
          pick(products, gender, theme.vibes, "bag", used, n),
      );
      n++;
      if (ids.length < 2) continue;
      rows.push({
        id: `look:${gender}:${theme.key}`,
        kind: "look",
        gender,
        title: theme.title,
        subtitle: theme.subtitle,
        vibes: theme.vibes,
        ratio: 1.2 + (n % 3) * 0.14, // 1.2 / 1.34 / 1.48 — varied heights
        hero_image: null,
        product_ids: ids.slice(0, 4),
      });
    }
  }
  return rows;
}

function editorialRows(): LookRow[] {
  // Editorial is mood/vibe inspiration — kept gender-neutral so it shows in every
  // feed without promising a gender the stock photo may not match.
  return EDITORIAL.map((e) => ({
    id: e.id,
    kind: "editorial" as const,
    gender: "unisex" as const,
    title: e.title,
    subtitle: e.subtitle,
    vibes: e.vibes,
    ratio: e.ratio,
    hero_image: unsplashUrl(e.photo),
    product_ids: [],
  }));
}

function trendingRows(products: FeedProduct[]): LookRow[] {
  // A handful of single products for direct shopping, spread across genders.
  const rows: LookRow[] = [];
  const perGender = 6;
  for (const gender of ["male", "female"] as Gender[]) {
    const pool = products.filter((p) => matchesGender(p, gender));
    for (let i = 0; i < Math.min(perGender, pool.length); i++) {
      const p = pool[(i * 3) % pool.length];
      if (rows.some((r) => r.id === `product:${p.id}`)) continue;
      rows.push({
        id: `product:${p.id}`,
        kind: "product",
        gender: (p.gender as Gender) ?? "unisex",
        title: p.title,
        subtitle: p.brand ?? null,
        vibes: p.vibeTags ?? [],
        ratio: 1.0 + (i % 3) * 0.12,
        hero_image: p.imageUrl,
        product_ids: [p.id],
      });
    }
  }
  return rows;
}

/** Weighted round-robin interleave so the feed alternates content types. */
function interleave(lists: LookRow[][], weights: number[]): LookRow[] {
  const idx = lists.map(() => 0);
  const out: LookRow[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    lists.forEach((list, li) => {
      for (let w = 0; w < weights[li]; w++) {
        if (idx[li] < list.length) {
          out.push(list[idx[li]++]);
          progress = true;
        }
      }
    });
  }
  return out;
}

/** Build the full, interleaved content feed from the product catalogue. */
export function composeFeed(products: FeedProduct[]): LookRow[] {
  const looks = composeLooks(products);
  const editorial = editorialRows();
  const trending = trendingRows(products);
  // ~2 looks : 1 editorial : 1 product per cycle → content-first, shopping woven in.
  return interleave([looks, editorial, trending], [2, 1, 1]);
}
