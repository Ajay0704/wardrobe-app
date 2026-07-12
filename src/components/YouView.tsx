"use client";

import {
  ArrowDownUp,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
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
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { currencySymbol, DEFAULT_CURRENCY } from "@/lib/currency";
import type { SettingsSection } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import { ProfileAvatar } from "./ProfileAvatar";

/**
 * "My page" — profile, plan/closet stats, a highlights row, and grouped settings
 * (Account · Customer service · Terms · Sign in). Layout modelled on Acloset;
 * rows wire to our real screens where we have them, placeholders otherwise.
 */
export function YouView() {
  const {
    profile,
    authUser,
    items,
    theme,
    setTheme,
    setView,
    setSettingsSection,
    setAuthUser,
    setSyncStatus,
  } = useWardrobe();

  const owned = useMemo(() => items.filter((it) => !it.wishlist).length, [items]);
  const currency = currencySymbol(profile.currency ?? DEFAULT_CURRENCY);

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setView("settings");
  };
  const logOut = () => {
    setAuthUser(null);
    setSyncStatus("offline");
    void signOut();
  };
  const closetPct = Math.min(100, Math.round((owned / 100) * 100));

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      {/* Profile + Avatar cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => openSettings("profile")}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <ProfileAvatar profile={profile} size={36} />
          <span className="font-semibold">My Profile</span>
        </button>
        <button
          type="button"
          onClick={() => openSettings("profile")}
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
          <div className="flex-1">
            <div className="flex items-center gap-1 text-sm text-muted">
              My plan <ChevronRight size={14} />
            </div>
            <p className="mt-0.5 text-lg font-semibold">Free</p>
          </div>
          <div className="w-px bg-line" />
          <div className="flex-1 pl-5">
            <div className="flex items-center gap-1 text-sm text-muted">
              My Bean <ChevronRight size={14} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold">
              <Coins size={16} className="text-accent" /> 0
            </p>
          </div>
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
        <div className="mt-4 border-t border-line pt-3 text-center text-sm font-medium text-accent">
          Get extra closet slots for free! ›
        </div>
      </div>

      {/* Highlights row */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
        <Highlight icon={Target} label="Mission" tint="#e8f0fe" fg="#2f6bd8" />
        <Highlight icon={BarChart3} label="Style stats" tint="#e9eefb" fg="#3a5bd0" onClick={() => setView("insights")} />
        <Highlight icon={FileText} label="Monthly report" tint="#fdeee0" fg="#c67a3e" />
      </div>

      {/* Account settings */}
      <SettingsCard label="Account Settings">
        <SRow icon={User} label="My information" onClick={() => openSettings("account")} />
        <SRow icon={Bot} label="Outfit suggestion settings" onClick={() => openSettings("preferences")} />
        <SRow icon={Bell} label="Notifications" onClick={() => openSettings("notifications")} />
        <SRow icon={History} label="Purchase Info" />
        <SRow icon={CalendarDays} label="Week start day" value="Sunday" />
        <SRow icon={Tag} label="Custom Brands" onClick={() => openSettings("preferences")} />
        <SRow icon={Thermometer} label="Temperature Unit" value="°C" />
        <SRow icon={DollarSign} label="Currency" value={currency} onClick={() => openSettings("preferences")} />
        <SRow icon={Globe} label="Country" value="United States" />
        <SRow icon={Globe} label="Language" value="English" />
        <SRow icon={Luggage} label="Packing & trips" onClick={() => setView("travel")} />
        <SRow icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} />
        <SRow icon={Settings} label="Navigation setting" />
        <SRow
          icon={theme === "dark" ? ArrowDownUp : ArrowDownUp}
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          last
        />
      </SettingsCard>

      {/* Customer service */}
      <SettingsCard label="Wardrobe Customer Service">
        <SRow label="FAQ" />
        <SRow label="Notice" />
        <SRow label="Feedback & Suggestions" />
        <SRow label="Visit our Instagram" last />
      </SettingsCard>

      {/* Terms */}
      <SettingsCard label="Terms of Service" right="Ver 1.0.0">
        <SRow label="Service Terms" chevron />
        <SRow label="Privacy policy" chevron last />
      </SettingsCard>

      {/* Sign in */}
      <SettingsCard label="Sign In">
        <SRow label="Change sign in method" chevron />
        {authUser && <SRow label="Sign Out" chevron onClick={logOut} />}
        <SRow label="Delete Account" chevron danger last />
      </SettingsCard>
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
