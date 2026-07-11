# Architecture

Last updated: 2026-07-11

## Stack

- **Next.js 16** — App Router
- **React 19** + TypeScript
- **Tailwind CSS v4**
- **Zustand** — localStorage persistence
- **Supabase** — auth, Storage, snapshot sync, push subscriptions
- **Capacitor 8** — iOS WKWebView shell → live production URL
- **html-to-image** — outfit PNG export
- **Open-Meteo** — weather for Today suggestions
- **web-push** — PWA morning / Sunday nudges (env-gated)

## Layout

```
src/
├── app/                 # Next.js pages + API routes
│   ├── n/               # Capacitor native-only entry
│   └── api/             # analyze, extract, tryon, push, cron, …
├── components/
│   ├── native/          # NativeShell (bottom tabs + You hub)
│   ├── landing/         # Marketing landing (web, signed-out)
│   └── …                # Shared views (Today, Closet, Insights, …)
└── lib/
    ├── platform.ts      # Native detection, Browser.open, boot script
    ├── store.ts         # Zustand
    ├── weather.ts / currency.ts / brands.ts / affiliate.ts
    └── supabase/        # client, auth, sync, storage
```

## Dual UI

| Surface | Entry | Chrome |
|---------|-------|--------|
| Website | `/` | Top nav + footer (`AppShell` web branch) |
| Native app | `/n?native=1` (Capacitor `server.url`) | `NativeShell` bottom tabs |

Detection (any true → lock native): Capacitor bridge, UA `WardrobeApp`, `?native=1`, path `/n`, `html.native-app` + localStorage latch. Product URLs open via Capacitor **Browser** (never replace the WebView).

Shared screens render through `AppViews.tsx` inside either shell.

## Key files

| Area | Path |
|------|------|
| App shell / dual UI | `src/components/AppShell.tsx` |
| Native chrome | `src/components/native/NativeShell.tsx` |
| Shared views | `src/components/AppViews.tsx` |
| Native platform | `src/lib/platform.ts` |
| Capacitor config | `capacitor.config.ts` |
| Wardrobe grid | `src/components/WardrobeView.tsx` |
| Item editor | `src/components/ItemForm.tsx` |
| Outfit builder | `src/components/OutfitBuilderView.tsx` |
| Insights | `src/components/InsightsView.tsx` |
| Zustand store | `src/lib/store.ts` |
| Domain types | `src/lib/types.ts` |
| Profile / currency | `src/lib/profile.ts`, `src/lib/currency.ts` |
| Supabase sync | `src/lib/supabase/sync.ts` |
| Try-on / extract / analyze | `src/app/api/{tryon,extract,analyze}/route.ts` |

## State flow

1. UI components read/write via `useWardrobe()` (Zustand).
2. Zustand persists to `localStorage` key `wardrobe-store-v2`.
3. When Supabase env vars are set, [[Supabase sync]] pushes/pulls in the background.

## Related

- [[Data model]]
- [[Features]]
- [[iOS Capacitor]]
- [[Deploy]]
