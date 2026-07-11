# Linear

Issue tracking for **Your Personal Wardrobe** lives in Linear (team **Ajay Karthick**, key `AJA`).

## Links

- Workspace / team: [Ajay Karthick](https://linear.app/ajay-karthick)
- Project: [Your Personal Wardrobe](https://linear.app/ajay-karthick/project/your-personal-wardrobe-629ac27fcd73)
- Brief doc: [Project brief & workflow](https://linear.app/ajay-karthick/document/project-brief-and-workflow-9f3e51149062)
- Commit activity log: [AJA-24](https://linear.app/ajay-karthick/issue/AJA-24)

## Cursor + Claude Code

- Linear MCP authenticated in Cursor
- Shared protocol in `AGENTS.md` — Linear is source of truth for both agents
- `scripts/linear-commit-notify.mjs` + `.git/hooks/post-commit` comments commits onto `AJA-xx` (or AJA-24 if no id)
- Hook is **comment-only** — agents must still move issues to Done

## Labels

| Label | Use |
|-------|-----|
| Feature / Bug / Improvement | Type (defaults) |
| iOS | Capacitor / Xcode / device |
| Capacitor | Native config / bridge |
| Web | Next.js / Vercel |
| Docs | Obsidian / Notion / README |

## Milestones

1. **iOS shell** — AJA-5 Done
2. **Dual UI (app vs web)** — AJA-6 Done (shipped in `a1a43c7`)
3. **App Store later** — AJA-8 Backlog

## Board snapshot (checked 2026-07-10)

### Done (Claude Code + earlier)

| ID | Title |
|----|-------|
| [AJA-5](https://linear.app/ajay-karthick/issue/AJA-5) | Capacitor iOS shell |
| [AJA-6](https://linear.app/ajay-karthick/issue/AJA-6) | Dual UI Option 1 (`NativeShell`, `platform.ts`) |
| [AJA-9](https://linear.app/ajay-karthick/issue/AJA-9) | PWA install support |
| [AJA-10](https://linear.app/ajay-karthick/issue/AJA-10) | Wishlist Smart Buy |
| [AJA-11](https://linear.app/ajay-karthick/issue/AJA-11) | Closet ROI insights |
| [AJA-12](https://linear.app/ajay-karthick/issue/AJA-12) | AI auto-catalog + bg removal |
| [AJA-13](https://linear.app/ajay-karthick/issue/AJA-13) | Wishlist link extraction |
| [AJA-14](https://linear.app/ajay-karthick/issue/AJA-14) | Sync reliability |
| [AJA-15](https://linear.app/ajay-karthick/issue/AJA-15) | Today weather opt-in; hide push in native |
| [AJA-25](https://linear.app/ajay-karthick/issue/AJA-25) | Linear ↔ git commit auto-sync |

### Todo (next)

| ID | Title | Priority |
|----|-------|----------|
| [AJA-16](https://linear.app/ajay-karthick/issue/AJA-16) | Run Supabase `calendar` column migration | High |
| [AJA-17](https://linear.app/ajay-karthick/issue/AJA-17) | Packing capsule — weather-aware trips | Medium |
| [AJA-18](https://linear.app/ajay-karthick/issue/AJA-18) | Flat-lay → packshot polish | Medium |
| [AJA-22](https://linear.app/ajay-karthick/issue/AJA-22) | Fix native shell flash of web chrome | Low |
| [AJA-23](https://linear.app/ajay-karthick/issue/AJA-23) | Format ISO dates in Outfits/Calendar | Low |

### Backlog

| ID | Title |
|----|-------|
| [AJA-7](https://linear.app/ajay-karthick/issue/AJA-7) | Mac disk space for Xcode |
| [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) | App Store / TestFlight |
| [AJA-19](https://linear.app/ajay-karthick/issue/AJA-19) | Social-lite outfit polls |
| [AJA-20](https://linear.app/ajay-karthick/issue/AJA-20) | Mannequin / collage moodboard |
| [AJA-21](https://linear.app/ajay-karthick/issue/AJA-21) | FASHN VTON try-on (blocked on budget) |
| [AJA-24](https://linear.app/ajay-karthick/issue/AJA-24) | Commit activity log (meta) |

## Code landed (verify)

Big commit `a1a43c7` — dual UI + PWA + Smart Buy + insights + sync fixes. Key paths:

- `src/lib/platform.ts`
- `src/components/native/NativeShell.tsx`
- `src/components/NativeAppClass.tsx`
- `src/components/AppViews.tsx`

## GitHub (optional)

**Settings → Integrations → GitHub** → connect `Ajay0704/wardrobe-app`.

#linear #project #wardrobe
