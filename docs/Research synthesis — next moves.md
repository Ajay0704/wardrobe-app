# Research synthesis — next moves

Synthesized from `~/Desktop/Digital_Wardrobe_Research` (Jul 2026) against the current [[Wardrobe App]] product.

Related: [[Features]] · [[Architecture]] · [[Data model]]

## Verdict

The consumer problem is **real but intermittent** (84% “nothing to wear”; most clothes underworn). Pure digital-closet organizers fail on:

1. **Setup chasm** — 8–15 hours to catalog → early churn
2. **Post-setup value cliff** — no reason to return after digitizing
3. **Subscription-only economics** — Cladwell-scale ceiling (~10k paid / ~$330K ARR)

**Win condition:** AI-first, near-zero-setup **weekly styling habit** → then analytics → then commerce/resale. Beachhead: **US/UK** fashion-engaged Gen Z/Millennial women. India = later, ad/commerce, not subscriptions.

**Primary habit KPI (advisor consensus Jul 10):** weekly returning outfit creation — privacy-first / local counters + optional opt-in.

## You today vs must-haves

| Capability | Current product | Research must-have |
|---|---|---|
| Cataloging | Manual + product URL extract | Bulk photo, bg removal, auto-tag, receipt/gallery ingest |
| Styling | Weather Today + color-harmony generate + builder | Weather / occasion / calendar-aware outfits |
| Habit | Today + wear log + calendar + push scaffold | Wear log, weekly return, gentle nudges |
| Analytics | Insights screen (CPW, unworn, value, usage) | Cost-per-wear, unworn %, balance |
| Try-on | Gemini try-on (env-gated) | Keep as wow; not the core habit |
| Commerce | Wishlist only | Gap-fill affiliate + resale deep links |
| Monetization | Free | Freemium *after* habit; never paywall closet post-upload |

## Phased plan

### Phase 0 — Instrument & wedge (weeks 1–4)

1. Local weekly-return telemetry (outfit create/save/wear)
2. Go/kill thresholds: &lt;30 min for ~50 items; D7 &gt;40%; rising weekly creators
3. Fix docs/env drift (auth, `GEMINI_API_KEY`, data model)
4. Lock beachhead messaging (US/UK)

### Phase 1 — Kill data-entry wall (weeks 4–10)

1. Bulk upload + bg removal + auto-tag
2. Polish URL import → time-to-first-outfit in session one
3. Prototype gallery scan if capacity allows

### Phase 2 — Habit before monetization (weeks 8–16)

1. Today/this-week outfits (weather + occasion)
2. One-tap wear log
3. Simple outfit calendar + weekly nudge
4. 6–8 week cohort on plateau behavior

### Phase 3 — Insights (weeks 12–20) — **partially shipped early**

1. Cost-per-wear + unworn dashboard → **done** (`InsightsView`, AJA-28)
2. Wishlist → wardrobe one-click; remote clear on reset
3. Harden try-on quality

### Phase 4 — Commerce & circular (months 5–9)

1. Gap-fill affiliate (“shop closet first”)
2. Resale deep links for dormant items
3. Freemium: premium = advanced AI / try-on / analytics — **not** basic closet
4. Optional B2B only after consumer habit proof

## Kill criteria

Stop or pivot to acqui-hire if: onboarding stays multi-hour, D30 collapses post-setup, or neither subscription nor commerce covers CAC.

## Do this week

1. Habit instrumentation (local)
2. First-session path: 5 items → generate → save → wear
3. Upgrade `matching.ts` with weather + occasion
4. Add `wornAt` to item/outfit schema in store + snapshot

#project #wardrobe #research #strategy
