# Wishlist → a fitting room for things you don't own yet

The wishlist stores items and does nothing with them. This turns it into the place you answer one question: **should I actually buy this?**

Prototype: `public/wishlist-proto.html` (five steps, all interactive). Delete when this ships.

## Why this, and not the obvious things

The wishlist screen is 77 lines with one control ("Add wishlist item"). Its own subtitle promises "track prices and notes" — neither exists. Meanwhile three capabilities that answer the real question already exist and are unreachable:

| Already built | Where it's stuck |
|---|---|
| `smart-buy.ts` — duplicate detection, cost-per-wear projection | Only mounts inside `ItemForm`, so you can't reach it from the wishlist grid |
| `decisions.ts` — bought/skipped/waited, money saved | Same; rendered only at the top of Insights |
| `profile.budgets` (tops/bottoms/shoes/outerwear) | **Nothing reads it.** Five references in the repo, all in the settings form |

So most of this work is *connecting* rather than inventing.

Two things are deliberately **out of scope**, and would be wrong to build:

- **Price comparison and price tracking.** Requires re-fetching every saved `productUrl` on a schedule. No cron exists, `/api/extract` is a one-shot, and SerpAPI credits already burn per search because `shop_search_cache` was never applied. A stale price presented as current is worse than no price.
- **Trend signals, and any new ML.** There's no trend data source. "Goes with N" uses the matcher that already exists; the closet-aware ranker (AJA-174/176) is blocked on capturing `fit` for the user's own items, and stacking models on missing inputs looks smarter without being smarter.

Friend ranking is a real idea but a different job — deciding together, not deciding alone. Separate spec.

## Decisions

| Question | Decision |
|---|---|
| Budget shape | **One budget per shopping plan** ("Summer refresh · $450"). The existing per-category fields stay untouched |
| Look containing a wish piece | **Saves, clearly badged**, and excluded from wear stats until owned |
| Wish pieces on the canvas | Allowed, visually marked as not-owned |
| Scope | See-it-on-you + Decide + the dead-save fix. Friend ranking later |

## Part 1 — the dead-save fix (do this first)

**The bug.** `/api/wishlist` inserts into `public.wishlist_items` and writes an `events` row. Nothing in `src/` selects from that table — one insert, zero readers. Three call sites hit it:

- `PhotoDetailView.tsx:195` — save a detected garment
- `PhotoDetailView.tsx:412` — the heart on a shop result
- `shop-search.ts:93` — `wishlistProduct()`

Those saves never appear in the wishlist, which is `WardrobeItem.wishlist` inside the `wardrobe_snapshots` blob. Two unrelated wishlists.

**The fix.** Treat `wishlist_items` as a server-side inbox the client drains, which is the pattern `sync.ts` already uses: `absorbWishlistClips(local, remote)` folds in remote clips that carry a `productUrl` and aren't already local.

1. Migration: `alter table wishlist_items add column if not exists consumed_at timestamptz`, plus `price numeric` and `product_url text` so a save keeps the two fields the wishlist actually renders.
2. `/api/wishlist` stamps price and URL when the source row has them (`shop_products` carries both).
3. New `absorbWishlistInbox()` in `sync.ts`, called from the same place as `absorbWishlistClips`: select rows where `consumed_at is null`, map to `WardrobeItem` with `wishlist: true`, dedupe against local ids, then set `consumed_at`.

**Why `consumed_at` and not "dedupe by id":** without it, deleting an absorbed item locally would resurrect it on the next sync. `absorbWishlistClips` has exactly this hazard today and works around it by matching normalized URLs.

Source is preserved so the card can say where it came from ("saved from Shop"), which is also how you'd notice this class of bug in future.

## Part 2 — the plan and its budget

New profile field: `shoppingPlan?: { name: string; budget: number }`. One plan, not many — a list of plans is a project manager, not a wardrobe app.

The wishlist header shows committed total vs budget, a bar, and a computed line. **The line must be derived, never phrased.** The prototype's first version hardcoded the arithmetic and claimed "you're $-5 under" — wrong sign and a false claim. Correct form:

```
over && duplicates && (spent - dupeTotal) <= budget
  → "$171 over. Drop the 2 duplicates of things you already own and you're $45 under."
over && duplicates                        → "…Even without them you'd still be $16 over."
over && no duplicates                     → "…Nothing here duplicates what you own."
under                                     → "$45 left. 3 pieces on the list."
```

