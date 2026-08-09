/**
 * Per-user rate limiting for the paid AI capture routes. Guest-first onboarding (AJA-290) lets
 * ANONYMOUS users hit detect-garments / segment-outfit / analyze / cutout, so they need a cap or a
 * script can farm free guest sessions and burn the Gemini/Replicate budget.
 *
 * HONEST CAVEAT — this is an in-memory fixed-window limiter. On Vercel each serverless instance has
 * its own memory, so it firmly throttles a single client hammering a warm instance but is NOT a hard
 * global limit. It is deliberately one of THREE layers, not the whole defense:
 *   1. Supabase's built-in auth rate limits on anonymous sign-ins (+ optional CAPTCHA the owner can
 *      enable in Attack Protection) — caps how fast guests can be minted in the first place.
 *   2. This per-user cap — bounds how much any one guest can spend per window.
 *   3. The daily abandoned-guest cleanup cron (`/api/cron/cleanup-guests`) — bounds accumulation.
 * For a hard GLOBAL cap, back this with Postgres or Upstash/Vercel KV (documented follow-up).
 *
 * Fails OPEN by construction (a limiter should never be the thing that breaks capture): callers only
 * block on an explicit `ok:false`, and this module throws nothing.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
let lastSweep = 0;

/** Drop expired buckets occasionally so the map can't grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };

/** Fixed-window limiter. `key` should be namespaced, e.g. `cap:<userId>`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

const WINDOW_MS = 5 * 60_000; // 5 minutes
const ANON_CAPTURE_LIMIT = 20; // enough to onboard ~6–12 pieces incl. retries; not enough to farm
const USER_CAPTURE_LIMIT = 60;

/** Cap for the paid capture routes; anonymous guests get the tighter budget. */
export function checkCaptureLimit(user: { id: string; isAnonymous: boolean }): RateResult {
  const limit = user.isAnonymous ? ANON_CAPTURE_LIMIT : USER_CAPTURE_LIMIT;
  return rateLimit(`cap:${user.id}`, limit, WINDOW_MS);
}

/** Standard 429 response for a blocked capture call. */
export function tooMany(r: RateResult): Response {
  return Response.json(
    { error: "You're going a bit fast — give it a moment and try again." },
    { status: 429, headers: { "Retry-After": String(r.retryAfter) } },
  );
}
