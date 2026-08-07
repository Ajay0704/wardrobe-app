"use client";

import { Copy, ShoppingBag, Sparkles, Timer, Wallet } from "lucide-react";
import { useMemo } from "react";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { logDecision, type DecisionOutcome } from "@/lib/decisions";
import { closetAvgCostPerWear } from "@/lib/insights";
import { suggestLooks } from "@/lib/matching";
import { analyzeSmartBuy } from "@/lib/smart-buy";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { planTotals } from "@/lib/wishlist-plan";
import { BottomSheet } from "../BottomSheet";

/**
 * "Should I?" (AJA-244) — the sheet that finally surfaces what `smart-buy.ts` has
 * always computed. Everything here was already derivable from the closet; it was
 * just buried inside the item editor, so the wishlist could show a piece without
 * ever helping you decide about it.
 *
 * Three actions, all logged through the existing decision loop. "I bought it" is the
 * one that didn't exist anywhere: before this, moving a wish into the closet meant
 * opening the full editor and finding a toggle.
 *
 * Every row hides itself when its input is missing. A budget row with no plan, or a
 * cost-per-wear with no price, would be inventing the numbers it presents.
 */
export function ShouldIBuySheet({
  item,
  onDecided,
  onClose,
}: {
  item: WardrobeItem | null;
  onDecided: (item: WardrobeItem, decision: DecisionOutcome) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={!!item} onClose={onClose} ariaLabel="Should I buy this?">
      {item && <Body item={item} onDecided={onDecided} />}
    </BottomSheet>
  );
}

