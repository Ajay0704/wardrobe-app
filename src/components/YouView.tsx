"use client";

import {
  ArrowDownUp,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Coins,
  DollarSign,
  FileText,
  Globe,
  History,
  Luggage,
  Settings,
  Tag,
  Target,
  Thermometer,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, currencySymbol, DEFAULT_CURRENCY } from "@/lib/currency";
import { STYLE_QUIZ_VIBES } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import { NotificationsPanel } from "./SettingsView";
import { ProfileAvatar } from "./ProfileAvatar";
import { Chip } from "./ui";

type SheetKind = "currency" | "vibes" | "notifications";

/**
 * "My page" — profile, plan/closet stats, a highlights row, and grouped settings.
 * Layout modelled on Acloset. Every row that does something is handled inline
 * (a native sheet or one of our own screens) — nothing here opens the old
 * SettingsView. Not-yet-built rows show a "coming soon" toast.
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
  useEffect(() => {
    setIsNative(document.documentElement.classList.contains("native-app"));
  }, []);

  const owned = useMemo(() => items.filter((it) => !it.wishlist).length, [items]);
  const currency = currencySymbol(profile.currency ?? DEFAULT_CURRENCY);
  const closetPct = Math.min(100, Math.round((owned / 100) * 100));

  const soon = (what: string) => {
    setToast(`${what} — coming soon`);
    window.setTimeout(() => setToast(null), 2000);
  };
  const logOut = () => {
    setAuthUser(null);
    setSyncStatus("offline");
    void signOut();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      {/* Profile + Avatar cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setView("profile")}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <ProfileAvatar profile={profile} size={36} />
          <span className="font-semibold">My Profile</span>
        </button>
        <button
          type="button"
          onClick={() => setView("profile")}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent">
            <User size={18} />
          </span>
          <span className="font-semibold">My Avatar</span>
        </button>
      </div>

      {/* Plan / Bean / Closet stats */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex">
          <button type="button" onClick={() => soon("Plans")} className="flex-1 text-left">
            <div className="flex items-center gap-1 text-sm text-muted">
              My plan <ChevronRight size={14} />
            </div>
            <p className="mt-0.5 text-lg font-semibold">Free</p>
          </button>
          <div className="w-px bg-line" />
          <button type="button" onClick={() => soon("Beans")} className="flex-1 pl-5 text-left">
            <div className="flex items-center gap-1 text-sm text-muted">
              My Bean <ChevronRight size={14} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold">
              <Coins size={16} className="text-accent" /> 0
            </p>
          </button>
        </div>
        <div className="my-4 border-t border-line" />
        <button type="button" onClick={() => setView("wardrobe")} className="block w-full text-left">
          <div className="flex items-center justify-between text-sm text-muted">
            My closet <ChevronRight size={14} />
          </div>
          <p className="mt-0.5 text-lg font-semibold">
            {owned}
            <span className="text-muted">/100</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${closetPct}%` }} />
          </div>
        </button>
        <button
          type="button"
          onClick={() => soon("Extra closet slots")}
          className="mt-4 block w-full border-t border-line pt-3 text-center text-sm font-medium text-accent"
        >
          Get extra closet slots for free! ›
        </button>
      </div>

      {/* Highlights row */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
        <Highlight icon={Target} label="Mission" tint="#e8f0fe" fg="#2f6bd8" onClick={() => soon("Mission")} />
        <Highlight icon={BarChart3} label="Style stats" tint="#e9eefb" fg="#3a5bd0" onClick={() => setView("insights")} />
        <Highlight icon={FileText} label="Monthly report" tint="#fdeee0" fg="#c67a3e" onClick={() => soon("Monthly report")} />
      </div>

      {/* Account settings */}
      <SettingsCard label="Account Settings">
        <SRow icon={User} label="My information" onClick={() => setView("profile")} />
        <SRow icon={Bot} label="Outfit suggestion settings" onClick={() => setSheet("vibes")} />
        <SRow icon={Bell} label="Notifications" onClick={() => setSheet("notifications")} />
        <SRow icon={History} label="Purchase Info" onClick={() => soon("Purchase info")} />
        <SRow icon={CalendarDays} label="Week start day" value="Sunday" onClick={() => soon("Week start day")} />
        <SRow icon={Tag} label="Custom Brands" onClick={() => soon("Custom brands")} />
        <SRow icon={Thermometer} label="Temperature Unit" value="°C" onClick={() => soon("Temperature unit")} />
        <SRow icon={DollarSign} label="Currency" value={currency} onClick={() => setSheet("currency")} />
        <SRow icon={Globe} label="Country" value="United States" onClick={() => soon("Country")} />
        <SRow icon={Globe} label="Language" value="English" onClick={() => soon("Language")} />
        <SRow icon={Luggage} label="Packing & trips" onClick={() => setView("travel")} />
        <SRow icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} />
        <SRow icon={Settings} label="Navigation setting" onClick={() => soon("Navigation setting")} />
        <SRow
          icon={ArrowDownUp}
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          last
        />
      </SettingsCard>

      {/* Customer service */}
      <SettingsCard label="Wardrobe Customer Service">
        <SRow label="FAQ" onClick={() => soon("FAQ")} />
        <SRow label="Notice" onClick={() => soon("Notice")} />
        <SRow label="Feedback & Suggestions" onClick={() => soon("Feedback")} />
        <SRow label="Visit our Instagram" onClick={() => soon("Instagram")} last />
      </SettingsCard>

      {/* Terms */}
      <SettingsCard label="Terms of Service" right="Ver 1.0.0">
        <SRow label="Service Terms" chevron onClick={() => soon("Service terms")} />
        <SRow label="Privacy policy" chevron onClick={() => soon("Privacy policy")} last />
      </SettingsCard>

      {/* Sign in */}
      <SettingsCard label="Sign In">
        <SRow label="Change sign in method" chevron onClick={() => soon("Change sign-in method")} />
        {authUser && <SRow label="Sign Out" chevron onClick={logOut} />}
        <SRow label="Delete Account" chevron danger onClick={() => soon("Delete account")} last />
      </SettingsCard>

      {/* --- inline sheets (never the old SettingsView) --- */}
      {sheet === "currency" && (
        <Sheet title="Currency" onClose={() => setSheet(null)}>
          {CURRENCIES.map((c) => {
            const active = (profile.currency ?? DEFAULT_CURRENCY) === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  updateProfile({ currency: c.code });
                  setSheet(null);
                }}
                className="flex w-full items-center gap-3 border-b border-line px-1 py-3.5 text-left last:border-none"
              >
                <span className="w-8 text-center text-lg">{c.symbol}</span>
                <span className="flex-1">
                  {c.label} <span className="text-muted">· {c.code}</span>
                </span>
                {active && <Check size={18} className="text-accent" />}
              </button>
            );
          })}
        </Sheet>
      )}

      {sheet === "vibes" && (
        <Sheet title="Outfit suggestion settings" onClose={() => setSheet(null)}>
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

      {sheet === "notifications" && (
        <Sheet title="Notifications" onClose={() => setSheet(null)}>
          <NotificationsPanel native={isNative} />
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

function Highlight({
  icon: Icon,
  label,
  tint,
  fg,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tint: string;
  fg: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-28 w-36 shrink-0 flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-left"
    >
      <span className="font-semibold">{label}</span>
      <span
        className="flex h-10 w-10 items-center justify-center self-end rounded-xl"
        style={{ background: tint, color: fg }}
      >
        <Icon size={20} />
      </span>
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
