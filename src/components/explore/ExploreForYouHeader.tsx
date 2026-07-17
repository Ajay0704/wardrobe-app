"use client";

import { ChevronRight, Plus, Recycle, ScanFace, Shuffle, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EXPLORE_FEATURES } from "@/lib/explore/foundation";
import { computeInsights } from "@/lib/insights";
import { generateOutfit } from "@/lib/matching";
import { resaleSummary } from "@/lib/resale";
import { draftItemIds, useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import type { TryOnGarment } from "@/lib/tryon";
import {
  convertTemp,
  fetchWeatherForPlace,
  type TempUnit,
  type WeatherSnapshot,
} from "@/lib/weather";
import { ResaleView } from "./ResaleView";
import { TryOnView } from "./TryOnView";

/**
 * Explore → "For you" header (AJA-156, Phase 1 of the Explore redesign).
 *
 * The closet-aware daily layer that gives a reason to open the app: a weather-
 * aware outfit-of-the-day built from the user's OWN closet, occasion chips that
 * re-generate it (Work / Date / Event / Trip), an Ask-your-stylist entry, and a
 * Wardrobe Wrapped recap. All reuse existing engines — generateOutfit, weather,
 * computeInsights — and the builder (setDraft → builder) and Stylist for actions.
 */

const OCCASIONS = [
  { key: "today", label: "Today", vibe: undefined },
  { key: "work", label: "Work", vibe: "work" },
  { key: "date", label: "Date", vibe: "party" },
  { key: "event", label: "Event", vibe: "formal" },
  { key: "trip", label: "Trip", vibe: "casual" },
] as const;
type OccKey = (typeof OCCASIONS)[number]["key"];

const CAT_ORDER: Record<string, number> = {
  outerwear: 0,
  dress: 1,
  top: 2,
  bottom: 3,
  shoes: 4,
  bag: 5,
  accessory: 6,
};

function currentSeason(): Season {
  const m = new Date().getMonth();
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}

const itemImage = (it: WardrobeItem): string | undefined =>
  it.beautifiedImageUrl ?? it.imageUrl;

function titleFor(occ: OccKey, w: WeatherSnapshot | null): string {
  if (occ === "work") return "Dressed for work";
  if (occ === "date") return "Date-night ready";
  if (occ === "event") return "Event-ready";
  if (occ === "trip") return "Easy for travel";
  if (!w) return "Today's pick from your closet";
  const c = w.tempC;
  if (c >= 26) return "Keep it light today";
  if (c >= 18) return "Easy and breezy today";
  if (c >= 10) return "Comfortable layers today";
  if (c >= 2) return "Warm and sharp today";
  return "Bundle up today";
}

export function ExploreForYouHeader() {
  const items = useWardrobe((s) => s.items);
  const profile = useWardrobe((s) => s.profile);
  const setDraft = useWardrobe((s) => s.setDraft);
  const setView = useWardrobe((s) => s.setView);
  const openStylist = useWardrobe((s) => s.openStylist);
  const openAdd = useWardrobe((s) => s.openAdd);

  const [occ, setOcc] = useState<OccKey>("today");
  const [seed, setSeed] = useState(0);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [resaleOpen, setResaleOpen] = useState(false);
  const [tryOnOpen, setTryOnOpen] = useState(false);

  const unit = (profile.temperatureUnit ?? "C") as TempUnit;
  const owned = useMemo(
    () => items.filter((it) => !it.wishlist && itemImage(it)),
    [items],
  );
  const poolKey = useMemo(() => owned.map((it) => it.id).join(","), [owned]);

  // Auto-load weather from the saved profile location — no GPS prompt.
  useEffect(() => {
    const loc = profile.location?.trim();
    if (!loc) return;
    let cancelled = false;
    fetchWeatherForPlace(loc)
      .then((w) => {
        if (!cancelled) setWeather(w);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile.location]);

  const vibe = OCCASIONS.find((o) => o.key === occ)?.vibe;
  const draft = useMemo(
    () => generateOutfit(owned, { season: currentSeason(), vibe }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poolKey, occ, seed],
  );
  const outfit = useMemo(
    () =>
      draftItemIds(draft)
        .map((id) => owned.find((it) => it.id === id))
        .filter((it): it is WardrobeItem => Boolean(it))
        .sort((a, b) => (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  );
  const ins = useMemo(() => computeInsights(owned), [owned]);
  const resale = useMemo(() => resaleSummary(owned), [owned]);
  const tryOnGarments = useMemo<TryOnGarment[]>(
    () =>
      outfit.map((it) => ({
        image: (it.beautifiedImageUrl ?? it.imageUrl) as string,
        label: [it.colorName, it.category].filter(Boolean).join(" "),
      })),
    [outfit],
  );

  if (owned.length < 2) {
    return (
      <div className="rounded-2xl border border-line bg-accent-soft p-6 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          <Sparkles size={13} /> For you
        </p>
        <p className="mt-2 text-base font-semibold text-foreground">
          Build your closet to unlock daily looks
        </p>
        <p className="mt-1 text-xs text-muted">
          Add a few pieces and I&apos;ll style an outfit from what you own every day.
        </p>
        <button
          type="button"
          onClick={() => openAdd()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground"
        >
          <Plus size={15} /> Add clothes
        </button>
      </div>
    );
  }

  const buildIt = () => {
    setDraft(draft);
    setView("builder");
  };
  const temp = weather ? Math.round(convertTemp(weather.tempC, unit)) : null;

  return (
    <>
    <div className="space-y-3">
      {/* Today / occasion hero */}
      <div className="rounded-2xl border border-line bg-accent-soft p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          <Sparkles size={13} />
          {occ === "today" && temp != null ? `${temp}°${unit} · today` : "For you"}
        </p>
        <p className="mt-1 text-lg font-semibold leading-tight text-foreground">
          {titleFor(occ, weather)}
        </p>
        <p className="mt-0.5 text-xs text-muted">Pulled from your closet — nothing to buy.</p>

        {outfit.length > 0 ? (
          <div className="mt-3 flex gap-2">
            {outfit.slice(0, 4).map((it) => (
              <div key={it.id} className="aspect-[4/5] flex-1 overflow-hidden rounded-xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={itemImage(it)} alt={it.name} className="h-full w-full object-contain" />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-surface/60 py-6 text-center text-xs text-muted">
            Add a few more pieces to get a full look.
          </p>
        )}

        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {OCCASIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setOcc(o.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                occ === o.key
                  ? "bg-foreground text-background"
                  : "border border-line bg-surface text-muted"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 text-sm font-medium"
          >
            <Shuffle size={15} /> Shuffle
          </button>
          <button
            type="button"
            onClick={buildIt}
            disabled={outfit.length < 2}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Build it
          </button>
        </div>

        {EXPLORE_FEATURES.tryOnHero && outfit.length > 0 && (
          <button
            type="button"
            onClick={() => setTryOnOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 text-sm font-medium"
          >
            <ScanFace size={15} /> See it on you
          </button>
        )}
      </div>

      {/* Ask your stylist */}
      <button
        type="button"
        onClick={() => openStylist()}
        className="flex w-full items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm text-muted"
      >
        <Wand2 size={16} className="text-accent" /> Ask your stylist anything…
        <ChevronRight size={16} className="ml-auto" />
      </button>

      {/* Wardrobe Wrapped */}
      <button
        type="button"
        onClick={() => setView("insights")}
        className="w-full rounded-2xl border border-line bg-surface p-4 text-left"
      >
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          <Sparkles size={13} /> Wardrobe Wrapped
        </p>
        <p className="mt-1 text-base font-semibold text-foreground">
          You&apos;ve worn {ins.wornPct}% of your closet
        </p>
        <div className="mt-2 flex gap-2">
          {ins.bestValue && (
            <div className="flex-1 rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-sm font-semibold">
                ${ins.bestValue.costPerWear.toFixed(2)}
                <span className="text-xs font-normal text-muted">/wear</span>
              </p>
              <p className="truncate text-[11px] text-muted">{ins.bestValue.item.name}</p>
            </div>
          )}
          <div className="flex-1 rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-sm font-semibold">{ins.neverWorn.length}</p>
            <p className="text-[11px] text-muted">Not worn yet</p>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-accent">
          See your Wrapped <ChevronRight size={13} />
        </p>
      </button>

      {/* Refresh your closet — resale (AJA-157) */}
      {EXPLORE_FEATURES.resale && resale.items.length > 0 && (
        <button
          type="button"
          onClick={() => setResaleOpen(true)}
          className="w-full rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            <Recycle size={13} /> Refresh your closet
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {resale.items.length} piece{resale.items.length === 1 ? "" : "s"}{" "}
            you haven&apos;t worn
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Resell them for around <b>${resale.total}</b> — or donate.
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-accent">
            Refresh your closet <ChevronRight size={13} />
          </p>
        </button>
      )}
    </div>
    {resaleOpen && <ResaleView onClose={() => setResaleOpen(false)} />}
    {tryOnOpen && <TryOnView garments={tryOnGarments} onClose={() => setTryOnOpen(false)} />}
    </>
  );
}
