"use client";

import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LayoutGrid,
  Plus,
  Shuffle,
  Sparkles,
  Sun,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { generateOutfit, outfitScore } from "@/lib/matching";
import { draftItemIds, useWardrobe } from "@/lib/store";
import {
  formatDisplayDate,
  todayISO,
  type CalendarEntry,
  type Season,
  type WardrobeItem,
} from "@/lib/types";
import {
  convertTemp,
  fetchWeatherForPlace,
  weatherIconKey,
  type TempUnit,
  type WeatherIconKey,
  type WeatherSnapshot,
} from "@/lib/weather";

const SAGE = "#7c8a6f";

const WX_ICON: Record<WeatherIconKey, LucideIcon> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  fog: CloudFog,
};
const WX_WORD: Record<WeatherIconKey, string> = {
  sun: "clear",
  "cloud-sun": "partly cloudy",
  cloud: "cloudy",
  rain: "rain likely",
  snow: "snow",
  storm: "storms",
  fog: "fog",
};

/** Order pieces top→shoes for the mini grids. */
const CAT_ORDER: Record<string, number> = {
  outerwear: 0, dress: 1, top: 2, bottom: 3, shoes: 4, bag: 5, accessory: 6,
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = (iso: string) => new Date(`${iso}T00:00:00`);
const addDays = (iso: string, n: number) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
/** Monday-first offset for a JS weekday (0=Sun). */
const monFirst = (dow: number) => (dow + 6) % 7;

function weekOf(iso: string): string[] {
  const d = parseISO(iso);
  const start = addDays(iso, -monFirst(d.getDay()));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function currentSeason(): Season {
  const m = new Date().getMonth();
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}

const DOW_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView() {
  const {
    calendar, outfits, items, profile,
    planOutfit, logWear, deleteCalendarEntry, loadOutfitIntoDraft, setDraft, setView,
  } = useWardrobe();

  const today = todayISO();
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<"week" | "month">("week");
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const unit = (profile.temperatureUnit ?? "C") as TempUnit;

  useEffect(() => {
    const loc = profile.location?.trim();
    if (!loc) return;
    let alive = true;
    fetchWeatherForPlace(loc).then((w) => alive && setWeather(w)).catch(() => {});
    return () => { alive = false; };
  }, [profile.location]);

  const owned = useMemo(() => items.filter((it) => !it.wishlist && it.imageUrl), [items]);
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
    ids.map((id) => items.find((it) => it.id === id)).filter(Boolean) as WardrobeItem[];
  const sortLook = (its: WardrobeItem[]) =>
    [...its].sort((a, b) => (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9));

  const entriesFor = (iso: string) => byDate.get(iso) ?? [];
  const primaryEntry = (iso: string): CalendarEntry | null => {
    const es = entriesFor(iso);
    return es.find((e) => e.kind === "worn") ?? es.find((e) => e.kind === "planned") ?? null;
  };
  const stateFor = (iso: string): "worn" | "planned" | "empty" => primaryEntry(iso)?.kind ?? "empty";

  const recent = useMemo(
    () =>
      calendar
        .filter((e) => e.kind === "worn")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    [calendar],
  );

  const season = weather?.season ?? currentSeason();

  /** Best-of-N generated look → item ids. */
  const genLook = (): string[] => {
    let best: string[] | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 6; i++) {
      const ids = draftItemIds(generateOutfit(owned, { season }));
      const chosen = resolve(ids);
      if (chosen.length < 2) continue;
      const s = outfitScore(chosen) + (chosen.some((c) => c.category === "shoes") ? 0.15 : 0);
      if (s > bestScore) { bestScore = s; best = ids; }
    }
    return best ?? draftItemIds(generateOutfit(owned, { season }));
  };

  const toDraft = (its: WardrobeItem[]) => {
    const d = { top: [] as string[], bottom: [] as string[], dress: [] as string[], outerwear: [] as string[], shoes: [] as string[], accessories: [] as string[] };
    for (const it of its) {
      if (it.category === "top") d.top = [it.id];
      else if (it.category === "bottom") d.bottom = [it.id];
      else if (it.category === "dress") d.dress = [it.id];
      else if (it.category === "outerwear") d.outerwear = [it.id];
      else if (it.category === "shoes") d.shoes = [it.id];
      else d.accessories = [...d.accessories, it.id].slice(0, 3);
    }
    return d;
  };

  // ---- actions ----
  const styleMe = (iso: string) => {
    const ids = genLook();
    if (ids.length) planOutfit({ itemIds: ids, date: iso });
  };
  const reshuffle = (iso: string) => {
    for (const e of entriesFor(iso)) if (e.kind === "planned") deleteCalendarEntry(e.id);
    const ids = genLook();
    if (ids.length) planOutfit({ itemIds: ids, date: iso });
  };
  const wearEntry = (e: CalendarEntry, iso: string) =>
    logWear({ outfitId: e.outfitId, itemIds: e.itemIds, date: iso });
  const swap = (e: CalendarEntry) => {
    if (e.outfitId) loadOutfitIntoDraft(e.outfitId);
    else { setDraft(toDraft(resolve(e.itemIds))); setView("builder"); }
  };
  const planSaved = (outfitId: string) => {
    const o = outfits.find((x) => x.id === outfitId);
    if (o) planOutfit({ outfitId: o.id, itemIds: o.itemIds, date: selected });
    setPlanOpen(false);
  };

  const week = weekOf(selected);
  const shiftWeek = (n: number) => setSelected((s) => addDays(s, n * 7));
  const monthLabel = parseISO(selected).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dayTitle =
    selected === today ? "Today" : parseISO(selected).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-2xl pb-4">
      {/* control row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous" onClick={() => (mode === "week" ? shiftWeek(-1) : setSelected((s) => addDays(s, -28)))} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-medium">{monthLabel}</span>
          <button type="button" aria-label="Next" onClick={() => (mode === "week" ? shiftWeek(1) : setSelected((s) => addDays(s, 28)))} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2">
            <ChevronRight size={18} />
          </button>
        </div>
        <button type="button" onClick={() => setMode((m) => (m === "week" ? "month" : "week"))} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted">
          <LayoutGrid size={13} /> {mode === "week" ? "Month" : "Week"}
        </button>
      </div>

      {mode === "month" ? (
        <MonthGrid selected={selected} today={today} stateFor={stateFor} onPick={(iso) => { setSelected(iso); setMode("week"); }} />
      ) : (
        <>
          {/* week strip */}
          <div className="mt-4 flex">
            {week.map((iso, i) => {
              const on = iso === selected;
              const isToday = iso === today;
              const st = stateFor(iso);
              return (
                <button key={iso} type="button" onClick={() => setSelected(iso)} className="flex-1 text-center">
                  <div className={`text-[11px] ${on || isToday ? "text-accent" : "text-muted"}`}>{DOW_LABEL[i]}</div>
                  <div className={`mx-auto mt-1.5 flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${on ? "bg-accent text-accent-foreground" : "text-foreground"}`}>
                    {parseISO(iso).getDate()}
                  </div>
                  <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${st === "worn" ? "bg-accent" : st === "planned" ? "bg-accent/40" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>

          {/* day card */}
          <div className="mt-5">
            <DayCard
              iso={selected}
              title={dayTitle}
              entry={primaryEntry(selected)}
              state={stateFor(selected)}
              items={items}
              outfits={outfits}
              weather={selected === today ? weather : null}
              unit={unit}
              sortLook={sortLook}
              resolve={resolve}
              onWear={wearEntry}
              onShuffle={reshuffle}
              onSwap={swap}
              onStyleMe={styleMe}
              onPlan={() => setPlanOpen(true)}
              onDelete={deleteCalendarEntry}
            />
          </div>

          {/* recently worn */}
          {recent.length > 0 && (
            <div className="mt-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted">Recently worn</p>
              <div className="-mx-4 mt-2.5 flex gap-2.5 overflow-x-auto px-4">
                {recent.map((e) => {
                  const first = resolve(e.itemIds)[0];
                  return (
                    <button key={e.id} type="button" onClick={() => setSelected(e.date)} className="w-16 shrink-0 text-left">
                      <div className="h-20 w-16 overflow-hidden rounded-xl border border-line bg-surface-2">
                        <ItemThumb item={first} />
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted">
                        {parseISO(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* plan-a-look sheet */}
      {planOpen && (
        <div className="native-sheet-backdrop" onClick={() => setPlanOpen(false)} role="presentation">
          <div className="native-sheet max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plan a look">
            <div className="native-sheet-handle" />
            <div className="flex items-center justify-between pb-1">
              <h2 className="heading text-lg">Plan a look</h2>
              <button type="button" aria-label="Close" onClick={() => setPlanOpen(false)} className="p-1 text-muted"><X size={20} /></button>
            </div>
            <p className="pb-3 text-sm text-muted">For {selected === today ? "today" : formatDisplayDate(selected)}.</p>
            {outfits.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No saved outfits yet — try “Style me”.</p>
            ) : (
              <div className="space-y-2">
                {outfits.map((o) => (
                  <button key={o.id} type="button" onClick={() => planSaved(o.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left">
                    <div className="flex gap-1">
                      {sortLook(resolve(o.itemIds)).slice(0, 3).map((it) => (
                        <div key={it.id} className="h-11 w-9 overflow-hidden rounded-md bg-surface-2"><ItemThumb item={it} /></div>
                      ))}
                    </div>
                    <span className="flex-1 truncate text-sm font-medium">{o.name}</span>
                    <Plus size={16} className="text-accent" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DayCard({
  iso, title, entry, state, items, outfits, weather, unit, sortLook, resolve,
  onWear, onShuffle, onSwap, onStyleMe, onPlan, onDelete,
}: {
  iso: string; title: string; entry: CalendarEntry | null; state: "worn" | "planned" | "empty";
  items: WardrobeItem[]; outfits: { id: string; name: string }[]; weather: WeatherSnapshot | null; unit: TempUnit;
  sortLook: (its: WardrobeItem[]) => WardrobeItem[]; resolve: (ids: string[]) => WardrobeItem[];
  onWear: (e: CalendarEntry, iso: string) => void; onShuffle: (iso: string) => void; onSwap: (e: CalendarEntry) => void;
  onStyleMe: (iso: string) => void; onPlan: () => void; onDelete: (id: string) => void;
}) {
  const wx = weather ? weatherIconKey(weather.weatherCode) : null;
  const WxIcon = wx ? WX_ICON[wx] : null;
  const look = entry ? sortLook(resolve(entry.itemIds)) : [];
  const name = entry?.outfitId ? outfits.find((o) => o.id === entry.outfitId)?.name : undefined;

  const header = (
    <div className="flex items-baseline justify-between">
      <span className="text-lg font-semibold">{title}</span>
      {WxIcon && weather && (
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <WxIcon size={15} /> {Math.round(convertTemp(weather.tempC, unit))}°{unit} · {WX_WORD[wx!]}
        </span>
      )}
    </div>
  );

  if (state === "empty" || !entry) {
    return (
      <div>
        {header}
        <div className="mt-3 rounded-2xl border border-dashed border-line/80 p-6 text-center">
          <p className="text-sm text-muted">Nothing planned for this day.</p>
          <div className="mt-3.5 flex gap-2">
            <button type="button" onClick={() => onStyleMe(iso)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-foreground">
              <Sparkles size={15} /> Style me
            </button>
            <button type="button" onClick={onPlan} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium">
              <Plus size={15} /> Plan a look
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cols =
    look.length >= 4 ? "grid-cols-2" : look.length === 3 ? "grid-cols-3" : look.length === 2 ? "grid-cols-2" : "grid-cols-1";
  const grid = (onSage: boolean) => (
    <div className={`grid gap-2 ${cols}`}>
      {look.slice(0, 4).map((it) => (
        <div key={it.id} className={`aspect-square overflow-hidden rounded-xl ${onSage ? "bg-white/15" : "bg-surface-2"}`}>
          <ItemThumb item={it} contain />
        </div>
      ))}
    </div>
  );

  if (state === "worn") {
    return (
      <div>
        {header}
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <Check size={12} /> Worn{name ? ` · ${name}` : ""}
        </span>
        <div className="mt-2.5 rounded-2xl border border-line bg-surface p-3.5">
          {grid(false)}
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={() => onSwap(entry)} className="flex items-center gap-1.5 text-sm font-medium text-accent">
              <ArrowRightLeft size={14} /> Open in builder
            </button>
            <button type="button" aria-label="Remove" onClick={() => onDelete(entry.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><Trash2 size={15} /></button>
          </div>
        </div>
      </div>
    );
  }

  // planned
  return (
    <div>
      {header}
      <span className="mt-2 inline-block rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
        Planned{name ? ` · ${name}` : ""}
      </span>
      <div className="mt-2.5 rounded-2xl p-3.5 text-white" style={{ background: SAGE }}>
        {grid(true)}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onShuffle(iso)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/15 py-2.5 text-sm font-medium">
            <Shuffle size={15} /> Shuffle
          </button>
          <button type="button" onClick={() => onWear(entry, iso)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-medium" style={{ color: "#465a3b" }}>
            <Check size={15} /> Wear this
          </button>
        </div>
        <button type="button" onClick={() => onSwap(entry)} className="mt-2.5 block w-full text-center text-xs text-white/90">Swap a piece</button>
      </div>
    </div>
  );
}

function MonthGrid({
  selected, today, stateFor, onPick,
}: {
  selected: string; today: string; stateFor: (iso: string) => "worn" | "planned" | "empty"; onPick: (iso: string) => void;
}) {
  const d = parseISO(selected);
  const y = d.getFullYear();
  const m = d.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const firstDow = monFirst(new Date(y, m, 1).getDay());
  return (
    <div className="mt-4">
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted">
        {DOW_LABEL.map((l) => <div key={l} className="py-1">{l[0]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: dim }).map((_, i) => {
          const day = i + 1;
          const iso = `${y}-${pad2(m + 1)}-${pad2(day)}`;
          const st = stateFor(iso);
          const on = iso === selected;
          const isToday = iso === today;
          return (
            <button key={iso} type="button" onClick={() => onPick(iso)} className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm ${on ? "bg-accent text-accent-foreground" : isToday ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
              {day}
              {st !== "empty" && <span className={`absolute bottom-1.5 h-1 w-1 rounded-full ${on ? "bg-accent-foreground" : st === "worn" ? "bg-accent" : "bg-accent/40"}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ItemThumb({ item, contain }: { item?: WardrobeItem; contain?: boolean }) {
  const [err, setErr] = useState(false);
  if (!item) return <div className="h-full w-full bg-surface-2" />;
  if (err || !item.imageUrl) return <div className="h-full w-full" style={{ background: item.color }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.imageUrl} alt={item.name} onError={() => setErr(true)} className={`h-full w-full ${contain ? "object-contain p-1.5" : "object-cover"}`} />;
}
