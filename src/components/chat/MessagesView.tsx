"use client";

import { Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchConversations, type ChatConversation } from "@/lib/chat";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";
import { EmptyState } from "../ui";
import { NewMessageSheet } from "./NewMessageSheet";

/** Relative-ish timestamp for the conversation list. */
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Conversation list. Refreshes on mount and when the app regains focus (no fast
 *  timer — polling lives in the open thread). */
export function MessagesView() {
  const openThread = useWardrobe((s) => s.openThread);
  const openStylist = useWardrobe((s) => s.openStylist);
  const authUser = useWardrobe((s) => s.authUser);
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => {
    fetchConversations().then((c) => {
      setConvos(c);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return (
    <div className="space-y-4">
      {/* AI Stylist — always the first chat. A local view, not a Supabase
          conversation, so it stays pinned regardless of DM activity. */}
      <button
        type="button"
        onClick={() => openStylist()}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-semibold">Stylist</p>
            <span className="shrink-0 text-[11px] font-medium text-accent">AI</span>
          </div>
          <p className="truncate text-sm text-muted">Ask me what to wear.</p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground"
      >
        <Plus size={17} /> New message
      </button>

      {!authUser ? (
        <EmptyState title="Sign in to message" subtitle="Chat with people you find by username." />
      ) : loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : convos.length === 0 ? (
        <EmptyState
          title="No messages yet"
          subtitle="Start a conversation — search someone by username."
        />
      ) : (
        <div className="-mx-1">
          {convos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openThread(c.id)}
              className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-surface-2"
            >
              <ProfileAvatar profile={{ avatarUrl: c.avatar, displayName: c.title }} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.title}</p>
                  <span className="shrink-0 text-[11px] text-muted">{when(c.lastMessageAt)}</span>
                </div>
                <p className={`truncate text-sm ${c.unread ? "text-foreground" : "text-muted"}`}>
                  {c.lastMessagePreview || (c.isGroup ? `${c.memberCount} people` : "Say hi")}
                </p>
              </div>
              {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}

      {newOpen && (
        <NewMessageSheet
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            openThread(id);
          }}
        />
      )}
    </div>
  );
}
