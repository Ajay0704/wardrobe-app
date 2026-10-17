/**
 * AJA-286 · Server → APNs (iOS remote push) — the iOS half of the ageing-wishlist nudge.
 *
 * Direct APNs over HTTP/2 with token (`.p8`) auth via `apns2` — deliberately NOT Firebase:
 * it mirrors the existing web-push path instead of adding a second vendor. The client is
 * built once per serverless instance and reused for the whole batch (one HTTP/2 socket).
 *
 * Entirely env-gated: with no `APNS_*` keys this returns null and the cron simply degrades
 * to web-push only — so every line here is safe to ship before the owner creates the key.
 */
import { ApnsClient, ApnsError, Errors, Host, Notification } from "apns2";

let cached: ApnsClient | null | undefined;

/** The APNs client from env, or null when not configured. Memoized per instance. */
export function getApnsClient(): ApnsClient | null {
  if (cached !== undefined) return cached;
  // Env-stored .p8 contents commonly arrive with literal "\n" — restore real newlines.
  const signingKey = process.env.APNS_KEY_P8?.replace(/\\n/g, "\n");
  const keyId = process.env.APNS_KEY_ID;
  const team = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!signingKey || !keyId || !team || !bundleId) {
    cached = null;
    return null;
  }
  cached = new ApnsClient({
    team,
    keyId,
    signingKey,
    defaultTopic: bundleId,
    // A dev / TestFlight build is signed for the APNs sandbox; an App Store build for production.
    // Mismatch is the classic silent failure (every send → BadDeviceToken), so it's explicit.
    host: process.env.APNS_ENV === "production" ? Host.production : Host.development,
    keepAlive: true,
  });
  return cached;
}

export interface ApnsMessage {
  title: string;
  body: string;
  /** Deep-link opened on tap (handled by the app's pushNotificationActionPerformed). */
  url?: string;
  itemRef?: string;
}

export type ApnsResult = "sent" | "prune" | "error";

/** Send one alert to one device token. Never throws; says whether the token should be pruned. */
export async function sendApns(
  client: ApnsClient,
  token: string,
  m: ApnsMessage,
): Promise<ApnsResult> {
  try {
    await client.send(
      new Notification(token, {
        alert: { title: m.title, body: m.body },
        sound: "default",
        data: { url: m.url, itemRef: m.itemRef },
      }),
    );
    return "sent";
  } catch (err) {
    const reason = err instanceof ApnsError ? err.reason : undefined;
    // Dead / uninstalled / wrong-topic tokens: drop them so we stop trying.
    if (
      reason === Errors.badDeviceToken ||
      reason === Errors.unregistered ||
      reason === Errors.deviceTokenNotForTopic
    ) {
      return "prune";
    }
    return "error";
  }
}
