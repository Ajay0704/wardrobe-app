import type { Outfit, WardrobeItem } from "./types";

/**
 * Curated, gender-matched "elevated everyday" sample capsules — the first-run closet.
 *
 * AJA-277: every piece is now a flat-sketch LINE DRAWING (public/samples/sketch/, generated
 * by scripts/gen-sketch-samples.mjs), not a photograph. The old capsule used genuine
 * beautified product shots, which made samples indistinguishable from the user's own clothes:
 * four of eighteen real users looked like they had a closet when they had nothing. The photos
 * also carried fabricated `wearCount` (up to 19) and `lastWornAt` dates EARLIER than their own
 * `createdAt`, which made every wear and analytics figure in the app unusable.
 *
 * A drawing cannot be mistaken for your own shirt, and these carry NO wear history — so
 * "most worn", cost-per-wear and the Insights numbers now start honestly at zero.
 *
 * Every surface reads `imageUrl` directly as a transparent sticker, so an SVG drops in
 * unchanged. Beautify mirror-fields are deliberately NOT set: a drawing is not a processed
 * photo, and claiming otherwise would make the editor treat it as a real beautify result.
 *
 * Seeded gender-matched via {@link sampleCloset} (onboarding asks `shopGender`): men's for
 * "male"; women's for "female" / "all" / unset. Pieces are coordinated to mix into several
 * good outfits and cover every builder slot + season, with realistic brands/prices and wear
 * history so the closet, Outfits tab and Insights all look alive on first launch.
 */

const SKETCH = "sketch@1"; // provenance stamp: hand-drawn asset, not a pipeline render

let seq = 0;
type ItemFields = Omit<
  WardrobeItem,
  | "id" | "createdAt" | "wishlist"
  | "imageUrl" | "beautifiedImageUrl" | "beautifyWhiteUrl" | "cutoutImageUrl" | "beautifyModel"
  // Samples no longer carry invented wear history — excluding them here makes it a type
  // error to reintroduce one, rather than something that quietly creeps back in.
  | "wearCount" | "lastWornAt" | "favorite"
>;

/** Which drawing a sample uses. Matches a filename in public/samples/sketch/. */
type Drawing =
  | "tee" | "shirt" | "sweater" | "jacket" | "coat"
  | "jeans" | "chinos" | "trousers" | "skirt" | "dress"
  | "sneakers" | "loafers";

/**
 * Build a sample item from its generated assets. Stable `demo-<g>-<slug>` id → drives
 * {@link isSampleItem} AND lets the pre-saved outfits reference pieces by id.
 */
