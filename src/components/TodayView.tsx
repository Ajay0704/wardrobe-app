"use client";

import { CloudSun, RefreshCw, Shirt } from "lucide-react";
import { useMemo, useState } from "react";
import { generateOutfit, outfitScore } from "@/lib/matching";
import { draftItemIds, useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import { fetchLocalWeather, type WeatherSnapshot } from "@/lib/weather";
import { OutfitPreview } from "./OutfitPreview";
import { Button, EmptyState, MatchBadge } from "./ui";

type Suggestion = {
  key: string;
  itemIds: string[];
  items: WardrobeItem[];
  score: number | null;
};

function filterForWeather(
  items: WardrobeItem[],
  weather: WeatherSnapshot | null,
): WardrobeItem[] {
  const owned = items.filter((it) => !it.wishlist && it.imageUrl);
  if (!weather) return owned;

  const season = weather.season;
  const seasonal = owned.filter(
    (it) => it.seasons.length === 0 || it.seasons.includes(season),
  );
  const pool = seasonal.length >= 4 ? seasonal : owned;

  if (!weather.needsOuterwear) {
    // Prefer looks without forcing coats when it's warm/dry.
    return pool;
  }
  return pool;
}

function buildSuggestions(
  pool: WardrobeItem[],
  season: Season | undefined,
  needsOuterwear: boolean,
  count = 3,
): Suggestion[] {
  if (pool.length < 2) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 4 && out.length < count; i++) {
    const draft = generateOutfit(pool, {
      season,
      // Bias outerwear when cold/wet by treating as winter-ish.
      ...(needsOuterwear && season !== "winter" ? { season: "winter" as Season } : {}),
    });
    const itemIds = draftItemIds(draft);
    if (itemIds.length < 2) continue;
    const key = itemIds.slice().sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const items = itemIds
      .map((id) => pool.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];
    out.push({
      key,
      itemIds,
      items,
      score: items.length >= 2 ? outfitScore(items) : null,
    });
  }
  return out;
}

export function TodayView() {
  const { items, logWear, setDraft, setView, saveOutfit } = useWardrobe();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [seed, setSeed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Weather is opt-in: we only ask for location when the user taps "Use my
  // location", so landing on Today never triggers a surprise permission prompt.
  const loadWeather = () => {
    setLoadingWeather(true);
    setWeatherError(null);
    fetchLocalWeather()
      .then((w) => {
        setWeather(w);
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

  const pool = useMemo(
    () => filterForWeather(items, weather),
    [items, weather],
  );

  const suggestions = useMemo(
    () =>
      buildSuggestions(
        pool,
        weather?.season,
        weather?.needsOuterwear ?? false,
        3,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed forces reshuffle
    [pool, weather, seed],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const wearIt = (s: Suggestion) => {
    logWear({ itemIds: s.itemIds });
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
    flash("Saved to Outfits");
  };

  if (items.filter((it) => !it.wishlist).length < 2) {
    return (
      <EmptyState
        title="Add a few pieces first"
        subtitle="Upload at least two owned items so we can suggest outfits for today."
        action={
          <Button onClick={() => setView("wardrobe")}>
            <Shirt size={15} /> Open wardrobe
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="heading text-2xl sm:text-3xl">What to wear today</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <CloudSun size={16} className="shrink-0" />
            {loadingWeather
              ? "Checking the weather…"
              : weather
                ? weather.label
                : weatherError
                  ? "Weather off — showing season-agnostic picks"
                  : "Season-agnostic picks — add weather for local suggestions"}
          </p>
        </div>
        <div className="flex gap-2">
          {!weather && !loadingWeather && (
            <Button
              variant="outline"
              onClick={loadWeather}
              className="!py-2 text-xs"
            >
              <CloudSun size={14} /> Use my location
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
                      {s.items.map((it) => it.name).join(" · ")}
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
