"use client";

import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { useWardrobe } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/sync";

/** Header badge showing cloud sync / sign-in status. */
export function SyncBadge() {
  const authUser = useWardrobe((s) => s.authUser);
  const status = useWardrobe((s) => s.syncStatus);
  const syncError = useWardrobe((s) => s.syncError);

  if (!isSupabaseConfigured()) return null;

  const labels = {
    offline: authUser ? "Offline" : "Sign in to sync",
    connecting: "Connecting…",
    syncing: "Syncing…",
    synced: "Cloud synced",
    error: "Sync error",
  } as const;

  const title =
    status === "error" && syncError
      ? syncError
      : labels[status];

  return (
    <span
      title={title}
      className={`inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:max-w-[22rem] ${
        status === "error"
          ? "border-red-300/60 bg-red-500/10 text-red-700 dark:border-red-900/50 dark:text-red-400"
          : "border-line text-muted"
      }`}
    >
      {status === "connecting" || status === "syncing" ? (
        <Loader2 size={12} className="shrink-0 animate-spin" />
      ) : status === "synced" ? (
        <Cloud size={12} className="shrink-0 text-emerald-500" />
      ) : (
        <CloudOff size={12} className="shrink-0" />
      )}
      <span className="truncate">
        {status === "error" && syncError ? syncError : labels[status]}
      </span>
    </span>
  );
}
