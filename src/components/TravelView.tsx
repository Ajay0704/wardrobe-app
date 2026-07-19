"use client";

import { Luggage, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateOutfit } from "@/lib/matching";
import { draftItemIds, useWardrobe } from "@/lib/store";
import { formatDisplayDate } from "@/lib/types";
import * as Trips from "@/lib/trips";
import { Button, EmptyState, Field, inputClass } from "./ui";

// Closet category grouping — mirrors WardrobeView's MAIN_TABS so packing feels
// exactly like browsing the closet (Tops = tops/outerwear/dresses, etc.).
const MAIN_TABS = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Pants", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes"] },
  { key: "accessories", label: "Accessories", cats: ["accessory", "bag"] },
] as const;
type MainTabKey = (typeof MAIN_TABS)[number]["key"];

function dateRange(t: Trips.Trip): string {
  const s = t.startDate ? formatDisplayDate(t.startDate) : null;
  const e = t.endDate ? formatDisplayDate(t.endDate) : null;
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

export function TravelView() {
  const { items, trips: localTrips } = useWardrobe();
  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const ownedById = useMemo(
    () => new Map(owned.map((it) => [it.id, it])),
    [owned],
  );

  const [trips, setTrips] = useState<Trips.Trip[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tripItems, setTripItems] = useState<Trips.TripItem[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTabKey>("all");
  const [capsules, setCapsules] = useState<string[][]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  const trip = trips.find((t) => t.id === selectedId) ?? null;
  const packedRefs = useMemo(
    () => new Set(tripItems.map((ti) => ti.itemRef)),
    [tripItems],
  );
  // Your own packed items as full closet objects (for capsule generation).
  const myPacked = useMemo(
    () => owned.filter((it) => packedRefs.has(it.id)),
    [owned, packedRefs],
  );
  const shown = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    if (!g?.cats) return owned;
    const cats = g.cats as readonly string[];
    return owned.filter((it) => cats.includes(it.category));
  }, [owned, mainTab]);

  const loadItems = useCallback(async (tripId: string | null) => {
    if (!tripId) {
      setTripItems([]);
      return;
    }
    setTripItems(await Trips.listTripItems(tripId));
  }, []);

  // Initial load + one-time local→server migration (guarded so it runs once:
  // server empty AND local trips exist AND not-yet-migrated for this user).
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        let list = await Trips.listTrips();
        const me = await Trips.currentUserId();
        const flagKey = me ? `trips-migrated:${me}` : null;
        const already = flagKey ? localStorage.getItem(flagKey) : "skip";
        if (me && list.length === 0 && localTrips.length > 0 && !already) {
          await Trips.migrateLocalTrips(localTrips, ownedById);
          if (flagKey) localStorage.setItem(flagKey, String(Date.now()));
          list = await Trips.listTrips();
        }
        const cs = await Trips.myPackedCounts();
        if (!alive) return;
        setTrips(list);
        setCounts(cs);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const its = selectedId ? await Trips.listTripItems(selectedId) : [];
      if (alive) setTripItems(its);
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const createTrip = async () => {
    const t = await Trips.createTrip({ name: "New trip" });
    setTrips((prev) => [t, ...prev]);
    setCounts((c) => ({ ...c, [t.id]: 0 }));
    setSelectedId(t.id);
    setConfirmId(null);
    setMainTab("all");
    setCapsules([]);
    setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 0);
  };

  const patchLocal = (patch: Partial<Trips.Trip>) => {
    if (!trip) return;
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, ...patch } : t)));
  };

  const removeTrip = async (id: string) => {
    setConfirmId(null);
    const rest = trips.filter((t) => t.id !== id);
    setTrips(rest);
    setCounts((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
    if (selectedId === id) {
      setSelectedId(rest[0]?.id ?? null);
      setCapsules([]);
    }
    try {
      await Trips.deleteTrip(id);
    } catch {
      await reload(); // restore on failure
    }
  };

  const reload = useCallback(async () => {
    const [list, cs] = await Promise.all([Trips.listTrips(), Trips.myPackedCounts()]);
    setTrips(list);
    setCounts(cs);
  }, []);

  const togglePack = async (itemId: string) => {
    if (!trip) return;
    const item = ownedById.get(itemId);
    if (!item) return;
    const packed = packedRefs.has(itemId);
    setCapsules([]);
    if (packed) {
      setTripItems((tis) => tis.filter((ti) => ti.itemRef !== itemId));
      setCounts((c) => ({ ...c, [trip.id]: Math.max(0, (c[trip.id] ?? 1) - 1) }));
      try {
        await Trips.unpackItem(trip.id, itemId);
      } catch {
        loadItems(trip.id);
      }
    } else {
      const temp: Trips.TripItem = {
        id: `tmp-${itemId}`,
        tripId: trip.id,
        packerId: "",
        itemRef: itemId,
        itemName: item.name,
        itemImageUrl: item.imageUrl,
        itemCategory: item.category,
        createdAt: "",
      };
      setTripItems((tis) => [...tis, temp]);
      setCounts((c) => ({ ...c, [trip.id]: (c[trip.id] ?? 0) + 1 }));
      try {
        await Trips.packItem(trip.id, item);
      } catch {
        loadItems(trip.id);
      }
    }
  };

  const suggest = () => {
    if (myPacked.length < 2) return;
    const seen = new Set<string>();
    const out: string[][] = [];
    for (let i = 0; i < 16 && out.length < 4; i++) {
      const ids = draftItemIds(generateOutfit(myPacked));
      const key = [...ids].sort().join(",");
      if (ids.length >= 2 && !seen.has(key)) {
        seen.add(key);
        out.push(ids);
      }
    }
    setCapsules(out);
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

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

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

      {/* Trip cards — each with its own delete (two-tap confirm). */}
      <div className="grid gap-2.5">
        {trips.map((t) => {
          if (t.id === confirmId) {
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-red-300/50 bg-red-500/5 px-4 py-3"
              >
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  Delete this trip?
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => removeTrip(t.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          }
          const meta = [t.destination, dateRange(t), `${counts[t.id] ?? 0} packed`]
            .filter(Boolean)
            .join(" · ");
          const active = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedId(t.id);
                setConfirmId(null);
                setMainTab("all");
                setCapsules([]);
              }}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-accent bg-surface-2 ring-1 ring-accent"
                  : "border-line hover:border-foreground/30"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {t.name || "Untitled trip"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{meta}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Delete trip"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(t.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setConfirmId(t.id);
                  }
                }}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  active
                    ? "border-red-300/50 text-red-600 dark:text-red-400"
                    : "border-line text-muted hover:border-red-300/50 hover:text-red-600 dark:hover:text-red-400"
                }`}
              >
                <Trash2 size={16} />
              </span>
            </button>
          );
        })}
      </div>

      {trip && (
        <div className="space-y-6">
          {/* Trip details */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Trip name">
              <input
                ref={nameRef}
                className={inputClass}
                value={trip.name}
                onChange={(e) => patchLocal({ name: e.target.value })}
                onBlur={(e) => Trips.updateTrip(trip.id, { name: e.target.value })}
                placeholder="Weekend in Paris"
              />
            </Field>
            <Field label="Destination">
              <input
                className={inputClass}
                value={trip.destination ?? ""}
                onChange={(e) => patchLocal({ destination: e.target.value })}
                onBlur={(e) =>
                  Trips.updateTrip(trip.id, { destination: e.target.value })
                }
                placeholder="Paris, FR"
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                className={inputClass}
                value={trip.startDate ?? ""}
                onChange={(e) => {
                  patchLocal({ startDate: e.target.value });
                  Trips.updateTrip(trip.id, { startDate: e.target.value });
                }}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                className={inputClass}
                value={trip.endDate ?? ""}
                onChange={(e) => {
                  patchLocal({ endDate: e.target.value });
                  Trips.updateTrip(trip.id, { endDate: e.target.value });
                }}
              />
            </Field>
          </div>

          {/* Pack items — closet-style category tabs */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="heading text-lg">
                Pack items{" "}
                <span className="text-sm font-normal text-muted">
                  ({tripItems.length} packed)
                </span>
              </h3>
              <Button
                variant="outline"
                onClick={suggest}
                disabled={myPacked.length < 2}
                title={
                  myPacked.length < 2 ? "Pack at least 2 items" : "Suggest outfits"
                }
              >
                <Sparkles size={15} /> Suggest outfits
              </Button>
            </div>

            {owned.length === 0 ? (
              <p className="text-sm text-muted">
                Add items to your wardrobe first, then pack them here.
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
                  {MAIN_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setMainTab(t.key)}
                      className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
                        mainTab === t.key
                          ? "border-accent font-medium text-accent"
                          : "border-transparent text-muted hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                  {shown.map((it) => {
                    const on = packedRefs.has(it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => togglePack(it.id)}
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
              </>
            )}
          </div>

          {/* Suggested capsule outfits (from your own packed pieces) */}
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
                        const it = ownedById.get(id);
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
                        .map((id) => ownedById.get(id)?.name)
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
