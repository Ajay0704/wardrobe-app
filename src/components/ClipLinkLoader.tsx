"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { pullSnapshot } from "@/lib/supabase/sync";
import { useWardrobe } from "@/lib/store";

/**
 * Deep-link fallback when the browser extension isn't installed:
 * `/?clipUrl=<product-url>&view=wishlist`
 */
export function ClipLinkLoader() {
  const { authUser, hydrateFromRemote, setView } = useWardrobe();
  const ran = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || ran.current || !authUser) return;
    const params = new URLSearchParams(window.location.search);
    const clipUrl = (params.get("clipUrl") || "").trim();
    if (!clipUrl || !/^https?:\/\//i.test(clipUrl)) return;
    ran.current = true;

    const run = async () => {
      setToast("Saving to wishlist…");
      try {
        const supabase = getSupabase();
        const { data } = (await supabase?.auth.getSession()) ?? { data: null };
        const token = data?.session?.access_token;
        if (!token) {
          setToast("Sign in to save this product.");
          return;
        }

        const res = await fetch("/api/clip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: clipUrl }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          duplicate?: boolean;
          item?: { name?: string };
        };
        if (!res.ok) {
          setToast(body.error || "Could not save product.");
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

        params.delete("clipUrl");
        const next = params.toString();
        const path = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", path);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Clip failed.");
      }
    };

    void run();
  }, [authUser, hydrateFromRemote, setView]);

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
