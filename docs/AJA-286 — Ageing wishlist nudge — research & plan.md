# AJA-286 — Ageing wishlist nudge — research & plan

*Prepared 2026-08-09. Sources: the AJA-286 issue, `Daily habit — research report`, `Gain-Pain ledger`, a full codebase infra sweep, and external evidence (cited inline).*

## The idea

For wishlist items untouched for **N days**, send a nudge. Tapping opens the item with the **closet-conflict verdict already computed** → **buy / wait / skip** → the **Decision bank** updates. Copy leads with the closet, never urgency:

> *"You saved this 3 weeks ago — and you own two that do this job."*

**Why:** the *Gain-Pain ledger* concluded the need is "urgent only in a ~90-second window, latent every other minute." Instead of waiting for that window (the user tabbing over from Safari), the app **manufactures** it. This is the no-price subset of the ★-strongest hypothesis "H1 — Manufactured temptation"; AJA-71 (price/stock watching) is the bigger sibling. Ship this first — it tests the same loop for a fraction of the work.

**Kill metric (from the research, verbatim):** **< 25% of notifications end in a logged verdict within 24h → the mechanic doesn't work** (and AJA-71 shouldn't be built). Note this is a *rate*, not a reach target — so a small-volume test is valid.

---

## What already exists — most of it

The feature is mostly assembly of parts that are already here:

| Need | Status | Where |
|---|---|---|
| "This is a wishlist item" | ✅ | `WardrobeItem.wishlist: boolean` — `src/lib/types.ts:300` |
| "Saved N days ago" | ✅ | `WardrobeItem.createdAt: number` (epoch ms) — `types.ts:310` (stamped from the real save time on inbox drain) |
| Read every user's wishlist + owned items server-side | ✅ (scan) | `adminClient()` (service role, bypasses RLS) over `wardrobe_snapshots.items` jsonb — `src/lib/supabase/admin.ts`, `supabase/schema.sql:5` |
| "You already own two like it" | ✅ | `analyzeSmartBuy().redundant` (same category + similar colour/≥2 shared tags) — `src/lib/smart-buy.ts:232`; wrapped as a per-item verdict by `wishVerdict` — `src/lib/wishlist-plan.ts` |
| "Already decided" filter + kill-metric signal | ✅ | `events` table, `type='decision'`, `payload.itemRef`, outcome buy/wait/skip — `src/lib/decisions.ts`, migration `20260717_shop_photo_detail.sql:99` |
| Web push, end to end | ✅ | `public/sw.js` (push + click), `push-client.ts`, `/api/push/subscribe` → `push_subscriptions` (user_id-indexed) |
| Cron scaffold + a broadcast template | ✅ | `vercel.json` crons + CRON_SECRET; `src/app/api/cron/daily-outfit/route.ts` is a near-copy template |

So the cron is: scan snapshots → find `wishlist && createdAt ∈ [N, MAX]` not already in the decision log → run `wishVerdict` against the owned items in the *same* blob → send that user's `push_subscriptions` a closet-led payload → deep-link to the item's verdict → buy/wait/skip logs a decision. **No new data model required.**

## What's missing — the real constraints

1. **iOS cannot receive a computed push.** Native is **local notifications with hardcoded text and no stored device tokens** (`src/lib/native-notifications.ts`); there's no APNs. A server cron can only deliver a computed message to **web / PWA** users today. *(This is the #1 constraint, and it's ironic given the app is iOS-first.)*
2. **The wardrobe is a JSON blob, not queryable rows.** You can't `WHERE wishlist AND created_at < …` in SQL — the cron does a full-table blob scan and filters in JS. Fine at current scale, not indexable.
3. **No notification preferences / opt-out / quiet hours exist server-side.** The only consent signal a cron can honour is "the user has a `push_subscriptions` row." A per-feature mute is net-new.
4. **No transactional email at all.** Postmark is inbound-only; sending email is net-new provider work (Resend).

---

## External evidence (what to build, and how to judge it)

