"use client";

import { ChevronLeft, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchConversations,
  fetchMessages,
  markRead,
  sendMessage,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/chat";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";

const POLL_MS = 20_000;

/** A single conversation thread. Full-screen overlay with its own back button, a
 *  scrolling message list, and a pinned composer. Polls the open thread every 20s,
 *  paused while the app is backgrounded. */
export function ChatView() {
  const convId = useWardrobe((s) => s.activeThreadId);
  const authUser = useWardrobe((s) => s.authUser);
  const profile = useWardrobe((s) => s.profile);
  const setView = useWardrobe((s) => s.setView);

  const [meta, setMeta] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!convId) return;
    const page = await fetchMessages(convId);
    setMessages(page.messages);
    const last = page.messages[page.messages.length - 1];
    if (last) void markRead(convId, last.createdAt);
  }, [convId]);

  // Load conversation header (from the list) once.
  useEffect(() => {
    if (!convId) return;
    let alive = true;
    fetchConversations().then((c) => {
      if (alive) setMeta(c.find((x) => x.id === convId) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [convId]);

  // Initial load + bounded polling, paused when backgrounded.
  useEffect(() => {
    if (!convId) return;
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [convId, refresh]);

  // Keep pinned to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || !convId || !authUser) return;
    setBusy(true);
    try {
      const m = await sendMessage(
        convId,
        { kind: "text", body },
        {
          name: profile.displayName?.trim() || "You",
          handle: profileHandle(profile),
          avatar: profile.avatarUrl,
        },
      );
      if (m) {
        setMessages((prev) => [...prev, m]);
        setText("");
      }
    } catch {
      // keep the text so they can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => setView("messages")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-surface-2"
        >
          <ChevronLeft size={24} />
        </button>
        {meta && <ProfileAvatar profile={{ avatarUrl: meta.avatar, displayName: meta.title }} size={32} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{meta?.title ?? "Conversation"}</p>
          {meta?.isGroup && <p className="truncate text-xs text-muted">{meta.memberCount} people</p>}
        </div>
      </div>

      {/* messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet — say hi.</p>
        ) : (
          messages.map((m) => {
            const mine = authUser?.id === m.senderId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                  {!mine && meta?.isGroup && (
                    <p className="mb-0.5 px-1 text-[11px] text-muted">{m.senderName}</p>
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm ${
                      mine
                        ? "bg-accent text-accent-foreground"
                        : "bg-surface-2 text-foreground"
                    }`}
                  >
                    {m.kind === "text" ? (
                      m.body
                    ) : (
                      <span className="italic opacity-80">
                        {m.kind === "image" ? "Photo" : "Shared content"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div className="flex items-center gap-2 border-t border-line px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <input
          className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
          placeholder={authUser ? "Message…" : "Sign in to message"}
          value={text}
          disabled={!authUser}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || busy}
          aria-label="Send"
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            text.trim() && !busy ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted"
          }`}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
