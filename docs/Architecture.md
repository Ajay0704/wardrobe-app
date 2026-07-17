# Architecture

Last updated: 2026-07-16

Canonical org map of surfaces, APIs, services, and data. For product status see [[Wardrobe App]]. **Required apps + costs** are listed in a dedicated section below (and in the Cursor canvas `required-apps-costs`).

**Scale target** (App Store + Play Store + separate marketing site): [[Scale architecture]].

## Org at a glance

```
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Website /  │  │ iOS Capacitor│  │ Wishlist clipper │
│  PWA        │  │ /n?native=1  │  │ (Chrome MV3)     │
└──────┬──────┘  └──────┬───────┘  └────────┬─────────┘
       │                │                     │
       └────────┬───────┴──────────┬──────────┘
                ▼                  ▼
         AppShell / NativeShell   /api/clip|/api/extract
                ▼
            Zustand (localStorage)
                │  (signed in)
                ▼
            Supabase (snapshots + Storage + auth)
                ▲
                │
         Next.js API routes on Vercel
                │
    ┌───────────┼───────────┬────────────┬──────────────┐
    ▼           ▼           ▼            ▼              ▼
  Gemini     SerpAPI    Open-Meteo    web-push     eBay / Skimlinks
  FASHN      SearchApi               (cron)        (+ affiliates)
```

Design: **Figma**. Distribution still required: **App Store / TestFlight / APNs** (AJA-8), **Chrome Web Store** (AJA-78). Commerce later: **Amazon / ShopStyle / CJ / Rakuten**, **resale** (AJA-42). Try-on upgrade: **FASHN VTON** (AJA-21, budget-blocked).
## Stack

- **Next.js 16** — App Router
- **React 19** + TypeScript
- **Tailwind CSS v4**
- **Zustand** — localStorage persistence
- **Supabase** — auth, Storage, snapshot sync, push subscriptions
- **Capacitor 8** — iOS WKWebView shell → live production URL
- **html-to-image** — outfit PNG export
- **Open-Meteo** — weather for Home suggestions
- **web-push** — PWA morning / Sunday nudges (env-gated)
- **Gemini** — analyze, extract, try-on (fallback until FASHN)
- **FASHN API** — identity-preserving VTON (planned · AJA-21)
- **SerpAPI / SearchApi** — visual product search
- **Figma** — UI/UX design source of truth

## Client surfaces

| Surface | Entry | Chrome | Host |
|---------|-------|--------|------|
| Website | `/` | Top nav + footer (`AppShell` web) | Vercel · PWA |
| iOS app | `/n?native=1` | Bottom tabs: Home · Closet · ＋ · Outfits · Explore | Capacitor → live Vercel URL |
| Wishlist clipper | `extensions/wishlist-clipper` | MV3 Chrome/Edge | Calls `/api/clip` + `/api/extract` |

Detection (any true → lock native): Capacitor bridge, UA `WardrobeApp`, `?native=1`, path `/n`, `html.native-app` + localStorage latch. Product URLs open via Capacitor **Browser** (never replace the WebView). Shared screens render through `AppViews.tsx` inside either shell.

## Platforms catalog (live + required)

Status: **Live** = in production · **Wired** = code ready, needs account/keys · **Required** = roadmap, not built yet

### Infra & distribution

