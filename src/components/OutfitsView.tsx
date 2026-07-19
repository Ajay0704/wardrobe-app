"use client";

import {
  Activity,
  CalendarDays,
  Check,
  ChevronRight,
  Luggage,
  Pencil,
  Plus,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { outfitPayload } from "@/lib/chat";
import { computeInsights } from "@/lib/insights";
import { outfitScore } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import * as Trips from "@/lib/trips";
import type { Outfit, WardrobeItem } from "@/lib/types";
import { formatDisplayDate } from "@/lib/types";
import { ShareToChatSheet } from "./chat/ShareToChatSheet";

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00`);

export function OutfitsView() {
  const {
    outfits,
    items,
    calendar,
    loadOutfitBoardIntoCanvas,
    deleteOutfit,
    logWear,
    setView,
    clearDraft,
  } = useWardrobe();
  const [toast, setToast] = useState<string | null>(null);
  const [shareOutfit, setShareOutfit] = useState<Outfit | null>(null);
  // Trips are server-backed now; load them for the "next trip" planning row.
  const [serverTrips, setServerTrips] = useState<Trips.Trip[]>([]);
  useEffect(() => {
    Trips.listTrips()
      .then(setServerTrips)
      .catch(() => {});
  }, []);

  const resolve = (ids: string[]) =>
    ids
      .map((id) => items.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];

  const scoreOf = (o: Outfit) => {
    const its = resolve(o.itemIds);
    return its.length >= 2 ? outfitScore(its) : null;
  };

  const sorted = useMemo(
    () => [...outfits].sort((a, b) => b.createdAt - a.createdAt),
    [outfits],
  );

  /**
   * The featured look crowns the page: highest match score wins, with
   * wear count then recency as tiebreakers. Falls back to the newest look
   * when nothing is scorable yet.
   */
  const featured = useMemo(() => {
    if (sorted.length === 0) return null;
    return [...sorted].sort((a, b) => {
      const sa = scoreOf(a) ?? -1;
      const sb = scoreOf(b) ?? -1;
      if (sb !== sa) return sb - sa;
      const wa = a.wearCount ?? 0;
      const wb = b.wearCount ?? 0;
      if (wb !== wa) return wb - wa;
      return b.createdAt - a.createdAt;
    })[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, items]);

  const rest = useMemo(
    () => sorted.filter((o) => o.id !== featured?.id),
    [sorted, featured],
  );

  // "This week" — moved here from the retired Home screen (AJA-169). Glanceable
  // planning: how much of the week is styled, the next trip, and closet usage.
  const insights = useMemo(() => computeInsights(items), [items]);
  const tISO = toISO(new Date());
  const weekISO = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push(toISO(d));
    }
    return days;
  }, [tISO]);
  const styled = useMemo(
    () => new Set(calendar.filter((e) => weekISO.includes(e.date)).map((e) => e.date)).size,
    [calendar, weekISO],
  );
  const open = 7 - styled;
  const upcomingTrip = useMemo(
    () =>
      serverTrips
        .filter((t) => (t.endDate ?? t.startDate ?? "") >= tISO)
        .sort((a, b) =>
          (a.startDate ?? a.endDate ?? "").localeCompare(b.startDate ?? b.endDate ?? ""),
        )[0] ?? null,
    [serverTrips, tISO],
  );
  const tripRange = (() => {
    if (!upcomingTrip) return "";
    const s = upcomingTrip.startDate ? monthDay(isoToDate(upcomingTrip.startDate)) : null;
    const e = upcomingTrip.endDate ? monthDay(isoToDate(upcomingTrip.endDate)) : null;
    return s && e ? `${s} – ${e}` : s || e || "Upcoming";
  })();

  const newLook = () => {
    clearDraft();
    setView("builder");
  };

  const wore = (outfitId: string, itemIds: string[]) => {
    logWear({ outfitId, itemIds });
    setToast("Logged as worn today");
    window.setTimeout(() => setToast(null), 2000);
  };

  const editLook = (id: string) => {
    // Restore the saved board layout onto the canvas (falls back to an auto-placed
    // layout for older outfits that predate boards). Opens the builder itself.
    loadOutfitBoardIntoCanvas(id);
  };

  return (
    <div className="pb-6">
      <button
        type="button"
        onClick={newLook}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground"
      >
        <Plus size={17} /> New look
      </button>

      {toast && (
        <p className="mt-4 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
          {toast}
        </p>
      )}

      <ThisWeekSection
        styled={styled}
        open={open}
        trip={upcomingTrip}
        tripRange={tripRange}
        wornPct={insights.wornPct}
        onCalendar={() => setView("calendar")}
        onTravel={() => setView("travel")}
        onInsights={() => setView("insights")}
      />

      {sorted.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
          <h2 className="heading text-lg">No looks yet</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
            Compose your first outfit on the canvas — drag your pieces, arrange
            them, and save the look here.
          </p>
          <button
            type="button"
            onClick={newLook}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground"
          >
            <Plus size={15} /> New look
          </button>
        </div>
      ) : (
        <>
          {featured && (
            <FeaturedLook
              outfit={featured}
              items={resolve(featured.itemIds)}
              score={scoreOf(featured)}
              onWore={() => wore(featured.id, featured.itemIds)}
              onEdit={() => editLook(featured.id)}
              onShare={() => setShareOutfit(featured)}
            />
          )}

          {rest.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {rest.map((outfit) => {
                const outfitItems = resolve(outfit.itemIds);
                const score = scoreOf(outfit);
                return (
                  <article
                    key={outfit.id}
                    className="overflow-hidden rounded-2xl border border-line bg-surface"
                  >
                    <div className="relative">
                      <LookThumb items={outfitItems} />
                      {score !== null && (
                        <span className="absolute right-2 top-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-accent shadow-sm">
                          {score}%
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 p-3">
                      <div>
                        <h3 className="truncate font-medium">{outfit.name}</h3>
                        <p className="mt-0.5 text-xs text-muted">
                          {outfitItems.length} piece
                          {outfitItems.length === 1 ? "" : "s"}
                          {outfit.wearCount ? ` · worn ${outfit.wearCount}×` : ""}
                          {outfit.lastWornAt
                            ? ` · ${formatDisplayDate(outfit.lastWornAt)}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => wore(outfit.id, outfit.itemIds)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-medium text-accent-foreground"
                        >
                          <Check size={13} /> I wore this
                        </button>
                        <button
                          type="button"
                          aria-label="Edit look"
                          onClick={() => editLook(outfit.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-foreground"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Send look"
                          onClick={() => setShareOutfit(outfit)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-foreground"
                        >
                          <Send size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete look"
                          onClick={() => deleteOutfit(outfit.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {shareOutfit && (
        <ShareToChatSheet
          kind="outfit"
          payload={outfitPayload(shareOutfit, resolve(shareOutfit.itemIds))}
          onClose={() => setShareOutfit(null)}
        />
      )}
    </div>
  );
}

/** Glanceable weekly planning rows — plan the week, next trip, closet usage. */
function ThisWeekSection({
  styled,
  open,
  trip,
  tripRange,
  wornPct,
  onCalendar,
  onTravel,
  onInsights,
}: {
  styled: number;
  open: number;
  trip: Trips.Trip | null;
  tripRange: string;
  wornPct: number;
  onCalendar: () => void;
  onTravel: () => void;
  onInsights: () => void;
}) {
  return (
    <section className="mt-6">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        This week
      </p>
      <div className="-mx-4 border-t border-line">
        <ListRow
          icon={CalendarDays}
          title="Plan the week"
          sub={`${styled} day${styled === 1 ? "" : "s"} styled · ${open} open`}
          onClick={onCalendar}
        />
        {trip && (
          <ListRow
            icon={Luggage}
            title={trip.name || "Upcoming trip"}
            sub={[trip.destination, tripRange].filter(Boolean).join(" · ")}
            onClick={onTravel}
          />
        )}
        <ListRow
          icon={Activity}
          title="Closet pulse"
          sub={`You've worn ${wornPct}% of your wardrobe`}
          onClick={onInsights}
        />
      </div>
    </section>
  );
}

function ListRow({
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 border-b border-line px-4 py-4 text-left"
    >
      <span className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
        <Icon size={19} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
  );
}

/** The hero look at the top of the collection. */
function FeaturedLook({
  outfit,
  items,
  score,
  onWore,
  onEdit,
  onShare,
}: {
  outfit: Outfit;
  items: WardrobeItem[];
  score: number | null;
  onWore: () => void;
  onEdit: () => void;
  onShare: () => void;
}) {
  return (
    <article className="mt-5 overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="relative bg-surface-2/60">
        <span className="absolute left-3 top-3 z-10 rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background">
          Featured
        </span>
        {score !== null && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-accent shadow-sm">
            {score}%
          </span>
        )}
        <HeroThumb items={items} />
      </div>

      <div className="flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="heading truncate text-xl">{outfit.name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {items.length} piece{items.length === 1 ? "" : "s"}
            {outfit.wearCount ? ` · worn ${outfit.wearCount}×` : ""}
            {outfit.lastWornAt
              ? ` · ${formatDisplayDate(outfit.lastWornAt)}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onWore}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
          >
            <Check size={15} /> Wore it
          </button>
          <button
            type="button"
            aria-label="Edit look"
            onClick={onEdit}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-foreground"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            aria-label="Send look"
            onClick={onShare}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-foreground"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

/** Large canvas-style board for the featured look. */
function HeroThumb({ items }: { items: WardrobeItem[] }) {
  const cells = items.slice(0, 4);
  if (cells.length <= 1) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center p-8">
        {cells[0] && <ThumbImg item={cells[0]} />}
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/3] grid-cols-2 gap-3 p-6">
      {cells.map((it) => (
        <div
          key={it.id}
          className="flex items-center justify-center overflow-hidden"
        >
          <ThumbImg item={it} />
        </div>
      ))}
    </div>
  );
}

/** Compact canvas-style thumbnail — item cutouts on a soft board. */
function LookThumb({ items }: { items: WardrobeItem[] }) {
  const cells = items.slice(0, 4);
  if (cells.length <= 1) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center bg-surface-2/50 p-5">
        {cells[0] && <ThumbImg item={cells[0]} />}
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/5] grid-cols-2 gap-1 bg-surface-2/50 p-2">
      {cells.map((it) => (
        <div key={it.id} className="flex items-center justify-center overflow-hidden">
          <ThumbImg item={it} />
        </div>
      ))}
    </div>
  );
}

function ThumbImg({ item }: { item: WardrobeItem }) {
  const [err, setErr] = useState(false);
  if (err || !item.imageUrl) {
    return <div className="h-full w-full rounded-lg" style={{ background: item.color }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.name}
      onError={() => setErr(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}
