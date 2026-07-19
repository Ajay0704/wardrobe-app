/**
 * In-app notifications (AJA-96). Rows are created by DB triggers on
 * like / comment / vote / follow (see supabase/migrations/20260716_notifications.sql);
 * the client only reads and marks-read its own, through the browser Supabase
 * client so RLS scopes every query to the signed-in recipient.
 */

import { getSupabase } from "./supabase/client";

export type NotificationKind = "like" | "comment" | "follow" | "vote" | "trip_invite";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  actorId: string | null;
  actorName: string;
  actorHandle: string;
  actorAvatar?: string;
  postId: string | null;
  preview?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  actor_id: string | null;
  actor_name: string | null;
  actor_handle: string | null;
  actor_avatar: string | null;
  post_id: string | null;
  preview: string | null;
  read: boolean;
  created_at: string;
}

function toNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    actorId: r.actor_id,
    actorName: r.actor_name ?? "Someone",
    actorHandle: r.actor_handle ?? "user",
    actorAvatar: r.actor_avatar ?? undefined,
    postId: r.post_id,
    preview: r.preview ?? undefined,
    read: r.read,
    createdAt: r.created_at,
  };
}

/** The recipient's notifications, newest first. RLS scopes this to the viewer. */
export async function fetchNotifications(limit = 40): Promise<AppNotification[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => toNotification(r as NotificationRow));
}

/** Count of the viewer's unread notifications — drives the bell badge. */
export async function unreadCount(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { count, error } = await sb
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("read", false);
  if (error) return 0;
  return count ?? 0;
}

/** Mark all of the viewer's unread notifications read (on opening the screen). */
export async function markAllRead(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("notifications").update({ read: true }).eq("read", false);
}
