"use client";

import {
  Bell,
  CalendarDays,
  ChartBar,
  CloudSun,
  Download,
  FileText,
  LifeBuoy,
  Luggage,
  Palette,
  Ruler,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  SunMoon,
  UserCog,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AUTO_BEAUTIFY_CATEGORIES, beautify, BEAUTIFY_PIPELINE } from "@/lib/beautify";
import { isSampleItem } from "@/lib/demo-data";
import {
  disableNativeOutfitReminders,
  enableNativeOutfitReminders,
  nativeNotificationsEnabledLocally,
} from "@/lib/native-notifications";
import { profileHandle } from "@/lib/profile";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import {
  CONTEXT_SEASONS,
  TEMP_MAX,
  TEMP_MIN,
  describeStyleContext,
} from "@/lib/style-context";
import { STYLE_OCCASIONS } from "@/lib/style-quiz";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { useIsNativeApp } from "./NativeAppClass";
import { ProfileAvatar } from "./ProfileAvatar";
import { TryOnPhotoRow } from "./TryOnPhotoRow";
import { Chip, Toggle } from "./ui";
import { countNeedingBackfill } from "@/lib/backfill-attrs";
import { runAttributeBackfill } from "@/lib/import-queue";
import { Group, Row } from "./you/settings-ui";

/** AJA-258 — a settings field holding interactive children. `Row` renders a
 *  <button>, so chips can't nest inside one; this mirrors Row's padding + hairline. */
