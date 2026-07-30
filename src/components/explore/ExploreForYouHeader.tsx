"use client";

import {
  BadgeCheck,
  Check,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  Pencil,
  Plus,
  Recycle,
  ScanFace,
  ShoppingBag,
  Shuffle,
  Sparkles,
  User,
  Users,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { countStyleEntriesThisWeek } from "@/lib/community";
import { isSampleItem } from "@/lib/demo-data";
import { forgottenItems } from "@/lib/rediscover";
import {
  challengeOfWeek,
  colorFamily,
  wearStreak,
  weekStartISO,
} from "@/lib/explore/challenge";
import { EXPLORE_FEATURES, type PartnerCapsule } from "@/lib/explore/foundation";
import { yourSize } from "@/lib/fit";
import { computeInsights } from "@/lib/insights";
import {
  bestLook,
  lookReasonLine,
  type ScoredLook,
} from "@/lib/matching";
import { fetchPartnerCapsules } from "@/lib/partners";
import { openExternalUrl } from "@/lib/platform";
import { resaleSummary } from "@/lib/resale";
import { searchProducts, type ShopResult } from "@/lib/shop-search";
import { useWardrobe } from "@/lib/store";
import { readTaste } from "@/lib/taste";
import type { Category, WardrobeItem } from "@/lib/types";
import type { TryOnGarment } from "@/lib/tryon";
import {
  cacheWeather,
  convertTemp,
  fetchWeatherForPlace,
  readCachedWeather,
  type TempUnit,
  type WeatherSnapshot,
} from "@/lib/weather";
import { resolveStyleContext, type ResolvedContext } from "@/lib/style-context";
import { ResaleView } from "./ResaleView";
import { TryOnView } from "./TryOnView";

/**
 * Explore → "For you" feed (AJA-165). The closet-aware daily surface that mirrors
 * the approved prototype: occasion bar + Ask-stylist, a weather-aware Today hero
 * built from the user's closet, on-body try-on, a Recreate-from-your-closet look,
 * a fit-matched Shop pick, Wardrobe Wrapped, and Refresh-your-closet (resale).
 * All reuse existing engines (suggestLooks/bestLook, weather, insights, shop search).
 */

const OCCASIONS = [
  { key: "today", label: "Dress me for…", vibe: undefined },
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

const CAT_QUERY: Record<string, string> = {
  top: "shirt",
  bottom: "pants",
  dress: "dress",
  outerwear: "jacket",
  shoes: "shoes",
  bag: "bag",
  accessory: "belt",
};

const SAGE = "#7c8a6f";

const OCCASION_META: Record<
  OccKey,
  { vibe?: string; occasion?: string; formality?: string; mood?: string }
> = {
  today: { occasion: "today", mood: "everyday" },
  work: { vibe: "work", occasion: "work", formality: "smart-casual", mood: "work" },
  date: { vibe: "party", occasion: "date night", formality: "smart-casual", mood: "date" },
  event: { vibe: "formal", occasion: "event", formality: "formal", mood: "evening" },
  trip: { vibe: "casual", occasion: "travel", formality: "casual", mood: "travel" },
};

const itemImage = (it: WardrobeItem): string | undefined =>
  it.beautifiedImageUrl ?? it.imageUrl;

/** Hybrid ranker: weather-aware, multi-signal, with why-reasons. */
function bestDraft(
  owned: WardrobeItem[],
  occ: OccKey,
  ctx: ResolvedContext,
  seed: number,
): ScoredLook | null {
  const meta = OCCASION_META[occ];
  void seed; // reshuffle re-runs suggestLooks (stochastic sampling)
  return bestLook(owned, {
    vibe: meta.vibe,
    // AJA-267 — the occasion bar is an EXPLICIT choice on this screen, so a chip
    // beats the Style context override exactly the way a tapped calendar date does.
    // The one exception is "Dress me for…", which states no occasion of its own, so
    // the override's occasion is allowed to fill it.
    occasion: occ === "today" ? (ctx.occasion ?? meta.occasion) : meta.occasion,
    mood: meta.mood,
    formality: meta.formality,
    // Weather is ambient, so the override always wins here.
    weather: ctx.weather,
    season: ctx.season,
    taste: typeof window !== "undefined" ? readTaste() : undefined,
    candidates: 20,
  });
}

function resolveOutfit(look: ScoredLook | null): WardrobeItem[] {
  if (!look) return [];
  return look.items
    .slice()
    .sort((a, b) => (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9));
}

const toGarments = (out: WardrobeItem[]): TryOnGarment[] =>
  out.map((it) => ({
    image: itemImage(it) as string,
    label: [it.colorName, it.category].filter(Boolean).join(" "),
  }));

/**
 * AJA-267 — takes the RESOLVED temperature, not the raw forecast.
 *
 * These lines are a styling statement, not a weather report: with a Manual winter
 * override and a cached summer forecast, this said "Keep it light today" directly
 * above a look with a parka in it. The screen contradicted itself.
 *
 * Note the deliberate difference from TodayView, where the weather CARD still shows
 * the real forecast — that card's job IS to report the weather, and overriding what
 * it displays would be lying about it. Here the copy describes what the app is
 * dressing you for, so it has to follow whatever the engine was told.
 */
function heroTitle(occ: OccKey, tempC: number | null | undefined): string {
  if (occ === "work") return "Dressed for work";
  if (occ === "date") return "Date-night ready";
  if (occ === "event") return "Event-ready";
  if (occ === "trip") return "Easy for travel";
  if (tempC == null) return "Today's pick from your closet";
  const c = tempC;
  if (c >= 26) return "Keep it light today";
  if (c >= 18) return "Easy and breezy today";
  if (c >= 10) return "Comfortable layers today";
  if (c >= 2) return "Warm and sharp today";
  return "Bundle up today";
}

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
    {children}
  </p>
);

export function ExploreForYouHeader({
  onOpenFollowing,
  onOpenShop,
}: {
  onOpenFollowing?: () => void;
  onOpenShop?: () => void;
}) {
  const items = useWardrobe((s) => s.items);
  const profile = useWardrobe((s) => s.profile);
  const calendar = useWardrobe((s) => s.calendar);
  const styleContext = useWardrobe((s) => s.styleContext); // AJA-267
  const setDraft = useWardrobe((s) => s.setDraft);
  const setView = useWardrobe((s) => s.setView);
  const openStylist = useWardrobe((s) => s.openStylist);
  const openSplit = useWardrobe((s) => s.openSplit);
  const clearSamples = useWardrobe((s) => s.clearSamples);
  const addItem = useWardrobe((s) => s.addItem);
  const logWear = useWardrobe((s) => s.logWear);

  const [occ, setOcc] = useState<OccKey>("today");
  const [seed, setSeed] = useState(0);
  // AJA-267: seeded from the SHARED cache, not null. Before this, Explore's weather
  // stayed null forever whenever `profile.location` was empty — the effect below
  // returns early — so the engine got no season at all on this surface and the
  // seasonal filters went inert (a knit scarf in July). Same lazy-initializer
  // pattern TodayView already uses.
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => readCachedWeather());
  const [resaleOpen, setResaleOpen] = useState(false);
  const [tryOnItems, setTryOnItems] = useState<TryOnGarment[] | null>(null);
  const [capsules, setCapsules] = useState<PartnerCapsule[]>([]);
  const [pick, setPick] = useState<ShopResult | null>(null);
  const [wished, setWished] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [honest, setHonest] = useState<ShopResult[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const challenge = useMemo(() => challengeOfWeek(), []);
  const streak = useMemo(() => wearStreak(calendar), [calendar]);

  const unit = (profile.temperatureUnit ?? "C") as TempUnit;
  const owned = useMemo(() => items.filter((it) => !it.wishlist && itemImage(it)), [items]);
  const poolKey = useMemo(() => owned.map((it) => it.id).join(","), [owned]);
  const hasSamples = useMemo(() => items.some(isSampleItem), [items]);

  useEffect(() => {
    const loc = profile.location?.trim();
    if (!loc) return;
    let cancelled = false;
    fetchWeatherForPlace(loc)
      .then((w) => {
        if (cancelled) return;
        setWeather(w);
        // Explore used to fetch a forecast and throw it away. TodayView caches its
        // fetches, so the two surfaces could hold different weather for the same
        // moment; now whichever screen you open first warms the cache for both.
        cacheWeather(w);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile.location]);

  useEffect(() => {
    if (!EXPLORE_FEATURES.partnerCapsules) return;
    let alive = true;
    fetchPartnerCapsules().then((c) => alive && setCapsules(c));
    return () => {
      alive = false;
    };
  }, []);

  const dominantColor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of owned) if (it.colorName) counts.set(it.colorName, (counts.get(it.colorName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [owned]);

  const family = useMemo(
    () => colorFamily(owned.map((it) => it.colorName).filter(Boolean) as string[]),
    [owned],
  );

  // Real count of this week's community challenge entries (honest social proof).
  useEffect(() => {
    let alive = true;
    countStyleEntriesThisWeek(weekStartISO())
      .then((n) => alive && setEntryCount(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const mostOwnedCat = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of owned) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "top";
  }, [owned]);

  // A "for you" shop pick, fetched from the catalog for a category the user owns.
  useEffect(() => {
    let alive = true;
    setWished(false);
    searchProducts(CAT_QUERY[mostOwnedCat] ?? "shirt")
      .then((r) => alive && setPick(r.items?.[0] ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mostOwnedCat]);

  // Two taste-matched shop picks for the "honest picks" 2-up, keyed to the
  // color the user actually wears most.
  useEffect(() => {
    let alive = true;
    const q = `${family ?? dominantColor ?? ""} ${CAT_QUERY[mostOwnedCat] ?? "shirt"}`.trim();
    searchProducts(q)
      .then((r) => alive && setHonest((r.items ?? []).slice(0, 2)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [family, dominantColor, mostOwnedCat]);

  // AJA-267 — one resolver, same as Today / the canvas / Rediscover. Explore was the
  // last ambient surface still reading raw weather, so a Manual override in Settings
  // changed every screen except this one.
  const resolved = useMemo(
    () => resolveStyleContext(styleContext, weather, profile.styleOccasions?.[0]),
    [styleContext, weather, profile.styleOccasions],
  );

  const heroLook = useMemo(
    () => bestDraft(owned, occ, resolved, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poolKey, occ, seed, resolved],
  );
  const heroOutfit = useMemo(() => resolveOutfit(heroLook), [heroLook]);
  const recreateLook = useMemo(
    () =>
      bestLook(owned, {
        vibe: "minimal",
        mood: "minimal",
        weather: resolved.weather,
        season: resolved.season,
        candidates: 16,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poolKey, resolved],
  );
  const recreateOutfit = useMemo(() => resolveOutfit(recreateLook), [recreateLook]);

  const ins = useMemo(() => computeInsights(owned), [owned]);
  const resale = useMemo(() => resaleSummary(owned), [owned]);
  const forgotten = useMemo(() => forgottenItems(owned, 8), [owned]);

  if (owned.length < 2) {
    return (
      <div className="rounded-2xl border border-line bg-accent-soft p-6 text-center">
        <Kicker>
          <Sparkles size={13} /> For you
        </Kicker>
        <p className="mt-2 text-base font-semibold text-foreground">
          Wardrobe builds outfits from clothes you already own
        </p>
        <p className="mt-1 text-xs text-muted">
          Add your clothes and I&apos;ll style a look from what you own — every day.
        </p>
        <button
          type="button"
          onClick={() => openSplit()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground"
        >
          <Plus size={15} /> Add my clothes
        </button>
        <p className="mt-3 text-[11px] font-medium text-muted">
          {`${owned.length} of 2 pieces added — snap one photo, I’ll catalog each piece.`}
        </p>
        {onOpenShop && (
          <button
            type="button"
            onClick={onOpenShop}
            className="mt-2 text-xs font-medium text-accent underline-offset-2 hover:underline"
          >
            Or browse the shop
          </button>
        )}
      </div>
    );
  }

  // Resolved, not raw — the badge sits beside the styling headline, so the two must
  // agree. "Today · 31°" over a parka is worse than no badge at all.
  const temp =
    resolved.weather?.tempC != null
      ? Math.round(convertTemp(resolved.weather.tempC, unit))
      : null;
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };
  // Open a look on the canvas to tweak before saving (Recreate + the hero's Edit).
  const wearIt = (look: ScoredLook | null) => {
    if (!look) return;
    setDraft(look.draft);
    setView("builder");
  };
  // One-tap: log today's hero look as worn (moved from the retired Home, AJA-169).
  const wearToday = () => {
    if (heroOutfit.length < 2) return;
    logWear({ itemIds: heroOutfit.map((it) => it.id) });
    flash("Added to today — nice pick");
  };
  const pickSize = pick ? yourSize(profile, pick.category) : null;

  const addWish = () => {
    if (!pick || wished) return;
    addItem({
      name: pick.brand ? `${pick.brand} ${pick.title}` : pick.title,
      imageUrl: pick.imageUrl,
      category: (pick.category as Category) ?? "top",
      color: "",
      brand: pick.brand ?? undefined,
      price: pick.price ?? undefined,
      productUrl: pick.buyUrl,
      tags: [],
      seasons: [],
      wishlist: true,
    });
    setWished(true);
  };

  return (
    <>
      <div className="space-y-3">
        {/* Sample-closet banner — value prop + honest "these aren't yours yet" */}
        {hasSamples && (
          <div className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
            <Kicker>
              <Sparkles size={13} /> Sample closet
            </Kicker>
            <p className="mt-1.5 text-sm font-semibold text-foreground">
              Wardrobe builds outfits from clothes you already own
            </p>
            <p className="mt-0.5 text-xs text-muted">
              This look is styled from sample pieces. Add your own — snap one
              photo and I&apos;ll catalog each piece.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openSplit()}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground"
              >
                <Plus size={14} /> Add my clothes
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSamples();
                  flash("Samples cleared");
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-1.5 text-sm font-medium text-muted"
              >
                Clear samples
              </button>
            </div>
          </div>
        )}

        {/* Occasion bar */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {OCCASIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setOcc(o.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                occ === o.key
                  ? "bg-foreground text-background"
                  : "border border-line bg-surface text-muted"
              }`}
            >
              {o.key === "today" && <Wand2 size={13} />}
              {o.label}
            </button>
          ))}
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

        {/* Today / occasion hero (sage) */}
        <div className="rounded-2xl p-4 text-white" style={{ background: SAGE }}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
            <Sparkles size={13} />
            {occ === "today" ? (temp != null ? `Today · ${temp}°${unit}` : "Today") : "For you"}
          </p>
          <p className="mt-1 text-lg font-semibold leading-tight">{heroTitle(occ, resolved.weather?.tempC)}</p>
          <p className="mt-0.5 text-xs text-white/70">
            {heroLook ? lookReasonLine(heroLook) : "From your closet — nothing to buy."}
          </p>

          {heroOutfit.length > 0 ? (
            <div className="mt-3 flex gap-2">
              {heroOutfit.slice(0, 4).map((it) => (
                <div
                  key={it.id}
                  className="aspect-[4/5] flex-1 overflow-hidden rounded-xl bg-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemImage(it)} alt={it.name} className="h-full w-full object-contain" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-white/10 py-6 text-center text-xs text-white/80">
              Add a few more pieces to get a full look.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSeed((s) => s + 1)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/15 py-2 text-sm font-medium text-white"
            >
              <Shuffle size={15} /> Shuffle
            </button>
            <button
              type="button"
              onClick={wearToday}
              disabled={heroOutfit.length < 2}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-medium disabled:opacity-50"
              style={{ color: "#4c5a41" }}
            >
              <Check size={15} /> Wear this
            </button>
            <button
              type="button"
              aria-label="Edit this look"
              onClick={() => wearIt(heroLook)}
              disabled={heroOutfit.length < 2}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-white disabled:opacity-50"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>

        {/* Rediscover — neglected pieces worth re-wearing (moved from Home, AJA-169) */}
        {forgotten.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <Kicker>
                <Clock size={13} /> Rediscover
              </Kicker>
              <button
                type="button"
                onClick={() => setView("wardrobe")}
                className="flex items-center gap-1 text-xs text-muted"
              >
                Your closet <ChevronRight size={13} />
              </button>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
              {forgotten.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setView("wardrobe")}
                  className="w-24 shrink-0 text-left"
                >
                  <div className="relative h-32 w-24 overflow-hidden rounded-xl border border-line bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={itemImage(it)} alt={it.name} className="h-full w-full object-contain p-2" />
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] text-muted">
                      {(it.wearCount ?? 0) === 0 ? "Not worn" : `Worn ${it.wearCount}×`}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-[12px] leading-tight">{it.name}</p>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Pieces you haven&rsquo;t reached for lately — worth a second look.
            </p>
          </div>
        )}

        {/* See it on you */}
        {EXPLORE_FEATURES.tryOnHero && heroOutfit.length > 0 && (
          <div className="relative rounded-2xl border border-line bg-surface p-4">
            <span className="absolute -top-2 right-3 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-accent-foreground">
              New
            </span>
            <Kicker>
              <ScanFace size={13} /> See it on you
            </Kicker>
            <div className="mt-2 flex gap-3">
              <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <User size={30} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Try this on your body</p>
                <p className="mt-0.5 text-xs text-muted">
                  On-body try-on for any look — your closet or the shop. No guessing how it fits.
                </p>
                <p className="mt-1.5 text-[11px] text-muted">Your photo is used only for the render.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTryOnItems(toGarments(heroOutfit))}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-sm font-medium text-accent-foreground"
            >
              <ScanFace size={15} /> Try it on
            </button>
          </div>
        )}

        {/* Recreate from your closet */}
        {recreateOutfit.length >= 2 && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <Kicker>
              <Wand2 size={13} /> Recreate from your closet
            </Kicker>
            <p className="mt-1 text-base font-semibold text-foreground">Quiet-luxury weekend</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
              Why: {dominantColor ? `you wear ${dominantColor}` : "matched to your closet"} · pairs
              with {owned.length} pieces
            </span>
            <div className="mt-3 flex gap-2">
              {recreateOutfit.slice(0, 4).map((it) => (
                <div key={it.id} className="aspect-[4/5] flex-1 overflow-hidden rounded-xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemImage(it)} alt={it.name} className="h-full w-full object-contain" />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => wearIt(recreateLook)}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-accent py-2 text-sm font-medium text-accent-foreground"
            >
              Build it
            </button>
          </div>
        )}

        {/* Fit-matched shop pick */}
        {pick && (
          <div className="relative rounded-2xl border border-line bg-surface p-4">
            <span className="absolute -top-2 right-3 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-accent-foreground">
              New
            </span>
            <Kicker>
              <Sparkles size={13} /> Shop — for you
            </Kicker>
            <div className="mt-2 flex gap-3">
              <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pick.imageUrl} alt={pick.title} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                {pick.brand && <p className="truncate text-[11px] text-muted">{pick.brand}</p>}
                <p className="text-sm font-semibold text-foreground">{pick.title}</p>
                {pick.price != null && (
                  <p className="text-sm font-semibold text-foreground">${pick.price}</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted">
                  {pickSize ? "Picked to match your fit" : "Picked for your style"}
                </p>
                {pickSize && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                    <Check size={11} /> Size {pickSize} — true to your fit
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setTryOnItems([{ image: pick.imageUrl, label: pick.category }])
                }
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-sm font-medium text-accent-foreground"
              >
                <ScanFace size={15} /> See on me
              </button>
              <button
                type="button"
                onClick={addWish}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 text-sm font-medium"
              >
                <Heart size={15} className={wished ? "fill-accent text-accent" : ""} />
                {wished ? "Added" : "Wishlist"}
              </button>
            </div>
          </div>
        )}

        {/* Wardrobe Wrapped */}
        <button
          type="button"
          onClick={() => setView("insights")}
          className="w-full rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <Kicker>
            <Sparkles size={13} /> Wardrobe Wrapped
          </Kicker>
          <p className="mt-1 text-base font-semibold text-foreground">
            {ins.totalWears > 0
              ? `You've worn ${ins.wornPct}% of your closet`
              : "Log what you wear to unlock your stats"}
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

        {/* Sponsored partner capsules — dormant until a real feed exists (AJA-163) */}
        {capsules.map((c) => (
          <div key={c.id} className="rounded-2xl border border-line bg-surface p-4">
            <Kicker>
              <BadgeCheck size={13} /> Styled with {c.brand} · sponsored
            </Kicker>
            <p className="mt-1 text-base font-semibold text-foreground">{c.title}</p>
          </div>
        ))}

        {/* Refresh your closet — resale (AJA-157) */}
        {EXPLORE_FEATURES.resale && resale.items.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <Kicker>
              <Recycle size={13} /> Refresh your closet
            </Kicker>
            <p className="mt-1 text-base font-semibold text-foreground">
              {resale.items.length} piece{resale.items.length === 1 ? "" : "s"}{" "}
              unworn lately
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Est. <b>${resale.total}</b> · take it as store credit toward new looks.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void openExternalUrl("https://www.google.com/search?q=clothing+donation+drop+off+near+me")}
                className="flex flex-1 items-center justify-center rounded-xl border border-line bg-surface py-2 text-sm font-medium"
              >
                Donate
              </button>
              <button
                type="button"
                onClick={() => setResaleOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground py-2 text-sm font-medium text-background"
              >
                <Recycle size={14} /> Sell &amp; earn credit
              </button>
            </div>
          </div>
        )}

        {/* This week's challenge (AJA-168) — real weekly prompt + real streak/entries */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <Kicker>
            <Users size={13} /> This week&apos;s challenge
          </Kicker>
          <p className="mt-1 text-base font-semibold leading-tight text-foreground">
            {challenge.title}
          </p>
          <p className="mt-1 text-xs text-muted">
            {entryCount > 0
              ? `${entryCount} ${entryCount === 1 ? "entry" : "entries"} so far · vote for your favorite`
              : `${challenge.prompt} · be the first to enter`}
          </p>
          {streak > 0 && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-accent">
              <Flame size={13} /> {streak}-day styling streak — keep it alive
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenFollowing?.()}
              className="flex flex-1 items-center justify-center rounded-xl border border-line bg-surface py-2 text-sm font-medium"
            >
              See entries
            </button>
            <button
              type="button"
              onClick={() => onOpenFollowing?.()}
              className="flex flex-1 items-center justify-center rounded-xl bg-accent py-2 text-sm font-medium text-accent-foreground"
            >
              Join with your closet
            </button>
          </div>
        </div>

        {/* Shop — honest picks (AJA-168): taste/color-matched, real owns/pairs badges */}
        {honest.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <Kicker>
              <ShoppingBag size={13} /> Shop — honest picks
            </Kicker>
            <p className="mt-1 text-base font-semibold leading-tight text-foreground">
              Because you wear a lot of {family ?? dominantColor ?? "these tones"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {honest.slice(0, 2).map((p, i) => (
                <button
                  key={`${p.title}-${i}`}
                  type="button"
                  onClick={() => setTryOnItems([{ image: p.imageUrl, label: p.category }])}
                  className="overflow-hidden rounded-xl border border-line bg-surface-2 text-left"
                >
                  <div className="aspect-square overflow-hidden bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[12px] font-medium text-foreground">
                      {p.title}
                      {p.price != null && <span className="text-muted"> · ${p.price}</span>}
                    </p>
                    {p.closetSignal.owned === "similar" || p.closetSignal.owned === "exact" ? (
                      <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                        {p.closetSignal.owned === "exact" ? "already in closet" : "similar in closet"}
                      </span>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted">
                        pairs with {p.closetSignal.pairCount} item{p.closetSignal.pairCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clear the floating chat FAB so the last card's CTA stays tappable. */}
        <div className="h-24" aria-hidden />
      </div>

      {resaleOpen && <ResaleView onClose={() => setResaleOpen(false)} />}
      {tryOnItems && <TryOnView garments={tryOnItems} onClose={() => setTryOnItems(null)} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </>
  );
}
