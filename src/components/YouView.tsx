"use client";

import {
  Bell,
  CalendarDays,
  ChartBar,
  Download,
  FileText,
  LifeBuoy,
  Luggage,
  Palette,
  Ruler,
  Shield,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  UserCog,
} from "lucide-react";
import { useRef, useState } from "react";
import { beautify, BEAUTIFY_PIPELINE } from "@/lib/beautify";
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
    updateItem,
  } = useWardrobe();

  const isNative = useIsNativeApp();
  const [toast, setToast] = useState<string | null>(null);
  const [stdBusy, setStdBusy] = useState(false);
  const [stdProg, setStdProg] = useState({ done: 0, total: 0 });
  const stdCancel = useRef(false);
  const [notifOn, setNotifOn] = useState(
    () => typeof window !== "undefined" && nativeNotificationsEnabledLocally(),
  );
  const [notifBusy, setNotifBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

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

  /**
   * Batch "Standardize my closet" (AJA-225): redraw every owned item not yet on the current
   * pipeline into the new per-category product form, keeping the cutout/original for per-item
   * revert. Two workers + cancel; each updateItem coalesces into one debounced sync push.
   */
  const standardizeCloset = async () => {
    if (stdBusy || !authUser) return;
    const targets = items.filter(
      (it) => !it.wishlist && it.imageUrl && !(it.beautifyModel ?? "").includes(BEAUTIFY_PIPELINE),
    );
    if (targets.length === 0) {
      flash("Everything's already standardized");
      return;
    }
    stdCancel.current = false;
    setStdBusy(true);
    setStdProg({ done: 0, total: targets.length });
    let done = 0;
    let idx = 0;
    const worker = async () => {
      while (idx < targets.length && !stdCancel.current) {
        const it = targets[idx++];
        const base = it.cutoutImageUrl ?? it.originalImageUrl ?? it.imageUrl;
        try {
          const r = await beautify(base, authUser.id, it.category);
          updateItem(it.id, {
            imageUrl: r.url,
            cutoutImageUrl: base,
            beautifiedImageUrl: r.url,
            beautifyWhiteUrl: r.whiteUrl,
            beautifyModel: r.model,
          });
        } catch (e) {
          if ((e as Error).message === "beautify 501") {
            stdCancel.current = true;
            flash("Standardize needs GEMINI_API_KEY");
          }
          /* else skip this item, keep its current image */
        }
        done++;
        setStdProg({ done, total: targets.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setStdBusy(false);
    flash(
      stdCancel.current
        ? `Stopped — standardized ${done}`
        : `Standardized ${done} item${done === 1 ? "" : "s"}`,
    );
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

      <Group label="Account">
        <Row icon={UserCog} label="Account details" onClick={() => setView("settingsAccount")} chevron />
        <Row icon={Download} label="Export your data" onClick={exportData} chevron />
      </Group>

      <Group label="You">
        <Row icon={Ruler} label="Fit & sizes" onClick={() => setView("fitSizes")} chevron />
        <Row icon={Palette} label="Style & taste" onClick={() => setView("styleTaste")} chevron />
      </Group>

      <Group label="Closet" right="Product shots">
        <Row
          icon={Sparkles}
          label="Standardize my closet"
          value={stdBusy ? `${stdProg.done}/${stdProg.total}` : undefined}
          onClick={() => void standardizeCloset()}
          chevron
        />
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

      <Group label="About" right="Ver 1.1.0">
        <Row icon={LifeBuoy} label="Help & feedback" onClick={() => soon("Help & feedback")} chevron />
        <Row icon={Shield} label="Privacy policy" onClick={() => soon("Privacy policy")} chevron />
        <Row icon={FileText} label="Terms of Service" onClick={() => soon("Terms of Service")} chevron />
      </Group>

      <div className="space-y-3 pt-2 text-center">
        {authUser && (
          <button type="button" onClick={logOut} className="text-[15px] font-medium text-accent">
            Sign out
          </button>
        )}
        <div>
          <button type="button" onClick={() => setShowDelete(true)} className="text-sm text-red-600">
            Delete account
          </button>
        </div>
      </div>

      {showDelete && <DeleteAccountDialog onClose={() => setShowDelete(false)} />}

      {stdBusy && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-xs rounded-3xl bg-surface p-6 text-center">
            <p className="heading text-lg">Standardizing your closet</p>
            <p className="mt-1 text-sm text-muted">
              {stdProg.done} of {stdProg.total} · this can take a moment
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${stdProg.total ? (stdProg.done / stdProg.total) * 100 : 0}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                stdCancel.current = true;
              }}
              className="mt-4 rounded-full border border-line px-5 py-2 text-sm font-medium transition-transform active:scale-95"
            >
              Stop
            </button>
          </div>
        </div>
      )}

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
