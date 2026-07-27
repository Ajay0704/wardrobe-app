<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Linear is the source of truth (both Claude Code and Cursor)

This repo is worked on from more than one place (Claude Code + Cursor). Linear
keeps the structure straight — the project is **"Your Personal Wardrobe"**
(team `AJA`). Any agent working here MUST:

1. **Check Linear first.** Find or create the `AJA-xx` issue for the work. Don't
   start something that's already `In Progress` in another session.
2. **Claim it.** Move the issue to `In Progress` before starting.
3. **Reference it in the commit.** Put the id in the commit message, e.g.
   `AJA-12: add packing capsule`. A `post-commit` hook
   (`scripts/linear-commit-notify.mjs`) auto-comments the commit onto that issue;
   commits with no id go to the **Commit activity log** issue. This is
   comment-only — it never changes status, so move issues to `Done` yourself.
4. **Close it out.** Move the issue to `Done` when the work ships.

Do not create duplicate projects/issues. Extend what's there.

# Skill router (Emil + Superpowers)

Default: **no skill**. Pick at most 1–2 skills, only if a match below is clear. Announce: "Using X because Y." If unsure, ask once — don't pile on skills.

Skills live in `.claude/skills/` and `.cursor/skills/` (symlinks to the same Emil + Superpowers set). Read the matching `SKILL.md` before following it.

### Skip skills when
- One-file / obvious fix, rename, copy, config tweak
- I already gave the design or said "just implement"
- Read-only explain / explore
- Another agent owns the workflow

### Use Superpowers when
| Signal | Skill |
|--------|--------|
| New feature or behavior change, design not decided | brainstorming → writing-plans |
| Multi-step plan already exists; execute it | executing-plans |
| Bug / unexpected behavior, cause unclear | systematic-debugging |
| New logic with real failure modes (matching, auth, sync) | test-driven-development |
| About to claim done / shipped / fixed | verification-before-completion |
| Ready to PR / merge / clean branch | finishing-a-development-branch |

Do **not** use brainstorming for polish-only or "implement this exact spec."

### Use Emil when
| Signal | Skill |
|--------|--------|
| Polish UI / spacing / hierarchy / "feels cheap" | emil-design-eng |
| Native sheets, springs, gestures, translucency | apple-design |
| "Make screen feel alive" (plan motion, don't ship yet) | find-animation-opportunities |
| Motion exists but feels wrong | improve-animations |
| About to add charts/toasts/DnD/virtualization | pick-ui-library |

### Never auto-load
- `using-superpowers` as a blanket start-of-chat ritual (too noisy)
- Full Superpowers stack on tiny UI tweaks

If Emil and Superpowers both fit: process first only when design/bug is unclear; otherwise Emil alone for feel work.
