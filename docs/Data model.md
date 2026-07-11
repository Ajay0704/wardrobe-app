# Data model

Defined in `src/lib/types.ts` and stored via Zustand (`src/lib/store.ts`).

## WardrobeItem

| Field | Type | Notes |
|-------|------|-------|
| id | string | UUID |
| name | string | |
| imageUrl | string | URL or data URL (prefer Storage URLs when signed in) |
| productUrl | string? | Affiliate-wrapped on open |
| category | Category | top, bottom, dress, outerwear, shoes, bag, accessory |
| color | string | Hex |
| colorName | string? | |
| tags | string[] | |
| seasons | Season[] | spring, summer, fall, winter |
| brand | string? | |
| price | number? | |
| notes | string? | |
| wishlist | boolean | |
| favorite | boolean? | |
| wearCount | number? | Incremented by `logWear` |
| lastWornAt | string? | YYYY-MM-DD |
| createdAt | number | epoch ms |

## Outfit

| Field | Type | Notes |
|-------|------|-------|
| id | string | |
| name | string | |
| notes | string? | |
| itemIds | string[] | refs into items |
| wearCount | number? | |
| lastWornAt | string? | |
| createdAt | number | |

## Trip

| Field | Type |
|-------|------|
| id | string |
| name | string |
| destination | string? |
| startDate / endDate | string? |
| itemIds | string[] |
| createdAt | number |

## CalendarEntry

| Field | Type | Notes |
|-------|------|-------|
| id | string | |
| date | string | YYYY-MM-DD |
| kind | `"worn"` \| `"planned"` | |
| outfitId | string? | |
| itemIds | string[] | |
| note | string? | |
| createdAt | number | |

## Persistence

- **Local:** `localStorage` → `wardrobe-store-v2`
- **Remote:** `wardrobe_snapshots` JSONB columns (`items`, `outfits`, `trips`, `calendar`, `profile`, `theme`, `draft`)
- **Push:** `push_subscriptions` table (service-role only)

## Related

- [[Architecture]]
- [[Supabase sync]]
- [[Features]]
