/**
 * Core domain types for the virtual wardrobe.
 *
 * Everything is serializable to JSON so the whole state can be persisted to
 * localStorage today and synced to Supabase/Firebase later without changes.
 */

/**
 * Canonical fit vocabulary — the SINGLE source of truth shared by the catalog
 * classifier (`classifyFit`) and any future writer of `WardrobeItem.fit`.
 * Ownership scoring compares with exact-string equality, so both sides MUST emit
 * these exact spellings (this is what closes the two-drifting-enums bug, AJA-177).
 */
export const FIT_VALUES = ["slim", "regular", "relaxed", "wide", "cropped"] as const;
export type Fit = (typeof FIT_VALUES)[number];

/**
 * Human/legacy fit words → canonical. Decisions: "straight" → regular,
 * "oversized" → relaxed. Any fit-capture path must normalize through this so the
 * wardrobe side can never drift from the catalog vocab again.
 */
export const FIT_ALIASES: Record<string, Fit> = {
  slim: "slim", skinny: "slim", fitted: "slim", tapered: "slim",
  regular: "regular", straight: "regular", classic: "regular", standard: "regular",
  relaxed: "relaxed", oversized: "relaxed", baggy: "relaxed", loose: "relaxed", boxy: "relaxed",
  wide: "wide", flare: "wide", bootcut: "wide",
  cropped: "cropped", crop: "cropped",
};

export type Category =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoes"
  | "bag"
  | "accessory";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "top", label: "Tops" },
  { value: "bottom", label: "Bottoms" },
  { value: "dress", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "shoes", label: "Shoes" },
  { value: "bag", label: "Bags" },
  { value: "accessory", label: "Accessories" },
];

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<Category, string>;

/** One selectable sub-category within a category. `gender` omitted = shown to everyone. */
export interface SubOption {
  value: string;
  label: string;
  gender?: "male" | "female";
}

/**
 * Sub-category taxonomy per top-level category, covering men's + women's garments (AJA-228).
 * Values are canonical slugs (what we store); labels are for display. Gender-specific options
 * are filtered by the user's `shopGender` via `subcategoriesFor`. A "Others" bucket is appended
 * by the helper, not stored here.
 */
