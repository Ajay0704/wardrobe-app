# UI Audit — Your Personal Wardrobe

_Generated 2026-10-24 by `figma-export/scripts/report.mjs` from 81 captures and a scan of 265 source files under `src/`._

## Summary — what to fix in the redesign

The foundation is good: 9 semantic colour tokens with real light/dark values, 2 typefaces, and ~1,900 uses of the token classes. The drift is in what sits *around* those tokens:

1. **No status colours in the system.** Errors, warnings and success states use Tailwind's raw palette directly — `text-red-600` / `text-red-400` / `bg-red-500/10`, `text-amber-600`, `text-emerald-600` — with separate hand-picked shades per theme. That's 214 of the 385 default-palette uses. **Add `danger`, `warning`, `success` (+ `-soft` fills) as tokens** with light/dark modes, like `accent` / `accent-soft`.
2. **Overlay-on-photo colours are untokenised.** `text-white`, `text-white/70`, `bg-white/10`, `bg-black/…` on imagery (Explore, Photo detail, How-it-works) — the other 165 palette uses. Define an `on-media` / `scrim` pair.
3. **Typography has no scale — it has 30 sizes.** 12px and 14px carry most UI, but there are also 9, 9.5, 10, 10.5, 11, 11.2, 11.5, 12.5, 13, 13.5, 14.5, 15, 15.2, 16.8, 19, 21, 22, 25, 26, 34px. `text-[11px]` alone is used 82 times — it's a de-facto *caption* step that the design system doesn't name. **Proposed scale:** 11 caption · 12 footnote · 14 body · 16 callout/input · 18 · 20 · 24 · 30 — fold everything else into the nearest step.
4. **Half-steps break the 4px grid.** 420 off-grid spacing uses, almost all Tailwind half-steps: `gap-1.5` (6px, 94×), `py-2.5` (10px, 54×), `py-1.5`, `gap-2.5`, `px-3.5` (14px). Decide whether 6/10/14 are intentional (then make them tokens — they're in `figma-tokens.json` because they're common) or snap them to 4/8/12/16.
5. **Rogue grey ramp.** `#a8a29e` (Tailwind stone-400) is hard-coded in 6 components as a placeholder/icon grey, alongside `#9c988e`, `#808080`, `#57534e` — four greys that are neither `muted` nor `line`. They don't change in dark mode.
6. **Feature palettes living in components.** Insights' donut chart (7 pastel hexes, `InsightsView.tsx:14-20`), the builder's board backgrounds and highlight colours (`CanvasBuilderView.tsx:105-119`), PhotoDetail's pink/blue badges, and the dark marketing background `#0b0d11` (repeated in 4 files). Promote to `chart.1–7`, `canvas.bg.*`, and `marketing.bg` tokens so they're themeable and visible in Figma.
7. **Radius is close to a system** — 12 / 16 / pill dominate. One-offs at 10, 14, 18, 22, 30px (the native dock and sheet) are worth naming (`dock`, `sheet`) or rounding.
8. **Two type stacks on mobile.** Web uses Geist; the native shell (`.native-shell`) switches to SF Pro. Screens in `*-mobile.png` are therefore set in SF Pro — design the iOS frames in SF Pro, the web frames in Geist.
9. **Motion is coherent** — one standard ease (`0.22, 1, 0.36, 1`), a spring for canvas pieces, an iOS sheet curve — and every animation respects `prefers-reduced-motion`. Keep as-is; it's in the tokens.

### Legitimate, not rogue

- `OAuthButtons.tsx` hexes are Google's brand colours — leave hard-coded.
- 78 hex values in `src/lib/` and `src/app/api/` are garment colour palettes and colour-naming data — product data, excluded from the counts above.

### Capture notes

- **Mobile = the native iOS shell** (floating dock, SF Pro), forced via `localStorage["wardrobe:native-shell"]`. Desktop = web shell. Home/Today is web-only (retired in the native shell, AJA-169); the Create sheet and Social tab are native-only.
- **Signed-in, seeded, offline.** The export runs this worktree's dev server without Supabase configured, seeds the persisted zustand store with fixture data (`scripts/seed.mjs`: 12 owned pieces + 4 wishlist, real product photos, 7 looks, 13 calendar entries) and sets a mock `authUser`. With Supabase unconfigured, nothing syncs anywhere. The public pages (`/u/[handle]`, `/share/closet/[id]`) get stubbed API responses.
- **Cloud-only screens show their empty state.** Travel (trips), Notifications and Messages read from Supabase tables, not the local store, so they render "nothing yet"; the in-app Social profile shows 0 posts/followers for the same reason (the *public* profile `/u/mayachen` is stubbed and populated). The Builder canvas opens empty by design. These are still useful as empty-state references; populating them would need the Supabase stub described in the project notes. Explore, Today, Insights, Calendar and every closet/wishlist/outfit screen are fully populated from the local store.
- **Photo detail** calls `/api/detect` (AI garment detection), which 500s locally without an API key — the screen renders, minus detected-item chips.

### Bug found while capturing

- **Nested `<button>` on the You screen** — [`src/components/YouView.tsx:412`](../src/components/YouView.tsx): the "Outfit reminders" `<Toggle>` (a `<button role="switch">`) is rendered inside the settings row, which is itself a `<button>`. React logs a hydration error on every load of You, and a tap on the switch also fires the row's click. Worth fixing in code regardless of the redesign; in the redesign, make rows with trailing controls non-interactive containers.
- **Not captured:** the signed-out *web* landing (`AuthLanding`) only renders when Supabase *is* configured, and Chat / other-user profile / style session need live ids. Use `/first-run-preview` (native signed-out journey) and `/how-it-works` (marketing) as the signed-out references.

---

## 1. Captured screens

42 screens/states · 81 captures. Every PNG is 2× (`deviceScaleFactor: 2`), full height. Mobile renders the **native iOS shell** (bottom dock) that TestFlight users see; desktop renders the **web shell** (top nav). Data is the seeded fixture closet in `scripts/seed.mjs` (16 real product photos, 7 looks, 13 calendar entries) — no account or production data.

