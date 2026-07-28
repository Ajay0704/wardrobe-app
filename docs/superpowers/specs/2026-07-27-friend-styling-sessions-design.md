# Friend styles you — live styling sessions (AJA-240)

A friend styles you on a shared canvas, using your closet, for one approved session at a time.

## Flow

1. Maya opens Ajay's profile and taps **Style them**, optionally with a note about the occasion.
2. Ajay gets a notification and a card at the top of Outfits: **Approve** or **Decline**.
3. On approve, Ajay's closet is snapshotted into the session and the board goes live. Both see every edit.
4. Ajay saves the look into his own Outfits. Either side can end the session; ending revokes Maya's access.

Access is per-session and re-requested every time. Nothing persists to Maya after the session closes.

## Decisions

| Question | Decision |
|---|---|
| What the stylist sees | The whole closet minus wishlist items, snapshotted at approval |
| Where sessions surface | A card at the top of Outfits, plus the notification deep link |
| Who can save | The owner only — the stylist physically cannot write to the owner's snapshot |
| Session shape | Exactly two people, one board |
| Sync granularity | Commit-level: one row write per gesture end |

## Architecture

Clones the shared-closet spine: `SECURITY DEFINER` membership helpers so RLS can't recurse, a trigger that turns a row insert into a notification, and the `postgres_changes` → refetch idiom from `subscribeSharedCloset`.

### Tables (`supabase/migrations/20260730_styling_sessions.sql`)

**`styling_sessions`** — owner, stylist, `status` (`requested | active | ended | declined`), the note, shared `aspect` and `canvas_bg`, timestamps, `expires_at`, and denormalized identities for both sides (matching the `member_*` / `inviter_*` convention, so cards render without a join). A partial unique index keeps one live session per pair.

**`styling_session_items`** — the owner's closet at approval time: `item_ref`, name, image URL, category, brand, colour. Item images are already public Storage URLs (`getPublicUrl` in `import-item.ts`), so the stylist renders them without any bucket change.

**`styling_session_pieces`** — the live board, **one row per canvas element**. `kind`, `item_ref`/`text`/`emoji`, `nx/ny/nw/nh` as 0–1 fractions, `rotation`, `z_index`, `flipped`, `updated_by`, `updated_at`.

Per-element rows rather than a single board blob: two people moving different pieces must not clobber each other, and a blob upsert is last-writer-wins over the whole board.

### Access

- `is_styling_participant(session, user)` — owner or stylist, any status. Gates reading the session row itself, so an invitee can see the request.
- `is_styling_active(session, user)` — participant **and** `status = 'active'`. Gates items and pieces.

Because the item and piece policies test `is_styling_active`, ending a session revokes access in the database, not just in the UI. That is the security property worth protecting in review.

Insert on `styling_sessions` requires `stylist_id = auth.uid()` and `status = 'requested'` — you can ask to style someone, you cannot grant yourself access.

### Realtime and notifications

`styling_session_pieces` and `styling_sessions` join the `supabase_realtime` publication behind the usual `pg_publication_tables` guard. A `notify_style_request` trigger writes the notification; `notifications` gains a `styling_session_id` column, and unlike `shared_closet_id` it is **mapped through `notifications.ts`** so the deep link opens the specific session.

New notification kinds: `style_request` and `style_accepted`. `KIND_ICON` in `NotificationsView.tsx` is an exhaustive `Record`, so both must be registered there or the build fails — which is the desired behaviour.

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
2. Request → approve: profile button, notification kinds, Outfits card
3. `StyleSessionView` — the live board, plus the six canvas fixes
4. Save into Outfits + end session

## Prototype

`public/style-session-proto.html`, four steps, two simulated phones. Verified in-browser: grab marks the peer's piece, the peer holds position during the drag, both boards land identical on release, aspect is shared, and the stylist's save button is locked with a reason. **Delete this file when the feature ships.**
