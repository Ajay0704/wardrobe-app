"use client";

import { Shirt } from "lucide-react";
import { computeFullInsights } from "@/lib/insights";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";
import type { Category } from "@/lib/types";
import { Button, EmptyState } from "./ui";

/** Distinct, soft colors per category for the donut + legend. */
const CATEGORY_COLOR: Record<Category, string> = {
  top: "#9ec5fe",
  bottom: "#b197fc",
  dress: "#f7a8c4",
  outerwear: "#8ce99a",
  shoes: "#63e6be",
  bag: "#ffd43b",
  accessory: "#66d9e8",
};

export function InsightsView() {
  const items = useWardrobe((s) => s.items);
  const setView = useWardrobe((s) => s.setView);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const i = computeFullInsights(items);

  if (i.itemCount === 0) {
    return (
      <EmptyState
        title="No insights yet"
        subtitle="Add a few pieces to your wardrobe to see your closet broken down."
        action={
          <Button onClick={() => setView("wardrobe")}>
            <Shirt size={15} /> Open wardrobe
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="heading text-2xl sm:text-3xl">Insights</h1>
        <p className="mt-1 text-sm text-muted">
          How your wardrobe breaks down — free, all of it.
        </p>
      </header>

      {/* Category donut + legend */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Donut
            slices={i.categories.map((c) => ({
              value: c.count,
              color: CATEGORY_COLOR[c.category],
            }))}
            centerTop={`${i.itemCount}`}
            centerLabel={`${i.itemCount === 1 ? "piece" : "pieces"} · ${i.categoryCount} ${
              i.categoryCount === 1 ? "category" : "categories"
            }`}
          />
          <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-2.5 sm:flex-1">
            {i.categories.map((c) => (
              <li key={c.category} className="flex items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[c.category] }}
                />
                <span className="truncate">{c.label}</span>
                <span className="ml-auto shrink-0 font-medium">{c.count}</span>
                <span className="w-9 shrink-0 text-right text-xs text-muted">
                  {c.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Value tiles */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Wardrobe value" value={formatMoney(i.value, currency, 0)} />
        <Tile
          label="Average item price"
          value={i.avgPrice > 0 ? formatMoney(i.avgPrice, currency, 2) : "—"}
        />
      </div>

      {/* Usage */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Wardrobe usage</h2>
          <span className="text-lg font-medium">{i.wornPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${i.wornPct}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          {i.totalWears > 0
            ? `You've worn ${i.wornPct}% of your closet at least once (${i.totalWears} total wears logged).`
            : "Tap “I wore this” on outfits to start tracking what you actually wear."}
        </p>
      </section>

      {/* Cost per wear + most worn */}
      {i.bestValue && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-medium">Best value (cost per wear)</h2>
          <ItemRow
            item={i.bestValue.item}
            trailing={`${formatMoney(i.bestValue.costPerWear, currency, 2)}/wear`}
          />
          {i.mostWorn.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted">
                Most worn
              </h3>
              <div className="space-y-2">
                {i.mostWorn.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    trailing={`${it.wearCount}× worn`}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* Never worn */}
      {i.neverWorn.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Never worn</h2>
            <span className="text-sm text-muted">{i.neverWorn.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {i.neverWorn.slice(0, 12).map((it) => (
              <Thumb key={it.id} src={it.imageUrl} color={it.color} name={it.name} />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            Pieces you haven&apos;t worn yet — style them or let them go.
          </p>
        </section>
      )}

      {/* Recently added */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-medium">Recently added</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {i.recentlyAdded.map((it) => (
            <Thumb key={it.id} src={it.imageUrl} color={it.color} name={it.name} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Donut({
  slices,
  centerTop,
  centerLabel,
}: {
  slices: { value: number; color: string }[];
  centerTop: string;
  centerLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = 80;
  const C = 2 * Math.PI * r;
  const segments = slices.reduce<{ dash: number; offset: number; color: string }[]>(
    (acc, s) => {
      const prev = acc[acc.length - 1];
      const offset = prev ? prev.offset + prev.dash : 0;
      acc.push({ dash: (s.value / total) * C, offset, color: s.color });
      return acc;
    },
    [],
  );
  return (
    <svg
      viewBox="0 0 200 200"
      className="h-44 w-44 shrink-0"
      role="img"
      aria-label="Wardrobe category breakdown"
    >
      <g transform="rotate(-90 100 100)">
        {segments.map((seg, idx) => (
          <circle
            key={idx}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="28"
            strokeDasharray={`${seg.dash} ${C - seg.dash}`}
            strokeDashoffset={-seg.offset}
          />
        ))}
      </g>
      <text
        x="100"
        y="96"
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: "34px", fontWeight: 600 }}
      >
        {centerTop}
      </text>
      <text
        x="100"
        y="120"
        textAnchor="middle"
        className="fill-muted"
        style={{ fontSize: "11px" }}
      >
        {centerLabel}
      </text>
    </svg>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-medium">{value}</p>
    </div>
  );
}

function ItemRow({ item, trailing }: { item: { imageUrl: string; color: string; name: string }; trailing: string }) {
  return (
    <div className="flex items-center gap-3">
      <Thumb src={item.imageUrl} color={item.color} name={item.name} small />
      <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
      <span className="shrink-0 text-sm font-medium text-accent">{trailing}</span>
    </div>
  );
}

function Thumb({
  src,
  color,
  name,
  small,
}: {
  src: string;
  color: string;
  name: string;
  small?: boolean;
}) {
  const size = small ? "h-10 w-10" : "h-16 w-14";
  return (
    <div
      className={`${size} shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2`}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="block h-full w-full" style={{ backgroundColor: color }} />
      )}
    </div>
  );
}
