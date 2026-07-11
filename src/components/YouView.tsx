"use client";

import {
  Bell,
  CalendarDays,
  ChevronRight,
  Heart,
  LogOut,
  Luggage,
  Moon,
  PieChart,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useWardrobe } from "@/lib/store";
import type { SettingsSection } from "@/lib/profile";
import { signOut } from "@/lib/supabase/auth";
import { ProfileAvatar } from "./ProfileAvatar";

/**
 * "You" hub — the profile + everything occasional grouped in one place:
 * Collections (Wishlist, Packing) plus Insights, Calendar, and Settings.
 * Used as the native "You" tab; the website surfaces the same links in the
 * profile-picture menu.
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
    setSettingsSection,
    setAuthUser,
    setSyncStatus,
  } = useWardrobe();

  const counts = useMemo(() => {
    const owned = items.filter((it) => !it.wishlist);
    const wishlist = items.filter((it) => it.wishlist);
    return { owned: owned.length, wishlist: wishlist.length, outfits: outfits.length };
  }, [items, outfits]);

  const logOut = () => {
    setAuthUser(null);
    setSyncStatus("offline");
    void signOut();
  };

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setView("settings");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Profile summary */}
      <div className="flex items-center gap-4">
        <ProfileAvatar profile={profile} size={56} />
        <div className="min-w-0">
          <h1 className="heading truncate text-2xl">
            {profile.displayName || "Your account"}
          </h1>
          <p className="truncate text-sm text-muted">
            {authUser?.email ?? "Local wardrobe"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {counts.owned} pieces · {counts.outfits} outfits
          </p>
        </div>
      </div>

      {/* Collections */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          Collections
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <CollectionCard
            icon={Heart}
            label="Wishlist"
            sub={`${counts.wishlist} ${counts.wishlist === 1 ? "item" : "items"}`}
            onClick={() => setView("wishlist")}
          />
          <CollectionCard
            icon={Luggage}
            label="Packing"
            sub="Trips & capsules"
            onClick={() => setView("travel")}
          />
        </div>
      </section>

      {/* Links */}
      <section className="overflow-hidden rounded-2xl border border-line">
        <Row icon={PieChart} label="Insights" onClick={() => setView("insights")} />
        <Row icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} />
        <Row
          icon={Bell}
          label="Notifications"
          onClick={() => openSettings("notifications")}
        />
        <Row
          icon={Settings}
          label="Settings"
          onClick={() => openSettings("profile")}
        />
        <Row
          icon={theme === "dark" ? Sun : Moon}
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          last
        />
      </section>

      {authUser && (
        <button
          type="button"
          onClick={logOut}
          className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400"
        >
          <LogOut size={16} /> Log out
        </button>
      )}
    </div>
  );
}

function CollectionCard({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={20} strokeWidth={1.7} />
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted">{sub}</span>
    </button>
  );
}

function Row({
  icon: Icon,
  label,
  onClick,
  last,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-2 ${
        last ? "" : "border-b border-line"
      }`}
    >
      <Icon size={19} strokeWidth={1.7} className="text-muted" />
      <span className="flex-1 text-sm">{label}</span>
      <ChevronRight size={16} className="text-muted" />
    </button>
  );
}
