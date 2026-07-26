# Features

Last updated: 2026-07-25

## Product wedge

**Shopping copilot** — capture a temptation → closet-aware Smart Buy verdict → log bought / skipped / wait → **Decision bank** (savings) on Insights. See [[Research synthesis — next moves]] and Linear AJA-190–192.

## Explore (native default after onboarding)

For-you feed: daily looks, Rediscover, shop picks, challenges, sample-closet / activation banners. Shop tab uses SerpAPI Google Shopping with department/gender filters (`shopGender`).

**Components:** `ExploreView.tsx`, `explore/ExploreForYouHeader.tsx` · Shop APIs under `/api/shop/*`

## Closet & items

Add clothing with name, image (upload / camera / share-in), category, color, tags, seasons, brand, price, fit, notes.

- **AI auto-tag** (`/api/analyze` + Gemini)
- **Background removal** — `@imgly/background-removal` or `/api/cutout`
- **Beautify** — Gemini packshot / sticker (`/api/beautify`)
- **Fetch details** from product URL (`/api/extract`) — social-preview bot UA fallback for bot-walled retailers (AJA-201)
- **Find product online** — photo → shop links (AJA-79); see [[Photo to product]]
- **Whole-outfit detect** / multi-garment split
- **Sample closet** — labeled SAMPLE items for first-run; clear / “Add my clothes” (AJA-198/199)
- **Wear logging** (`wearCount` / `lastWornAt`)
- **Brand picker** + **currency** + **fit picker** (AJA-176)
- **Native:** Take photo via Capacitor Camera; Share Extension image → add form ([[Share Extension]])

**Tabs:** Items / Wishlist / Shared (Shared still “Coming soon” placeholder — Share Closet UI entry gap, AJA-179 / AJA-192)

**Components:** `ItemForm.tsx`, `ItemCard.tsx`, `WardrobeView.tsx`, `BrandPicker.tsx`, `FindProductSheet.tsx`

## Capture (temptation → app)

- **Browser clipper** — Chrome/Edge MV3 → `/api/clip` ([[Browser extension]])
- **iOS Share Extension** — Share → Wardrobe (links → wishlist; images → add form) ([[Share Extension]], AJA-201)
- **Web Share Target** — PWA/Android `manifest` → `/n?clipUrl=…`
- **Deep link:** `app.wardrobe.personal://share?url=` / `?type=image`

## Smart Buy & decision loop

- **Smart Buy** — buy / maybe / skip vs closet (`SmartBuy.tsx`, `src/lib/smart-buy.ts`)
- **Outcome capture** — I bought it / I skipped it / wait → `decision` events (`src/lib/decisions.ts`, AJA-190)
- **Decision bank** — savings + counts on Insights (`/api/decisions/summary`)

Still open: auto-verdict on share capture (AJA-191); private decision councils (AJA-192).

## Outfit builder & try-on

Drag-and-drop / click into layer slots; color harmony; PNG export.

**Try it on me** — Gemini `/api/tryon` (env-gated). FASHN upgrade AJA-21 budget-blocked.

## AI stylist

Closet-grounded chat (`/api/stylist/chat`): dress me, style anchor, **buy_advice**, forgotten, stats, pack, compare. Deterministic tools + short Gemini narration. Pinned in Messages.

## Saved outfits, calendar & wishlist

- Outfits + wear log · Calendar · Wishlist (mindful gate + affiliate hooks)

## Insights

Category mix, value, usage %, CPW, most/never worn, **Decision bank**.

## Travel / Pack with friends

Server-backed trips: members, invites, Your bag / Everyone, realtime sync, `trip_invite` notifications (`TravelView.tsx`, `src/lib/trips.ts`).

## Export & share

- Outfit PNG / share link
- **Share Closet** — backend + guest page exist; Closet redesign entry currently unwired — see [[Share Closet]]

## Social

Public `/u/[handle]`; in-app profiles; followers/following; posts; human DMs + Stylist. Validated `@handle` onboarding (AJA-195). Find-friends / follow-back fixes (AJA-196).

## Auth & sync

- Email/password + snapshot sync ([[Supabase sync]])
- **Google + Apple OAuth** — system-browser flow (AJA-194, In Progress; needs provider dashboards)
- **Delete account** in-app (AJA-197, Apple 5.1.1(v))

## Onboarding + style quiz

Goal → gender/shop → occasions → style lean → username/handle → snapshot → Enter. Lands on **Explore**. Sample closet + activation empty-state after clear. Skip anytime.

## Habit + notifications

Local habit strip; web push (env); native local reminders. Remote APNs later.

## Theme / prefs / support

Dark/light; App starts in; Rate / Share app / Feedback (AJA-55/56).

## Native chrome (Capacitor)

Bottom tabs: **Explore · Closet · ＋ Create · Outfits · Profile**. Create sheet for add paths. Website keeps top-nav. See [[iOS Capacitor]].

## Related

- [[Phase 0-1 status]]
- [[Share Extension]]
- [[Browser extension]]
- [[Photo to product]]
- [[Share Closet]]
- [[Architecture]]
- [[Data model]]
- [[Linear]]
