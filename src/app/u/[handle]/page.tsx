"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProfileScreen, type ProfileScreenData } from "@/components/profile/ProfileScreen";

/** Public guest profile — a shareable per-user page, no app install required.
 *  Renders the same ProfileScreen as the in-app profile so they stay in sync. */
export default function PublicProfilePage() {
  const params = useParams();
  const handle = typeof params.handle === "string" ? params.handle : "";

  const [data, setData] = useState<ProfileScreenData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(handle)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Profile not found.");
          return;
        }
        setData({
          name: json.profile.name,
          handle: json.profile.handle,
          avatar: json.profile.avatar,
          bio: json.profile.bio,
          counts: json.counts,
          posts: json.posts ?? [],
          tagged: json.tagged ?? [],
          shared: json.shared ?? [],
        });
      } catch {
        if (!cancelled) setError("Couldn't load this profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="border-b border-line px-4 py-4">
        <p className="brand-wordmark-kicker text-center text-xs text-muted">Your Personal</p>
        <p className="brand-wordmark-name text-center text-lg">Wardrobe</p>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {error && !data ? (
          <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm">{error}</p>
        ) : (
          <ProfileScreen
            data={data}
            loading={loading}
            actions={
              <a
                href="/"
                className="flex-1 rounded-lg bg-accent py-2.5 text-center text-sm font-semibold text-accent-foreground"
              >
                Get the app to follow
              </a>
            }
          />
        )}
      </main>
    </div>
  );
}
