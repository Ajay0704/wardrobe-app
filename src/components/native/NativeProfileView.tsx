"use client";

import {
  BarChart3,
  Bookmark,
  Grid3x3,
  MapPin,
  Settings,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchFollowCounts, fetchUserPosts, type CommunityPost } from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";

/** A saved external product (fetched from the Explore feed by id). */
interface SavedProduct {
  id: string;
  title: string;
  imageUrl: string;
}

/** Minimal shape of a feed card returned by /api/explore/feed?ids=. */
interface FeedCardLite {
  id: string;
  title: string;
  heroImage?: string;
  pieces?: { imageUrl: string }[];
}

type Tab = "posts" | "items" | "saved";

/**
 * Instagram / TikTok–style social profile. Reached by tapping the avatar in the
 * top bar. Big centred avatar + @handle, tappable Outfits/Items/Saved counts,
 * Edit-profile / Share / Settings actions, then a 3-column tabbed grid of the
 * user's outfits, closet items, and saved Explore looks.
 */
export function NativeProfileView() {
  const profile = useWardrobe((s) => s.profile);
  const items = useWardrobe((s) => s.items);
  const authUser = useWardrobe((s) => s.authUser);
  const savedPinIds = useWardrobe((s) => s.savedPinIds);
  const setView = useWardrobe((s) => s.setView);

  const [tab, setTab] = useState<Tab>("posts");
  const [toast, setToast] = useState<string | null>(null);

  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  useEffect(() => {
    if (!authUser?.id) {
      setMyPosts([]);
      setCounts({ followers: 0, following: 0 });
      return;
    }
    let alive = true;
    fetchUserPosts(authUser.id).then((p) => {
      if (alive) setMyPosts(p);
    });
    fetchFollowCounts(authUser.id).then((c) => {
      if (alive) setCounts(c);
    });
    return () => {
      alive = false;
    };
  }, [authUser?.id]);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  useEffect(() => {
    if (!savedPinIds.length) {
      setSavedProducts([]);
      return;
    }
    let alive = true;
    fetch(`/api/explore/feed?ids=${encodeURIComponent(savedPinIds.join(","))}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: FeedCardLite[] }) => {
        if (!alive) return;
        setSavedProducts(
          (d.items ?? []).map((it) => ({
            id: it.id,
            title: it.title,
            imageUrl: it.heroImage || it.pieces?.[0]?.imageUrl || "",
          })),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [savedPinIds]);

  const name = profile.displayName?.trim() || "You";
  const handle = useMemo(() => profileHandle(profile), [profile]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const share = async () => {
    const url =
      typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${name} on Wardrobe`, url });
        return;
      }
      await navigator.clipboard?.writeText(url);
      flash("Profile link copied");
    } catch {
      /* user cancelled the share sheet — no-op */
    }
  };

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 pb-5 pt-1 text-center">
        <ProfileAvatar profile={profile} size={92} />
        <div>
          <h1 className="heading text-xl leading-tight">{name}</h1>
          <p className="text-sm text-muted">@{handle}</p>
        </div>

        {/* Stats — social profile style */}
        <div className="flex w-full max-w-xs items-center justify-around py-1">
          <Stat n={myPosts.length} label="Posts" onClick={() => setTab("posts")} />
          <Stat
            n={counts.followers}
            label="Followers"
            onClick={() => flash(`${counts.followers} follower${counts.followers === 1 ? "" : "s"}`)}
          />
          <Stat
            n={counts.following}
            label="Following"
            onClick={() => flash(`Following ${counts.following}`)}
          />
        </div>

        {profile.bio?.trim() && (
          <p className="max-w-xs text-sm text-foreground/90">{profile.bio}</p>
        )}
        {profile.location?.trim() && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin size={13} /> {profile.location}
          </p>
        )}

        {/* Actions */}
        <div className="flex w-full max-w-xs items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setView("profile")}
            className="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={share}
            className="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            Share profile
          </button>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setView("you")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface transition-colors hover:bg-surface-2"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 flex border-y border-line">
        <TabBtn Icon={Grid3x3} label="Posts" active={tab === "posts"} onClick={() => setTab("posts")} />
        <TabBtn Icon={Shirt} label="Items" active={tab === "items"} onClick={() => setTab("items")} />
        <TabBtn Icon={Bookmark} label="Saved" active={tab === "saved"} onClick={() => setTab("saved")} />
      </div>

      {/* Grid */}
      <div className="-mx-4">
        {tab === "posts" &&
          (myPosts.length ? (
            <Grid>
              {myPosts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setView("explore")}
                  className="aspect-square overflow-hidden bg-surface-2"
                >
                  {p.kind === "poll" ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-accent-soft p-2 text-center">
                      <BarChart3 size={20} className="text-accent" />
                      <span className="line-clamp-2 text-[10px] leading-tight text-foreground">
                        {p.caption}
                      </span>
                    </div>
                  ) : (
                    <Thumb src={p.imageUrl} alt={p.caption || p.lookTitle || "post"} />
                  )}
                </button>
              ))}
            </Grid>
          ) : (
            <Empty icon={Grid3x3} label="No posts yet" hint="Share a fit from Explore → Following." />
          ))}

        {tab === "items" &&
          (owned.length ? (
            <Grid>
              {owned.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setView("wardrobe")}
                  className="aspect-square overflow-hidden bg-surface-2"
                >
                  <Thumb src={it.imageUrl} alt={it.name} />
                </button>
              ))}
            </Grid>
          ) : (
            <Empty icon={Shirt} label="No items yet" hint="Add pieces to your closet to see them here." />
          ))}

        {tab === "saved" &&
          (savedProducts.length ? (
            <Grid>
              {savedProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setView("explore")}
                  className="aspect-square overflow-hidden bg-surface-2"
                >
                  <Thumb src={p.imageUrl} alt={p.title} />
                </button>
              ))}
            </Grid>
          ) : (
            <Empty icon={Bookmark} label="Nothing saved yet" hint="Tap the heart on Explore products to save them." />
          ))}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center px-2">
      <span className="text-lg font-semibold leading-tight">{formatCount(n)}</span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  );
}

function TabBtn({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-0.5">{children}</div>;
}

function Empty({
  icon: Icon,
  label,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <p className="font-medium">{label}</p>
      <p className="max-w-[15rem] text-sm text-muted">{hint}</p>
    </div>
  );
}

function Thumb({ src, alt }: { src?: string; alt?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted">
        <Shirt size={22} strokeWidth={1.5} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt ?? ""}
      onError={() => setErr(true)}
      className="h-full w-full object-cover"
    />
  );
}
