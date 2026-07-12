"use client";

import { ChevronLeft, DoorOpen, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CLOSET_SHARE_MAX_ITEMS,
  snapshotShareItems,
  type ClosetShareReply,
} from "@/lib/closet-share";
import { APP_SHARE_URL } from "@/lib/support";
import { authHeaders } from "@/lib/supabase/client";
import { useWardrobe } from "@/lib/store";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Button, inputClass } from "./ui";

function portal(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

type Phase = "howto" | "pick" | "link" | "replies";

/**
 * Share Closet — Acloset-style: pick items + question → shareable link →
 * friends reply without installing the app.
 */
export function ShareClosetSheet({ onClose }: { onClose: () => void }) {
  const items = useWardrobe((s) => s.items);
  const profile = useWardrobe((s) => s.profile);
  const owned = useMemo(
    () => items.filter((it) => !it.wishlist && it.imageUrl),
    [items],
  );

  const [phase, setPhase] = useState<Phase>("howto");
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<ClosetShareReply[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= CLOSET_SHARE_MAX_ITEMS) return cur;
      return [...cur, id];
    });
  };

  const createLink = async () => {
    const q = question.trim();
    if (!q || selected.length === 0) {
      setStatus("Pick items and write a question.");
      return;
    }
    setBusy(true);
    setStatus("");
    const snapshot = snapshotShareItems(owned, selected);
    try {
      const res = await fetch("/api/closet-share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          question: q,
          items: snapshot,
          ownerName: profile.displayName || undefined,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setStatus(data.error || "Couldn't create share link.");
        return;
      }
      const origin =
        typeof window !== "undefined" ? window.location.origin : APP_SHARE_URL;
      const url = `${origin}/share/closet/${data.id}`;
      setShareId(data.id);
      setShareUrl(url);
      setPhase("link");
    } catch {
      setStatus("Couldn't create share link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!shareUrl) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: "Help me pick an outfit",
          text: question.trim() || "Which of these should I wear?",
          url: shareUrl,
          dialogTitle: "Share closet",
        });
        setStatus("Shared!");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|dismiss|abort/i.test(msg)) return;
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Help me pick an outfit",
          text: question.trim(),
          url: shareUrl,
        });
        setStatus("Shared!");
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied — send it to friends.");
    } catch {
      setStatus(shareUrl);
    }
  };

  const loadReplies = async () => {
    if (!shareId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/closet-share?id=${encodeURIComponent(shareId)}`);
      const data = (await res.json()) as {
        replies?: ClosetShareReply[];
        error?: string;
      };
      if (!res.ok) {
        setStatus(data.error || "Couldn't load replies.");
        return;
      }
      setReplies(data.replies ?? []);
      setPhase("replies");
    } catch {
      setStatus("Couldn't load replies.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    phase === "howto"
      ? "How to share"
      : phase === "pick"
        ? "Share Closet"
        : phase === "link"
          ? "Share link"
          : "Responses";

  return portal(
    <div className="smart-buy-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="smart-buy-sheet-header">
        <button
          type="button"
          onClick={() => {
            if (phase === "pick") setPhase("howto");
            else if (phase === "link" || phase === "replies") setPhase("pick");
            else onClose();
          }}
          className="smart-buy-sheet-back"
          aria-label="Back"
        >
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Back</span>
        </button>
        <h2 className="smart-buy-sheet-title">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-close"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div className="smart-buy-sheet-body space-y-5">
        {phase === "howto" && (
          <>
            <div className="flex flex-col items-center py-4">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-accent-soft">
                <DoorOpen size={40} className="text-accent" />
                <span className="absolute -right-1 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
                  <Send size={14} />
                </span>
              </div>
              <h3 className="heading mt-4 text-xl">How to share your closet</h3>
            </div>
            <ol className="relative space-y-5 border-l border-line pl-5">
              {[
                {
                  t: "Step 1",
                  d: "Choose items to share and write your question.",
                },
                {
                  t: "Step 2",
                  d: "Share the link with family, friends, or your community. They can reply without installing Wardrobe.",
                },
                {
                  t: "Step 3",
                  d: "Check their responses. Save a look as an outfit when you like it.",
                },
              ].map((s) => (
                <li key={s.t} className="relative">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-muted" />
                  <p className="text-sm font-semibold">{s.t}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.d}</p>
                </li>
              ))}
            </ol>
            <Button className="w-full" onClick={() => setPhase("pick")}>
              Get started
            </Button>
          </>
        )}

        {phase === "pick" && (
          <>
            <p className="text-sm text-muted">
              Select up to {CLOSET_SHARE_MAX_ITEMS} pieces, then ask a question
              (e.g. “Which top for Friday night?”).
            </p>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Your question for friends…"
              maxLength={280}
            />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {owned.map((it) => {
                const on = selected.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it.id)}
                    className={`overflow-hidden rounded-xl border text-left transition-colors ${
                      on
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-line"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.imageUrl}
                      alt=""
                      className="aspect-[3/4] w-full object-cover bg-surface-2"
                    />
                    <span className="block truncate px-1.5 py-1 text-[10px]">
                      {it.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {owned.length === 0 && (
              <p className="text-sm text-muted">
                Add owned items with photos first, then share.
              </p>
            )}
            {status && <p className="text-sm text-muted">{status}</p>}
            <Button
              className="w-full"
              disabled={busy || selected.length === 0 || !question.trim()}
              onClick={() => void createLink()}
            >
              {busy ? "Creating link…" : `Create link (${selected.length})`}
            </Button>
          </>
        )}

        {phase === "link" && (
          <>
            <p className="text-sm text-muted">
              Send this link — friends can answer in the browser, no app needed.
            </p>
            <p className="break-all rounded-xl border border-line bg-surface-2/50 px-3 py-3 text-xs">
              {shareUrl}
            </p>
            {status && <p className="text-sm text-muted">{status}</p>}
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => void sendLink()}>
                <Send size={14} /> Share link
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void loadReplies()}
              >
                Check responses
              </Button>
            </div>
          </>
        )}

        {phase === "replies" && (
          <>
            {replies.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface-2/40 px-4 py-6 text-center text-sm text-muted">
                No replies yet. Share the link and check back here.
              </p>
            ) : (
              <ul className="space-y-3">
                {replies.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-line bg-surface px-3 py-3"
                  >
                    <p className="text-sm font-medium">{r.author_name}</p>
                    <p className="mt-1 text-sm text-muted">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void loadReplies()}
            >
              Refresh
            </Button>
          </>
        )}
      </div>
    </div>,
  );
}

/** Closet Review — placeholder until product spec is defined. */
export function ClosetReviewSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return portal(
    <div
      className="smart-buy-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Closet Review"
    >
      <header className="smart-buy-sheet-header">
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-back"
          aria-label="Back"
        >
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Back</span>
        </button>
        <h2 className="smart-buy-sheet-title">Closet Review</h2>
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-close"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>
      <div className="smart-buy-sheet-body space-y-4">
        <div className="flex flex-col items-center py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles size={28} />
          </span>
          <h3 className="heading mt-4 text-lg">Coming next</h3>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Closet Review will help you audit what’s working in your wardrobe.
            Tell us how you want this to work and we’ll build it.
          </p>
        </div>
        <Button className="w-full" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>,
  );
}
