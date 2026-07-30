/**
 * Deterministic sub-category inference (AJA-228). Maps an item's name/tags to a canonical
 * sub-category slug from SUBCATEGORIES via per-category keyword rules — no network, no model.
 *
 * Used two ways:
 *  - fallback in the analyze client when the API doesn't return a sub-category, and
 *  - to backfill EXISTING items in `normalizeItem` (store.ts) so a pre-existing closet gets
 *    sub-categories instantly with zero API calls or image reprocessing.
 *
 * Returns `undefined` when nothing matches, so the item falls into the "Others" bucket rather
 * than being mis-slotted. Rules are ordered most-specific-first (the first match wins).
 */
import type { Category } from "./types";

/**
 * AJA-265 — athletic evidence, shared by BOTH `inferSubcategory` (an item arriving
 * with no subcategory) and `migrateSubcategory` (an item re-filed from an old one).
 * Declared once because two copies of the same intent drift, and the whole point of
 * this issue was that garment register should be data rather than a guess.
 *
 * NOT included: "trainer". In British English trainers ARE sneakers, so mapping it
 * to `training` would misfile ordinary casual shoes.
 */
const SPORT_SHOE: [RegExp, string][] = [
  [/basketball|\bcurry\b|\blebron\b|\bkd\b|jordan/, "basketball"],
  [/running|runner|adizero|\bpegasus\b|vaporfly|on ?cloud|\bultraboost\b/, "running"],
  [/training|crossfit|metcon|\bgym\b/, "training"],
];

/** Activewear evidence for tops. */
const ACTIVE_TOP =
  /compression|base ?layer|rash ?guard|dri-?fit|gymshark|athletic|performance|moisture.?wicking|\bgym\b/;

const RULES: Record<Category, [RegExp, string][]> = {
  top: [
    [/\bpolo\b/, "polo"],
    [/hoodie|hooded/, "hoodie"],
    [/quarter.?zip|half.?zip|1\/4.?zip|\bzip.?up\b/, "zipup"],
    [/sweatshirt/, "sweatshirt"],
    [/cardigan/, "cardigan"],
    [/sweater|knit|jumper|pullover/, "sweater"],
    [/jersey|\bkit\b/, "jersey"],
    [/camisole|\bcami\b/, "camisole"],
    [/bodysuit/, "bodysuit"],
    [/crop top|cropped/, "crop"],
    [/blouse/, "blouse"],
    [/tank|sleeveless/, "tank"],
    // Activewear sits AFTER the shape-specific rules on purpose: a Gymshark hoodie
    // is still a hoodie, and a football shirt is still a jersey. It only claims the
    // pieces whose only real identity is "athletic top".
    [ACTIVE_TOP, "activewear"],
    // `longsleeve` was REMOVED here with AJA-265. It is not in SUBCATEGORIES any
    // more, and inferSubcategory's output does NOT pass through migrateSubcategory,
    // so returning it would file a brand-new item under a value that no longer
    // exists — invisible in every chip filter. A long-sleeve shirt now falls to the
    // `shirt` rule below, which is what it always should have been.
    [/t.?shirt|\btee\b/, "tshirt"],
    [/\bshirt\b/, "shirt"],
  ],
  bottom: [
    [/jean|denim/, "jeans"],
    [/chino/, "chinos"],
    [/cargo/, "cargo"],
    [/jogger|sweatpant|track ?pant/, "joggers"],
    [/legging/, "leggings"],
    [/short\b|shorts/, "shorts"],
    [/skirt/, "skirt"],
    [/trouser|\bpant|slack/, "trousers"],
  ],
  dress: [
    [/gown/, "gown"],
    [/jumpsuit/, "jumpsuit"],
    [/romper|playsuit/, "romper"],
    [/sundress/, "sundress"],
    [/maxi/, "maxi"],
    [/midi/, "midi"],
    [/mini/, "mini"],
  ],
  outerwear: [
    [/blazer/, "blazer"],
    [/puffer|down jacket|quilted/, "puffer"],
    [/parka/, "parka"],
    [/bomber/, "bomber"],
    [/denim jacket|jean jacket|trucker/, "denim"],
    [/leather jacket|biker/, "leather"],
    [/track ?jacket|track ?top|zip.?up|windrunner/, "trackjacket"],
    [/windbreaker|rain ?jacket|shell/, "windbreaker"],
    [/gilet|\bvest\b/, "vest"],
    [/coat|overcoat|trench|peacoat/, "coat"],
    [/jacket/, "jacket"],
  ],
  shoes: [
    // BEFORE the sneakers catch-all, which itself matched /running/ and so filed
    // every running shoe as a plain sneaker (AJA-265).
    ...SPORT_SHOE,
    [/sneaker|trainer/, "sneakers"],
    [/boot|chelsea/, "boots"],
    [/heel|stiletto|pump/, "heels"],
    [/wedge/, "wedges"],
    [/ballet|\bflat\b/, "flats"],
    [/loafer|moccasin/, "loafers"],
    [/oxford|derby|brogue|dress shoe/, "dressshoes"],
    [/sandal/, "sandals"],
    [/slide|slipper/, "slides"],
    [/espadrille/, "espadrilles"],
  ],
  bag: [
    [/backpack|rucksack/, "backpack"],
    [/tote/, "tote"],
    [/crossbody|cross.?body/, "crossbody"],
    [/duffel|duffle|weekender/, "duffel"],
    [/belt bag|waist bag|fanny|bum bag|sling/, "beltbag"],
    [/messenger|briefcase/, "messenger"],
    [/clutch/, "clutch"],
    [/shoulder bag/, "shoulder"],
    [/satchel/, "satchel"],
    [/handbag|purse|hobo/, "handbag"],
  ],
  accessory: [
    [/watch/, "watch"],
    [/belt/, "belt"],
    [/beanie/, "beanie"],
    [/\bcap\b|baseball cap/, "cap"],
    [/\bhat\b|bucket|fedora/, "hat"],
    [/scarf|shawl/, "scarf"],
    [/sunglass|shades|eyewear/, "sunglasses"],
    [/glove|mitten/, "gloves"],
    [/wallet|cardholder/, "wallet"],
    [/necklace|pendant|\bchain\b/, "necklace"],
    [/earring/, "earrings"],
    [/bracelet|bangle/, "bracelet"],
    [/hair (clip|tie|band)|scrunchie|headband/, "hair"],
    [/\btie\b|necktie/, "tie"],
    [/cufflink/, "cufflinks"],
  ],
};

