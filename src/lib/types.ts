/**
 * Core domain types for the virtual wardrobe.
 *
 * Everything is serializable to JSON so the whole state can be persisted to
 * localStorage today and synced to Supabase/Firebase later without changes.
 */

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
  name: string;
  /** Direct image URL, or a data: URL when the user uploads a file. */
  imageUrl: string;
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
  /** Wishlist items are things the user wants to buy, not yet owned. */
  wishlist: boolean;
  createdAt: number;
}

export interface Outfit {
  id: string;
  name: string;
  notes?: string;
  /** References into the items collection. Missing ids are ignored at render. */
  itemIds: string[];
  createdAt: number;
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