| # | Screen | Reached via | Desktop 1440 (web) | Mobile 390 (iOS shell) | Notes |
|---|---|---|---|---|---|
| 01 | First-run journey (signed-out native) | `/first-run-preview` | [png](screens/01-first-run-desktop.png) · [html](html/01-first-run-desktop.html) 608 KB | [png](screens/01-first-run-mobile.png) · [html](html/01-first-run-mobile.html) 608 KB |  |
| 02 | How it works (marketing) | `/how-it-works` | [png](screens/02-how-it-works-desktop.png) · [html](html/02-how-it-works-desktop.html) 714 KB | [png](screens/02-how-it-works-mobile.png) · [html](html/02-how-it-works-mobile.html) 712 KB |  |
| 03 | Home / Today | `{"view":"today"}` | [png](screens/03-home-today-desktop.png) · [html](html/03-home-today-desktop.html) 1393 KB | — |  |
| 04 | Explore feed | `{"view":"explore"}` | [png](screens/04-explore-desktop.png) · [html](html/04-explore-desktop.html) 1878 KB | [png](screens/04-explore-mobile.png) · [html](html/04-explore-mobile.html) 1930 KB |  |
| 05 | Explore photo detail | `{"view":"photoDetail","photoCard":{"id":"fx-photo","image":"/hero-poster.jpg","title":"Soft tailoring for fall"}}` | [png](screens/05-photo-detail-desktop.png) · [html](html/05-photo-detail-desktop.html) 724 KB | [png](screens/05-photo-detail-mobile.png) · [html](html/05-photo-detail-mobile.html) 741 KB | ⚠ 500 /api/detect; Failed to load resource: the server responded with a status of 500 (Internal Server Error) |
| 06 | Closet grid | `{"view":"wardrobe","wardrobeTab":"items"}` | [png](screens/06-closet-desktop.png) · [html](html/06-closet-desktop.html) 2247 KB | [png](screens/06-closet-mobile.png) · [html](html/06-closet-mobile.html) 1809 KB |  |
| 07 | Closet item detail | `{"view":"wardrobe","pendingOpenItemId":"fx-camel-sweater"}` | [png](screens/07-closet-item-detail-desktop.png) · [html](html/07-closet-item-detail-desktop.html) 2585 KB | [png](screens/07-closet-item-detail-mobile.png) · [html](html/07-closet-item-detail-mobile.html) 2096 KB |  |
| 08 | Closet · Wishlist tab | `{"view":"wardrobe","wardrobeTab":"wishlist"}` | [png](screens/08-closet-wishlist-tab-desktop.png) · [html](html/08-closet-wishlist-tab-desktop.html) 1093 KB | [png](screens/08-closet-wishlist-tab-mobile.png) · [html](html/08-closet-wishlist-tab-mobile.html) 995 KB |  |
| 09 | Create (+) sheet | `{"view":"wardrobe","addSheetOpen":true}` | — | [png](screens/09-create-sheet-mobile.png) · [html](html/09-create-sheet-mobile.html) 1883 KB |  |
| 10 | Add item modal | `{"view":"wardrobe","addOpen":true,"addIntent":null}` | [png](screens/10-add-item-desktop.png) · [html](html/10-add-item-desktop.html) 2462 KB | [png](screens/10-add-item-mobile.png) · [html](html/10-add-item-mobile.html) 1988 KB |  |
| 11 | Add item · paste link | `{"view":"wardrobe","addOpen":true,"addIntent":"link"}` | [png](screens/11-add-item-link-desktop.png) · [html](html/11-add-item-link-desktop.html) 2486 KB | [png](screens/11-add-item-link-mobile.png) · [html](html/11-add-item-link-mobile.html) 2012 KB |  |
| 12 | Bulk import | `{"view":"wardrobe","bulkOpen":true}` | [png](screens/12-bulk-import-desktop.png) · [html](html/12-bulk-import-desktop.html) 2283 KB | [png](screens/12-bulk-import-mobile.png) · [html](html/12-bulk-import-mobile.html) 1845 KB |  |
| 13 | Shared closets sheet | `{"view":"wardrobe","closetsOpen":true}` | [png](screens/13-shared-closets-desktop.png) · [html](html/13-shared-closets-desktop.html) 2604 KB | [png](screens/13-shared-closets-mobile.png) · [html](html/13-shared-closets-mobile.html) 2166 KB |  |
| 14 | Outfit builder canvas | `{"view":"builder"}` | [png](screens/14-builder-desktop.png) · [html](html/14-builder-desktop.html) 1948 KB | [png](screens/14-builder-mobile.png) · [html](html/14-builder-mobile.html) 1969 KB |  |
| 15 | Outfits library | `{"view":"outfits"}` | [png](screens/15-outfits-desktop.png) · [html](html/15-outfits-desktop.html) 2493 KB | [png](screens/15-outfits-mobile.png) · [html](html/15-outfits-mobile.html) 2544 KB |  |
| 16 | Outfit detail | `{"view":"outfitDetail","selectedOutfitId":"fx-o-weekend"}` | [png](screens/16-outfit-detail-desktop.png) · [html](html/16-outfit-detail-desktop.html) 1209 KB | [png](screens/16-outfit-detail-mobile.png) · [html](html/16-outfit-detail-mobile.html) 1228 KB |  |
| 17 | AI stylist | `{"view":"stylist"}` | [png](screens/17-stylist-desktop.png) · [html](html/17-stylist-desktop.html) 697 KB | [png](screens/17-stylist-mobile.png) · [html](html/17-stylist-mobile.html) 715 KB |  |
| 18 | Calendar / wear log | `{"view":"calendar"}` | [png](screens/18-calendar-desktop.png) · [html](html/18-calendar-desktop.html) 1629 KB | [png](screens/18-calendar-mobile.png) · [html](html/18-calendar-mobile.html) 1649 KB |  |
| 19 | Travel / packing | `{"view":"travel"}` | [png](screens/19-travel-desktop.png) · [html](html/19-travel-desktop.html) 661 KB | [png](screens/19-travel-mobile.png) · [html](html/19-travel-mobile.html) 678 KB |  |
| 20 | Wishlist | `{"view":"wishlist"}` | [png](screens/20-wishlist-desktop.png) · [html](html/20-wishlist-desktop.html) 1076 KB | [png](screens/20-wishlist-mobile.png) · [html](html/20-wishlist-mobile.html) 948 KB |  |
| 21 | Wishlist · Should I buy? | `{"view":"wishlist","pendingDecideItemId":"fx-white-oxford"}` | [png](screens/21-wishlist-should-i-buy-desktop.png) · [html](html/21-wishlist-should-i-buy-desktop.html) 1220 KB | [png](screens/21-wishlist-should-i-buy-mobile.png) · [html](html/21-wishlist-should-i-buy-mobile.html) 1092 KB |  |
| 22 | Add to wishlist sheet | `{"view":"wishlist","wishlistAddOpen":true}` | [png](screens/22-add-to-wishlist-desktop.png) · [html](html/22-add-to-wishlist-desktop.html) 1166 KB | [png](screens/22-add-to-wishlist-mobile.png) · [html](html/22-add-to-wishlist-mobile.html) 1038 KB |  |
| 23 | Insights | `{"view":"insights"}` | [png](screens/23-insights-desktop.png) · [html](html/23-insights-desktop.html) 1819 KB | [png](screens/23-insights-mobile.png) · [html](html/23-insights-mobile.html) 1839 KB |  |
| 24 | You hub | `{"view":"you"}` | [png](screens/24-you-desktop.png) · [html](html/24-you-desktop.html) 1016 KB | [png](screens/24-you-mobile.png) · [html](html/24-you-mobile.html) 1039 KB | ⚠ In HTML, %s cannot be a descendant of <%s>.
This will cause a hydration error.%s <button> button 

  ...
    <SegmentViewNode type="page" pa |