export const SUBCATEGORIES: Record<Category, SubOption[]> = {
  top: [
    { value: "tshirt", label: "T-shirt" },
    { value: "shirt", label: "Shirt" },
    { value: "polo", label: "Polo" },
    { value: "sweater", label: "Sweater" },
    { value: "hoodie", label: "Hoodie" },
    { value: "sweatshirt", label: "Sweatshirt" },
    { value: "zipup", label: "Zip-up" },
    { value: "tank", label: "Tank" },
    // AJA-265: `longsleeve` was removed here. It described SLEEVE LENGTH, not a
    // garment type, so it swallowed 10 items in the measured closet — 8 of them
    // button-up/denim/dress shirts and 2 compression tops — and forced `isCollared`
    // to carry a workaround for exactly that. Migration in ./subcategory.ts.
    { value: "jersey", label: "Jersey" },
    // Explicit athletic register. Before this, the engine had to infer "this is gym
    // kit" from a regex over brand names (gymshark|dri-fit|adizero|…), which is a
    // missing field standing on its head.
    { value: "activewear", label: "Activewear" },
    { value: "cardigan", label: "Cardigan" },
    { value: "blouse", label: "Blouse", gender: "female" },
    { value: "crop", label: "Crop top", gender: "female" },
    { value: "camisole", label: "Camisole", gender: "female" },
    { value: "bodysuit", label: "Bodysuit", gender: "female" },
  ],
  bottom: [
    { value: "jeans", label: "Jeans" },
    { value: "trousers", label: "Trousers" },
    { value: "shorts", label: "Shorts" },
    { value: "joggers", label: "Joggers" },
    { value: "leggings", label: "Leggings" },
    { value: "chinos", label: "Chinos" },
    { value: "cargo", label: "Cargo" },
    { value: "skirt", label: "Skirt", gender: "female" },
  ],
  dress: [
    { value: "mini", label: "Mini dress" },
    { value: "midi", label: "Midi dress" },
    { value: "maxi", label: "Maxi dress" },
    { value: "gown", label: "Gown" },
    { value: "jumpsuit", label: "Jumpsuit" },
    { value: "romper", label: "Romper" },
    { value: "sundress", label: "Sundress" },
  ],
  outerwear: [
    { value: "jacket", label: "Jacket" },
    { value: "coat", label: "Coat" },
    { value: "blazer", label: "Blazer" },
    { value: "puffer", label: "Puffer" },
    { value: "parka", label: "Parka" },
    { value: "bomber", label: "Bomber" },
    { value: "denim", label: "Denim jacket" },
    { value: "leather", label: "Leather jacket" },
    { value: "trackjacket", label: "Zip-up / Track" },
    { value: "vest", label: "Vest / Gilet" },
    { value: "windbreaker", label: "Windbreaker" },
  ],
  shoes: [
    { value: "sneakers", label: "Sneakers" },
    // AJA-265: 14 of 17 shoes in the measured closet were all `sneakers`, so a
    // marathon racer, a basketball shoe and a Lacoste were indistinguishable and
    // the engine guessed from brand names. Kept specific rather than one "Sports"
    // umbrella — a chip only renders when you own something in it, so the cost of
    // granularity is zero and the benefit is a real filter.
    { value: "running", label: "Running" },
    { value: "basketball", label: "Basketball" },
    { value: "training", label: "Training" },
    { value: "boots", label: "Boots" },
    { value: "loafers", label: "Loafers" },
    { value: "sandals", label: "Sandals" },
    { value: "dressshoes", label: "Dress shoes" },
    { value: "slides", label: "Slides" },
    { value: "espadrilles", label: "Espadrilles" },
    { value: "heels", label: "Heels", gender: "female" },
    { value: "flats", label: "Flats", gender: "female" },
    { value: "wedges", label: "Wedges", gender: "female" },
  ],
  bag: [
    { value: "backpack", label: "Backpack" },
    { value: "tote", label: "Tote" },
    { value: "crossbody", label: "Crossbody" },
    { value: "duffel", label: "Duffel" },
    { value: "beltbag", label: "Belt bag" },
    { value: "messenger", label: "Messenger" },
    { value: "handbag", label: "Handbag", gender: "female" },
    { value: "shoulder", label: "Shoulder bag", gender: "female" },
    { value: "clutch", label: "Clutch", gender: "female" },
    { value: "satchel", label: "Satchel", gender: "female" },
  ],
  accessory: [
    { value: "watch", label: "Watch" },
    { value: "belt", label: "Belt" },
    { value: "cap", label: "Cap" },
    { value: "beanie", label: "Beanie" },
    { value: "hat", label: "Hat" },
    { value: "scarf", label: "Scarf" },
    { value: "sunglasses", label: "Sunglasses" },
    { value: "gloves", label: "Gloves" },
    { value: "wallet", label: "Wallet" },
    { value: "necklace", label: "Necklace", gender: "female" },
    { value: "earrings", label: "Earrings", gender: "female" },
    { value: "bracelet", label: "Bracelet", gender: "female" },
    { value: "hair", label: "Hair accessory", gender: "female" },
    { value: "tie", label: "Tie", gender: "male" },
    { value: "cufflinks", label: "Cufflinks", gender: "male" },
  ],
};

const SUBCATEGORY_OTHERS: SubOption = { value: "others", label: "Others" };

/** Sub-category options for a category, filtered by shop gender ("all" = union), + "Others". */
export function subcategoriesFor(
  category: Category,
  shopGender?: "male" | "female" | "all",
): SubOption[] {
  const g = shopGender ?? "all";
  const opts = (SUBCATEGORIES[category] ?? []).filter(
    (o) => !o.gender || g === "all" || o.gender === g,
  );
  return [...opts, SUBCATEGORY_OTHERS];
}

/** Display label for a stored sub-category slug (falls back to the raw value / "Others"). */
export function subcategoryLabel(category: Category, value: string | undefined): string {
  if (!value) return "";
  if (value === SUBCATEGORY_OTHERS.value) return SUBCATEGORY_OTHERS.label;
  return (SUBCATEGORIES[category] ?? []).find((o) => o.value === value)?.label ?? value;
}

