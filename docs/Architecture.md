# Architecture

## Stack

- **Next.js 16** — App Router
- **React 19** + TypeScript
- **Tailwind CSS v4**
- **Zustand** — localStorage persistence
- **Supabase** — optional cloud sync (auth + storage + DB)
- **html-to-image** — outfit PNG export

## Layout

```
src/
├── app/              # Next.js pages + API routes
├── components/       # UI views
└── lib/              # Types, store, color/matching logic
```

## Key files

| Area | Path |
|------|------|
| App shell / routing | `src/components/AppShell.tsx` |
| Wardrobe grid | `src/components/WardrobeView.tsx` |
| Outfit builder | `src/components/OutfitBuilderView.tsx` |
| Zustand store | `src/lib/store.ts` |
| Domain types | `src/lib/types.ts` |
| Color harmony | `src/lib/color.ts` |
| Outfit generation | `src/lib/matching.ts` |
| Supabase sync | `src/lib/supabase/sync.ts` |
| Try-on API | `src/app/api/tryon/route.ts` |
| Extract API | `src/app/api/extract/route.ts` |

## State flow

1. UI components read/write via `useWardrobe()` (Zustand).
2. Zustand persists to `localStorage` key `wardrobe-store-v1`.
3. When Supabase env vars are set, [[Supabase sync]] pushes/pulls in the background.

## Related

- [[Data model]]
- [[Features]]