| 25 | Profile | `{"view":"profile"}` | [png](screens/25-profile-desktop.png) · [html](html/25-profile-desktop.html) 680 KB | [png](screens/25-profile-mobile.png) · [html](html/25-profile-mobile.html) 698 KB |  |
| 26 | Social profile (native tab) | `{"view":"social"}` | — | [png](screens/26-social-profile-mobile.png) · [html](html/26-social-profile-mobile.html) 752 KB |  |
| 27 | Notifications | `{"view":"notifications"}` | [png](screens/27-notifications-desktop.png) · [html](html/27-notifications-desktop.html) 640 KB | [png](screens/27-notifications-mobile.png) · [html](html/27-notifications-mobile.html) 658 KB |  |
| 28 | Messages | `{"view":"messages"}` | [png](screens/28-messages-desktop.png) · [html](html/28-messages-desktop.html) 661 KB | [png](screens/28-messages-mobile.png) · [html](html/28-messages-mobile.html) 678 KB |  |
| 29 | Fit & sizes | `{"view":"fitSizes"}` | [png](screens/29-fit-sizes-desktop.png) · [html](html/29-fit-sizes-desktop.html) 705 KB | [png](screens/29-fit-sizes-mobile.png) · [html](html/29-fit-sizes-mobile.html) 723 KB |  |
| 30 | Style & taste | `{"view":"styleTaste"}` | [png](screens/30-style-taste-desktop.png) · [html](html/30-style-taste-desktop.html) 761 KB | [png](screens/30-style-taste-mobile.png) · [html](html/30-style-taste-mobile.html) 781 KB |  |
| 31 | App & region settings | `{"view":"settingsApp"}` | [png](screens/31-settings-app-desktop.png) · [html](html/31-settings-app-desktop.html) 681 KB | [png](screens/31-settings-app-mobile.png) · [html](html/31-settings-app-mobile.html) 699 KB |  |
| 32 | Account settings | `{"view":"settingsAccount"}` | [png](screens/32-settings-account-desktop.png) · [html](html/32-settings-account-desktop.html) 651 KB | [png](screens/32-settings-account-mobile.png) · [html](html/32-settings-account-mobile.html) 669 KB |  |
| 33 | Settings · Profile | `{"view":"settings","settingsSection":"profile"}` | [png](screens/33-settings-desktop.png) · [html](html/33-settings-desktop.html) 721 KB | [png](screens/33-settings-mobile.png) · [html](html/33-settings-mobile.html) 731 KB |  |
| 34 | Settings · Preferences | `{"view":"settings","settingsSection":"preferences"}` | [png](screens/34-settings-preferences-desktop.png) · [html](html/34-settings-preferences-desktop.html) 761 KB | [png](screens/34-settings-preferences-mobile.png) · [html](html/34-settings-preferences-mobile.html) 772 KB |  |
| 35 | Settings · Notifications | `{"view":"settings","settingsSection":"notifications"}` | [png](screens/35-settings-notifications-desktop.png) · [html](html/35-settings-notifications-desktop.html) 681 KB | [png](screens/35-settings-notifications-mobile.png) · [html](html/35-settings-notifications-mobile.html) 690 KB |  |
| 36 | Closet grid (dark) | `{"view":"wardrobe"}` | [png](screens/36-closet-dark-desktop.png) · [html](html/36-closet-dark-desktop.html) 2262 KB | [png](screens/36-closet-dark-mobile.png) · [html](html/36-closet-dark-mobile.html) 1811 KB |  |
| 37 | Outfits library (dark) | `{"view":"outfits"}` | [png](screens/37-outfits-dark-desktop.png) · [html](html/37-outfits-dark-desktop.html) 2510 KB | [png](screens/37-outfits-dark-mobile.png) · [html](html/37-outfits-dark-mobile.html) 2550 KB |  |
| 38 | Explore feed (dark) | `{"view":"explore"}` | [png](screens/38-explore-dark-desktop.png) · [html](html/38-explore-dark-desktop.html) 1799 KB | [png](screens/38-explore-dark-mobile.png) · [html](html/38-explore-dark-mobile.html) 1932 KB |  |
| 39 | Public profile /u/[handle] | `/u/mayachen` | [png](screens/39-public-profile-desktop.png) · [html](html/39-public-profile-desktop.html) 1065 KB | [png](screens/39-public-profile-mobile.png) · [html](html/39-public-profile-mobile.html) 1065 KB |  |
| 40 | Shared closet /share/closet/[id] | `/share/closet/fx-share` | [png](screens/40-share-closet-desktop.png) · [html](html/40-share-closet-desktop.html) 1041 KB | [png](screens/40-share-closet-mobile.png) · [html](html/40-share-closet-mobile.html) 1041 KB |  |
| 41 | Shared item /i/[id] | `/i/fx-trench-coat?d=eyJuIjoiQmVsdGVkIFRyZW5jaCBDb2F0IiwiYiI6Ik1hbmdvIiwiaSI6Ii9zYW1wbGVzL3dvbWVuL3RyZW5jaC1jb2F0LXdoaXRlLnBuZyJ9` | [png](screens/41-item-share-desktop.png) · [html](html/41-item-share-desktop.html) 459 KB | [png](screens/41-item-share-mobile.png) · [html](html/41-item-share-mobile.html) 459 KB |  |
| 42 | Browser extension connect | `/extension/connect?ext=fxextension` | [png](screens/42-extension-connect-desktop.png) · [html](html/42-extension-connect-desktop.html) 598 KB | [png](screens/42-extension-connect-mobile.png) · [html](html/42-extension-connect-mobile.html) 598 KB |  |

## 2. Colour

**Token adoption:** 1937 uses of the 9 semantic token classes (`bg-surface`, `text-muted`, …) vs **385 uses of Tailwind's default palette** and **63 raw hex literals in UI code**.

### 2a. Rogue hex codes in UI code (40 distinct, 63 uses)

Hex values in components/pages that are not one of the 9 tokens. (78 more live in `src/lib/` and API routes — garment colour palettes, colour naming and sample data; that's product data, not styling, so it's excluded here.)

