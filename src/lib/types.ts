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
  /** Wishlist items are things the user wants to buy, not yet owned. */
  wishlist: boolean;
  /** Favourited pieces the user loves — independent of wishlist. */
  favorite?: boolean;
  /** Times this piece has been logged as worn. */
  wearCount?: number;
  /** ISO date YYYY-MM-DD of the most recent wear. */
  lastWornAt?: string;
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

