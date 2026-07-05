"use client";

import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWardrobe } from "@/lib/store";
import {
  ensureAuth,
  isSupabaseConfigured,
  pullSnapshot,
  pushSnapshot,
  type SyncStatus,
} from "@/lib/supabase/sync";

/**
 * Keeps localStorage and Supabase in sync when env vars are present.
 * Renders a small status indicator in the header area.
 */
export function SupabaseSync() {
  const [status, setStatus] = useState<SyncStatus>(
    isSupabaseConfigured() ? "connecting" : "offline",
  );
  const skipPush = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let cancelled = false;

    (async () => {
      setStatus("connecting");
      const uid = await ensureAuth();
      if (cancelled || !uid) {
        setStatus("error");
        return;
      }
      userId.current = uid;

      const remote = await pullSnapshot(uid);
      if (cancelled) return;

      if (remote && remote.items.length > 0) {
        // Remote wins when it has data (cross-tab / re-install recovery).
        useWardrobe.getState().hydrateFromRemote({
          items: remote.items,
          outfits: remote.outfits,
          profile: remote.profile,
          theme: remote.theme,
          draft: remote.draft,
        });
      } else {
        // First sync — push local wardrobe up.
        const { items, outfits, profile, theme, draft } = useWardrobe.getState();
        await pushSnapshot(uid, { items, outfits, profile, theme, draft });
      }

      skipPush.current = false;
      setStatus("synced");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced push on every persisted state change.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsub = useWardrobe.subscribe((state, prev) => {
      if (skipPush.current) return;
      if (
        state.items === prev.items &&
        state.outfits === prev.outfits &&
        state.profile === prev.profile &&
        state.theme === prev.theme &&
        state.draft === prev.draft
      ) {
        return;
      }

      if (timer.current) clearTimeout(timer.current);
      setStatus("syncing");

      timer.current = setTimeout(async () => {
        const uid = userId.current ?? (await ensureAuth());
        if (!uid) {
          setStatus("error");
          return;
        }
        userId.current = uid;
        const { items, outfits, profile, theme, draft } = useWardrobe.getState();
        const ok = await pushSnapshot(uid, { items, outfits, profile, theme, draft });
        setStatus(ok ? "synced" : "error");
      }, 800);
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!isSupabaseConfigured()) return null;

  const labels: Record<SyncStatus, string> = {
    offline: "Local only",
    connecting: "Connecting…",
    syncing: "Syncing…",
    synced: "Cloud synced",
    error: "Sync error",
  };

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
