# Shared Closets (collaborative)

Co-owned, always-live closet a small group edits together. Different from [[Share Closet]] (ask-friends link for feedback).

Shipped as **AJA-212** (phases AJA-213 schema → AJA-214 UI → AJA-215 invites → AJA-216 realtime). Linear **Done** (2026-07-26).

## In-app

Closet tab → **Shared** segment → `SharedClosetView`: create closet, add from own closet, invite followers, member avatars, “Added by”, live sync.

## Backend

- Tables: `shared_closets`, `shared_closet_members`, `shared_closet_items` (+ invites)
- Migrations: `20260728_shared_closets.sql`, `20260729_shared_closet_invites.sql`
- Client: `src/lib/shared-closet.ts` · UI: `src/components/SharedClosetView.tsx`
- Realtime: `subscribeSharedCloset`

## Related

- [[Share Closet]] — orphaned ask-friends sheet (AJA-179 still open)
- [[Features]]
- Linear: [AJA-212](https://linear.app/ajay-karthick/issue/AJA-212)

#shared-closets #closet #social
