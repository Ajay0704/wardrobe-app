# Share Closet

Acloset-inspired “ask friends” flow. Backend + guest page shipped; **Closet UI entry is currently unwired** after the Items/Wishlist/Shared redesign (AJA-179). Product direction: rewire into **private decision councils** for candidate purchases (AJA-192) — not a public feed.

## Intended in-app flow

1. **How to share** — 3-step explainer  
2. Pick up to 8 owned items + write a question  
3. Create link → native share sheet / copy  
4. **Check responses** — guest replies appear here  

## Guest page

`/share/closet/[id]` — no install required. View items, tap suggestions, leave a reply.

## Backend

- Tables: `closet_shares`, `closet_share_replies` (migration `20260712_closet_shares.sql`)
- `POST /api/closet-share` (auth) · `GET /api/closet-share?id=` (public) · `POST /api/closet-share/reply` (public)

## Current gaps (Jul 25)

- Closet **Shared** tab = “Coming soon” placeholder
- `ShareClosetSheet` not opened from redesigned Closet chrome
- Closet Review quick-action remains a placeholder until specced

## Related

- [[Share Extension]] — capture products into the app (separate from Share Closet)
- [[Features]] — decision loop / Smart Buy
- Linear: [AJA-179](https://linear.app/ajay-karthick/issue/AJA-179), [AJA-192](https://linear.app/ajay-karthick/issue/AJA-192)

#share-closet #social #closet
