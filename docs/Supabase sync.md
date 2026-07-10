# Supabase sync

Optional cloud sync when env vars are configured.

## Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Enable **Anonymous sign-ins**: Authentication → Providers → Anonymous
4. Copy URL + anon key to `.env.local`:

```bash
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Code paths

| File | Role |
|------|------|
| `src/lib/supabase/client.ts` | Browser client |
| `src/lib/supabase/auth.ts` | Anonymous auth |
| `src/lib/supabase/sync.ts` | Push/pull wardrobe state |
| `src/lib/supabase/storage.ts` | Image uploads |
| `src/components/AuthProvider.tsx` | Auth context |
| `src/components/SyncBadge.tsx` | Cloud status UI |

## Behavior

- Without env vars → local-only mode
- With env vars → auto sync + cloud badge in header

## Related

- [[Deploy]]
- [[Data model]]
