import type { Outfit, WardrobeItem } from "./types";
import { todayISO } from "./types";

/**
 * Curated, gender-matched "elevated everyday" sample capsules — the first-run closet.
 *
 * Every piece is a GENUINE beautified product shot produced by the app's own pipeline
 * (Gemini ghost-mannequin → cutout → refine), hosted under /public/samples/<gender>/.
 * Because the outfit canvas, item cards, native ClosetGrid and the "Today's pick" hero
 * read `imageUrl` DIRECTLY as a transparent "sticker", `imageUrl` IS the sticker; the other
 * beautify fields mirror a real processed item so every surface renders it correctly and the
 * editor never flags it as a stale beautify (the model stamp carries the `pipe5` marker).
 *
 * Seeded gender-matched via {@link sampleCloset} (onboarding asks `shopGender`): men's for
 * "male"; women's for "female" / "all" / unset. Pieces are coordinated to mix into several
 * good outfits and cover every builder slot + season, with realistic brands/prices and wear
 * history so the closet, Outfits tab and Insights all look alive on first launch.
 */

const MODEL = "gemini@2.5-flash-image+imgly@1.7.0+sticker+pipe5";

/** ISO date N days before today — keeps sample wear history looking recent whenever a user
 *  signs up (the demo shouldn't read "last worn 6 months ago"). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayISO(d);
}

let seq = 0;
type ItemFields = Omit<
  WardrobeItem,
  | "id" | "createdAt" | "wishlist"
  | "imageUrl" | "beautifiedImageUrl" | "beautifyWhiteUrl" | "cutoutImageUrl" | "beautifyModel"
>;

/**
 * Build a sample item from its generated assets. Stable `demo-<g>-<slug>` id → drives
 * {@link isSampleItem} AND lets the pre-saved outfits reference pieces by id.
 */
function beauty(gender: "women" | "men", slug: string, fields: ItemFields): WardrobeItem {
  const base = `/samples/${gender}/${slug}`;
  const sticker = `${base}-sticker.png`;
  return {
    ...fields,
    id: `demo-${gender[0]}-${slug}`,
    wishlist: false,
    imageUrl: sticker,
    beautifiedImageUrl: sticker,
    cutoutImageUrl: sticker,
    beautifyWhiteUrl: `${base}-white.png`,
    beautifyModel: MODEL,
    createdAt: Date.now() - ++seq * 3_600_000,
  };
}

/**
 * Sample/starter pieces are seeded with a `demo-` id; real user items get UUIDs (store
 * `addItem`), so this reliably tells a sample from a real piece — used to badge samples and
 * to clear them. Pre-saved sample outfits use `demo-` ids too (dropped by `clearSamples`).
 */
export const isSampleItem = (it: { id: string }): boolean => it.id.startsWith("demo-");

