# Linear

Issue tracking for **Your Personal Wardrobe** lives in Linear (team **Ajay Karthick**, key `AJA`).

## Links

- Workspace / team: [Ajay Karthick](https://linear.app/ajay-karthick)
- Project: [Your Personal Wardrobe](https://linear.app/ajay-karthick/project/your-personal-wardrobe-629ac27fcd73)
- Brief doc: [Project brief and workflow](https://linear.app/ajay-karthick/document/project-brief-and-workflow-9f3e51149062)
- Commit activity log: [AJA-24](https://linear.app/ajay-karthick/issue/AJA-24)

## Cursor + Claude Code

- Linear MCP authenticated in Cursor
- Shared protocol in `AGENTS.md` — Linear is source of truth for both agents
- `scripts/linear-commit-notify.mjs` + `.git/hooks/post-commit` comments commits onto `AJA-xx` (or AJA-24 if no id)
- Hook is **comment-only** — agents must still move issues to Done

## Product thesis (for issue framing)

Closet-grounded **shopping copilot**: capture → Smart Buy → decision outcome → Decision bank. Social = private councils (not feed gravity). See [[Wardrobe App]] and [[Research synthesis — next moves]].

## Board snapshot (checked 2026-07-25)

### In Progress

| ID | Title |
|----|-------|
| [AJA-194](https://linear.app/ajay-karthick/issue/AJA-194) | Google + Apple sign-in (native OAuth) — v1.1.0 |

### Recently Done (verify Linear status matches git)

| ID | Title |
|----|-------|
| [AJA-201](https://linear.app/ajay-karthick/issue/AJA-201) | Share to Wardrobe: iOS Share Extension + Web Share Target |
| [AJA-198](https://linear.app/ajay-karthick/issue/AJA-198) | Frictionless first-run: labeled sample closet + activation |
| [AJA-199](https://linear.app/ajay-karthick/issue/AJA-199) | Gender-matched beautified sample capsules |
| [AJA-195](https://linear.app/ajay-karthick/issue/AJA-195) | Username / @handle picker |
| [AJA-196](https://linear.app/ajay-karthick/issue/AJA-196) | Find-friends / follow-back / profile counts |
| [AJA-197](https://linear.app/ajay-karthick/issue/AJA-197) | In-app account deletion |
| [AJA-200](https://linear.app/ajay-karthick/issue/AJA-200) | Declutter Edit item |
| [AJA-153](https://linear.app/ajay-karthick/issue/AJA-153) | Monogram W icon + splash (1.0.1) |

### Copilot wedge

| ID | Title | Status |
|----|-------|--------|
| [AJA-190](https://linear.app/ajay-karthick/issue/AJA-190) | Decision loop + savings bank | **Code shipped** — Linear may still say Backlog; mark Done when confirmed |
| [AJA-191](https://linear.app/ajay-karthick/issue/AJA-191) | Capture → Smart Buy verdict | Backlog |
| [AJA-192](https://linear.app/ajay-karthick/issue/AJA-192) | Share Closet → decision councils | Backlog |

### Open QA / wiring (from Jul 18 QA)

| ID | Title |
|----|-------|
| [AJA-179](https://linear.app/ajay-karthick/issue/AJA-179) | Wire Share Closet into redesigned Closet |
| [AJA-178](https://linear.app/ajay-karthick/issue/AJA-178)–[AJA-189](https://linear.app/ajay-karthick/issue/AJA-189) | QA cluster (extract 403, Safari copy, a11y, public Follow, etc.) — extract UA fallback improved via AJA-201 |

### Gated / later

| ID | Title |
|----|-------|
| [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) | App Store public submission — do not start unless asked |
| [AJA-100](https://linear.app/ajay-karthick/issue/AJA-100) | Scale: separate web + stores — [[Scale architecture]] |
| [AJA-21](https://linear.app/ajay-karthick/issue/AJA-21) | FASHN VTON — budget-blocked |

## Active branch

`feat/v1.1.0-social-auth` — OAuth + share-in + first-run polish (marketing version **1.1.0**, build **5**).

## Labels

| Label | Use |
|-------|-----|
| Feature / Bug / Improvement | Type |
| iOS | Capacitor / Xcode / device |
| Capacitor | Native config / bridge |
| Web | Next.js / Vercel |
| Docs | Obsidian / Notion / README |

Notion scratchpad: [New ideas](https://app.notion.com/p/39ac075eff4c8146990be35f0d3506b3)

#linear #project #wardrobe