- **Timing — ~30 days is defensible *as a reflection window*, not a recovery one.** Purchase-recovery timing clusters in hours–days (cart 30–60 min; browse 1–4h; winback best at 30–45 days but converting ~0.09%). But this feature is a **cooling-off / decision** moment, and ~30 days maps onto impulse-buy cooling-off psychology. Keep N configurable, suppress items > ~60–90 days (stale), and plan to A/B **14 vs 30** and a **trigger** variant ("you've saved 3 similar things"). *(Rejoiner; Klaviyo browse-abandonment; Braze/Criteo lifecycle.)*
- **Channel — email reaches a 30-day-dormant user; push mostly doesn't.** Push needs app-adjacent attention a lapsed user has stopped giving; iOS push opt-in is only ~44%. Braze/Criteo consensus: **push for immediacy, email for the truly lapsed.** *This directly tensions the issue's "send a push."*
- **Framing — the "you already own two like it" angle should *build* trust, if the tone is right.** Anti-consumption honesty is a trust engine for a "buy less, wear more" brand (Patagonia "Don't Buy This Jacket"); and 2025–2026 nudge-transparency research (Cuypers et al., *Behavioural Public Policy* 2026) finds openly disclosing a nudge **doesn't blunt it**. **The failure mode is tone, not honesty** — preachy/guilt/eco-lecture framing triggers reactance and "green skepticism." Keep it neutral, factual, agency-first; **show the two actual owned thumbnails** (the personalization *is* the trust); no urgency/countdown (that contradicts the positioning). **Similarity accuracy is existential** — one false "you own two like it" destroys credibility.
- **Judge on decision-quality, not conversion.** Winback-type messages convert ~0.09–1%; a purchase scorecard would mislabel a good feature as a failure. The kill metric (verdict-rate) is already the right yardstick.
- **Frequency — naturally low; keep it low.** Batch multiple aged items into **one digest**, cap **~1 nudge / user / 2 weeks**, suppress instantly on decision/dismiss/remove, easy opt-out, sunset non-openers. *(Localytics fatigue data; Braze sunset.)*
- **Comparables:** Poshmark "offer to likers", Pinterest re-surfacing year-old saves via ML-chosen channel, Amazon's *already-own* duplicate warnings — the "you already saved / already own" pattern is established and trusted.

---

## The one real decision: reach vs cost in v1

The issue says **push**; the evidence says **email** for reach; the code has **web-push wired** and **no email / no iOS push**. Because the kill metric is a *rate*, the cheapest honest test is **web-push only** — measure whether the *loop* works on whoever we can reach, before spending on reach. Options (pick one for v1):

