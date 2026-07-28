# Friend styles you — live styling sessions (AJA-240)

A friend helps you get dressed on a shared canvas, using your closet, for one session at a time.

**You ask; they accept.** Nobody opens the app volunteering to style someone else — the request has to come from the person who is stuck.

## Flow

1. Ajay taps **Ask a friend to style me** on Outfits, picks someone he follows, and adds a note about the occasion.
2. That friend gets a notification and a card at the top of their Outfits: **Help them** or **Not now**.
3. Accepting drops them both straight into the canvas. Ajay's closet is snapshotted into the session and the board goes live; both see every edit.
4. Ajay saves the look into his own Outfits. Either side can end the session; ending revokes the friend's access.

Access is per-session and re-asked every time. Nothing persists to the friend after the session closes.

## Decisions

| Question | Decision |
|---|---|
| Who initiates | The **owner**. You ask for help; the friend accepts |
| What the friend sees | The whole closet minus wishlist items, snapshotted on accept |
| Where sessions surface | A card at the top of Outfits, plus the notification deep link |
| Who can save | The owner only — the friend physically cannot write to the owner's snapshot |
| Session shape | Exactly two people, one board |
| Sync granularity | Commit-level: one row write per gesture end |

## Architecture

Clones the shared-closet spine: `SECURITY DEFINER` membership helpers so RLS can't recurse, a trigger that turns a row insert into a notification, and the `postgres_changes` → refetch idiom from `subscribeSharedCloset`.

### Tables (`supabase/migrations/20260730_styling_sessions.sql`)

**`styling_sessions`** — owner, stylist, `status` (`requested | active | ended | declined`), the note, shared `aspect` and `canvas_bg`, timestamps, `expires_at`, and denormalized identities for both sides (matching the `member_*` / `inviter_*` convention, so cards render without a join). A partial unique index keeps one live session per pair.

**`styling_session_items`** — the owner's closet at accept time: `item_ref`, name, image URL, category, brand, colour. Item images are already public Storage URLs (`getPublicUrl` in `import-item.ts`), so the stylist renders them without any bucket change.

**`styling_session_pieces`** — the live board, **one row per canvas element**. `kind`, `item_ref`/`text`/`emoji`, `nx/ny/nw/nh` as 0–1 fractions, `rotation`, `z_index`, `flipped`, `updated_by`, `updated_at`.

Per-element rows rather than a single board blob: two people moving different pieces must not clobber each other, and a blob upsert is last-writer-wins over the whole board.

### Access

- `styling_sessions` SELECT/UPDATE compare `owner_id` / `stylist_id` **directly**, with no helper function. This is deliberate: a `STABLE SECURITY DEFINER` helper reads from the statement's snapshot and cannot see the row the current statement is inserting, so `insert ... returning` — which is what `.insert().select().single()` compiles to, and how the client creates a session — fails its own SELECT check with a 42501. Shared closets only avoids this because its policy has a direct `owner_id = auth.uid()` disjunct that short-circuits first.
- `is_styling_owner(session, user)` — gates writes to the closet snapshot.
- `is_styling_active(session, user)` — participant **and** `status = 'active'` **and** not expired. Gates items and pieces. Safe as a helper because it checks the *parent* session row, which is already committed by the time a child row is written.

Because the item and piece policies test `is_styling_active`, ending a session revokes access in the database, not just in the UI. That is the security property worth protecting in review.

Insert on `styling_sessions` requires **`owner_id = auth.uid()`** and `status = 'requested'`. Because the person sharing the closet is the one creating the row, a row that grants you access to *someone else's* closet is impossible to construct. This is strictly safer than a stylist-initiated flow, where the insert policy has to allow writing a row that names another user as owner.

The friend's accept is an `UPDATE` flipping `status` to `active`, permitted only when `stylist_id = auth.uid()` — mirroring `respondInvite` in `trips.ts`, which needs no extra policy beyond "you may update your own membership".

### Realtime and notifications

