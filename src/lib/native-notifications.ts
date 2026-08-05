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

/**
 * Morning hour, chosen by the user during onboarding (AJA-277) and remembered so a later
 * re-enable doesn't silently revert to the default.
 *
 * A fixed 07:00 was wrong for anyone who isn't up at seven. The one review in the whole
 * category that describes this exact mechanic working also names its flaw: Stylebook ships a
 * morning outfit reminder with a NON-configurable time, and a 4-star reviewer says "I get up
 * really early... the notification comes when I'm already at work."
 */
const HOUR_KEY = "wardrobe:native-notifs-hour";
const DEFAULT_HOUR = 7;
const clampHour = (h: number) => (Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR);

export function savedReminderHour(): number {
  if (typeof window === "undefined") return DEFAULT_HOUR;
  try {
    const n = Number(localStorage.getItem(HOUR_KEY));
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_HOUR;
  } catch {
    return DEFAULT_HOUR;
  }
}

export async function enableNativeOutfitReminders(
  /** 0–23. Falls back to whatever the user last chose, then 07:00. */
  hour: number = savedReminderHour(),
  minute = 0,
): Promise<
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
          // `on: { hour, minute }` maps to UNCalendarNotificationTrigger with repeats:true —
          // a real wall-clock daily notification that survives reboot and app update, and
          // counts as ONE against iOS's 64 pending-notification cap. Do NOT switch to `at`
          // or `every`, which the plugin maps to interval triggers that drift.
          on: { hour: clampHour(hour), minute },
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
  try {
    localStorage.setItem(HOUR_KEY, String(clampHour(hour)));
  } catch {
    /* private mode — the schedule is still set, we just can't remember the hour */
  }
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