/**
 * AJA-265 — one-way migrations for subcategory values that left `SUBCATEGORIES`.
 *
 * Removing a value without this ORPHANS the items holding it: `presentSubcategories`
 * won't list a value that is no longer in the vocabulary, and
 * `matchesSubcategory(item, "others")` is false for any non-empty subcategory. So
 * the item silently disappears from every chip filter and shows only under "All".
 *
 * `longsleeve` described SLEEVE LENGTH, not garment type. In the measured closet it
 * held 10 items: 8 button-up / denim / dress shirts and 2 compression tops. The
 * names are unusually explicit, so a name rule re-files them accurately; anything
 * that matches neither pattern is LEFT ALONE rather than guessed at, and shows up
 * under "Others" for the user to fix by hand.
 */
const RETIRED: Record<string, { cat: Category; test: RegExp; to: string }[]> = {
  longsleeve: [
    { cat: "top", test: /(compression|base ?layer|thermal|rash ?guard|dri-?fit|gymshark)/, to: "activewear" },
    { cat: "top", test: /(button-?up|button-?down|oxford|dress shirt|denim shirt|flannel|\bshirt\b)/, to: "shirt" },
  ],
};

/**
 * Re-file a stored subcategory onto the current vocabulary. Returns the value
 * unchanged when nothing applies, so it is safe to call on every load.
 */
export function migrateSubcategory(
  category: Category,
  subcategory: string | undefined,
  name: string | undefined,
): string | undefined {
  if (!subcategory) return subcategory;
  const hay = String(name ?? "").toLowerCase();
  for (const rule of RETIRED[subcategory] ?? []) {
    if (rule.cat === category && rule.test.test(hay)) return rule.to;
  }
  // Athletic footwear filed as plain `sneakers`. Not a retirement — `sneakers` is
  // still a real option — so this only moves a shoe whose own name says what it is,
  // and never touches a casual sneaker. Same SPORT_SHOE list inferSubcategory uses.
  if (category === "shoes" && (subcategory === "sneakers" || subcategory === "sneaker")) {
    for (const [test, to] of SPORT_SHOE) if (test.test(hay)) return to;
  }
  return subcategory;
}

export function inferSubcategory(
  category: Category,
  name: string | undefined,
  tags?: string[],
): string | undefined {
  const hay = `${name ?? ""} ${(tags ?? []).join(" ")}`.toLowerCase();
  if (!hay.trim()) return undefined;
  for (const [re, val] of RULES[category] ?? []) {
    if (re.test(hay)) return val;
  }
  return undefined;
}
