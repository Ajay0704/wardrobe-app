"use client";

import { MessageCircle, UserPlus } from "lucide-react";
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
import { ConnectionsPage } from "../community/ConnectionsPage";
import { ProfileScreen, type ProfileScreenData } from "../profile/ProfileScreen";

type ConnTab = "followers" | "following";

/**
 * Read-only profile for another user (view "userProfile"), opened by tapping a
 * person in the Connections sheet or a post author. Fetches the data, then hands
 * it to the shared ProfileScreen (same layout as the public /u/[handle] page)
 * with Follow / Message actions.
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
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [tagged, setTagged] = useState<CommunityPost[]>([]);
  const [shared, setShared] = useState<CommunityPost[]>([]);
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
    fetchUserProfile(userId).then((p) => alive && setProf(p));
    fetchFollowCounts(userId).then((c) => alive && setCounts(c));
    fetchUserPosts(userId).then((p) => alive && setPosts(p));
    fetchTaggedPosts(userId).then((p) => alive && setTagged(p));
    fetchReposts(userId).then((p) => alive && setShared(p));
    if (myId) fetchFollowing(myId).then((ids) => alive && setFollowing(ids.includes(userId)));
    return () => {
      alive = false;
    };
  }, [userId, myId]);

  const data: ProfileScreenData | null = useMemo(() => {
    if (!prof) return null;
    return {
      name: prof.name,
      handle: prof.handle,
      avatar: prof.avatar,
      bio: prof.bio,
      counts: { posts: posts.length, followers: counts.followers, following: counts.following },
      posts,
      tagged,
      shared,
    };
  }, [prof, posts, tagged, shared, counts]);

  if (!userId) {
    return <div className="py-16 text-center text-sm text-muted">No profile selected.</div>;
  }

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

  const actions = isMe ? undefined : (
    <>
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
    </>
  );

  return (
    <>
      <ProfileScreen data={data} actions={actions} onStat={(which) => setConn(which)} loading={!prof} />
      {conn && (
        <ConnectionsPage
          userId={userId}
          myId={myId}
          myAuthor={myAuthor}
          initialTab={conn}
          title={data?.handle}
          onClose={() => setConn(null)}
        />
      )}
    </>
  );
}
