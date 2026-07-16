"use client";

import {
  Bell,
  Bot,
  CalendarDays,
  ChartBar,
  Check,
  ChevronRight,
  Crown,
  DollarSign,
  Globe,
  Luggage,
  Moon,
  Sun,
  Tag,
  Thermometer,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, currencySymbol, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  LANGUAGES,
} from "@/lib/locale";
import {
  disableNativeOutfitReminders,
  enableNativeOutfitReminders,
  nativeNotificationsEnabledLocally,
} from "@/lib/native-notifications";
import { STYLE_QUIZ_VIBES } from "@/lib/profile";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import { ProfileAvatar } from "./ProfileAvatar";
import { Button, Chip, inputClass } from "./ui";

type SheetKind = "currency" | "vibes" | "brands" | "country" | "language";

/**
 * "You" — the settings hub, card-hub layout (AJA-142). A profile card, an
 * upgrade card that surfaces closet usage, quick-action tiles, then compact
 * grouped settings. Every row here does something real (a sheet, a toggle, or
 * one of our screens); the old "coming soon" filler rows were removed.
 */
export function YouView() {
  const {
    profile,
    authUser,
    items,
    theme,
    setTheme,
    setView,
    updateProfile,
    setAuthUser,
    setSyncStatus,
  } = useWardrobe();

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);
  const [brandInput, setBrandInput] = useState("");
  const [notifOn, setNotifOn] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    setIsNative(document.documentElement.classList.contains("native-app"));
    setNotifOn(nativeNotificationsEnabledLocally());
  }, []);

  const owned = useMemo(() => items.filter((it) => !it.wishlist).length, [items]);
  const currency = currencySymbol(profile.currency ?? DEFAULT_CURRENCY);
  const closetPct = Math.min(100, Math.round((owned / 100) * 100));
  const customBrands = profile.customBrands ?? [];
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

  const toggleTempUnit = () =>
    updateProfile({
      temperatureUnit: (profile.temperatureUnit ?? "C") === "C" ? "F" : "C",
    });

  const addBrand = () => {
    const t = brandInput.trim();
    if (!t) return;
    if (customBrands.some((b) => b.toLowerCase() === t.toLowerCase())) {
      setBrandInput("");
      return;
    }
    updateProfile({ customBrands: [...customBrands, t] });
    setBrandInput("");
  };
  const removeBrand = (b: string) =>
    updateProfile({ customBrands: customBrands.filter((x) => x !== b) });

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
        const r = isNative
          ? await enableNativeOutfitReminders()
          : await subscribeToPush();
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

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      {/* Profile card */}
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

      {/* Upgrade card — folds in the real closet usage */}
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
            <p className="text-xs text-accent/80">
              {owned}/100 items · unlock unlimited + AI
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
            Upgrade
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent/15">
          <div className="h-full rounded-full bg-accent" style={{ width: `${closetPct}%` }} />
        </div>
      </button>

      {/* Quick-action tiles */}
      <div className="grid grid-cols-3 gap-3">
        <Tile icon={ChartBar} label="Style stats" onClick={() => setView("insights")} />
        <Tile
          icon={isDark ? Sun : Moon}
          label="Appearance"
          value={isDark ? "Dark" : "Light"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        />
        <Tile
          icon={Bell}
          label="Notifications"
          value={notifBusy ? "…" : notifOn ? "On" : "Off"}
          onClick={toggleNotif}
        />
      </div>

      {/* Settings */}
      <SettingsCard label="Settings">
        <SRow icon={User} label="My information" onClick={() => setView("profile")} />
        <SRow icon={Bot} label="Outfit suggestions" onClick={() => setSheet("vibes")} />
        <SRow
          icon={Tag}
          label="Custom brands"
          value={customBrands.length ? String(customBrands.length) : undefined}
          onClick={() => setSheet("brands")}
        />
        <SRow icon={DollarSign} label="Currency" value={currency} onClick={() => setSheet("currency")} />
        <SRow
          icon={Globe}
          label="Country"
          value={profile.country ?? DEFAULT_COUNTRY}
          onClick={() => setSheet("country")}
        />
        <SRow
          icon={Globe}
          label="Language"
          value={profile.language ?? DEFAULT_LANGUAGE}
          onClick={() => setSheet("language")}
        />
        <SRow
          icon={Thermometer}
          label="Temperature unit"
          value={`°${profile.temperatureUnit ?? "C"}`}
          onClick={toggleTempUnit}
          last
        />
      </SettingsCard>

      {/* Shortcuts — features kept reachable from here */}
      <SettingsCard label="Shortcuts">
        <SRow icon={Luggage} label="Packing & trips" onClick={() => setView("travel")} />
        <SRow icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} last />
      </SettingsCard>

      {/* About & support */}
      <SettingsCard label="About & support" right="Ver 1.0.0">
        <SRow label="Help & feedback" chevron onClick={() => soon("Help & feedback")} />
        <SRow label="Privacy policy" chevron onClick={() => soon("Privacy policy")} />
        <SRow label="Terms of Service" chevron onClick={() => soon("Terms of Service")} last />
      </SettingsCard>

      {/* Account */}
      <SettingsCard label="Account">
        {authUser && <SRow label="Sign out" chevron onClick={logOut} />}
        <SRow label="Delete account" chevron danger onClick={() => soon("Delete account")} last />
      </SettingsCard>

      {/* --- inline sheets --- */}
      {sheet === "currency" && (
        <Sheet title="Currency" onClose={() => setSheet(null)}>
          {CURRENCIES.map((c) => {
            const active = (profile.currency ?? DEFAULT_CURRENCY) === c.code;
            return (
              <PickRow
                key={c.code}
                active={active}
                onClick={() => {
                  updateProfile({ currency: c.code });
                  setSheet(null);
                }}
              >
                <span className="w-8 text-center text-lg">{c.symbol}</span>
                <span className="flex-1">
                  {c.label} <span className="text-muted">· {c.code}</span>
                </span>
              </PickRow>
            );
          })}
        </Sheet>
      )}

      {sheet === "vibes" && (
        <Sheet title="Outfit suggestions" onClose={() => setSheet(null)}>
          <p className="pb-3 text-sm text-muted">
            Pick up to three style vibes — we use them for Today and Generate outfit.
          </p>
          <div className="flex flex-wrap gap-2">
            {STYLE_QUIZ_VIBES.map((v) => {
              const cur = profile.styleVibes ?? [];
              const active = cur.includes(v);
              return (
                <Chip
                  key={v}
                  active={active}
                  onClick={() => {
                    if (active) {
                      updateProfile({ styleVibes: cur.filter((x) => x !== v) });
                      return;
                    }
                    const next = cur.length >= 3 ? [...cur.slice(1), v] : [...cur, v];
                    updateProfile({ styleVibes: next });
                  }}
                >
                  {v}
                </Chip>
              );
            })}
          </div>
        </Sheet>
      )}

      {sheet === "brands" && (
        <Sheet title="Custom brands" onClose={() => setSheet(null)}>
          <p className="pb-3 text-sm text-muted">
            Add brands you buy often — they show up as suggestions when you add items.
          </p>
          <div className="flex gap-2 pb-4">
            <input
              className={inputClass}
              value={brandInput}
              placeholder="Add a brand"
              onChange={(e) => setBrandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBrand();
                }
              }}
            />
            <Button onClick={addBrand} className="!py-2">
              Add
            </Button>
          </div>
          {customBrands.length ? (
            <div className="flex flex-wrap gap-2">
              {customBrands.map((b) => (
                <span
                  key={b}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm"
                >
                  {b}
                  <button
                    type="button"
                    onClick={() => removeBrand(b)}
                    aria-label={`Remove ${b}`}
                    className="text-muted"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No custom brands yet.</p>
          )}
        </Sheet>
      )}

      {sheet === "country" && (
        <Sheet title="Country" onClose={() => setSheet(null)}>
          {COUNTRIES.map((c) => (
            <PickRow
              key={c}
              active={(profile.country ?? DEFAULT_COUNTRY) === c}
              onClick={() => {
                updateProfile({ country: c });
                setSheet(null);
              }}
            >
              <span className="flex-1">{c}</span>
            </PickRow>
          ))}
        </Sheet>
      )}

      {sheet === "language" && (
        <Sheet title="Language" onClose={() => setSheet(null)}>
          <p className="pb-3 text-sm text-muted">
            Sets your preferred language. Full in-app translation is coming soon.
          </p>
          {LANGUAGES.map((l) => (
            <PickRow
              key={l.code}
              active={(profile.language ?? DEFAULT_LANGUAGE) === l.label}
              onClick={() => {
                updateProfile({ language: l.label });
                setSheet(null);
              }}
            >
              <span className="flex-1">{l.label}</span>
            </PickRow>
          ))}
        </Sheet>
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

function Tile({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-3.5 text-center"
    >
      <Icon size={21} className="text-accent" />
      <span className="text-xs font-medium leading-tight">{label}</span>
      {value && <span className="text-[11px] text-muted">{value}</span>}
    </button>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="native-sheet-handle" />
        <div className="mb-1 flex items-center justify-between">
          <h2 className="heading text-lg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PickRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-line px-1 py-3.5 text-left last:border-none"
    >
      {children}
      {active && <Check size={18} className="shrink-0 text-accent" />}
    </button>
  );
}

function SettingsCard({
  label,
  right,
  children,
}: {
  label: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        {right && <span className="text-xs text-muted">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function SRow({
  icon: Icon,
  label,
  value,
  onClick,
  chevron,
  danger,
  last,
}: {
  icon?: LucideIcon;
  label: string;
  value?: string;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 ${
        last ? "" : "border-b border-line"
      }`}
    >
      {Icon && <Icon size={19} strokeWidth={1.7} className={danger ? "text-red-600" : ""} />}
      <span className={`flex-1 ${danger ? "text-red-600" : ""}`}>{label}</span>
      {value && <span className="text-accent">{value}</span>}
      {chevron && <ChevronRight size={16} className="text-muted" />}
    </button>
  );
}
