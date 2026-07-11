# Features

## Today (default home)

Weather-aware outfit suggestions via Open-Meteo + geolocation. One-tap **I wore this**, edit in builder, or save.

**Component:** `TodayView.tsx` · **Logic:** `src/lib/weather.ts`, `generateOutfit`

## Item management

Add clothing with name, image URL (or upload), category, color, tags, seasons, brand, price, and notes.

- **AI auto-tag** on upload (`/api/analyze` + Gemini) pre-fills fields
- **Background removal** (client WASM `@imgly/background-removal`) for clean cutouts
- **Wear logging** from item cards (increments `wearCount` / `lastWornAt`)

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

## Saved outfits, calendar & wishlist

- **Outfits** — save looks; **I wore this** logs wear (`OutfitsView.tsx`)
- **Calendar** — plan outfits + worn history (`CalendarView.tsx`)
- **Wishlist** — mindful-buying gate (similar owned items + cost-per-wear) + affiliate links (`WishlistView.tsx`, `src/lib/affiliate.ts`)

## Travel mode

Create a trip → pack items → auto capsule outfits.

**Component:** `TravelView.tsx`

## Export & share

- Download outfit as PNG (`html-to-image`)
- Copy shareable link (`ShareLinkLoader.tsx`)

## Auth & sync

Supabase email/password + cloud snapshot sync (items, outfits, trips, calendar, profile). See [[Supabase sync]].

## PWA push (opt-in)

Morning outfit nudge + Sunday plan reminder. Settings → Notifications. Needs VAPID + cron env vars.

## Theme

Dark/light mode persisted in localStorage (`ThemeEffect.tsx`).
