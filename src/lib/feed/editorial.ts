/**
 * Curated editorial inspiration — licensed, hotlinkable fashion imagery (no key)
 * that gives the feed a magazine feel. Each entry becomes an `editorial` feed
 * card; "shop similar" is resolved at read time from real products that share
 * the entry's gender + vibes.
 */

export type Gender = "male" | "female" | "unisex";

export interface EditorialItem {
  id: string;
  gender: Gender;
  title: string;
  subtitle: string;
  vibes: string[];
  /** Unsplash photo id. */
  photo: string;
  /** height/width for masonry. */
  ratio: number;
}

export const unsplashUrl = (photo: string) =>
  `https://images.unsplash.com/${photo}?w=700&q=80&auto=format&fit=crop`;

export const EDITORIAL: EditorialItem[] = [
  { id: "ed-1", gender: "female", title: "Effortless neutrals", subtitle: "Tonal dressing", vibes: ["minimal", "formal"], photo: "photo-1483721310020-03333e577078", ratio: 1.5 },
  { id: "ed-2", gender: "male", title: "Street layers", subtitle: "Urban edge", vibes: ["streetwear", "casual"], photo: "photo-1516257984-b1b4d707412e", ratio: 1.3 },
  { id: "ed-3", gender: "female", title: "Weekend denim", subtitle: "Easy off-duty", vibes: ["casual", "minimal"], photo: "photo-1519238263530-99bdd11df2ea", ratio: 1.45 },
  { id: "ed-4", gender: "male", title: "Sharp tailoring", subtitle: "Modern suiting", vibes: ["work", "formal"], photo: "photo-1507003211169-0a1dd7228f2d", ratio: 1.5 },
  { id: "ed-5", gender: "female", title: "Golden hour", subtitle: "Summer flow", vibes: ["party", "casual"], photo: "photo-1495385794356-15371f348c31", ratio: 1.35 },
  { id: "ed-6", gender: "unisex", title: "Monochrome mood", subtitle: "All black everything", vibes: ["minimal", "streetwear"], photo: "photo-1517841905240-472988babdf9", ratio: 1.25 },
  { id: "ed-7", gender: "male", title: "Cozy knits", subtitle: "Layer up", vibes: ["cozy", "minimal"], photo: "photo-1487222477894-8943e31ef7b2", ratio: 1.4 },
  { id: "ed-8", gender: "female", title: "Date night", subtitle: "Turn it up", vibes: ["party", "formal"], photo: "photo-1523398002811-999ca8dec234", ratio: 1.5 },
  { id: "ed-9", gender: "female", title: "Studio minimal", subtitle: "Quiet luxury", vibes: ["minimal", "work"], photo: "photo-1529626455594-4ff0802cfb7e", ratio: 1.3 },
  { id: "ed-10", gender: "male", title: "Off-duty ease", subtitle: "Relaxed fits", vibes: ["casual", "athleisure"], photo: "photo-1490114538077-0a7f8cb49891", ratio: 1.45 },
  { id: "ed-11", gender: "female", title: "City polish", subtitle: "9-to-5 and beyond", vibes: ["work", "minimal"], photo: "photo-1521572163474-6864f9cf17ab", ratio: 1.35 },
  { id: "ed-12", gender: "unisex", title: "Autumn tones", subtitle: "Warm palette", vibes: ["cozy", "casual"], photo: "photo-1479064555552-3ef4979f8908", ratio: 1.4 },
];