| Hex | Uses | Where |
|---|---|---|
| `#a8a29e` <span style="color:#a8a29e">■</span> | 7 | `src/components/SmartBuy.tsx:133,183`<br>`src/components/BulkImport.tsx:120`<br>`src/components/ItemForm.tsx:181`<br>+3 more |
| `#0b0d11` <span style="color:#0b0d11">■</span> | 4 | `src/components/landing/HowItWorksSection.tsx:26,66`<br>`src/app/how-it-works/page.tsx:6`<br>`src/components/AppShell.tsx:70` |
| `#f59e0b` <span style="color:#f59e0b">■</span> | 4 | `src/components/CanvasBuilderView.tsx:110,110,110,110` |
| `#d4537e` <span style="color:#d4537e">■</span> | 4 | `src/components/PhotoDetailView.tsx:337,337,474,474` |
| `#f6e9e2` <span style="color:#f6e9e2">■</span> | 3 | `src/components/CanvasBuilderView.tsx:112,115,117` |
| `#e4eef3` <span style="color:#e4eef3">■</span> | 3 | `src/components/CanvasBuilderView.tsx:112,115,118` |
| `#7c8a6f` <span style="color:#7c8a6f">■</span> | 2 | `src/components/CalendarView.tsx:45`<br>`src/components/explore/ExploreForYouHeader.tsx:96` |
| `#ef4444` <span style="color:#ef4444">■</span> | 2 | `src/components/CanvasBuilderView.tsx:105`<br>`src/components/CanvasPiece.tsx:76` |
| `#e6ece2` <span style="color:#e6ece2">■</span> | 2 | `src/components/CanvasBuilderView.tsx:112,116` |
| `#141310` <span style="color:#141310">■</span> | 2 | `src/components/proto/FirstRunJourney.tsx:295,305` |
| `#465a3b` <span style="color:#465a3b">■</span> | 1 | `src/components/CalendarView.tsx:426` |
| `#b05e3c` <span style="color:#b05e3c">■</span> | 1 | `src/components/CanvasBuilderView.tsx:105` |
| `#3b82f6` <span style="color:#3b82f6">■</span> | 1 | `src/components/CanvasBuilderView.tsx:105` |
| `#22c55e` <span style="color:#22c55e">■</span> | 1 | `src/components/CanvasBuilderView.tsx:105` |
| `#eab308` <span style="color:#eab308">■</span> | 1 | `src/components/CanvasBuilderView.tsx:105` |
| `#ec4899` <span style="color:#ec4899">■</span> | 1 | `src/components/CanvasBuilderView.tsx:105` |
| `#ece4d4` <span style="color:#ece4d4">■</span> | 1 | `src/components/CanvasBuilderView.tsx:112` |
| `#57534e` <span style="color:#57534e">■</span> | 1 | `src/components/CanvasBuilderView.tsx:119` |
| `#9ec5fe` <span style="color:#9ec5fe">■</span> | 1 | `src/components/InsightsView.tsx:14` |
| `#b197fc` <span style="color:#b197fc">■</span> | 1 | `src/components/InsightsView.tsx:15` |
| `#f7a8c4` <span style="color:#f7a8c4">■</span> | 1 | `src/components/InsightsView.tsx:16` |
| `#8ce99a` <span style="color:#8ce99a">■</span> | 1 | `src/components/InsightsView.tsx:17` |
| `#63e6be` <span style="color:#63e6be">■</span> | 1 | `src/components/InsightsView.tsx:18` |
| `#ffd43b` <span style="color:#ffd43b">■</span> | 1 | `src/components/InsightsView.tsx:19` |
| `#66d9e8` <span style="color:#66d9e8">■</span> | 1 | `src/components/InsightsView.tsx:20` |
| `#ffc107` <span style="color:#ffc107">■</span> | 1 | `src/components/OAuthButtons.tsx:15` |
| `#ff3d00` <span style="color:#ff3d00">■</span> | 1 | `src/components/OAuthButtons.tsx:16` |
| `#4caf50` <span style="color:#4caf50">■</span> | 1 | `src/components/OAuthButtons.tsx:17` |
| `#1976d2` <span style="color:#1976d2">■</span> | 1 | `src/components/OAuthButtons.tsx:18` |
| `#9c988e` <span style="color:#9c988e">■</span> | 1 | `src/components/PhotoDetailView.tsx:182` |
| `#e6f1fb` <span style="color:#e6f1fb">■</span> | 1 | `src/components/PhotoDetailView.tsx:453` |
| `#185fa5` <span style="color:#185fa5">■</span> | 1 | `src/components/PhotoDetailView.tsx:453` |
| `#4c5a41` <span style="color:#4c5a41">■</span> | 1 | `src/components/explore/ExploreForYouHeader.tsx:519` |
| `#111318` <span style="color:#111318">■</span> | 1 | `src/components/landing/HowItWorksSection.tsx:53` |
| `#808080` <span style="color:#808080">■</span> | 1 | `src/components/onboarding/FirstSixCapture.tsx:242` |
| `#e4dccf` <span style="color:#e4dccf">■</span> | 1 | `src/components/proto/FirstRunJourney.tsx:435` |
| `#b8ad9c` <span style="color:#b8ad9c">■</span> | 1 | `src/components/proto/FirstRunJourney.tsx:435` |
| `#d8cebd` <span style="color:#d8cebd">■</span> | 1 | `src/components/proto/FirstRunJourney.tsx:435` |
| `#a99f8d` <span style="color:#a99f8d">■</span> | 1 | `src/components/proto/FirstRunJourney.tsx:435` |
| `#cfe0c6` <span style="color:#cfe0c6">■</span> | 1 | `src/components/proto/FirstRunJourney.tsx:488` |

### 2b. Token colours re-typed as hex (25 uses)

These match a token today but are hard-coded, so they **don't switch in dark mode**.

| Hex | Uses | Where |
|---|---|---|
| `#ffffff` | 8 | `src/app/api/beautify/route.ts:34,133,136,146`<br>`src/components/CanvasBuilderView.tsx:105,112,890`<br>`src/lib/visual-embed-server.ts:83` |
| `#faf9f7` | 7 | `src/components/CanvasBuilderView.tsx:112,114,116,117…`<br>`src/app/layout.tsx:40`<br>`src/app/manifest.ts:11` |
| `#1c1917` | 6 | `src/components/CanvasBuilderView.tsx:105,112,119,921`<br>`src/lib/explore.ts:285,427` |
| `#131211` | 1 | `src/app/layout.tsx:41` |
| `#567a4a` | 1 | `src/app/manifest.ts:12` |
| `#f3f1ed` | 1 | `src/components/CanvasBuilderView.tsx:112` |
| `#e7e4de` | 1 | `src/components/CanvasBuilderView.tsx:114` |

### 2c. Tailwind default-palette classes (102 distinct, 385 uses)

Bypass the theme entirely. Mostly status colours (red/amber/emerald) and white-on-photo overlays.

