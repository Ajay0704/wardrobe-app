"use client";

import { useCallback, useEffect, useRef } from "react";
import { agentLog } from "@/lib/agent-log";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/supabase/auth";
import { pullSnapshot, pushSnapshot } from "@/lib/supabase/sync";
import { healBase64Snapshot, scrubBloatedInlineImages } from "@/lib/heal";
import { useWardrobe } from "@/lib/store";

/**
 * Restores session on load, syncs wardrobe when signed in.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    setAuthUser,
    setAuthChecked,
    setSyncStatus,
    hydrateFromRemote,
    updateProfile,
    setPasswordRecovery,
  } = useWardrobe();
  const skipPush = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = useRef<string | null>(null);

  const syncPull = useCallback(
    async (uid: string) => {
      // Drop poisoned HEIC/base64 from localStorage *before* any push path runs.
      scrubBloatedInlineImages();

      const run = async () => {
        const remote = await pullSnapshot(uid);
        if (remote) {
          hydrateFromRemote({
            items: remote.items,
            outfits: remote.outfits,
            trips: remote.trips,
            calendar: remote.calendar,
            profile: remote.profile,
            theme: remote.theme,
            draft: remote.draft,
          });
          // Remote wins — scrub again in case persist rehydrates late with bloat.
          scrubBloatedInlineImages();
        } else {
          const { items, outfits, trips, calendar, profile, theme, draft } =
            useWardrobe.getState();
          const result = await pushSnapshot(uid, {
            items,
            outfits,
            trips,
            calendar,
            profile,
            theme,
            draft,
          });
          if (!result.ok) throw new Error(result.error);
        }
      };

      try {
        await Promise.race([
          run(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Sync timed out after 12s — check your connection and try refreshing.",
                  ),
                ),
              12000,
            ),
          ),
        ]);
        skipPush.current = false;
        setSyncStatus("synced");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Sync failed during pull.";
        console.warn("[sync] pull/init failed:", msg);
        // Still allow later pushes after scrub so the user isn't stuck forever.
        skipPush.current = false;
        setSyncStatus("error", msg);
      }
    },
    [hydrateFromRemote, setSyncStatus],
  );

  /** Background: upload small leftover data: URLs; never block Connecting on this. */
  const healInBackground = useCallback(
    async (uid: string) => {
      try {
        const healed = await healBase64Snapshot(uid);
        if (healed === 0) return;
        const { items, outfits, trips, calendar, profile, theme, draft } =
          useWardrobe.getState();
        const result = await pushSnapshot(uid, {
          items,
          outfits,
          trips,
          calendar,
          profile,
          theme,
          draft,
        });
        if (result.ok) setSyncStatus("synced");
        else setSyncStatus("error", result.error);
      } catch (err) {
        console.warn("[sync] background heal failed:", err);
      }
    },
    [setSyncStatus],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;

    // Safety net: open the gate even if no auth event ever arrives.
    const gateTimer = setTimeout(() => {
      if (!cancelled) setAuthChecked(true);
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      const sessionUser =
        session?.user?.email
          ? { id: session.user.id, email: session.user.email }
          : null;

      // Only clear the session on explicit sign-out or the initial null session.
      // Transient null sessions on other events (token refresh races) used to
      // flash the website landing chrome inside the native app.
      if (event === "SIGNED_OUT") {
        // #region agent log
        agentLog("B", "AuthProvider.tsx:SIGNED_OUT", "Auth cleared via SIGNED_OUT", {
          event,
        });
        // #endregion
        setAuthUser(null);
        userId.current = null;
        skipPush.current = true;
        setPasswordRecovery(false);
        setSyncStatus("offline");
        setAuthChecked(true);
        return;
      }

      if (!sessionUser) {
        if (event === "INITIAL_SESSION") {
          // #region agent log
          agentLog("B", "AuthProvider.tsx:INITIAL_null", "Auth null on INITIAL_SESSION", {
            event,
          });
          // #endregion
          setAuthUser(null);
          userId.current = null;
          skipPush.current = true;
          setPasswordRecovery(false);
          setSyncStatus("offline");
          setAuthChecked(true);
        } else {
          // #region agent log
          agentLog("B", "AuthProvider.tsx:transient_null", "Ignored transient null session", {
            event,
          });
          // #endregion
        }
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setAuthUser(sessionUser);
        userId.current = sessionUser.id;
        skipPush.current = true;
        setPasswordRecovery(true);
        setAuthChecked(true);
        return;
      }

      // Show the app immediately — don't wait for cloud pull.
      setAuthUser(sessionUser);
      setAuthChecked(true);

      if (userId.current !== sessionUser.id) {
        userId.current = sessionUser.id;
        updateProfile({ email: sessionUser.email });
        setSyncStatus("connecting");
        await syncPull(sessionUser.id);
        // Heal leftover small data: URLs off the critical path.
        void healInBackground(sessionUser.id);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(gateTimer);
      subscription.unsubscribe();
    };
  }, [
    setAuthUser,
    setAuthChecked,
    setSyncStatus,
    updateProfile,
    syncPull,
    healInBackground,
    setPasswordRecovery,
  ]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsub = useWardrobe.subscribe((state, prev) => {
      if (!state.authUser || skipPush.current) return;
      if (
        state.items === prev.items &&
        state.outfits === prev.outfits &&
        state.trips === prev.trips &&
        state.calendar === prev.calendar &&
        state.profile === prev.profile &&
        state.theme === prev.theme &&
        state.draft === prev.draft
      ) {
        return;
      }

      if (timer.current) clearTimeout(timer.current);
      setSyncStatus("syncing");

      timer.current = setTimeout(async () => {
        const uid = userId.current ?? (await getSessionUser())?.id;
        if (!uid) {
          setSyncStatus("offline");
          return;
        }
        userId.current = uid;
        scrubBloatedInlineImages();
        const { items, outfits, trips, calendar, profile, theme, draft } =
          useWardrobe.getState();
        const result = await pushSnapshot(uid, {
          items,
          outfits,
          trips,
          calendar,
          profile,
          theme,
          draft,
        });
        if (result.ok) setSyncStatus("synced");
        else setSyncStatus("error", result.error);
      }, 800);
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [setSyncStatus]);

  return <>{children}</>;
}