| Option | Reach | New infra | Fit to "cheapest test" |
|---|---|---|---|
| **A. Web-push only** ✅ rec | web/PWA opted-in only | none | best |
| B. Web-push + in-app "aging saved" list | + returning users | tiny UI | good |
| C. + Email (Resend) | + dormant users (the evidence's pick) | email provider | larger |
| D. + iOS APNs | + iOS users | APNs + tokens | largest |

**Recommendation: A (or A+B).** Ship web-push-only, instrument the verdict-rate, and let the kill metric decide whether reach (email/APNs) is worth building. This is exactly the "hand-send the first 20" spirit of the source doc.

> **DECIDED 2026-08-09 — reach the iPhone app in v1.** The owner chose iPhone-app reach over the cheapest web-only test, because the iPhone app is the product. v1 therefore builds **iOS remote push (APNs)** as the primary channel (web-push kept alongside for browser users). This needs the **paid Apple Developer Program** + an APNs key the owner creates (see next section). Kill metric unchanged (≥25% of nudges → a logged verdict within 24h).

## iOS remote push (APNs) — the v1 channel

Reaching the installed iPhone app requires Apple's remote push (APNs). The app has **none** today: Capacitor 8 with only `@capacitor/local-notifications` (no `@capacitor/push-notifications`), no `aps-environment` entitlement (`ios/App/App/App.entitlements` has only the App Group), no push hooks in `AppDelegate.swift`. Note `native-notifications.ts:1-5` states remote APNs needs the **paid** Apple Developer Program (local notifications were the free-provisioning fallback).

**Architecture (additive — sits alongside web-push, shares the nudge computation):**
1. Add `@capacitor/push-notifications@^8`; `npx cap sync ios`.
2. Native: enable the Push Notifications capability (writes `aps-environment` into `App.entitlements`); add `didRegisterForRemoteNotificationsWithDeviceToken` + `didFailToRegisterForRemoteNotificationsWithError` to `AppDelegate.swift`.
3. App JS: a native push bootstrap — `requestPermissions()` → `register()` → on `'registration'`, POST the APNs device token to a new `/api/push/device-token`.
4. New table `device_push_tokens(token PK, user_id, platform, apns_env, updated_at)` — mirrors `push_subscriptions`, service-role only.
5. Server send: **`apns2`** (direct APNs over HTTP/2 with `.p8` token auth — *not* Firebase). Build the client once at module scope; prune on `410 Unregistered` / `BadDeviceToken`.
6. Cron: `aging-wishlist` sends the **same computed payload** to both `push_subscriptions` (web) and `device_push_tokens` (iOS).

**Owner-only Apple steps (credentials — I can't do these):** paid Apple Developer Program → Keys → create an APNs `.p8` key (download once) + copy the **Key ID** → copy the **Team ID** → enable **Push Notifications** on App ID `app.wardrobe.personal` → regenerate the provisioning profile. Secrets to set as server env vars: `APNS_KEY_P8` (file contents), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=app.wardrobe.personal`, `APNS_ENV` (`sandbox`|`production`).

**Buildable now WITHOUT the key** (compiles + testable via `xcrun simctl push` and cron dry-run): the `device_push_tokens` table + `/api/push/device-token` endpoint; the cron's candidate/verdict/copy core + dry-run; the app-side permission/registration wiring; `apns2` integration + error handling.
**Blocked until the key + capability exist:** a real device token, real delivery to a device, end-to-end verification, sandbox→production promotion.

**Env-match gotcha:** dev/TestFlight builds use APNs **sandbox**, App Store uses **production** — store `apns_env` per token and pick the host per row, or sends fail with `BadDeviceToken`.



---

## Proposed plan (phased)

**Slice 1 — the loop, on web-push.**
- New `src/app/api/cron/aging-wishlist/route.ts` (CRON_SECRET, `runtime="nodejs"`), modelled on `daily-outfit`. Scan `wardrobe_snapshots(user_id, items)`; per user, find `wishlist && createdAt ∈ [N days, 90 days]` with **no** matching `events` decision; run `wishVerdict`/`analyzeSmartBuy` on the owned items in the same blob; pick the strongest candidate (prefer `redundantCount ≥ 1`).
- Build closet-led copy from the verdict + the two owned pieces. Send to that user's `push_subscriptions` (reuse `daily-outfit`'s `webpush`/VAPID/prune plumbing). Deep-link `url` → the item's verdict view → buy/wait/skip (existing loop).
- **Instrument:** log an `events` row `type='nudge_sent'` (itemRef, endpoint, ts). **Dry-run** `?dry=1` returns candidate counts without sending (the cheap first look).
- Add the cron to `vercel.json`.

**Slice 2 — guardrails + the kill-metric readout.**
- Per-user cooldown (skip if a `nudge_sent` in the last ~14 days); one digest per run, capped; suppress-after-decision; skip users with no push subscription.
- A tiny readout (endpoint or query): of `nudge_sent` in a window, what % have a `decision` within 24h → the **kill metric**. This is the whole point; it must exist before we trust any result.

**Slice 3 — only if the kill metric passes (≥25%).**
- Expand reach in evidence-order: in-app "aging saved" surface (cheap, catches returners) → per-feature opt-out (GDPR-clean) → **email (Resend)** for dormant reach → **iOS APNs** last.
- A/B the window (14 vs 30 vs trigger-based).

## Open questions / to A-B later
- **N days:** default **30** (matches issue/copy); A/B 14 vs 30 vs "saved 3 similar" trigger.
- **Similarity threshold** for "own two like it" — reuse `analyzeSmartBuy` defaults, but watch false positives (existential).
- **Commercial tension:** an honest anti-purchase nudge may reduce affiliate revenue — acceptable for the positioning? (business call, not research.)
