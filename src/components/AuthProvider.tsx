"use client";

import { App } from "@capacitor/app";
import { useCallback, useEffect, useRef } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/supabase/auth";
import { ensureProfile } from "@/lib/chat";
import {
  absorbWishlistClips,
  fetchWishlistInbox,
  inboxToItems,
  markWishlistInboxConsumed,
  fetchSnapshot,
  mergeItemsById,
  pullSnapshot,
  pushSnapshot,
} from "@/lib/supabase/sync";
import {
  healBase64Snapshot,
  scrubBloatedInlineImages,
} from "@/lib/heal";
import { sampleCloset } from "@/lib/demo-data";
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
        const res = await fetchSnapshot(uid);
        if (gen !== pullGen.current) return;

        if (res.status === "found") {
          // fetchSnapshot already scrubs poisoned inline images
          const remote = res.snapshot;
          // Merge, don't replace (AJA-233): keep local items the server hasn't
          // stored yet — added offline, or before the 600ms debounced push landed —
          // so a cold-start pull can't erase un-synced work. Same id → local wins
          // (preserves local edits); server-only items (other device) are kept too.
          const local = useWardrobe.getState();
          const mergedItems = mergeItemsById(local.items, remote.items);
          hydrateFromRemote({
            items: mergedItems,
            outfits: remote.outfits,
            calendar: remote.calendar,
            profile: remote.profile,
            theme: remote.theme,
            draft: remote.draft,
          });
          // If we recovered local-only items, persist the merge so the server catches up.
          const remoteIds = new Set(remote.items.map((it) => it.id));
          if (local.items.some((it) => !remoteIds.has(it.id))) {
            const s = useWardrobe.getState();
            void pushSnapshot(uid, {
              items: s.items,
              outfits: s.outfits,
              calendar: s.calendar,
              profile: s.profile,
              theme: s.theme,
              draft: s.draft,
            });
          }
          return;
        }

        if (res.status === "error") {
          // Never seed or overwrite on a failed read — that would clobber a
          // real remote closet. Bubble up so the caller shows the sync error
          // and the normal retry paths recover.
          throw new Error(res.error);
        }

        // status === "empty" → brand-new account. Seed the labeled sample
        // closet deterministically (NOT whatever is local — that could leak a
        // previous signed-out user's items into this account), then push it.
        const { profile, theme, draft } = useWardrobe.getState();
        const sample = sampleCloset(profile.shopGender);
        const seeded = {
          items: sample.items,
          outfits: sample.outfits,
          calendar: [],
          profile,
          theme,
          draft,
        };
        hydrateFromRemote(seeded);
        const result = await pushSnapshot(uid, seeded);
        if (!result.ok) throw new Error(result.error);
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

  /**
   * Push the pending snapshot to Supabase now (AJA-233). Shared by the 600ms
   * debounce AND the background/hide handler, so quitting the app right after a
   * change can't lose it. No-op while a pull is in flight or a merge is applying.
   */
  const flushPush = useCallback(async () => {
    if (skipPush.current || merging.current) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
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
  }, [setSyncStatus]);

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
        // Two sources of not-yet-local wishlist saves: extension clips already in
        // the remote snapshot, and the wishlist_items INBOX that /api/wishlist writes
        // (hearts on shop results and detected photos). The inbox had no reader at all
        // before AJA-241, so those saves silently disappeared.
        const [remote, inbox] = await Promise.all([
          pullSnapshot(uid),
          fetchWishlistInbox(),
        ]);
        if (!remote) return;
        const local = useWardrobe.getState();
        const withClips = absorbWishlistClips(local.items, remote.items);
        const fromInbox = inboxToItems(inbox, withClips);
        const mergedItems = fromInbox.length ? [...fromInbox, ...withClips] : withClips;
        if (mergedItems.length === local.items.length) {
          // Nothing new to show, but rows we've already got must still be marked or
          // they'd be re-examined on every single foreground.
          if (inbox.length) void markWishlistInboxConsumed(inbox.map((r) => r.id));
          return;
        }

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
        // Marked only AFTER the items are in the store, so a failure mid-way leaves the
        // rows unconsumed and they get another go. Re-absorbing is harmless because
        // inboxToItems dedupes on id.
        if (inbox.length) void markWishlistInboxConsumed(inbox.map((r) => r.id));
      } catch (err) {
        merging.current = false;
        console.warn("[sync] absorb wishlist failed:", err);
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

      timer.current = setTimeout(() => {
        void flushPush();
      }, 600);
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [setSyncStatus, flushPush]);

  // Flush the pending push when the app backgrounds or the tab hides, so quitting
  // the app right after a change can't drop it (AJA-233). Native uses Capacitor's
  // appStateChange; web falls back to visibility/pagehide.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushPush();
    };
    const onPageHide = () => void flushPush();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);

    let handle: { remove: () => void } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) void flushPush();
    }).then((h) => {
      handle = h;
    });

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      handle?.remove();
    };
  }, [flushPush]);

  return <>{children}</>;
}
