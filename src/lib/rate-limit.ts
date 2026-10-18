/**
 * Per-user rate limiting for every route that spends money (Gemini, SerpAPI). Guest-first
 * onboarding (AJA-290) lets ANONYMOUS users call the API, so without a cap a script could farm free
 * guest sessions and burn the budget.
 *
 * Counting happens in Postgres (AJA-298), so a cap is global across serverless instances; the
 * in-memory window below is only the fallback when the database path is unavailable. It is one of
 * THREE layers, not the whole defense:
 *   1. Supabase's built-in auth rate limits on anonymous sign-ins (+ optional CAPTCHA the owner can
 *      enable in Attack Protection) — caps how fast guests can be minted in the first place.
 *   2. This per-user cap — bounds how much any one user or guest can spend per window.
 *   3. The daily abandoned-guest cleanup cron (`/api/cron/cleanup-guests`) — bounds accumulation.
 *
 * Fails OPEN by construction (a limiter should never be the thing that breaks capture): callers only
 * block on an explicit `ok:false`, and this module throws nothing.
 */

import { adminClient } from "@/lib/supabase/admin";

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

/**
 * AJA-298: the same fixed window, but counted in Postgres (`hit_rate_limit`, migration
 * 20261017_security_audit.sql) so the cap holds across every serverless instance instead of per
 * warm instance. Falls back to the in-memory window if the service-role client or the function
 * isn't available — the limiter still never becomes the thing that breaks a request.
 */
async function sharedRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const admin = adminClient();
  if (admin) {
    try {
      const { data, error } = await admin.rpc("hit_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: Math.ceil(windowMs / 1000),
      });
      const row = (Array.isArray(data) ? data[0] : data) as
        | { allowed?: boolean; hits?: number; retry_after?: number }
        | null;
      if (!error && row && typeof row.allowed === "boolean") {
        return {
          ok: row.allowed,
          remaining: Math.max(0, limit - (row.hits ?? limit)),
          retryAfter: row.allowed ? 0 : Math.max(1, row.retry_after ?? 1),
        };
      }
    } catch {
      // fall through to the per-instance window
    }
  }
  return rateLimit(key, limit, windowMs);
}

type Tier = { ns: string; windowMs: number; anon: number; user: number };

/**
 * Per-user budgets for every route that spends money. Guests (anonymous sessions anyone can mint)
 * get a much tighter budget than accounts. Each tier is its own bucket, so heavy stylist use never
 * eats into someone's capture budget mid-import.
 */
const TIERS = {
  // detect-garments / segment-outfit / analyze / cutout. 20 is enough to onboard ~6–12 pieces
  // incl. retries; not enough to farm.
  capture: { ns: "cap", windowMs: 5 * 60_000, anon: 20, user: 60 },
  // beautify + beautify/refine run per captured piece, so they get the capture budget again.
  enhance: { ns: "enh", windowMs: 5 * 60_000, anon: 20, user: 60 },
  // Gemini image generation — the costliest call in the app.
  tryon: { ns: "tryon", windowMs: 60 * 60_000, anon: 3, user: 30 },
  // Stylist chat/assemble, link extract/clip, detect, similar, goes-with.
  ai: { ns: "ai", windowMs: 10 * 60_000, anon: 30, user: 120 },
  // Live SerpAPI searches (find-product, shop/search web leg). Guests never reach this tier.
  search: { ns: "search", windowMs: 60 * 60_000, anon: 0, user: 40 },
} satisfies Record<string, Tier>;

export type LimitTier = keyof typeof TIERS;

/** Spend one unit of `user`'s budget for `tier`; block only on an explicit `ok:false`. */
export function checkLimit(user: { id: string; isAnonymous: boolean }, tier: LimitTier): Promise<RateResult> {
  const t: Tier = TIERS[tier];
  const limit = user.isAnonymous ? t.anon : t.user;
  if (limit <= 0) return Promise.resolve({ ok: false, remaining: 0, retryAfter: Math.ceil(t.windowMs / 1000) });
  return sharedRateLimit(`${t.ns}:${user.id}`, limit, t.windowMs);
}

/** A shared budget for routes with no user to key on (e.g. guest replies keyed by IP/share). */
export function checkKeyLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  return sharedRateLimit(key, limit, windowMs);
}

/** Cap for the paid capture routes; anonymous guests get the tighter budget. */
export function checkCaptureLimit(user: { id: string; isAnonymous: boolean }): Promise<RateResult> {
  return checkLimit(user, "capture");
}

/** Standard 429 response for a blocked capture call. */
export function tooMany(r: RateResult): Response {
  return Response.json(
    { error: "You're going a bit fast — give it a moment and try again." },
    { status: 429, headers: { "Retry-After": String(r.retryAfter) } },
  );
}
