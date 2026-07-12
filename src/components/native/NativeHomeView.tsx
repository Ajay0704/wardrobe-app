"use client";

import {
  BarChart3,
  Calendar,
  CalendarDays,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Info,
  Mail,
  MapPin,
  MessageCircle,
  PersonStanding,
  Plus,
  RefreshCw,
  Settings2,
  Shirt,
  Sparkles,
  Sun,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { generateOutfit, outfitScore } from "@/lib/matching";
import { primaryStyleVibe } from "@/lib/profile";
import { draftItemIds, useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import {
  fetchLocalWeather,
  fetchWeatherForPlace,
  weatherIconKey,
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

function WxIcon({ code, size = 18 }: { code: number; size?: number }) {
  const Icon = WX_ICON[weatherIconKey(code)];
  return <Icon size={size} strokeWidth={1.8} className="text-muted" />;
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const monthDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekday = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short" });

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

/* ------------------------------------------------------------- home screen  */

export function NativeHomeView() {
  const { items, profile, setView, setAddOpen, setDraft } = useWardrobe();
  const [seed, setSeed] = useState(0);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [wxLoading, setWxLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const comingSoon = (what: string) => {
    setToast(`${what} — coming soon`);
    window.setTimeout(() => setToast(null), 2000);
  };

  // Auto-load weather from the saved profile location — no GPS prompt.
  useEffect(() => {
    const loc = profile.location?.trim();
    if (!loc) return;
    let cancelled = false;
    setWxLoading(true);
    fetchWeatherForPlace(loc)
      .then((w) => !cancelled && setWeather(w))
      .catch(() => {})
      .finally(() => !cancelled && setWxLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profile.location]);

  const useMyLocation = () => {
    setWxLoading(true);
    fetchLocalWeather({ fallbackPlace: profile.location })
      .then(setWeather)
      .catch(() => {})
      .finally(() => setWxLoading(false));
  };

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const vibe = primaryStyleVibe(profile);
  const suggestions = useMemo(
    () =>
      buildSuggestions(
        items,
        weather?.season,
        weather?.needsOuterwear ?? false,
        vibe,
        seed,
      ),
    [items, weather, vibe, seed],
  );

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

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const recent = useMemo(
    () => [...owned].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12),
    [owned],
  );
  const remaining = Math.max(0, 6 - owned.length);
  const tempLabel = weather
    ? `${Math.round(weather.hi ?? weather.tempC)} / ${Math.round(
        weather.lo ?? weather.tempC,
      )}°C`
    : wxLoading
      ? "…"
      : null;

  return (
    <div className="space-y-7 pb-6">
      <PromoCarousel />

      {/* Outfits for today's weather */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Outfits for today&rsquo;s weather</h2>
          <button
            type="button"
            aria-label="Reshuffle"
            onClick={() => setSeed((n) => n + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2"
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Calendar size={15} /> {monthDay(today)}
          </span>
          {profile.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin size={15} /> {profile.location}
            </span>
          ) : (
            <button
              type="button"
              onClick={useMyLocation}
              className="flex items-center gap-1.5 text-accent"
            >
              <MapPin size={15} /> Use my location
            </button>
          )}
          {tempLabel && (
            <span className="flex items-center gap-1.5">
              {weather ? <WxIcon code={weather.weatherCode} size={15} /> : null}
              {tempLabel}
            </span>
          )}
        </div>

        {suggestions.length === 0 ? (
          <AddMoreCallout remaining={remaining} onAdd={() => setAddOpen(true)} />
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
            {suggestions.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => openLook(s)}
                className="w-64 shrink-0 rounded-2xl border border-line bg-surface p-3 text-left"
              >
                <OutfitThumbGrid items={s.items} />
              </button>
            ))}
          </div>
        )}

        {suggestions.length > 0 && remaining > 0 && (
          <AddMoreCallout remaining={remaining} onAdd={() => setAddOpen(true)} />
        )}
      </section>

      {/* Popular features */}
      <Section title="Popular features" action="See all" onAction={() => comingSoon("More features")}>
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard icon={Plus} label="Add items" onClick={() => setAddOpen(true)} />
          <FeatureCard icon={Shirt} label="Create Outfit" onClick={() => setView("builder")} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <FeatureCard icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} />
          <FeatureCard icon={Sparkles} label="Beautify" onClick={() => comingSoon("Beautify")} />
          <FeatureCard icon={BarChart3} label="Style stats" onClick={() => setView("insights")} />
        </div>
      </Section>

      {/* AI Stylist */}
      <Section title="AI Stylist">
        <div className="grid grid-cols-3 gap-3">
          <FeatureCard icon={Wand2} label="Outfit suggestion" onClick={() => setView("builder")} />
          <FeatureCard icon={MessageCircle} label="Style chat" onClick={() => comingSoon("Style chat")} />
          <FeatureCard icon={PersonStanding} label="Try On" onClick={() => setView("builder")} />
        </div>
      </Section>

      {/* Sign in and import */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sign in and import items from</h2>
        <div className="flex items-center gap-3 overflow-x-auto">
          <ImportTile onClick={() => comingSoon("Email import")}>
            <Mail size={20} strokeWidth={1.7} />
            <span className="mt-1 text-[11px]">email</span>
          </ImportTile>
          <div className="h-10 w-px bg-line" />
          {["ZARA", "SHEIN", "GAP"].map((b) => (
            <ImportTile key={b} onClick={() => comingSoon(`${b} import`)}>
              <span className="text-sm font-semibold tracking-tight">{b}</span>
            </ImportTile>
          ))}
          <button
            type="button"
            onClick={() => comingSoon("More stores")}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-line text-muted"
          >
            <Plus size={22} />
          </button>
        </div>
      </section>

      {/* Recently added */}
      <Section
        title="Recently added items"
        action=""
        onAction={() => setView("wardrobe")}
        chevron
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex h-24 w-20 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-muted"
          >
            <Plus size={24} />
          </button>
          {recent.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setView("wardrobe")}
              className="h-24 w-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <ItemThumb item={it} />
            </button>
          ))}
        </div>
      </Section>

      {/* Outfit calendar */}
      <Section title="Outfit calendar" action="View Calendar" onAction={() => setView("calendar")} chevron>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
          {days.map((d, i) => {
            const f = weather?.daily?.find((x) => x.dateISO === toISO(d));
            return (
              <button
                key={i}
                type="button"
                onClick={() => setView("calendar")}
                className="w-24 shrink-0 text-center"
              >
                <p className="text-sm font-medium">{i === 0 ? "Today" : weekday(d)}</p>
                <p className="text-xs text-muted">{monthDay(d)}</p>
                <div className="mt-1 flex h-5 items-center justify-center gap-1 text-xs text-muted">
                  {f ? (
                    <>
                      <WxIcon code={f.weatherCode} size={14} />
                      {f.hi}° <span className="opacity-60">{f.lo}°</span>
                    </>
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </div>
                <div className="mt-1.5 flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-line bg-surface text-muted">
                  <CalendarDays size={20} strokeWidth={1.6} />
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Magazine */}
      <Section title="Magazine">
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
          {MAGAZINE.map((m) => (
            <button
              key={m.title}
              type="button"
              onClick={() => comingSoon("Magazine")}
              className="w-64 shrink-0 text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.img}
                alt=""
                className="aspect-[4/3] w-full rounded-2xl object-cover"
              />
              <p className="mt-2 line-clamp-2 font-medium leading-snug">{m.title}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                {m.date}
                {m.isNew && (
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    New
                  </span>
                )}
              </p>
            </button>
          ))}
        </div>
      </Section>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => comingSoon("Edit home")}
          className="flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium"
        >
          <Settings2 size={16} /> Edit home
        </button>
      </div>

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

function Section({
  title,
  action,
  onAction,
  chevron,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  chevron?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {(action || chevron) && (
          <button
            type="button"
            onClick={onAction}
            className="flex items-center gap-1 text-sm text-muted"
          >
            {action}
            {chevron && <ChevronRight size={16} />}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-24 flex-col justify-between rounded-2xl bg-surface-2 p-3 text-left"
    >
      <span className="flex h-9 w-9 items-center justify-center self-start rounded-xl bg-surface text-accent">
        <Icon size={18} />
      </span>
      <span className="text-sm font-medium leading-tight">{label}</span>
    </button>
  );
}

function ImportTile({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-line bg-surface text-foreground"
    >
      {children}
    </button>
  );
}

function OutfitThumbGrid({ items }: { items: WardrobeItem[] }) {
  const cells = items.slice(0, 4);
  const fillers = Math.max(0, 4 - cells.length);
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map((it) => (
        <div
          key={it.id}
          className="aspect-square overflow-hidden rounded-xl bg-surface-2"
        >
          <ItemThumb item={it} contain />
        </div>
      ))}
      {Array.from({ length: fillers }).map((_, i) => (
        <div key={i} className="aspect-square rounded-xl bg-surface-2" />
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
    return (
      <div className="h-full w-full" style={{ background: item.color }} />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.name}
      onError={() => setErr(true)}
      className={`h-full w-full ${contain ? "object-contain p-1.5" : "object-cover"}`}
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
      className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-4 text-left"
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Info size={15} />
      </span>
      <span>
        <span className="block font-semibold">
          Add {remaining} more for all-you looks
        </span>
        <span className="mt-0.5 block text-sm text-muted">
          Add {remaining} more item{remaining === 1 ? "" : "s"} to get outfits
          built entirely from your closet.
        </span>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- placeholder data */

const PROMOS = [
  {
    title: "Make Tomorrow Easier",
    body: "3 reasons 100k users plan their outfits ahead",
  },
  {
    title: "Your closet, styled",
    body: "Let the AI stylist build looks from what you own",
  },
  {
    title: "Never lose a receipt",
    body: "Import past orders and keep your wardrobe complete",
  },
];

function PromoCarousel() {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <section>
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / (el.clientWidth * 0.9)));
        }}
      >
        {PROMOS.map((p) => (
          <div
            key={p.title}
            className="flex w-[88%] shrink-0 snap-start items-center gap-3 rounded-2xl bg-accent-soft p-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{p.title}</p>
              <p className="text-sm text-muted">{p.body}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed(true)}
              className="shrink-0 text-muted"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {PROMOS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === active ? "bg-foreground" : "bg-line"}`}
          />
        ))}
      </div>
    </section>
  );
}

const MAGAZINE = [
  {
    title: "Athleisure: From the Gym to Brunch, The Magic of One Layer",
    date: "July 5, 2026",
    isNew: true,
    img: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80&auto=format&fit=crop",
  },
  {
    title: "A New '-core' Everyone Is Wearing This Season",
    date: "June 28, 2026",
    isNew: false,
    img: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=600&q=80&auto=format&fit=crop",
  },
  {
    title: "Five Wardrobe Staples That Never Go Out of Style",
    date: "June 20, 2026",
    isNew: false,
    img: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=80&auto=format&fit=crop",
  },
];
