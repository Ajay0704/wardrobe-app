"use client";

import { Luggage, Plus, Sparkles, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFollowingUsers, type FollowUser } from "@/lib/community";
import { generateOutfit } from "@/lib/matching";
import { profileHandle } from "@/lib/profile";
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

function Avatar({
  name,
  avatar,
  size = 32,
}: {
  name?: string | null;
  avatar?: string | null;
  size?: number;
}) {
  const initials =
    (name ?? "?")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={name ?? ""} className="shrink-0 rounded-full border border-surface object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-surface bg-accent/15 font-semibold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function TravelView() {
  const { items, trips: localTrips, profile } = useWardrobe();
  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const ownedById = useMemo(() => new Map(owned.map((it) => [it.id, it])), [owned]);
  const myIdentity = useMemo<Trips.Identity>(
    () => ({
      name: profile.displayName || "You",
      handle: profileHandle(profile),
      avatar: profile.avatarUrl,
    }),
    [profile],
  );

  const [meId, setMeId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trips.Trip[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [invites, setInvites] = useState<Trips.PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tripItems, setTripItems] = useState<Trips.TripItem[]>([]);
  const [members, setMembers] = useState<Trips.TripMember[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTabKey>("all");
  const [packView, setPackView] = useState<"mine" | "everyone">("mine");
  const [capsules, setCapsules] = useState<string[][]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [following, setFollowing] = useState<FollowUser[] | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const trip = trips.find((t) => t.id === selectedId) ?? null;
  const myRefs = useMemo(
    () => new Set(tripItems.filter((ti) => ti.packerId === meId).map((ti) => ti.itemRef)),
    [tripItems, meId],
  );
  const myPacked = useMemo(() => owned.filter((it) => myRefs.has(it.id)), [owned, myRefs]);
  const shown = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    if (!g?.cats) return owned;
    const cats = g.cats as readonly string[];
    return owned.filter((it) => cats.includes(it.category));
  }, [owned, mainTab]);
  const joinedMembers = useMemo(
    () => members.filter((m) => m.status === "joined"),
    [members],
  );
  // Everyone view — one group per joined member, you first.
  const groups = useMemo(() => {
    const ordered = [...joinedMembers].sort((a, b) =>
      a.userId === meId ? -1 : b.userId === meId ? 1 : 0,
    );
    return ordered.map((m) => ({
      member: m,
      items: tripItems.filter((ti) => ti.packerId === m.userId),
    }));
  }, [joinedMembers, tripItems, meId]);

  const reload = useCallback(async () => {
    const [list, cs, inv] = await Promise.all([
      Trips.listTrips(),
      Trips.myPackedCounts(),
      Trips.listPendingInvites(),
    ]);
    setTrips(list);
    setCounts(cs);
    setInvites(inv);
  }, []);

  // Initial load + one-time local→server migration (guarded: runs once when the
  // server has no trips, local trips exist, and this user hasn't migrated yet).
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const me = await Trips.currentUserId();
        let list = await Trips.listTrips();
        const flagKey = me ? `trips-migrated:${me}` : null;
        const already = flagKey ? localStorage.getItem(flagKey) : "skip";
        if (me && list.length === 0 && localTrips.length > 0 && !already) {
          await Trips.migrateLocalTrips(localTrips, ownedById);
          if (flagKey) localStorage.setItem(flagKey, String(Date.now()));
          list = await Trips.listTrips();
        }
        const [cs, inv] = await Promise.all([
          Trips.myPackedCounts(),
          Trips.listPendingInvites(),
        ]);
        if (!alive) return;
        setMeId(me);
        setTrips(list);
        setCounts(cs);
        setInvites(inv);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load items + roster for the selected trip.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selectedId) {
        setTripItems([]);
        setMembers([]);
        return;
      }
      const [its, mem] = await Promise.all([
        Trips.listTripItems(selectedId),
        Trips.listMembers(selectedId),
      ]);
      if (alive) {
        setTripItems(its);
        setMembers(mem);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const selectTrip = (id: string) => {
    setSelectedId(id);
    setConfirmId(null);
    setMainTab("all");
    setPackView("mine");
    setInviteOpen(false);
    setCapsules([]);
  };

  const createTrip = async () => {
    const t = await Trips.createTrip({ name: "New trip" }, myIdentity);
    setTrips((prev) => [t, ...prev]);
    setCounts((c) => ({ ...c, [t.id]: 0 }));
    selectTrip(t.id);
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
      await reload();
    }
  };

  const togglePack = async (itemId: string) => {
    if (!trip) return;
    const item = ownedById.get(itemId);
    if (!item) return;
    const packed = myRefs.has(itemId);
    setCapsules([]);
    if (packed) {
      setTripItems((tis) => tis.filter((ti) => !(ti.itemRef === itemId && ti.packerId === meId)));
      setCounts((c) => ({ ...c, [trip.id]: Math.max(0, (c[trip.id] ?? 1) - 1) }));
      try {
        await Trips.unpackItem(trip.id, itemId);
      } catch {
        setTripItems(await Trips.listTripItems(trip.id));
      }
    } else {
      const temp: Trips.TripItem = {
        id: `tmp-${itemId}`,
        tripId: trip.id,
        packerId: meId ?? "",
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
        setTripItems(await Trips.listTripItems(trip.id));
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

  const openInvite = async () => {
    setInviteOpen((v) => !v);
    if (following === null && meId) {
      setFollowing(await fetchFollowingUsers(meId));
    }
  };

  const invite = async (u: FollowUser) => {
    if (!trip) return;
    // optimistic: add as an invited member
    setMembers((prev) =>
      prev.some((m) => m.userId === u.id)
        ? prev
        : [
            ...prev,
            {
              userId: u.id,
              role: "member",
              status: "invited",
              name: u.name,
              handle: u.handle,
              avatar: u.avatar ?? null,
            },
          ],
    );
    try {
      await Trips.inviteMember(trip.id, u, myIdentity);
    } catch {
      setMembers(await Trips.listMembers(trip.id));
    }
  };

  const respond = async (tripId: string, accept: boolean) => {
    setInvites((prev) => prev.filter((i) => i.trip.id !== tripId));
    try {
      await Trips.respondInvite(tripId, accept);
    } finally {
      await reload();
      if (accept) setSelectedId(tripId);
    }
  };

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="heading text-2xl">Travel</h2>
        <p className="mt-1 text-sm text-muted">
          Pack a capsule from your closet — solo, or with friends on a shared trip.
        </p>
      </div>
      <Button onClick={createTrip}>
        <Plus size={15} /> New trip
      </Button>
    </div>
  );

  const invitesSection = invites.length > 0 && (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        Trip invites
      </p>
      {invites.map((inv) => (
        <div
          key={inv.trip.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {inv.trip.name || "Untitled trip"}
            </span>
            <span className="block truncate text-xs text-muted">
              {inv.inviterName ? `${inv.inviterName} invited you` : "You're invited"}
              {inv.trip.destination ? ` · ${inv.trip.destination}` : ""}
            </span>
          </span>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => respond(inv.trip.id, false)}>
              Decline
            </Button>
            <Button onClick={() => respond(inv.trip.id, true)}>Accept</Button>
          </div>
        </div>
      ))}
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
        {invitesSection}
        <EmptyState
          title="No trips yet"
          subtitle="Plan a trip, pack pieces from your wardrobe, and generate capsule outfits — or accept an invite to pack with friends."
          action={
            <Button onClick={createTrip}>
              <Luggage size={15} /> Plan a trip
            </Button>
          }
        />
      </div>
    );
  }

  const isOwner = trip ? trip.ownerId === meId : false;
  const memberIds = new Set(members.map((m) => m.userId));
  const invitable = (following ?? []).filter((u) => !memberIds.has(u.id));
  const headerCount = packView === "mine" ? myRefs.size : tripItems.length;

  return (
    <div className="space-y-6">
      {header}
      {invitesSection}

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
          const owner = t.ownerId === meId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTrip(t.id)}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-accent bg-surface-2 ring-1 ring-accent"
                  : "border-line hover:border-foreground/30"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {t.name || "Untitled trip"}
                  {!owner && (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                      shared
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{meta}</span>
              </span>
              {owner ? (
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
              ) : (
                <span className="shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {trip && (
        <div className="space-y-6">
          {/* Trip details (owner edits; members see read-only values via inputs). */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Trip name">
              <input
                ref={nameRef}
                className={inputClass}
                value={trip.name}
                disabled={!isOwner}
                onChange={(e) => patchLocal({ name: e.target.value })}
                onBlur={(e) => isOwner && Trips.updateTrip(trip.id, { name: e.target.value })}
                placeholder="Weekend in Paris"
              />
            </Field>
            <Field label="Destination">
              <input
                className={inputClass}
                value={trip.destination ?? ""}
                disabled={!isOwner}
                onChange={(e) => patchLocal({ destination: e.target.value })}
                onBlur={(e) => isOwner && Trips.updateTrip(trip.id, { destination: e.target.value })}
                placeholder="Paris, FR"
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                className={inputClass}
                value={trip.startDate ?? ""}
                disabled={!isOwner}
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
                disabled={!isOwner}
                onChange={(e) => {
                  patchLocal({ endDate: e.target.value });
                  Trips.updateTrip(trip.id, { endDate: e.target.value });
                }}
              />
            </Field>
          </div>

          {/* Collaborators */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Packing with
              </span>
              <div className="flex items-center -space-x-2">
                {joinedMembers.map((m) => (
                  <span key={m.userId} title={m.userId === meId ? "You" : m.name ?? m.handle ?? "Member"}>
                    <Avatar name={m.userId === meId ? myIdentity.name : m.name} avatar={m.userId === meId ? myIdentity.avatar : m.avatar} />
                  </span>
                ))}
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={openInvite}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-accent hover:bg-surface-2/70"
                >
                  <UserPlus size={14} /> Invite
                </button>
              )}
            </div>

            {inviteOpen && isOwner && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-line">
                {following === null ? (
                  <p className="px-4 py-3 text-sm text-muted">Loading…</p>
                ) : invitable.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">
                    {(following ?? []).length === 0
                      ? "Follow people to invite them to a trip."
                      : "Everyone you follow is already on this trip."}
                  </p>
                ) : (
                  invitable.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                    >
                      <Avatar name={u.name} avatar={u.avatar} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted">@{u.handle}</span>
                      </span>
                      <Button variant="outline" onClick={() => invite(u)}>
                        Invite
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Pack items — Your bag / Everyone */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="heading text-lg">
                Pack items{" "}
                <span className="text-sm font-normal text-muted">({headerCount} packed)</span>
              </h3>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-sm">
                  <button
                    type="button"
                    onClick={() => setPackView("mine")}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${
                      packView === "mine" ? "bg-surface text-accent shadow-sm" : "text-muted"
                    }`}
                  >
                    Your bag
                  </button>
                  <button
                    type="button"
                    onClick={() => setPackView("everyone")}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${
                      packView === "everyone" ? "bg-surface text-accent shadow-sm" : "text-muted"
                    }`}
                  >
                    Everyone
                  </button>
                </div>
                {packView === "mine" && (
                  <Button
                    variant="outline"
                    onClick={suggest}
                    disabled={myPacked.length < 2}
                    title={myPacked.length < 2 ? "Pack at least 2 items" : "Suggest outfits"}
                  >
                    <Sparkles size={15} /> Suggest outfits
                  </Button>
                )}
              </div>
            </div>

            {packView === "mine" ? (
              owned.length === 0 ? (
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
                      const on = myRefs.has(it.id);
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
                          <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
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
              )
            ) : (
              <div className="space-y-5">
                {groups.map(({ member, items: gi }) => (
                  <div key={member.userId}>
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <Avatar
                        name={member.userId === meId ? myIdentity.name : member.name}
                        avatar={member.userId === meId ? myIdentity.avatar : member.avatar}
                        size={28}
                      />
                      <span className="text-sm font-semibold">
                        {member.userId === meId ? "You" : member.name || member.handle || "Member"}
                      </span>
                      <span className="text-xs text-muted">· {gi.length} packed</span>
                    </div>
                    {gi.length === 0 ? (
                      <p className="pl-10 text-xs text-muted">Nothing packed yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2.5 pl-10">
                        {gi.map((ti) => (
                          <span
                            key={ti.id}
                            className="h-16 w-14 overflow-hidden rounded-lg border border-line bg-surface-2"
                            title={ti.itemName ?? ""}
                          >
                            {ti.itemImageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={ti.itemImageUrl}
                                alt={ti.itemName ?? ""}
                                className="h-full w-full object-cover"
                              />
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suggested capsule outfits (from your own packed pieces) */}
          {capsules.length > 0 && (
            <div>
              <h3 className="heading mb-3 text-lg">Capsule outfits</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {capsules.map((ids, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface p-3">
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
