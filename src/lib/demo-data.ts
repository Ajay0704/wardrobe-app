import type { WardrobeItem } from "./types";

/**
 * A small starter wardrobe (Unsplash imagery) so the app is explorable on
 * first launch. Users can delete these; they are only seeded once because
 * the store is persisted after first load.
 */

const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?w=600&q=80&auto=format&fit=crop`;

let seq = 0;
const demo = (
  item: Omit<WardrobeItem, "id" | "createdAt" | "wishlist"> & {
    wishlist?: boolean;
  },
): WardrobeItem => ({
  wishlist: false,
  ...item,
  id: `demo-${++seq}`,
  createdAt: Date.now() - seq * 1000,
});

export const demoItems: WardrobeItem[] = [
  demo({
    name: "White Oxford Shirt",
    imageUrl: unsplash("photo-1596755094514-f87e34085b2c"),
    category: "top",
    color: "#f5f4f0",
    colorName: "white",
    tags: ["work", "casual", "minimal"],
    seasons: ["spring", "summer", "fall"],
    brand: "Everlane",
  }),
  demo({
    name: "Camel Knit Sweater",
    imageUrl: unsplash("photo-1576871337622-98d48d1cf531"),
    category: "top",
    color: "#c19a6b",
    colorName: "beige",
    tags: ["cozy", "casual", "minimal"],
    seasons: ["fall", "winter"],
  }),
  demo({
    name: "Black Silk Blouse",
    imageUrl: unsplash("photo-1564257631407-4deb1f99d992"),
    category: "top",
    color: "#191919",
    colorName: "black",
    tags: ["formal", "work", "party"],
    seasons: ["spring", "summer", "fall", "winter"],
  }),
  demo({
    name: "Dark Wash Jeans",
    imageUrl: unsplash("photo-1541099649105-f69ad21f3246"),
    category: "bottom",
    color: "#2e3a4e",
    colorName: "navy",
    tags: ["casual", "streetwear"],
    seasons: ["spring", "fall", "winter"],
    brand: "Levi's",
  }),
  demo({
    name: "Cream Wide-Leg Trousers",
    imageUrl: unsplash("photo-1594633312681-425c7b97ccd1"),
    category: "bottom",
    color: "#ece4d4",
    colorName: "cream",
    tags: ["work", "formal", "minimal"],
    seasons: ["spring", "summer"],
  }),
  demo({
    name: "Terracotta Midi Dress",
    imageUrl: unsplash("photo-1595777457583-95e059d581b8"),
    category: "dress",
    color: "#b05e3c",
    colorName: "orange",
    tags: ["party", "date night"],
    seasons: ["summer"],
  }),
  demo({
    name: "Beige Trench Coat",
    imageUrl: unsplash("photo-1591047139829-d91aecb6caea"),
    category: "outerwear",
    color: "#cbb491",
    colorName: "beige",
    tags: ["work", "minimal"],
    seasons: ["spring", "fall"],
    brand: "Burberry",
  }),
  demo({
    name: "Black Leather Jacket",
    imageUrl: unsplash("photo-1551028719-00167b16eac5"),
    category: "outerwear",
    color: "#1c1c1c",
    colorName: "black",
    tags: ["streetwear", "party", "casual"],
    seasons: ["fall", "winter"],
  }),
  demo({
    name: "White Leather Sneakers",
    imageUrl: unsplash("photo-1549298916-b41d501d3772"),
    category: "shoes",
    color: "#f2f1ee",
    colorName: "white",
    tags: ["casual", "streetwear", "athleisure"],
    seasons: ["spring", "summer", "fall"],
  }),
  demo({
    name: "Black Ankle Boots",
    imageUrl: unsplash("photo-1543163521-1bf539c55dd2"),
    category: "shoes",
    color: "#221f1e",
    colorName: "black",
    tags: ["work", "casual", "formal"],
    seasons: ["fall", "winter"],
  }),
  demo({
    name: "Tan Leather Tote",
    imageUrl: unsplash("photo-1590874103328-eac38a683ce7"),
    category: "bag",
    color: "#a97e50",
    colorName: "beige",
    tags: ["work", "casual"],
    seasons: ["spring", "summer", "fall", "winter"],
  }),
  demo({
    name: "Gold Layered Necklace",
    imageUrl: unsplash("photo-1599643478518-a784e5dc4c8f"),
    category: "accessory",
    color: "#d4af37",
    colorName: "yellow",
    tags: ["party", "date night", "formal"],
    seasons: ["spring", "summer", "fall", "winter"],
  }),
  demo({
    name: "Emerald Slip Dress",
    imageUrl: unsplash("photo-1566174053879-31528523f8ae"),
    category: "dress",
    color: "#1e5945",
    colorName: "dark green",
    tags: ["party", "formal", "date night"],
    seasons: ["summer", "fall"],
    wishlist: true,
    price: 128,
    notes: "Saw this in the Reformation sale — waiting for restock in M.",
  }),
  demo({
    name: "Suede Loafers",
    imageUrl: unsplash("photo-1614252235316-8c857d38b5f4"),
    category: "shoes",
    color: "#8b5e3c",
    colorName: "dark orange",
    tags: ["work", "minimal"],
    seasons: ["spring", "fall"],
    wishlist: true,
    price: 90,
  }),
];
