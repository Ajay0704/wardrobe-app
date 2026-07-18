/**
 * Best-effort mapping of a web product's title (+ the search query) onto our
 * 7-value wardrobe Category, plus a color guess (AJA-172). Web search results
 * (SerpAPI Google Shopping) don't carry our taxonomy, but the size chip
 * (`yourSize(profile, category)`) and the local wishlist `addItem` need one.
 */
import type { Category } from "./types";

// Ordered most-specific → least; the catch-all "top" stays last.
const RULES: [RegExp, Category][] = [
  [/\b(dress|gown|frock)\b/i, "dress"],
  [/\b(jacket|coat|blazer|parka|overcoat|trench|puffer|windbreaker|outerwear|vest)\b/i, "outerwear"],
  [/\b(jeans?|pants?|trousers?|chinos?|shorts?|skirt|leggings?|joggers?|sweatpants?|slacks)\b/i, "bottom"],
  [/\b(sneakers?|shoes?|boots?|loafers?|heels?|sandals?|trainers?|footwear|clogs|flats)\b/i, "shoes"],
  [/\b(bag|tote|backpack|purse|handbag|clutch|satchel|crossbody|duffel)\b/i, "bag"],
  [/\b(belt|hat|cap|beanie|scarf|gloves?|sunglasses?|watch|jewelry|necklace|bracelet|rings?|earrings?|tie|socks?|accessor)/i, "accessory"],
  [/\b(shirt|tee|t-shirt|tshirt|top|blouse|sweater|hoodie|jumper|cardigan|polo|knit|sweatshirt|turtleneck|tank|henley)\b/i, "top"],
];

/** Clothing category from a product title + optional query. Defaults to "top". */
export function classifyCategory(title: string, query = ""): Category {
  const hay = `${title} ${query}`;
  for (const [re, cat] of RULES) if (re.test(hay)) return cat;
  return "top";
}

const COLOR_WORDS = [
  "black", "white", "grey", "gray", "navy", "blue", "beige", "cream", "tan",
  "camel", "brown", "olive", "khaki", "green", "burgundy", "maroon", "red",
  "pink", "purple", "lavender", "yellow", "orange", "gold", "silver",
  "charcoal", "stone", "ivory", "teal",
];

/** First recognizable color word in a title, normalized, or null. */
export function parseColor(title: string): string | null {
  const t = title.toLowerCase();
  for (const c of COLOR_WORDS) {
    if (new RegExp(`\\b${c}\\b`).test(t)) return c === "gray" ? "grey" : c;
  }
  return null;
}
