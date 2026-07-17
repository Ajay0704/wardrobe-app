# Scale architecture

Last updated: 2026-07-13

**Target:** App Store + Play Store product apps, a marketing website that is fully separate from the product UI, shared API on cloud.

**Today:** one Next.js app on Vercel serves marketing + product + API; Capacitor loads production `/n`. See [[Architecture]].

Linear epic: [AJA-100](https://linear.app/ajay-karthick/issue/AJA-100) Scale: separate marketing web + App Store + Play Store. Related: [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8) App Store later.

## Defaults locked

1. **Mobile:** stay **Capacitor** for iOS + Android (shared React UI) — not a React Native/Flutter rewrite yet.
2. **Website:** **marketing-only** (landing, how-it-works, download CTAs, legal, support). Product closet UX lives in the **apps only**.
3. **Backend:** **Supabase + Vercel** as cloud core; graduate off giant `wardrobe_snapshots` JSONB when MAU demands it.
4. **Domains:** apex/`www` = marketing; `api.` = BFF; `app.` = product shell for Capacitor — **never** load marketing into the WebView.

## Target shape

```
Clients                          Cloud
───────                          ─────
iOS (Capacitor → App Store) ─┐
Android (Capacitor → Play)  ─┼──► api.wardrobe.app (Vercel BFF + Cron)
Chrome/Edge clipper         ─┘         │
                                       ├── Supabase Auth / Postgres / Storage
                                       ├── Gemini · FASHN · SerpAPI
                                       └── eBay / Skimlinks / Amazon

Marketing (www / apex) ──deep links only──► App Store / Play Store
```

## Three surfaces (strict split)

| Surface | What | Deploy | Target repo layout |
|---------|------|--------|--------------------|
| **Marketing website** | Brand, SEO, download CTAs, legal, support | Vercel project `wardrobe-web` · `www` / apex | `apps/web` |
| **Product apps** | Full closet (Home, Closet, Outfits, Explore…) | Capacitor → App Store + Play Store | `apps/mobile` (today’s product UI) |
| **API / BFF** | Auth helpers, AI, clip, explore, push, shares | Vercel project `wardrobe-api` · `api.` | `apps/api` (from `src/app/api`) |

**Hard rule:** Capacitor `server.url` → product host (`app.`), never the marketing site. Dual UI on one URL (`AppShell` / `/n`) is retired for scale.

## Cloud: what to use

| Layer | Choice | Why |
|-------|--------|-----|
| Auth + DB + Storage | **Supabase** | Already wired; Auth, RLS, Storage, Postgres |
| API / Cron | **Vercel** (split projects) | Existing Next API + `vercel.json` crons |
| Marketing CDN | Vercel Edge | SEO site |
| Mobile binaries | App Store + Google Play | AJA-8 + Play listing |
| Push | **APNs** + **FCM** via Capacitor | Replace web-push-only for store apps |
| AI | Gemini + FASHN (when funded) | Current + AJA-21 |
| Search / commerce | SerpAPI, eBay, Skimlinks, Amazon | [[Architecture]] platforms catalog |
| Design | Figma | Required |
| Observability | Sentry + PostHog / Vercel Analytics | Add before paid UA |
| Secrets | Vercel env + Supabase dashboard | Never in clients |

**Not introducing now:** AWS/GCP full stack, Kubernetes, Nest/FastAPI. Revisit only for heavy ML CPU or EU residency.

## Where to deploy

| Asset | Host | Domain example |
|-------|------|----------------|
| Marketing | Vercel `wardrobe-web` | `https://wardrobe.app` / `www.` |
| API | Vercel `wardrobe-api` | `https://api.wardrobe.app` |
| Product WebView content | Product build on CDN / `app` | `https://app.wardrobe.app` |
| Images | Supabase Storage | — |
| iOS binary | App Store Connect | — |
| Android binary | Play Console | — |
| Clipper | Chrome Web Store / Edge | calls `api.` |

CI: GitHub Actions — `main` → deploy web + api; release tags → Cap sync + store upload (Fastlane / Capacitor).

## Data & API (scale path)

### Phase A (near-term)

- Keep Zustand + `wardrobe_snapshots` sync.
- Next route handlers; apps auth with Supabase JWT.
- CORS allow app origins + clipper.

### Phase B (when scaling)

- Normalize tables: `items`, `outfits`, `calendar_entries`, `wishlist`, `profiles`.
- Server-owned writes for clip / share / explore (service role already partial).
- Rate-limit AI; queue try-on / ingest via cron or background functions.
- Keep `/api/events` privacy-first; warehouse later if needed.

## Mobile stores

| | iOS | Android |
|--|-----|---------|
| Shell | Capacitor (`ios/`) | Capacitor (`android/` — add) |
| Account | Apple Developer $99/yr | Google Play $25 one-time |
| Push | APNs | FCM |
| Build | Xcode + CI | Android Studio / Gradle + CI |
| Plugins | Camera, Geo, Share, Notifications → Push | Same |

Shared product: `src/components`, `src/lib`. Core ML scan (AJA-82) stays iOS; Android starts with gallery import.

## Marketing website pages

Home · How it works · Download (store badges) · Privacy · Terms · Support · optional Blog.

No Closet / Outfits / Zustand. Optional waitlist → Supabase or Resend.  
Deep links: `/app` → store or Universal Links / App Links into installed app.

## Migration from today → scale

Tracked under [AJA-100](https://linear.app/ajay-karthick/issue/AJA-100) · children: [AJA-101](https://linear.app/ajay-karthick/issue/AJA-101) marketing · [AJA-102](https://linear.app/ajay-karthick/issue/AJA-102) API · [AJA-103](https://linear.app/ajay-karthick/issue/AJA-103) Android + `app.` host.

1. Extract marketing (`src/app/page.tsx`, landing) → `apps/web` (AJA-101).
2. Extract `src/app/api` → `apps/api`; CORS for apps + clipper (AJA-102).
3. Point Capacitor at `app.` product build (not apex) (AJA-103).
4. Add Android Capacitor project; Play Console listing (AJA-103).
5. Enroll Apple Developer; TestFlight → App Store (AJA-8).
6. Store push via APNs/FCM; drop web-push as the primary habit channel for store users.
7. Document env matrix (web / api / iOS / Android) in `.env.example` + this vault.

## Cost floor (ready to scale — infra, not ads)

| Item | Cost |
|------|------|
| Apple Developer | $99/yr |
| Google Play | $25 once |
| Vercel Pro (when needed) | ~$20/user/mo |
| Supabase Pro | from $25/mo |
| Figma | $0–16/mo |
| Chrome Web Store | $5 once |
| FASHN / SerpAPI / Gemini | usage — see [[Architecture#Required apps (separate) + costs]] |

Paid UA (Meta / Apple Search Ads / TikTok) = acquisition budget, not platform.

## Related

- [[Architecture]] — current org map + required apps costs
- [[Deploy]] — today’s Vercel/Netlify
- [[iOS Capacitor]] — personal-device shell
- [[Browser extension]]
- [[Research synthesis — next moves]]

#project #wardrobe #architecture #scale
