# Your Personal Wardrobe

A modern, single-page wardrobe app for saving clothing items from image links, building outfits, and getting color-harmony suggestions.

## Features

- **Item management** — Add items with name, image URL (or file upload), category, color picker, tags, seasons, brand, price, and notes
- **Outfit builder** — Drag-and-drop or click-to-add into layer slots (tops, bottoms, dress, outerwear, shoes, accessories)
- **Live preview** — See your outfit stacked together with a harmony score
- **Smart matching** — Color harmony indicators (complementary, analogous, clash) and a "Generate outfit" engine
- **Saved outfits** — Name and save favorite looks
- **Wishlist** — Track items you want to buy
- **Seasonal view** — Group wardrobe by season
- **Dark / light mode** — Persists in localStorage
- **Export & share** — Download outfit as PNG or copy a shareable link

## Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- Zustand (localStorage persistence)
- html-to-image (PNG export)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
├── app/              # Next.js app shell, global styles
├── components/       # UI views and shared primitives
│   ├── AppShell.tsx          # Navigation + view routing
│   ├── WardrobeView.tsx      # Item grid + filters
│   ├── OutfitBuilderView.tsx # Drag-drop builder
│   ├── OutfitsView.tsx       # Saved outfits
│   ├── WishlistView.tsx      # Wishlist section
│   ├── ItemForm.tsx          # Add/edit modal
│   └── ItemCard.tsx          # Image card
└── lib/
    ├── types.ts      # Domain types (Category, WardrobeItem, Outfit)
    ├── store.ts      # Zustand store + localStorage
    ├── color.ts      # Color harmony + extraction
    └── matching.ts   # Outfit generation engine
```

## Extending to Supabase / Firebase

All state lives in `useWardrobe` (`src/lib/store.ts`). To sync remotely:

1. Replace or wrap the `persist` storage adapter
2. Or subscribe to store changes and push/pull from your backend
3. Component code stays unchanged — types are already JSON-serializable

## Data storage

Everything is stored in `localStorage` under the key `wardrobe-store-v1`. Demo items are included on first load so you can explore immediately.

## Supabase sync (optional)

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Enable **Anonymous sign-ins**: Authentication → Providers → Anonymous
4. Copy your project URL and anon key into `.env.local`:

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

When configured, the app syncs automatically and shows a cloud badge in the header. Without env vars, it stays local-only.

## Deploy to Netlify

```bash
# 1. Log in (opens browser)
npx netlify login

# 2. Create & link site (first time)
npx netlify init

# 3. Preview deploy
npx netlify deploy --build

# 4. Production
npx netlify deploy --build --prod
```

`netlify.toml` is already configured for Next.js. Add Supabase env vars in **Site settings → Environment variables** for cloud sync in production.
