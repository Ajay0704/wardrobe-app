"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  Check,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Info,
  Luggage,
  Plus,
  RefreshCw,
  Shirt,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { computeInsights } from "@/lib/insights";
import { generateOutfit, outfitScore } from "@/lib/matching";
import { primaryStyleVibe } from "@/lib/profile";
import { forgottenItems } from "@/lib/rediscover";
import { draftItemIds, useWardrobe } from "@/lib/store";
import { todayISO, type Season, type WardrobeItem } from "@/lib/types";
import {
  convertTemp,
  fetchWeatherForPlace,
  weatherIconKey,
  type TempUnit,
  type WeatherIconKey,
  type WeatherSnapshot,
} from "@/lib/weather";

/* ------------------------------------------------------------------ helpers */

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
  sun: "clear skies",
  "cloud-sun": "partly cloudy",
  cloud: "cloudy",
  rain: "rain likely",
  snow: "snow",
  storm: "storms",
  fog: "fog",
};

function WxIcon({ code, size = 18 }: { code: number; size?: number }) {
  const Icon = WX_ICON[weatherIconKey(code)];
  return <Icon size={size} strokeWidth={1.8} />;
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const monthDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** Order items so the 2×2 grid reads top-left→shoes like the reference. */
const SLOT_ORDER: Record<string, number> = {
  top: 0,
  outerwear: 1,
  dress: 1,
  bottom: 2,
  shoes: 3,
  bag: 4,
  accessory: 5,
};

type Suggestion = { key: string; items: WardrobeItem[]; score: number | null };

function buildSuggestions(
  items: WardrobeItem[],
  season: Season | undefined,
  needsOuterwear: boolean,
  vibe: string | undefined,
  seed: number,
  count = 6,
): Suggestion[] {
  const pool = items.filter((it) => !it.wishlist && it.imageUrl);
  if (pool.length < 2) return [];
  const seasonal = season
    ? pool.filter((it) => it.seasons.length === 0 || it.seasons.includes(season))
    : pool;
  const usable = seasonal.length >= 4 ? seasonal : pool;

  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count * 4 && out.length < count; i++) {
    const draft = generateOutfit(usable, {
      season:
        needsOuterwear && season !== "winter" ? ("winter" as Season) : season,
      vibe,
    });
    const ids = draftItemIds(draft);
    if (ids.length < 2) continue;
    const key = ids.slice().sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const chosen = ids
      .map((id) => usable.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];
    chosen.sort(
      (a, b) => (SLOT_ORDER[a.category] ?? 9) - (SLOT_ORDER[b.category] ?? 9),
    );
    out.push({
      key: `${key}#${seed}`,
      items: chosen,
      score: chosen.length >= 2 ? outfitScore(chosen) : null,
    });
  }
  return out;
}

/** Editorial headline for today's look, keyed off the weather. */
function lookTitle(w: WeatherSnapshot | null): string {
  if (!w) return "A look from your closet";
  if (w.needsOuterwear) return "A layered day";
  const c = w.tempC;
  if (c >= 26) return "Keep it light";
  if (c >= 18) return "Easy and breezy";
  if (c >= 10) return "Comfortable layers";
  if (c >= 2) return "Warm and sharp";
  return "Bundle up";
}

/** One-line rationale that weaves the weather into the recommendation. */
function lookRationale(w: WeatherSnapshot | null, unit: TempUnit): string {
  if (!w) return "A fresh look pulled together from what you own.";
  const word = WX_WORD[weatherIconKey(w.weatherCode)];
  const temp = convertTemp(w.tempC, unit);
  const tail = w.needsOuterwear
    ? "Bring a layer for when it cools off."
    : "Light and easy — no jacket needed.";
  return `${temp}°${unit}, ${word}. ${tail}`;
}

/* ------------------------------------------------------------- home screen  */

