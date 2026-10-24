# Figma export

Every route, view and key UI state of the app, captured for redesign in Figma.

| Output | What it is |
|---|---|
| `screens/NN-<slug>-<desktop\|mobile>.png` | 2× full-height screenshots, numbered by user flow. Desktop 1440 = web shell, mobile 390 = native iOS shell. |
| `html/NN-<slug>-<viewport>.html` | Self-contained snapshots (computed styles, fonts and images inlined, no scripts) for the **html.to.design** plugin → editable layers. |
| `figma-tokens.json` | W3C Design Tokens (DTCG). Colours carry Light/Dark modes in `$extensions["com.figma"].modes`. |
| `tokens/light.tokens.json`, `tokens/dark.tokens.json` | One file per mode for Figma's native **Variables → Import** (import both into one collection as two modes). |
| `UI_AUDIT.md` | Screen index + rogue colours, font-size drift, off-grid spacing, radius/shadow/motion inventory. |
| `manifest.json`, `audit-data.json` | Raw capture diagnostics and scan data. |

## Importing into Figma

- **Editable layers:** html.to.design plugin → *Import* → *HTML files* → drop files from `html/`. Set the plugin viewport to match the file suffix (1440 or 390).
- **Reference frames:** drag `screens/*.png` onto the canvas (they're 2×; scale to 50%).
- **Variables:** Local variables → Import → pick `tokens/light.tokens.json`, then add `tokens/dark.tokens.json` as a second mode.

## Re-running

```bash
cd figma-export && npm install && npx playwright install chromium
```

Start this tree's dev server on 3217 (`.claude/launch.json` → `figma-export-dev`, or `npm run dev -- -p 3217` from the repo root). The tree must **not** have Supabase env configured, so the app runs ungated and never syncs.

```bash
npm run export                                   # all scenes, both viewports
node scripts/export.mjs --only closet,outfits    # a subset (merges into manifest.json)
node scripts/audit.mjs && node scripts/report.mjs  # tokens + UI_AUDIT.md
```

- Scenes live in `scripts/scenes.mjs`: a `route`, or a zustand `state` patch applied on a harness page that mounts the real `<AppShell/>`.
- The harness (`scripts/harness-page.tsx.txt`) is copied to `src/app/navtest-figma/` for the run and deleted on exit. If a run is killed hard, delete that folder and `.next/dev` before running `tsc`.
- Fixture data is `scripts/seed.mjs` (ids are `fx-*`; never `demo-*`, which the app treats as samples).
- Hand-written audit findings live in `scripts/audit-summary.md`; `report.mjs` splices them into `UI_AUDIT.md`.
