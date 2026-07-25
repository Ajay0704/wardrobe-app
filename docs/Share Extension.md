# Share to Wardrobe — iOS Share Extension (AJA-201)

"Share → Wardrobe" from Safari or any app, Pinterest-style. The shared link is quick-saved to
the **Wishlist** via the existing `/api/clip` pipeline.

## How it works
1. iOS Share Extension (`ios/App/ShareExtension/`) captures the shared URL (or the first link in
   shared text/web page).
2. It opens the main app via the existing custom scheme: `app.wardrobe.personal://share?url=<encoded>`.
3. `NativeAppClass` `appUrlOpen` (`src/components/NativeAppClass.tsx`) parses it → `setPendingClipUrl`.
4. `ClipLinkLoader` (`src/components/ClipLinkLoader.tsx`) POSTs `/api/clip` (Bearer Supabase token),
   re-hosts the image, dedupes, saves a `wishlist` item, switches to the Wishlist, and toasts.
   If the user isn't signed in yet, the URL is retained and the save retries after sign-in.

**Android / installed PWA** get the same thing for free via the Web Share Target in
`src/app/manifest.ts` (`share_target` GET → `/n?clipUrl=…`). No extension needed there; iOS Safari
does not support Web Share Target, which is why the native extension exists.

The web pieces ship via Vercel and are **harmless no-ops until a build carries the extension** — so
they can (and did) deploy ahead of the native build.

## Adding the extension target in Xcode (one-time)
Hand-editing `App.xcodeproj/project.pbxproj` to add a target is fragile; use Xcode's GUI so it
generates the target, build phases, and scheme correctly, then point it at the committed source.

1. Open `ios/App/App.xcodeproj` in Xcode.
2. **File → New → Target… → Share Extension.** Name it **`ShareExtension`**, Team **`K67RQ92ZG7`**,
   language Swift. When prompted "Activate scheme?", **Cancel** (keep the `App` scheme).
3. Delete the auto-generated `ShareViewController.swift`, `MainInterface.storyboard`, and `Info.plist`
   inside the new group — **use the committed files instead**:
   - Add `ios/App/ShareExtension/ShareViewController.swift` to the `ShareExtension` target.
   - Replace the target's Info.plist with `ios/App/ShareExtension/Info.plist` (it's storyboard-free:
     `NSExtensionPrincipalClass = $(PRODUCT_MODULE_NAME).ShareViewController`, so no MainInterface).
     Set **Build Settings → Info.plist File** to `ShareExtension/Info.plist`.
4. Target **General / Signing**: Bundle Identifier **`app.wardrobe.personal.ShareExtension`**,
   Team `K67RQ92ZG7`, Automatically manage signing, **iOS Deployment Target 15.0**.
5. Confirm the `App` target got an **"Embed App Extensions"** build phase containing `ShareExtension.appex`
   (Xcode adds this automatically; verify it's there).
6. **Xcode Cloud:** make sure the extension is built by the archived `App` scheme (it is by default once
   embedded). `ci_scripts/ci_post_clone.sh` needs no change — the extension is pure Swift.
7. Bump `CURRENT_PROJECT_VERSION` (build number), archive, upload to TestFlight.

No App Group / entitlements are needed for the links flow — the URL rides in the deep-link query.

## Test (on device / TestFlight)
- Safari → open any product page → **Share → Wardrobe** → the app opens → toast "Saved: …" and the
  item appears on the Wishlist. Try again with the same URL → "Already on wishlist".
- Share while signed out → toast "Sign in to save this shared product"; after signing in the save
  completes automatically.
- Share plain text containing a link (e.g. from Messages) → the link is detected and saved.

## Part B — sharing images (implemented)
Sharing a photo/screenshot into Wardrobe opens the add form pre-loaded with it (auto-tagged), for a
quick review + Save. A shared image can't ride in the deep link, so it goes via an **App Group**:
- **Extension** (`ShareViewController.openImage`): on a `public.image`, writes the bytes to the App
  Group container (`shared/inbox/<uuid>.jpg`) + a marker in the group's `UserDefaults`, then opens
  `app.wardrobe.personal://share?type=image`.
- **Native bridge** (`ios/App/App/SharedInboxPlugin.swift`): `SharedInbox.consumePending()` reads that
  file, returns it as base64, and clears it. JS wrapper: `src/lib/native/shared-inbox.ts`.
- **Web:** `NativeAppClass` `share?type=image` branch → `SharedInbox.consumePending()` → data URL →
  `openAddWithImage` → `ItemForm` runs `handleFile` (analyze + cutout).

**One-time Xcode step — add the App Group capability** (the entitlements files + `CODE_SIGN_ENTITLEMENTS`
are already committed; this registers the group with your account):
1. Select the **App** target → **Signing & Capabilities** → confirm **App Groups** shows
   `group.app.wardrobe.personal` (checked). If it shows an error, click **+ Capability → App Groups**
   and add `group.app.wardrobe.personal` (Xcode registers it in the portal).
2. Repeat for the **ShareExtension** target (same group).
3. Rebuild. Test: share a **photo** from Photos/Safari → Wardrobe → the add form opens with the image,
   auto-tagged → **Save**.

(Android image share would also need a POST `share_target` + a `fetch` handler in `public/sw.js` — deferred.)

## Caveats
- Opening the host app from a Share Extension uses the responder-chain `openURL:` walk
  (`ShareViewController.openHostApp`) — a long-standing, widely-shipped workaround that generally
  passes App Review; revisit if a future iOS release restricts it.
- App Groups (Part B) require Developer-portal + provisioning updates.
