"use client";

import { ChevronLeft, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchFollowers,
  fetchFollowing,
  fetchFollowingUsers,
  toggleFollow,
  type FollowUser,
  type PostAuthor,
} from "@/lib/community";
import { searchUsers, type SearchUser } from "@/lib/chat";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";

type ConnTab = "followers" | "following" | "find";

/**
 * Profile connections as a full-screen pushed page (Instagram-style): tapping a
 * profile's Followers / Following stat slides this in from the right, opening on
 * the tapped list with a Followers | Following toggle to flip between them. When
 * opened from the Find-friends icon (`initialTab="find"`) it's a dedicated search
 * page with no toggle. Same Follow/Following actions as before — only the
 * container changed from a bottom sheet to a page. `onClose` pops back.
 */
export function ConnectionsPage({
  userId,
  myId,
  myAuthor,
  initialTab = "followers",
  title,
  onClose,
}: {
  /** Whose followers / following to list. */
  userId: string;
  /** The current viewer (to hide self-follow and drive follow state). */
  myId: string | null;
  myAuthor: PostAuthor;
  initialTab?: ConnTab;
  /** Header title for the followers/following view — usually the profile's @handle. */
  title?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ConnTab>(initialTab);
  const [followers, setFollowers] = useState<FollowUser[] | null>(null);
  const [following, setFollowing] = useState<FollowUser[] | null>(null);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());

  const openUserProfile = useWardrobe((s) => s.openUserProfile);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFind = tab === "find";

  const openProfile = (id: string) => {
    openUserProfile(id);
    onClose();
  };

  // Who the viewer already follows — drives every Follow/Following button.
  useEffect(() => {
    if (!myId) return;
    fetchFollowing(myId).then((ids) => setMyFollowing(new Set(ids)));
  }, [myId]);

  // Lazy-load each list the first time its tab is opened.
  useEffect(() => {
    if (tab === "followers" && followers === null) fetchFollowers(userId).then(setFollowers);
    if (tab === "following" && following === null) fetchFollowingUsers(userId).then(setFollowing);
  }, [tab, userId, followers, following]);

  useEffect(() => {
    if (tab !== "find") return;
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      searchUsers(term).then((r) => {
        setResults(r);
        setSearching(false);
      });
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, tab]);

  const follow = (id: string, next: boolean) => {
    setMyFollowing((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
    void toggleFollow(id, next, myAuthor).catch(() => {});
  };

  const rows: { id: string; name: string; handle: string; avatar?: string }[] =
    tab === "followers"
      ? (followers ?? [])
      : tab === "following"
        ? (following ?? [])
        : results.map((u) => ({
            id: u.id,
            name: u.displayName || u.username || "Someone",
            handle: u.username || "user",
            avatar: u.avatarUrl ?? undefined,
          }));

  const loading =
    (tab === "followers" && followers === null) ||
    (tab === "following" && following === null) ||
    (tab === "find" && searching);

  const emptyText =
    tab === "find"
      ? q.trim()
        ? `No one found for “${q.trim()}”.`
        : "Search by name or @username to find people to follow."
      : tab === "followers"
        ? "No followers yet."
        : "Not following anyone yet.";

  return (
    <div className="native-item-page native-page-in" role="dialog" aria-label={isFind ? "Find friends" : "Connections"}>
      <div className="native-item-page-header">
        <button type="button" onClick={onClose} className="native-item-page-back" aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="native-item-page-title">
          {isFind ? "Find friends" : title?.replace(/^@?/, "@") || "Connections"}
        </span>
        <span className="native-item-page-spacer" />
      </div>

      <div className="native-item-page-body space-y-3">
        {isFind ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
            <Search size={16} className="text-muted" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="Search by name or @username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex rounded-xl bg-surface-2 p-1">
            {(["followers", "following"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm capitalize transition-colors ${
                  tab === t
                    ? "border border-line bg-surface font-medium text-foreground"
                    : "border border-transparent text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{emptyText}</p>
          ) : (
            rows.map((u) => {
              const isMe = Boolean(myId && u.id === myId);
              const on = myFollowing.has(u.id);
              return (
                <div key={u.id} className="flex items-center gap-3 px-1 py-2">
                  <button
                    type="button"
                    onClick={() => openProfile(u.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ProfileAvatar profile={{ avatarUrl: u.avatar, displayName: u.name }} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted">@{u.handle}</p>
                    </div>
                  </button>
                  {!isMe && myId && (
                    <button
                      type="button"
                      onClick={() => follow(u.id, !on)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        on ? "border border-line text-muted" : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {on ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
