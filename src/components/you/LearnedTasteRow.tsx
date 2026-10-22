"use client";
/**
 * AJA-300 — "What I've learned": the taste loop, readable and undoable.
 *
 * Since AJA-299 a Colours flag or a colour swap can teach a bad pair, and a bad pair
 * is a HARD filter: those two pieces are never suggested together again. The canvas
 * toast names it once and then it's invisible, so a wrong guess would quietly cost
 * you a pairing for good. This row is where it stays visible and can be taken back.
 *
 * Taste lives in localStorage (per device), not the store, so the row keeps its own
 * copy: re-read on open, replaced by whatever each write returns.
 */
import { Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import { useWardrobe } from "@/lib/store";
import {
  learnedBadPairs,
  readTaste,
  removeBadPair,
  resetTaste,
  type TasteState,
} from "@/lib/taste";
import type { WardrobeItem } from "@/lib/types";
import { Row, Sheet } from "./settings-ui";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function LearnedTasteRow() {
  const items = useWardrobe((s) => s.items);
  const [taste, setTaste] = useState<TasteState>(() => readTaste());
  const [open, setOpen] = useState(false);
  const pairs = useMemo(() => learnedBadPairs(taste, items), [taste, items]);
  const looks = taste.likedCount + taste.dislikedCount;

  return (
    <>
      <Row
        icon={Lightbulb}
        label="What I've learned"
        // The pairs lead because they're the part that can go wrong: a like only
        // nudges the order, a pair rules a combination out.
        value={pairs.length ? plural(pairs.length, "pair") : looks ? plural(looks, "look") : "Nothing yet"}
        onClick={() => {
          setTaste(readTaste());
          setOpen(true);
        }}
        chevron
      />
      <Sheet open={open} title="What I've learned" onClose={() => setOpen(false)}>
        {/* Gated on `open` so a dismissed reset confirm isn't still armed next time. */}
        {open && <LearnedSheet taste={taste} pairs={pairs} onChange={setTaste} />}
      </Sheet>
    </>
  );
}

function LearnedSheet({
  taste,
  pairs,
  onChange,
}: {
  taste: TasteState;
  pairs: [WardrobeItem, WardrobeItem][];
  onChange: (t: TasteState) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const { likedCount: liked, dislikedCount: disliked } = taste;
  const anything = liked + disliked + pairs.length > 0;
  const learnedFrom = [
    liked && `${plural(liked, "look")} you saved, wore or liked`,
    disliked && `${liked ? disliked : plural(disliked, "look")} you passed on`,
  ].filter(Boolean);

  return (
    <div className="space-y-4 pt-1">
      {/* A colour swap teaches a pair and no like/dislike, so pairs-only is a real
          state — and "Nothing yet" above a list of pairs reads as a bug. */}
      {(learnedFrom.length > 0 || !anything) && (
        <p className="text-sm leading-relaxed text-muted">
          {learnedFrom.length
            ? `From ${learnedFrom.join(", and ")}. That nudges which suggestions come first, on this device.`
            : "Nothing yet. Save, wear or flag a few looks and suggestions start leaning your way."}
        </p>
      )}

      <section className="space-y-1.5">
        <p className="px-1 text-xs font-medium text-muted">Pieces I won&rsquo;t put together</p>
        {pairs.length ? (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {pairs.map(([a, b]) => (
              <li
                key={`${a.id}|${b.id}`}
                className="flex items-center gap-3 px-3 py-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line"
              >
                <span className="flex shrink-0 -space-x-2">
                  <Thumb item={a} />
                  <Thumb item={b} />
                </span>
                <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug">
                  {a.name} <span className="text-muted">with</span> {b.name}
                </p>
                <button
                  type="button"
                  onClick={() => onChange(removeBadPair(a.id, b.id))}
                  aria-label={`Remove ${a.name} with ${b.name}`}
                  className="min-h-10 shrink-0 rounded-full border border-line px-3.5 text-[13px] font-medium transition-transform active:scale-95"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-3.5 py-3 text-sm text-muted">
            None yet. When you flag a look&rsquo;s colours, or swap a piece because of its colour,
            I&rsquo;ll note the pair here.
          </p>
        )}
        {pairs.length > 0 && (
          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            Suggestions never pair these. Remove one and it can come back.
          </p>
        )}
      </section>

      {anything &&
        (confirm ? (
          <div className="animate-fade-up rounded-2xl border border-red-200 p-4 text-center">
            <p className="text-sm font-medium">Reset what I&rsquo;ve learned?</p>
            <p className="mt-1 text-xs text-muted">
              Suggestions go back to the defaults on this device. Your closet and saved
              looks aren&rsquo;t touched.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl border border-line py-2.5 text-sm transition-transform active:scale-[0.97]"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirm(false);
                  onChange(resetTaste());
                }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white transition-transform active:scale-[0.97]"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="w-full rounded-xl py-2.5 text-sm font-medium text-red-600 transition-colors active:bg-red-500/10"
          >
            Reset what I&rsquo;ve learned
          </button>
        ))}
    </div>
  );
}

/** Cut-outs, so contain on a soft tile; the ring separates the overlapping pair. */
function Thumb({ item }: { item: WardrobeItem }) {
  const [err, setErr] = useState(false);
  return (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] bg-surface-2 ring-2 ring-surface">
      {item.imageUrl && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          onError={() => setErr(true)}
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <span className="h-full w-full" style={{ backgroundColor: item.color }} />
      )}
    </span>
  );
}
