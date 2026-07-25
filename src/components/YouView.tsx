"use client";

import {
  Bell,
  CalendarDays,
  ChartBar,
  Crown,
  Download,
  FileText,
  LifeBuoy,
  Luggage,
  Palette,
  Ruler,
  Shield,
  SlidersHorizontal,
  SunMoon,
  UserCog,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  disableNativeOutfitReminders,
  enableNativeOutfitReminders,
  nativeNotificationsEnabledLocally,
} from "@/lib/native-notifications";
import { profileHandle } from "@/lib/profile";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { useIsNativeApp } from "./NativeAppClass";
import { ProfileAvatar } from "./ProfileAvatar";
import { Toggle } from "./ui";
import { Group, Row } from "./you/settings-ui";

/**
 * "Settings" — one calm hub (AJA-202). A profile card, an upgrade card, then
 * grouped rows (You / App / Shortcuts / Account / About) that either toggle in
 * place or drill into a focused sub-page. The heavy "My information" fields now
 * live in the Fit & sizes / Style & taste / Account sub-pages, not here.
 */
export function YouView() {
  const {
    profile,
    authUser,
    items,
    outfits,
    theme,
    setTheme,
    setView,
    setAuthUser,
    setSyncStatus,
  } = useWardrobe();

  const isNative = useIsNativeApp();
  const [toast, setToast] = useState<string | null>(null);
  const [notifOn, setNotifOn] = useState(
    () => typeof window !== "undefined" && nativeNotificationsEnabledLocally(),
  );
  const [notifBusy, setNotifBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const owned = useMemo(() => items.filter((it) => !it.wishlist).length, [items]);
  const closetPct = Math.min(100, Math.round((owned / 100) * 100));
  const name = profile.displayName?.trim() || "You";
  const handle = profileHandle(profile);
  const isDark = theme === "dark";

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };
  const soon = (what: string) => flash(`${what} — coming soon`);

  const logOut = () => {
    setAuthUser(null);
    setSyncStatus("offline");
    void signOut();
  };

  const toggleNotif = async () => {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      if (notifOn) {
        if (isNative) await disableNativeOutfitReminders();
        else await unsubscribeFromPush();
        setNotifOn(false);
        flash("Reminders turned off");
      } else {
        const r = isNative ? await enableNativeOutfitReminders() : await subscribeToPush();
        if (r.ok) {
          setNotifOn(true);
          flash("Reminders on — daily outfit nudge");
        } else {
          flash(r.error);
        }
      }
    } finally {
      setNotifBusy(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ profile, items, outfits }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wardrobe-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported your data");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      {/* Profile card → profile editor */}
      <button
        type="button"
        onClick={() => setView("profile")}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
      >
        <ProfileAvatar profile={profile} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-sm text-muted">@{handle}</p>
        </div>
        <span className="rounded-full border border-line px-4 py-1.5 text-sm font-medium">
          Edit
        </span>
      </button>

      {/* Upgrade card */}
      <button
        type="button"
        onClick={() => soon("Wardrobe Premium")}
        className="w-full rounded-2xl bg-accent-soft p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Crown size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-accent">Wardrobe Free</p>
            <p className="text-xs text-accent/80">{owned}/100 items · unlock unlimited + AI</p>
          </div>
          <span className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
            Upgrade
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent/15">
          <div className="h-full rounded-full bg-accent" style={{ width: `${closetPct}%` }} />
        </div>
      </button>

      <Group label="You">
        <Row icon={Ruler} label="Fit & sizes" onClick={() => setView("fitSizes")} chevron />
        <Row icon={Palette} label="Style & taste" onClick={() => setView("styleTaste")} chevron />
      </Group>

      <Group label="App">
        <Row
          icon={SunMoon}
          label="Appearance"
          value={isDark ? "Dark" : "Light"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        />
        <Row
          icon={Bell}
          label="Notifications"
          right={<Toggle on={notifOn} onChange={() => void toggleNotif()} disabled={notifBusy} label="Outfit reminders" />}
        />
        <Row
          icon={SlidersHorizontal}
          label="App & region"
          onClick={() => setView("settingsApp")}
          chevron
        />
      </Group>

      <Group label="Shortcuts">
        <Row icon={ChartBar} label="Style stats" onClick={() => setView("insights")} chevron />
        <Row icon={Luggage} label="Packing & trips" onClick={() => setView("travel")} chevron />
        <Row icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} chevron />
      </Group>

      <Group label="Account">
        <Row icon={UserCog} label="Account details" onClick={() => setView("settingsAccount")} chevron />
        <Row icon={Download} label="Export your data" onClick={exportData} chevron />
        {authUser && <Row label="Sign out" onClick={logOut} chevron />}
        <Row label="Delete account" danger onClick={() => setShowDelete(true)} chevron />
      </Group>

      <Group label="About" right="Ver 1.1.0">
        <Row icon={LifeBuoy} label="Help & feedback" onClick={() => soon("Help & feedback")} chevron />
        <Row icon={Shield} label="Privacy policy" onClick={() => soon("Privacy policy")} chevron />
        <Row icon={FileText} label="Terms of Service" onClick={() => soon("Terms of Service")} chevron />
      </Group>

      {showDelete && <DeleteAccountDialog onClose={() => setShowDelete(false)} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}