function CtxField({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line">
      <p className="mb-2 text-[13px] font-medium text-muted">{title}</p>
      {children}
    </div>
  );
}

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

  const importStatus = useWardrobe((s) => s.importStatus);
  const jobRunning = !!importStatus?.running;
  const backfillRunning = jobRunning && importStatus?.phase === "backfill";
  const needBackfill = useMemo(() => countNeedingBackfill(items), [items]);

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
  // AJA-258 — Style context row (variant B). Collapsed by default.
  const styleContext = useWardrobe((s) => s.styleContext);
  const setStyleContext = useWardrobe((s) => s.setStyleContext);
  const [ctxOpen, setCtxOpen] = useState(false);
  // Season and temperature are independent controls, so they can disagree. The
  // thermal filters follow the temperature (AJA-258 phase 1) while the scorer's
  // contextFit still follows the declared season, so a contradictory pair gives
  // you coherent-but-surprising looks. Saying so beats letting you wonder.
  const ctxContradiction = useMemo(() => {
    if (styleContext.mode !== "manual") return null;
    const { season, tempC } = styleContext;
    const warmSeason = season === "summer" || season === "spring";
    if (warmSeason && tempC < 10) return `${season} at ${tempC}°C is contradictory — cold-weather rules will win.`;
    if (!warmSeason && tempC > 22) return `${season} at ${tempC}°C is contradictory — warm-weather rules will win.`;
    return null;
  }, [styleContext]);

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
   * Batch "Standardize my closet" (AJA-225): bring every owned item onto the current pipeline.
   * Garments (tops/bottoms/dresses/outerwear) get the per-category beautify redraw, which centers
   * the sticker via refine. Products (shoes/bags/accessories) are NEVER redrawn — the generative
   * beautify mangles them into white blobs — so any product that was previously beautified is
   * REVERTED to its real cut-out photo. Both stamp the current pipeline so they're skipped next
   * run. Two workers + cancel; updateItems coalesce into one debounced sync push.
   */
  const standardizeCloset = async () => {
    if (stdBusy || !authUser) return;
    const targets = items.filter(
      (it) =>
        !it.wishlist &&
        it.imageUrl &&
        // AJA-277: starter pieces are line DRAWINGS, not photos. They carry no pipeline
        // stamp, so without this guard they'd match and get shipped to the paid beautify
        // route — spending credits to "standardize" an SVG sketch into a white blob.
        !isSampleItem(it) &&
        !(it.beautifyModel ?? "").includes(BEAUTIFY_PIPELINE),
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
        try {
          if (AUTO_BEAUTIFY_CATEGORIES.has(it.category)) {
            // Garment → per-category beautify; refine centers the sticker.
            const base = it.cutoutImageUrl ?? it.originalImageUrl ?? it.imageUrl;
            const r = await beautify(base, authUser.id, it.category);
            updateItem(it.id, {
              imageUrl: r.url,
              cutoutImageUrl: base,
              beautifiedImageUrl: r.url,
              beautifyWhiteUrl: r.whiteUrl,
              beautifyModel: r.model,
            });
          } else {
            // Product → never redraw. Revert a previously-beautified product to its clean cut-out
            // photo and clear the beautify so the editor shows the real item; just stamp the rest.
            const photo = it.cutoutImageUrl ?? it.originalImageUrl ?? it.imageUrl;
            updateItem(it.id, {
              imageUrl: photo,
              beautifiedImageUrl: undefined,
              beautifyWhiteUrl: undefined,
              beautifyModel: `photo+${BEAUTIFY_PIPELINE}`,
            });
          }
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
        {/* First in the group, and it shows the photo itself (AJA-276) — it was
            previously buried inside Fit & sizes behind the word "Added". */}
        <TryOnPhotoRow />
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
        {/* AJA-247. The count is shown rather than a bare label so the row never implies
            work it isn't going to do, and it reads "All filled in" once there's none. */}
        <Row
          icon={Wand2}
          label="Fill in missing details"
          value={
            backfillRunning
              ? `${importStatus?.done ?? 0}/${importStatus?.total ?? 0}`
              : needBackfill > 0
                ? `${needBackfill} item${needBackfill === 1 ? "" : "s"}`
                : "All filled in"
          }
          onClick={
            needBackfill > 0 && !jobRunning ? () => void runAttributeBackfill() : undefined
          }
          chevron={needBackfill > 0 && !jobRunning}
        />
        {/* AJA-258 — Style context. Variant B of three prototypes: one row that
            expands, with Auto as the default so behaviour is unchanged unless you
            deliberately opt in. The row's value doubles as the status line, which
            is the point — the real failure mode of an override is forgetting it is
            on and wondering why suggestions look wrong. */}
        <Row
          icon={CloudSun}
          label="Style context"
          onClick={() => setCtxOpen((o) => !o)}
          // `right`, not `value`: the summary runs to ~30 characters, and Row's value
          // slot is a shrink-0 single line that overlapped and wrapped the label.
          right={
            <span className="max-w-[46%] shrink-0 text-right text-[11.5px] capitalize leading-[1.35] text-muted">
              {describeStyleContext(styleContext)}
            </span>
          }
          chevron
        />
        {ctxOpen && (
          <>
            <CtxField title="Use">
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  active={styleContext.mode === "auto"}
                  onClick={() => setStyleContext({ mode: "auto" })}
                >
                  Auto
                </Chip>
                <Chip
                  active={styleContext.mode === "manual"}
                  onClick={() => setStyleContext({ mode: "manual" })}
                >
                  Manual
                </Chip>
              </div>
            </CtxField>
            {styleContext.mode === "manual" && (
              <>
                <CtxField title="Season">
                  <div className="flex flex-wrap gap-1.5">
                    {CONTEXT_SEASONS.map((s) => (
                      <Chip
                        key={s}
                        active={styleContext.season === s}
                        onClick={() => setStyleContext({ season: s })}
                      >
                        {s}
                      </Chip>
                    ))}
                  </div>
                </CtxField>
                <CtxField title="Occasion">
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_OCCASIONS.map((o) => (
                      <Chip
                        key={o.id}
                        active={styleContext.occasion === o.id}
                        onClick={() => setStyleContext({ occasion: o.id })}
                      >
                        {o.label.split(" / ")[0]}
                      </Chip>
                    ))}
                  </div>
                </CtxField>
                <CtxField title="Temperature">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={TEMP_MIN}
                      max={TEMP_MAX}
                      value={styleContext.tempC}
                      onChange={(e) => setStyleContext({ tempC: Number(e.target.value) })}
                      className="h-1.5 w-full"
                      style={{ accentColor: "var(--accent)" }}
                      aria-label="Temperature"
                    />
                    <b className="w-12 shrink-0 text-right text-[15px] tabular-nums">
                      {styleContext.tempC}°C
                    </b>
                  </div>
                </CtxField>
                <Row
                  icon={CloudSun}
                  label="Needs a coat"
                  right={
                    <Toggle
                      on={styleContext.needsOuterwear}
                      onChange={() => setStyleContext({ needsOuterwear: !styleContext.needsOuterwear })}
                      label="Needs a coat"
                    />
                  }
                />
                {ctxContradiction && (
                  <p className="px-3.5 pb-3 text-[11.5px] leading-relaxed text-amber-700">
                    {ctxContradiction}
                  </p>
                )}
              </>
            )}
          </>
        )}
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
