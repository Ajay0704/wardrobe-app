"use client";

import {
  Bookmark,
  Check,
  Heart,
  RefreshCw,
  Shirt,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { affiliateUrl } from "@/lib/affiliate";
import { openExternalUrl } from "@/lib/platform";
import { useWardrobe } from "@/lib/store";
import type { Category, WardrobeItem } from "@/lib/types";
import { CommunityFeed } from "./community/CommunityFeed";
import { useIsNativeApp } from "./NativeAppClass";

/* --------------------------------------------------------------- types */

interface Piece {
  id: string;
  title: string;
  brand?: string;
  price?: number;
  currency?: string;
  imageUrl: string;
  productUrl: string;
  category?: string;
}

interface FeedCard {
  id: string;
  kind: "look" | "editorial" | "product";
  gender: string;
  title: string;
  subtitle?: string;
  vibes: string[];
  ratio: number;
  heroImage?: string;
  pieces: Piece[];
  saves: number;
}

const CHIPS = ["All", "minimal", "streetwear", "casual", "work", "formal", "party", "cozy"];
const PAGE = 18;

async function fetchFeed(params: {
  cursor?: string | null;
  gender?: string;
  ids?: string[];
}): Promise<{ items: FeedCard[]; nextCursor: string | null }> {
  const sp = new URLSearchParams();
  if (params.ids?.length) {
    sp.set("ids", params.ids.join(","));
  } else {
    sp.set("limit", String(PAGE));
    sp.set("gender", params.gender || "all");
    if (params.cursor) sp.set("cursor", params.cursor);
  }
  try {
    const res = await fetch(`/api/explore/feed?${sp.toString()}`);
    if (!res.ok) return { items: [], nextCursor: null };
    return (await res.json()) as { items: FeedCard[]; nextCursor: string | null };
  } catch {
    return { items: [], nextCursor: null };
  }
}

function money(price?: number, currency?: string): string {
  if (price == null) return "";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${sym}${price % 1 === 0 ? price : price.toFixed(2)}`;
}

/** How much of a look the user already owns (by category). The closet-match hook. */
function lookMatch(pieces: Piece[], items: WardrobeItem[]): { owned: number; total: number } {
  const ownedCats = new Set(items.filter((i) => !i.wishlist).map((i) => i.category));
  let owned = 0;
  for (const p of pieces) if (p.category && ownedCats.has(p.category as Category)) owned++;
  return { owned, total: pieces.length };
}

/**
 * Explore — a content-first fashion feed (Pinterest for outfits). The feed mixes
 * composed outfit "looks", editorial inspiration, and trending products, served
 * gender-aware and interleaved from /api/explore/feed. Pinterest-style masonry;
 * every card is shoppable and cross-referenced against the user's closet.
 */
export function ExploreView() {
  const isNative = useIsNativeApp();
  const { items, profile, savedPinIds, toggleSavePin, addItem, openPhoto } = useWardrobe();
  const gender = profile.shopGender ?? "all";

  const [tab, setTab] = useState<"foryou" | "saved" | "following">("foryou");
  const [chip, setChip] = useState("All");
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [savedCards, setSavedCards] = useState<FeedCard[]>([]);
  const [open, setOpen] = useState<FeedCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1900);
  };

  // Initial load + refetch when the gender preference changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDone(false);
    fetchFeed({ gender }).then((r) => {
      if (!alive) return;
      setCards(r.items);
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [gender]);

  const loadMore = useCallback(() => {
    if (loading || done || !cursor) return;
    setLoading(true);
    fetchFeed({ gender, cursor }).then((r) => {
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...r.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
  }, [loading, done, cursor, gender]);

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

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

  // Saved tab: fetch the saved cards by id.
  useEffect(() => {
    if (tab !== "saved") return;
    if (!savedPinIds.length) {
      setSavedCards([]);
      return;
    }
    let alive = true;
    fetchFeed({ ids: savedPinIds }).then((r) => {
      if (alive) setSavedCards(r.items);
    });
    return () => {
      alive = false;
    };
  }, [tab, savedPinIds]);

  const base = tab === "saved" ? savedCards : cards;
  const list = useMemo(
    () => (chip === "All" ? base : base.filter((c) => c.vibes.includes(chip))),
    [base, chip],
  );

  const shopPiece = (p: Piece) =>
    void openExternalUrl(affiliateUrl(p.productUrl) ?? p.productUrl);

  const wishlistPiece = (p: Piece, vibes: string[]) => {
    addItem({
      name: p.brand ? `${p.brand} ${p.title}` : p.title,
      imageUrl: p.imageUrl,
      category: (p.category as Category) ?? "accessory",
      color: "",
      brand: p.brand,
      price: p.price,
      productUrl: p.productUrl,
      tags: vibes,
      seasons: [],
      wishlist: true,
    });
  };

  const moreLikeThis = useMemo(() => {
    if (!open) return [];
    return cards
      .filter((c) => c.id !== open.id && c.vibes.some((v) => open.vibes.includes(v)))
      .slice(0, 8);
  }, [open, cards]);

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
              tab === id ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTab("following")}
          className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
            tab === "following" ? "border-accent text-accent" : "border-transparent text-muted"
          }`}
        >
          Following
        </button>
        {tab === "foryou" && (
          <button
            type="button"
            onClick={() => {
              setChip("All");
              setLoading(true);
              fetchFeed({ gender }).then((r) => {
                setCards(r.items);
                setCursor(r.nextCursor);
                setDone(!r.nextCursor);
                setLoading(false);
              });
            }}
            aria-label="Refresh"
            className="ml-auto -mb-px pb-2 text-muted"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {tab === "following" ? (
        <CommunityFeed />
      ) : (
       <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${
              chip === c ? "bg-foreground text-background" : "border border-line text-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          {tab === "saved"
            ? "Nothing saved yet — tap the heart on anything you love."
            : loading
              ? "Curating your feed…"
              : "No ideas here yet."}
        </div>
      ) : (
        <div style={{ columnCount: 2, columnGap: "12px" }}>
          {list.map((card) => (
            <Card
              key={card.id}
              card={card}
              items={items}
              saved={savedPinIds.includes(card.id)}
              onOpen={() =>
                openPhoto({
                  id: card.id,
                  image: card.heroImage ?? card.pieces[0]?.imageUrl ?? "",
                  title: card.title,
                })
              }
              onSave={() => toggleSavePin(card.id)}
            />
          ))}
        </div>
      )}

      {tab === "foryou" && list.length > 0 && !done && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-muted">
          Finding more ideas…
        </div>
      )}
       </>
      )}

      {open && (
        <Sheet
          card={open}
          items={items}
          saved={savedPinIds.includes(open.id)}
          more={moreLikeThis}
          onClose={() => setOpen(null)}
          onOpenMore={(c) => setOpen(c)}
          onSave={() => toggleSavePin(open.id)}
          onShopPiece={shopPiece}
          onWishlistLook={() => {
            open.pieces.forEach((p) => wishlistPiece(p, open.vibes));
            flash(`Added ${open.pieces.length} to wishlist`);
          }}
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

/* ------------------------------------------------------------------ card */

function Card({
  card,
  items,
  saved,
  onOpen,
  onSave,
}: {
  card: FeedCard;
  items: WardrobeItem[];
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const match = card.kind === "look" ? lookMatch(card.pieces, items) : null;
  const owned = card.kind === "product" && card.pieces[0]?.category
    ? items.some((i) => !i.wishlist && i.category === (card.pieces[0].category as Category))
    : false;

  return (
    <div className="mb-3 break-inside-avoid">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div
          className="relative overflow-hidden rounded-2xl bg-surface-2"
          style={{ aspectRatio: String(1 / card.ratio) }}
        >
          {card.kind === "look" ? (
            <Collage images={card.pieces.map((p) => p.imageUrl)} />
          ) : (
            <Img src={card.heroImage} />
          )}

          <span
            role="button"
            aria-label={saved ? "Unsave" : "Save"}
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90"
          >
            <Heart size={16} className={saved ? "fill-accent text-accent" : "text-foreground"} />
          </span>

          {card.kind === "look" && (
            <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium">
              <Sparkles size={10} className="mr-1 inline" />
              {card.pieces.length} pieces
            </span>
          )}
          {card.kind === "editorial" && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-6 text-left">
              <span className="block text-sm font-medium text-white">{card.title}</span>
              {card.subtitle && (
                <span className="block text-[11px] text-white/80">{card.subtitle}</span>
              )}
            </span>
          )}

          {match && match.owned > 0 && (
            <span className="absolute bottom-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              you own {match.owned}/{match.total}
            </span>
          )}
          {card.kind === "product" && owned && (
            <span className="absolute bottom-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              similar in closet
            </span>
          )}
        </div>
      </button>

      {card.kind !== "editorial" && (
        <div className="px-1 pt-1.5">
          <p className="truncate text-sm">{card.title}</p>
          <p className="truncate text-xs text-muted">
            {card.kind === "product"
              ? [card.subtitle, money(card.pieces[0]?.price, card.pieces[0]?.currency)]
                  .filter(Boolean)
                  .join(" · ")
              : card.subtitle}
          </p>
        </div>
      )}
    </div>
  );
}

function Img({ src }: { src?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-2">
        <Shirt size={30} className="text-muted" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setErr(true)} className="h-full w-full object-cover" />
  );
}

/** Up to a 2×2 collage of a look's pieces. */
function Collage({ images }: { images: string[] }) {
  const imgs = images.slice(0, 4);
  if (imgs.length <= 1) return <Img src={imgs[0]} />;
  return (
    <div className="grid h-full w-full grid-cols-2 gap-px bg-surface">
      {imgs.map((src, i) => (
        <div key={i} className="overflow-hidden bg-surface-2">
          <Img src={src} />
        </div>
      ))}
      {Array.from({ length: Math.max(0, 4 - imgs.length) }).map((_, i) => (
        <div key={`e${i}`} className="bg-surface-2" />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- sheet */

function Sheet({
  card,
  items,
  saved,
  more,
  onClose,
  onOpenMore,
  onSave,
  onShopPiece,
  onWishlistLook,
}: {
  card: FeedCard;
  items: WardrobeItem[];
  saved: boolean;
  more: FeedCard[];
  onClose: () => void;
  onOpenMore: (c: FeedCard) => void;
  onSave: () => void;
  onShopPiece: (p: Piece) => void;
  onWishlistLook: () => void;
}) {
  const match = card.kind === "look" ? lookMatch(card.pieces, items) : null;
  const ownedCats = new Set(items.filter((i) => !i.wishlist).map((i) => i.category));
  const heading =
    card.kind === "look" ? "Get the look" : card.kind === "editorial" ? "Shop the vibe" : "Product";

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={card.title}
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">{heading}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface-2" style={{ aspectRatio: String(1 / card.ratio) }}>
          {card.kind === "look" ? (
            <Collage images={card.pieces.map((p) => p.imageUrl)} />
          ) : (
            <Img src={card.heroImage} />
          )}
        </div>

        <p className="mt-3 font-medium">{card.title}</p>
        {card.subtitle && <p className="text-sm text-muted">{card.subtitle}</p>}

        {match && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <Check size={14} className="text-accent" />
            You own {match.owned} of {match.total} in your closet
          </p>
        )}

        {/* Shoppable pieces */}
        <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {card.pieces.map((p) => {
            const owned = p.category && ownedCats.has(p.category as Category);
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  <Img src={p.imageUrl} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.title}</p>
                  <p className="truncate text-xs text-muted">
                    {[p.brand, money(p.price, p.currency)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {owned ? (
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <Check size={13} /> owned
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onShopPiece(p)}
                    className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium"
                  >
                    <ShoppingBag size={13} /> Shop
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          {card.kind !== "editorial" && (
            <ActionBtn icon={Bookmark} label="Wishlist" onClick={onWishlistLook} />
          )}
          <ActionBtn icon={Heart} label={saved ? "Saved" : "Save"} active={saved} onClick={onSave} />
        </div>

        {more.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">More like this</p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
              {more.map((c) => (
                <button key={c.id} type="button" onClick={() => onOpenMore(c)} className="w-24 shrink-0">
                  <div className="overflow-hidden rounded-xl bg-surface-2" style={{ aspectRatio: "1 / 1.2" }}>
                    {c.kind === "look" ? (
                      <Collage images={c.pieces.map((p) => p.imageUrl)} />
                    ) : (
                      <Img src={c.heroImage} />
                    )}
                  </div>
                  <p className="truncate pt-1 text-[11px] text-muted">{c.title}</p>
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
