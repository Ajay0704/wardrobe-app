"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ClosetShareItem, ClosetShareReply } from "@/lib/closet-share";
import { Button, inputClass } from "@/components/ui";

type ShareData = {
  id: string;
  question: string;
  items: ClosetShareItem[];
  ownerName?: string | null;
};

/**
 * Public guest page for Share Closet — no app install required.
 */
export default function ShareClosetPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [share, setShare] = useState<ShareData | null>(null);
  const [replies, setReplies] = useState<ClosetShareReply[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [authorName, setAuthorName] = useState("");
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/closet-share?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Share not found.");
          return;
        }
        setShare(data.share);
        setReplies(data.replies ?? []);
      } catch {
        if (!cancelled) setError("Couldn't load this share.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const togglePick = (itemId: string) => {
    setPicked((cur) =>
      cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId],
    );
  };

  const submit = async () => {
    if (!share || !message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/closet-share/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId: share.id,
          authorName: authorName.trim() || "Friend",
          message: message.trim(),
          suggestedItemIds: picked,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send reply.");
        return;
      }
      setReplies((r) => [...r, data.reply]);
      setMessage("");
      setPicked([]);
      setSent(true);
    } catch {
      setError("Couldn't send reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="border-b border-line px-4 py-4">
        <p className="brand-wordmark-kicker text-center text-xs text-muted">
          Your Personal
        </p>
        <p className="brand-wordmark-name text-center text-lg">Wardrobe</p>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {error && !share && (
          <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {share && (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {share.ownerName
                  ? `${share.ownerName} asked`
                  : "A friend asked"}
              </p>
              <h1 className="heading mt-1 text-2xl">{share.question}</h1>
              <p className="mt-2 text-sm text-muted">
                Tap pieces you’d recommend, leave a note, and send — no app
                install needed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {share.items.map((it) => {
                const on = picked.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => togglePick(it.id)}
                    className={`overflow-hidden rounded-2xl border text-left ${
                      on ? "border-accent ring-2 ring-accent/30" : "border-line"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.imageUrl}
                      alt=""
                      className="aspect-[3/4] w-full object-cover bg-surface-2"
                    />
                    <div className="px-2 py-2">
                      <p className="truncate text-xs font-medium">{it.name}</p>
                      {it.brand && (
                        <p className="truncate text-[10px] text-muted">
                          {it.brand}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">Your reply</h2>
              <input
                className={inputClass}
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your name"
              />
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What should they wear, and why?"
                maxLength={1000}
              />
              {error && share && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              {sent && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Sent — they’ll see it in Closet → Share Closet.
                </p>
              )}
              <Button
                className="w-full"
                disabled={sending || !message.trim()}
                onClick={() => void submit()}
              >
                {sending ? "Sending…" : "Send reply"}
              </Button>
            </div>

            {replies.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Replies so far</h2>
                {replies.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-line px-3 py-3"
                  >
                    <p className="text-sm font-medium">{r.author_name}</p>
                    <p className="mt-1 text-sm text-muted">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