| Class | Uses | Where |
|---|---|---|
| `text-white` | 48 | `src/components/ItemForm.tsx:897,979,1021,1034`<br>`src/components/landing/FirstLookHero.tsx:46,72,87,127`<br>+24 more |
| `text-red-600` | 35 | `src/components/AuthModal.tsx:270,355,435`<br>`src/components/TravelView.tsx:635,693,694`<br>+25 more |
| `text-red-400` | 21 | `src/components/AuthModal.tsx:270,355,435`<br>`src/components/SettingsView.tsx:325,633,690`<br>+12 more |
| `bg-red-500/10` | 15 | `src/components/AuthModal.tsx:270,355,435`<br>`src/components/DeleteAccountDialog.tsx:61`<br>+11 more |
| `bg-white` | 15 | `src/components/BeautifyCompare.tsx:54,79`<br>`src/components/ItemCard.tsx:163,296`<br>+9 more |
| `text-red-500` | 11 | `src/components/HandleField.tsx:106,110`<br>`src/components/ItemCard.tsx:140,194`<br>+7 more |
| `text-amber-600` | 11 | `src/components/shop/ProductFitOverlay.tsx:54,192,214`<br>`src/components/ItemForm.tsx:1503`<br>+7 more |
| `text-emerald-600` | 9 | `src/components/HandleField.tsx:104,110`<br>`src/components/shop/ProductFitOverlay.tsx:53,190`<br>+5 more |
| `text-white/70` | 8 | `src/components/AppShell.tsx:88,103`<br>`src/components/BeautifyCompare.tsx:49,62`<br>+4 more |
| `shadow-black/10` | 8 | `src/components/ItemForm.tsx:939,1009`<br>`src/components/BrandPicker.tsx:77`<br>+5 more |
| `text-amber-400` | 8 | `src/components/shop/ProductFitOverlay.tsx:54,192,214`<br>`src/components/TodayView.tsx:255`<br>+4 more |
| `text-emerald-400` | 7 | `src/components/shop/ProductFitOverlay.tsx:53,190`<br>`src/app/share/closet/[id]/page.tsx:177`<br>+4 more |
| `bg-white/10` | 7 | `src/components/BeautifyCompare.tsx:30,72`<br>`src/components/explore/ExploreForYouHeader.tsx:493,501`<br>+2 more |
| `text-white/60` | 6 | `src/components/landing/FirstLookHero.tsx:82,122`<br>`src/components/AppShell.tsx:97`<br>+3 more |
| `bg-white/20` | 6 | `src/components/landing/HowItWorksSection.tsx:55,56,57`<br>`src/components/BeautifyCompare.tsx:30`<br>+2 more |
| `border-red-200` | 6 | `src/components/OutfitDetailView.tsx:271,426`<br>`src/components/CanvasBuilderView.tsx:826`<br>+3 more |
| `text-amber-700` | 6 | `src/components/SmartBuy.tsx:278`<br>`src/components/TodayView.tsx:255`<br>+4 more |
| `bg-amber-500/10` | 5 | `src/components/SettingsView.tsx:488,494`<br>`src/app/extension/connect/page.tsx:115`<br>+2 more |
| `bg-red-500` | 5 | `src/components/OutfitDetailView.tsx:196,294`<br>`src/components/ItemCard.tsx:295`<br>+2 more |
| `bg-amber-500/15` | 5 | `src/components/shop/ProductFitOverlay.tsx:54,214`<br>`src/components/SmartBuy.tsx:278`<br>+2 more |
| `bg-black/30` | 4 | `src/components/BulkImport.tsx:232`<br>`src/components/CanvasBuilderView.tsx:1363`<br>+2 more |
| `bg-white/15` | 4 | `src/components/CalendarView.tsx:386,423`<br>`src/components/explore/ExploreForYouHeader.tsx:510,528` |
| `bg-white/95` | 4 | `src/components/CanvasBuilderView.tsx:855,872,1031,1058` |
| `bg-amber-500` | 4 | `src/components/CanvasBuilderView.tsx:985,993`<br>`src/components/TravelView.tsx:1001`<br>+1 more |
| `bg-black/45` | 4 | `src/components/ItemCard.tsx:193`<br>`src/components/ItemForm.tsx:897`<br>+2 more |
| `bg-black/40` | 4 | `src/components/ItemForm.tsx:979`<br>`src/components/YouView.tsx:450`<br>+2 more |
| `text-red-700` | 4 | `src/components/SettingsView.tsx:325,690`<br>`src/components/SyncBadge.tsx:43`<br>+1 more |
| `border-red-300/50` | 4 | `src/components/TravelView.tsx:633,693,694`<br>`src/components/ui.tsx:32` |
| `border-amber-500/30` | 3 | `src/components/SettingsView.tsx:488,494`<br>`src/app/extension/connect/page.tsx:115` |
| `bg-white/90` | 3 | `src/components/BeautifyCompare.tsx:79`<br>`src/components/ItemCard.tsx:163`<br>+1 more |

…and 72 more in `audit-data.json`.

### 2d. rgb()/rgba() literals (18 distinct)

| Value | Uses | Where |
|---|---|---|
| `rgba(239,68,68,0.10)` | 2 | `src/components/CanvasBuilderView.tsx:1010`<br>`src/components/CanvasPiece.tsx:75` |
| `rgba(248,113,113,0.6)` | 2 | `src/components/CanvasBuilderView.tsx:1011`<br>`src/components/CanvasPiece.tsx:76` |
| `rgba(28, 25, 23, 0.14)` | 1 | `src/app/globals.css:273` |
| `rgba(0, 0, 0, 0.22)` | 1 | `src/app/globals.css:314` |
| `rgba(0, 0, 0, 0.4)` | 1 | `src/app/globals.css:334` |
| `rgba(0, 0, 0, 0.25)` | 1 | `src/app/globals.css:351` |
| `rgba(0, 0, 0, 0.55)` | 1 | `src/app/globals.css:379` |
| `rgba(239,68,68,0.26)` | 1 | `src/components/CanvasPiece.tsx:75` |
| `rgba(0,0,0,0.30)` | 1 | `src/components/CanvasPiece.tsx:158` |
| `rgba(0,0,0,0.18)` | 1 | `src/components/CanvasPiece.tsx:159` |
| `rgba(0,0,0,.45)` | 1 | `src/components/ItemForm.tsx:1036` |
| `rgba(194,87,51,.14)` | 1 | `src/components/PhotoDetailView.tsx:240` |
| `rgba(0,0,0,.18)` | 1 | `src/components/PhotoDetailView.tsx:241` |
| `rgba(20,19,16,.2)` | 1 | `src/components/proto/FirstRunJourney.tsx:300` |
| `rgba(20,19,16,.86)` | 1 | `src/components/proto/FirstRunJourney.tsx:300` |
| `rgba(86,122,74,.18)` | 1 | `src/components/proto/FirstRunJourney.tsx:641` |
| `rgba(255,255,255,.85)` | 1 | `src/components/proto/FirstRunJourney.tsx:643` |
| `rgba(255,255,255,.5)` | 1 | `src/components/proto/FirstRunJourney.tsx:643` |

