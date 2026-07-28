"use client";

import { Info, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchFollowingUsers, type FollowUser } from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { askForStyling, type Identity } from "@/lib/styling";
import { useWardrobe } from "@/lib/store";
import { BottomSheet } from "../BottomSheet";
import { ProfileAvatar } from "../ProfileAvatar";

/**
 * "Ask a friend to style me" (AJA-240). The owner initiates — nobody opens the app
 * volunteering to dress someone else — so this sheet lives on Outfits, not on a
 * friend's profile.
 *
 * Sending both creates the session and seeds the closet snapshot, because the owner
 * is the only one RLS lets write those rows and they're the one who's here. Nothing
 * is readable by the friend until they accept and the session flips to 'active'.
 */
export function AskToStyleSheet({
  open,
  onClose,
  onAsked,
}: {
  open: boolean;
  onClose: () => void;
  onAsked: () => void;
}) {
  const profile = useWardrobe((s) => s.profile);
  const items = useWardrobe((s) => s.items);
  const authUser = useWardrobe((s) => s.authUser);
  const myId = authUser?.id ?? null;

  const myIdentity = useMemo<Identity>(
    () => ({
      name: profile.displayName || "Someone",
      handle: profileHandle(profile),
      avatar: profile.avatarUrl,
    }),
    [profile],
  );

  const shareable = useMemo(
    () => items.filter((it) => !it.wishlist && !!it.imageUrl).length,
    [items],
  );

  const [friends, setFriends] = useState<FollowUser[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear the draft on each open so a second ask doesn't inherit the last one's note
  // or selection. Conditional setState during render (React's sanctioned
  // derive-from-props, same latch the shared BottomSheet uses) — an effect here trips
  // react-hooks/set-state-in-effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setNote("");
      setError(null);
    }
  }

  // Load the people you follow, once, the first time the sheet opens.
  useEffect(() => {
    if (!open || !myId || friends !== null) return;
    let alive = true;
    void fetchFollowingUsers(myId)
      .then((list) => {
        if (alive) setFriends(list);
      })
      .catch(() => {
        if (alive) setFriends([]);
      });
    return () => {
      alive = false;
    };
  }, [open, myId, friends]);

  const friend = friends?.find((f) => f.id === picked) ?? null;

  const send = async () => {
    if (!friend || sending) return;
    setSending(true);
    setError(null);
    try {
      await askForStyling(
        { id: friend.id, name: friend.name, handle: friend.handle, avatar: friend.avatar },
        note,
        items,
        myIdentity,
      );
      onAsked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that ask");
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Ask a friend to style you">
      <h3 className="heading px-1 text-xl">Who should style you?</h3>
      <p className="mb-4 mt-1 px-1 text-sm leading-relaxed text-muted">
        They&apos;ll see your closet while the session is open — and only while
        it&apos;s open.
      </p>

      {!myId ? (
        // Without a signed-in user the fetch below never runs, so "Loading…" would
        // sit there forever.
        <p className="rounded-2xl border border-line bg-surface-2 px-4 py-5 text-center text-sm text-muted">
          Sign in to ask a friend for help.
        </p>
      ) : friends === null ? (
        <p className="py-6 text-center text-xs text-muted">Loading your friends…</p>
      ) : friends.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface-2 px-4 py-5 text-center text-sm text-muted">
          You&apos;re not following anyone yet. Follow a friend first, then ask them
          for help.
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {friends.map((f) => {
            const on = f.id === picked;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(on ? null : f.id)}
                className={`flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl py-2 transition-colors active:scale-95 ${
                  on ? "bg-accent-soft" : ""
                }`}
              >
                <span
                  className={`rounded-full ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
                >
                  <ProfileAvatar
                    profile={{ displayName: f.name, avatarUrl: f.avatar }}
                    size={48}
                  />
                </span>
                <span
                  className={`max-w-full truncate text-xs ${on ? "font-semibold text-accent" : "text-muted"}`}
                >
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What's the occasion?"
        aria-label="What's the occasion"
        rows={3}
        className="w-full resize-none rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-accent focus:bg-surface"
      />

      <p className="mt-3 flex gap-2 px-1 text-xs leading-relaxed text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          {shareable} piece{shareable === 1 ? "" : "s"} will be shared. You can end the
          session at any time, and their access ends with it.
        </span>
      </p>

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-surface px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-[0_0_100px] rounded-xl border border-line bg-surface text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!friend || sending}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-45"
        >
          <Wand2 size={16} />
          {sending ? "Sending…" : friend ? `Ask ${friend.name}` : "Send request"}
        </button>
      </div>
    </BottomSheet>
  );
}
