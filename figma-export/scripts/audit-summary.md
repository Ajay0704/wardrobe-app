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
