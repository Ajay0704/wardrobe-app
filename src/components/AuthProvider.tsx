"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/supabase/auth";
import { pullSnapshot, pushSnapshot } from "@/lib/supabase/sync";
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
    const remote = await pullSnapshot(uid);
    if (remote) {
      hydrateFromRemote({
        items: remote.items,
        outfits: remote.outfits,
        profile: remote.profile,
        theme: remote.theme,
        draft: remote.draft,
      });
    } else {
      const { items, outfits, profile, theme, draft } = useWardrobe.getState();
      await pushSnapshot(uid, { items, outfits, profile, theme, draft });
    }
    skipPush.current = false;
    setSyncStatus("synced");
  }, [hydrateFromRemote, setSyncStatus]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;

    (async () => {
      setSyncStatus("connecting");
      // Fail open: if the session lookup errors or hangs (e.g. a stale token),
      // still resolve the gate so the UI never sticks on the loading splash.
      let user: Awaited<ReturnType<typeof getSessionUser>> = null;
      try {
        user = await Promise.race([
          getSessionUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
      } catch {
        user = null;
      }
      if (cancelled) return;
      if (!user) {
        setAuthUser(null);
        userId.current = null;
        skipPush.current = true;
        setSyncStatus("offline");
        setAuthChecked(true);
        return;
      }
      setAuthUser(user);
      userId.current = user.id;
      updateProfile({ email: user.email });
      setAuthChecked(true);
      try {
        await syncPull(user.id);
      } catch {
        setSyncStatus("error");
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session?.user?.email) {
        setAuthUser(null);
        userId.current = null;
        skipPush.current = true;
        setPasswordRecovery(false);
        setSyncStatus("offline");
        return;
      }
      if (event === "PASSWORD_RECOVERY") {
        // Recovery session: hold sync until the user sets a new password.
        setAuthUser({ id: session.user.id, email: session.user.email });
        userId.current = session.user.id;
        skipPush.current = true;
        setAuthChecked(true);
        setPasswordRecovery(true);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const user = { id: session.user.id, email: session.user.email! };
        setAuthUser(user);
        userId.current = user.id;
        setSyncStatus("connecting");
        await syncPull(user.id);
      }
    });

    return () => {
      cancelled = true;
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
        const { items, outfits, profile, theme, draft } = useWardrobe.getState();
        const ok = await pushSnapshot(uid, { items, outfits, profile, theme, draft });
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
