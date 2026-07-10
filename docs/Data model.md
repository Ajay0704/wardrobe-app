# Data model

Defined in `src/lib/types.ts` and stored via Zustand (`src/lib/store.ts`).

## WardrobeItem

| Field | Type | Notes |
|-------|------|-------|
| id | string | UUID |
| name | string | |
| imageUrl | string | URL or blob/data URL |
| category | Category | tops, bottoms, dress, etc. |
| color | string | Hex |
| tags | string[] | |
| seasons | Season[] | spring, summer, fall, winter |
| brand | string? | |
| price | number? | |
| notes | string? | |
| createdAt | string | ISO date |

## Outfit

| Field | Type |
|-------|------|
| id | string |
| name | string |
| slots | Record<Category, string \| null> |
| createdAt | string |

## WishlistItem

Similar to wardrobe items but for items not yet owned.

## Persistence

- **Local:** `localStorage` → `wardrobe-store-v1`
- **Remote:** Supabase tables (see `supabase/schema.sql`)

## Related

- [[Architecture]]
- [[Supabase sync]]
