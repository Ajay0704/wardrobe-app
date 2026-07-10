"use client";

import { Luggage, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { generateOutfit } from "@/lib/matching";
import { draftItemIds, useWardrobe } from "@/lib/store";
import { CATEGORY_LABEL } from "@/lib/types";
import { Button, EmptyState, Field, inputClass } from "./ui";

export function TravelView() {
  const { trips, items, addTrip, updateTrip, deleteTrip } = useWardrobe();
  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);

  const [selectedId, setSelectedId] = useState<string | null>(
    trips[0]?.id ?? null,
  );
  const [capsules, setCapsules] = useState<string[][]>([]);

  const trip = trips.find((t) => t.id === selectedId) ?? null;
  const packed = trip
    ? owned.filter((it) => trip.itemIds.includes(it.id))
    : [];

  const createTrip = () => {
    const id = addTrip({ name: "New trip", itemIds: [] });
    setSelectedId(id);
    setCapsules([]);
  };

  const toggleItem = (itemId: string) => {
    // Read fresh state so rapid consecutive toggles don't clobber each other.
    const cur = useWardrobe.getState().trips.find((t) => t.id === selectedId);
    if (!cur) return;
    const has = cur.itemIds.includes(itemId);
    updateTrip(cur.id, {
      itemIds: has
        ? cur.itemIds.filter((i) => i !== itemId)
        : [...cur.itemIds, itemId],
    });
    setCapsules([]);
  };

  const suggest = () => {
    if (packed.length < 2) return;
    const seen = new Set<string>();
    const out: string[][] = [];
    for (let i = 0; i < 16 && out.length < 4; i++) {
      const ids = draftItemIds(generateOutfit(packed));
      const key = [...ids].sort().join(",");
      if (ids.length >= 2 && !seen.has(key)) {
        seen.add(key);
        out.push(ids);
      }
    }
    setCapsules(out);
  };

  const removeTrip = () => {
    if (!trip) return;
    deleteTrip(trip.id);
    const rest = trips.filter((t) => t.id !== trip.id);
    setSelectedId(rest[0]?.id ?? null);
    setCapsules([]);
  };

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="heading text-2xl">Travel</h2>
        <p className="mt-1 text-sm text-muted">
          Pack a capsule from your closet and get outfit combinations for the
          trip.
        </p>
      </div>
      <Button onClick={createTrip}>
        <Plus size={15} /> New trip
      </Button>
    </div>
  );

  if (trips.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No trips yet"
          subtitle="Plan a trip, pack pieces from your wardrobe, and generate capsule outfits."
          action={
            <Button onClick={createTrip}>
              <Luggage size={15} /> Plan a trip
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Trip selector */}
      <div className="flex flex-wrap gap-2">
        {trips.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSelectedId(t.id);
              setCapsules([]);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              t.id === selectedId
                ? "border-foreground bg-surface-2 font-medium text-foreground"
                : "border-line text-muted hover:border-foreground/30"
            }`}
          >
            {t.name || "Untitled trip"}
          </button>
        ))}
      </div>

      {trip && (
        <div className="space-y-6">
          {/* Trip details */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Trip name">
              <input
                className={inputClass}
                value={trip.name}
                onChange={(e) => updateTrip(trip.id, { name: e.target.value })}
                placeholder="Weekend in Paris"
              />
            </Field>
            <Field label="Destination">
              <input
                className={inputClass}
                value={trip.destination ?? ""}
                onChange={(e) =>
                  updateTrip(trip.id, { destination: e.target.value || undefined })
                }
                placeholder="Paris, FR"
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                className={inputClass}
                value={trip.startDate ?? ""}
                onChange={(e) =>
                  updateTrip(trip.id, { startDate: e.target.value || undefined })
                }
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                className={inputClass}
                value={trip.endDate ?? ""}
                onChange={(e) =>
                  updateTrip(trip.id, { endDate: e.target.value || undefined })
                }
              />
            </Field>
          </div>

          {/* Pack items */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="heading text-lg">
                Pack items{" "}
                <span className="text-sm font-normal text-muted">
                  ({packed.length} packed)
                </span>
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={suggest}
                  disabled={packed.length < 2}
                  title={
                    packed.length < 2 ? "Pack at least 2 items" : "Suggest outfits"
                  }
                >
                  <Sparkles size={15} /> Suggest outfits
                </Button>
                <Button variant="ghost" onClick={removeTrip}>
                  <Trash2 size={15} /> Delete trip
                </Button>
              </div>
            </div>

            {owned.length === 0 ? (
              <p className="text-sm text-muted">
                Add items to your wardrobe first, then pack them here.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                {owned.map((it) => {
                  const on = trip.itemIds.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleItem(it.id)}
                      className={`group relative aspect-[3/4] overflow-hidden rounded-xl border transition-all ${
                        on
                          ? "border-accent ring-2 ring-accent/30"
                          : "border-line opacity-70 hover:opacity-100"
                      }`}
                      title={it.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.imageUrl}
                        alt={it.name}
                        className="h-full w-full object-cover"
                      />
                      {on && (
                        <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Packing checklist grouped by category */}
          {packed.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
              <h3 className="heading mb-2 text-base">Packing checklist</h3>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {Object.entries(
                  packed.reduce<Record<string, string[]>>((acc, it) => {
                    const k = CATEGORY_LABEL[it.category];
                    (acc[k] ??= []).push(it.name);
                    return acc;
                  }, {}),
                ).map(([cat, names]) => (
                  <div key={cat} className="text-sm">
                    <span className="font-medium">{cat}:</span>{" "}
                    <span className="text-muted">{names.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested capsule outfits */}
          {capsules.length > 0 && (
            <div>
              <h3 className="heading mb-3 text-lg">Capsule outfits</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {capsules.map((ids, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-line bg-surface p-3"
                  >
                    <div className="mb-2 flex -space-x-3">
                      {ids.map((id) => {
                        const it = packed.find((p) => p.id === id);
                        if (!it) return null;
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={id}
                            src={it.imageUrl}
                            alt={it.name}
                            title={it.name}
                            className="h-14 w-14 rounded-lg border-2 border-surface object-cover"
                          />
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted">
                      {ids
                        .map((id) => packed.find((p) => p.id === id)?.name)
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
