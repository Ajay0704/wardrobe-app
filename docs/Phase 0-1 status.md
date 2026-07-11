# Phase 0 + Phase 1 roadmap status

Last updated: 2026-07-11

## Phase 0 — Frictionless input + monetization seed ✅

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| 0.1 | AI auto-tag on upload | Done | `/api/analyze` + ItemForm pre-fill |
| 0.2 | Background removal | Done | `@imgly/background-removal` in ItemForm (manual button; falls back on failure) |
| 0.3 | Wishlist mindful gate + affiliate | Done | Similar-owned warning + CPW; `src/lib/affiliate.ts` (fill tags when account ready) |
| 0.4 | Packing / Travel mode | Done | `Trip` + `TravelView` + capsule outfits |

## Phase 1 — Retention core ✅ (code shipped; push deps pending)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| 1.1 | Wear-logging | Done | `logWear` → calendar + wearCount; Outfits / ItemCard / Today |
| 1.2 | What to wear today | Done | Default `TodayView`; Open-Meteo + `generateOutfit` |
| 1.3 | PWA push | Scaffolded | Needs VAPID keys, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, run `push_subscriptions` SQL |
| 1.4 | Outfit calendar | Done | `CalendarView` over worn + planned entries |

## Shipped after Phase 1 (Jul 2026)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AJA-28 | Insights screen | Done | Category mix, value, usage, CPW — earlier than research “Phase 3” |
| AJA-31 | Native IA | Done | Today / Closet / ＋ / Outfits / You |
| AJA-32 | Take photo | Done | Capacitor `@capacitor/camera` + Info.plist camera permission (HTML capture broken in WKWebView) |
| AJA-33 | Native shell stability | Done | `/n` entry, in-app editor + tabs, no WebView shop nav, input zoom fix |
| AJA-50/51 | Currency + brand picker | Done | Settings currency; searchable brands |

## Ops checklist (push)

1. ~~Run calendar + push SQL from `supabase/schema.sql`~~ — **calendar column done (AJA-16, 2026-07-11)**; push_subscriptions still if missing
2. `npx web-push generate-vapid-keys` → set env on Vercel
3. Set `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET`
4. Settings → Notifications → Enable

## Related

- [[Features]]
- [[iOS Capacitor]]
- [[Research synthesis — next moves]]
