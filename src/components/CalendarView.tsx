"use client";

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useWardrobe } from "@/lib/store";
import type { CalendarEntry, WardrobeItem } from "@/lib/types";
import { formatDisplayDate, todayISO } from "@/lib/types";
import { OutfitPreview } from "./OutfitPreview";
import { Button } from "./ui";

function monthLabel(y: number, m: number) {
  return new Date(y, m, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function CalendarView() {
  const {
    calendar,
    outfits,
    items,
    deleteCalendarEntry,
    planOutfit,
    logWear,
    loadOutfitIntoDraft,
  } = useWardrobe();

  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [planOutfitId, setPlanOutfitId] = useState("");

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of calendar) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [calendar]);

  const resolve = (ids: string[]) =>
    ids
      .map((id) => items.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];

  const selectedEntries = byDate.get(selected) ?? [];
  const dim = daysInMonth(cursor.y, cursor.m);
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay(); // 0 Sun

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const addPlan = () => {
    if (!planOutfitId) return;
    const outfit = outfits.find((o) => o.id === planOutfitId);
    if (!outfit) return;
    planOutfit({
      outfitId: outfit.id,
      itemIds: outfit.itemIds,
      date: selected,
    });
    setPlanOutfitId("");
  };

  const markWornFromPlan = (entry: CalendarEntry) => {
    logWear({
      outfitId: entry.outfitId,
      itemIds: entry.itemIds,
      date: selected,
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="heading text-2xl">Outfit calendar</h2>
        <p className="mt-1 text-sm text-muted">
          Plan looks ahead and see what you&apos;ve worn.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <h3 className="font-medium">{monthLabel(cursor.y, cursor.m)}</h3>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: dim }).map((_, i) => {
              const day = i + 1;
              const iso = `${cursor.y}-${pad2(cursor.m + 1)}-${pad2(day)}`;
              const entries = byDate.get(iso) ?? [];
              const hasWorn = entries.some((e) => e.kind === "worn");
              const hasPlan = entries.some((e) => e.kind === "planned");
              const isSelected = iso === selected;
              const isToday = iso === today;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors ${
                    isSelected
                      ? "bg-foreground text-background"
                      : isToday
                        ? "bg-accent/15 text-foreground"
                        : "hover:bg-surface-2"
                  }`}
                >
                  {day}
                  {(hasWorn || hasPlan) && (
                    <span className="absolute bottom-1.5 flex gap-0.5">
                      {hasWorn && (
                        <span
                          className={`h-1 w-1 rounded-full ${
                            isSelected ? "bg-background" : "bg-emerald-500"
                          }`}
                        />
                      )}
                      {hasPlan && (
                        <span
                          className={`h-1 w-1 rounded-full ${
                            isSelected ? "bg-background/70" : "bg-sky-500"
                          }`}
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-4 flex flex-wrap gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Worn
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Planned
            </span>
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-medium">
              {selected === today ? "Today" : formatDisplayDate(selected)}
            </h3>
            <p className="text-xs text-muted">
              {selectedEntries.length === 0
                ? "Nothing logged yet"
                : `${selectedEntries.length} entr${selectedEntries.length === 1 ? "y" : "ies"}`}
            </p>
          </div>

          {outfits.length > 0 && (
            <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-medium text-muted">Plan an outfit</p>
              <select
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                value={planOutfitId}
                onChange={(e) => setPlanOutfitId(e.target.value)}
              >
                <option value="">Choose saved outfit…</option>
                {outfits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button
                className="w-full !py-2 text-xs"
                disabled={!planOutfitId}
                onClick={addPlan}
              >
                Add to {selected === today ? "today" : formatDisplayDate(selected)}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {selectedEntries.map((entry) => {
              const outfitItems = resolve(entry.itemIds);
              const outfitName = entry.outfitId
                ? outfits.find((o) => o.id === entry.outfitId)?.name
                : undefined;
              return (
                <article
                  key={entry.id}
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  {outfitItems.length > 0 && (
                    <OutfitPreview
                      items={outfitItems}
                      compact
                      showScore={false}
                    />
                  )}
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {outfitName ??
                            (entry.kind === "worn" ? "Worn look" : "Planned look")}
                        </p>
                        <p className="text-[11px] uppercase tracking-wider text-muted">
                          {entry.kind}
                        </p>
                      </div>
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => deleteCalendarEntry(entry.id)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {entry.kind === "planned" && (
                        <Button
                          className="!py-1.5 text-xs"
                          onClick={() => markWornFromPlan(entry)}
                        >
                          Mark worn
                        </Button>
                      )}
                      {entry.outfitId && (
                        <Button
                          variant="outline"
                          className="!py-1.5 text-xs"
                          onClick={() => loadOutfitIntoDraft(entry.outfitId!)}
                        >
                          Open in builder
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
