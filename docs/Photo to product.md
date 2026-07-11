# Photo → product link (visual search)

Issue: [AJA-79](https://linear.app/ajay-karthick/issue/AJA-79) — **shipped**

## Flow

1. Item editor → photo on Storage (`https://…`) → **Find product online**
2. `POST /api/find-product` → SerpAPI Google Lens → up to 5 candidates
3. User picks one → existing `/api/extract` fills `productUrl`, price, brand (keeps closet photo + existing name)

UI: fixed sheet (`FindProductSheet`) — same pattern as Smart Buy so the native editor doesn’t reflow.

## API key decision

**Ship with SerpAPI only.** Bing Visual Search is **retired** (2025-08-11) — do not use.

| Key | Role | Free tier |
|-----|------|-----------|
| `SERPAPI_API_KEY` | **Primary** — Google Lens | ~250 searches/mo ([pricing](https://serpapi.com/pricing)) |
| `SEARCHAPI_API_KEY` | **Backup** — Yandex reverse image | ~100 free requests ([SearchApi](https://www.searchapi.io/yandex-reverse-image-api)) |
| OpenWeb Ninja / RapidAPI | Optional 3rd backup | ~50 req/mo BASIC free |
| `BING_VISUAL_SEARCH_KEY` | **Dead** | N/A |
| `GEMINI_API_KEY` | Rank/filter only | Already have |

Env: `.env.local` + Vercel (Production / Preview / Development).

### Failover shape (not built yet)

1. SerpAPI Lens  
2. → SearchApi Yandex if empty/fail  
3. → normalize candidates → `/api/extract`

Signup primary: [serpapi.com](https://serpapi.com)

## Known failure mode (fixed)

SerpAPI often returns HTTP 200 with `error: "Google Lens hasn't returned any results…"` on the **products** tab for worn/closet photos. v1 treated that as a hard 502. Now we soft-fail and try `visual_matches` → `all`, rank retail links higher, and show errors under the Find button.

#visual-search #serpapi #searchapi #closet