function sketch(
  gender: "women" | "men",
  slug: string,
  drawing: Drawing,
  fields: ItemFields,
): WardrobeItem {
  const url = `/samples/sketch/${drawing}.svg`;
  return {
    ...fields,
    id: `demo-${gender[0]}-${slug}`,
    wishlist: false,
    imageUrl: url,
    cutoutImageUrl: url,
    beautifyModel: SKETCH,
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
  sketch("women", "white-shirt", "shirt", {
    name: "Crisp White Shirt", category: "top", color: "#f2f1ec", colorName: "white",
    tags: ["work", "classic", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Everlane", price: 88, fit: "regular", tone: "white", formality: "smart-casual",
  }),
  sketch("women", "camel-sweater", "sweater", {
    name: "Camel Wool Sweater", category: "top", color: "#b8894e", colorName: "camel",
    tags: ["cozy", "minimal"], seasons: ["fall", "winter"],
    brand: "COS", price: 120, fit: "regular", tone: "warm", formality: "smart-casual",
  }),
  sketch("women", "blue-jeans", "jeans", {
    name: "Slim Jeans", category: "bottom", color: "#93b1d4", colorName: "light blue",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall", "winter"],
    brand: "Levi's", price: 98, fit: "slim", tone: "blue", formality: "casual",
  }),
  sketch("women", "trousers", "trousers", {
    name: "Pleated Wide Trousers", category: "bottom", color: "#8f877a", colorName: "taupe",
    tags: ["work", "minimal"], seasons: ["spring", "fall", "winter"],
    brand: "Aritzia", price: 128, fit: "wide", tone: "neutral", formality: "smart-casual",
  }),
  sketch("women", "trench-coat", "coat", {
    name: "Belted Trench Coat", category: "outerwear", color: "#c8b393", colorName: "beige",
    tags: ["classic", "work"], seasons: ["spring", "fall"],
    brand: "Mango", price: 150, fit: "regular", tone: "neutral", formality: "smart-casual",
  }),
  sketch("women", "black-dress", "dress", {
    name: "Ruched Midi Dress", category: "dress", color: "#1a1a1a", colorName: "black",
    tags: ["date night", "work", "minimal"], seasons: ["spring", "fall", "winter"],
    brand: "& Other Stories", price: 110, fit: "slim", tone: "black", formality: "smart-casual",
  }),
  sketch("women", "loafers", "loafers", {
    name: "Leather Loafers", category: "shoes", color: "#6f4a2c", colorName: "tan",
    tags: ["work", "classic"], seasons: ["spring", "fall", "winter"],
    brand: "Sam Edelman", price: 140, tone: "warm", formality: "smart-casual",
  }),
  sketch("women", "white-sneakers", "sneakers", {
    name: "Leather Sneakers", category: "shoes", color: "#eeeeee", colorName: "white",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Veja", price: 120, tone: "white", formality: "casual",
  }),
];

// —————————————————————————————— Men's capsule ——————————————————————————————
export const demoItemsMen: WardrobeItem[] = [
  sketch("men", "white-oxford", "shirt", {
    name: "Oxford Shirt", category: "top", color: "#f2f1ec", colorName: "white",
    tags: ["work", "classic", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Uniqlo", price: 50, fit: "regular", tone: "white", formality: "smart-casual",
  }),
  sketch("men", "navy-sweater", "sweater", {
    name: "Navy Cable Sweater", category: "top", color: "#1f2a44", colorName: "navy",
    tags: ["cozy", "minimal"], seasons: ["fall", "winter"],
    brand: "J.Crew", price: 128, fit: "regular", tone: "cool", formality: "smart-casual",
  }),
  sketch("men", "grey-tee", "tee", {
    name: "Cotton Tee", category: "top", color: "#8a9199", colorName: "grey",
    tags: ["casual", "everyday", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Everlane", price: 35, fit: "regular", tone: "neutral", formality: "casual",
  }),
  sketch("men", "chinos", "chinos", {
    name: "Slim Chinos", category: "bottom", color: "#6f6a53", colorName: "olive",
    tags: ["work", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Bonobos", price: 99, fit: "slim", tone: "warm", formality: "smart-casual",
  }),
  sketch("men", "dark-jeans", "jeans", {
    name: "Dark Indigo Jeans", category: "bottom", color: "#2b3b52", colorName: "indigo",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall", "winter"],
    brand: "Levi's", price: 98, fit: "slim", tone: "blue", formality: "casual",
  }),
  sketch("men", "field-jacket", "jacket", {
    name: "Cotton Overshirt", category: "outerwear", color: "#d9d2c4", colorName: "cream",
    tags: ["classic", "casual"], seasons: ["spring", "fall"],
    brand: "COS", price: 165, fit: "regular", tone: "neutral", formality: "smart-casual",
  }),
  sketch("men", "loafers", "loafers", {
    name: "Bit Loafers", category: "shoes", color: "#2a2320", colorName: "black",
    tags: ["work", "classic"], seasons: ["spring", "fall", "winter"],
    brand: "G.H. Bass", price: 150, tone: "black", formality: "formal",
  }),
  sketch("men", "white-sneakers", "sneakers", {
    name: "Leather Sneakers", category: "shoes", color: "#eeeeee", colorName: "white",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Common Projects", price: 180, tone: "white", formality: "casual",
  }),
];

// Pre-saved sample outfits — no `layout` (the board auto-places), `demo-` id so clearSamples
// drops them. Reference pieces by their stable ids. Deliberately NO wear history: the Outfits
// tab is non-empty on first launch, but Insights honestly reads zero until the user wears
// something. Fake wears here were what made every analytics number in the app meaningless.
const W = (slug: string) => `demo-w-${slug}`;
const M = (slug: string) => `demo-m-${slug}`;
let oseq = 0;
/** AJA-277: no `wearCount` / `lastWornAt`. A starter outfit the user has never worn must not
 *  claim wears — that is what made "most-worn outfit" and Insights read as real data. */
const outfit = (id: string, name: string, itemIds: string[]): Outfit => ({
  id, name, itemIds, createdAt: Date.now() - ++oseq * 86_400_000,
});

export const demoOutfitsWomen: Outfit[] = [
  outfit("demo-o-w-weekend", "Weekend Errands", [W("blue-jeans"), W("camel-sweater"), W("white-sneakers")]),
  outfit("demo-o-w-office", "Office Ready", [W("trousers"), W("white-shirt"), W("trench-coat"), W("loafers")]),
  outfit("demo-o-w-evening", "Dinner Out", [W("black-dress"), W("loafers")]),
];

export const demoOutfitsMen: Outfit[] = [
  outfit("demo-o-m-weekend", "Weekend Casual", [M("dark-jeans"), M("grey-tee"), M("white-sneakers")]),
  outfit("demo-o-m-office", "Smart Office", [M("chinos"), M("white-oxford"), M("field-jacket"), M("loafers")]),
  outfit("demo-o-m-evening", "Cool Evening", [M("dark-jeans"), M("navy-sweater"), M("loafers")]),
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
