# Outfits → "My looks" library — design

**Date:** 2026-07-27 · **Status:** approved, pending implementation plan
**Scope:** the native **Outfits** tab (`src/components/OutfitsView.tsx`)

---

## Why

The Outfits tab is the app's weakest main screen. Audit findings:

1. **The score is misleading.** The "88%" comes from `outfitScore` → `scoreOutfit(colors)` ([matching.ts:525](../../../src/lib/matching.ts), [color.ts:118](../../../src/lib/color.ts)) — **item colours only**, ~7 possible values, and `88` is literally the hard-coded *neutral pairing* bucket, so most real outfits score exactly 88. The app's richer `ScoredLook` (7 weighted signals + `reasons[]`) is used by Today/Calendar/Stylist but not here.
2. **The composed board is never shown.** `Outfit.layout` + `canvasBg` are saved, but both thumbnails render a 2×2 grid capped at 4 items, so a 6-piece look shows 4 and the canvas the user arranged is discarded.
3. **"Featured" is arbitrary** — max colour score, no context, reshuffles as data changes.
4. **No findability.** No search, filter, sort, grouping or favourites; a flat reverse-chronological 2-col grid. No "which outfits use this jacket?".
5. **No detail screen.** Tapping a card does nothing. `notes` exists, is written as `""` by every caller, and is never rendered. Per-outfit wear history *is* derivable from `calendar` but nothing shows it.
6. **No lifecycle actions** — no rename, duplicate, favourite, or plan-to-a-date; delete is one tap with no confirmation.
7. **"THIS WEEK" is a foreign body** — three links into Calendar/Travel/Insights plus a server trip fetch and week math, rendering even above the empty state, in a 491-line component whose outfit responsibilities are ~100 lines.

**Decisions taken with the user:** the page's job is a **looks library** (Today owns "what do I wear now", Calendar owns planning); finding is via **smart auto-collections + favourites** (no manual tagging); cards show **wear history**, not a match score; **layout A** (chips + gallery grid).

**Outcome:** a library you can browse, search and reuse, that finally shows the looks you actually composed.

---

## Design

### 1. Layout (A — chips + gallery grid)

Top to bottom: **`+ New look`** → **search** → **scrollable collection chips** → **2-col gallery grid**.

Chips mirror the Closet's existing tabs + sub-chip pattern so the two main tabs feel like one app. Only chips with matches render (same principle as `presentSubcategories`).

**"THIS WEEK" is deleted**, with its `Trips.listTrips()` fetch and week math. Verified non-stranding: Travel → You ▸ "Packing & trips"; Insights → You ▸ "Style stats", ProfileMenu, Explore header; Calendar → native header icon + You ▸ "Calendar".

The **Featured hero is removed** — its selection was arbitrary, and it hid the inconsistency that only grid cards could be deleted.

### 2. Board thumbnails

Each card renders the **real composition** from `layout` + `canvasBg`, scaled into the card: every piece at its saved `x/y/width/height/rotation/zIndex/flipped`, in board coordinates normalised to the thumbnail box. Outfits without a layout (samples, stylist saves, `RediscoverModal`) keep the existing auto-stack fallback.

Extracted as **`OutfitBoardThumb`** so Calendar, chat share cards and any future surface can render a look the same way.

### 3. Outfit detail (new view `outfitDetail`)

Full board · inline rename · piece list (tap → that item) · **wear history** from `calendar.filter(e => e.outfitId === id)` · **notes** (finally surfaced) · actions: **Wore it · Plan to a date · Duplicate · ☆ Favourite · Edit board · Share · Delete (with confirmation)**.

Adds `"outfitDetail"` to the `View` union (`store.ts:66-89`) and a `pendingOutfitId`-style selection, following the existing `pendingOpenItemId` pattern.

### 4. Collections — derived, zero upkeep

New **`src/lib/outfit-collections.ts`**, pure functions over an outfit + its resolved items:

| Chip | Derived from |
|---|---|
| All | — |
| ☆ Favourites | `outfit.favorite` |
| Work / Casual | member items' `formality` |
| Warm / Cold | member items' `seasons` |
| Never worn | `!wearCount` |
| Recently worn | `lastWornAt` within 30 days |

No manual tagging: items already carry `formality`, `seasons` and `tags`. Search matches outfit name + member item names/brands.

### 5. Data model — one new field

```ts
favorite?: boolean;   // Outfit, src/lib/types.ts
```

**Must be whitelisted in `normalizeOutfit` (`store.ts:379`)** or it is silently stripped on every reload/sync — the exact trap AJA-223 hit. Everything else (collections, counts, cost-per-wear) is derived at render time. New store action `toggleOutfitFavorite(id)`.

### 6. Architecture

Split the 491-line component:

| Unit | Responsibility |
|---|---|
| `OutfitsView` | library screen: search + chips + grid, empty state |
| `OutfitCard` | one look: board thumb, name, wear line, ☆ |
| `OutfitBoardThumb` | renders a saved layout at any size (reusable) |
| `OutfitDetailView` | the detail screen + its actions |
| `lib/outfit-collections.ts` | pure derivation + search predicates |

**Reused unchanged:** `loadOutfitBoardIntoCanvas`, `logWear`, `deleteOutfit`, `saveOutfit`, `ShareToChatSheet` + `outfitPayload`, `computeInsights`.

### 7. Error / edge handling

- Missing item ids in `itemIds` are already dropped at render; the thumb must not crash on a `layout` referencing a deleted item.
- Empty state: no outfits → a single centred prompt (no chips, no search).
- Deleting still orphans `calendar` history (`deleteOutfit` nulls `outfitId`) — unchanged, but delete now requires confirmation.
- Duplicate deep-copies `layout` so editing the copy can't mutate the original.

---

## Out of scope

Collaborative "friend styles you" (separate track), and the other audit gaps: laundry/availability, outfit polls, public outfit share links, saving Travel capsules / ShareCloset replies as outfits, "outfits containing item X" from the item screen.

---

## Verification

- `npx tsc --noEmit`, `npm run build`, `npx eslint` on changed files — clean.
- **Working hosted prototype approved before implementation** (static files render JS-disabled on the user's device → deploy to `public/` and share the live URL).
- On-device (native tab, not exercisable in the preview harness): boards render as composed; chips filter correctly and only appear when non-empty; search finds by look and item name; ☆ persists across a full app restart (proves the `normalizeOutfit` whitelist); detail screen actions all work; delete asks first.
