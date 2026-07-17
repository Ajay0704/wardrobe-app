# TestFlight — external testers

Send the Wardrobe iOS shell to other people via Apple TestFlight.

**Requires:** Apple Developer Program ($99/yr) · Mac with **Xcode.app** (not Command Line Tools only)

Related: [[iOS Capacitor]] · Linear [AJA-8](https://linear.app/ajay-karthick/issue/AJA-8)

## App identity (locked)

| Field | Value |
|-------|--------|
| Bundle ID | `app.wardrobe.personal` |
| Display name | Wardrobe |
| Version | `1.0` (`MARKETING_VERSION` in Xcode) |
| Build | increment `CURRENT_PROJECT_VERSION` each upload |
| Loads | `https://wardrobe-app-lilac-two.vercel.app/n?native=1` |

## One-time setup

### 1. Xcode uses full Xcode + paid team

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Xcode → **Settings → Accounts** → sign in with the Apple ID on the **paid** team.

Open project:

```bash
cd /Users/ajaythirumurthi/wardrobe-app
npm run cap:sync
npm run cap:open:ios
```

**App** target → **Signing & Capabilities**:

- ✅ Automatically manage signing
- **Team:** your **paid** Developer team (not “Personal Team”)
- **Bundle Identifier:** `app.wardrobe.personal`

If the bundle ID is new, Xcode creates it in the Developer portal on first archive.

### 2. Register app in App Store Connect

1. [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**
2. Platform **iOS**, name **Wardrobe**, bundle ID **app.wardrobe.personal**
3. **App Privacy** questionnaire (email, photos, location for weather, etc.)
4. **Privacy Policy URL** — required for external TestFlight. Use a public URL (e.g. `https://wardrobe-app-lilac-two.vercel.app/privacy` once that page exists).

### 3. Export compliance

On first upload, App Store Connect asks about encryption. This app uses HTTPS only → typically **No** for custom encryption (standard exemption).

## Upload a build

1. In Xcode toolbar: **Any iOS Device (arm64)** (not Simulator)
2. **Product → Archive**
3. Organizer → **Distribute App** → **App Store Connect** → **Upload**
4. Wait 10–30 min → App Store Connect → **TestFlight** → build shows **Processing** then **Ready to Test**

Bump **build number** before each new upload (Xcode → App target → **General** → Build).

## External testers (“others”)

1. TestFlight → **External Testing** → **+** → group name (e.g. `Friends`)
2. **+** build → select the processed build
3. **Add testers** (email) **or** enable **Public Link**
4. First external build: **Submit for Beta App Review** (~24–48h)
5. Testers install Apple’s **TestFlight** app → accept invite / open link → install **Wardrobe**

| Type | Who | Beta review |
|------|-----|-------------|
| Internal | App Store Connect users (≤100) | No |
| External | Anyone with email or public link | Yes (first time per version) |

## After TestFlight is live

- Set `NEXT_PUBLIC_IOS_APP_ID` on Vercel (numeric App Store id) so **Rate the app** works (AJA-55).
- Paid account also unlocks **remote push (APNs)** later; local notifications work today.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Only “Personal Team” in Xcode | Add paid Apple ID under Settings → Accounts; wait for membership to activate |
| No **Archive** menu | Select **Any iOS Device**, not Simulator |
| `xcodebuild` fails from CLI | Point `xcode-select` at Xcode.app (see above) |
| Missing compliance / privacy | Add privacy policy URL + complete App Privacy |
| Build rejected processing | Check email from Apple; often missing icons, permissions text, or invalid bundle |

#ios #testflight #capacitor