## 3. Typography

**30 distinct font sizes** in use. Tailwind's scale has 13 steps; anything not on it (or used once or twice) is drift.

| Size | Uses | On Tailwind scale? | Where (top) |
|---|---|---|---|
| 9px | 5 | **no** | `src/components/CanvasBuilderView.tsx:985,1254`<br>`src/components/RediscoverModal.tsx:103`<br>+2 more |
| 9.5px | 2 | **no** | `src/components/explore/ExploreForYouHeader.tsx:578,641` |
| 10px | 23 | **no** | `src/components/shop/ShopSearchView.tsx:83,97,157`<br>`src/components/CalendarView.tsx:295,448`<br>+14 more |
| 10.5px | 3 | **no** | `src/components/proto/FirstRunJourney.tsx:444,610,631` |
| 11px | 83 | **no** | `src/components/explore/ExploreForYouHeader.tsx:172,353,479,596…`<br>`src/components/ItemForm.tsx:809,947,1021,1045…`<br>+29 more |
| 11.2px | 1 | **no** | `src/app/globals.css:99` |
| 11.5px | 7 | **no** | `src/components/CanvasBuilderView.tsx:1141,1171,1188`<br>`src/components/YouView.tsx:311,392`<br>+2 more |
| 12px | 225 | yes | `src/components/explore/ExploreForYouHeader.tsx:343,360,422,484…`<br>`src/components/SettingsView.tsx:95,128,280,298…`<br>+63 more |
| 12.5px | 9 | **no** | `src/components/proto/FirstRunJourney.tsx:306,345,370,586…`<br>`src/components/CanvasBuilderView.tsx:1104`<br>+3 more |
| 13px | 21 | **no** | `src/components/CanvasBuilderView.tsx:902,906,1095,1203…`<br>`src/components/onboarding/FirstSixCapture.tsx:318,399,406`<br>+9 more |
| 13.5px | 7 | **no** | `src/components/proto/FirstRunJourney.tsx:363,414,459,480…` |
| 14px | 459 | yes | `src/components/explore/ExploreForYouHeader.tsx:349,419,430,440…`<br>`src/components/TravelView.tsx:519,534,552,635…`<br>+82 more |
| 14.5px | 6 | **no** | `src/components/proto/FirstRunJourney.tsx:315,336,514,531…`<br>`src/components/onboarding/FirstSixCapture.tsx:366` |
| 15px | 28 | **no** | `src/components/ItemForm.tsx:1248,1261,1306,1325…`<br>`src/components/PhotoDetailView.tsx:266,288,299,315`<br>+11 more |
| 15.2px | 3 | **no** | `src/app/globals.css:391,494,586` |
| 16px | 21 | yes | `src/components/proto/FirstRunJourney.tsx:305,327,419,421…`<br>`src/components/explore/ExploreForYouHeader.tsx:340,615,699,730…`<br>+5 more |
| 16.8px | 2 | **no** | `src/app/globals.css:501,593` |
| 18px | 40 | yes | `src/components/InsightsView.tsx:62,66,70,129`<br>`src/components/community/CreatePost.tsx:78,211,349`<br>+27 more |
| 19px | 1 | **no** | `src/components/proto/FirstRunJourney.tsx:362` |
| 20px | 15 | yes | `src/components/wishlist/AddToWishlistSheet.tsx:201,237,279`<br>`src/components/ui.tsx:112,161`<br>+10 more |
| 21px | 1 | **no** | `src/components/ItemForm.tsx:1033` |
| 22px | 2 | **no** | `src/components/proto/FirstRunJourney.tsx:593,623` |
| 24px | 24 | yes | `src/components/OnboardingModal.tsx:251,269,297,319…`<br>`src/components/InsightsView.tsx:50,271`<br>+15 more |
| 25px | 2 | **no** | `src/components/proto/FirstRunJourney.tsx:314,335` |
| 26px | 1 | **no** | `src/components/landing/FirstLookHero.tsx:54` |
| 28px | 1 | **no** | `src/components/proto/FirstRunJourney.tsx:361` |
| 30px | 10 | yes | `src/components/AppShell.tsx:56,85,100`<br>`src/components/TodayView.tsx:204,245`<br>+5 more |
| 34px | 2 | **no** | `src/components/InsightsView.tsx:250`<br>`src/components/proto/FirstRunJourney.tsx:303` |
| 36px | 1 | yes | `src/components/landing/FirstLookHero.tsx:54` |
| 48px | 4 | yes | `src/components/AppShell.tsx:85,100`<br>`src/components/landing/FirstLookHero.tsx:54`<br>+1 more |

### Arbitrary sizes (`text-[…]` / inline `fontSize`)

| Value | Uses | Where |
|---|---|---|
| `11px` | 82 | `src/components/explore/ExploreForYouHeader.tsx:172,353,479,596…`<br>`src/components/ItemForm.tsx:809,947,1021,1045…`<br>+28 more |
| `15px` | 28 | `src/components/ItemForm.tsx:1248,1261,1306,1325…`<br>`src/components/PhotoDetailView.tsx:266,288,299,315`<br>+11 more |
| `10px` | 23 | `src/components/shop/ShopSearchView.tsx:83,97,157`<br>`src/components/CalendarView.tsx:295,448`<br>+14 more |
| `13px` | 21 | `src/components/CanvasBuilderView.tsx:902,906,1095,1203…`<br>`src/components/onboarding/FirstSixCapture.tsx:318,399,406`<br>+9 more |
| `12px` | 12 | `src/components/CanvasBuilderView.tsx:826,839`<br>`src/components/TryOnPhotoRow.tsx:163,173`<br>+6 more |
| `12.5px` | 9 | `src/components/proto/FirstRunJourney.tsx:306,345,370,586…`<br>`src/components/CanvasBuilderView.tsx:1104`<br>+3 more |
| `16px` | 9 | `src/components/proto/FirstRunJourney.tsx:305,327,419,421…` |
| `11.5px` | 7 | `src/components/CanvasBuilderView.tsx:1141,1171,1188`<br>`src/components/YouView.tsx:311,392`<br>+2 more |
| `13.5px` | 7 | `src/components/proto/FirstRunJourney.tsx:363,414,459,480…` |
| `14.5px` | 6 | `src/components/proto/FirstRunJourney.tsx:315,336,514,531…`<br>`src/components/onboarding/FirstSixCapture.tsx:366` |
| `9px` | 5 | `src/components/CanvasBuilderView.tsx:985,1254`<br>`src/components/RediscoverModal.tsx:103`<br>+2 more |
| `10.5px` | 3 | `src/components/proto/FirstRunJourney.tsx:444,610,631` |
| `9.5px` | 2 | `src/components/explore/ExploreForYouHeader.tsx:578,641` |
| `25px` | 2 | `src/components/proto/FirstRunJourney.tsx:314,335` |
| `18px` | 2 | `src/components/proto/FirstRunJourney.tsx:479,554` |
| `22px` | 2 | `src/components/proto/FirstRunJourney.tsx:593,623` |
| `style fontSize 34px` | 1 | `src/components/InsightsView.tsx:250` |
| `style fontSize 11px` | 1 | `src/components/InsightsView.tsx:259` |
| `21px` | 1 | `src/components/ItemForm.tsx:1033` |
| `14px` | 1 | `src/components/PhotoDetailView.tsx:467` |
| `26px` | 1 | `src/components/landing/FirstLookHero.tsx:54` |
| `style fontSize 1.25rem` | 1 | `src/components/landing/LandingNav.tsx:30` |
| `34px` | 1 | `src/components/proto/FirstRunJourney.tsx:303` |
| `28px` | 1 | `src/components/proto/FirstRunJourney.tsx:361` |
| `19px` | 1 | `src/components/proto/FirstRunJourney.tsx:362` |
| `24px` | 1 | `src/components/proto/FirstRunJourney.tsx:584` |

