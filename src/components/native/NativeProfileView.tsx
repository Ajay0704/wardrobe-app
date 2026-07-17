"use client";

import { Plus, Settings, Share2, UserPlus } from "lucide-react";
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
import { ConnectionsPage } from "../community/ConnectionsPage";
import { CreatePostSheet } from "../community/CreatePost";
import { ProfileScreen, type ProfileScreenData } from "../profile/ProfileScreen";

type ConnTab = "followers" | "following" | "find";

/**
 * The owner's social profile (view "social", opened by tapping the top-bar
 * avatar). Renders the shared ProfileScreen — same layout as other users and
 * the public /u/[handle] page — with owner chrome: find-friends + new-post in
 * the top-right, an Edit / Share / Settings action row, and tappable stats.
 */
export function NativeProfileView() {
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const setView = useWardrobe((s) => s.setView);

  const [toast, setToast] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnTab | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [tagged, setTagged] = useState<CommunityPost[]>([]);
  const [shared, setShared] = useState<CommunityPost[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  const myId = authUser?.id ?? null;

  useEffect(() => {
    if (!myId) {
      setMyPosts([]);
      setTagged([]);
      setShared([]);
      setCounts({ followers: 0, following: 0 });
      return;
    }
    let alive = true;
    fetchUserPosts(myId).then((p) => alive && setMyPosts(p));
    fetchTaggedPosts(myId).then((p) => alive && setTagged(p));
    fetchReposts(myId).then((p) => alive && setShared(p));
    fetchFollowCounts(myId).then((c) => alive && setCounts(c));
    return () => {
      alive = false;
    };
  }, [myId]);

  const name = profile.displayName?.trim() || "You";
  const handle = useMemo(() => profileHandle(profile), [profile]);
  const author = useMemo<PostAuthor>(
    () => ({ name, handle, avatar: profile.avatarUrl }),
    [name, handle, profile.avatarUrl],
  );

  const data = useMemo<ProfileScreenData>(
    () => ({
      name,
      handle,
      avatar: profile.avatarUrl,
      bio: profile.bio,
      location: profile.location,
      counts: { posts: myPosts.length, followers: counts.followers, following: counts.following },
      posts: myPosts,
      tagged,
      shared,
    }),
    [name, handle, profile.avatarUrl, profile.bio, profile.location, myPosts, tagged, shared, counts],
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
    flash("Posted to your profile");
  };

  const topRight = (
    <>
      <IconBtn label="Find friends" onClick={() => setConn("find")}>
        <UserPlus size={20} />
      </IconBtn>
      <IconBtn label="New post" onClick={newPost}>
        <Plus size={22} />
      </IconBtn>
    </>
  );

  const actions = (
    <>
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
    </>
  );

  return (
    <>
      <ProfileScreen
        data={data}
        topRight={topRight}
        actions={actions}
        onStat={(which) => setConn(which)}
        onAvatarClick={() => setView("profile")}
      />

      {conn && myId && (
        <ConnectionsPage
          userId={myId}
          myId={myId}
          myAuthor={author}
          initialTab={conn}
          title={handle}
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
    </>
  );
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
