"use client";

import {
  BarChart3,
  Grid3x3,
  MapPin,
  Plus,
  Repeat2,
  Settings,
  Share2,
  Shirt,
  Tag,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchFollowCounts,
  fetchReposts,
  fetchTaggedPosts,
  fetchUserPosts,
  type CommunityPost,
  type PostAuthor,
} from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";
import { ConnectionsSheet } from "../community/ConnectionsSheet";
import { CreatePostSheet } from "../community/CreatePost";

type Tab = "posts" | "tagged" | "shared";
type ConnTab = "followers" | "following" | "find";

/**
 * Instagram / TikTok–style social profile (view "social", opened by tapping the
 * avatar in the top bar). Big centred avatar + @handle, tappable Followers /
 * Following that open the connections sheet, a Find-friends + New-post action,
 * and a 3-column tabbed grid of the user's Posts, Tagged posts, and reposts
 * (Shared).
 */
export function NativeProfileView() {
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const setView = useWardrobe((s) => s.setView);

  const [tab, setTab] = useState<Tab>("posts");
  const [toast, setToast] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnTab | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [tagged, setTagged] = useState<CommunityPost[] | null>(null);
  const [shared, setShared] = useState<CommunityPost[] | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  const myId = authUser?.id ?? null;

  // Posts + follow counts load up front; tagged / shared load lazily per tab.
  useEffect(() => {
    if (!myId) {
      setMyPosts([]);
      setTagged(null);
      setShared(null);
      setCounts({ followers: 0, following: 0 });
      return;
    }
    let alive = true;
    fetchUserPosts(myId).then((p) => alive && setMyPosts(p));
    fetchFollowCounts(myId).then((c) => alive && setCounts(c));
    return () => {
      alive = false;
    };
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    if (tab === "tagged" && tagged === null) fetchTaggedPosts(myId).then(setTagged);
    if (tab === "shared" && shared === null) fetchReposts(myId).then(setShared);
  }, [tab, myId, tagged, shared]);

  const name = profile.displayName?.trim() || "You";
  const handle = useMemo(() => profileHandle(profile), [profile]);
  const author = useMemo<PostAuthor>(
    () => ({
      name: profile.displayName?.trim() || "You",
      handle: profileHandle(profile),
      avatar: profile.avatarUrl,
    }),
    [profile],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const share = async () => {
    // Per-user public page (guests can open it without the app).
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = handle ? `${origin}/u/${encodeURIComponent(handle)}` : origin;
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

  const newPost = () => {
    if (!authUser) {
      flash("Sign in to post");
      return;
    }
    setComposeOpen(true);
  };

  const onCreated = (p: CommunityPost) => {
    setMyPosts((prev) => [p, ...prev]);
    setComposeOpen(false);
    setTab("posts");
    flash("Posted to your profile");
  };

  const openPost = () => setView("explore");

  return (
    <div className="pb-4">
      {/* Top-right actions */}
      <div className="flex items-center justify-end gap-1 pt-1">
        <IconBtn label="Find friends" onClick={() => setConn("find")}>
          <UserPlus size={20} />
        </IconBtn>
        <IconBtn label="New post" onClick={newPost}>
          <Plus size={22} />
        </IconBtn>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-3 pb-5 text-center">
        <ProfileAvatar profile={profile} size={92} onClick={() => setView("profile")} />
        <div>
          <h1 className="heading text-xl leading-tight">{name}</h1>
          <p className="text-sm text-muted">@{handle}</p>
        </div>

        {/* Stats */}
        <div className="flex w-full max-w-xs items-center justify-around py-1">
          <Stat n={myPosts.length} label="Posts" onClick={() => setTab("posts")} />
          <Stat n={counts.followers} label="Followers" onClick={() => setConn("followers")} />
          <Stat n={counts.following} label="Following" onClick={() => setConn("following")} />
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            <Share2 size={15} /> Share
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
        <TabBtn Icon={Tag} label="Tagged" active={tab === "tagged"} onClick={() => setTab("tagged")} />
        <TabBtn Icon={Repeat2} label="Shared" active={tab === "shared"} onClick={() => setTab("shared")} />
      </div>

      {/* Grid */}
      <div className="-mx-4">
        {tab === "posts" &&
          (myPosts.length ? (
            <PostGrid posts={myPosts} onOpen={openPost} />
          ) : (
            <Empty icon={Grid3x3} label="No posts yet" hint="Tap ＋ to share your first fit." />
          ))}

        {tab === "tagged" &&
          (tagged === null ? (
            <Loading />
          ) : tagged.length ? (
            <PostGrid posts={tagged} onOpen={openPost} />
          ) : (
            <Empty icon={Tag} label="No tagged posts" hint="Posts you're tagged in show up here." />
          ))}

        {tab === "shared" &&
          (shared === null ? (
            <Loading />
          ) : shared.length ? (
            <PostGrid posts={shared} onOpen={openPost} />
          ) : (
            <Empty icon={Repeat2} label="Nothing shared yet" hint="Repost fits you love to collect them here." />
          ))}
      </div>

      {conn && myId && (
        <ConnectionsSheet
          userId={myId}
          myId={myId}
          myAuthor={author}
          initialTab={conn}
          onClose={() => setConn(null)}
        />
      )}

      {composeOpen && (
        <CreatePostSheet onClose={() => setComposeOpen(false)} onCreated={onCreated} />
      )}

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

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
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

/** 3-column grid of post tiles (poll posts show a caption card; others a photo). */
function PostGrid({ posts, onOpen }: { posts: CommunityPost[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {posts.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p.id)}
          className="aspect-square overflow-hidden bg-surface-2"
        >
          {p.kind === "poll" ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-accent-soft p-2 text-center">
              <BarChart3 size={20} className="text-accent" />
              <span className="line-clamp-2 text-[10px] leading-tight text-foreground">{p.caption}</span>
            </div>
          ) : (
            <Thumb src={p.imageUrl} alt={p.caption || p.lookTitle || "post"} />
          )}
        </button>
      ))}
    </div>
  );
}

function Loading() {
  return <p className="py-14 text-center text-sm text-muted">Loading…</p>;
}

function Empty({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint: string }) {
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
  return <img src={src} alt={alt ?? ""} onError={() => setErr(true)} className="h-full w-full object-cover" />;
}