export function NativeHomeView() {
  const {
    items,
    profile,
    trips,
    calendar,
    setView,
    setAddOpen,
    setDraft,
    logWear,
    saveOutfit,
  } = useWardrobe();
  const [seed, setSeed] = useState(0);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  // Auto-load weather from the saved profile location — no GPS prompt.
  useEffect(() => {
    const loc = profile.location?.trim();
    if (!loc) return;
    let cancelled = false;
    fetchWeatherForPlace(loc)
      .then((w) => !cancelled && setWeather(w))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile.location]);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const vibe = primaryStyleVibe(profile);
  const unit = (profile.temperatureUnit ?? "C") as TempUnit;

  // Stable signature of the styleable pool — ids only. Depending on this
  // instead of the whole `items` array means logging a wear (which mutates
  // wearCount) doesn't reshuffle today's cover look; only Shuffle or a
  // weather change re-rolls it.
  const poolKey = useMemo(
    () =>
      items
        .filter((it) => !it.wishlist && it.imageUrl)
        .map((it) => it.id)
        .join("|"),
    [items],
  );
  // The cover story: a single weather-aware look, re-rolled by Shuffle.
  const cover = useMemo(
    () =>
      buildSuggestions(
        items,
        weather?.season,
        weather?.needsOuterwear ?? false,
        vibe,
        seed,
        1,
      )[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poolKey stands in for items intentionally
    [poolKey, weather, vibe, seed],
  );

  const forgotten = useMemo(() => forgottenItems(owned, 8), [owned]);
  const insights = useMemo(() => computeInsights(items), [items]);

  const today = new Date();
  const tISO = todayISO(today);
  const weekISO: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    weekISO.push(toISO(d));
  }
  const plannedDays = new Set(
    calendar.filter((e) => weekISO.includes(e.date)).map((e) => e.date),
  );
  const styled = plannedDays.size;
  const open = 7 - styled;

  const upcomingTrip = useMemo(
    () =>
      trips
        .filter((t) => (t.endDate ?? t.startDate ?? "") >= tISO)
        .sort((a, b) =>
          (a.startDate ?? a.endDate ?? "").localeCompare(
            b.startDate ?? b.endDate ?? "",
          ),
        )[0] ?? null,
    [trips, tISO],
  );
  const tripRange = (() => {
    if (!upcomingTrip) return "";
    const s = upcomingTrip.startDate ? monthDay(isoToDate(upcomingTrip.startDate)) : null;
    const e = upcomingTrip.endDate ? monthDay(isoToDate(upcomingTrip.endDate)) : null;
    return s && e ? `${s} – ${e}` : s || e || "Upcoming";
  })();

  const hour = today.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (profile.displayName || "").trim().split(/\s+/)[0] || "there";
  const kickerDate = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startY = new Date(today.getFullYear(), 0, 0);
  const issueNo = Math.floor((today.getTime() - startY.getTime()) / 86_400_000);
  const remaining = Math.max(0, 6 - owned.length);

  const openLook = (s: Suggestion) => {
    const draft = {
      top: [] as string[],
      bottom: [] as string[],
      dress: [] as string[],
      outerwear: [] as string[],
      shoes: [] as string[],
      accessories: [] as string[],
    };
    for (const it of s.items) {
      if (it.category === "top") draft.top = [it.id];
      else if (it.category === "bottom") draft.bottom = [it.id];
      else if (it.category === "dress") draft.dress = [it.id];
      else if (it.category === "outerwear") draft.outerwear = [it.id];
      else if (it.category === "shoes") draft.shoes = [it.id];
      else draft.accessories = [...draft.accessories, it.id].slice(0, 3);
    }
    setDraft(draft);
    setView("builder");
  };

  const wearCover = () => {
    if (!cover) return;
    logWear({ itemIds: cover.items.map((it) => it.id), date: tISO });
    flash("Added to today — have a good one");
  };
  const saveCover = () => {
    if (!cover) return;
    saveOutfit(`Look · ${monthDay(today)}`, "", cover.items.map((it) => it.id));
    flash("Saved to your outfits");
  };
  const shuffleCover = () => {
    setSeed((n) => n + 1);
    flash("A different look for today");
  };
  // "Style me" — generate a fresh AI look and open it on the canvas.
  const styleMe = () => {
    const s = buildSuggestions(
      items,
      weather?.season,
      weather?.needsOuterwear ?? false,
      vibe,
      seed + 100,
      1,
    )[0];
    if (s) openLook(s);
    else setView("builder");
  };

  return (
    <div className="pb-8">
      {/* masthead */}
      <div>
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted">
          <span>{kickerDate}</span>
          {weather && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-muted/60" />
              <span className="flex items-center gap-1 normal-case tracking-normal">
                <WxIcon code={weather.weatherCode} size={13} />
                {convertTemp(weather.tempC, unit)}°{unit} · {WX_WORD[weatherIconKey(weather.weatherCode)]}
              </span>
            </>
          )}
        </p>
        <h1 className="mt-2 font-display text-[27px] font-normal leading-tight tracking-tight">
          {part}, {first}
        </h1>
      </div>

      {/* cover story — today's look */}
      <section className="mt-6">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Today&rsquo;s look
        </p>

        {owned.length === 0 || !cover ? (
          <AddMoreCallout remaining={remaining} onAdd={() => setAddOpen(true)} />
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_rgba(28,25,23,0.08)]">
            <div className="relative">
              <button
                type="button"
                aria-label="Open this look"
                onClick={() => openLook(cover)}
                className="block w-full"
              >
                <CoverGrid items={cover.items} />
              </button>
              {weather && (
                <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                  <WxIcon code={weather.weatherCode} size={14} />
                  {convertTemp(weather.tempC, unit)}°{unit}
                </span>
              )}
              <button
                type="button"
                aria-label="Save this look"
                onClick={saveCover}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur"
              >
                <Bookmark size={17} />
              </button>
            </div>

            <div className="p-5">
              <h2 className="font-display text-[22px] font-normal leading-tight">
                {lookTitle(weather)}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {lookRationale(weather, unit)}
              </p>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={wearCover}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground"
                >
                  <Check size={17} /> Wear this today
                </button>
                <button
                  type="button"
                  onClick={shuffleCover}
                  className="flex h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-4 text-sm"
                >
                  <RefreshCw size={16} className="text-muted" /> Shuffle
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* rediscover */}
      {forgotten.length > 0 && (
        <section className="mt-9">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h3 className="font-display text-lg">Rediscover</h3>
            <button
              type="button"
              onClick={() => setView("wardrobe")}
              className="flex items-center gap-1 text-xs text-muted"
            >
              Your closet <ChevronRight size={14} />
            </button>
          </div>
          <div className="-mx-4 flex gap-3.5 overflow-x-auto px-4">
            {forgotten.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setView("wardrobe")}
                className="w-28 shrink-0 text-left"
              >
                <div className="relative h-36 w-28 overflow-hidden rounded-2xl border border-line bg-surface-2">
                  <ItemThumb item={it} contain />
                  <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] text-muted">
                    {(it.wearCount ?? 0) === 0 ? "Not worn" : `Worn ${it.wearCount}×`}
                  </span>
                </div>
                <p className="mt-2 truncate text-[12.5px] leading-tight">{it.name}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Pieces you haven&rsquo;t reached for lately — worth a second look.
          </p>
        </section>
      )}

      {/* this week */}
      <section className="mt-9">
        <h3 className="mb-3.5 font-display text-lg">This week</h3>
        <div className="-mx-4 border-t border-line">
          <ListRow
            icon={CalendarDays}
            title="Plan the week"
            sub={`${styled} day${styled === 1 ? "" : "s"} styled · ${open} open`}
            onClick={() => setView("calendar")}
          />
          {upcomingTrip && (
            <ListRow
              icon={Luggage}
              title={upcomingTrip.name || "Upcoming trip"}
              sub={[upcomingTrip.destination, tripRange].filter(Boolean).join(" · ")}
              onClick={() => setView("travel")}
            />
          )}
          <ListRow
            icon={Activity}
            title="Closet pulse"
            sub={`You've worn ${insights.wornPct}% of your wardrobe`}
            onClick={() => setView("insights")}
          />
        </div>
      </section>

      {/* do more — Style me hero */}
      <section className="mt-9">
        <h3 className="mb-3.5 font-display text-lg">Do more</h3>
        <button
          type="button"
          onClick={styleMe}
          className="flex w-full items-center gap-3.5 rounded-2xl bg-accent p-4 text-left text-accent-foreground"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Sparkles size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Style me</span>
            <span className="block text-xs text-accent-foreground/85">
              Get an AI outfit from your closet
            </span>
          </span>
          <ArrowRight size={20} className="shrink-0" />
        </button>
      </section>

      {/* create */}
      <section className="mt-8">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Create
        </p>
        <div className="-mx-4 border-t border-line">
          <ListRow
            icon={Plus}
            title="Add items"
            sub="Snap or import to your closet"
            onClick={() => setAddOpen(true)}
          />
          <ListRow
            icon={Shirt}
            title="Build an outfit"
            sub="Style pieces on the canvas"
            onClick={() => setView("builder")}
          />
        </div>
      </section>

      {/* explore your closet */}
      <section className="mt-8">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Explore your closet
        </p>
        <div className="-mx-4 border-t border-line">
          <ListRow
            icon={BarChart3}
            title="Style stats"
            sub="See what you actually wear"
            onClick={() => setView("insights")}
          />
          <ListRow
            icon={CalendarDays}
            title="Calendar"
            sub="Plan looks for the week"
            onClick={() => setView("calendar")}
          />
        </div>
      </section>

      <p className="mt-9 text-center font-display text-[11px] uppercase italic tracking-[0.1em] text-muted">
        Your Personal Wardrobe · No. {issueNo}
      </p>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- sub-parts  */

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

