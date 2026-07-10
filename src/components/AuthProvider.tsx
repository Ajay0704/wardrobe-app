"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/supabase/auth";
import { pullSnapshot, pushSnapshot } from "@/lib/supabase/sync";
import { healBase64Snapshot } from "@/lib/heal";
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

  const syncPull = useCallback(async (uid: string) => {
    const run = async () => {
      const remote = await pullSnapshot(uid);
      if (remote) {
        hydrateFromRemote({
          items: remote.items,
          outfits: remote.outfits,
          trips: remote.trips,
          profile: remote.profile,
          theme: remote.theme,
          draft: remote.draft,
        });
      } else {
        const { items, outfits, trips, profile, theme, draft } =
          useWardrobe.getState();
        await pushSnapshot(uid, {
          items,
          outfits,
          trips,
          profile,
          theme,
          draft,
        });
      }
    };
    try {
      // Cap the sync so a slow/large snapshot can't leave the badge stuck on
      // "connecting". On timeout we keep local data and don't flip skipPush,
      // so we never clobber the (unread) remote snapshot.
      await Promise.race([
        run(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("sync-timeout")), 20000),
        ),
      ]);
      skipPush.current = false;
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }, [hydrateFromRemote, setSyncStatus]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;

    // Safety net: open the gate even if no auth event ever arrives. This never
    // logs anyone out — it only stops the splash from hanging.
    const gateTimer = setTimeout(() => {
      if (!cancelled) setAuthChecked(true);
    }, 5000);

    // supabase-js fires INITIAL_SESSION on load (from the stored session, then
    // TOKEN_REFRESHED after a background refresh). Treat that as the single
    // source of truth so a slow network can never falsely log the user out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      const sessionUser =
        session?.user?.email
          ? { id: session.user.id, email: session.user.email }
          : null;

      // Signed out, or no session on load → show the landing.
      if (event === "SIGNED_OUT" || !sessionUser) {
        setAuthUser(null);
        userId.current = null;
        skipPush.current = true;
        setPasswordRecovery(false);
        setSyncStatus("offline");
        setAuthChecked(true);
        return;
      }

      // Recovery link: hold sync until the user sets a new password.
      if (event === "PASSWORD_RECOVERY") {
        setAuthUser(sessionUser);
        userId.current = sessionUser.id;
        skipPush.current = true;
        setPasswordRecovery(true);
        setAuthChecked(true);
        return;
      }

      // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED w/ session.
      setAuthUser(sessionUser);
      setAuthChecked(true);

      // Do the profile touch + cloud pull once per signed-in user — not on
      // every token refresh, which would overwrite local edits, re-write the
      // profile, and thrash sync.
      if (userId.current !== sessionUser.id) {
        userId.current = sessionUser.id;
        updateProfile({ email: sessionUser.email });
        setSyncStatus("connecting");
        try {
          await syncPull(sessionUser.id);
        } catch {
          setSyncStatus("error");
        }
        // Self-heal: convert any leftover base64 images to Storage URLs, then
        // push the shrunk snapshot so sync recovers even if the pull above
        // timed out on an oversized (bloated) snapshot.
        try {
          const healed = await healBase64Snapshot(sessionUser.id);
          if (healed > 0) {
            const { items, outfits, trips, profile, theme, draft } =
              useWardrobe.getState();
            const ok = await pushSnapshot(sessionUser.id, {
              items,
              outfits,
              trips,
              profile,
              theme,
              draft,
            });
            skipPush.current = false;
            setSyncStatus(ok ? "synced" : "error");
          }
        } catch {
          // Heal is best-effort; leave sync status as the pull set it.
        }
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
        const { items, outfits, trips, profile, theme, draft } =
          useWardrobe.getState();
        const ok = await pushSnapshot(uid, {
          items,
          outfits,
          trips,
          profile,
          theme,
          draft,
        });
        setSyncStatus(ok ? "synced" : "error");
      }, 800);
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [setSyncStatus]);

  return <>{children}</>;
}
