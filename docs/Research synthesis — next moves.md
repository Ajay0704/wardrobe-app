# Research synthesis — next moves

Synthesized from `~/Desktop/Digital_Wardrobe_Research` (Jul 2026) against the current [[Wardrobe App]] product.

**Library index:** [[Research library]] · **Competitor UX:** [[Acloset competitive notes]]  
Related: [[Features]] · [[Architecture]] · [[Data model]] · [[Share Closet]]

Last refreshed: 2026-07-12

## Verdict

The consumer problem is **real but intermittent** (84% “nothing to wear”; most clothes underworn). Pure digital-closet organizers fail on:

1. **Setup chasm** — 8–15 hours to catalog → early churn
2. **Post-setup value cliff** — no reason to return after digitizing
3. **Subscription-only economics** — Cladwell-scale ceiling (~10k paid / ~$330K ARR)

**Win condition:** AI-first, near-zero-setup **weekly styling habit** → then analytics → then commerce/resale. Beachhead: **US/UK** fashion-engaged Gen Z/Millennial women. India = later, ad/commerce, not subscriptions.

**Primary habit KPI (advisor consensus Jul 10):** weekly returning outfit creation — privacy-first / local counters + optional opt-in.

## Jul 12 research refresh

### Why apps still don’t click (roundtable docx)

Consensus: automation helps onboarding, but **unclear daily utility** kills retention. Storytelling is secondary. Keep building the habit loop + first-session value, not narrative for its own sake.

### Hypothesis A — wardrobe as purchase filter

Strong if **trust-first**: “Before you buy clothing, run it through your closet.” Narrow high-friction categories (workwear, denim, shoes, outerwear, travel, premium). Do **not** lead as a shoppable feed — that collapses into LTK/ShopMy gravity. Product today: Smart Buy + wishlist + Find product (AJA-79) are early seeds; keep “don’t buy” integrity.

### Hypothesis B — wardrobe-based fit / returns engine (B2B)

Real retailer pain (fit-driven returns), weak as **first** wedge (two-sided cold start). Later path ≈ AJA-69 after consumer wear-data proof. Start narrow if ever: one category, one retailer, measurable ROI.

### Competitive / demand brief

Caution, not no-go. Indyx / OpenWardrobe already wardrobe→resale; Vendoo etc. own cross-listing. Whitespace only if we combine **consumer wardrobe UX + listing readiness + routing by outcomes** — not “another resale closet.”

### Kids wardrobe snapshot

Qualified adjacent wedge (outgrow cadence). Stronger retention trigger than adult apps; not the current beachhead unless we deliberately pivot. Related idea already in Linear: AJA-63 (family household).

### Founder blueprint (still governing)

Moat = proprietary **wear data**; category ~$224M pure apps but sits next to huge resale/fashion pools; DPP 2027–29; beachhead = closet maximalists / fashion-involved women 18–40.

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

## Do this week (historical — Phase 0/1 largely done)

1. Habit instrumentation (local) — shipped AJA-36
2. First-session path: 5 items → generate → save → wear — still polish AJA-35
3. Upgrade `matching.ts` with weather + occasion — weather shipped; occasion = AJA-59
4. Wear fields — `wearCount` / `lastWornAt` in product

## Current research → product alignment (Jul 12)

| Research priority | Status in product / Linear |
|---|---|
| Kill setup friction | Partial: AI tag, bg remove, clipper, gallery import; full camera-roll scan = AJA-76/82 |
| Daily/weekly habit | Shipped: Home/Today, wear log, calendar, push |
| Purchase filter (Hyp A) | Partial: Smart Buy, wishlist; deepen via AJA-43 |
| Social / Explore | In progress: AJA-87, AJA-95 (community) — watch trust vs shoppable-feed risk |
| Wear-data moat | Instrumentation idea AJA-70; wear log exists |
| Resale / routing | Backlog AJA-42; don’t over-index vs Indyx yet |
| B2B fit engine (Hyp B) | Park until consumer habit proof (AJA-69) |

#project #wardrobe #research #strategy
