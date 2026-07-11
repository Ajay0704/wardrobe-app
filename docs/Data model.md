# Data model

Defined in `src/lib/types.ts` and stored via Zustand (`src/lib/store.ts`).

Last updated: 2026-07-11

## WardrobeItem

| Field | Type | Notes |
|-------|------|-------|
| id | string | UUID |
| name | string | |
| imageUrl | string | URL or data URL (prefer Storage URLs when signed in) |
| productUrl | string? | Opened via Capacitor Browser on native; affiliate-wrapped when configured |
| category | Category | top, bottom, dress, outerwear, shoes, bag, accessory |
| color | string | Hex |
| colorName | string? | |
| tags | string[] | |
| seasons | Season[] | spring, summer, fall, winter |
| brand | string? | Searchable picker (`BrandPicker`) |
| price | number? | Displayed in profile `currency` |
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

## UserProfile (`src/lib/profile.ts`)

| Field | Type | Notes |
|-------|------|-------|
| displayName, email, … | string | Account / settings |
| currency | string? | e.g. `USD`, `EUR` — drives money formatting (`src/lib/currency.ts`) |
| avatarUrl, birthDate, … | optional | |

## Views (`View` in store)

`today` · `wardrobe` · `builder` · `outfits` · `calendar` · `wishlist` · `travel` · `insights` · `you` · `settings`

## Persistence

- **Local:** `localStorage` → `wardrobe-store-v2`
- **Remote:** `wardrobe_snapshots` JSONB columns (`items`, `outfits`, `trips`, `calendar`, `profile`, `theme`, `draft`)
- **Push:** `push_subscriptions` table (service-role only)

## Related

- [[Architecture]]
- [[Supabase sync]]
- [[Features]]
