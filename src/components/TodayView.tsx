"use client";

import { CloudSun, RefreshCw, Shirt } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lookReasonLine, suggestLooks } from "@/lib/matching";
import {
  habitLabel,
  readHabitWeek,
  recordAppOpen,
  type HabitWeek,
} from "@/lib/habit";
import { primaryStyleVibe } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { readTaste } from "@/lib/taste";
import { resolveStyleContext, type ResolvedContext } from "@/lib/style-context";
import type { WardrobeItem } from "@/lib/types";
import {
  cacheWeather,
  fetchLocalWeather,
  fetchWeatherForPlace,
  readCachedWeather,
  type WeatherSnapshot,
} from "@/lib/weather";
import { OutfitPreview } from "./OutfitPreview";
import { Button, EmptyState, MatchBadge } from "./ui";

type Suggestion = {
  key: string;
  itemIds: string[];
  items: WardrobeItem[];
  score: number | null;
  reason?: string;
};

function buildSuggestions(
  pool: WardrobeItem[],
  // AJA-258: the RESOLVED context, not the raw forecast. The weather card above
  // still shows the real forecast — overriding what it displays would be lying
  // about the weather; this only changes what the engine is told.
  ctx: ResolvedContext,
  vibe: string | undefined,
  count = 3,
): Suggestion[] {
  if (pool.length < 2) return [];
  return suggestLooks(pool, {
    vibe: ctx.vibe ?? vibe,
    occasion: ctx.occasion ?? "today",
    mood: vibe || "everyday",
    weather: ctx.weather,
    season: ctx.season,
    taste: typeof window !== "undefined" ? readTaste() : undefined,
    count,
    candidates: count * 8,
  }).map((look) => ({
    key: look.itemIds.slice().sort().join("|"),
    itemIds: look.itemIds,
    items: look.items,
    score: look.score,
    reason: lookReasonLine(look),
  }));
}