The promise and the outcome have to agree: dropping the duplicates must actually land on the number the line quoted. That's a test, not a hope.

Currency comes from `profile.currency` via `formatMoney` — already complete, 17 currencies.

## Part 3 — a verdict on every card

Each wishlist card gains one line, from data we already have:

- **`similarOwned` non-empty** → "You already own one of these" (amber). This is the only honest reason to say no.
- **otherwise** → "Goes with N things you own" (green), N from the existing matcher over owned items.

And two actions: **Should I?** and **Style it**.

Filter chips derived from the same data, empty ones hidden: Everything · Goes with a lot · Already own similar · Under *X*. Same `presentCollections` shape as AJA-239, so the two screens behave alike.

## Part 4 — "Should I?"

A `BottomSheet` surfacing what `smart-buy.ts` already computes, one fact per row:

1. Duplicates, with thumbnails of the pieces you already own — or "works with N pieces you own" when there are none.
2. Budget impact: "$245 of your $450 summer refresh", warning-toned when the plan is already over.
3. Cost per wear at 30 wears, against the closet's actual average from `insights.ts`.

Three actions, all logging through the existing `logDecision`: **Skip it** · **I'll wait** · **I bought it**.

**"I bought it" is the missing action.** Today, marking a wishlist item as owned means opening the full editor and flipping a toggle — grep for "mark as owned" or "purchased" finds nothing. It should flip `wishlist: false`, stamp `purchasedAt`, drop the item out of the wishlist and into the closet, and recompute the plan.

`purchasedAt` must be added to `normalizeItem`'s whitelist in `store.ts` or it is silently stripped on every reload and pull — the trap that bit AJA-223 and AJA-239.

## Part 5 — try it on

Wish pieces become placeable on the canvas. Four `!it.wishlist` filters in `CanvasBuilderView` (tray, sub-category chips, count, owned pool) relax to include them, and a wish piece renders with an amber silhouette outline plus a WISH chip.

The outline traces the garment's **alpha edge** using four zero-blur drop-shadows, not a bounding box. A dashed rectangle around a narrow coat reads as a loose empty box; the prototype shows both and the difference is large.

`Surprise me` stays owned-only for the supporting pieces, so the wish piece is always the one thing you don't have.

**Style it** from a card opens the canvas with that piece already placed and a look built around it from owned items — `bestLook()` with the wish piece pinned.

## Part 6 — saving a look that isn't fully owned

`Outfit` gains `wishItemIds?: string[]`. A look containing wish pieces:

- saves normally, badged "1 piece you don't own yet"
- is **excluded from wear stats** (`logWear`, cost-per-wear, "never worn") until every piece is owned
- clears itself automatically: when the last wish piece flips to owned, `wishItemIds` empties and it becomes an ordinary look

`wishItemIds` must be whitelisted in `normalizeOutfit`, same reason as above.

## Not in scope

Price tracking, price comparison, trend data, new ML, friend ranking, multiple concurrent plans, per-item currency, wishlist sorting beyond the chips.

## Phases

1. **Dead-save fix** — migration, `/api/wishlist` fields, `absorbWishlistInbox`. Independently shippable and worth shipping alone.
2. **Plan + budget + verdict line** — `shoppingPlan`, the derived header, card verdicts, chips.
3. **Should I? + I bought it** — the sheet, `purchasedAt`, decision logging.
4. **Try it on** — canvas filters, wish marking, Style it, `wishItemIds` and the stats exclusion.

## Testing

- **Budget arithmetic**: unit-test the note builder across all four branches, and assert the quoted "under by X" equals the actual total after removing duplicates.
- **Absorb**: a row absorbed once, deleted locally, and re-synced must **not** come back.
- **Whitelists**: round-trip an item with `purchasedAt` and an outfit with `wishItemIds` through `normalizeItem` / `normalizeOutfit` and assert survival. This is the failure mode that has recurred twice.
- **Stats exclusion**: a look with a wish piece must not move cost-per-wear or appear in "never worn".
- **Canvas regression**: relaxing the four filters must not let wish pieces into `matching.ts`, the stylist, packing, or Insights — those exclusions are correct and must stay.
