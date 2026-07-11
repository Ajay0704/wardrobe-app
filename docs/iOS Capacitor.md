# iOS / Capacitor

Native iOS shell for **Your Personal Wardrobe**. The Xcode app is a Capacitor WebView that loads the live Next.js site (production by default). Auth, Supabase Storage, and `/api/*` routes stay on the server — we do **not** use `output: 'export'`.

Last updated: 2026-07-11

## Architecture

```
iPhone (Capacitor WKWebView)
        │
        ▼  server.url
https://wardrobe-app-lilac-two.vercel.app/n?native=1
```

| Piece | Path / value |
|-------|----------------|
| Config | `capacitor.config.ts` |
| Native web entry | `/n` (never boots marketing homepage) |
| Fallback web assets | `www/` (only shown if `server.url` fails) |
| Xcode project | `ios/App/App.xcodeproj` |
| Bundle ID | `app.wardrobe.personal` |
| Display name | Wardrobe |
| Plugins | Browser, SplashScreen, StatusBar |

Safe areas: the web app already uses `viewport-fit=cover` and `env(safe-area-inset-*)`. Capacitor `ios.contentInset` is `never` (web owns insets). Mobile layout is forced via `preferredContentMode: mobile`, `overrideUserAgent` (includes `WardrobeApp`), and `MobileBridgeViewController`.

## Dual UI

Same production host for web and app. Capacitor loads **`/n?native=1`**, which always uses the native shell. Extra locks: UA `WardrobeApp`, Capacitor bridge, boot script, localStorage latch. Safari on `/` keeps the website top nav.

### Native IA (AJA-31)

Bottom tabs: **Today · Closet · ＋ Create · Outfits · You**

- **Create** sheet → Add clothing item / Build an outfit
- **You** hub → Wishlist, Packing, Insights, Calendar, Settings, Log out

### Item editor (AJA-33)

Tapping an item opens an **in-app editor page** (Back + title) that **keeps the tab bar visible**. Full-screen modals that hid the tabs were mistaken for “flipping to the website.” Form inputs are ≥16px on native so iOS does not zoom on focus. Product / shop links use Capacitor **Browser** only (never `window.open` in the WebView).

**After changing `capacitor.config.ts` (e.g. `/n` URL), rebuild once:**

```bash
cd /Users/ajaythirumurthi/wardrobe-app
npm run cap:sync
npm run cap:open:ios
```

Then Run ▶, force-quit, reopen. Expected: tap item → editor with Back + bottom tabs still visible.

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

Production is the default (`https://wardrobe-app-lilac-two.vercel.app/n?native=1`).

### Simulator (Mac only)

```bash
# Terminal A
npm run dev

# Terminal B — 127.0.0.1 works for Simulator
npm run cap:sync:local
npm run cap:open:ios
```

Then Run on an **iOS Simulator**. Prefer a URL that includes `/n` if overriding manually.

### Physical iPhone

The phone cannot reach `127.0.0.1` on your Mac. Use your Mac’s LAN IP:

```bash
# Find Mac IP (Wi‑Fi), e.g. 192.168.1.42
ipconfig getifaddr en0

# Terminal A — bind so LAN devices can connect
npm run dev -- -H 0.0.0.0

# Terminal B
CAPACITOR_SERVER_URL=http://192.168.1.42:3000/n npm run cap:sync
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
| `npm run cap:sync` | Copy `www/` + refresh native config (production `/n` URL) |
| `npm run cap:open:ios` | Open Xcode project |
| `npm run cap:sync:local` | Sync with local Next (Simulator) |

After changing `capacitor.config.ts` or plugins, always `cap:sync` **and rebuild in Xcode** before testing URL/UA changes.

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
- Load the live web app at `/n` (production or configurable URL)
- Native bottom-tab IA + in-app item editor
- Open external shop URLs in Safari via Capacitor Browser
- Preserve mobile viewport / safe-area CSS

**Does not (yet)**

- App Store / TestFlight / paid Developer Program
- Offline-first native bundle of the Next app
- Capacitor Push / APNs (paid Developer Program) — for now: **local notifications** on-device (`@capacitor/local-notifications`)
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
| UI “resizes” when tapping a text field | Fixed 2026-07-11: native inputs ≥16px + `100svh` shell — force-quit/reopen to pick up deploy |
| Item tap feels like website (tabs gone) | Should show Back + tabs; if not, rebuild so `/n` is baked in (`cap:sync` + Xcode Run) |
| Product URL opens shop inside the app | Rebuild with Browser plugin synced; should open Safari sheet |

## Related

- Hub: [[Wardrobe App]]
- Deploy: [[Deploy]]
- Features: [[Features]]
- Production: https://wardrobe-app-lilac-two.vercel.app

#ios #capacitor #mobile
