/**
 * AJA-286 · Native remote push (APNs) registration for the Capacitor iOS app — the device
 * half of the ageing-wishlist nudge. Complements native-notifications.ts (on-device local
 * reminders): this one gets an APNs device token so the SERVER can reach the phone.
 *
 * Everything is guarded: on web (or any build without the PushNotifications plugin) it no-ops,
 * and the token POST is best-effort. The plugin is dynamically imported so the web bundle never
 * pulls it in. Requires the Push Notifications capability + an APNs key to actually deliver —
 * until then `register()` just fires `registrationError`, harmlessly.
 */
import { authHeaders } from "./supabase/client";

let lastToken: string | null = null;
let wired = false;

/** POST the APNs token for the signed-in user (upsert). Best-effort; 401s silently pre-login. */
async function postToken(token: string): Promise<void> {
  try {
    await fetch("/api/push/device-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ token, platform: "ios" }),
      keepalive: true,
    });
  } catch {
    /* best-effort telemetry-grade write */
  }
}

/**
 * Wire the listeners once, then ask for permission and register with APNs. Idempotent — safe to
 * call on every mount. Returns silently on web or when the plugin isn't present.
 */
export async function registerNativePush(): Promise<void> {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("PushNotifications")) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  if (!wired) {
    wired = true;
    // iOS hands back the APNs device token here; cache it (to re-sync after a later sign-in) and store it.
    await PushNotifications.addListener("registration", (t) => {
      lastToken = t.value;
      void postToken(t.value);
    });
    await PushNotifications.addListener("registrationError", () => {
      /* no capability / no key / simulator on free provisioning — expected until Apple side is set up */
    });
    // Tap → open the deep-link we sent in the payload's data (the verdict view for the item).
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification?.data as { url?: string } | undefined)?.url;
      if (url) {
        try {
          window.location.assign(url);
        } catch {
          /* ignore */
        }
      }
    });
  }

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
}

/** Re-POST the cached token once we have a signed-in user (tokens are user-scoped). */
export async function syncNativePushToken(): Promise<void> {
  if (lastToken) await postToken(lastToken);
}
