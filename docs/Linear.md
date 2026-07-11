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

## Board snapshot (checked 2026-07-11)

### Done (Claude Code + Cursor)

| ID | Title |
|----|-------|
| [AJA-5](https://linear.app/ajay-karthick/issue/AJA-5) | Capacitor iOS shell |
| [AJA-6](https://linear.app/ajay-karthick/issue/AJA-6) | Dual UI Option 1 (`NativeShell`, `platform.ts`) |
| [AJA-9](https://linear.app/ajay-karthick/issue/AJA-9) | PWA install support |
| [AJA-10](https://linear.app/ajay-karthick/issue/AJA-10) | Wishlist Smart Buy (v2: wear CPW + opt-in sheet) |
| [AJA-11](https://linear.app/ajay-karthick/issue/AJA-11) | Closet ROI insights |
| [AJA-12](https://linear.app/ajay-karthick/issue/AJA-12) | AI auto-catalog + bg removal |
| [AJA-13](https://linear.app/ajay-karthick/issue/AJA-13) | Wishlist link extraction |
| [AJA-14](https://linear.app/ajay-karthick/issue/AJA-14) | Sync reliability (soft timeout, no auth-lock await, scrub poisoned snapshots) |
| [AJA-15](https://linear.app/ajay-karthick/issue/AJA-15) | Today weather opt-in; hide push in native |
| [AJA-22](https://linear.app/ajay-karthick/issue/AJA-22) | Native shell flash of web chrome |
| [AJA-23](https://linear.app/ajay-karthick/issue/AJA-23) | Format ISO dates in Outfits/Calendar |
| [AJA-25](https://linear.app/ajay-karthick/issue/AJA-25) | Linear ↔ git commit auto-sync |
| [AJA-36](https://linear.app/ajay-karthick/issue/AJA-36) | Weekly habit loop + activate web push |
| [AJA-75](https://linear.app/ajay-karthick/issue/AJA-75) | Native app local notification reminders |
| [AJA-78](https://linear.app/ajay-karthick/issue/AJA-78) | Browser wishlist clipper |

### Todo (next)

| ID | Title | Priority |
|----|-------|----------|
| [AJA-35](https://linear.app/ajay-karthick/issue/AJA-35) | Onboarding first-win polish | Medium |
| [AJA-17](https://linear.app/ajay-karthick/issue/AJA-17) | Packing capsule — weather-aware trips | Medium |
| [AJA-18](https://linear.app/ajay-karthick/issue/AJA-18) | Flat-lay → packshot polish | Medium |

### Backlog

| ID | Title |
|----|-------|
| [AJA-7](https://linear.app/ajay-karthick/issue/AJA-7) | Mac disk space for Xcode |
| [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) | App Store / TestFlight |
| [AJA-19](https://linear.app/ajay-karthick/issue/AJA-19) | Social-lite outfit polls |
| [AJA-20](https://linear.app/ajay-karthick/issue/AJA-20) | Mannequin / collage moodboard |
| [AJA-21](https://linear.app/ajay-karthick/issue/AJA-21) | FASHN VTON try-on (blocked on budget) |
| [AJA-24](https://linear.app/ajay-karthick/issue/AJA-24) | Commit activity log (meta) |
| [AJA-34](https://linear.app/ajay-karthick/issue/AJA-34)–[AJA-49](https://linear.app/ajay-karthick/issue/AJA-49) | Prior research backlog (bulk ingest, stylist, resale, …) |
| [AJA-58](https://linear.app/ajay-karthick/issue/AJA-58)–[AJA-72](https://linear.app/ajay-karthick/issue/AJA-72) | Market-gap ideas Jul 11 (utilization, calendar, wash, family, DPP, B2B, local store finder, …) |
| [AJA-79](https://linear.app/ajay-karthick/issue/AJA-79) | Closet photo → product link/price — **Done** (SerpAPI Lens + Find product sheet) |

Notion scratchpad: [New ideas](https://app.notion.com/p/39ac075eff4c8146990be35f0d3506b3)

## Code landed (verify)

Big commit `a1a43c7` — dual UI + PWA + Smart Buy + insights + sync fixes. Later: clipper, Smart Buy sheet, sync soft-timeout, AJA-22/23.

Key paths:

- `src/lib/platform.ts`
- `src/components/native/NativeShell.tsx`
- `src/components/NativeAppClass.tsx`
- `src/components/AppViews.tsx`
- `src/components/SmartBuy.tsx`
- `src/app/api/clip/route.ts`
- `extensions/wishlist-clipper/`

## GitHub (optional)

**Settings → Integrations → GitHub** → connect `Ajay0704/wardrobe-app`.

#linear #project #wardrobe