/**
 * Sub-category chips actually present among a category's items, ordered per SUBCATEGORIES with an
 * "Others" bucket appended when any item has no/unknown sub-category. Shared by every closet-style
 * surface (closet, packing, canvas) so the sub-filter row stays consistent (AJA-228/229).
 */
export function presentSubcategories(
  category: Category,
  items: { category: Category; subcategory?: string }[],
): { value: string; label: string }[] {
  const present = new Set(
    items.filter((it) => it.category === category).map((it) => it.subcategory || "others"),
  );
  const ordered = (SUBCATEGORIES[category] ?? [])
    .filter((o) => present.has(o.value))
    .map((o) => ({ value: o.value, label: o.label }));
  if (present.has(SUBCATEGORY_OTHERS.value)) ordered.push({ ...SUBCATEGORY_OTHERS });
  return ordered;
}

/** Whether an item passes the active sub-category chip ("all" = any; "others" = no/unknown sub). */
export function matchesSubcategory(
  item: { subcategory?: string },
  subCat: string,
): boolean {
  if (subCat === "all") return true;
  if (subCat === SUBCATEGORY_OTHERS.value) {
    return !item.subcategory || item.subcategory === SUBCATEGORY_OTHERS.value;
  }
  return item.subcategory === subCat;
}

export type Season = "spring" | "summer" | "fall" | "winter";

export const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

/** Common tag suggestions surfaced in the item form (free-form tags allowed). */
export const SUGGESTED_TAGS = [
  "casual",
  "formal",
  "work",
  "party",
  "date night",
  "athleisure",
  "streetwear",
  "minimal",
  "vintage",
  "cozy",
];

export interface WardrobeItem {
  id: string;
  /** Direct image URL, or a data: URL when the user uploads a file. */
  imageUrl: string;
  /** The pre-cutout image, kept so a bad background removal is recoverable. */
  originalImageUrl?: string;
  /** Which background-removal engine produced the cutout, e.g. "imgly@1.7.0". */
  cutoutEngine?: string;
  /** Cached Beautify result: transparent "sticker" (garment on transparency) used on the outfit
   *  canvas. Never regenerated once set. */
  beautifiedImageUrl?: string;
  /** The garment-on-white ghost-mannequin product shot, shown on the item detail screen. */
  beautifyWhiteUrl?: string;
  /** The cutout to restore when reverting a beautify (imageUrl before Beautify). */
  cutoutImageUrl?: string;
  /** Model + removal engine + pipeline stamp, e.g. "gemini@2.5-flash-image+imgly@1.7.0+sticker+pipe5".
   *  A stamp missing the current pipeline marker means an older beautify (white-bg, unnormalized
   *  or a previous style) that the editor offers to regenerate once. */
  beautifyModel?: string;
  name: string;
  /** Optional link to the product page (where to buy or view the item). */
  productUrl?: string;
  category: Category;
  /** Optional finer-grained type within the category (e.g. "polo", "bomber", "sneakers").
   *  A free-form slug from SUBCATEGORIES — auto-inferred and user-editable. Deliberately NOT
   *  part of the Category union, so it stays additive and never breaks category-keyed logic. */
  subcategory?: string;
  /** Primary color as a hex string, e.g. "#1c1917". */
  color: string;
  /** Optional human-readable color name ("navy", "cream", ...). */
  colorName?: string;
  tags: string[];
  seasons: Season[];
  brand?: string;
  price?: number;
  notes?: string;
  /**
   * Structured attributes used by closet-aware shop search (AJA-116) for
   * apples-to-apples comparison against catalog products. All optional and
   * null until populated — the pairing/ownership logic degrades gracefully
   * (skips the check, still counts by category) when any is missing.
   */
  fit?: Fit; // canonical fit vocab (FIT_VALUES); writers normalize via FIT_ALIASES
  tone?: string; // colour group: 'neutral' | 'warm' | 'cool' | 'black' | 'white' | ...
  formality?: string; // 'casual' | 'smart-casual' | 'formal' | 'statement' | ...
  /** Fabric / material hint from analyze (e.g. "linen", "wool"). */
  material?: string;
  /** Pattern hint from analyze (e.g. "stripe", "solid"). */
  pattern?: string;
  /** Optional user-entered size (e.g. "M", "32", "10"). Free-text, not analyzed. */
  size?: string;
  /** Short style caption used to build / refresh styleEmbedding. */
  styleCaption?: string;
  /** Dense style vector (see style-embed.ts); optional, recomputed from attrs if absent. */
  styleEmbedding?: number[];
  /** Wishlist items are things the user wants to buy, not yet owned. */
  wishlist: boolean;
  /** Favourited pieces the user loves — independent of wishlist. */
  favorite?: boolean;
  /** Times this piece has been logged as worn. */
  wearCount?: number;
  /** ISO date YYYY-MM-DD of the most recent wear. */
  lastWornAt?: string;
  /** ISO date YYYY-MM-DD the piece moved from wishlist to owned via "I bought it"
   *  (AJA-244). Absent on pieces added straight to the closet. */
  purchasedAt?: string;
  createdAt: number;
}

