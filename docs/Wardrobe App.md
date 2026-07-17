# Wardrobe App

Project hub for the personal wardrobe app — notes, architecture, and decisions live here while code lives in the repo root.

Last updated: 2026-07-16

## Quick links

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
- [[Photo to product]]
- [[Share Closet]]
- [[iOS Capacitor]]
- [[Claude Code handoff — iOS Capacitor]]
- [[Linear]]

## Current product snapshot

- **Web:** marketing landing + signed-in top-nav app
- **iOS:** Capacitor → `/n?native=1` · tabs **Home · Closet · ＋ · Outfits · Explore** (AJA-86); profile via header avatar / social profile (AJA-92)
- **Phase 0–1:** shipped (AJA-36 habit + web push activated)
- **Also shipped:** Insights, camera capture, currency + brand picker, native editor stability (AJA-33), browser clipper (AJA-78), Smart Buy, Find product (AJA-79), Share Closet, Support/Rate (AJA-55/56), My page redesign (AJA-90)
- **In progress:** Explore feed / community (AJA-87, AJA-95); camera-roll auto scan (AJA-82); onboarding first-win (AJA-35)
- **Research folder:** `~/Desktop/Digital_Wardrobe_Research` — see [[Research library]]

Notion hub (broader product docs): [Your Personal Wardrobe](https://app.notion.com/p/396c075eff4c814eabb8d6825530f504) · [New ideas](https://app.notion.com/p/39ac075eff4c8146990be35f0d3506b3) — synced with vault **2026-07-16**

## Repo

- Path: `/Users/ajaythirumurthi/wardrobe-app`
- GitHub: [Ajay0704/wardrobe-app](https://github.com/Ajay0704/wardrobe-app)
- Production: https://wardrobe-app-lilac-two.vercel.app

## Dev commands

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## iOS (Capacitor)

Native shell for personal iPhone testing (WebView → production `/n`). See [[iOS Capacitor]] for Xcode signing, free Apple ID limits (~7-day reinstall), and local debug.

```bash
npm run cap:sync
npm run cap:open:ios
```

## Tags

#project #wardrobe #nextjs
