/**
 * On-device morning / Sunday nudges for the Capacitor iOS app.
 * Remote APNs needs a paid Apple Developer Program — local notifications
 * work on free Personal Team provisioning and match the habit loop UX.
 */

import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  Weekday,
} from "@capacitor/local-notifications";

const MORNING_ID = 3601;
const SUNDAY_ID = 3602;
const ENABLED_KEY = "wardrobe:native-notifs-v1";

export function nativeNotificationsAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.isPluginAvailable("LocalNotifications");
}

export function nativeNotificationsEnabledLocally(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function setEnabledFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* private mode */
  }
}

export async function enableNativeOutfitReminders(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: "Native reminders only work in the iOS app." };
  }
  if (!Capacitor.isPluginAvailable("LocalNotifications")) {
    return {
      ok: false,
      error:
        "Notifications need the latest app build. Reinstall from Xcode (Product → Run).",
    };
  }

  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    perm = await LocalNotifications.requestPermissions();
  }
  if (perm.display !== "granted") {
    return {
      ok: false,
      error: "Notification permission was denied. Enable it in iOS Settings.",
    };
  }

  await LocalNotifications.cancel({
    notifications: [{ id: MORNING_ID }, { id: SUNDAY_ID }],
  });

  await LocalNotifications.schedule({
    notifications: [
      {
        id: MORNING_ID,
        title: "Here's today's outfit",
        body: "Open Wardrobe — weather-aware looks are ready on Today.",
        schedule: {
          on: { hour: 7, minute: 0 },
          allowWhileIdle: true,
          repeats: true,
        },
        extra: { view: "explore" },
      },
      {
        id: SUNDAY_ID,
        title: "Plan your week",
        body: "Sketch a few looks for the days ahead.",
        schedule: {
          on: { weekday: Weekday.Sunday, hour: 10, minute: 0 },
          allowWhileIdle: true,
          repeats: true,
        },
        extra: { view: "calendar" },
      },
    ],
  });

  setEnabledFlag(true);
  return { ok: true };
}

export async function disableNativeOutfitReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable("LocalNotifications")) {
    setEnabledFlag(false);
    return;
  }
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: MORNING_ID }, { id: SUNDAY_ID }],
    });
  } catch {
    /* ignore */
  }
  setEnabledFlag(false);
}
