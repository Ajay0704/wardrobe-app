"use client";

import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { useWardrobe } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/sync";

/** Header badge showing cloud sync / sign-in status. */
export function SyncBadge() {
  const authUser = useWardrobe((s) => s.authUser);
  const status = useWardrobe((s) => s.syncStatus);

  if (!isSupabaseConfigured()) return null;

  const labels = {
    offline: authUser ? "Offline" : "Sign in to sync",
    connecting: "Connecting…",
    syncing: "Syncing…",
    synced: "Cloud synced",
    error: "Sync error",
  } as const;

  return (
    <span
      title={labels[status]}
      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted"
    >
      {status === "connecting" || status === "syncing" ? (
        <Loader2 size={12} className="animate-spin" />
      ) : status === "synced" ? (
        <Cloud size={12} className="text-emerald-500" />
      ) : (
        <CloudOff size={12} />
      )}
      {labels[status]}
    </span>
  );
}
