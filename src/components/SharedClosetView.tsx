"use client";

import {
  ChevronLeft,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fetchFollowingUsers, type FollowUser } from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";
import * as SC from "@/lib/shared-closet";
import { Button, Chip, EmptyState, inputClass } from "./ui";

// Closet category grouping for the "add from my closet" picker — mirrors
// WardrobeView's MAIN_TABS so it feels like browsing your closet.
const MAIN_TABS = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Pants", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes"] },
  { key: "accessories", label: "Accessories", cats: ["accessory", "bag"] },
] as const;
type MainTabKey = (typeof MAIN_TABS)[number]["key"];

function portal(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

function Avatar({
  name,
  avatar,
  size = 30,
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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt={name ?? ""}
        className="shrink-0 rounded-full border border-surface object-cover"
        style={{ width: size, height: size }}
      />
    );
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

/**
 * Shared Closets — a collaborative, co-owned closet a small group edits together
 * (AJA-212). Rendered inside the Closet tab's "Shared" segment. List of your shared
 * closets → open one → a co-owned grid every member can add to and edit. Mirrors
 * TravelView's list/detail + invite + realtime structure; the co-ownership (any
 * member edits/removes any item) is enforced by RLS in the shared_closet_items table.
 */
export function SharedClosetView() {
  const { items, profile } = useWardrobe();
  const owned = useMemo(() => items.filter((it) => !it.wishlist && it.imageUrl), [items]);
  const myIdentity = useMemo<SC.Identity>(
    () => ({
      name: profile.displayName || "You",
      handle: profileHandle(profile),
      avatar: profile.avatarUrl,
    }),
    [profile],
  );

  const [meId, setMeId] = useState<string | null>(null);
  const [closets, setClosets] = useState<SC.SharedCloset[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [invites, setInvites] = useState<SC.PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closetItems, setClosetItems] = useState<SC.SharedClosetItem[]>([]);
  const [members, setMembers] = useState<SC.ClosetMember[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSel, setAddSel] = useState<Set<string>>(new Set());
  const [addTab, setAddTab] = useState<MainTabKey>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [following, setFollowing] = useState<FollowUser[] | null>(null);
  const [editItem, setEditItem] = useState<SC.SharedClosetItem | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const closet = closets.find((c) => c.id === selectedId) ?? null;
  const isOwner = closet ? closet.ownerId === meId : false;
  const joinedMembers = useMemo(
    () => members.filter((m) => m.status === "joined"),
    [members],
  );
  const myRefs = useMemo(
    () => new Set(closetItems.filter((it) => it.addedBy === meId).map((it) => it.itemRef)),
    [closetItems, meId],
  );
  const pickerItems = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === addTab);
    if (!g?.cats) return owned;
    const cats = g.cats as readonly string[];
    return owned.filter((it) => cats.includes(it.category));
  }, [owned, addTab]);
  const memberName = useCallback(
    (id: string) =>
      id === meId ? "You" : members.find((m) => m.userId === id)?.name ?? "A member",
    [members, meId],
  );

  const reload = useCallback(async () => {
    const [list, cs, inv] = await Promise.all([
      SC.listSharedClosets(),
      SC.closetItemCounts(),
      SC.listPendingInvites(),
    ]);
    setClosets(list);
    setCounts(cs);
    setInvites(inv);
  }, []);

  // Initial load.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const me = await SC.currentUserId();
        const [list, cs, inv] = await Promise.all([
          SC.listSharedClosets(),
          SC.closetItemCounts(),
          SC.listPendingInvites(),
        ]);
        if (!alive) return;
        setMeId(me);
        setClosets(list);
        setCounts(cs);
        setInvites(inv);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load items + roster for the selected closet.
  const refetchSelected = useCallback(async () => {
    if (!selectedId) return;
    const [its, mem] = await Promise.all([
      SC.listClosetItems(selectedId),
      SC.listMembers(selectedId),
    ]);
    setClosetItems(its);
    setMembers(mem);
    setCounts((c) => ({ ...c, [selectedId]: its.length }));
  }, [selectedId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selectedId) {
        setClosetItems([]);
        setMembers([]);
        return;
      }
      const [its, mem] = await Promise.all([
        SC.listClosetItems(selectedId),
        SC.listMembers(selectedId),
      ]);
      if (alive) {
        setClosetItems(its);
        setMembers(mem);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  // Live sync: refetch this closet's items + roster whenever the server changes.
  useEffect(() => {
    if (!selectedId) return;
    return SC.subscribeSharedCloset(selectedId, () => {
      void refetchSelected();
    });
  }, [selectedId, refetchSelected]);

  const openCloset = (id: string) => {
    setSelectedId(id);
    setConfirmDeleteId(null);
    setAddOpen(false);
    setAddSel(new Set());
    setInviteOpen(false);
  };

  const createCloset = async () => {
    const c = await SC.createSharedCloset("Shared closet", myIdentity);
    setClosets((prev) => [c, ...prev]);
    setCounts((x) => ({ ...x, [c.id]: 0 }));
    openCloset(c.id);
    setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 0);
  };

  const patchName = (name: string) => {
    if (!closet) return;
    setClosets((prev) => prev.map((c) => (c.id === closet.id ? { ...c, name } : c)));
  };

  const removeCloset = async (id: string) => {
    setConfirmDeleteId(null);
    const rest = closets.filter((c) => c.id !== id);
    setClosets(rest);
    if (selectedId === id) setSelectedId(null);
    try {
      await SC.deleteSharedCloset(id);
    } catch {
      await reload();
    }
  };

  const toggleSel = (id: string) => {
    setAddSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmAdd = async () => {
    if (!closet) return;
    const picks = owned.filter((it) => addSel.has(it.id));
    if (!picks.length) {
      setAddOpen(false);
      return;
    }
    // Optimistic: show the picks immediately.
    const optimistic: SC.SharedClosetItem[] = picks
      .filter((it) => !myRefs.has(it.id))
      .map((it) => ({
        id: `tmp-${it.id}`,
        closetId: closet.id,
        addedBy: meId ?? "",
        itemRef: it.id,
        name: it.name,
        imageUrl: it.imageUrl,
        category: it.category,
        brand: it.brand ?? null,
        color: it.color ?? null,
        createdAt: "",
      }));
    setClosetItems((prev) => [...prev, ...optimistic]);
    setAddSel(new Set());
    setAddOpen(false);
    try {
      await SC.addItemsFromMyCloset(closet.id, picks);
    } finally {
      await refetchSelected();
    }
  };

  const removeItem = async (item: SC.SharedClosetItem) => {
    setClosetItems((prev) => prev.filter((it) => it.id !== item.id));
    setEditItem(null);
    try {
      if (!item.id.startsWith("tmp-")) await SC.removeClosetItem(item.id);
    } catch {
      await refetchSelected();
    }
  };

  const saveItemEdit = async (patch: { name?: string; category?: string }) => {
    if (!editItem) return;
    const target = editItem;
    setClosetItems((prev) =>
      prev.map((it) => (it.id === target.id ? { ...it, ...patch } : it)),
    );
    setEditItem(null);
    try {
      if (!target.id.startsWith("tmp-")) await SC.updateClosetItem(target.id, patch);
    } catch {
      await refetchSelected();
    }
  };

  const openInvite = async () => {
    setInviteOpen((v) => !v);
    if (following === null && meId) {
      setFollowing(await fetchFollowingUsers(meId));
    }
  };

  const invite = async (u: FollowUser) => {
    if (!closet) return;
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
      await SC.inviteMember(closet.id, u, myIdentity);
    } catch {
      setMembers(await SC.listMembers(closet.id));
    }
  };

  const respond = async (closetId: string, accept: boolean) => {
    setInvites((prev) => prev.filter((i) => i.closet.id !== closetId));
    try {
      await SC.respondInvite(closetId, accept);
    } finally {
      await reload();
      if (accept) setSelectedId(closetId);
    }
  };

  const leave = async (closetId: string) => {
    setSelectedId(null);
    setClosets((prev) => prev.filter((c) => c.id !== closetId));
    try {
      await SC.leaveSharedCloset(closetId);
    } catch {
      await reload();
    }
  };

  const invitesSection = invites.length > 0 && (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        Closet invites
      </p>
      {invites.map((inv) => (
        <div
          key={inv.closet.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {inv.closet.name || "Shared closet"}
            </span>
            <span className="block truncate text-xs text-muted">
              {inv.inviterName ? `${inv.inviterName} invited you` : "You're invited"}
            </span>
          </span>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => respond(inv.closet.id, false)}>
              Decline
            </Button>
            <Button onClick={() => respond(inv.closet.id, true)}>Accept</Button>
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    );
  }

  // ---- Detail view (a closet is open) ----
  if (closet) {
    const memberIds = new Set(members.map((m) => m.userId));
    const invitable = (following ?? []).filter((u) => !memberIds.has(u.id));
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="-ml-1 inline-flex items-center gap-1 text-sm font-medium text-accent"
        >
          <ChevronLeft size={18} /> Shared closets
        </button>

        {/* Name (owner edits; members see it read-only) + owner delete. */}
        <div className="flex items-start gap-2">
          <input
            ref={nameRef}
            className={`${inputClass} flex-1 text-lg font-semibold`}
            value={closet.name}
            disabled={!isOwner}
            onChange={(e) => patchName(e.target.value)}
            onBlur={(e) => isOwner && SC.renameSharedCloset(closet.id, e.target.value)}
            placeholder="Shared closet"
          />
          {isOwner &&
            (confirmDeleteId === closet.id ? (
              <Button variant="danger" onClick={() => removeCloset(closet.id)}>
                Delete?
              </Button>
            ) : (
              <button
                type="button"
                aria-label="Delete shared closet"
                onClick={() => setConfirmDeleteId(closet.id)}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:border-red-300/60 hover:text-red-600"
              >
                <Trash2 size={17} />
              </button>
            ))}
        </div>

        {/* Members + invite (owner) / leave (member). */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Sharing with
            </span>
            <div className="flex items-center -space-x-2">
              {joinedMembers.map((m) => (
                <span key={m.userId} title={m.userId === meId ? "You" : m.name ?? m.handle ?? "Member"}>
                  <Avatar
                    name={m.userId === meId ? myIdentity.name : m.name}
                    avatar={m.userId === meId ? myIdentity.avatar : m.avatar}
                  />
                </span>
              ))}
            </div>
            {isOwner ? (
              <button
                type="button"
                onClick={openInvite}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-accent hover:bg-surface-2/70"
              >
                <UserPlus size={14} /> Invite
              </button>
            ) : (
              <button
                type="button"
                onClick={() => leave(closet.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-muted hover:text-red-600"
              >
                Leave
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
                    ? "Follow people to invite them to a shared closet."
                    : "Everyone you follow is already here."}
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

        {/* Items — the co-owned grid. */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="heading text-lg">
              Items <span className="text-sm font-normal text-muted">({closetItems.length})</span>
            </h3>
            <Button variant="outline" onClick={() => setAddOpen((v) => !v)} disabled={owned.length === 0}>
              <Plus size={15} /> Add from my closet
            </Button>
          </div>

          {addOpen && (
            <div className="mb-4 rounded-2xl border border-line bg-surface-2/40 p-3">
              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
                {MAIN_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setAddTab(t.key)}
                    className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
                      addTab === t.key
                        ? "border-accent font-medium text-accent"
                        : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {pickerItems.map((it) => {
                  const added = myRefs.has(it.id);
                  const on = addSel.has(it.id) || added;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      disabled={added}
                      onClick={() => toggleSel(it.id)}
                      className={`relative aspect-[3/4] overflow-hidden rounded-xl border transition-all ${
                        on ? "border-accent ring-2 ring-accent/30" : "border-line opacity-80 hover:opacity-100"
                      } ${added ? "cursor-default" : ""}`}
                      title={it.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                      {on && (
                        <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                          {added ? "Added" : "✓"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <Button className="mt-3 w-full" onClick={confirmAdd} disabled={addSel.size === 0}>
                Add {addSel.size > 0 ? `(${addSel.size})` : ""}
              </Button>
            </div>
          )}

          {closetItems.length === 0 && !addOpen ? (
            <EmptyState
              title="No items yet"
              subtitle="Add pieces from your closet — everyone here can add and edit them."
              action={
                <Button onClick={() => setAddOpen(true)} disabled={owned.length === 0}>
                  <Plus size={15} /> Add from my closet
                </Button>
              }
            />
          ) : (
            <div className="-mx-4 grid grid-cols-3 border-t border-line">
              {closetItems.map((it, i) => (
                <div
                  key={it.id}
                  className={`relative border-b border-line ${i % 3 !== 2 ? "border-r" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setEditItem(it)}
                    className="block w-full text-left"
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface">
                      {it.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt={it.name ?? ""} loading="lazy" className="h-full w-full object-contain" />
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-center text-[12.5px] text-muted">
                        {it.brand?.trim() || it.name || "Item"}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove from shared closet"
                    onClick={() => removeItem(it)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {editItem &&
          portal(
            <ItemEditSheet
              item={editItem}
              addedByLabel={memberName(editItem.addedBy)}
              onSave={saveItemEdit}
              onRemove={() => removeItem(editItem)}
              onClose={() => setEditItem(null)}
            />,
          )}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          A closet you build together — everyone can add and edit.
        </p>
        <Button onClick={createCloset}>
          <Plus size={15} /> New
        </Button>
      </div>

      {invitesSection}

      {closets.length === 0 ? (
        <EmptyState
          title="No shared closets yet"
          subtitle="Create one and invite people you follow to build a closet together — a couple's wardrobe, a capsule with friends, anything."
          action={
            <Button onClick={createCloset}>
              <Users size={15} /> New shared closet
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2.5">
          {closets.map((c) => {
            const owner = c.ownerId === meId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => openCloset(c.id)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-left transition-colors hover:border-foreground/30"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {c.name || "Shared closet"}
                    {!owner && (
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                        shared with you
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {counts[c.id] ?? 0} item{(counts[c.id] ?? 0) === 1 ? "" : "s"}
                  </span>
                </span>
                <Users size={18} className="shrink-0 text-muted" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bottom-sheet editor for one shared item (any member — co-owned). */
function ItemEditSheet({
  item,
  addedByLabel,
  onSave,
  onRemove,
  onClose,
}: {
  item: SC.SharedClosetItem;
  addedByLabel: string;
  onSave: (patch: { name?: string; category?: string }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name ?? "");
  const [category, setCategory] = useState(item.category ?? "");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit item"
      >
        <div className="native-sheet-handle" />
        <div className="mb-3 flex items-center justify-center overflow-hidden">
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name ?? ""} className="h-40 w-40 rounded-2xl object-contain" />
          )}
        </div>
        <p className="mb-3 text-center text-[11px] text-muted">Added by {addedByLabel}</p>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Name
        </label>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
        />

        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-muted">
          Category
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Chip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            variant="danger"
            onClick={onRemove}
            className="!px-3"
            aria-label="Remove from shared closet"
          >
            <Trash2 size={15} /> Remove
          </Button>
          <Button
            className="ml-auto"
            onClick={() => onSave({ name: name.trim() || item.name || "Item", category })}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