// ————————————————————————————— Women's capsule —————————————————————————————
export const demoItemsWomen: WardrobeItem[] = [
  beauty("women", "white-shirt", {
    name: "Crisp White Shirt", category: "top", color: "#f2f1ec", colorName: "white",
    tags: ["work", "classic", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Everlane", price: 88, fit: "regular", tone: "white", formality: "smart-casual",
    favorite: true, wearCount: 12, lastWornAt: daysAgo(3),
  }),
  beauty("women", "camel-sweater", {
    name: "Camel Wool Sweater", category: "top", color: "#b8894e", colorName: "camel",
    tags: ["cozy", "minimal"], seasons: ["fall", "winter"],
    brand: "COS", price: 120, fit: "regular", tone: "warm", formality: "smart-casual",
    wearCount: 7, lastWornAt: daysAgo(9),
  }),
  beauty("women", "blue-jeans", {
    name: "Straight-Leg Jeans", category: "bottom", color: "#3a567a", colorName: "blue",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall", "winter"],
    brand: "Levi's", price: 98, fit: "regular", tone: "blue", formality: "casual",
    favorite: true, wearCount: 21, lastWornAt: daysAgo(2),
  }),
  beauty("women", "trousers", {
    name: "Pleated Wide Trousers", category: "bottom", color: "#8f877a", colorName: "taupe",
    tags: ["work", "minimal"], seasons: ["spring", "fall", "winter"],
    brand: "Aritzia", price: 128, fit: "wide", tone: "neutral", formality: "smart-casual",
    wearCount: 5, lastWornAt: daysAgo(12),
  }),
  beauty("women", "trench-coat", {
    name: "Belted Trench Coat", category: "outerwear", color: "#c8b393", colorName: "beige",
    tags: ["classic", "work"], seasons: ["spring", "fall"],
    brand: "Mango", price: 150, fit: "regular", tone: "neutral", formality: "smart-casual",
    wearCount: 6, lastWornAt: daysAgo(15),
  }),
  beauty("women", "black-dress", {
    name: "Ruched Midi Dress", category: "dress", color: "#1a1a1a", colorName: "black",
    tags: ["date night", "work", "minimal"], seasons: ["spring", "fall", "winter"],
    brand: "& Other Stories", price: 110, fit: "slim", tone: "black", formality: "smart-casual",
    wearCount: 3, lastWornAt: daysAgo(20),
  }),
  beauty("women", "loafers", {
    name: "Leather Loafers", category: "shoes", color: "#6f4a2c", colorName: "tan",
    tags: ["work", "classic"], seasons: ["spring", "fall", "winter"],
    brand: "Sam Edelman", price: 140, tone: "warm", formality: "smart-casual",
    wearCount: 9, lastWornAt: daysAgo(6),
  }),
  beauty("women", "white-sneakers", {
    name: "Leather Sneakers", category: "shoes", color: "#eeeeee", colorName: "white",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Veja", price: 120, tone: "white", formality: "casual",
    favorite: true, wearCount: 16, lastWornAt: daysAgo(1),
  }),
];

// —————————————————————————————— Men's capsule ——————————————————————————————
export const demoItemsMen: WardrobeItem[] = [
  beauty("men", "white-oxford", {
    name: "Oxford Shirt", category: "top", color: "#f2f1ec", colorName: "white",
    tags: ["work", "classic", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Uniqlo", price: 50, fit: "regular", tone: "white", formality: "smart-casual",
    favorite: true, wearCount: 11, lastWornAt: daysAgo(4),
  }),
  beauty("men", "navy-sweater", {
    name: "Navy Cable Sweater", category: "top", color: "#1f2a44", colorName: "navy",
    tags: ["cozy", "minimal"], seasons: ["fall", "winter"],
    brand: "J.Crew", price: 128, fit: "regular", tone: "cool", formality: "smart-casual",
    wearCount: 8, lastWornAt: daysAgo(7),
  }),
  beauty("men", "grey-tee", {
    name: "Cotton Tee", category: "top", color: "#8a9199", colorName: "grey",
    tags: ["casual", "everyday", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Everlane", price: 35, fit: "regular", tone: "neutral", formality: "casual",
    favorite: true, wearCount: 19, lastWornAt: daysAgo(2),
  }),
  beauty("men", "chinos", {
    name: "Slim Chinos", category: "bottom", color: "#6f6a53", colorName: "olive",
    tags: ["work", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Bonobos", price: 99, fit: "slim", tone: "warm", formality: "smart-casual",
    wearCount: 10, lastWornAt: daysAgo(5),
  }),
  beauty("men", "dark-jeans", {
    name: "Dark Indigo Jeans", category: "bottom", color: "#2b3b52", colorName: "indigo",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall", "winter"],
    brand: "Levi's", price: 98, fit: "slim", tone: "blue", formality: "casual",
    wearCount: 17, lastWornAt: daysAgo(3),
  }),
  beauty("men", "field-jacket", {
    name: "Cotton Overshirt", category: "outerwear", color: "#d9d2c4", colorName: "cream",
    tags: ["classic", "casual"], seasons: ["spring", "fall"],
    brand: "COS", price: 165, fit: "regular", tone: "neutral", formality: "smart-casual",
    wearCount: 5, lastWornAt: daysAgo(11),
  }),
  beauty("men", "loafers", {
    name: "Bit Loafers", category: "shoes", color: "#2a2320", colorName: "black",
    tags: ["work", "classic"], seasons: ["spring", "fall", "winter"],
    brand: "G.H. Bass", price: 150, tone: "black", formality: "formal",
    wearCount: 6, lastWornAt: daysAgo(8),
  }),
  beauty("men", "white-sneakers", {
    name: "Leather Sneakers", category: "shoes", color: "#eeeeee", colorName: "white",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Common Projects", price: 180, tone: "white", formality: "casual",
    favorite: true, wearCount: 14, lastWornAt: daysAgo(1),
  }),
];

// Pre-saved sample outfits — no `layout` (the board auto-places), `demo-` id so clearSamples
// drops them. Reference pieces by their stable ids. Wear history makes the Outfits tab +
// Insights ("most-worn outfit") non-empty on first launch.
const W = (slug: string) => `demo-w-${slug}`;
const M = (slug: string) => `demo-m-${slug}`;
let oseq = 0;
const outfit = (id: string, name: string, itemIds: string[], wearCount: number, lastWornAt: string): Outfit => ({
  id, name, itemIds, wearCount, lastWornAt, createdAt: Date.now() - ++oseq * 86_400_000,
});

export const demoOutfitsWomen: Outfit[] = [
  outfit("demo-o-w-weekend", "Weekend Errands", [W("blue-jeans"), W("camel-sweater"), W("white-sneakers")], 4, daysAgo(9)),
  outfit("demo-o-w-office", "Office Ready", [W("trousers"), W("white-shirt"), W("trench-coat"), W("loafers")], 3, daysAgo(12)),
  outfit("demo-o-w-evening", "Dinner Out", [W("black-dress"), W("loafers")], 2, daysAgo(20)),
];

export const demoOutfitsMen: Outfit[] = [
  outfit("demo-o-m-weekend", "Weekend Casual", [M("dark-jeans"), M("grey-tee"), M("white-sneakers")], 5, daysAgo(7)),
  outfit("demo-o-m-office", "Smart Office", [M("chinos"), M("white-oxford"), M("field-jacket"), M("loafers")], 3, daysAgo(10)),
  outfit("demo-o-m-evening", "Cool Evening", [M("dark-jeans"), M("navy-sweater"), M("loafers")], 4, daysAgo(14)),
];

/**
 * Gender-matched starter closet. `"male"` → men's; `"female"` | `"all"` | undefined → women's
 * (also the local/demo + unset default). Returns items AND pre-saved outfits together.
 */
export function sampleCloset(shopGender?: "male" | "female" | "all"): {
  items: WardrobeItem[];
  outfits: Outfit[];
} {
  return shopGender === "male"
    ? { items: demoItemsMen, outfits: demoOutfitsMen }
    : { items: demoItemsWomen, outfits: demoOutfitsWomen };
}

/** Back-compat default (women's) for surfaces that just need sample items, e.g. the landing
 *  "How it works" section. Seeding paths use {@link sampleCloset} for the gender match. */
export const demoItems: WardrobeItem[] = demoItemsWomen;
