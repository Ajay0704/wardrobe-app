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
- Emil + Superpowers skills in `.claude/skills/` — **skill router** in `AGENTS.md` (default no skill; pick only when it improves outcome)
- `scripts/linear-commit-notify.mjs` + `.git/hooks/post-commit` comments commits onto `AJA-xx` (or AJA-24 if no id)
- Hook is **comment-only** — agents must still move issues to Done

## Product thesis (for issue framing)

Closet-grounded **shopping copilot**: capture → Smart Buy → decision outcome → Decision bank. Social = private councils (not feed gravity). See [[Wardrobe App]] and [[Research synthesis — next moves]].

## Board snapshot (checked 2026-07-26)

### In Progress

| ID | Title |
|----|-------|
| [AJA-223](https://linear.app/ajay-karthick/issue/AJA-223) | Edit page: formality/material/pattern/tone/size + product link |
| [AJA-194](https://linear.app/ajay-karthick/issue/AJA-194) | Google + Apple sign-in (native OAuth) — v1.1.0 |
| [AJA-213](https://linear.app/ajay-karthick/issue/AJA-213) | Shared Closets Phase 0 schema — migrations in repo; confirm prod apply |
| [AJA-195](https://linear.app/ajay-karthick/issue/AJA-195) | Username handle — UI shipped; leftover cleanup may remain |
| [AJA-193](https://linear.app/ajay-karthick/issue/AJA-193) | Ship logo build — prep done; ASC release status unclear |
| [AJA-87](https://linear.app/ajay-karthick/issue/AJA-87) | Explore social feed — MVP shipped; full scope open |
| [AJA-82](https://linear.app/ajay-karthick/issue/AJA-82) | Core ML on-device scan — not done |
| [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) | App Store later — **should be Backlog**; do not start unless asked |

### Closed 2026-07-26 (stale-status cleanup)

| ID | Title |
|----|-------|
| [AJA-212](https://linear.app/ajay-karthick/issue/AJA-212) / 214–216 | Shared Closets collaborative |
| [AJA-221](https://linear.app/ajay-karthick/issue/AJA-221) | Emil Shared Closets polish |
| [AJA-209](https://linear.app/ajay-karthick/issue/AJA-209) | Multi-item analyze + Beautify fidelity |
| [AJA-208](https://linear.app/ajay-karthick/issue/AJA-208) | Weather robustness |
| [AJA-117](https://linear.app/ajay-karthick/issue/AJA-117) | Garment extraction harden |
| [AJA-78](https://linear.app/ajay-karthick/issue/AJA-78) | Browser extension |
| [AJA-35](https://linear.app/ajay-karthick/issue/AJA-35) | Onboarding + style quiz |
| [AJA-18](https://linear.app/ajay-karthick/issue/AJA-18) | Flat-lay packshot / beautify |
| [AJA-190](https://linear.app/ajay-karthick/issue/AJA-190) | Decision loop + savings bank |
| [AJA-217](https://linear.app/ajay-karthick/issue/AJA-217) | Category-aware Beautify |
| [AJA-222](https://linear.app/ajay-karthick/issue/AJA-222) | Vaul BottomSheet + apple-design sheets |

### Copilot wedge

| ID | Title | Status |
|----|-------|--------|
| [AJA-190](https://linear.app/ajay-karthick/issue/AJA-190) | Decision loop + savings bank | **Done** |
| [AJA-191](https://linear.app/ajay-karthick/issue/AJA-191) | Capture → Smart Buy verdict | Backlog |
| [AJA-192](https://linear.app/ajay-karthick/issue/AJA-192) | Share Closet → decision councils | Backlog |

### Open QA / wiring

| ID | Title |
|----|-------|
| [AJA-179](https://linear.app/ajay-karthick/issue/AJA-179) / [AJA-133](https://linear.app/ajay-karthick/issue/AJA-133) | Wire ask-friends Share Closet into Closet |
| [AJA-180](https://linear.app/ajay-karthick/issue/AJA-180) | Public `/u/[handle]` Follow while signed in |
| [AJA-178](https://linear.app/ajay-karthick/issue/AJA-178)–[AJA-189](https://linear.app/ajay-karthick/issue/AJA-189) | Remaining QA cluster |

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
