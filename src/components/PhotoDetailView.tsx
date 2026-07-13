"use client";

import {
  Bookmark,
  Check,
  ChevronLeft,
  ExternalLink,
  Heart,
  MessageCircle,
  Share,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/supabase/client";
import { useWardrobe } from "@/lib/store";
import type { Category } from "@/lib/types";

interface Detection {
  detectionId: string;
  name: string;
  category: string;
  attributes: Record<string, unknown>;
  cropUrl: string;
}
interface ShopItem {
  productId: string;
  brand: string | null;
  title: string;
  priceCents: number | null;
  currency: string;
  imageUrl: string;
  buyUrl: string;
  category: string;
  tag: "similar" | "goes-with";
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}
function logEvent(type: string, extra: Record<string, unknown> = {}) {
  void api("/api/events", { type, ...extra }).catch(() => {});
}
function price(cents: number | null, currency: string): string {
  if (cents == null) return "";
  const sym = currency === "USD" ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}
/** Coarse category from a normalized box — mirrors the server, for the live drag label. */
function labelFor(box: { x: number; y: number; w: number; h: number }): string {
  const cy = box.y + box.h / 2;
  if (box.h >= 0.55 && box.w >= 0.4) return "Dress";
  if (cy < 0.4) return "Top";
  if (cy < 0.72) return "Bottom";
  return "Shoes";
}

export function PhotoDetailView() {
  const photoCard = useWardrobe((s) => s.photoCard);
  const addItem = useWardrobe((s) => s.addItem);
  const savedPinIds = useWardrobe((s) => s.savedPinIds);
  const toggleSavePin = useWardrobe((s) => s.toggleSavePin);

  const stageRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dominant, setDominant] = useState<string | null>(null);
  const [shopFor, setShopFor] = useState<Detection | null>(null);
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };

  const saved = photoCard ? savedPinIds.includes(photoCard.id) : false;

  // Log the view + auto-detect the dominant (center) item to seed "More to explore".
  useEffect(() => {
    if (!photoCard?.image) return;
    logEvent("view", { postId: photoCard.id });
    let alive = true;
    void api<Detection>("/api/detect", {
      imageUrl: photoCard.image,
      postId: photoCard.id,
      box: { x: 0.3, y: 0.28, w: 0.4, h: 0.42 },
    })
      .then((d) => {
        if (alive) setDominant(d.detectionId);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [photoCard?.id, photoCard?.image]);

  const runDetect = useCallback(
    async (box: { x: number; y: number; w: number; h: number }) => {
      if (!photoCard?.image || busy) return;
      setBusy(true);
      try {
        const d = await api<Detection>("/api/detect", {
          imageUrl: photoCard.image,
          postId: photoCard.id,
          box,
        });
        setDetection(d);
        setSheetOpen(true);
        logEvent("grab", { postId: photoCard.id, payload: { category: d.category } });
      } catch (e) {
        flash((e as Error).message || "Couldn't detect that item");
      } finally {
        setBusy(false);
      }
    },
    [photoCard, busy],
  );

  // --- macOS-screenshot marquee: crosshair drag → normalized box → detect ---
  const onPointerDown = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault();
    setSheetOpen(false);
    const rect = stage.getBoundingClientRect();
    const ox = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const oy = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const draw = (cx: number, cy: number) => {
      cx = Math.max(0, Math.min(rect.width, cx));
      cy = Math.max(0, Math.min(rect.height, cy));
      const x = Math.min(ox, cx), y = Math.min(oy, cy);
      const w = Math.abs(cx - ox), h = Math.abs(cy - oy);
      setMarquee({ x, y, w, h });
      if (w > 10 || h > 10) {
        setLabel(labelFor({ x: x / rect.width, y: y / rect.height, w: w / rect.width, h: h / rect.height }));
      } else setLabel(null);
    };
    draw(ox, oy);

    const move = (ev: PointerEvent) => draw(ev.clientX - rect.left, ev.clientY - rect.top);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee((m) => {
        const b = m ?? { x: ox, y: oy, w: 0, h: 0 };
        const box = {
          x: b.x / rect.width,
          y: b.y / rect.height,
          w: b.w / rect.width,
          h: b.h / rect.height,
        };
        // tiny → treat as a point tap (server expands it)
        void runDetect(b.w < 12 && b.h < 12 ? { x: ox / rect.width, y: oy / rect.height, w: 0, h: 0 } : box);
        return null;
      });
      setLabel(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onOwn = async () => {
    if (!detection) return;
    try {
      await api("/api/closet", { detectionId: detection.detectionId });
      addItem({
        imageUrl: detection.cropUrl,
        name: detection.name,
        category: detection.category as Category,
        color: "#9C988E",
        tags: [detection.category],
        seasons: [],
        wishlist: false,
      });
      flash("Added to your closet");
    } catch (e) {
      flash((e as Error).message || "Couldn't save");
    }
    setSheetOpen(false);
  };
  const onWishlist = async () => {
    if (!detection) return;
    try {
      await api("/api/wishlist", { detectionId: detection.detectionId });
      flash("Saved to wishlist");
    } catch (e) {
      flash((e as Error).message || "Couldn't save");
    }
    setSheetOpen(false);
  };
  const onShop = () => {
    if (!detection) return;
    setShopFor(detection);
    setSheetOpen(false);
  };

  if (!photoCard) {
    return <div className="py-20 text-center text-sm text-muted">No photo selected.</div>;
  }

  return (
    <div className="-mx-4 -mt-5">
      {/* Hero stage with crosshair marquee */}
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        className="relative w-full select-none overflow-hidden bg-surface-2"
        style={{
          height: "58vh",
          cursor: "crosshair",
          touchAction: "none",
          backgroundImage: `url('${photoCard.image}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {marquee && (marquee.w > 2 || marquee.h > 2) && (
          <div
            className="pointer-events-none absolute rounded-lg border-2 border-white"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
              background: "rgba(194,87,51,.14)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,.18)",
            }}
          >
            {label && (
              <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                {label}
              </span>
            )}
          </div>
        )}
      </div>

      <p className="px-4 pt-2.5 text-center text-[13px] text-muted">
        Drag across any item to grab it — like a screenshot{busy ? " · detecting…" : ""}
      </p>

      {/* Social row */}
      <div className="mx-4 mt-2 flex items-center justify-around border-y border-line py-2.5">
        <SocBtn icon={Heart} label="Like" active={liked} onClick={() => { setLiked((v) => !v); flash(liked ? "Unliked" : "Liked"); }} />
        <SocBtn icon={MessageCircle} label="Comment" onClick={() => flash("Comments coming soon")} />
        <SocBtn icon={Share} label="Share" onClick={() => flash("Share")} />
        <SocBtn icon={Bookmark} label="Save" active={saved} accent onClick={() => { toggleSavePin(photoCard.id); flash(saved ? "Removed" : "Saved to your boards"); }} />
      </div>

      {/* More to explore — seeded from the dominant item */}
      <h3 className="px-4 pb-1 pt-4 text-[15px] font-semibold">More to explore</h3>
      {dominant ? (
        <ShopFeed detectionId={dominant} postId={photoCard.id} />
      ) : (
        <p className="px-4 py-8 text-center text-xs text-muted">Finding related pieces…</p>
      )}

      {/* Choice sheet */}
      {sheetOpen && detection && (
        <div className="fixed inset-0 z-[60]" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-surface p-4 pb-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-4 flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-xl border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detection.cropUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-[15px] font-semibold">{detection.name}</p>
                <p className="text-xs text-muted">From your selection</p>
              </div>
            </div>
            <div className="mb-2.5 flex gap-2.5">
              <ChoiceBtn icon={Check} label="I own this" onClick={onOwn} />
              <ChoiceBtn icon={Heart} label="Add to wishlist" onClick={onWishlist} />
            </div>
            <button
              type="button"
              onClick={onShop}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-accent-foreground"
            >
              <ShoppingBag size={18} /> Shop similar
            </button>
          </div>
        </div>
      )}

      {/* Shop this piece — full overlay with the two interleaved feeds */}
      {shopFor && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
          <div className="flex items-center gap-2 border-b border-line px-3 py-3">
            <button type="button" aria-label="Back" onClick={() => setShopFor(null)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2">
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="text-[15px] font-semibold leading-tight">Shop this piece</p>
              <p className="text-xs text-muted">{shopFor.name} · similar + pieces that complete the look</p>
            </div>
          </div>
          <div className="native-main flex-1 overflow-y-auto px-4 pb-8 pt-3">
            <ShopFeed detectionId={shopFor.detectionId} postId={photoCard.id} />
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">{toast}</p>
        </div>
      )}
    </div>
  );
}

function SocBtn({ icon: Icon, label, active, accent, onClick }: { icon: LucideIcon; label: string; active?: boolean; accent?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 text-[11px] text-muted">
      <Icon size={22} className={active ? (accent ? "fill-accent text-accent" : "fill-[#D4537E] text-[#D4537E]") : "text-foreground"} />
      <span>{label}</span>
    </button>
  );
}
function ChoiceBtn({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-16 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface text-xs font-medium">
      <Icon size={19} />
      {label}
    </button>
  );
}

/** Interleaved Similar + Goes-with masonry with infinite scroll. */
function ShopFeed({ detectionId, postId }: { detectionId: string; postId: string }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [cursors, setCursors] = useState<{ sim: string | null; goes: string | null }>({ sim: null, goes: null });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const startedRef = useRef(false);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const moreRef = useRef<() => void>(() => {});

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const [sim, goes] = await Promise.all([
        cursors.sim === "END"
          ? { items: [], nextCursor: null }
          : api<{ items: ShopItem[]; nextCursor: string | null }>("/api/similar", { detectionId, cursor: cursors.sim, limit: 8 }),
        cursors.goes === "END"
          ? { items: [], nextCursor: null }
          : api<{ items: ShopItem[]; nextCursor: string | null }>("/api/goes-with", { detectionId, cursor: cursors.goes, limit: 8 }),
      ]);
      const merged: ShopItem[] = [];
      const n = Math.max(sim.items.length, goes.items.length);
      for (let i = 0; i < n; i++) {
        if (sim.items[i]) merged.push(sim.items[i]);
        if (goes.items[i]) merged.push(goes.items[i]);
      }
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.productId));
        return [...prev, ...merged.filter((m) => !seen.has(m.productId))];
      });
      const nextSim = sim.nextCursor ?? "END";
      const nextGoes = goes.nextCursor ?? "END";
      setCursors({ sim: nextSim, goes: nextGoes });
      if (nextSim === "END" && nextGoes === "END") setDone(true);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [loading, done, cursors, detectionId]);

  useEffect(() => {
    moreRef.current = loadMore;
  }, [loadMore]);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void loadMore();
    }
  }, [loadMore]);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    ioRef.current?.disconnect();
    if (!node) return;
    const root = node.closest(".native-main") as HTMLElement | null;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && moreRef.current(), { root, rootMargin: "500px" });
    io.observe(node);
    ioRef.current = io;
  }, []);

  const onSave = (it: ShopItem) => {
    setSavedSet((prev) => new Set(prev).add(it.productId));
    void api("/api/wishlist", { productId: it.productId }).catch(() => {});
  };
  const onOpen = (it: ShopItem) => {
    logEvent("shop_click", { postId, productId: it.productId, payload: { tag: it.tag } });
    window.open(it.buyUrl, "_blank", "noopener");
  };

  if (done && items.length === 0) {
    return <p className="px-4 py-8 text-center text-xs text-muted">No matching products yet.</p>;
  }
  return (
    <>
      <div style={{ columnCount: 2, columnGap: "10px" }}>
        {items.map((it) => (
          <ProductCard key={it.productId + it.tag} it={it} saved={savedSet.has(it.productId)} onSave={() => onSave(it)} onOpen={() => onOpen(it)} />
        ))}
      </div>
      {!done && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-muted">
          {loading ? "Loading…" : ""}
        </div>
      )}
    </>
  );
}

function ProductCard({ it, saved, onSave, onOpen }: { it: ShopItem; saved: boolean; onSave: () => void; onOpen: () => void }) {
  const isSim = it.tag === "similar";
  return (
    <div className="mb-2.5 break-inside-avoid overflow-hidden rounded-xl border border-line bg-surface">
      <button type="button" onClick={onOpen} className="relative block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.imageUrl} alt={it.title} className="w-full object-cover" style={{ aspectRatio: "3/4" }} />
        <span
          className={`absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            isSim ? "bg-[#E6F1FB] text-[#185FA5]" : "bg-accent-soft text-accent"
          }`}
        >
          {isSim ? <Sparkles size={10} /> : null}
          {isSim ? "Similar" : "Goes with"}
        </span>
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-0.5 text-[11px] text-muted">
          <ExternalLink size={11} /> View
        </span>
      </button>
      <div className="p-2">
        {it.brand && <p className="text-[11px] text-muted">{it.brand}</p>}
        <p className="line-clamp-2 text-[12px] leading-snug">{it.title}</p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[14px] font-semibold">{price(it.priceCents, it.currency)}</span>
          <button
            type="button"
            aria-label="Save to wishlist"
            onClick={onSave}
            className="flex h-7 w-7 items-center justify-center rounded-full"
          >
            <Heart size={16} className={saved ? "fill-[#D4537E] text-[#D4537E]" : "text-foreground"} />
          </button>
        </div>
      </div>
    </div>
  );
}
