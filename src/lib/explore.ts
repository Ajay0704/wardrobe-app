/**
 * Explore feed content engine — a client-side prototype of the "Pinterest for
 * fashion, but every pin knows your closet" idea (see Linear AJA-87).
 *
 * Two of the three real content "fuel tanks" run here without any backend:
 *  - AI-recombined looks: generateOutfit over the user's closet -> outfit pins.
 *  - Seeded inspiration/shop looks: a small mock catalog (stands in for the
 *    affiliate/product feeds that will be ingested for real in v2).
 * Community/UGC is the third tank (added once the social layer lands).
 */

import { hexToHsl, hueDistance, isNeutral } from "./color";
import { generateOutfit } from "./matching";
import type { Category, SlotKey, WardrobeItem } from "./types";
import { slotForCategory } from "./types";

export interface PinPiece {
  label: string;
  category: Category;
  /** Representative hex colour, used for closet matching. */
  color: string;
}

export interface ExplorePin {
  id: string;
  kind: "inspiration" | "closet";
  title: string;
  author: string;
  saves: number;
  tags: string[];
  /** Tile aspect (height/width) so the masonry grid varies. */
  ratio: number;
  /** Fallback tile colour when an image is missing/broken. */
  tint: string;
  imageUrl?: string;
  pieces?: PinPiece[];
  itemIds?: string[];
}

const emptyDraft = (): Record<SlotKey, string[]> => ({
  top: [],
  bottom: [],
  dress: [],
  outerwear: [],
  shoes: [],
  accessories: [],
});

