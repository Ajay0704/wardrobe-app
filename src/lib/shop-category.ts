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
  // Match the garment "short(s)" but NOT "short" used as an ADJECTIVE before another
  // garment word ("Short Sleeve", "Short Boots", "Short Cardigan") — otherwise those
  // leak into `bottom` from the title (AJA-177). The exclusion set = the category nouns
  // whose rules sit AFTER `bottom` (shoes/bag/top) + "sleeve", so it closes the class
  // rather than patching one instance. Garment shorts ("Run Shorts", "Split Short 5\"")
  // are unaffected — no garment noun follows, so the lookahead passes.
  [/\b(jeans?|pants?|trousers?|chinos?|shorts?(?![\s-]*(sleeve|boot|shoe|sneaker|sandal|heel|loafer|clog|trainer|shirt|tee|top|blouse|sweater|hoodie|cardigan|polo|tank|bag|tote|backpack|purse|clutch))|skirt|leggings?|joggers?|sweatpants?|slacks)\b/i, "bottom"],
  [/\b(sneakers?|shoes?|boots?|booties?|loafers?|heels?|sandals?|trainers?|footwear|clogs|flats)\b/i, "shoes"],
  [/\b(bag|tote|backpack|purse|handbag|clutch|satchel|crossbody|duffel)\b/i, "bag"],
  [/\b(belt|hat|cap|beanie|scarf|gloves?|sunglasses?|watch|jewelry|necklace|bracelet|rings?|earrings?|tie|socks?|accessor)/i, "accessory"],
  [/\b(shirt|tee|t-shirt|tshirt|top|blouse|sweater|hoodie|jumper|cardigan|polo|knit|sweatshirt|turtleneck|tank|henley)\b/i, "top"],
];

/** First rule-matched category for a single text, or null if it has no category word. */
function matchCategoryRules(text: string): Category | null {
  for (const [re, cat] of RULES) if (re.test(text)) return cat;
  return null;
}

/**
 * Clothing category from a product title. The search `query` is used ONLY as a
 * fallback when the title carries no category word — it must never override a
 * title that already indicates one (AJA-177). Otherwise query terms leak in and
 * mislabel results: a "T-Shirt" returned for a "black jeans" search must stay a
 * `top`, not become a `bottom`. The query is still load-bearing for model-name
 * titles ("Nike Court Vision" has no "sneaker" word → falls back to the query →
 * `shoes`). Defaults to "top". Category is category-gated in ownership scoring,
 * so leakage here corrupts the closet-aware ranker for every query.
 */
export function classifyCategory(title: string, query = ""): Category {
  return matchCategoryRules(title) ?? matchCategoryRules(query) ?? "top";
}

// [matcher, canonical tone]. Ordered specific → general; synonyms collapse onto a
// canonical so within-category colour variety is preserved without vocab sprawl.
// Neutrals (black/white/grey/navy/beige/tan/cream/ivory/denim/brown/khaki/charcoal)
// align with closet-fit's NEUTRAL_TONES; the rest are "real" colours that must match
// a closet item's tone to pair — which is what makes closetScore vary within a category.
const COLOR_MAP: [string, string][] = [
  ["off-white", "white"], ["ivory", "ivory"], ["ecru", "cream"], ["cream", "cream"],
  ["jet black", "black"], ["black", "black"], ["white", "white"],
  ["charcoal", "charcoal"], ["slate", "grey"], ["heather", "grey"], ["grey", "grey"], ["gray", "grey"],
  ["navy", "navy"], ["denim", "denim"],
  ["camel", "tan"], ["taupe", "tan"], ["sand", "tan"], ["stone", "tan"], ["nude", "beige"],
  ["beige", "beige"], ["tan", "tan"], ["khaki", "khaki"],
  ["chocolate", "brown"], ["espresso", "brown"], ["mocha", "brown"], ["coffee", "brown"], ["brown", "brown"],
  ["cobalt", "blue"], ["royal blue", "blue"], ["sky blue", "blue"], ["light blue", "blue"],
  ["powder blue", "blue"], ["baby blue", "blue"], ["blue", "blue"],
  ["indigo", "indigo"], ["teal", "teal"], ["turquoise", "teal"], ["aqua", "teal"],
  ["olive", "olive"], ["forest", "green"], ["emerald", "green"], ["sage", "green"],
  ["mint", "green"], ["lime", "green"], ["green", "green"],
  ["crimson", "red"], ["scarlet", "red"], ["red", "red"],
  ["burgundy", "burgundy"], ["maroon", "burgundy"], ["wine", "burgundy"], ["oxblood", "burgundy"],
  ["hot pink", "pink"], ["blush", "pink"], ["rose", "pink"], ["fuchsia", "pink"], ["magenta", "pink"], ["pink", "pink"],
  ["lavender", "purple"], ["lilac", "purple"], ["violet", "purple"], ["plum", "purple"],
  ["mauve", "purple"], ["purple", "purple"],
  ["mustard", "yellow"], ["gold", "gold"], ["golden", "gold"], ["yellow", "yellow"],
  ["rust", "orange"], ["terracotta", "orange"], ["apricot", "orange"], ["coral", "coral"],
  ["peach", "peach"], ["orange", "orange"],
  ["silver", "silver"], ["metallic", "silver"], ["chrome", "silver"],
];

/** Canonical tone of the colour appearing earliest in the title, or null. */
export function parseColor(title: string): string | null {
  const t = title.toLowerCase();
  let best: { tone: string; at: number } | null = null;
  for (const [word, tone] of COLOR_MAP) {
    const m = new RegExp(`\\b${word.replace(/[-\s]/g, "[-\\s]?")}\\b`).exec(t);
    if (m && (!best || m.index < best.at)) best = { tone, at: m.index };
  }
  return best ? best.tone : null;
}

// Keys align with closet-fit's FORMALITY_RANK so formalityOk() can compare once
// closet items carry formality too.
const FORMALITY_RULES: [RegExp, string][] = [
  [/\b(gown|tuxedo|tux|prom|gala|cocktail|evening|black[-\s]?tie|sequin)\b/i, "evening"],
  [/\b(suit|blazer|sport ?coat|dress shirt|oxford|trousers?|slacks|loafers?|derby|brogue|necktie|formal)\b/i, "business"],
  [/\b(leggings?|joggers?|sweatpants?|track|gym|yoga|athletic|running|activewear|performance)\b/i, "athleisure"],
  [/\b(hoodie|graphic|cargo|skate|streetwear|oversized)\b/i, "streetwear"],
  [/\b(tee|t-?shirt|jeans?|denim|shorts?|casual|everyday|lounge)\b/i, "casual"],
];

/** Best-effort formality bucket from the title, else a category default, else null. */
export function classifyFormality(title: string, category: Category): string | null {
  for (const [re, f] of FORMALITY_RULES) if (re.test(title)) return f;
  if (category === "dress") return "smart-casual";
  return null; // unknown → scorer skips the formality check
}

const FIT_RULES: [RegExp, string][] = [
  [/\b(oversized|baggy|loose|relaxed|boxy)\b/i, "relaxed"],
  [/\b(slim|skinny|fitted|tapered|compression)\b/i, "slim"],
  [/\b(wide|flare|bootcut|palazzo|balloon)\b/i, "wide"],
  [/\b(crop|cropped)\b/i, "cropped"],
  [/\b(straight|regular|classic|standard)\b/i, "regular"],
];

/** Best-effort fit descriptor from the title, or null (scorer skips when null). */
export function classifyFit(title: string): string | null {
  for (const [re, f] of FIT_RULES) if (re.test(title)) return f;
  return null;
}