`styling_session_pieces` and `styling_sessions` join the `supabase_realtime` publication behind the usual `pg_publication_tables` guard. A `notify_style_request` trigger writes the notification; `notifications` gains a `styling_session_id` column, and unlike `shared_closet_id` it is **mapped through `notifications.ts`** so the deep link opens the specific session.

New notification kinds: `style_request` (owner → friend, "Ajay needs help getting dressed") and `style_accepted` (friend → owner, "Priya is ready to style you"). Both trigger off `styling_sessions`: insert for the ask, and the `requested → active` transition for the accept. `KIND_ICON` in `NotificationsView.tsx` is an exhaustive `Record`, so both must be registered there or the build fails — which is the desired behaviour.

## Canvas changes

Six existing behaviours are single-user assumptions that break with two people. All six are fixed as part of this work.

1. **Coordinates are absolute board pixels** and `aspect` is local React state (`CanvasBuilderView.tsx:109`). Store normalized fractions; move `aspect` onto the session row so both see the same board.
2. **`CanvasPiece.applyLive()` closes over `c.x`/`c.y`.** A remote patch mid-drag rebases the transform, and the gesture-end commit adds full screen movement to the *new* origin — the piece jumps. Freeze the committed position into a ref at gesture start and compute the commit from that.
3. **Every drag start writes `zIndex: max + 1`.** Concurrent drags z-fight. During a session, bring-to-front is the explicit button only.
4. **`dup-${Date.now()}` and `sp-${Date.now()}-${z}`** are not client-unique. Use `uid()`.
5. **`normalizeCanvasItem` / `normalizeOutfit` are hard whitelists.** Any field added for this feature must be registered or it is silently stripped on every rehydrate and pull — the trap that bit AJA-223 and AJA-239.
6. **Echo suppression.** Realtime fires for your own writes. Ignore rows whose `updated_by` is me, and any piece I am currently holding.

### Why commit-level sync

Streaming coordinates during a gesture means a write per animation frame, on a board where every gesture end already serializes the whole store to localStorage (`canvasDraft` is in `partialize`). Commit-level is one write per gesture.

The cost is that the peer sees pieces land rather than glide. The prototype covers that with a **grab/release presence signal**: while you hold a piece, the other phone outlines it and labels it with your name. That is two tiny events per gesture instead of sixty, and it is what makes the board read as live.

## Out of scope

Live cursors. In-session chat — Messages already exists. More than two people. Resuming an ended session; you ask again, which is the point of per-session approval.

## Phases

1. Migration + `src/lib/styling.ts`
2. Ask → accept: the Outfits "Ask a friend to style me" sheet with a friend picker (`fetchFollowingUsers`), notification kinds, and the incoming-request card
3. `StyleSessionView` — the live board, plus the six canvas fixes
4. Save into Outfits + end session

## Phase 1 verification

The migration was applied to the linked project and the access rules were exercised as two real users inside a rolled-back transaction. All eleven checks pass:

| # | Check | Result |
|---|---|---|
| 1 | Owner creates their own session | OK |
| 2 | Creating a session naming *someone else* as owner | BLOCKED |
| 3 | Owner seeds the closet snapshot | OK |
| 4 | Owner accepts on the friend's behalf | BLOCKED |
| 5 | Friend reads the closet *before* accepting | 0 items |
| 6 | Friend accepts | OK |
| 7 | Friend reads the closet *while live* | 1 item |
| 8 | Friend edits the board | OK |
| 9 | Friend reads the closet *after end* | 0 items |
| 10 | Friend reads the board *after end* | 0 pieces |
| 11 | Reopening an ended session | BLOCKED |

Checks 9 and 10 are the ones worth re-running if the policies are ever touched — they are the difference between "access is revoked" and "the screen is hidden".

## Prototype

`public/style-session-proto.html`, four steps, two simulated phones. Verified in-browser: the friend you pick carries through every screen (tested with Priya, not the default), grab marks the peer's piece, the peer holds position during the drag, both boards land identical on release, aspect is shared, and the friend's save button is locked with a reason. **Delete this file when the feature ships.**