export interface Outfit {
  id: string;
  name: string;
  notes?: string;
  /** References into the items collection. Missing ids are ignored at render. */
  itemIds: string[];
  /**
   * Outfit-board layout recipe: each placed garment/text/sticker with its exact
   * x/y/size/rotation/z-order, so the board restores precisely. Absent for outfits
   * saved before boards existed (they fall back to an auto-placed layout).
   */
  layout?: CanvasItem[];
  /** Board background (solid/gradient) saved with the layout. */
  canvasBg?: string | null;
  /** Starred in the looks library (AJA-239). Collections are derived, this is the one
   *  manual signal — must stay whitelisted in `normalizeOutfit` or it's stripped on reload. */
  favorite?: boolean;
  /** Subset of `itemIds` that were still on the wishlist when the look was saved
   *  (AJA-245). Derived in `saveOutfit`, pruned as pieces become owned, so a look you
   *  can't wear yet is never counted as one you neglect. Whitelist in `normalizeOutfit`. */
  wishItemIds?: string[];
  wearCount?: number;
  lastWornAt?: string;
  createdAt: number;
}

/**
 * Calendar / wear log entry. `kind: "worn"` is history; `kind: "planned"` is
 * an outfit scheduled for a future (or today) date.
 */
export interface CalendarEntry {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  kind: "worn" | "planned";
  outfitId?: string;
  itemIds: string[];
  note?: string;
  createdAt: number;
}

/** Local calendar day helper (YYYY-MM-DD in the user's timezone). */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Friendly display for YYYY-MM-DD (and tolerant of full ISO timestamps).
 * e.g. "Today", "Yesterday", "Jul 11, 2026"
 */
export function formatDisplayDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const iso = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return raw;
  const today = todayISO();
  if (iso === today) return "Today";
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (iso === todayISO(yest)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * The outfit builder groups categories into layer slots.
 * A dress replaces top + bottom; accessories hold up to three items.
 */
export type SlotKey =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoes"
  | "accessories";

export const SLOT_CONFIG: {
  key: SlotKey;
  label: string;
  categories: Category[];
  max: number;
}[] = [
  { key: "outerwear", label: "Outerwear", categories: ["outerwear"], max: 1 },
  { key: "top", label: "Top", categories: ["top"], max: 1 },
  { key: "dress", label: "Dress", categories: ["dress"], max: 1 },
  { key: "bottom", label: "Bottom", categories: ["bottom"], max: 1 },
  { key: "shoes", label: "Shoes", categories: ["shoes"], max: 1 },
  {
    key: "accessories",
    label: "Accessories & Bags",
    categories: ["accessory", "bag"],
    max: 3,
  },
];

/** Find which builder slot a given category belongs to. */
export function slotForCategory(category: Category): SlotKey {
  const slot = SLOT_CONFIG.find((s) => s.categories.includes(category));
  return slot ? slot.key : "accessories";
}

/** Freeform Canvas element on the outfit moodboard workspace */
export interface CanvasItem {
  id: string; // unique ID for the canvas element
  /** What kind of element this is. Defaults to "item" for older drafts. */
  kind?: "item" | "text" | "sticker";
  itemId?: string; // WardrobeItem ID — set when kind === "item"
  text?: string; // kind === "text"
  color?: string; // text color for kind === "text"
  emoji?: string; // glyph for kind === "sticker"
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  flipped: boolean;
}

