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
import { useEffect, useState } from "react";
import {
  fetchNotifications,
  markAllRead,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications";
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
 * Notifications screen (AJA-96). Lists likes / comments / poll votes / follows
 * on the viewer's content, newest first, and marks everything read on open.
 * Rows link back to Explore, where the community feed lives. (Deep-linking to a
 * single post is a follow-up — there's no single-post screen yet.)
 */
export function NotificationsView() {
  const setView = useWardrobe((s) => s.setView);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

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
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => setView("explore")}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-surface-2 ${
              n.read ? "" : "bg-accent-soft/50"
            }`}
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
            </span>
            <span className="shrink-0 self-start pt-0.5 text-xs text-muted">
              {timeAgo(n.createdAt)}
            </span>
            {!n.read && (
              <span className="ml-1 h-2 w-2 shrink-0 self-center rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