function Body({
  item,
  onDecided,
}: {
  item: WardrobeItem;
  onDecided: (item: WardrobeItem, decision: DecisionOutcome) => void;
}) {
  const items = useWardrobe((s) => s.items);
  const plan = useWardrobe((s) => s.profile.shoppingPlan);
  const styleVibes = useWardrobe((s) => s.profile.styleVibes);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const updateItem = useWardrobe((s) => s.updateItem);
  const deleteItem = useWardrobe((s) => s.deleteItem);

  const analysis = useMemo(
    () => analyzeSmartBuy(item, items, { styleVibes }),
    [item, items, styleVibes],
  );
  const closetAvg = useMemo(() => closetAvgCostPerWear(items), [items]);
  /**
   * AJA-282 — real outfits, not a multiplication.
   *
   * `analysis.newOutfits` is `core * shoeMult`: every complementary piece that clears a
   * COLOUR threshold, multiplied by every pair of shoes. Nothing in that ever asks
   * whether the combination is wearable, so a knit that `rejectOutfit` would throw out
   * of a July look still counted, and the sheet cheerfully promised "around 24 new
   * outfits". Ask the engine that actually decides instead, anchored on this piece.
   *
   * Runs once per sheet open, on one item — the grid's per-card verdict deliberately
   * keeps the cheap colour heuristic, because `wishVerdict` runs for every wish on
   * every render and a sampler there would be felt.
   */
  const looks = useMemo(
    () => suggestLooks(items, { anchors: [item], count: 3, candidates: 40 }),
    [item, items],
  );
  const totals = useMemo(
    () => planTotals(items.filter((it) => it.wishlist), plan?.budget ?? 0),
    [items, plan?.budget],
  );

  const m = (n: number, decimals = 0) => formatMoney(n, currency, decimals);
  const dupes = analysis.redundant;

  const decide = (decision: DecisionOutcome) => {
    void logDecision(item, analysis.verdict, decision);
    if (decision === "bought") {
      // Straight into the closet, dated. The commit happens before the sheet closes
      // so a purchase is never left riding on an animation timer.
      updateItem(item.id, {
        wishlist: false,
        purchasedAt: new Date().toISOString().slice(0, 10),
      });
    } else if (decision === "skipped") {
      // The decision itself is already banked server-side by logDecision, so the
      // skip survives even though the wish doesn't.
      deleteItem(item.id);
    }
    onDecided(item, decision);
  };

  return (
    <>
      <h3 className="heading px-1 text-xl leading-tight">{item.name}</h3>
      <p className="mb-4 mt-1 px-1 text-sm text-muted">
        {[item.brand, item.price !== undefined ? m(item.price) : null]
          .filter(Boolean)
          .join(" · ") || "On your wishlist"}
      </p>

      <div className="space-y-2">
        {dupes.length > 0 ? (
          <Fact
            icon={<Copy size={16} />}
            tone="warn"
            title={
              dupes.length === 1
                ? "You own something very similar"
                : `You own ${dupes.length} similar pieces`
            }
            detail="This is the one reason to think twice."
          >
            <div className="mt-2 flex gap-1.5">
              {dupes.slice(0, 5).map((o) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={o.id}
                  src={o.imageUrl}
                  alt={o.name}
                  title={o.name}
                  className="h-12 w-10 rounded-md border border-line object-cover"
                />
              ))}
            </div>
          </Fact>
        ) : looks.length === 0 ? (
          <Fact
            icon={<Sparkles size={16} />}
            tone="warn"
            title="Nothing you own completes an outfit with this yet"
            detail={
              analysis.pairsWith.length > 0
                ? `${analysis.pairsWith.length} piece${analysis.pairsWith.length === 1 ? "" : "s"} match on colour, but none of them make a full look with it.`
                : "You'd need something else to wear it with."
            }
          />
        ) : (
          <Fact
            icon={<Sparkles size={16} />}
            title={`Wears ${looks.length} way${looks.length === 1 ? "" : "s"} with what you own`}
            detail="Built by the same engine as Surprise me, so these are looks it would actually put together."
          >
            <div className="mt-2 space-y-1.5">
              {looks.map((look, i) => (
                <div key={i} className="flex gap-1.5">
                  {look.items.map((o) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={o.id}
                      src={o.imageUrl}
                      alt={o.name}
                      title={o.name}
                      className={`h-12 w-10 rounded-md border object-cover ${
                        o.id === item.id ? "border-accent" : "border-line"
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </Fact>
        )}

        {plan && item.price !== undefined && (
          <Fact
            icon={<Wallet size={16} />}
            tone={totals.over ? "warn" : undefined}
            title={`${m(item.price)} of your ${m(totals.budget)} ${plan.name.toLowerCase()}`}
            detail={
              totals.over
                ? `Your list is already ${m(-totals.remaining)} over budget.`
                : `${m(totals.remaining)} still unspent.`
            }
          />
        )}

        {analysis.costPerWear !== null && (
          <Fact
            icon={<Timer size={16} />}
            title={`${m(analysis.costPerWear, 2)} per wear at ~${analysis.annualWears} wears a year`}
            detail={
              closetAvg !== null
                ? `Your closet averages ${m(closetAvg, 2)} per wear so far.`
                : analysis.cpwBasis === "closet-history"
                  ? `Based on how often you actually wear this category.`
                  : `Category average — you haven't logged enough wears for your own.`
            }
          />
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => decide("skipped")}
          className="h-12 flex-1 rounded-xl border border-line bg-surface text-sm transition-transform active:scale-[0.98]"
        >
          Skip it
        </button>
        <button
          type="button"
          onClick={() => decide("wait")}
          className="h-12 flex-1 rounded-xl border border-line bg-surface text-sm transition-transform active:scale-[0.98]"
        >
          I&apos;ll wait
        </button>
        <button
          type="button"
          onClick={() => decide("bought")}
          className="flex h-12 flex-[1.3] items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]"
        >
          <ShoppingBag size={15} /> I bought it
        </button>
      </div>
    </>
  );
}

function Fact({
  icon,
  title,
  detail,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: "warn";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-3 rounded-2xl border p-3.5 ${
        tone === "warn" ? "border-amber-200 bg-amber-50/70" : "border-line bg-surface-2"
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 ${tone === "warn" ? "text-amber-600" : "text-muted"}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
        {children}
      </div>
    </div>
  );
}
