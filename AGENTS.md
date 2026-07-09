<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- This is a Next.js 16 (App Router) + React 19 single-page wardrobe app. Scripts live in `package.json` (`npm run dev`, `npm run build`, `npm run lint`). Dependencies install with `npm ci`.
- The app runs fully locally with no backend or env vars — state persists in `localStorage` (key `wardrobe-store-v1`) and demo items are seeded on first load. Supabase (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`) is optional cloud sync only; leave unset for local dev.
- Gotcha: in the Add/Edit item modal (`src/components/ItemForm.tsx`), the "Add to wardrobe" button stays disabled until both a name and an image are set, and an image can only be added via file upload (there is no image-URL text field — the "Product URL" field is a separate store link). This is expected, not a bug. The outfit builder ("Builder" tab) works with the seeded demo items and is the easiest core flow to exercise without uploads.