const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?w=600&q=80&auto=format&fit=crop`;

/* -------------------------------------------------- colour matching helpers */

function colorDistance(a: string, b: string): number {
  const A = hexToHsl(a);
  const B = hexToHsl(b);
  const an = isNeutral(A);
  const bn = isNeutral(B);
  if (an && bn) return 0;
  if (an !== bn) return 180;
  return hueDistance(A.h, B.h);
}
const colorClose = (a: string, b: string) => colorDistance(a, b) <= 40;

/** How many of a look's pieces the user already owns. */
export function closetMatch(
  pin: ExplorePin,
  items: WardrobeItem[],
): { owned: number; total: number } {
  if (pin.kind === "closet") {
    const n = pin.itemIds?.length ?? 0;
    return { owned: n, total: n };
  }
  const owned = items.filter((it) => !it.wishlist);
  const pieces = pin.pieces ?? [];
  let n = 0;
  for (const p of pieces) {
    if (owned.some((it) => it.category === p.category && colorClose(it.color, p.color))) {
      n += 1;
    }
  }
  return { owned: n, total: pieces.length };
}

/** Build a builder draft that recreates a look from the closest owned pieces. */
export function recreateDraft(
  pin: ExplorePin,
  items: WardrobeItem[],
): Record<SlotKey, string[]> {
  const draft = emptyDraft();
  if (pin.kind === "closet" && pin.itemIds) {
    for (const id of pin.itemIds) {
      const it = items.find((i) => i.id === id);
      if (it) draft[slotForCategory(it.category)].push(id);
    }
    return draft;
  }
  const owned = items.filter((it) => !it.wishlist);
  for (const p of pin.pieces ?? []) {
    const cands = owned.filter((it) => it.category === p.category);
    if (!cands.length) continue;
    const best = cands
      .slice()
      .sort((a, b) => colorDistance(a.color, p.color) - colorDistance(b.color, p.color))[0];
    const slot = slotForCategory(best.category);
    if (!draft[slot].includes(best.id)) draft[slot].push(best.id);
  }
  return draft;
}

/* ------------------------------------------------ AI-recombined closet looks */

function titleFrom(items: WardrobeItem[]): string {
  return items
    .slice(0, 2)
    .map((it) => it.name)
    .join(" + ");
}

function tagsFrom(items: WardrobeItem[]): string[] {
  const seen = new Set<string>();
  for (const it of items) for (const t of it.tags) seen.add(t);
  return [...seen].slice(0, 3);
}

export function buildClosetLooks(
  items: WardrobeItem[],
  vibe: string | undefined,
  seed: number,
  count = 6,
): ExplorePin[] {
  const pool = items.filter((it) => !it.wishlist && it.imageUrl);
  if (pool.length < 2) return [];
  const out: ExplorePin[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count * 5 && out.length < count; i++) {
    const draft = generateOutfit(pool, vibe ? { vibe } : {});
    const ids = Object.values(draft).flat();
    if (ids.length < 2) continue;
    const key = ids.slice().sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const chosen = ids
      .map((id) => pool.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];
    out.push({
      id: `closet-${seed}-${key}`,
      kind: "closet",
      title: titleFrom(chosen),
      author: "You",
      saves: 0,
      tags: tagsFrom(chosen),
      ratio: 1.25,
      tint: chosen[0]?.color ?? "#c9ad8f",
      itemIds: ids,
    });
  }
  return out;
}

/** Interleave closet looks into the inspiration stream so the feed feels mixed. */
export function composeFeed(
  closetLooks: ExplorePin[],
  seed: number,
): ExplorePin[] {
  const inspo = [...INSPIRATION_PINS];
  // rotate the inspiration order by seed so "load more" surfaces fresh tiles
  const rot = seed % (inspo.length || 1);
  const rotated = [...inspo.slice(rot), ...inspo.slice(0, rot)];
  const out: ExplorePin[] = [];
  let ci = 0;
  for (let i = 0; i < rotated.length; i++) {
    out.push(rotated[i]);
    if (i % 3 === 2 && ci < closetLooks.length) out.push(closetLooks[ci++]);
  }
  while (ci < closetLooks.length) out.push(closetLooks[ci++]);
  return out;
}

/* ---------------------------------------------- seeded inspiration catalogue */
/* Stands in for the affiliate/product + editorial feeds ingested for real in v2. */

export const INSPIRATION_PINS: ExplorePin[] = [
  {
    id: "insp-linen",
    kind: "inspiration",
    title: "Neutral linen set",
    author: "@mara",
    saves: 1240,
    tags: ["minimal", "summer"],
    ratio: 1.4,
    tint: "#c9ad8f",
    imageUrl: unsplash("photo-1483721310020-03333e577078"),
    pieces: [
      { label: "Linen shirt", category: "top", color: "#e7ddc9" },
      { label: "Linen trousers", category: "bottom", color: "#d8c7a6" },
      { label: "Leather sandals", category: "shoes", color: "#8a6b4f" },
    ],
  },
  {
    id: "insp-denim",
    kind: "inspiration",
    title: "Double denim",
    author: "@theo",
    saves: 842,
    tags: ["casual", "streetwear"],
    ratio: 1.15,
    tint: "#6b83a3",
    imageUrl: unsplash("photo-1516257984-b1b4d707412e"),
    pieces: [
      { label: "Denim jacket", category: "outerwear", color: "#5b7396" },
      { label: "Straight jeans", category: "bottom", color: "#4a6079" },
      { label: "White sneakers", category: "shoes", color: "#eeeeee" },
    ],
  },
  {
    id: "insp-tailoring",
    kind: "inspiration",
    title: "Monochrome tailoring",
    author: "@june",
    saves: 970,
    tags: ["formal", "work", "minimal"],
    ratio: 1.5,
    tint: "#6f6a66",
    imageUrl: unsplash("photo-1507003211169-0a1dd7228f2d"),
    pieces: [
      { label: "Wool blazer", category: "outerwear", color: "#3a3a3c" },
      { label: "Tailored trousers", category: "bottom", color: "#33333a" },
      { label: "Derby shoes", category: "shoes", color: "#1c1917" },
    ],
  },
  {
    id: "insp-utility",
    kind: "inspiration",
    title: "Rust utility fit",
    author: "@sol",
    saves: 2110,
    tags: ["streetwear", "casual"],
    ratio: 1.35,
    tint: "#a5603f",
    imageUrl: unsplash("photo-1519238263530-99bdd11df2ea"),
    pieces: [
      { label: "Utility overshirt", category: "outerwear", color: "#a5603f" },
      { label: "Cargo trousers", category: "bottom", color: "#6f6a5a" },
      { label: "Suede boots", category: "shoes", color: "#7a5233" },
    ],
  },
  {
    id: "insp-athleisure",
    kind: "inspiration",
    title: "Sunday athleisure",
    author: "@kai",
    saves: 560,
    tags: ["athleisure", "cozy"],
    ratio: 1.2,
    tint: "#8b8b5a",
    imageUrl: unsplash("photo-1517841905240-472988babdf9"),
    pieces: [
      { label: "Crewneck sweat", category: "top", color: "#8b8b5a" },
      { label: "Track pants", category: "bottom", color: "#4a4a44" },
      { label: "Runners", category: "shoes", color: "#dcdcdc" },
    ],
  },
  {
    id: "insp-slip",
    kind: "inspiration",
    title: "Slip dress + boots",
    author: "@noor",
    saves: 1480,
    tags: ["party", "date night"],
    ratio: 1.5,
    tint: "#7d5b6f",
    imageUrl: unsplash("photo-1495385794356-15371f348c31"),
    pieces: [
      { label: "Satin slip dress", category: "dress", color: "#7d5b6f" },
      { label: "Ankle boots", category: "shoes", color: "#20191c" },
    ],
  },
  {
    id: "insp-knit",
    kind: "inspiration",
    title: "Autumn knit layers",
    author: "@ivy",
    saves: 690,
    tags: ["cozy", "minimal"],
    ratio: 1.3,
    tint: "#b08968",
    imageUrl: unsplash("photo-1487222477894-8943e31ef7b2"),
    pieces: [
      { label: "Chunky knit", category: "top", color: "#b08968" },
      { label: "Wide trousers", category: "bottom", color: "#5c5148" },
      { label: "Loafers", category: "shoes", color: "#3a2a20" },
    ],
  },
  {
    id: "insp-street",
    kind: "inspiration",
    title: "City streetwear",
    author: "@ren",
    saves: 1890,
    tags: ["streetwear"],
    ratio: 1.25,
    tint: "#4b4f54",
    imageUrl: unsplash("photo-1523398002811-999ca8dec234"),
    pieces: [
      { label: "Graphic hoodie", category: "top", color: "#4b4f54" },
      { label: "Cargo pants", category: "bottom", color: "#3a3d33" },
      { label: "High-tops", category: "shoes", color: "#e8e8e8" },
    ],
  },
  {
    id: "insp-summer",
    kind: "inspiration",
    title: "Breezy summer whites",
    author: "@ana",
    saves: 730,
    tags: ["summer", "minimal"],
    ratio: 1.4,
    tint: "#e3ddd2",
    imageUrl: unsplash("photo-1529626455594-4ff0802cfb7e"),
    pieces: [
      { label: "White tee", category: "top", color: "#f2efe9" },
      { label: "Linen shorts", category: "bottom", color: "#e3ddd2" },
      { label: "Espadrilles", category: "shoes", color: "#c9b48a" },
    ],
  },
  {
    id: "insp-office",
    kind: "inspiration",
    title: "Soft office capsule",
    author: "@lena",
    saves: 1030,
    tags: ["work", "minimal"],
    ratio: 1.3,
    tint: "#9aa7a0",
    imageUrl: unsplash("photo-1490114538077-0a7f8cb49891"),
    pieces: [
      { label: "Knit polo", category: "top", color: "#9aa7a0" },
      { label: "Pleated trousers", category: "bottom", color: "#5f5a52" },
      { label: "Mules", category: "shoes", color: "#c9b9a5" },
    ],
  },
];
