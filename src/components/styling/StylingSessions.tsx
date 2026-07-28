"use client";

import { Check, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  endSession,
  listOpenSessions,
  respondToAsk,
  type StylingSession,
} from "@/lib/styling";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatar } from "../ProfileAvatar";

/**
 * Pending asks and the live session, at the top of Outfits (AJA-240).
 *
 * The same row renders from both sides, which is the whole point: as the person who
 * asked you see "waiting for them", and as the person who was asked you see the ask
 * itself with the note. Accepting is the moment access actually opens, so it's a
 * deliberate two-button choice rather than a tap-through.
 */
export function StylingSessions({ refreshKey }: { refreshKey: number }) {
  const authUser = useWardrobe((s) => s.authUser);
  const view = useWardrobe((s) => s.view);
  const openStyleSession = useWardrobe((s) => s.openStyleSession);
  const pendingStyleSessionId = useWardrobe((s) => s.pendingStyleSessionId);
  const setPendingStyleSessionId = useWardrobe((s) => s.setPendingStyleSessionId);
  const myId = authUser?.id ?? null;

  const [sessions, setSessions] = useState<StylingSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // `reload` only bumps a counter the fetch effect depends on. Calling a function
  // that setStates *directly* from an effect body trips react-hooks/set-state-in-effect
  // even when the write is behind an await, so the fetch is inlined below and the
  // handlers just nudge it — setState from an event handler is fine.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Refetch whenever we land on Outfits. The native shell keeps tabs mounted, so a
  // mount-only effect would go stale the moment you navigated away and back.
  useEffect(() => {
    if (view !== "outfits" || !myId) return;
    let alive = true;
    (async () => {
      try {
        const rows = await listOpenSessions();
        if (alive) setSessions(rows);
      } catch {
        /* offline — leave whatever we last had */
      }
    })();
    return () => {
      alive = false;
    };
  }, [view, myId, refreshKey, tick]);

  // Arriving from a notification: clear the marker once the list has it, so the
  // highlight doesn't stick around for the rest of the session.
  useEffect(() => {
    if (!pendingStyleSessionId) return;
    if (sessions.some((s) => s.id === pendingStyleSessionId)) {
      const t = window.setTimeout(() => setPendingStyleSessionId(null), 2600);
      return () => window.clearTimeout(t);
    }
  }, [pendingStyleSessionId, sessions, setPendingStyleSessionId]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch {
      /* surfaced by the refetch below putting the row back */
    } finally {
      setBusy(null);
      reload();
    }
  };

  if (!myId || sessions.length === 0) return null;

  return (
    <div className="mb-3 space-y-2.5">
      {sessions.map((s) => {
        const iAmOwner = s.ownerId === myId;
        const them = iAmOwner ? s.stylist : s.owner;
        const highlight = s.id === pendingStyleSessionId;
        const working = busy === s.id;

        if (s.status === "active") {
          return (
            <Card key={s.id} tone="live" highlight={highlight}>
              <Head
                them={them}
                title={iAmOwner ? `${them.name || "Your friend"} is styling you` : `Styling ${them.name || "them"}`}
                sub="Live now"
                pulse
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => act(s.id, () => endSession(s.id))}
                  className="h-10 flex-[0_0_88px] rounded-xl border border-line bg-surface text-sm disabled:opacity-50"
                >
                  End
                </button>
                <button
                  type="button"
                  onClick={() => openStyleSession(s.id)}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground active:scale-[0.98]"
                >
                  Open the board
                </button>
              </div>
            </Card>
          );
        }

        // status === "requested"
        if (iAmOwner) {
          return (
            <Card key={s.id} tone="wait" highlight={highlight}>
              <Head
                them={them}
                title={`Waiting for ${them.name || "your friend"}`}
                sub="Nothing is shared until they accept"
                pulse
              />
              <button
                type="button"
                disabled={working}
                onClick={() => act(s.id, () => endSession(s.id))}
                className="mt-3 h-10 w-full rounded-xl border border-line bg-surface text-sm disabled:opacity-50"
              >
                Cancel the ask
              </button>
            </Card>
          );
        }

        return (
          <Card key={s.id} tone="ask" highlight={highlight}>
            <Head
              them={them}
              title={`${them.name || "A friend"} needs help getting dressed`}
              sub={them.handle ? `@${them.handle}` : "Just now"}
            />
            {s.note && (
              <p className="mt-2.5 rounded-xl bg-surface/70 px-3 py-2.5 text-sm leading-relaxed">
                “{s.note}”
              </p>
            )}
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              They&apos;re opening their closet to you for this session. You&apos;ll
              build one board together, and it closes when either of you ends it.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={working}
                onClick={() => act(s.id, () => respondToAsk(s.id, false))}
                className="flex h-10 flex-[0_0_98px] items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-sm disabled:opacity-50"
              >
                <X size={15} /> Not now
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() =>
                  act(s.id, async () => {
                    await respondToAsk(s.id, true);
                    // Accepting IS entering — the friend goes straight to the board.
                    openStyleSession(s.id);
                  })
                }
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground active:scale-[0.98] disabled:opacity-50"
              >
                <Check size={16} /> Help them
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Card({
  tone,
  highlight,
  children,
}: {
  tone: "ask" | "wait" | "live";
  highlight: boolean;
  children: React.ReactNode;
}) {
  const skin =
    tone === "ask"
      ? "border-amber-200 bg-amber-50/70"
      : tone === "live"
        ? "border-accent/35 bg-accent-soft"
        : "border-line bg-surface";
  return (
    <div
      className={`animate-fade-up rounded-2xl border p-4 transition-shadow ${skin} ${
        highlight ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Head({
  them,
  title,
  sub,
  pulse,
}: {
  them: { name: string; handle: string; avatar?: string };
  title: string;
  sub: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <ProfileAvatar profile={{ displayName: them.name, avatarUrl: them.avatar }} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
      </div>
      {pulse ? (
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
      ) : (
        <Wand2 size={17} className="shrink-0 text-amber-600" />
      )}
    </div>
  );
}
