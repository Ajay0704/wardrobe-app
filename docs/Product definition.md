# Your Personal Wardrobe — Product Definition

**Status:** Canonical product definition  
**Last updated:** 2026-07-25  
**Owner:** Ajay Karthick Thirumurthi  
**Related:** [[Wardrobe App]] · [[Features]] · [[Research synthesis — next moves]] · [[Phase 0-1 status]] · [[Linear]]

---

## 1. One-line definition

**Your Personal Wardrobe is a closet-grounded shopping copilot** — it digitizes what you own so that, at the moment you’re tempted to buy something new, you can decide with evidence: buy, wait, or skip.

**Tagline:** *Before you buy it, run it through your closet.*

---

## 2. The problem we are solving (one sentence)

**People keep buying clothes they don’t need — because they can’t see their whole closet at the moment of temptation — then regret the purchase and leave most of what they own unworn.**

### What that feels like for a real person

- “I have a full closet and still feel like I have nothing to wear.”
- “I bought something that looks almost exactly like something I already own.”
- “I can’t remember what goes with what when I’m shopping on my phone.”
- “I spend money, feel a spike of hope, then guilt when the item sits unused.”

### What we are *not* mainly solving

| Not this | Why |
|----------|-----|
| Another Instagram / fashion feed | Network effects we don’t have; collapses into LTK gravity |
| Pure “upload every sock” organizer | Category dies on setup chore + no reason to return |
| Generic ChatGPT stylist | No *your* closet = no unique answer |
| Try-on-only shopping mall | Encourages buying; fights our trust promise |

---

## 3. Why this problem is real (evidence)

### Closet blindness and unused clothes

