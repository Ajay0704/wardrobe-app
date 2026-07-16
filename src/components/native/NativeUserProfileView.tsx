"use client";

import {
  BarChart3,
  Grid3x3,
  MessageCircle,
  Repeat2,
  Shirt,
  Tag,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createConversation } from "@/lib/chat";
import {
  fetchFollowCounts,
  fetchFollowing,
  fetchReposts,
  fetchTaggedPosts,
  fetchUserPosts,
  fetchUserProfile,
  toggleFollow,
  type CommunityPost,
  type PostAuthor,
  type PublicProfile,
} from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";
import { ConnectionsSheet } from "../community/ConnectionsSheet";

type Tab = "posts" | "tagged" | "shared";
type ConnTab = "followers" | "following";

/**
 * Read-only profile for another user (view "userProfile"), opened by tapping a
 * person in the Connections sheet or a post author. Mirrors the owner's profile
 * but with Follow / Message actions instead of Edit.
 */
export function NativeUserProfileView() {
  const userId = useWardrobe((s) => s.viewUserId);
  const authUser = useWardrobe((s) => s.authUser);
  const profile = useWardrobe((s) => s.profile);
  const openThread = useWardrobe((s) => s.openThread);

  const myId = authUser?.id ?? null;
  const isMe = Boolean(myId && userId && myId === userId);

  const [prof, setProf] = useState<PublicProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [tagged, setTagged] = useState<CommunityPost[] | null>(null);
  const [shared, setShared] = useState<CommunityPost[] | null>(null);
  const [conn, setConn] = useState<ConnTab | null>(null);
  const [messaging, setMessaging] = useState(false);

  const myAuthor = useMemo<PostAuthor>(
    () => ({
      name: profile.displayName?.trim() || "You",
      handle: profileHandle(profile),
      avatar: profile.avatarUrl,
    }),
    [profile],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setProf(null);
    setPosts(null);
    setTagged(null);
    setShared(null);
    setTab("posts");
    fetchUserProfile(userId).then((p) => alive && setProf(p));
    fetchFollowCounts(userId).then((c) => alive && setCounts(c));
    fetchUserPosts(userId).then((p) => alive && setPosts(p));
    if (myId) fetchFollowing(myId).then((ids) => alive && setFollowing(ids.includes(userId)));
    return () => {
      alive = false;
    };
  }, [userId, myId]);

  useEffect(() => {
    if (!userId) return;
    if (tab === "tagged" && tagged === null) fetchTaggedPosts(userId).then(setTagged);
    if (tab === "shared" && shared === null) fetchReposts(userId).then(setShared);
  }, [tab, userId, tagged, shared]);

  if (!userId) {
    return <div className="py-16 text-center text-sm text-muted">No profile selected.</div>;
  }

  const name = prof?.name ?? "Profile";
  const handle = prof?.handle ?? "user";

  const follow = () => {
    if (isMe) return;
    const next = !following;
    setFollowing(next);
    setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (next ? 1 : -1)) }));
    void toggleFollow(userId, next, myAuthor).catch(() => setFollowing(!next));
  };

  const message = async () => {
    if (isMe || messaging) return;
    setMessaging(true);
    try {
      const id = await createConversation([userId], false);
      if (id) openThread(id);
    } catch {
      /* ignore — blocked or offline */
    } finally {
      setMessaging(false);
    }
  };

  const list = tab === "posts" ? posts : tab === "tagged" ? tagged : shared;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 pb-5 pt-1 text-center">
        <ProfileAvatar profile={{ avatarUrl: prof?.avatar, displayName: name }} size={92} />
        <div>
          <h1 className="heading text-xl leading-tight">{name}</h1>
          <p className="text-sm text-muted">@{handle}</p>
        </div>

        <div className="flex w-full max-w-xs items-center justify-around py-1">
          <Stat n={posts?.length ?? 0} label="Posts" onClick={() => setTab("posts")} />
          <Stat n={counts.followers} label="Followers" onClick={() => setConn("followers")} />
          <Stat n={counts.following} label="Following" onClick={() => setConn("following")} />
        </div>

        {prof?.bio?.trim() && (
          <p className="max-w-xs text-sm text-foreground/90">{prof.bio}</p>
        )}

        {!isMe && (
          <div className="flex w-full max-w-xs items-center gap-2 pt-1">
            <button
              type="button"
              onClick={follow}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
                following
                  ? "border border-line bg-surface text-foreground hover:bg-surface-2"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {!following && <UserPlus size={15} />}
              {following ? "Following" : "Follow"}
            </button>
            <button
              type="button"
              onClick={message}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
            >
              <MessageCircle size={15} /> Message
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="-mx-4 flex border-y border-line">
        <TabBtn Icon={Grid3x3} label="Posts" active={tab === "posts"} onClick={() => setTab("posts")} />
        <TabBtn Icon={Tag} label="Tagged" active={tab === "tagged"} onClick={() => setTab("tagged")} />
        <TabBtn Icon={Repeat2} label="Shared" active={tab === "shared"} onClick={() => setTab("shared")} />
      </div>

      {/* Grid */}
      <div className="-mx-4">
        {list === null ? (
          <p className="py-14 text-center text-sm text-muted">Loading…</p>
        ) : list.length ? (
          <div className="grid grid-cols-3 gap-0.5">
            {list.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden bg-surface-2">
                {p.kind === "poll" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-accent-soft p-2 text-center">
                    <BarChart3 size={20} className="text-accent" />
                    <span className="line-clamp-2 text-[10px] leading-tight text-foreground">{p.caption}</span>
                  </div>
                ) : (
                  <Thumb src={p.imageUrl} alt={p.caption || p.lookTitle || "post"} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            label={
              tab === "posts" ? "No posts yet" : tab === "tagged" ? "No tagged posts" : "Nothing shared yet"
            }
          />
        )}
      </div>

      {conn && (
        <ConnectionsSheet
          userId={userId}
          myId={myId}
          myAuthor={myAuthor}
          initialTab={conn}
          onClose={() => setConn(null)}
        />
      )}
    </div>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center px-2">
      <span className="text-lg font-semibold leading-tight">{n}</span>
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
        active ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-14 text-center text-sm text-muted">{label}</p>;
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
