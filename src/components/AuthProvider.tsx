"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/supabase/auth";
import { ensureProfile } from "@/lib/chat";
import {
  absorbWishlistClips,
  pullSnapshot,
  pushSnapshot,
} from "@/lib/supabase/sync";
import {
  healBase64Snapshot,
  scrubBloatedInlineImages,
} from "@/lib/heal";
import { useWardrobe } from "@/lib/store";

/** Soft budget for the first cloud pull. Keep short — local data already works. */
const PULL_TIMEOUT_MS = 8_000;
/** Don't re-pull clips more often than this when switching apps. */
const ABSORB_COOLDOWN_MS = 30_000;

/**
 * Restores session on load, syncs wardrobe when signed in.
 *
 * Important: never `await` long network work inside `onAuthStateChange` —
 * supabase-js holds an auth lock and the whole app feels frozen.
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
  const merging = useRef(false);
  const pullGen = useRef(0);
  const lastAbsorbAt = useRef(0);
  const absorbInFlight = useRef(false);
  const profileDirty = useRef(false);

  const syncPull = useCallback(
    async (uid: string) => {
      scrubBloatedInlineImages();

      const gen = ++pullGen.current;
      let timedOut = false;
      let timerId: ReturnType<typeof setTimeout> | undefined;

      const run = async () => {
        const remote = await pullSnapshot(uid);
        if (gen !== pullGen.current) return;
        if (remote) {
          // pullSnapshot already scrubs poisoned inline images
          hydrateFromRemote({
            items: remote.items,
            outfits: remote.outfits,
            calendar: remote.calendar,
            profile: remote.profile,
            theme: remote.theme,
            draft: remote.draft,
          });
        } else {
          const { items, outfits, calendar, profile, theme, draft } =
            useWardrobe.getState();
          const result = await pushSnapshot(uid, {
            items,
            outfits,
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
          new Promise<never>((_, reject) => {
            timerId = setTimeout(() => {
              timedOut = true;
              reject(new Error("SYNC_TIMEOUT"));
            }, PULL_TIMEOUT_MS);
          }),
        ]);
        if (gen !== pullGen.current) return;
        skipPush.current = false;
        setSyncStatus("synced");
      } catch (err) {
        if (gen !== pullGen.current) return;
        skipPush.current = false;
        if (timedOut || (err instanceof Error && err.message === "SYNC_TIMEOUT")) {
          console.warn("[sync] pull timed out — using local data");
          setSyncStatus("synced"); // don't leave a long error spinner
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Sync failed during pull.";
        console.warn("[sync] pull/init failed:", msg);
        setSyncStatus("error", msg);
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    },
    [hydrateFromRemote, setSyncStatus],
  );

  const healInBackground = useCallback(
    async (uid: string) => {
      try {
        const healed = await healBase64Snapshot(uid);
        if (healed === 0) return;
        const { items, outfits, calendar, profile, theme, draft } =
          useWardrobe.getState();
        const result = await pushSnapshot(uid, {
          items,
          outfits,
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

    const gateTimer = setTimeout(() => {
      if (!cancelled) setAuthChecked(true);
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      const sessionUser =
        session?.user?.email
          ? { id: session.user.id, email: session.user.email }
          : null;

      if (event === "SIGNED_OUT") {
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
          setAuthUser(null);
          userId.current = null;
          skipPush.current = true;
          setPasswordRecovery(false);
          setSyncStatus("offline");
          setAuthChecked(true);
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

      // Show the app immediately from local cache — never block the auth lock.
      setAuthUser(sessionUser);
      setAuthChecked(true);

      if (userId.current !== sessionUser.id) {
        userId.current = sessionUser.id;
        // Avoid writing profile (and kicking a push) unless email actually changed.
        const currentEmail = useWardrobe.getState().profile.email;
        if (sessionUser.email && sessionUser.email !== currentEmail) {
          updateProfile({ email: sessionUser.email });
        }
        setSyncStatus("connecting");
        void syncPull(sessionUser.id).then(() => {
          void healInBackground(sessionUser.id);
          // Backfill the public directory so username search can find this user.
          void ensureProfile(useWardrobe.getState().profile, sessionUser.id);
        });
      }
    });

    return () => {
      cancelled = true;
      pullGen.current += 1;
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

  // Absorb extension clips when returning to the app (debounced, visibility only).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const absorbRemoteClips = async () => {
      if (document.visibilityState !== "visible") return;
      const uid = userId.current;
      if (!uid || skipPush.current || merging.current || absorbInFlight.current)
        return;
      if (timer.current) return;
      const now = Date.now();
      if (now - lastAbsorbAt.current < ABSORB_COOLDOWN_MS) return;

      absorbInFlight.current = true;
      lastAbsorbAt.current = now;
      try {
        const remote = await pullSnapshot(uid);
        if (!remote) return;
        const local = useWardrobe.getState();
        const mergedItems = absorbWishlistClips(local.items, remote.items);
        if (mergedItems.length === local.items.length) return;

        merging.current = true;
        hydrateFromRemote({
          items: mergedItems,
          outfits: local.outfits,
          calendar: local.calendar,
          profile: local.profile,
          theme: local.theme,
          draft: local.draft,
        });
        merging.current = false;
      } catch (err) {
        merging.current = false;
        console.warn("[sync] absorb clips failed:", err);
      } finally {
        absorbInFlight.current = false;
      }
    };

    document.addEventListener("visibilitychange", absorbRemoteClips);
    return () => {
      document.removeEventListener("visibilitychange", absorbRemoteClips);
    };
  }, [hydrateFromRemote]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsub = useWardrobe.subscribe((state, prev) => {
      if (!state.authUser || skipPush.current || merging.current) return;
      if (
        state.items === prev.items &&
        state.outfits === prev.outfits &&
        state.calendar === prev.calendar &&
        state.profile === prev.profile &&
        state.theme === prev.theme &&
        state.draft === prev.draft
      ) {
        return;
      }

      // Keep the public directory (profiles) in sync when the profile changes.
      if (state.profile !== prev.profile) profileDirty.current = true;

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
        const { items, outfits, calendar, profile, theme, draft } =
          useWardrobe.getState();
        const result = await pushSnapshot(uid, {
          items,
          outfits,
          calendar,
          profile,
          theme,
          draft,
        });
        if (result.ok) setSyncStatus("synced");
        else setSyncStatus("error", result.error);
        if (profileDirty.current) {
          profileDirty.current = false;
          void ensureProfile(profile, uid);
        }
      }, 600);
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [setSyncStatus]);

  return <>{children}</>;
}
