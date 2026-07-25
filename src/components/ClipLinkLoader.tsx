"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { pullSnapshot } from "@/lib/supabase/sync";
import { useWardrobe } from "@/lib/store";

/**
 * Quick-save a shared product URL to the wishlist. Two entry points feed the store's
 * `pendingClipUrl`:
 *   - the `?clipUrl=<url>` deep link — Web Share Target, browser-extension fallback, cold launch
 *   - a runtime share — iOS Share Extension → NativeAppClass `appUrlOpen` → setPendingClipUrl
 * If the user isn't signed in yet, the URL is retained and the clip retries once they are.
 */
export function ClipLinkLoader() {
  const {
    authUser,
    hydrateFromRemote,
    setView,
    pendingClipUrl,
    setPendingClipUrl,
  } = useWardrobe();
  const [toast, setToast] = useState<string | null>(null);
  const processing = useRef<string | null>(null);

  // Funnel the `?clipUrl=` deep link into the store, then strip it from the address bar
  // (so a reload doesn't re-clip).
  const importedFromQuery = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || importedFromQuery.current) return;
    importedFromQuery.current = true;
    const params = new URLSearchParams(window.location.search);
    const clipUrl = (params.get("clipUrl") || "").trim();
    const clipText = (params.get("clipText") || "").trim();
    if (!clipUrl && !clipText) return;
    for (const k of ["clipUrl", "clipText", "clipTitle"]) params.delete(k);
    const next = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`,
    );
    // Prefer the shared `url`; otherwise pull the first http(s) link out of the shared text.
    const candidate = /^https?:\/\//i.test(clipUrl)
      ? clipUrl
      : (clipText.match(/https?:\/\/[^\s]+/i)?.[0] ?? "");
    if (/^https?:\/\//i.test(candidate)) setPendingClipUrl(candidate);
  }, [setPendingClipUrl]);

  // Run the clip when a URL is queued and the user is signed in.
  useEffect(() => {
    const url = (pendingClipUrl || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (processing.current === url) return;
    processing.current = url;

    const run = async () => {
      // Not signed in yet: keep the URL queued and retry once authUser is set.
      if (!authUser) {
        setToast("Sign in to save this shared product.");
        processing.current = null;
        return;
      }
      setToast("Saving to wishlist…");
      try {
        const supabase = getSupabase();
        const { data } = (await supabase?.auth.getSession()) ?? { data: null };
        const token = data?.session?.access_token;
        if (!token) {
          setToast("Sign in to save this product.");
          return; // finally resets processing; pendingClipUrl kept for retry
        }

        const res = await fetch("/api/clip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          duplicate?: boolean;
          item?: { name?: string };
        };
        if (!res.ok) {
          setToast(body.error || "Could not save product.");
          setPendingClipUrl(null);
          return;
        }

        const remote = await pullSnapshot(authUser.id);
        if (remote) {
          hydrateFromRemote({
            items: remote.items,
            outfits: remote.outfits,
            calendar: remote.calendar,
            profile: remote.profile,
            theme: remote.theme,
            draft: remote.draft,
          });
        }

        setView("wishlist");
        setToast(
          body.duplicate
            ? `Already on wishlist: ${body.item?.name || "item"}`
            : `Saved: ${body.item?.name || "wishlist item"}`,
        );
        setPendingClipUrl(null);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Clip failed.");
        setPendingClipUrl(null);
      } finally {
        processing.current = null;
      }
    };

    void run();
  }, [pendingClipUrl, authUser, hydrateFromRemote, setView, setPendingClipUrl]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full border border-line bg-surface px-4 py-2 text-center text-sm shadow-lg sm:bottom-8"
    >
      {toast}
    </div>
  );
}
