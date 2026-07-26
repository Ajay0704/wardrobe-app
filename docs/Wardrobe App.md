# Wardrobe App

Project hub for the personal wardrobe app — notes, architecture, and decisions live here while code lives in the repo root.

Last updated: 2026-07-25

## Quick links

- [[Product definition]] — **canonical: what we build, why, who for**
- [[Architecture]]
- [[Scale architecture]]
- [[Features]]
- [[Data model]]
- [[Supabase sync]]
- [[Deploy]]
- [[Obsidian setup]]
- [[Research synthesis — next moves]]
- [[Research library]]
- [[Acloset competitive notes]]
- [[Onboarding quiz research]]
- [[Phase 0-1 status]]
- [[Browser extension]]
- [[Share Extension]]
- [[Photo to product]]
- [[Share Closet]]
- [[iOS Capacitor]]
- [[Claude Code handoff — iOS Capacitor]]
- [[Linear]]
- [[TestFlight]]

## Product thesis (current)

**Closet-grounded shopping copilot** — “Before you buy it, run it through your closet.”

Full definition (problem, audience, evidence, shipped product, metrics): [[Product definition]].

Closet catalog + wear data are infrastructure; Smart Buy + capture (clip/share) + decision outcomes + Decision bank are the wedge. Social stays private / decision-shaped (Share Closet → future councils), not a generic fashion feed.

## Current product snapshot

- **Web / PWA:** marketing landing + signed-in app; Web Share Target (`?clipUrl=`)
- **iOS:** Capacitor → `/n?native=1` · tabs **Explore · Closet · ＋ · Outfits · Profile** (Home tab retired — AJA-169). Floating Messages bubble; Stylist pinned in Messages.
- **Native version (branch `feat/v1.1.0-social-auth`):** marketing **1.1.0** / build **5**
- **Phase 0–1:** shipped
- **Copilot wedge (partial):** Decision loop + Decision bank (AJA-190, code shipped); iOS Share Extension + Web Share Target (AJA-201 Done); capture→verdict still open (AJA-191); decision councils still open (AJA-192)
- **Auth / App Store:** Google + Apple OAuth in progress (AJA-194); validated `@handle` (AJA-195); account deletion (AJA-197); find-friends fixes (AJA-196)
- **First-run:** labeled gender-matched Sample closet + Explore activation (AJA-198/199)
- **Also shipped:** Stylist, Shop (SerpAPI), Smart Buy, Find product, Pack with friends, Insights, beautify, camera-roll onboarding paths, Support/Rate
- **Research folder:** `~/Desktop/Digital_Wardrobe_Research` — see [[Research library]]

Notion hub: [Your Personal Wardrobe](https://app.notion.com/p/396c075eff4c814eabb8d6825530f504) · [New ideas](https://app.notion.com/p/39ac075eff4c8146990be35f0d3506b3) — synced with vault **2026-07-25**

## Repo

- Path: `/Users/ajaythirumurthi/wardrobe-app`
- GitHub: [Ajay0704/wardrobe-app](https://github.com/Ajay0704/wardrobe-app)
- Production: https://wardrobe-app-lilac-two.vercel.app
- Active branch (Jul 25): `feat/v1.1.0-social-auth`

## Dev commands

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## iOS (Capacitor)

Native shell for iPhone / TestFlight (WebView → production `/n`). See [[iOS Capacitor]], [[Share Extension]], [[TestFlight]].

```bash
npm run cap:sync
npm run cap:open:ios
```

## Tags

#project #wardrobe #nextjs
