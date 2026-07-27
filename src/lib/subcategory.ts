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
    [/long.?sleeve/, "longsleeve"],
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
    [/sneaker|trainer|running|runner/, "sneakers"],
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
