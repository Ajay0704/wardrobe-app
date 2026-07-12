"use client";

import {
  Check,
  Heart,
  RefreshCw,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { affiliateUrl } from "@/lib/affiliate";
import { openExternalUrl } from "@/lib/platform";
import { useWardrobe } from "@/lib/store";
import type { Category, WardrobeItem } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";

/** One external product from /api/explore/feed. */
interface FeedItem {
  id: string;
  source: string;
  title: string;
  brand?: string;
  price?: number;
  currency?: string;
  imageUrl: string;
  productUrl: string;
  category?: string;
  colors: string[];
  vibeTags: string[];
  saves: number;
}

const CHIPS = [
  "All",
  "minimal",
  "streetwear",
  "casual",
  "work",
  "formal",
  "party",
  "cozy",
  "athleisure",
];
const PAGE = 20;

async function fetchFeed(params: {
  cursor?: string | null;
  vibe?: string;
  ids?: string[];
}): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const sp = new URLSearchParams();
  if (params.ids?.length) {
    sp.set("ids", params.ids.join(","));
  } else {
    sp.set("limit", String(PAGE));
    if (params.vibe && params.vibe !== "All") sp.set("vibe", params.vibe);
    if (params.cursor) sp.set("cursor", params.cursor);
  }
  try {
    const res = await fetch(`/api/explore/feed?${sp.toString()}`);
    if (!res.ok) return { items: [], nextCursor: null };
    return (await res.json()) as { items: FeedItem[]; nextCursor: string | null };
  } catch {
    return { items: [], nextCursor: null };
  }
}

function money(price?: number, currency?: string): string {
  if (price == null) return "";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const val = price % 1 === 0 ? String(price) : price.toFixed(2);
  return `${sym}${val}`;
}

/** Items the user already owns in the same category — the closet-match hook. */
function ownedSimilar(p: FeedItem, items: WardrobeItem[]): WardrobeItem[] {
  if (!p.category) return [];
  return items.filter((it) => !it.wishlist && it.category === p.category);
}

/**
 * Explore — a real, endless fashion feed of EXTERNAL products (eBay / Skimlinks;
 * DummyJSON while those approve). Served from /api/explore/feed with cursor
 * pagination. No user closet content lives in the feed; instead each product is
 * cross-referenced against the user's closet ("similar in your closet") and can
 * be shopped or wishlisted.
 */
