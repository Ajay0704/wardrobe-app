# Share Closet

Acloset-inspired “ask friends” flow from Closet quick actions.

## In-app

1. **How to share** — 3-step explainer  
2. Pick up to 8 owned items + write a question  
3. Create link → native share sheet / copy  
4. **Check responses** — guest replies appear here  

## Guest page

`/share/closet/[id]` — no install required. View items, tap suggestions, leave a reply.

## Backend

- Tables: `closet_shares`, `closet_share_replies` (migration `20260712_closet_shares.sql`)
- `POST /api/closet-share` (auth) · `GET /api/closet-share?id=` (public) · `POST /api/closet-share/reply` (public)

## Closet Review

Quick-action button ships as a **placeholder** until product spec is defined.

#share-closet #social #closet
