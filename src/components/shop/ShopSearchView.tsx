"use client";

import { AlertTriangle, Check, Search, Shirt } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { searchProducts, type ClosetSignal, type ShopResult } from "@/lib/shop-search";
import { ProductFitOverlay } from "./ProductFitOverlay";

const CHIPS = ["Jeans", "Sneakers", "Shirt", "Jacket", "Dress", "Boots"];

function money(price: number | null, currency: string): string {
  if (price == null) return "";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${sym}${price % 1 === 0 ? price : price.toFixed(2)}`;
}

function Img({ src }: { src?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-2">
        <Shirt size={28} className="text-muted" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setErr(true)} className="h-full w-full object-cover" />
  );
}

/** The corner "closet indicator": owned check, or a pair count coloured by strength. */
function SignalBadge({ signal }: { signal: ClosetSignal }) {
  if (signal.owned === "exact") {
    return (
      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-muted">
        <Check size={11} /> Owned
      </span>
    );
  }
  const n = signal.pairCount;
  const tone =
    n >= 5
      ? "text-emerald-600 dark:text-emerald-400"
      : n <= 1
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <span
      className={`absolute right-2 top-2 flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {n <= 1 ? <AlertTriangle size={11} /> : <Shirt size={11} />}
      {n}
    </span>
  );
}

function ResultCard({ r, onOpen }: { r: ShopResult; onOpen: () => void }) {
  return (
    <div className="mb-3 break-inside-avoid">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative overflow-hidden rounded-2xl bg-surface-2" style={{ aspectRatio: "3 / 4" }}>
          <Img src={r.imageUrl} />
          <SignalBadge signal={r.closetSignal} />
        </div>
        <div className="px-1 pt-1.5">
          {r.brand && <p className="truncate text-[11px] text-muted">{r.brand}</p>}
          <p className="truncate text-sm">{r.title}</p>
          <p className="text-sm font-semibold">{money(r.price, r.currency)}</p>
        </div>
      </button>
    </div>
  );
}

/**
 * Closet-aware product search — the Explore "Shop" tab. Search the catalog, see a
 * closet signal on every result, open one for the full ownership + pairing read.
 */
export function ShopSearchView() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ShopResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(true);
  const [searched, setSearched] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reqRef = useRef(0);
  const loadMoreRef = useRef<() => void>(() => {});
  const ioRef = useRef<IntersectionObserver | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1900);
  };

  // Debounced fresh search whenever the query changes (≥2 chars).
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setCursor(null);
      setDone(true);
      setSearched(false);
      return;
    }
    const req = ++reqRef.current;
    setLoading(true);
    setSearched(true);
    const t = window.setTimeout(() => {
      searchProducts(query).then((r) => {
        if (req !== reqRef.current) return; // a newer query superseded this one
        setResults(r.items);
        setCursor(r.nextCursor);
        setDone(!r.nextCursor);
        setLoading(false);
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const loadMore = useCallback(() => {
    if (loading || done || !cursor) return;
    const req = reqRef.current;
    setLoading(true);
    searchProducts(q, cursor).then((r) => {
      if (req !== reqRef.current) return;
      setResults((prev) => {
        const seen = new Set(prev.map((p) => p.productId));
        return [...prev, ...r.items.filter((i) => !seen.has(i.productId))];
      });
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
  }, [loading, done, cursor, q]);

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

  return (
    <div className="space-y-3">
      {/* search bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2.5">
        <Search size={17} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search anything — jeans, sneakers, a jacket…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {/* category chips (canned queries) */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setQ(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
              q === c ? "bg-foreground text-background" : "border border-line text-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* results */}
      {!searched ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted">
          <Search size={26} className="text-muted" />
          <p>Search the catalog to see how each piece fits your closet.</p>
        </div>
      ) : results.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {loading ? "Searching…" : `No results for "${q.trim()}".`}
        </p>
      ) : (
        <>
          <div style={{ columnCount: 2, columnGap: "12px" }}>
            {results.map((r) => (
              <ResultCard key={r.productId} r={r} onOpen={() => setOpenId(r.productId)} />
            ))}
          </div>
          {!done && (
            <div ref={sentinelRef} className="py-6 text-center text-xs text-muted">
              Loading more…
            </div>
          )}
        </>
      )}

      {openId && (
        <ProductFitOverlay productId={openId} onClose={() => setOpenId(null)} onToast={flash} />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}
