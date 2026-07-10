# Features

## Item management

Add clothing with name, image URL (or upload), category, color, tags, seasons, brand, price, and notes.

**Components:** `ItemForm.tsx`, `ItemCard.tsx`, `WardrobeView.tsx`

## Outfit builder

Drag-and-drop or click-to-add into layer slots:

- tops, bottoms, dress, outerwear, shoes, accessories

**Component:** `OutfitBuilderView.tsx`

## Live preview & harmony

Stacked outfit preview with a color harmony score (complementary, analogous, clash).

**Components:** `OutfitPreview.tsx` — logic in `src/lib/color.ts`

## Smart matching

"Generate outfit" engine based on color rules and category slots.

**Logic:** `src/lib/matching.ts`

## Saved outfits & wishlist

- **Outfits** — name and save favorite looks (`OutfitsView.tsx`)
- **Wishlist** — track items to buy (`WishlistView.tsx`)

## Export & share

- Download outfit as PNG (`html-to-image`)
- Copy shareable link (`ShareLinkLoader.tsx`)

## Auth & sync

Optional Supabase anonymous auth + cloud sync. See [[Supabase sync]].

## Theme

Dark/light mode persisted in localStorage (`ThemeEffect.tsx`).