| Platform | Role | Status | Notes |
|----------|------|--------|-------|
| **Vercel** | Host + Cron | Live | Primary deploy |
| **Supabase** | Auth, Storage, snapshots, push | Live | Project `hfkgucfrqpzpxdzhszgb` |
| **GitHub** | Source | Live | [Ajay0704/wardrobe-app](https://github.com/Ajay0704/wardrobe-app) |
| **Netlify** | Alt Next deploy | Wired | Prefer Vercel |
| **Xcode + free Apple ID** | Personal device install | Live | ~7-day resign cycle |
| **Apple Developer Program** | $99/yr · signing · APNs | Required | [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) |
| **TestFlight** | Beta iOS distribution | Required | After paid Apple account |
| **Apple App Store** | Public iOS + Rate the app | Required | Needs `NEXT_PUBLIC_IOS_APP_ID` |
| **APNs** | Remote push on native | Required | Local notifications only today |
| **Chrome Web Store** | Publish wishlist clipper | Required | Unpacked today · [AJA-78](https://linear.app/ajay-karthick/issue/AJA-78) |
| **Edge Add-ons** | Same MV3 clipper | Required | After Chrome listing |

### AI / search / weather

| Platform | Role | Status | Env |
|----------|------|--------|-----|
| **Gemini** | analyze, extract, try-on (fallback) | Live | `GEMINI_API_KEY` |
| **FASHN API** | Identity-preserving virtual try-on (VTON) | Required | `FASHN_API_KEY` · [AJA-21](https://linear.app/ajay-karthick/issue/AJA-21) (blocked on budget) · [docs.fashn.ai](https://docs.fashn.ai/) |
| **SerpAPI** | Google Lens · find-product | Live | `SERPAPI_API_KEY` |
| **SearchApi.io** | Yandex reverse image backup | Live | `SEARCHAPI_API_KEY` |
| **Open-Meteo** | Weather for Home | Live | No key |
| **web-push / VAPID** | PWA morning + Sunday nudges | Live | `VAPID_*`, `CRON_SECRET` |
| **Google Shopping** | Fallback buy-search URLs | Live (fallback) | Until affiliates live |

### Commerce / affiliate / feeds

| Platform | Role | Status | Env / issue |
|----------|------|--------|-------------|
| **eBay Browse API** | Explore product feed | Wired | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` |
| **eBay Partner Network** | Affiliate-tracked buy links | Wired | `EBAY_CAMPAIGN_ID` |
| **Skimlinks** | Multi-merchant affiliate feed | Wired | `SKIMLINKS_API_*` · publisher 306112 · AJA-93 |
| **DummyJSON** | Feed bridge (no keys) | Live (bridge) | Replaced once eBay/Skimlinks on |
| **Amazon Associates** | Per-domain affiliate tags | Required | Placeholders in `affiliate.ts` |
| **ShopStyle** | Fashion affiliate network | Required | Placeholder in `affiliate.ts` |
| **CJ / Rakuten** | Catalog affiliate networks | Required | Named in shop schema sources |
| **Depop / Poshmark / ThredUp / The RealReal** | Resale deep links | Required | [AJA-42](https://linear.app/ajay-karthick/issue/AJA-42) |
| **Retailer sites (in-app WebView)** | Purchase-history import | Required | [AJA-88](https://linear.app/ajay-karthick/issue/AJA-88) · no official OAuth |

### Ops / product tooling

| Tool | Role | Status |
|------|------|--------|
| **Linear** (team AJA) | Source of truth for work | Live — [[Linear]] |
| **Figma** | UI/UX design · screens · component specs | Required |
| **Obsidian** (`docs/`) | Architecture, features, runbooks | Live |
| **Notion** | Broader product / research hub | Live |
| **Cursor + Claude Code** | Agents · `AGENTS.md` | Live |

## Required apps (separate) + costs

Not live yet. Full catalog above; this is the **must-get** list only. Prices checked Jul 2026.

| App / platform | Why | Cost | When |
|----------------|-----|------|------|
| **Apple Developer Program** | TestFlight, App Store, APNs, Rate the app | **$99 / year** ([Apple](https://developer.apple.com/programs/)) | [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) |
| **Chrome Web Store** | Publish wishlist clipper | **$5 one-time** | [AJA-78](https://linear.app/ajay-karthick/issue/AJA-78) |
| **Edge Add-ons** | Same clipper on Edge | **$0** | After Chrome |
| **FASHN API** | Identity-preserving VTON | **$0.075 / credit** · min **$7.50** (100 credits) · Tier I **$19/mo** (282 credits) · Tier II **$249/mo** ([FASHN pricing](https://help.fashn.ai/plans-and-pricing/api-pricing)) | [AJA-21](https://linear.app/ajay-karthick/issue/AJA-21) budget-blocked |
| **Figma** | UI/UX design | **Starter $0** · Pro Full seat **$16/mo** ([Figma pricing](https://www.figma.com/pricing/)) | Before major redesigns |
| **eBay Browse + Partner Network** | Explore feed + affiliate | **$0** to join · commission on sales | Wired · needs keys |
| **Skimlinks** | Multi-merchant affiliate | **$0** to join · revenue share (Skimlinks keeps a % of commission) | AJA-93 |
| **Amazon Associates** | Affiliate tags | **$0** to join · commission on sales | `affiliate.ts` |
| **ShopStyle / CJ / Rakuten** | Catalog affiliates | **$0** join · revenue share | Commerce phase |
| **Depop / Poshmark / ThredUp / RealReal** | Resale deep links | **$0** (deep links) | [AJA-42](https://linear.app/ajay-karthick/issue/AJA-42) |

### FASHN try-on unit cost

| Mode | Credits | On-demand $ |
|------|---------|-------------|
| VTON v1.6 | 1 | **$0.075** |
| Try-On Max 1K Fast | 1 | **$0.075** |
| Try-On Max 1K Balanced | 2 | **$0.15** |
| Try-On Max 4K Quality | 5 | **$0.375** |

Rough monthly: 140 Max@1K balanced ≈ Tier I **$19**; ~1,000 same ≈ **~$150** on-demand.

### Live services (watch spend as usage grows)

| Service | Now | Next paid step |
|---------|-----|----------------|
| Vercel | Hobby **$0** | Pro **$20/user/mo** ([Vercel](https://vercel.com/pricing)) |
| Supabase | Free | Pro from **$25/mo** ([Supabase](https://supabase.com/pricing)) |
| SerpAPI | Free **250**/mo | Starter **$25/mo** / 1,000 ([SerpAPI](https://serpapi.com/pricing)) |
| SearchApi.io | **100** free | Developer from **$40/mo** ([SearchApi](https://www.searchapi.io/pricing)) |
| Gemini Flash Image | Pay-as-you-go | ~**$0.067** / 1K image ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)) |

**Early-stage floor:** Apple ≈ **$8.25/mo** + Chrome **$5 once** + Figma **$0**. Add FASHN only after budget approval.

## API surface


All under `src/app/api/` (Node runtime).

| Route | Purpose | Depends on |
|-------|---------|------------|
| `/api/analyze` | AI tag item (category, color, brand…) | Gemini |
| `/api/extract` | Product page → name/image/price | Gemini + HTML parse |
| `/api/tryon` | Virtual try-on image edit | Gemini today · FASHN planned (AJA-21) |
| `/api/beautify` · `/api/beautify/refine` | Packshot / white-bg polish | Gemini |
| `/api/cutout` | Garment-only segmentation | Hugging Face SegFormer |
| `/api/detect-garments` | Multi-garment detect in a photo | Gemini |
| `/api/stylist/chat` | AI stylist conversation | Gemini |
| `/api/find-product` | Closet photo → shop links | SerpAPI / SearchApi |
| `/api/shop/search` · `/api/shop/product/[id]` | Shop catalog search / product | eBay / Skimlinks / DummyJSON |
| `/api/clip` | Extension wishlist append | Supabase service role |
| `/api/closet-share` | Create / fetch Share Closet | Supabase service role |
| `/api/closet-share/reply` | Guest reply on share link | Supabase service role |
| `/api/explore/feed` | Explore social feed | Supabase |
| `/api/import/email` · `/api/import/accept` | Purchase email import (Postmark) | Gemini + inbound webhook |
| `/api/cron/import-cleanup` | Expire pending imports | `CRON_SECRET` |
| `/api/push/subscribe` | Store / delete web-push sub | Supabase service role |
| `/api/cron/daily-outfit` | Morning outfit push (11:00 UTC) | web-push + Supabase |
| `/api/cron/ingest-feed` | Explore feed ingest (06:00 UTC) | `CRON_SECRET` |
| `/api/detect` | Garment detect / embedding path | Supabase admin |
| `/api/segment-outfit` | Outfit photo → piece segments | — |
| `/api/closet` | “I own this” + own event | Supabase admin |
| `/api/wishlist` | Add pictured/catalog to wishlist | Supabase admin |
| `/api/similar` | Similar items | Matching lib |
| `/api/goes-with` | Pairs-with suggestions | Matching lib |
| `/api/profile/[handle]` | Public social profile | Supabase |
| `/api/events` | Fire-and-forget telemetry | Supabase admin |
| `/api/debug-log` | Dev agent debug sink | — |

Cron schedules live in `vercel.json`.

## Data & state

1. UI reads/writes via `useWardrobe()` (Zustand).
2. Zustand persists to `localStorage` key `wardrobe-store-v2`.
3. When Supabase env vars are set, [[Supabase sync]] pushes/pulls in the background.

| Layer | What |
|-------|------|
| **Client** | items · outfits · trips · calendar · profile · theme · draft |
| **Supabase tables** | `wardrobe_snapshots`, `push_subscriptions` |
| **Storage** | `wardrobe-images` bucket |
| **Capacitor plugins** | Camera, Geolocation, Share, Local Notifications, Browser, Splash, Status Bar |

See [[Data model]] for field-level detail.

## Repo layout

```
src/
├── app/                 # Next.js pages + API routes
│   ├── n/               # Capacitor native-only entry
│   ├── extension/       # Clipper connect page
│   ├── share/           # Public share pages
│   └── api/             # analyze, extract, tryon, push, cron, …
├── components/
│   ├── native/          # NativeShell (bottom tabs)
│   ├── landing/         # Marketing landing (web, signed-out)
│   └── …                # Shared views (Home, Closet, Insights, …)
└── lib/
    ├── platform.ts      # Native detection, Browser.open, boot script
    ├── store.ts         # Zustand
    ├── weather.ts / currency.ts / brands.ts / affiliate.ts
    └── supabase/        # client, auth, sync, storage

ios/                     # Capacitor native project
extensions/              # wishlist-clipper
supabase/                # schema.sql + migrations
docs/                    # Obsidian vault
scripts/                 # Linear commit notify, seeds
```

## Key files

| Area | Path |
|------|------|
| App shell / dual UI | `src/components/AppShell.tsx` |
| Native chrome | `src/components/native/NativeShell.tsx` |
| Shared views | `src/components/AppViews.tsx` |
| Native platform | `src/lib/platform.ts` |
| Capacitor config | `capacitor.config.ts` |
| Zustand store | `src/lib/store.ts` |
| Domain types | `src/lib/types.ts` |
| Supabase sync | `src/lib/supabase/sync.ts` |
| Env template | `.env.example` |

## Related

- [[Scale architecture]] — App Store + Play + separate marketing site
- [[Data model]]
- [[Features]]
- [[Supabase sync]]
- [[iOS Capacitor]]
- [[Browser extension]]
- [[Deploy]]
- [[Linear]]
