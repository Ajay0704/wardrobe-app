"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface PostLite {
  id: string;
  kind: string;
  imageUrl?: string;
  caption?: string;
  lookTitle?: string;
}
interface ProfileData {
  profile: { handle: string; name: string; avatar?: string; bio?: string };
  counts: { followers: number; following: number; posts: number };
  posts: PostLite[];
}

function initials(name: string): string {
  return (name.trim() || "?")
    .replace(/^@/, "")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Public guest profile — a shareable per-user page, no app install required. */
export default function PublicProfilePage() {
  const params = useParams();
  const handle = typeof params.handle === "string" ? params.handle : "";

  const [data, setData] = useState<ProfileData | null>(null);
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
        setData(json);
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
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {error && !data && (
          <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm">{error}</p>
        )}

        {data && (
          <>
            <div className="flex flex-col items-center gap-3 pb-5 text-center">
              <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-2xl font-semibold text-accent">
                {data.profile.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.profile.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(data.profile.name)
                )}
              </span>
              <div>
                <h1 className="heading text-xl leading-tight">{data.profile.name}</h1>
                <p className="text-sm text-muted">@{data.profile.handle}</p>
              </div>

              <div className="flex w-full max-w-xs items-center justify-around py-1">
                <Stat n={data.counts.posts} label="Posts" />
                <Stat n={data.counts.followers} label="Followers" />
                <Stat n={data.counts.following} label="Following" />
              </div>

              {data.profile.bio?.trim() && (
                <p className="max-w-xs text-sm text-foreground/90">{data.profile.bio}</p>
              )}

              <a
                href="/"
                className="mt-1 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground"
              >
                Get the app to follow
              </a>
            </div>

            <div className="-mx-4 border-t border-line">
              {data.posts.length ? (
                <div className="grid grid-cols-3 gap-0.5">
                  {data.posts.map((p) => (
                    <div key={p.id} className="aspect-square overflow-hidden bg-surface-2">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.caption || p.lookTitle || ""}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] leading-tight text-muted">
                          {p.caption || p.lookTitle || p.kind}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-14 text-center text-sm text-muted">No posts yet.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className="text-lg font-semibold leading-tight">{formatCount(n)}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
