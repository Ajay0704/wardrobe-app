import type { Category } from "./types";

/**
 * Best-effort category from a product title. Pure, so client components can use it — it lives
 * apart from import-item.ts, which is server-only (service-role client, SSRF-guarded fetch).
 */
export function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/\b(dress|gown|romper|jumpsuit|overall)\b/.test(n)) return "dress";
  if (/\b(jean|pant|trouser|skirt|short|legging|chino)\b/.test(n)) return "bottom";
  if (/\b(shoe|sneaker|boot|heel|sandal|loafer|slipper)\b/.test(n)) return "shoes";
  if (/\b(jacket|coat|blazer|parka|puffer|cardigan|hoodie)\b/.test(n)) return "outerwear";
  if (/\b(bag|tote|purse|backpack|clutch|crossbody)\b/.test(n)) return "bag";
  if (/\b(hat|belt|scarf|jewelry|earring|necklace|bracelet|watch|sunglass)\b/.test(n))
    return "accessory";
  return "top";
}
