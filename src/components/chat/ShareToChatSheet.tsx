"use client";

import { ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchConversations,
  sendMessage,
  type ChatConversation,
  type ChatKind,
  type ChatPayload,
} from "@/lib/chat";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";
import { NewMessageSheet } from "./NewMessageSheet";
import { ShareCard } from "./ShareCard";

/** Send an outfit / item / look into a chat: pick an existing conversation or
 *  start a new one. */
export function ShareToChatSheet({
  kind,
  payload,
  onClose,
}: {
  kind: ChatKind;
  payload: ChatPayload;
  onClose: () => void;
}) {
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetchConversations().then((c) => {
      setConvos(c);
      setLoading(false);
    });
  }, []);

  const author = {
    name: profile.displayName?.trim() || "You",
    handle: profileHandle(profile),
    avatar: profile.avatarUrl,
  };

  const sendTo = async (convId: string) => {
    try {
      await sendMessage(convId, { kind, payload }, author);
      setSent(true);
      window.setTimeout(onClose, 900);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet flex max-h-[80vh] flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Share to chat"
      >
        <div className="native-sheet-handle" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading text-lg">{sent ? "Sent" : "Send to…"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 flex justify-center">
          <ShareCard kind={kind} payload={payload} />
        </div>

        {!authUser ? (
          <p className="py-6 text-center text-sm text-muted">Sign in to share into a chat.</p>
        ) : (
          <div className="min-h-16 flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
                <ChevronRight size={18} />
              </span>
              <span className="text-sm font-medium">Message someone new</span>
            </button>

            {loading ? (
              <p className="py-6 text-center text-sm text-muted">Loading…</p>
            ) : (
              convos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => sendTo(c.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-surface-2"
                >
                  <ProfileAvatar profile={{ avatarUrl: c.avatar, displayName: c.title }} size={44} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                </button>
              ))
            )}
          </div>
        )}

        {newOpen && (
          <NewMessageSheet
            onClose={() => setNewOpen(false)}
            onCreated={(id) => {
              setNewOpen(false);
              void sendTo(id);
            }}
          />
        )}
      </div>
    </div>
  );
}
