# iOS / Capacitor

Native iOS shell for **Your Personal Wardrobe**. The Xcode app is a Capacitor WebView that loads the live Next.js site (production by default). Auth, Supabase Storage, and `/api/*` routes stay on the server — we do **not** use `output: 'export'`.

## Architecture

```
iPhone (Capacitor WKWebView)
        │
        ▼  server.url
https://wardrobe-app-lilac-two.vercel.app  (or local next dev)
```

| Piece | Path / value |
|-------|----------------|
| Config | `capacitor.config.ts` |
| Fallback web assets | `www/` (only shown if `server.url` fails) |
| Xcode project | `ios/App/App.xcodeproj` |
| Bundle ID | `app.wardrobe.personal` |
| Display name | Wardrobe |

Safe areas: the web app already uses `viewport-fit=cover` and `env(safe-area-inset-*)` in the shell/nav. Capacitor `ios.contentInset` is `never` (web owns insets). Mobile layout is forced via `preferredContentMode: mobile`, `overrideUserAgent` (includes `WardrobeApp`), and `MobileBridgeViewController`.

## Dual UI

Same production URL for web and app. The Capacitor shell loads production with `?native=1`, which locks the native bottom-tab shell (also via UA `WardrobeApp`, Capacitor bridge, and localStorage). Safari without that flag keeps the website top nav.

**If tapping an item flips to the website top nav:** force-quit the app, wait for the latest Vercel deploy, then **rebuild once** so `server.url` includes `?native=1`:

```bash
cd /Users/ajaythirumurthi/wardrobe-app
npm run cap:sync
npm run cap:open:ios
```

Then Run ▶. Expected: tap item name → full-screen editor → Close → still bottom tabs.

## Prerequisites

- Mac with **Xcode** (from the App Store)
- iPhone + USB cable (or wireless debugging once paired)
- Free **Apple ID** (no paid Developer Program required for personal device installs)
- This repo with `npm install` already run

If `xcodebuild` / CLI tools point at Command Line Tools only, switch once (needs admin password):

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Opening the `.xcodeproj` in Xcode.app still works without that.

## First-time: open in Xcode and run on iPhone

### 1. Sync and open

```bash
cd /Users/ajaythirumurthi/wardrobe-app
npm install
npm run cap:sync
npm run cap:open:ios
```

Or open `ios/App/App.xcodeproj` directly in Xcode.

### 2. Sign with a free Apple ID

1. In Xcode, select the **App** target → **Signing & Capabilities**.
2. Check **Automatically manage signing**.
3. **Team**: click **Add Account…** if needed → sign in with your Apple ID → choose your **Personal Team**.
4. Leave **Bundle Identifier** as `app.wardrobe.personal` (change only if Xcode says it’s taken on your team).

If Xcode complains about the provisioning profile, try a unique suffix once (e.g. `app.wardrobe.personal.ajay`) and keep it consistent.

### 3. Select your iPhone and Run

1. Unlock the iPhone, trust the Mac if prompted.
2. In the Xcode toolbar device menu, pick your **physical iPhone** (not a simulator, unless you only want a quick check).
3. Press **Run** (▶) or `Cmd+R`.
4. Wait for build + install.

### 4. Trust the developer certificate (first install only)

On the iPhone:

1. **Settings → General → VPN & Device Management** (wording varies by iOS version; older: **Device Management** / **Profiles & Device Management**).
2. Under **Developer App**, tap your Apple ID / developer entry.
3. Tap **Trust** → confirm.
4. Open the **Wardrobe** home-screen icon again.

You should see the production Wardrobe UI and be able to sign in / use the closet.

## Point at local Next.js (debug)

Production is the default (`https://wardrobe-app-lilac-two.vercel.app`).

### Simulator (Mac only)

```bash
# Terminal A
npm run dev

# Terminal B — 127.0.0.1 works for Simulator
npm run cap:sync:local
npm run cap:open:ios
```

Then Run on an **iOS Simulator**.

### Physical iPhone

The phone cannot reach `127.0.0.1` on your Mac. Use your Mac’s LAN IP:

```bash
# Find Mac IP (Wi‑Fi), e.g. 192.168.1.42
ipconfig getifaddr en0

# Terminal A — bind so LAN devices can connect
npm run dev -- -H 0.0.0.0

# Terminal B
CAPACITOR_SERVER_URL=http://192.168.1.42:3000 npm run cap:sync
npm run cap:open:ios
```

Phone and Mac must be on the same Wi‑Fi. `Info.plist` allows local networking (`NSAllowsLocalNetworking`) for `http://` debug.

When finished debugging, switch back to production:

```bash
npm run cap:sync
```

## Day-to-day commands

| Command | Purpose |
|---------|---------|
| `npm run cap:sync` | Copy `www/` + refresh native config (production URL) |
| `npm run cap:open:ios` | Open Xcode project |
| `npm run cap:sync:local` | Sync with `http://127.0.0.1:3000` (Simulator) |

After changing `capacitor.config.ts` or plugins, always `cap:sync` before building.

## Free Apple ID limits (Personal Team)

| Limit | What it means |
|-------|----------------|
| **~7-day expiry** | Free provisioning profiles / signing certs expire about every 7 days. The app may refuse to launch (“integrity could not be verified” / similar). |
| **Reinstall** | Open Xcode → select your iPhone → **Run** again. Re-trust only if iOS asks. |
| **No TestFlight / App Store** | Requires the paid Apple Developer Program ($99/year). Out of scope for now. |
| **Device + app caps** | Free teams are limited (commonly ~3 apps and a small set of registered devices). Remove unused apps in Xcode / on device if you hit the cap. |
| **Personal use** | Fine for your own iPhone testing; not for distributing to others. |

### When the app “expires”

1. Plug in the iPhone (or use wireless debugging).
2. `npm run cap:open:ios` (or open the `.xcodeproj`).
3. Ensure Team is still your Personal Team.
4. **Run** (▶) to rebuild and reinstall.
5. If needed: Settings → trust the developer again.

## What this shell does / does not do

**Does**

- Install a home-screen native container
- Load the live web app (production or configurable URL)
- Preserve existing mobile viewport / safe-area CSS

**Does not (yet)**

- App Store / TestFlight / paid Developer Program
- Offline-first native bundle of the Next app
- Capacitor Push (web push / PWA SW is a separate path)
- Custom App Store icon set beyond Capacitor defaults (replace assets under `ios/App/App/Assets.xcassets` when you care)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank / “Loading Wardrobe…” forever | Check network; confirm production URL is up; re-run `npm run cap:sync` |
| Signing errors | Add Apple ID under Xcode → Settings → Accounts; pick Personal Team |
| Untrusted developer | Trust under Settings → General → VPN & Device Management |
| Local URL works on Simulator but not phone | Use LAN IP + `next dev -H 0.0.0.0`, not `127.0.0.1` |
| Expired after a week | Rebuild/reinstall from Xcode (free provisioning) |
| Desktop / zoomed-out layout on iPhone | Rebuild after `cap:sync` — iOS uses `preferredContentMode: mobile` + `MobileBridgeViewController` |

## Related

- Hub: [[Wardrobe App]]
- Deploy: [[Deploy]]
- Production: https://wardrobe-app-lilac-two.vercel.app

#ios #capacitor #mobile
