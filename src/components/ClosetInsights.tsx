"use client";

import { computeInsights } from "@/lib/insights";
import { useWardrobe } from "@/lib/store";

/**
 * "Closet ROI" — a compact insights strip shown inside the Wardrobe screen
 * (no new tab or top-bar button). Surfaces closet value, how much of it you
 * actually wear, best value, and rarely-worn pieces to wear or let go.
 */
export function ClosetInsights() {
  const items = useWardrobe((s) => s.items);
  const i = computeInsights(items);
  if (i.itemCount < 3) return null;

  const hasWears = i.totalWears > 0;

  return (
    <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
        Closet insights
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Pieces" value={`${i.itemCount}`} />
        {i.value > 0 && (
          <Tile label="Closet value" value={`$${i.value.toLocaleString()}`} />
        )}
        {hasWears && <Tile label="Worn at least once" value={`${i.wornPct}%`} />}
        {i.bestValue && (
          <Tile
            label="Best value"
            value={`$${i.bestValue.costPerWear.toFixed(2)}/wear`}
            sub={i.bestValue.item.name}
          />
        )}
      </div>

      {hasWears && i.neverWorn.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-medium text-foreground">
            {i.neverWorn.length}
          </span>{" "}
          {i.neverWorn.length > 1 ? "pieces" : "piece"} not worn yet — wear{" "}
          {i.neverWorn.length > 1 ? "them" : "it"} or let{" "}
          {i.neverWorn.length > 1 ? "them" : "it"} go
          {`: ${i.neverWorn
            .slice(0, 3)
            .map((x) => x.name)
            .join(", ")}${i.neverWorn.length > 3 ? "…" : ""}`}
          .
        </p>
      )}

      {!hasWears && (
        <p className="mt-3 text-sm text-muted">
          Tap “I wore this” on an outfit to start tracking cost-per-wear and see
          which pieces earn their keep.
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-medium">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
