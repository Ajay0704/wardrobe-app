# Deploy

## Vercel (recommended)

1. Import [github.com/Ajay0704/wardrobe-app](https://github.com/Ajay0704/wardrobe-app) at [vercel.com/new](https://vercel.com/new)
2. Default Next.js build settings
3. Optional env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Pushes to `main` auto-deploy.

## Netlify

```bash
npx netlify login
npx netlify init
npx netlify deploy --build        # preview
npx netlify deploy --build --prod # production
```

`netlify.toml` is preconfigured for Next.js.

## Related

- [[Supabase sync]]
- [[Scale architecture]] — target split: `wardrobe-web` + `wardrobe-api` + store apps