export function ExploreView() {
  const isNative = useIsNativeApp();
  const { items, savedPinIds, toggleSavePin, addItem } = useWardrobe();

  const [tab, setTab] = useState<"foryou" | "saved">("foryou");
  const [chip, setChip] = useState("All");
  const [pins, setPins] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [savedItems, setSavedItems] = useState<FeedItem[]>([]);
  const [openPin, setOpenPin] = useState<FeedItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1900);
  };

  // Initial load + refetch on chip change.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDone(false);
    fetchFeed({ vibe: chip }).then((r) => {
      if (!alive) return;
      setPins(r.items);
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [chip]);

  const loadMore = useCallback(() => {
    if (loading || done || !cursor) return;
    setLoading(true);
    fetchFeed({ vibe: chip, cursor }).then((r) => {
      setPins((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...r.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
  }, [loading, done, cursor, chip]);

  // Keep the observer callback pointed at the latest loadMore without
  // re-creating the observer on every state change.
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Infinite scroll: callback ref attaches an observer exactly when the sentinel
  // mounts, scoped to the native scroll container (falls back to the viewport on
  // web). This is more reliable than a useEffect that churns on loadMore changes.
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    ioRef.current?.disconnect();
    ioRef.current = null;
    if (!node) return;
    const root = node.closest(".native-main") as HTMLElement | null;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { root, rootMargin: "800px" },
    );
    io.observe(node);
    ioRef.current = io;
  }, []);

  // Saved tab: fetch the saved products by id.
  useEffect(() => {
    if (tab !== "saved") return;
    if (!savedPinIds.length) {
      setSavedItems([]);
      return;
    }
    let alive = true;
    fetchFeed({ ids: savedPinIds }).then((r) => {
      if (alive) setSavedItems(r.items);
    });
    return () => {
      alive = false;
    };
  }, [tab, savedPinIds]);

  const refresh = () => {
    setChip("All");
    setLoading(true);
    setDone(false);
    fetchFeed({ vibe: "All" }).then((r) => {
      setPins(r.items);
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
  };

  const list = tab === "saved" ? savedItems : pins;

  const shop = (p: FeedItem) =>
    void openExternalUrl(affiliateUrl(p.productUrl) ?? p.productUrl);

  const wishlist = (p: FeedItem) => {
    addItem({
      name: p.brand ? `${p.brand} ${p.title}` : p.title,
      imageUrl: p.imageUrl,
      category: (p.category as Category) ?? "accessory",
      color: "",
      brand: p.brand,
      price: p.price,
      productUrl: p.productUrl,
      tags: p.vibeTags,
      seasons: [],
      wishlist: true,
    });
    flash("Added to wishlist");
  };

  const moreLikeThis = useMemo(() => {
    if (!openPin) return [];
    return pins
      .filter(
        (p) =>
          p.id !== openPin.id &&
          (p.category === openPin.category ||
            p.vibeTags.some((v) => openPin.vibeTags.includes(v))),
      )
      .slice(0, 8);
  }, [openPin, pins]);

  return (
    <div className="space-y-4">
      {!isNative && <h2 className="heading text-2xl">Explore</h2>}

      <div className="flex items-center gap-5 border-b border-line text-sm">
        {(
          [
            ["foryou", "For you"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
              tab === id
                ? "border-accent text-accent"
                : "border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => flash("Following feed — coming soon")}
          className="-mb-px border-b-2 border-transparent pb-2 font-medium text-muted"
        >
          Following
        </button>
        {tab === "foryou" && (
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh"
            className="ml-auto -mb-px pb-2 text-muted"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {tab === "foryou" && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChip(c)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${
                chip === c
                  ? "bg-foreground text-background"
                  : "border border-line text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          {tab === "saved"
            ? "No saved items yet — tap the heart on anything you like."
            : loading
              ? "Loading the feed…"
              : "Nothing here yet."}
        </div>
      ) : (
        <div style={{ columnCount: 2, columnGap: "12px" }}>
          {list.map((pin) => (
            <PinCard
              key={pin.id}
              pin={pin}
              owned={ownedSimilar(pin, items).length > 0}
              saved={savedPinIds.includes(pin.id)}
              onOpen={() => setOpenPin(pin)}
              onSave={() => toggleSavePin(pin.id)}
            />
          ))}
        </div>
      )}

      {tab === "foryou" && list.length > 0 && !done && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-muted">
          Finding more…
        </div>
      )}

      {openPin && (
        <PinSheet
          pin={openPin}
          ownedSimilar={ownedSimilar(openPin, items)}
          saved={savedPinIds.includes(openPin.id)}
          more={moreLikeThis}
          onClose={() => setOpenPin(null)}
          onOpenMore={(p) => setOpenPin(p)}
          onSave={() => toggleSavePin(openPin.id)}
          onShop={() => shop(openPin)}
          onWishlist={() => wishlist(openPin)}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- pin card */

function PinCard({
  pin,
  owned,
  saved,
  onOpen,
  onSave,
}: {
  pin: FeedItem;
  owned: boolean;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mb-3 break-inside-avoid">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative overflow-hidden rounded-2xl bg-surface-2">
          <PinImage src={pin.imageUrl} />
          <span
            role="button"
            aria-label={saved ? "Unsave" : "Save"}
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90"
          >
            <Heart
              size={16}
              className={saved ? "fill-accent text-accent" : "text-foreground"}
            />
          </span>
          {owned && (
            <span className="absolute bottom-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              similar in closet
            </span>
          )}
        </div>
      </button>
      <div className="px-1 pt-1.5">
        <p className="truncate text-sm">{pin.title}</p>
        <p className="text-xs text-muted">
          {[pin.brand, money(pin.price, pin.currency)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}

function PinImage({ src }: { src?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-surface-2">
        <Shirt size={30} className="text-muted" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setErr(true)}
      className="w-full object-cover"
    />
  );
}

/* -------------------------------------------------------------- pin sheet */

function PinSheet({
  pin,
  ownedSimilar,
  saved,
  more,
  onClose,
  onOpenMore,
  onSave,
  onShop,
  onWishlist,
}: {
  pin: FeedItem;
  ownedSimilar: WardrobeItem[];
  saved: boolean;
  more: FeedItem[];
  onClose: () => void;
  onOpenMore: (p: FeedItem) => void;
  onSave: () => void;
  onShop: () => void;
  onWishlist: () => void;
}) {
  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={pin.title}
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">Product</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-muted"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <PinImage src={pin.imageUrl} />
        </div>

        <p className="mt-3 font-medium">{pin.title}</p>
        <p className="text-sm text-muted">
          {[pin.brand, money(pin.price, pin.currency)]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {ownedSimilar.length > 0 && (
          <div className="mt-3 rounded-2xl bg-surface-2 p-3">
            <p className="flex items-center gap-1.5 text-sm">
              <Check size={14} className="text-accent" />
              You own {ownedSimilar.length} similar in your closet
            </p>
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {ownedSimilar.slice(0, 6).map((it) => (
                <div
                  key={it.id}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onShop}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 font-medium text-accent-foreground"
        >
          <ShoppingBag size={17} /> Shop this
        </button>
        <div className="mt-2 flex gap-2">
          <ActionBtn icon={ShoppingCart} label="Wishlist" onClick={onWishlist} />
          <ActionBtn
            icon={Heart}
            label={saved ? "Saved" : "Save"}
            active={saved}
            onClick={onSave}
          />
        </div>

        {more.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">More like this</p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
              {more.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenMore(p)}
                  className="w-24 shrink-0"
                >
                  <div className="overflow-hidden rounded-xl bg-surface-2">
                    <PinImage src={p.imageUrl} />
                  </div>
                  <p className="truncate pt-1 text-[11px] text-muted">
                    {p.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Heart;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border border-line py-2.5 text-xs ${
        active ? "text-accent" : "text-foreground"
      }`}
    >
      <Icon size={18} className={active ? "fill-accent text-accent" : ""} />
      {label}
    </button>
  );
}
