# Browser extension

Chrome / Edge Manifest V3 clipper that saves clothing product pages to the Wardrobe **wishlist**.

Issue: [AJA-78](https://linear.app/ajay-karthick/issue/AJA-78)

## Package

`extensions/wishlist-clipper/` — load unpacked in `chrome://extensions`.

## Flow

1. One-time: **Connect account** in extension settings → `/extension/connect?ext=<extensionId>`
2. Signed-in app sends Supabase access token via `chrome.runtime.sendMessage`
3. Save with one gesture → `POST /api/clip` with Bearer token:
   - click extension icon
   - right‑click page → Save to Wardrobe wishlist
   - ⌥⇧W (Alt+Shift+W)
   - floating **Save to Wardrobe** on product-like pages
4. Server runs `/api/extract`, re-hosts the product image in Storage, guesses category from the title, appends a `wishlist: true` item to `wardrobe_snapshots` (service role)
5. App absorbs new clips on foreground / before push so a stale local sync cannot wipe them

## Deep link

`/?clipUrl=<url>&view=wishlist` — handled by `ClipLinkLoader` (no extension required).

## Smart Buy

Wishlist editor shows a **Check Smart Buy** button — analysis is opt-in (never auto-runs on open; that crashed iOS WebView).

## Files

- `src/app/api/clip/route.ts`
- `src/app/extension/connect/page.tsx`
- `src/components/ClipLinkLoader.tsx`
- `extensions/wishlist-clipper/*`

## Requirements

- `SUPABASE_SERVICE_ROLE_KEY` on the server (same as push subscribe)
- User must be signed in; reconnect when the token expires

#extension #wishlist #clipper
