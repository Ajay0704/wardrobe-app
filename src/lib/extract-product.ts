/**
 * Helpers for /api/extract — clean shop titles into garment name + brand.
 */

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const decode = (s: string) =>
  stripTags(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

/**
 * Split titles like "Luxury-Touch Long-Sleeve Polo | Banana Republic"
 * into a clean garment name + brand.
 */
export function splitTitleAndBrand(
  raw?: string,
  hintBrand?: string,
): { name?: string; brand?: string } {
  if (!raw) return {};
  let title = decode(raw)
    .replace(/\s+/g, " ")
    .replace(/\s*[\|–—]\s*Official Site.*$/i, "")
    .trim();
  if (!title) return {};

  let brand = hintBrand?.trim() || undefined;
  const seps = [" | ", " – ", " — ", " - "];
  for (const sep of seps) {
    const idx = title.lastIndexOf(sep);
    if (idx <= 0) continue;
    const left = title.slice(0, idx).trim();
    const right = title.slice(idx + sep.length).trim();
    if (
      left.length >= 3 &&
      right.length >= 2 &&
      right.length <= 40 &&
      !/\d{2,}/.test(right) &&
      !/^(men|women|sale|shop|new|home)$/i.test(right)
    ) {
      title = left;
      brand ??= right;
      break;
    }
  }

  if (brand) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`^${escaped}\\s*[-–—:]\\s*`, "i"), "").trim();
    title = title
      .replace(new RegExp(`\\s*[\\|–—-]\\s*${escaped}\\s*$`, "i"), "")
      .trim();
  }

  return { name: title || undefined, brand };
}

export function brandFromHost(host: string): string | undefined {
  const h = host.toLowerCase();
  if (h.includes("bananarepublic")) return "Banana Republic";
  if (h.includes("oldnavy")) return "Old Navy";
  if (h.includes("athleta")) return "Athleta";
  if (/(^|\.)gap\./.test(h)) return "Gap";
  if (h.includes("everlane")) return "Everlane";
  if (h.includes("uniqlo")) return "Uniqlo";
  if (h.includes("zara")) return "Zara";
  if (h.includes("hm.com") || h.includes("www2.hm")) return "H&M";
  if (h.includes("nordstrom")) return "Nordstrom";
  if (h.includes("jcrew")) return "J.Crew";
  if (h.includes("cos.com")) return "COS";
  if (h.includes("aritzia")) return "Aritzia";
  if (h.includes("lululemon")) return "Lululemon";
  if (h.includes("nike")) return "Nike";
  if (h.includes("adidas")) return "Adidas";
  return undefined;
}
