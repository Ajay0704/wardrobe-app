# Features

Last updated: 2026-07-16

## Today (default home)

Weather-aware outfit suggestions via Open-Meteo + geolocation (Capacitor Geolocation on iOS; city fallback from profile location). One-tap **I wore this**, edit in builder, or save.

**Component:** `TodayView.tsx` · **Logic:** `src/lib/weather.ts`, `generateOutfit`

## Item management

Add clothing with name, image URL (or upload), category, color, tags, seasons, brand, price, and notes.

- **AI auto-tag** on upload (`/api/analyze` + Gemini) pre-fills fields
- **Background removal** — client WASM `@imgly/background-removal`, or garment-only SegFormer via `/api/cutout` when `NEXT_PUBLIC_REMOVAL_ENGINE=garment`
- **Beautify** — Gemini packshot polish (`/api/beautify` + refine) for clean product-style photos
- **Fetch details** from a product URL (`/api/extract`) — name, photo, brand, price
- **Find product online** — closet photo → shop links via SerpAPI / SearchApi (`/api/find-product`); see [[Photo to product]]
- **Wear logging** from item cards (increments `wearCount` / `lastWornAt`)
- **Brand picker** (searchable) + **currency** from Settings (formats prices / Insights)
- **Native only:** **Take photo** via Capacitor Camera plugin (not HTML capture — that flashes and exits in WKWebView)

**Components:** `ItemForm.tsx`, `ItemCard.tsx`, `WardrobeView.tsx`, `BrandPicker.tsx`, `FindProductSheet.tsx` · **Logic:** `src/lib/brands.ts`, `src/lib/currency.ts`, `src/lib/beautify.ts`

## Outfit builder

Drag-and-drop or click-to-add into layer slots:

- tops, bottoms, dress, outerwear, shoes, accessories

**Component:** `OutfitBuilderView.tsx`

## Virtual try-on

**Try it on me** in the builder — person photo + garment images → full-body studio result via Gemini (`/api/tryon`). Needs `GEMINI_API_KEY`. Planned upgrade: FASHN VTON (AJA-21, budget-blocked).

## AI stylist chat

Conversational styling help (`/api/stylist/chat`) with wardrobe-aware replies and attach-a-piece sheet.

**Components:** `src/components/stylist/*`

## Live preview & harmony

Stacked outfit preview with a color harmony score (complementary, analogous, clash).

**Components:** `OutfitPreview.tsx` — logic in `src/lib/color.ts`

## Smart matching

"Generate outfit" engine based on color rules and category slots.

**Logic:** `src/lib/matching.ts`

## Saved outfits, calendar & wishlist

- **Outfits** — save looks; **I wore this** logs wear (`OutfitsView.tsx`)
- **Calendar** — plan outfits + worn history (`CalendarView.tsx`); friendly dates via `formatDisplayDate`
- **Wishlist** — mindful-buying gate (similar owned items + cost-per-wear) + affiliate links (`WishlistView.tsx`, `src/lib/affiliate.ts`)
- **Smart Buy** — opt-in closet-fit sheet (wear-based CPW, tag/season scoring); never expands inline on mobile (`SmartBuy.tsx`, `src/lib/smart-buy.ts`)
- **Browser clipper** — Chrome/Edge MV3: icon / right‑click / ⌥⇧W / on-page Save → `POST /api/clip` (see [[Browser extension]])

## Insights

Closet analytics: category mix, wardrobe value, usage %, cost-per-wear, most/never worn, recently added.

**Component:** `InsightsView.tsx` · entry via web profile menu or native **You** hub

## Travel mode

Create a trip → pack items → auto capsule outfits.

**Component:** `TravelView.tsx`

## Export & share

- Download outfit as PNG (`html-to-image`)
- Copy shareable link (`ShareLinkLoader.tsx`)
- **Share Closet** — pick up to 8 items + a question → public guest page for replies (`ShareClosetSheet.tsx`, `/share/closet/[id]`). See [[Share Closet]].

## Explore feed

Native **Explore** tab — product / social feed (`/api/explore/feed` + cron ingest). Affiliate-ready (eBay / Skimlinks when keys set).

## Auth & sync

Supabase email/password + cloud snapshot sync (items, outfits, trips, calendar, profile). See [[Supabase sync]].

## Onboarding + style quiz (first run)

Research-backed quiz (see [[Onboarding quiz research]]): **goal → occasions → style lean → “we get you” snapshot → Enter Wardrobe**. Activation is on **empty Today** (ambient “2 for a look”), not a fifth wizard step. Answers map to `styleVibes` for Today / Builder. Editable under Settings → Preferences. Skip anytime.

**AJA-35 still open** — first-win activation UX (bulk/gallery path, etc.) not fully done.

## Weekly habit + notifications (opt-in)

- **Local habit strip** on Today (`src/lib/habit.ts`): days opened, outfits saved, wears logged this ISO week — privacy-first, no server.
- **Website / PWA:** web push (morning + Sunday) via Settings → Notifications. Needs signed-in session + VAPID/cron env.
- **Native iOS app:** on-device local reminders (7am daily + Sunday 10am) via `@capacitor/local-notifications` — same Settings entry. Remote APNs later (needs paid Apple Developer Program).

## Theme

Dark/light mode persisted in localStorage (`ThemeEffect.tsx`).

## App starts in

Settings → Preferences → **App starts in** (`profile.startView`). Launch opens that screen (Today by default) instead of the last-visited tab. Syncs with the profile snapshot.

## Support (Settings)

- **Rate the app** — App Store write-review URL when `NEXT_PUBLIC_IOS_APP_ID` is set (AJA-55)
- **Share the app** — native share sheet (`@capacitor/share`) or copy link (AJA-55)
- **Send feedback** / **Feature request** — mailto to `NEXT_PUBLIC_SUPPORT_EMAIL` (AJA-56)

## Native app chrome (Capacitor)

Bottom tabs: **Explore · Closet · ＋ Create · Outfits · Home**. Profile / social via header avatar. Wishlist, Packing, Insights, Calendar, Settings reachable from create sheet / profile. Website keeps top-nav chrome. See [[iOS Capacitor]].

## Related

- [[Phase 0-1 status]]
- [[Browser extension]]
- [[Photo to product]]
- [[Share Closet]]
- [[Architecture]]
- [[Data model]]
