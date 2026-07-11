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