| Source | Finding | Link |
|--------|---------|------|
| WRAP / Citizen Insights — Clothing Longevity (UK) | Typical wardrobe ~118 items; **~26% not worn in the past year**; **39%** say wardrobes are disorganised (46% ages 18–34) | [PDF](https://trustmerchants.org.uk/wp-content/uploads/2023/09/Citizen-Insights-Clothing-Longevity-and-CBM-Receptivity-in-the-UK.pdf) |
| MDPI Sustainability wardrobe study (2022) | About **25% of wardrobe items unused** across countries | [MDPI](https://www.mdpi.com/2071-1050/14/1/487) |
| Vestiaire Collective — “Got Nothing To Wear” | ~**84%** feel they have nothing to wear (higher Gen Z); people **underestimate closet size ~45–50%** in audits; many buy new clothes to “fix” that feeling | [Summary PDF](https://assets.vestiairecollective.com/documents/20260226-GNTW-Consumer-Research-Executive-Summary.pdf) |

### Impulse buying and regret

| Source | Finding | Link |
|--------|---------|------|
| Capital One Shopping impulse research | Clothes among **most common impulse categories** (~**55%** of consumers) | [Research](https://capitaloneshopping.com/research/impulse-buying-statistics/) |
| UK/US impulse surveys (2023) | **~56%** of recent online impulse buyers **regretted** the purchase | [Summary](https://moneyzine.com/uk/resources/impulse-buying-facts-you-should-know-in-2024/) |

### Internal research (Jul 2026)

Folder: `~/Desktop/Digital_Wardrobe_Research/`

- Category fails on **setup chasm** (8–15 hours to catalog) and **post-setup value cliff** (nothing to return for).
- Strongest wedge if trust-first: wardrobe as **purchase filter** (Hypothesis A) — not a shoppable feed.
- “Nothing to wear” despite owning 100+ items is a core consumer paradox in Gen Z / Millennial research packs.

---

## 4. What we are building (solution)

### Product identity

| Layer | Role |
|-------|------|
| **Closet graph** (infrastructure) | What you own, how you wear it, what fits, what you like |
| **Shopping copilot** (wedge) | Capture temptation → closet-aware verdict → log outcome → savings / Decision bank |
| **Styling habit** (supporting) | Outfits, weather, Stylist, wear log — keeps closet data alive |
| **Social** (instrument, not network) | Private asks / future decision councils — not a public fashion feed |

### The core loop we want users to live in

1. **Tempted** anywhere (Safari, Instagram, store, Shop tab)  
2. **Captured** into the app (Share Extension, clipper, wishlist, paste link)  
3. **Judged** against their closet (Smart Buy / Stylist buy_advice — with evidence)  
4. **Decided** — bought / skipped / wait (logged)  
5. **Banked** — Decision bank shows money kept / smarter next time  
6. **Worn** — wear log + Insights deepen the graph  

### North-star product outcome

Users **buy fewer redundant clothes**, feel **smarter when they skip**, and **wear more of what they already own**.

---

## 5. Who is our target customer

### Primary beachhead (build for them first)

**US / UK women, roughly 22–38**, fashion-engaged enough to browse and save products often, but **motivated by less waste / less regret** — not by being a “fashionista influencer.”

**Psychographic (more important than age alone):**

- Screenshots / saves products compulsively  
- Feels closet guilt or “I already own something like that”  
- Tech-comfortable (will try AI + share-sheet)  
- Open to “buy less, wear more” identity (low-buy / no-buy adjacent communities are a sharp wedge inside this beachhead)

**Research note (Bang & Su-style adoption framing in our synthesis):** sustainability-minded + tech-forward organizers convert better than pure fashion-involvement alone.

### Secondary (serve later or lightly)

| Segment | Why secondary |
|---------|----------------|
| Men who shop online and overbuy basics | White space vs competitors; include via `shopGender`, don’t lead GTM yet |
| Capsule / minimalist planners | Overlap with Cladwell; good users but smaller urgency at temptation |
| Travel packers | Pack with friends is real; not the main wedge |

### Explicitly not the primary customer (yet)

| Segment | Why not first |
|---------|----------------|
| India-first mass market | Prior research: low WTP for this category historically |
| Hardcore fashion influencers needing a public feed | They already have Instagram / LTK |
| Users who refuse any cataloging | Until camera-roll auto-build is magic, they churn |
| Retailers as buyer of B2B fit data | Hyp B — park until consumer habit proof |

### Persona snapshot — “Maya” (primary)

- 29, works in a city, shops H&M / Zara / mid brands online  
- Closet is full; still buys on payday / sales  
- Has returned items that “didn’t go with anything”  
- Would love a savvy friend who knows her closet — not another shopping feed  
- Success for her: “I skipped three things this month and wore the blazer I already owned twice.”

---

## 6. Jobs to be done

| Job | When | Success looks like |
|-----|------|--------------------|
| **Decide whether to buy** | Tempted by a product | Clear buy / wait / skip with reasons |
| **See what I own** | Morning / packing / shopping | Closet is searchable and visual in seconds |
| **Get dressed without stress** | Daily / events | Outfit from *my* clothes |
| **Feel less wasteful** | After a skip or end of month | Decision bank / CPW / unworn % |
| **Ask a trusted person** | High-stakes buy | Private share / council (future) — not public voting |

Primary JTBD we must own first: **decide whether to buy**.

---

## 7. Positioning

| | |
|--|--|
| **Category we claim** | Closet-grounded shopping copilot |
| **Against closet apps** | We’re not “organize forever” — we help you **not buy** (and buy better) |
| **Against AI stylists** | Grounded in *your* wardrobe + wear data, not generic fashion chat |
| **Against try-on shops (Glance / Alta-class)** | Visualization without closet conflict is just a prettier mall |
| **Against social fashion (Whering / Acloset feed)** | Social is a **decision instrument**, not the product |

**One-line competitive claim:**  
*The only app that treats “don’t buy” as a first-class win — backed by your real closet.*

---

## 8. What we have built today (Jul 25, 2026)

### Surfaces

- **Web / PWA:** https://wardrobe-app-lilac-two.vercel.app  
- **iOS:** Capacitor shell → `/n?native=1` · TestFlight / App Store path in progress  
- **Tabs:** Explore · Closet · ＋ · Outfits · Profile  
- **Chrome / Edge clipper** + **iOS Share Extension** + Web Share Target  

### Wedge-critical (shipped or partial)

| Capability | Status |
|------------|--------|
| Closet digitization (photo, URL extract, beautify, multi-garment) | Shipped |
| Wishlist + Smart Buy (buy / maybe / skip + evidence) | Shipped |
| Decision outcomes + Decision bank (Insights) | Shipped (AJA-190) |
| Share into app (links + images) | Shipped (AJA-201); auto-verdict on capture still open (AJA-191) |
| Closet-grounded Stylist (incl. buy_advice) | Shipped |
| Sample closet first-run | Shipped (AJA-198/199) |
| Wear log, calendar, Insights / CPW | Shipped |
| Shop (SerpAPI) + gender filters | Shipped |
| Pack with friends | Shipped |
| Private decision councils (rewire Share Closet) | Not yet (AJA-192); Share Closet UI currently unwired |

### Stack (summary)

Next.js 16 · React 19 · Supabase (auth, snapshots, events, social, trips) · Gemini · SerpAPI · Capacitor iOS · Vercel  

Branch focus: `feat/v1.1.0-social-auth` (Google/Apple OAuth, handles, delete account) · marketing version **1.1.0**.

Full inventory: [[Features]] · status: [[Phase 0-1 status]]

---

## 9. How we win (strategy)

1. **Trust before commerce** — affiliate / Shop only after a honest verdict; “skip” must feel good.  
2. **Capture at the temptation** — Share Extension / clipper are more important than a prettier feed.  
3. **Close the loop** — every verdict should become a logged decision; Decision bank is the retention artifact.  
4. **Closet quality without 15-hour setup** — sample closet now; camera-roll magic next.  
5. **Wear data moat** — what people actually wear (and skip) compounds; competitors can’t copy from a cold start.  
6. **Social stays private** — 1–3 person councils later; freeze feed vanity metrics.

### Business model direction (later; don’t lead GTM here)

- Free core closet + decisions (never paywall “don’t buy”)  
- Commerce: affiliate on **buy** verdicts with high intent  
- Premium: advanced AI / try-on / analytics (supporting)  
- Resale deep links for unworn (later)  
- B2B fit / returns (park until consumer proof)

Standalone “organizer app” TAM is small; the venture-scale path attaches the closet graph to **decision-time commerce** and eventually resale — without becoming a mall.

---

## 10. Success metrics (what proves we’re right)

Weekly scorecard mindset (see analytics plan):

| Metric | Why it matters |
|--------|----------------|
| **Activated in 48h** (real owned item, not only samples) | No closet → no product |
| **Temptations captured** / active user | Fuel for the copilot |
| **Decision close rate** (≥40% target) | Proof we’re a decision app |
| **Skip share** of decisions | Trust in “don’t buy” |
| **Return in 14 days** after a decision | Habit of the wedge |
| Closet depth (median; % &lt;10 items) | Verdict quality risk |

Vanity metrics we do **not** optimize first: followers, likes, DAU like a social network.

---

## 11. Competitive landscape (short)

| App | They optimize for | Our edge vs them |
|-----|-------------------|------------------|
| Whering | Social wardrobe + sustainability | Decision closure + capture-first; less feed gravity |
| Acloset | AI closet + community + try-on | Trust-first skip + Decision bank |
| OpenWardrobe / Lola | Closet + shopping copilot | Closest peer — we match with outcomes logging + share-in |
| Style DNA | Color/body profile shopping | Closet + wear data, not only appearance DNA |
| Glance / Alta-class | Try-on → buy | Closet conflict check + “don’t buy” integrity |
| Cladwell / GetWardrobe / Indyx | Capsule / planner / analytics | Temptation-moment workflow |

---

## 12. What we will not do (guardrails)

- Lead with a shoppable Explore that ignores the closet  
- Paywall basic closet or “skip” advice  
- Turn Messages into generic social for growth hacks  
- Chase App Store (AJA-8) before wedge metrics are clear — unless explicitly requested  
- Pretend daily DAU is the north star for a purchase-decision product  

---

## 13. Near-term priorities (product)

1. **Prove the decision loop** — capture → Smart Buy → outcome → Decision bank (instrument + improve)  
2. **Capture as hero** — Share Extension adoption + verdict-on-capture (AJA-191)  
3. **First-run magic** — real clothes fast (samples today; camera-roll depth next)  
4. **Wire Share Closet → private councils** only after solo close-rate is healthy (AJA-192)  
5. Finish **v1.1.0** auth (Google/Apple) for distribution  

Tracked in [[Linear]] · project [Your Personal Wardrobe](https://linear.app/ajay-karthick/project/your-personal-wardrobe-629ac27fcd73).

---

## 14. Team / ops context

| | |
|--|--|
| Repo | [Ajay0704/wardrobe-app](https://github.com/Ajay0704/wardrobe-app) |
| Production | https://wardrobe-app-lilac-two.vercel.app |
| Issue tracking | Linear team `AJA` |
| Docs | Obsidian vault in `docs/` · Notion hub synced Jul 25 |
| Research | `~/Desktop/Digital_Wardrobe_Research/` |

---

## 15. Sources (master list)

**External**

- [WRAP / Citizen Insights — Clothing Longevity (UK)](https://trustmerchants.org.uk/wp-content/uploads/2023/09/Citizen-Insights-Clothing-Longevity-and-CBM-Receptivity-in-the-UK.pdf)  
- [MDPI — Exploring Worldwide Wardrobes (2022)](https://www.mdpi.com/2071-1050/14/1/487)  
- [Vestiaire — Got Nothing To Wear research summary](https://assets.vestiairecollective.com/documents/20260226-GNTW-Consumer-Research-Executive-Summary.pdf)  
- [Capital One Shopping — Impulse buying statistics](https://capitaloneshopping.com/research/impulse-buying-statistics/)  
- [Moneyzine — Impulse buying facts](https://moneyzine.com/uk/resources/impulse-buying-facts-you-should-know-in-2024/)  
- [OpenWardrobe](https://www.openwardrobe.co/) · [Whering](https://whering.co.uk/) · [Acloset updates](https://www.acloset.app/announcements/6-9-0-update-news-bb3ff9/)  

**Internal**

- `~/Desktop/Digital_Wardrobe_Research/Your_Personal_Wardrobe__Strategy_Synthesis.md`  
- `~/Desktop/Digital_Wardrobe_Research/Strategy_Revenue_and_Validation_2026-07-18.md`  
- [[Research synthesis — next moves]]  
- [[Features]] · [[Phase 0-1 status]]  
- Desktop competitive / validation HTML reports (Jul 2026)

---

## 16. Document control

This is the **source of truth for “what is the product and who is it for.”**  
Feature detail lives in [[Features]]. Issue execution lives in Linear. Weekly learning from users will live in `Analytics.md` once the scorecard ships.

#product #definition #strategy #wardrobe