### Weights · tracking

`font-medium` ×248 · `font-semibold` ×139 · `font-bold` ×11 · `font-normal` ×6

`tracking-wide` ×26 · `tracking-wider` ×9 · `tracking-[0.12em]` ×8 · `tracking-tight` ×6 · `tracking-[0.19em]` ×5 · `tracking-[0.2em]` ×3 · `tracking-[0.14em]` ×2 · `tracking-[0.11em]` ×1 · `tracking-[0.24em]` ×1 · `tracking-[0.06em]` ×1 · `tracking-[0.08em]` ×1 · `tracking-[0.13em]` ×1

## 4. Spacing

**38 distinct spacing values**; **420 uses across 52 values are off the 4px grid** (2px and 1px hairlines excluded).

| Off-grid value | Uses | Where |
|---|---|---|
| `gap-1.5 (6px)` | 94 | `src/components/explore/ExploreForYouHeader.tsx:172,349,430,440…`<br>`src/components/ItemForm.tsx:921,994,1083,1137…`<br>+36 more |
| `py-2.5 (10px)` | 54 | `src/components/CalendarView.tsx:369,372,423,426`<br>`src/components/OutfitDetailView.tsx:189,196,280,294`<br>+26 more |
| `py-1.5 (6px)` | 33 | `src/components/TodayView.tsx:315,322,329`<br>`src/components/explore/ExploreForYouHeader.tsx:430,440,455`<br>+19 more |
| `gap-2.5 (10px)` | 22 | `src/components/community/CommunityFeed.tsx:159,292,296,558`<br>`src/components/CanvasBuilderView.tsx:1305,1328,1373`<br>+13 more |
| `mt-1.5 (6px)` | 19 | `src/components/explore/ExploreForYouHeader.tsx:419,565,596,662…`<br>`src/components/proto/FirstRunJourney.tsx:480,555,632`<br>+9 more |
| `px-2.5 (10px)` | 18 | `src/components/proto/FirstRunJourney.tsx:366,586,622`<br>`src/components/CalendarView.tsx:397,417`<br>+10 more |
| `px-3.5 (14px)` | 18 | `src/components/stylist/StylistView.tsx:260,268,274`<br>`src/components/YouView.tsx:54,392`<br>+9 more |
| `p-1.5 (6px)` | 13 | `src/components/CalendarView.tsx:406,476`<br>`src/components/CanvasBuilderView.tsx:1157,1405`<br>+7 more |
| `px-1.5 (6px)` | 13 | `src/components/CanvasBuilderView.tsx:985,993,1254`<br>`src/components/proto/FirstRunJourney.tsx:370,405,452`<br>+6 more |
| `py-3.5 (14px)` | 12 | `src/components/ItemForm.tsx:1650,1770`<br>`src/components/proto/FirstRunJourney.tsx:340,592`<br>+8 more |
| `mt-2.5 (10px)` | 12 | `src/components/CalendarView.tsx:287,400,420,430`<br>`src/components/styling/StylingSessions.tsx:179,183`<br>+5 more |
| `py-[15px] (15px)` | 9 | `src/components/proto/FirstRunJourney.tsx:305,327,419,421…` |
| `mt-3.5 (14px)` | 7 | `src/components/proto/FirstRunJourney.tsx:314,335,360,526`<br>`src/components/CanvasBuilderView.tsx:901,906`<br>+1 more |
| `pt-2.5 (10px)` | 6 | `src/components/community/CommunityFeed.tsx:400,406,415`<br>`src/components/CanvasBuilderView.tsx:1249`<br>+2 more |
| `space-y-2.5 (10px)` | 6 | `src/components/proto/FirstRunJourney.tsx:316,337`<br>`src/components/ItemForm.tsx:882`<br>+3 more |
| `top-1.5 (6px)` | 6 | `src/components/SharedClosetView.tsx:881,907`<br>`src/components/PhotoDetailView.tsx:452`<br>+3 more |
| `p-2.5 (10px)` | 5 | `src/components/BulkImport.tsx:220`<br>`src/components/CalendarView.tsx:319`<br>+3 more |
| `space-y-1.5 (6px)` | 5 | `src/components/BulkImport.tsx:238`<br>`src/components/OutfitSplitImport.tsx:350`<br>+3 more |
| `p-3.5 (14px)` | 5 | `src/components/CalendarView.tsx:400,420`<br>`src/components/ItemForm.tsx:1082`<br>+2 more |
| `mb-2.5 (10px)` | 5 | `src/components/PhotoDetailView.tsx:292,447`<br>`src/components/ItemForm.tsx:1083`<br>+2 more |
| `mb-1.5 (6px)` | 5 | `src/components/community/CreatePost.tsx:257,367,402`<br>`src/components/stylist/StylistBlocks.tsx:203`<br>+1 more |
| `gap-3.5 (14px)` | 5 | `src/components/proto/FirstRunJourney.tsx:340,360,592`<br>`src/components/native/NativeShell.tsx:181`<br>+1 more |
| `left-1.5 (6px)` | 4 | `src/components/PhotoDetailView.tsx:452`<br>`src/components/SharedClosetView.tsx:881`<br>+2 more |
| `bottom-1.5 (6px)` | 3 | `src/components/CalendarView.tsx:462`<br>`src/components/PhotoDetailView.tsx:459`<br>+1 more |
| `pb-2.5 (10px)` | 3 | `src/components/OutfitsView.tsx:282`<br>`src/components/WardrobeView.tsx:259`<br>+1 more |
| `pt-1.5 (6px)` | 3 | `src/components/OutfitsView.tsx:282`<br>`src/components/proto/FirstRunJourney.tsx:499`<br>+1 more |
| `right-1.5 (6px)` | 3 | `src/components/PhotoDetailView.tsx:459`<br>`src/components/SharedClosetView.tsx:907`<br>+1 more |
| `padding: 0.55rem (8.8px)` | 2 | `src/app/globals.css:483,575` |
| `padding: 0.35rem (5.6px)` | 2 | `src/app/globals.css:493,585` |
| `padding: 0.4rem (6.4px)` | 2 | `src/app/globals.css:493,585` |
| `gap-[6px] (6px)` | 2 | `src/components/CanvasBuilderView.tsx:1203,1207` |
| `left-3.5 (14px)` | 2 | `src/components/OutfitsView.tsx:130`<br>`src/components/you/StyleTastePage.tsx:147` |
| `pb-[9px] (9px)` | 2 | `src/components/proto/FirstRunJourney.tsx:405,452` |
| `py-[5px] (5px)` | 2 | `src/components/proto/FirstRunJourney.tsx:501,586` |
| `margin: 0.2rem (3.2px)` | 1 | `src/app/globals.css:105` |
| `padding: 3px (3px)` | 1 | `src/app/globals.css:281` |
| `gap: 0.85rem (13.6px)` | 1 | `src/app/globals.css:388` |
| `padding: 0.8rem (12.8px)` | 1 | `src/app/globals.css:390` |
| `padding: 0.7rem (11.2px)` | 1 | `src/app/globals.css:526` |
| `right-2.5 (10px)` | 1 | `src/components/CanvasBuilderView.tsx:857` |

