"use client";

import {
  BarChart3,
  Bell,
  Heart,
  Luggage,
  MessageCircle,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchNotifications,
  markAllRead,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications";
import { fetchFollowing, toggleFollow, type PostAuthor } from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  vote: BarChart3,
  trip_invite: Luggage,
};

function actionText(n: AppNotification): string {
  if (n.kind === "like") return "liked your post";
  if (n.kind === "comment")
    return n.preview ? `commented: “${n.preview}”` : "commented on your post";
  if (n.kind === "follow") return "started following you";
  if (n.kind === "vote")
    return n.preview ? `voted “${n.preview}” on your poll` : "voted on your poll";
  if (n.kind === "trip_invite")
    return n.preview ? `invited you to “${n.preview}”` : "invited you to a trip";
  return "sent you a notification";
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Notifications screen (AJA-96). Lists likes / comments / poll votes / follows /
 * trip invites on the viewer's content, newest first, and marks everything read
 * on open. A follow notification opens the follower's profile and offers a
 * one-tap Follow-back (AJA-196) — closing the reciprocal-follow loop. Other
 * kinds link back to Explore (no single-post screen yet); trip invites → Travel.
 */
export function NotificationsView() {
  const setView = useWardrobe((s) => s.setView);
  const openUserProfile = useWardrobe((s) => s.openUserProfile);
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const myId = authUser?.id ?? null;

  // Identity stamped onto the follow-back so the notification trigger can name us.
  const myAuthor = useMemo<PostAuthor>(
    () => ({
      name: profile.displayName?.trim() || "Someone",
      handle: profileHandle(profile),
      avatar: profile.avatarUrl,
    }),
    [profile],
  );

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await fetchNotifications();
      if (!alive) return;
      setItems(rows);
      setLoading(false);
      if (rows.some((r) => !r.read)) void markAllRead().catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Who I already follow — drives "Follow back" vs "Following" on follow rows.
  useEffect(() => {
    if (!myId) return;
    let alive = true;
    fetchFollowing(myId).then((ids) => {
      if (alive) setFollowing(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, [myId]);

  const followBack = (actorId: string, next: boolean) => {
    setFollowing((prev) => {
      const s = new Set(prev);
      if (next) s.add(actorId);
      else s.delete(actorId);
      return s;
    });
    void toggleFollow(actorId, next, myAuthor).catch(() => {});
  };

  const openTarget = (n: AppNotification) => {
    if (n.kind === "follow" && n.actorId) return openUserProfile(n.actorId);
    if (n.kind === "trip_invite") return setView("travel");
    return setView("explore");
  };

  if (loading) {
    return <p className="py-10 text-center text-xs text-muted">Loading…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Bell size={24} strokeWidth={1.7} />
        </span>
        <p className="text-sm font-medium">No notifications yet</p>
        <p className="max-w-[16rem] text-xs text-muted">
          When someone likes, comments on, or follows you, it’ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 pt-1">
      {items.map((n) => {
        const Icon = KIND_ICON[n.kind];
        const initials = (n.actorName || "?").trim().slice(0, 1).toUpperCase();
        const canFollowBack = n.kind === "follow" && Boolean(n.actorId) && n.actorId !== myId;
        const on = n.actorId ? following.has(n.actorId) : false;
        return (
          <div
            key={n.id}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${
              n.read ? "" : "bg-accent-soft/50"
            }`}
          >
            <button
              type="button"
              onClick={() => openTarget(n)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="relative shrink-0">
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-sm font-medium text-muted">
                  {n.actorAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.actorAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground ring-2 ring-background">
                  <Icon size={11} strokeWidth={2.2} />
                </span>
              </span>
              <span className="min-w-0 flex-1 text-sm leading-snug">
                <span className="font-medium">{n.actorName}</span>{" "}
                <span className="text-muted">{actionText(n)}</span>
                <span className="ml-1 text-xs text-muted">· {timeAgo(n.createdAt)}</span>
              </span>
            </button>
            {canFollowBack && (
              <button
                type="button"
                onClick={() => followBack(n.actorId!, !on)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  on ? "border border-line text-muted" : "bg-accent text-accent-foreground"
                }`}
              >
                {on ? "Following" : "Follow back"}
              </button>
            )}
            {!n.read && !canFollowBack && (
              <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            )}
          </div>
        );
      })}
    </div>
  );
}
