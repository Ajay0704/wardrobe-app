# Phase 0 + Phase 1 roadmap status

Last updated: 2026-07-26

## Phase 0 — Frictionless input + monetization seed ✅

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| 0.1 | AI auto-tag on upload | Done | `/api/analyze` + ItemForm pre-fill |
| 0.2 | Background removal | Done | `@imgly/background-removal` in ItemForm (manual button; falls back on failure) |
| 0.3 | Wishlist mindful gate + affiliate | Done | Similar-owned warning + CPW; `src/lib/affiliate.ts` (fill tags when account ready) |
| 0.4 | Packing / Travel mode | Done | Now **Pack with friends** (server trips + invites) |

## Phase 1 — Retention core ✅

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| 1.1 | Wear-logging | Done | `logWear` → calendar + wearCount |
| 1.2 | What to wear today | Done | Explore For-you + weather outfits (Home tab retired) |
| 1.3 | PWA push + weekly habit | Done | AJA-36 |
| 1.4 | Outfit calendar | Done | `CalendarView` |

## Shipped after Phase 1 (through Jul 26, 2026)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AJA-28 | Insights | Done | + **Decision bank** (AJA-190) |
| AJA-79 | Find product | Done | SerpAPI Lens |
| AJA-78 | Browser clipper | Done | MV3 — Linear Done |
| AJA-10 | Smart Buy v2 | Done | + outcome buttons (bought/skipped/wait) |
| AJA-86 → AJA-169 | Native tabs | Done | Explore · Closet · ＋ · Outfits · **Profile** (Home retired) |
| — | Beautify + Stylist | Done | Closet-grounded intents; category-aware Beautify (AJA-217) |
| AJA-172 | Shop | Done | SerpAPI Google Shopping + gender filters (AJA-177) |
| — | Pack with friends | Done | Phases 0–3 server trips |
| AJA-190 | Decision loop + savings bank | **Done** | Linear closed 2026-07-26 |
| AJA-198/199 | Sample closet first-run | Done | Gender-matched labeled samples |
| AJA-201 | Share Extension + Web Share Target | Done | Links + images; see [[Share Extension]] |
| AJA-195 | Username / @handle | Done | Onboarding + Settings (Linear may still say In Progress for leftovers) |
| AJA-196 | Find-friends / follow-back | Done | Profile counts, pull-to-refresh |
| AJA-197 | Delete account | Done | Apple 5.1.1(v) |
| AJA-200 | Declutter Edit item | Done | |
| AJA-153 | Icon + splash | Done | Monogram W; earlier 1.0.1 build 3 |
| AJA-38 | Hybrid outfit suggestions | Done | Context-scored matching |
| AJA-35 | Onboarding + style quiz | Done | |
| AJA-212 / 214–216 | Shared Closets collaborative | Done | Closet → Shared tab |
| AJA-208 | Weather robustness | Done | City auto-load + GPS + cache |
| AJA-209 / 117 / 18 | Analyze + cutout + packshot | Done | |
| AJA-222 | Vaul BottomSheet | Done | Drag-to-dismiss sheets |

## In progress / next (Jul 26)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AJA-223 | Edit-item attribute rows | In Progress | Formality/material/pattern/tone/size + product link |
| AJA-194 | Google + Apple OAuth | In Progress | v1.1.0 build; provider dashboards may block |
| AJA-191 | Capture → Smart Buy verdict | Backlog | After share lands in wishlist |
| AJA-192 | Decision councils (rewire Share Closet) | Backlog | After solo decision metrics |
| AJA-179 / 133 | Wire ask-friends Share Closet UI | Open | Separate from Shared Closets |
| AJA-180 | Public profile Follow | Open | `/u/[handle]` still “Get the app” |
| AJA-8 | Public App Store | Gated | Don’t start unless asked |

## Ops checklist (push) — AJA-36 done 2026-07-11

1. ~~`push_subscriptions` table~~ + calendar column (AJA-16)
2. ~~VAPID keys + `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` on Vercel~~
3. Redeploy production after env changes
4. **Verify:** website Settings → Notifications → Enable; native Local Notifications after rebuild
5. Cron: `0 11 * * *` UTC → `/api/cron/daily-outfit`

## Related

- [[Features]]
- [[Share Extension]]
- [[Shared Closets]]
- [[Share Closet]]
- [[iOS Capacitor]]
- [[Research synthesis — next moves]]
- [[Browser extension]]
- [[Linear]]