/**
 * The cover's look grid — hairline-separated product cells on ivory. Columns
 * adapt to the piece count so there are never empty cells: a dress + shoes
 * reads as a clean 2-up, top/bottom/shoes as a 3-up, a full look as a 2×2.
 */
function CoverGrid({ items }: { items: WardrobeItem[] }) {
  const cells = items.slice(0, 4);
  const cols =
    cells.length >= 4
      ? "grid-cols-2"
      : cells.length === 3
        ? "grid-cols-3"
        : cells.length === 2
          ? "grid-cols-2"
          : "grid-cols-1";
  return (
    <div className={`grid ${cols} gap-px bg-line`}>
      {cells.map((it) => (
        <div key={it.id} className="aspect-square bg-surface">
          <ItemThumb item={it} contain />
        </div>
      ))}
    </div>
  );
}

function ItemThumb({
  item,
  contain,
}: {
  item: WardrobeItem;
  contain?: boolean;
}) {
  const [err, setErr] = useState(false);
  if (err || !item.imageUrl) {
    return <div className="h-full w-full" style={{ background: item.color }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.name}
      onError={() => setErr(true)}
      className={`h-full w-full ${contain ? "object-contain p-2.5" : "object-cover"}`}
    />
  );
}

function AddMoreCallout({
  remaining,
  onAdd,
}: {
  remaining: number;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-start gap-3 rounded-[20px] border border-line bg-surface p-5 text-left"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Info size={16} />
      </span>
      <span>
        <span className="block font-medium">
          {remaining >= 6 ? "Add your first pieces" : `Add ${remaining} more for full looks`}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">
          {remaining >= 6
            ? "Snap or import a few items and your daily look shows up here every morning."
            : `Add ${remaining} more item${remaining === 1 ? "" : "s"} so today's look can be built entirely from your closet.`}
        </span>
      </span>
    </button>
  );
}