export function TodayView() {
  const { items, logWear, setDraft, setView, saveOutfit, profile, openSplit } =
    useWardrobe();
  const styleContext = useWardrobe((s) => s.styleContext); // AJA-258
  // Show the last known forecast instantly, then refresh below.
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() =>
    readCachedWeather(),
  );
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  // The city we've already auto-loaded, so we don't refetch on every render.
  const autoLoadedCity = useRef<string | null>(null);
  const [seed, setSeed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [habit, setHabit] = useState<HabitWeek>(() => readHabitWeek());

  useEffect(() => {
    setHabit(recordAppOpen());
  }, []);

  // Weather is opt-in: we only ask for location when the user taps "Use my
  // location", so landing on Today never triggers a surprise permission prompt.
  const loadWeather = () => {
    setLoadingWeather(true);
    setWeatherError(null);
    fetchLocalWeather({ fallbackPlace: profile.location })
      .then((w) => {
        setWeather(w);
        cacheWeather(w);
        setWeatherError(null);
      })
      .catch((err) => {
        setWeather(null);
        setWeatherError(
          err instanceof Error ? err.message : "Weather unavailable",
        );
      })
      .finally(() => setLoadingWeather(false));
  };

  // Auto-load the forecast from the saved city — no GPS prompt — so Today shows
  // weather without a manual tap. "Use my location" still refines it via GPS.
  useEffect(() => {
    const city = profile.location?.trim();
    if (!city || autoLoadedCity.current === city) return;
    autoLoadedCity.current = city;
    let alive = true;
    fetchWeatherForPlace(city)
      .then((w) => {
        if (!alive) return;
        setWeather(w);
        cacheWeather(w);
        setWeatherError(null);
      })
      .catch(() => {
        /* keep whatever we already show (cached / none) */
      });
    return () => {
      alive = false;
    };
  }, [profile.location]);

  const pool = useMemo(
    () => items.filter((it) => !it.wishlist && it.imageUrl),
    [items],
  );

  const styleVibe = primaryStyleVibe(profile);

  // AJA-258 — one resolver decides what "right now" means; `weather` stays the
  // real forecast for the card above it.
  const resolved = useMemo(
    () => resolveStyleContext(styleContext, weather, profile.styleOccasions?.[0]),
    [styleContext, weather, profile.styleOccasions],
  );

  const suggestions = useMemo(
    () => buildSuggestions(pool, resolved, styleVibe, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed forces reshuffle
    [pool, resolved, seed, styleVibe],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const wearIt = (s: Suggestion) => {
    logWear({ itemIds: s.itemIds });
    setHabit(readHabitWeek());
    flash("Logged — worn today");
  };

  const openInBuilder = (s: Suggestion) => {
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

  const saveLook = (s: Suggestion, index: number) => {
    const label = weather
      ? `${weather.season[0].toUpperCase()}${weather.season.slice(1)} look ${index + 1}`
      : `Today's look ${index + 1}`;
    saveOutfit(label, weather?.label ?? "", s.itemIds);
    setHabit(readHabitWeek());
    flash("Saved to Outfits");
  };

  const owned = items.filter((it) => !it.wishlist);
  const ownedCount = owned.length;
  const needForLook = 2;
  const remaining = Math.max(0, needForLook - ownedCount);

  if (ownedCount < needForLook) {
    const snapshot = profile.styleSnapshot;
    return (
      <div className="mx-auto max-w-lg space-y-6 py-6">
        {snapshot && (
          <div className="rounded-2xl border border-line bg-surface-2/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Your style
            </p>
            <p className="mt-0.5 font-medium text-foreground">{snapshot}</p>
          </div>
        )}
        <div className="space-y-3 text-center sm:text-left">
          <h2 className="heading text-2xl sm:text-3xl">
            {ownedCount === 0
              ? "Add what you'd wear this week"
              : "One more piece for a look"}
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            {ownedCount === 0
              ? "Don't catalog your closet. Two owned pieces unlock today's suggestions — a top and bottoms (or a dress) is enough."
              : `You have ${ownedCount}. Add ${remaining} more owned piece${remaining === 1 ? "" : "s"} and we'll suggest outfits.`}
          </p>
          <p className="text-xs text-muted">
            {ownedCount}/{needForLook} for your first look
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button onClick={() => openSplit()}>
            <Shirt size={15} />{" "}
            {ownedCount === 0 ? "Add a piece" : "Add another piece"}
          </Button>
          <Button variant="outline" onClick={() => setView("wardrobe")}>
            Open closet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-line bg-surface-2/50 px-4 py-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          This week
        </p>
        <p className="mt-0.5 text-foreground">{habitLabel(habit)}</p>
        <p className="mt-1 text-xs text-muted">
          Coming back weekly is the goal — open Today, save a look, or log a wear.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="heading text-2xl sm:text-3xl">What to wear today</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <CloudSun size={16} className="shrink-0" />
            {loadingWeather
              ? "Checking the weather…"
              : weather
                ? weather.label
                : "Season-agnostic picks — add weather for local suggestions"}
          </p>
          {weatherError && !weather && !loadingWeather && (
            <p className="mt-2 max-w-md text-xs text-amber-700 dark:text-amber-400">
              {weatherError}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!loadingWeather && (
            <Button
              variant="outline"
              onClick={loadWeather}
              className="!py-2 text-xs"
            >
              <CloudSun size={14} />{" "}
              {weather ? "Refresh weather" : "Use my location"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setSeed((n) => n + 1)}
            className="!py-2 text-xs"
          >
            <RefreshCw size={14} /> Shuffle
          </Button>
        </div>
      </div>

      {toast && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          {toast}
        </p>
      )}

      {suggestions.length === 0 ? (
        <EmptyState
          title="Not enough pieces for this weather"
          subtitle="Add more seasonal items, or open the builder to mix manually."
          action={
            <Button onClick={() => setView("builder")}>Open builder</Button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((s, i) => (
            <article
              key={s.key}
              className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <OutfitPreview items={s.items} compact showScore={false} />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">Look {i + 1}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                      {s.reason || s.items.map((it) => it.name).join(" · ")}
                    </p>
                  </div>
                  {s.score !== null && <MatchBadge score={s.score} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="flex-1 !py-1.5 text-xs"
                    onClick={() => wearIt(s)}
                  >
                    I wore this
                  </Button>
                  <Button
                    variant="outline"
                    className="!py-1.5 text-xs"
                    onClick={() => openInBuilder(s)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="!py-1.5 text-xs"
                    onClick={() => saveLook(s, i)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