…and 12 more in `audit-data.json`.

<details><summary>Full spacing distribution</summary>

| px | Uses |
|---|---|
| -5.6 | 2 |
| 0 | 65 |
| 1 | 10 |
| 1.6 | 2 |
| 2 | 93 |
| 3 | 1 |
| 3.2 | 1 |
| 4 | 306 |
| 5 | 2 |
| 5.6 | 2 |
| 6 | 206 |
| 6.4 | 2 |
| 7 | 3 |
| 8 | 486 |
| 8.8 | 2 |
| 9 | 2 |
| 10 | 134 |
| 11 | 1 |
| 11.2 | 1 |
| 12 | 491 |
| 12.8 | 1 |
| 13.6 | 1 |
| 14 | 51 |
| 15 | 9 |
| 16 | 326 |
| 20 | 62 |
| 22.4 | 1 |
| 24 | 86 |
| 28 | 5 |
| 32 | 31 |
| 36 | 3 |
| 40 | 13 |
| 48 | 3 |
| 56 | 5 |
| 64 | 9 |
| 80 | 6 |
| 96 | 14 |
| 128 | 1 |

</details>

## 5. Radius & elevation

| Radius | Uses | Where (top) |
|---|---|---|
| 6px | 9 | `src/components/PhotoDetailView.tsx:245,452,459`<br>`src/components/wishlist/ShouldIBuySheet.tsx:175,207`<br>+4 more |
| 8px | 59 | `src/components/stylist/StylistBlocks.tsx:31,76,84,92…`<br>`src/components/SettingsView.tsx:88,488,494,499…`<br>+35 more |
| 10px | 6 | `src/components/TryOnPhotoRow.tsx:66,75,83`<br>`src/components/proto/FirstRunJourney.tsx:442`<br>+2 more |
| 12px | 161 | `src/components/explore/ExploreForYouHeader.tsx:493,501,510,518…`<br>`src/components/CanvasBuilderView.tsx:796,804,992,1279…`<br>+46 more |
| 14px | 4 | `src/components/proto/FirstRunJourney.tsx:405,452,622`<br>`src/components/onboarding/FirstSixCapture.tsx:380` |
| 16px | 146 | `src/components/explore/ExploreForYouHeader.tsx:336,415,471,478…`<br>`src/components/TravelView.tsx:534,549,577,633…`<br>+50 more |
| 18px | 2 | `src/components/proto/FirstRunJourney.tsx:361,504` |
| 20px | 3 | `src/components/proto/FirstRunJourney.tsx:393,434`<br>`src/app/globals.css:350` |
| 22px | 3 | `src/components/CanvasBuilderView.tsx:1031`<br>`src/components/onboarding/FirstSixCapture.tsx:334`<br>+1 more |
| 24px | 17 | `src/components/CanvasBuilderView.tsx:886,1070,1364`<br>`src/components/ui.tsx:107,107,160`<br>+8 more |
| 30px | 1 | `src/app/globals.css:271` |
| 999 (pill) | 1 | `src/app/globals.css:361` |
| 9999 (pill) | 234 | `src/components/CanvasBuilderView.tsx:777,826,833,855…`<br>`src/components/TravelView.tsx:59,63,669,691…`<br>+62 more |

**Tailwind shadows:** `shadow-lg` ×26 · `shadow-sm` ×7 · `shadow` ×3 · `shadow-2xl` ×3 · `shadow-md` ×2 · `shadow-xl` ×2 · `shadow-[0_-8px_30px_rgba(28,25,23,0.08)]` ×1 · `shadow-[0_2px_8px_rgba(0,0,0,0.10)]` ×1

**CSS shadows in globals.css:** `inset 0 0 0 0 transparent` · `inset 0 0 0 3px color-mix(in srgb, var(--accent) 85%, transparent)` · `inset 0 0 0 0 transparent` · `0 6px 20px rgba(28, 25, 23, 0.14)` · `0 4px 12px rgba(0, 0, 0, 0.22)` · `0 -10px 40px rgba(0, 0, 0, 0.25)`

## 6. Motion

- `.animate-fade-up` → `fade-up 260ms ease both`
- `.animate-canvas-pop` → `canvas-pop 420ms cubic-bezier(0.34, 1.5, 0.5, 1) both`
- `.animate-canvas-pop` → `fade-up 200ms ease both`
- `.animate-board-win` → `board-win 900ms cubic-bezier(0.32, 0.72, 0, 1) both`
- `.animate-board-win` → `none`
- `.animate-pop` → `pop-in 150ms cubic-bezier(0.22, 1, 0.36, 1) both`
- `.native-page-in` → `page-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both`
- `.animate-tryon-drift` → `tryon-drift 7000ms cubic-bezier(0.45, 0, 0.55, 1) infinite`
- `.animate-tryon-reveal` → `tryon-reveal 460ms cubic-bezier(0.22, 1, 0.36, 1) both`
- `.animate-tryon-drift` → `none`
- `.animate-tryon-reveal` → `fade-up 200ms ease both`

---

_Raw data: `audit-data.json`. Tokens: `figma-tokens.json` (DTCG, both modes) and `tokens/{light,dark}.tokens.json` (one file per mode for Figma's native Variables import)._
