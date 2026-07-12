/**
 * Explore feed content engine — a client-side prototype of the "Pinterest for
 * fashion, but every pin knows your closet" idea (see Linear AJA-87).
 *
 * Two of the three real content "fuel tanks" run here without any backend:
 *  - AI-recombined looks: generateOutfit over the user's closet -> outfit pins,
 *    quality-ranked by colour harmony so the best fits surface first.
 *  - Seeded inspiration/shop looks: a small mock catalogue with brands + prices
 *    (stands in for the affiliate/product feeds ingested for real in v2).
 * Community/UGC is the third tank (added once the social layer lands).
 */

import { hexToHsl, hueDistance, isNeutral, nameColor, scoreOutfit } from "./color";
import { generateOutfit } from "./matching";
import type { Category, SlotKey, WardrobeItem } from "./types";
import { slotForCategory } from "./types";

export interface PinPiece {
  label: string;
  category: Category;
  /** Representative hex colour, used for closet matching. */
  color: string;
  colorName?: string;
  brand?: string;
  price?: number;
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

const ownedItems = (items: WardrobeItem[]) => items.filter((it) => !it.wishlist);

function pieceIsOwned(piece: PinPiece, owned: WardrobeItem[]): boolean {
  return owned.some((it) => it.category === piece.category && colorClose(it.color, piece.color));
}

/** How many of a look's pieces the user already owns. */
export function closetMatch(
  pin: ExplorePin,
  items: WardrobeItem[],
): { owned: number; total: number } {
  if (pin.kind === "closet") {
    const n = pin.itemIds?.length ?? 0;
    return { owned: n, total: n };
  }
  const owned = ownedItems(items);
  const pieces = pin.pieces ?? [];
  const n = pieces.filter((p) => pieceIsOwned(p, owned)).length;
  return { owned: n, total: pieces.length };
}

/** Per-piece owned/missing breakdown for the pin detail. */
export function ownedPieceFlags(
  pin: ExplorePin,
  items: WardrobeItem[],
): { piece: PinPiece; owned: boolean }[] {
  const owned = ownedItems(items);
  return (pin.pieces ?? []).map((piece) => ({ piece, owned: pieceIsOwned(piece, owned) }));
}

export function missingPieces(pin: ExplorePin, items: WardrobeItem[]): PinPiece[] {
  return ownedPieceFlags(pin, items)
    .filter((f) => !f.owned)
    .map((f) => f.piece);
}

/** A live shopping-search URL for a piece (wrap with affiliateUrl before opening). */
export function searchQueryFor(piece: PinPiece): string {
  const q = [piece.brand, piece.colorName ?? nameColor(piece.color), piece.label]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}

/** Rank other pins by tag overlap + colour proximity ("more like this"). */
export function similarPins(
  pin: ExplorePin,
  all: ExplorePin[],
  limit = 6,
): ExplorePin[] {
  const tags = new Set(pin.tags);
  const baseColor = pin.pieces?.[0]?.color ?? pin.tint;
  return all
    .filter((p) => p.id !== pin.id)
    .map((p) => {
      const shared = p.tags.filter((t) => tags.has(t)).length;
      const otherColor = p.pieces?.[0]?.color ?? p.tint;
      const score = shared * 30 + Math.max(0, 40 - colorDistance(baseColor, otherColor));
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
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
  const owned = ownedItems(items);
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

/**
 * Generate quality-ranked outfit pins from the closet. `exclude` holds pin ids
 * already shown so successive calls (infinite scroll) surface fresh looks.
 */
export function buildClosetLooks(
  items: WardrobeItem[],
  vibe: string | undefined,
  count = 8,
  exclude?: Set<string>,
): ExplorePin[] {
  const pool = items.filter((it) => !it.wishlist && it.imageUrl);
  if (pool.length < 2) return [];
  const seen = new Set(exclude ?? []);
  const cands: { id: string; ids: string[]; chosen: WardrobeItem[]; score: number }[] = [];
  for (let i = 0; i < count * 8 && cands.length < count; i++) {
    const draft = generateOutfit(pool, vibe ? { vibe } : {});
    const ids = Object.values(draft).flat();
    if (ids.length < 2) continue;
    const key = ids.slice().sort().join("|");
    const id = `closet-${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const chosen = ids
      .map((cid) => pool.find((it) => it.id === cid))
      .filter(Boolean) as WardrobeItem[];
    const harmony = scoreOutfit(chosen.map((c) => c.color));
    const vibeBonus = vibe && chosen.some((c) => c.tags.includes(vibe)) ? 8 : 0;
    cands.push({ id, ids, chosen, score: harmony + vibeBonus });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.map((c, i) => ({
    id: c.id,
    kind: "closet",
    title: titleFrom(c.chosen),
    author: "You",
    saves: 0,
    tags: tagsFrom(c.chosen),
    ratio: 1.15 + (i % 3) * 0.13,
    tint: c.chosen[0]?.color ?? "#c9ad8f",
    itemIds: c.ids,
  }));
}

/** Interleave closet looks into the inspiration stream so the feed feels mixed. */
export function composeFeed(closetLooks: ExplorePin[]): ExplorePin[] {
  const out: ExplorePin[] = [];
  let ci = 0;
  for (let i = 0; i < INSPIRATION_PINS.length; i++) {
    out.push(INSPIRATION_PINS[i]);
    if (i % 2 === 1 && ci < closetLooks.length) out.push(closetLooks[ci++]);
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
      { label: "Linen shirt", category: "top", color: "#e7ddc9", colorName: "cream", brand: "COS", price: 89 },
      { label: "Linen trousers", category: "bottom", color: "#d8c7a6", colorName: "sand", brand: "Arket", price: 95 },
      { label: "Leather sandals", category: "shoes", color: "#8a6b4f", colorName: "tan", brand: "Everlane", price: 120 },
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
      { label: "Denim jacket", category: "outerwear", color: "#5b7396", colorName: "blue", brand: "Levi's", price: 110 },
      { label: "Straight jeans", category: "bottom", color: "#4a6079", colorName: "indigo", brand: "Levi's", price: 98 },
      { label: "White sneakers", category: "shoes", color: "#eeeeee", colorName: "white", brand: "Common Projects", price: 190 },
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
      { label: "Wool blazer", category: "outerwear", color: "#3a3a3c", colorName: "charcoal", brand: "Massimo Dutti", price: 250 },
      { label: "Tailored trousers", category: "bottom", color: "#33333a", colorName: "charcoal", brand: "COS", price: 115 },
      { label: "Derby shoes", category: "shoes", color: "#1c1917", colorName: "black", brand: "Loake", price: 220 },
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
      { label: "Utility overshirt", category: "outerwear", color: "#a5603f", colorName: "rust", brand: "Carhartt", price: 130 },
      { label: "Cargo trousers", category: "bottom", color: "#6f6a5a", colorName: "olive", brand: "Dickies", price: 75 },
      { label: "Suede boots", category: "shoes", color: "#7a5233", colorName: "brown", brand: "Clarks", price: 160 },
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
      { label: "Crewneck sweat", category: "top", color: "#8b8b5a", colorName: "sage", brand: "Uniqlo", price: 40 },
      { label: "Track pants", category: "bottom", color: "#4a4a44", colorName: "graphite", brand: "Adidas", price: 65 },
      { label: "Runners", category: "shoes", color: "#dcdcdc", colorName: "grey", brand: "New Balance", price: 130 },
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
      { label: "Satin slip dress", category: "dress", color: "#7d5b6f", colorName: "plum", brand: "Reformation", price: 180 },
      { label: "Ankle boots", category: "shoes", color: "#20191c", colorName: "black", brand: "Aritzia", price: 175 },
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
      { label: "Chunky knit", category: "top", color: "#b08968", colorName: "camel", brand: "& Other Stories", price: 120 },
      { label: "Wide trousers", category: "bottom", color: "#5c5148", colorName: "brown", brand: "COS", price: 110 },
      { label: "Loafers", category: "shoes", color: "#3a2a20", colorName: "brown", brand: "G.H. Bass", price: 165 },
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
      { label: "Graphic hoodie", category: "top", color: "#4b4f54", colorName: "slate", brand: "Stussy", price: 95 },
      { label: "Cargo pants", category: "bottom", color: "#3a3d33", colorName: "olive", brand: "Carhartt", price: 90 },
      { label: "High-tops", category: "shoes", color: "#e8e8e8", colorName: "white", brand: "Nike", price: 120 },
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
      { label: "White tee", category: "top", color: "#f2efe9", colorName: "white", brand: "Everlane", price: 35 },
      { label: "Linen shorts", category: "bottom", color: "#e3ddd2", colorName: "ecru", brand: "Uniqlo", price: 40 },
      { label: "Espadrilles", category: "shoes", color: "#c9b48a", colorName: "tan", brand: "Castañer", price: 110 },
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
      { label: "Knit polo", category: "top", color: "#9aa7a0", colorName: "sage", brand: "COS", price: 79 },
      { label: "Pleated trousers", category: "bottom", color: "#5f5a52", colorName: "taupe", brand: "Arket", price: 99 },
      { label: "Mules", category: "shoes", color: "#c9b9a5", colorName: "beige", brand: "Vagabond", price: 130 },
    ],
  },
  {
    id: "insp-blazer",
    kind: "inspiration",
    title: "Blazer + jeans",
    author: "@dev",
    saves: 1320,
    tags: ["work", "casual", "minimal"],
    ratio: 1.35,
    tint: "#3f4a5a",
    imageUrl: unsplash("photo-1521572163474-6864f9cf17ab"),
    pieces: [
      { label: "Navy blazer", category: "outerwear", color: "#2f3a4a", colorName: "navy", brand: "Suitsupply", price: 320 },
      { label: "Straight jeans", category: "bottom", color: "#3f5066", colorName: "indigo", brand: "A.P.C.", price: 210 },
      { label: "Leather loafers", category: "shoes", color: "#4a3324", colorName: "brown", brand: "Sebago", price: 180 },
    ],
  },
  {
    id: "insp-trench",
    kind: "inspiration",
    title: "Classic trench",
    author: "@mila",
    saves: 2040,
    tags: ["minimal", "work"],
    ratio: 1.5,
    tint: "#c2ab84",
    imageUrl: unsplash("photo-1479064555552-3ef4979f8908"),
    pieces: [
      { label: "Trench coat", category: "outerwear", color: "#c2ab84", colorName: "beige", brand: "Burberry", price: 1890 },
      { label: "Ribbed top", category: "top", color: "#1c1917", colorName: "black", brand: "Uniqlo", price: 30 },
      { label: "Tailored trousers", category: "bottom", color: "#2b2b30", colorName: "charcoal", brand: "COS", price: 115 },
    ],
  },
];
