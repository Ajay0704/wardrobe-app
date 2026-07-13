"use client";

import { ChevronLeft, Flag, MoreVertical, Plus, Send, UserX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  blockUser,
  fetchConversations,
  fetchMessages,
  markRead,
  reportUser,
  sendMessage,
  type ChatConversation,
  type ChatKind,
  type ChatMessage,
  type ChatPayload,
} from "@/lib/chat";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";
import { AttachSheet } from "./AttachSheet";
import { ShareCard } from "./ShareCard";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const myAuthor = {
    name: profile.displayName?.trim() || "You",
    handle: profileHandle(profile),
    avatar: profile.avatarUrl,
  };

  const otherId = !meta?.isGroup ? meta?.otherIds[0] : undefined;
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };
  const block = async () => {
    setMenuOpen(false);
    if (!otherId) return;
    await blockUser(otherId);
    setView("messages");
  };
  const report = async () => {
    setMenuOpen(false);
    if (!otherId) return;
    await reportUser(otherId);
    flash("Reported. Thanks for flagging.");
  };

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
      const m = await sendMessage(convId, { kind: "text", body }, myAuthor);
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

  const pickAttachment = async (kind: ChatKind, payload: ChatPayload) => {
    setAttachOpen(false);
    if (!convId || !authUser) return;
    try {
      const m = await sendMessage(convId, { kind, payload }, myAuthor);
      if (m) setMessages((prev) => [...prev, m]);
    } catch {
      flash("Couldn't send that.");
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
        {otherId && (
          <div className="relative">
            <button
              type="button"
              aria-label="More options"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2"
            >
              <MoreVertical size={20} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[71]" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-[72] mt-1 w-44 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={report}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-2"
                  >
                    <Flag size={16} /> Report
                  </button>
                  <button
                    type="button"
                    onClick={block}
                    className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm text-red-600 hover:bg-surface-2 dark:text-red-400"
                  >
                    <UserX size={16} /> Block
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
                  {m.kind === "text" ? (
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm ${
                        mine ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"
                      }`}
                    >
                      {m.body}
                    </div>
                  ) : (
                    <ShareCard kind={m.kind} payload={m.payload} />
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div className="flex items-center gap-2 border-t border-line px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => setAttachOpen(true)}
          disabled={!authUser}
          aria-label="Share content"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground disabled:opacity-40"
        >
          <Plus size={20} />
        </button>
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

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[80] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}

      {attachOpen && <AttachSheet onClose={() => setAttachOpen(false)} onPick={pickAttachment} />}
    </div>
  );
}
