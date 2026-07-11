# Claude Code handoff — iOS Capacitor + dual UI

**Audience:** Claude Code (or any agent continuing this work)  
**Date:** 2026-07-10  
**Repo:** `/Users/ajaythirumurthi/wardrobe-app` · GitHub `Ajay0704/wardrobe-app`  
**Owner:** Ajay Thirumurthi  
**Do not commit unless the user asks.**

---

## 1. Executive summary

We wrapped the existing **Next.js 16** wardrobe web app in a **Capacitor iOS** shell so it installs on Ajay’s iPhone via Xcode with a **free Apple ID** (no paid Developer Program / TestFlight / App Store yet).

**Architecture decision (locked):** Capacitor WKWebView loads the **live production URL** (or configurable local Next). We do **not** use `output: 'export'` — API routes (`/api/analyze`, `/api/tryon`, `/api/extract`, cron/push) must stay server-side.

**Status:** App installs and runs on device. Auth/closet work against production. Mobile layout was fixed after WKWebView defaulted to desktop. **Next product ask:** make the **app look different from the website** while sharing one backend — **Option 1** (same URL, branch UI on native detection).

---

## 2. Production & stack

| Item | Value |
|------|--------|
| Production URL | `https://wardrobe-app-lilac-two.vercel.app` |
| Framework | Next.js 16.2, React 19, TypeScript, Tailwind v4 |
| State | Zustand + localStorage; optional Supabase sync |
| Auth | Supabase email/password (`src/lib/supabase/auth.ts`) |
| AI APIs | Gemini via Next routes under `src/app/api/` |
| Deploy | Vercel (also has `netlify.toml`; primary is Vercel) |
| Docs vault | `docs/` (Obsidian) · hub `docs/Wardrobe App.md` |
| Notion hub | [Your Personal Wardrobe](https://app.notion.com/p/396c075eff4c814eabb8d6825530f504) · child [10 — iOS / Capacitor](https://app.notion.com/p/399c075eff4c81b682b3fa3354a5136e) |

---

## 3. Capacitor / iOS — what exists

### Packages (`package.json`)

- `@capacitor/core`, `@capacitor/ios`, `@capacitor/splash-screen`, `@capacitor/status-bar`
- Dev: `@capacitor/cli`
- Scripts:
  - `npm run cap:sync` → production URL sync
  - `npm run cap:open:ios`
  - `npm run cap:sync:local` → `http://127.0.0.1:3000` (**Simulator only**)

### Key files

| Path | Role |
|------|------|
| `capacitor.config.ts` | `appId`, `server.url`, mobile UA, `preferredContentMode` |
| `www/index.html` | Fallback if remote URL fails (`webDir`) |
| `ios/App/App.xcodeproj` | Xcode project (SPM via CapApp-SPM, not CocoaPods) |
| `ios/App/App/MobileBridgeViewController.swift` | Forces `.mobile` content mode |
| `ios/App/App/Base.lproj/Main.storyboard` | Uses `MobileBridgeViewController` (not stock `CAPBridgeViewController`) |
| `ios/App/App/Info.plist` | `NSAllowsLocalNetworking` for http:// LAN debug |
| `docs/iOS Capacitor.md` | Human runbook (signing, trust, 7-day expiry) |

### Config (authoritative)

```ts
// capacitor.config.ts (summary)
appId: "app.wardrobe.personal"
appName: "Wardrobe"
webDir: "www"
server.url: process.env.CAPACITOR_SERVER_URL
  ?? "https://wardrobe-app-lilac-two.vercel.app"
server.cleartext: true
ios.contentInset: "never"           // web owns safe-area CSS
ios.preferredContentMode: "mobile"
ios.overrideUserAgent: "... Mobile/15E148 Safari/604.1 WardrobeApp"
```

**Detection hook for dual UI:** user-agent contains `WardrobeApp`, and/or `@capacitor/core` `Capacitor.isNativePlatform()`.

### Safe areas (web already)

- `src/app/layout.tsx` — `viewportFit: "cover"`
- `AppShell` / `LandingNav` — `env(safe-area-inset-*)`

---

## 4. What was done in this chat (timeline)

1. Audited repo: PWA/manifest/safe-areas existed; **no** Capacitor/`ios/` yet.
2. Scaffolded Capacitor + iOS; docs + Notion page; **no commit** (user rule).
3. User installed via Xcode on **AJAY's iPhone** with Personal Team (`tajay0704@gmail.com`).
4. Hit real-world blockers (documented below); app eventually launched.
5. Desktop-in-WebView layout → fixed with UA + `MobileBridgeViewController` (user must **rebuild** after that change).
6. User confirmed: native shell changes ≠ website changes.
7. User wants **different look for app vs website** → agreed **Option 1** is preferred; asked for clarity, then this handoff.

---

## 5. Install / run (device) — exact steps

```bash
cd /Users/ajaythirumurthi/wardrobe-app
npm install
npm run cap:sync
npm run cap:open:ios
```

Xcode:

1. Target **App** → **Signing & Capabilities** → Automatically manage signing → **Personal Team**
2. Device: **AJAY's iPhone** (not “Any iOS Device”)
3. Enable **Developer Mode** on phone if prompted (Settings → Privacy & Security)
4. ▶ Run
5. Phone: **Settings → General → VPN & Device Management** → Trust Apple Development identity
6. Open **Wardrobe**

Local Next on **physical phone** (not 127.0.0.1):

```bash
ipconfig getifaddr en0   # e.g. 192.168.x.x
npm run dev -- -H 0.0.0.0
CAPACITOR_SERVER_URL=http://192.168.x.x:3000 npm run cap:sync
npm run cap:open:ios
```

---

## 6. Free Apple ID limits (document / expect)

| Limit | Implication |
|-------|-------------|
| ~**7-day** provisioning expiry | App stops launching; rebuild/reinstall from Xcode |
| No TestFlight / App Store | Needs $99 Apple Developer Program later |
| Personal Team device/app caps | ~3 apps; remove unused if blocked |
| Trust developer | Required once (again if profile rotates) |

---

## 7. Issues already hit (don’t rediscover blindly)

| Symptom | Cause / fix |
|---------|-------------|
| Keychain wants password for `github.com` | SPM fetching Capacitor packages — enter Mac login → Always Allow |
| “Signing requires a development team” | Select Personal Team in Signing & Capabilities |
| “Checking Developer Mode” / reconnect | Enable Developer Mode on iPhone + reboot |
| `dyld_shared_cache_extract_dylibs failed` | Xcode symbol extract; Mac disk was ~**3 GB free** — free **20–30+ GB**; clear `~/Library/Developer/Xcode/iOS DeviceSupport/*` if needed |
| Untrusted Developer | Trust under VPN & Device Management |
| Desktop / zoomed-out UI in app | WKWebView desktop content mode — `preferredContentMode: mobile` + `overrideUserAgent` + `MobileBridgeViewController`; **rebuild** |
| `xcode-select` → Command Line Tools | Opening `.xcodeproj` in Xcode.app still works; optional `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |

---

## 8. NEXT TASK (user intent) — Option 1 dual UI

### Goal (user words)

> Make the App look different from the website, without making them fully separate products. Option 1 looks easier.

### Option 1 (agreed approach) — be precise

**One** Next.js deploy on Vercel. Capacitor still loads the **same** production URL.

At runtime the web app detects:

- **Native (Capacitor iPhone shell)** → render **App UI** (different look)
- **Browser** → render **current Website UI** (unchanged for normal visitors)

```
iPhone Capacitor → same URL → isNative === true  → App chrome / theme / nav
Safari / Chrome  → same URL → isNative === false → existing marketing + app shell
```

**Shared forever:** Supabase auth, closet data, Zustand, `/api/*`, Storage.  
**Not shared (branch):** layout, visual design, maybe skip marketing landing inside the app.

### Detection (implement this)

Prefer both for robustness:

1. `import { Capacitor } from "@capacitor/core"` → `Capacitor.isNativePlatform()`
2. Fallback: `navigator.userAgent.includes("WardrobeApp")` (set in `capacitor.config.ts`)

Create something like `src/lib/platform.ts`:

```ts
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch { /* SSR / non-cap */ }
  return navigator.userAgent.includes("WardrobeApp");
}
```

Use in client components only (or pass from a small client gate). SSR: default to web look.

### Suggested implementation plan (for Claude Code)

1. Add `src/lib/platform.ts` (+ optional `useIsNativeApp()` hook).
2. Branch in `AppShell` / auth landing:
   - Native: skip or simplify `AuthLanding` / video marketing; use denser mobile chrome.
   - Web: keep current landing + shell.
3. Add CSS variables or a root class `html.native-app` for theme differences (colors, type, spacing) — **do not** fork the whole feature set.
4. Deploy to Vercel → reopen Wardrobe app (pull-to-refresh or kill/relaunch). **No Xcode rebuild** unless Capacitor config/native code changes.
5. Update `docs/iOS Capacitor.md` + Notion “10 — iOS / Capacitor” with dual-UI note.
6. **Do not commit** unless user asks.

### What user has **not** specified yet (ask before big design)

- Exact visual direction (colors, typography, density)
- Whether native should skip marketing landing entirely
- Whether nav labels/order change on native

Until specified: implement **detection + a clear visual fork** (e.g. `native-app` class + simplified landing) that is obviously different but reversible.

### Out of scope (unless user expands)

- Separate subdomain / `/app` route (Option 2)
- React Native / Expo rewrite
- App Store / TestFlight / paid Apple account
- Changing product features (Today, wear log, etc.) for this task
- Committing without explicit ask

---

## 9. Important constraints for agents

1. **Read Next.js docs in `node_modules/next/dist/docs/`** before assuming App Router APIs (project `AGENTS.md`).
2. **Do not** set `output: 'export'` as primary path.
3. **Do not** rewrite the product; wrap / branch UI only.
4. Keep narrative docs in `docs/`; code in `src/` / `ios/`.
5. Mac disk space has been critically low — warn if builds fail with symbol/cache errors.
6. Netlify skills exist in Cursor but **production is Vercel** for this app.
7. Capacitor iOS uses **SPM** (`CapApp-SPM`), not CocoaPods.

---

## 10. Verify after dual-UI work

- [ ] Safari: website looks as before  
- [ ] Capacitor app: clearly different chrome/theme (and mobile layout, not desktop)  
- [ ] Sign-in / closet / sync still work in both  
- [ ] Safe areas still OK under notch  
- [ ] Docs updated; Notion optional brief note  
- [ ] No commit unless requested  

---

## 11. Related docs

- [[iOS Capacitor]] — runbook  
- [[Wardrobe App]] — hub  
- [[Architecture]] · [[Deploy]] · [[Features]] · [[Phase 0-1 status]]  
- README — short iOS pointer  

---

## 12. One-liner for Claude Code

> Capacitor iOS shell already loads production; next implement Option 1: `isNativeApp()` detection and a separate visual shell for native vs web on the same URL — do not fork the backend, do not use static export, do not commit unless asked.

#handoff #capacitor #ios #claude-code
