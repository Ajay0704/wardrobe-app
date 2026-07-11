# Wardrobe Wishlist Clipper

Chrome / Edge / Comet (Manifest V3) — one-gesture save of product pages to your Wardrobe **wishlist**.

## Install (unpacked)

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Select this folder: `extensions/wishlist-clipper`
3. Open settings (right‑click extension icon → **Wardrobe clipper settings**, or extension details → Extension options)
4. **Connect account** (use **Localhost** while developing; **Production** after deploy)

After code changes: hit the refresh icon on the extension card.

## Frictionless save (after connect)

| Gesture | Action |
|--------|--------|
| Click extension icon | Save current tab |
| Right‑click page | **Save to Wardrobe wishlist** |
| **⌥⇧W** (Alt+Shift+W) | Save current tab |
| Floating **Save to Wardrobe** | On product-like pages |

Badge ✓ / toast confirms success.

## API

`POST /api/clip` with Bearer Supabase access token.

Production: https://wardrobe-app-lilac-two.vercel.app  
Deep link fallback: `/?clipUrl=<url>&view=wishlist`
