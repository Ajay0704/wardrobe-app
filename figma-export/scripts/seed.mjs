// Realistic, populated fixture data for the Figma export.
//
// Ids are `fx-*`, never `demo-*` — the app treats `demo-` ids as sample pieces (badges them,
// and `clearSamples` drops them), which would make the captures look like a first-run closet.
// Images are the real product-photo stickers in public/samples/, not the line-drawing samples.

const DAY = 86_400_000;
const now = Date.now();

const iso = (offsetDays) => {
  const d = new Date(now + offsetDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function piece(slug, gender, file, fields) {
  const sticker = `/samples/${gender}/${file}-sticker.png`;
  return {
    id: `fx-${slug}`,
    imageUrl: sticker,
    beautifiedImageUrl: sticker,
    beautifyWhiteUrl: `/samples/${gender}/${file}-white.png`,
    cutoutImageUrl: sticker,
    wishlist: false,
    ...fields,
  };
}

export const items = [
  piece("white-shirt", "women", "white-shirt", {
    name: "Crisp White Shirt", category: "top", subcategory: "shirt", color: "#f2f1ec", colorName: "white",
    tags: ["work", "classic", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Everlane", price: 88, fit: "regular", tone: "white", formality: "smart-casual", size: "S",
    material: "cotton poplin", wearCount: 14, lastWornAt: iso(-2), favorite: true, createdAt: now - 120 * DAY,
  }),
  piece("camel-sweater", "women", "camel-sweater", {
    name: "Camel Wool Sweater", category: "top", subcategory: "sweater", color: "#b8894e", colorName: "camel",
    tags: ["cozy", "minimal"], seasons: ["fall", "winter"],
    brand: "COS", price: 120, fit: "regular", tone: "warm", formality: "smart-casual", size: "S",
    material: "merino wool", wearCount: 9, lastWornAt: iso(-1), favorite: true, createdAt: now - 95 * DAY,
  }),
  piece("blue-jeans", "women", "blue-jeans", {
    name: "Slim Jeans", category: "bottom", subcategory: "jeans", color: "#93b1d4", colorName: "light blue",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall", "winter"],
    brand: "Levi's", price: 98, fit: "slim", tone: "blue", formality: "casual", size: "27",
    wearCount: 21, lastWornAt: iso(-1), createdAt: now - 160 * DAY,
  }),
  piece("trousers", "women", "trousers", {
    name: "Pleated Wide Trousers", category: "bottom", subcategory: "trousers", color: "#8f877a", colorName: "taupe",
    tags: ["work", "minimal"], seasons: ["spring", "fall", "winter"],
    brand: "Aritzia", price: 128, fit: "wide", tone: "neutral", formality: "smart-casual", size: "4",
    wearCount: 11, lastWornAt: iso(-3), createdAt: now - 80 * DAY,
  }),
  piece("trench-coat", "women", "trench-coat", {
    name: "Belted Trench Coat", category: "outerwear", subcategory: "trench", color: "#c8b393", colorName: "beige",
    tags: ["classic", "work"], seasons: ["spring", "fall"],
    brand: "Mango", price: 150, fit: "regular", tone: "neutral", formality: "smart-casual", size: "S",
    wearCount: 7, lastWornAt: iso(-3), createdAt: now - 70 * DAY,
  }),
  piece("black-dress", "women", "black-dress", {
    name: "Ruched Midi Dress", category: "dress", subcategory: "midi", color: "#1a1a1a", colorName: "black",
    tags: ["date night", "work", "minimal"], seasons: ["spring", "fall", "winter"],
    brand: "& Other Stories", price: 110, fit: "slim", tone: "black", formality: "smart-casual", size: "S",
    wearCount: 4, lastWornAt: iso(-9), createdAt: now - 60 * DAY,
  }),
  piece("loafers", "women", "loafers", {
    name: "Leather Loafers", category: "shoes", subcategory: "loafers", color: "#6f4a2c", colorName: "tan",
    tags: ["work", "classic"], seasons: ["spring", "fall", "winter"],
    brand: "Sam Edelman", price: 140, tone: "warm", formality: "smart-casual", size: "7.5",
    wearCount: 16, lastWornAt: iso(-3), createdAt: now - 150 * DAY,
  }),
  piece("white-sneakers", "women", "white-sneakers", {
    name: "Leather Sneakers", category: "shoes", subcategory: "sneakers", color: "#eeeeee", colorName: "white",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Veja", price: 120, tone: "white", formality: "casual", size: "7.5",
    wearCount: 24, lastWornAt: iso(-1), favorite: true, createdAt: now - 200 * DAY,
  }),
  piece("grey-tee", "men", "grey-tee", {
    name: "Heavyweight Tee", category: "top", subcategory: "tee", color: "#8a9199", colorName: "grey",
    tags: ["casual", "everyday", "minimal"], seasons: ["spring", "summer", "fall"],
    brand: "Everlane", price: 35, fit: "relaxed", tone: "neutral", formality: "casual", size: "M",
    wearCount: 18, lastWornAt: iso(-5), createdAt: now - 110 * DAY,
  }),
  piece("dark-jeans", "men", "dark-jeans", {
    name: "Dark Indigo Jeans", category: "bottom", subcategory: "jeans", color: "#2b3b52", colorName: "indigo",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall", "winter"],
    brand: "Levi's", price: 98, fit: "straight", tone: "blue", formality: "casual", size: "28",
    wearCount: 6, lastWornAt: iso(-12), createdAt: now - 45 * DAY,
  }),
  piece("field-jacket", "men", "field-jacket", {
    name: "Cotton Overshirt", category: "outerwear", subcategory: "overshirt", color: "#d9d2c4", colorName: "cream",
    tags: ["classic", "casual"], seasons: ["spring", "fall"],
    brand: "COS", price: 165, fit: "relaxed", tone: "neutral", formality: "smart-casual", size: "M",
    wearCount: 2, lastWornAt: iso(-40), createdAt: now - 130 * DAY,
  }),
  piece("navy-sweater", "men", "navy-sweater", {
    name: "Navy Cable Sweater", category: "top", subcategory: "sweater", color: "#1f2a44", colorName: "navy",
    tags: ["cozy", "minimal"], seasons: ["fall", "winter"],
    brand: "J.Crew", price: 128, fit: "relaxed", tone: "cool", formality: "smart-casual", size: "M",
    wearCount: 0, createdAt: now - 20 * DAY,
  }),
  // Wishlist — a mix of fresh and ageing wishes so the "Should I buy?" nudges have something to say.
  piece("white-oxford", "men", "white-oxford", {
    name: "Oversized Oxford Shirt", category: "top", subcategory: "shirt", color: "#f2f1ec", colorName: "white",
    tags: ["work", "classic"], seasons: ["spring", "summer", "fall"],
    brand: "Uniqlo", price: 50, fit: "oversized", tone: "white", formality: "smart-casual",
    productUrl: "https://www.uniqlo.com/", wishlist: true, createdAt: now - 41 * DAY,
  }),
  piece("chinos", "men", "chinos", {
    name: "Olive Chinos", category: "bottom", subcategory: "chinos", color: "#6f6a53", colorName: "olive",
    tags: ["work", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Bonobos", price: 99, fit: "slim", tone: "warm", formality: "smart-casual",
    productUrl: "https://bonobos.com/", wishlist: true, createdAt: now - 6 * DAY,
  }),
  piece("bit-loafers", "men", "loafers", {
    name: "Horsebit Loafers", category: "shoes", subcategory: "loafers", color: "#2a2320", colorName: "black",
    tags: ["work", "classic"], seasons: ["spring", "fall", "winter"],
    brand: "G.H. Bass", price: 150, tone: "black", formality: "formal",
    productUrl: "https://www.ghbass.com/", wishlist: true, createdAt: now - 18 * DAY,
  }),
  piece("cp-sneakers", "men", "white-sneakers", {
    name: "Achilles Low Sneakers", category: "shoes", subcategory: "sneakers", color: "#eeeeee", colorName: "white",
    tags: ["casual", "everyday"], seasons: ["spring", "summer", "fall"],
    brand: "Common Projects", price: 425, tone: "white", formality: "casual",
    productUrl: "https://www.commonprojects.com/", wishlist: true, createdAt: now - 2 * DAY,
  }),
];

const look = (id, name, slugs, extra = {}) => ({
  id: `fx-o-${id}`,
  name,
  itemIds: slugs.map((s) => `fx-${s}`),
  createdAt: now - (extra.ageDays ?? 10) * DAY,
  ...extra,
});

export const outfits = [
  look("weekend", "Weekend Errands", ["blue-jeans", "camel-sweater", "white-sneakers"], { wearCount: 6, lastWornAt: iso(-1), favorite: true, ageDays: 40 }),
  look("office", "Office Ready", ["trousers", "white-shirt", "trench-coat", "loafers"], { wearCount: 5, lastWornAt: iso(-3), ageDays: 35 }),
  look("dinner", "Dinner Out", ["black-dress", "loafers"], { wearCount: 2, lastWornAt: iso(-9), ageDays: 30 }),
  look("easy", "Easy Saturday", ["grey-tee", "dark-jeans", "white-sneakers"], { wearCount: 3, lastWornAt: iso(-5), ageDays: 22 }),
  look("layers", "Soft Layers", ["white-shirt", "navy-sweater", "trousers", "loafers"], { ageDays: 8 }),
  look("gallery", "Gallery Day", ["field-jacket", "grey-tee", "blue-jeans", "white-sneakers"], { wearCount: 1, lastWornAt: iso(-12), favorite: true, ageDays: 15 }),
  look("wish", "Next Season", ["white-oxford", "chinos", "bit-loafers"], { wishItemIds: ["fx-white-oxford", "fx-chinos", "fx-bit-loafers"], ageDays: 4 }),
];

const outfitById = Object.fromEntries(outfits.map((o) => [o.id, o]));
let cal = 0;
const entry = (offset, kind, outfitId, note) => ({
  id: `fx-c-${++cal}`,
  date: iso(offset),
  kind,
  outfitId,
  itemIds: outfitById[outfitId].itemIds,
  ...(note ? { note } : {}),
  createdAt: now + offset * DAY,
});

export const calendar = [
  entry(-1, "worn", "fx-o-weekend"),
  entry(-3, "worn", "fx-o-office", "Client presentation"),
  entry(-5, "worn", "fx-o-easy"),
  entry(-7, "worn", "fx-o-weekend"),
  entry(-8, "worn", "fx-o-office"),
  entry(-9, "worn", "fx-o-dinner", "Anniversary dinner"),
  entry(-12, "worn", "fx-o-gallery"),
  entry(-14, "worn", "fx-o-office"),
  entry(-16, "worn", "fx-o-weekend"),
  entry(-19, "worn", "fx-o-easy"),
  entry(0, "planned", "fx-o-layers"),
  entry(2, "planned", "fx-o-office", "Team offsite"),
  entry(5, "planned", "fx-o-dinner"),
];

export const profile = {
  displayName: "Maya Chen",
  username: "mayachen",
  email: "maya@example.com",
  bio: "Minimal wardrobe, maximum outfits. Boston ↔ Lisbon.",
  location: "Boston, MA",
  website: "mayachen.studio",
  shopGender: "female",
  followers: 1284,
  following: 312,
  currency: "USD",
  temperatureUnit: "F",
  country: "United States",
  language: "English",
  sizes: { top: "S", bottom: "27", shoes: "7.5", dress: "4" },
  styleVibes: ["minimal", "work", "casual"],
  styleGoal: "use_what_i_own",
  styleOccasions: ["work", "everyday"],
  styleLean: "relaxed",
  styleSnapshot: "Relaxed · Everyday",
  onboardingComplete: true,
  startView: "explore",
};

/** The persisted zustand blob under localStorage["wardrobe-store-v2"]. */
export function persistedStore(theme = "light") {
  return JSON.stringify({
    state: {
      items,
      outfits,
      calendar,
      profile,
      theme,
      draft: { top: ["fx-white-shirt"], bottom: ["fx-trousers"], dress: [], outerwear: ["fx-trench-coat"], shoes: ["fx-loafers"], accessories: [] },
      canvasDraft: [],
      canvasBg: null,
      savedPinIds: [],
    },
    version: 0,
  });
}

// ——— Stubbed API responses for the public, backend-backed routes ———

export const publicProfile = {
  profile: { name: profile.displayName, handle: profile.username, bio: profile.bio, avatar: undefined },
  counts: { posts: 6, followers: profile.followers, following: profile.following },
  posts: outfits.slice(0, 6).map((o, i) => ({
    id: `fx-p-${i}`, kind: "look", lookTitle: o.name, caption: o.name,
    imageUrl: items.find((it) => it.id === o.itemIds[0]).imageUrl,
  })),
  tagged: [],
  shared: [],
};

export const closetShare = {
  share: {
    id: "fx-share",
    question: "Which of these should I wear to a rooftop dinner on Friday?",
    ownerName: profile.displayName,
    items: items.filter((it) => !it.wishlist).slice(0, 6).map((it) => ({
      id: it.id, name: it.name, imageUrl: it.imageUrl, brand: it.brand, category: it.category,
    })),
  },
  replies: [
    { id: "fx-r1", author_name: "Priya", message: "The midi dress with the loafers — classic.", suggested_item_ids: ["fx-black-dress", "fx-loafers"], created_at: new Date(now - 3_600_000).toISOString() },
    { id: "fx-r2", author_name: "Jordan", message: "Trench over the white shirt if it gets chilly.", suggested_item_ids: ["fx-trench-coat", "fx-white-shirt"], created_at: new Date(now - 7_200_000).toISOString() },
  ],
};

export const itemPreviewParam = Buffer.from(
  JSON.stringify({ n: "Belted Trench Coat", b: "Mango", i: "/samples/women/trench-coat-white.png" }),
).toString("base64url");
