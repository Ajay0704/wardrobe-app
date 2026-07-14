"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ExternalLink,
  Heart,
  Shirt,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { affiliateUrl } from "@/lib/affiliate";
import { openExternalUrl } from "@/lib/platform";
import {
  fetchProductFit,
  wishlistProduct,
  type ProductFit,
} from "@/lib/shop-search";
import { useWardrobe } from "@/lib/store";
import { CATEGORY_LABEL, type Category } from "@/lib/types";

function money(price: number | null, currency: string): string {
  if (price == null) return "";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${sym}${price % 1 === 0 ? price : price.toFixed(2)}`;
}

/** "2 tops · 1 bottom · 1 shoe" from the pairing byCategory breakdown. */
const CAT_NOUN: Record<string, [string, string]> = {
  top: ["top", "tops"],
  bottom: ["bottom", "bottoms"],
  shoes: ["shoe", "shoes"],
  outerwear: ["layer", "layers"],
  bag: ["bag", "bags"],
  accessory: ["accessory", "accessories"],
  dress: ["dress", "dresses"],
};
function breakdown(byCategory: Record<string, number>): string {
  return Object.entries(byCategory)
    .filter(([, n]) => n > 0)
    .map(([cat, n]) => {
      const [s, p] = CAT_NOUN[cat] ?? [cat, `${cat}s`];
      return `${n} ${n === 1 ? s : p}`;
    })
    .join(" · ");
}

type Tone = "good" | "warn" | "neutral";
const TONE_CLASS: Record<Tone, string> = {
  good: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  neutral: "bg-surface-2 text-muted",
};

function pairTone(total: number): Tone {
  return total >= 5 ? "good" : total <= 1 ? "warn" : "neutral";
}

function verdict(fit: ProductFit): { tone: Tone; lead: string; rest: string } {
  const t = fit.pairing.total;
  if (fit.ownership.status === "exact")
    return { tone: "warn", lead: "Skip it.", rest: "You own this already." };
  if (t >= 5)
    return { tone: "good", lead: "Strong buy.", rest: `It works with ${t} things you own.` };
  if (t <= 1)
    return { tone: "warn", lead: "Risky.", rest: "It barely goes with anything you own." };
  return {
    tone: "neutral",
    lead: `Works with ${t} of your pieces.`,
    rest: "Fine, but not the most versatile.",
  };
}

function ImgBox({ src, className }: { src?: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`flex items-center justify-center bg-surface-2 ${className ?? ""}`}>
        <Shirt className="text-muted" size={28} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setErr(true)} className={`object-cover ${className ?? ""}`} />
  );
}

/**
 * Full-screen closet-fit detail for a catalog product: hero + meta, an ownership
 * row, the headline pairing number with a category breakdown and thumbnails of
 * the matched closet items, a verdict line, and wishlist / looks-good actions.
 */
export function ProductFitOverlay({
  productId,
  onClose,
  onToast,
}: {
  productId: string;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const { items } = useWardrobe();
  const [fit, setFit] = useState<ProductFit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchProductFit(productId).then((f) => {
      if (!alive) return;
      setFit(f);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  const matchedItems = fit
    ? fit.pairing.matches
        .map((id) => items.find((i) => i.id === id))
        .filter((i): i is NonNullable<typeof i> => Boolean(i))
    : [];

  const ownedIcon =
    fit?.ownership.status === "none" ? (
      <Sparkles size={18} className="text-blue-600 dark:text-blue-400" />
    ) : (
      <Check size={18} className="text-muted" />
    );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="text-sm font-medium">Details</span>
      </header>

      <div className="native-main flex-1 overflow-y-auto">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted">Checking your closet…</p>
        ) : !fit ? (
          <p className="py-20 text-center text-sm text-muted">Couldn&apos;t load this product.</p>
        ) : (
          <>
            <ImgBox src={fit.product.imageUrl} className="h-72 w-full" />

            <div className="space-y-4 p-4">
              {/* meta */}
              <div>
                {fit.product.brand && (
                  <p className="text-xs uppercase tracking-wide text-muted">{fit.product.brand}</p>
                )}
                <h1 className="heading text-xl leading-tight">{fit.product.title}</h1>
                <p className="mt-1 font-medium">{money(fit.product.price, fit.product.currency)}</p>
                {(fit.product.fit || fit.product.tone) && (
                  <p className="text-sm capitalize text-muted">
                    {[fit.product.fit, fit.product.tone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              {/* ownership row */}
              <div className="flex items-center gap-3 rounded-2xl border border-line px-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2">
                  {ownedIcon}
                </span>
                <p className="text-sm">{fit.ownership.note}</p>
              </div>

              {/* pairing headline */}
              <div className="rounded-2xl border border-line p-4">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-bold ${
                      pairTone(fit.pairing.total) === "good"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : pairTone(fit.pairing.total) === "warn"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground"
                    }`}
                  >
                    {fit.pairing.total}
                  </span>
                  <span className="text-sm text-muted">things you own it goes with</span>
                </div>
                {fit.pairing.total > 0 && (
                  <p className="mt-1 text-xs text-muted">{breakdown(fit.pairing.byCategory)} in your closet</p>
                )}

                {matchedItems.length > 0 ? (
                  <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
                    {matchedItems.map((it) => (
                      <div key={it.id} className="w-14 shrink-0">
                        <ImgBox src={it.imageUrl} className="h-14 w-14 rounded-xl" />
                        <p className="truncate pt-1 text-center text-[10px] text-muted">{it.name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={13} /> Goes with nothing you currently own.
                  </p>
                )}
              </div>

              {/* verdict */}
              {(() => {
                const v = verdict(fit);
                return (
                  <p className={`rounded-2xl px-4 py-3 text-sm ${TONE_CLASS[v.tone]}`}>
                    <span className="font-semibold">{v.lead}</span> {v.rest}
                  </p>
                );
              })()}

              {/* actions */}
              <div className="flex gap-2 pb-4">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await wishlistProduct(fit.product.productId);
                    onToast(ok ? "Added to wishlist" : "Sign in to save to wishlist");
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm font-medium"
                >
                  <Heart size={17} /> Wishlist
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void openExternalUrl(affiliateUrl(fit.product.buyUrl) ?? fit.product.buyUrl);
                    onToast("Opening store…");
                  }}
                  className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-foreground"
                >
                  <ExternalLink size={17} /> Looks good
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
