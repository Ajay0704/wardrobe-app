"use client";

import { LogOut, Settings, User, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import type { SettingsSection } from "@/lib/profile";
import { ProfileAvatar } from "./ProfileAvatar";

/** Header avatar with a dropdown menu: Profile, Settings, Log out. */
export function ProfileMenu() {
  const {
    profile,
    authUser,
    setView,
    setSettingsSection,
    setAuthUser,
    setSyncStatus,
  } = useWardrobe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setView("settings");
    setOpen(false);
  };

  const logOut = async () => {
    setOpen(false);
    await signOut();
    setAuthUser(null);
    setSyncStatus("offline");
  };

  return (
    <div ref={ref} className="relative">
      <ProfileAvatar
        profile={profile}
        size={34}
        active={open}
        onClick={() => setOpen((o) => !o)}
      />

      {open && (
        <div className="animate-fade-up absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg shadow-black/10">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium">
              {profile.displayName || "Your account"}
            </p>
            <p className="truncate text-xs text-muted">{authUser?.email}</p>
          </div>
          <div className="py-1">
            <MenuItem icon={User} onClick={() => openSettings("profile")}>
              Profile
            </MenuItem>
            <MenuItem icon={Settings} onClick={() => openSettings("account")}>
              Settings
            </MenuItem>
          </div>
          <div className="border-t border-line py-1">
            <MenuItem icon={LogOut} onClick={logOut} danger>
              Log out
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-2 ${
        danger ? "text-red-600 dark:text-red-400" : "text-foreground"
      }`}
    >
      <Icon size={16} strokeWidth={1.75} className={danger ? "" : "text-muted"} />
      {children}
    </button>
  );
}
