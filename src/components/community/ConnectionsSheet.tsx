"use client";

import { Search, X } from "lucide-react";
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
import { ProfileAvatar } from "../ProfileAvatar";

type ConnTab = "followers" | "following" | "find";

const TABS: { key: ConnTab; label: string }[] = [
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "find", label: "Find friends" },
];

/**
 * One sheet covering the profile's social connections: the Followers and
 * Following lists (tappable from the profile stats) and a Find-friends search
 * that follows people. All three share a Follow/Following toggle backed by
 * `toggleFollow`.
 */
export function ConnectionsSheet({
  userId,
  myId,
  myAuthor,
  initialTab = "followers",
  onClose,
}: {
  /** Whose followers / following to list. */
  userId: string;
  /** The current viewer (to hide self-follow and drive follow state). */
  myId: string | null;
  myAuthor: PostAuthor;
  initialTab?: ConnTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ConnTab>(initialTab);
  const [followers, setFollowers] = useState<FollowUser[] | null>(null);
  const [following, setFollowing] = useState<FollowUser[] | null>(null);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet flex max-h-[85vh] flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Connections"
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">Connections</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-surface-2 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                tab === t.key
                  ? "border border-line bg-surface font-medium text-foreground"
                  : "border border-transparent text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "find" && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
            <Search size={16} className="text-muted" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="Search by name or @username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}

        <div className="mt-3 min-h-24 flex-1 space-y-1 overflow-y-auto">
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
                  <ProfileAvatar
                    profile={{ avatarUrl: u.avatar, displayName: u.name }}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted">@{u.handle}</p>
                  </div>
                  {!isMe && myId && (
                    <button
                      type="button"
                      onClick={() => follow(u.id, !on)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        on
                          ? "border border-line text-muted"
                          : "bg-accent text-accent-foreground"
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
