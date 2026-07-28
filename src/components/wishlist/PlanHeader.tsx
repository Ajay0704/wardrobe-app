"use client";

import { Target, Wallet } from "lucide-react";
import { useState } from "react";
import { formatMoney, DEFAULT_CURRENCY } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";
import { planNote, type PlanTotals, type WishVerdict } from "@/lib/wishlist-plan";
import type { WardrobeItem } from "@/lib/types";
import { BottomSheet } from "../BottomSheet";

/**
 * The wishlist's shopping plan (AJA-242): what you've committed against what you
 * planned, and one derived line telling you what to do about it.
 *
 * With no plan set this is a single quiet prompt rather than a zeroed-out bar —
 * an empty budget widget implies a budget of nothing.
 */
export function PlanHeader({
  wishlist,
  verdicts,
  totals,
}: {
  wishlist: WardrobeItem[];
  verdicts: Map<string, WishVerdict>;
  totals: PlanTotals;
}) {
  const plan = useWardrobe((s) => s.profile.shoppingPlan);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const updateProfile = useWardrobe((s) => s.updateProfile);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");

  const edit = () => {
    setName(plan?.name ?? "");
    setBudget(plan?.budget ? String(plan.budget) : "");
    setOpen(true);
  };

  const save = () => {
    const n = Number(budget.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return;
    updateProfile({ shoppingPlan: { name: name.trim() || "Shopping plan", budget: n } });
    setOpen(false);
  };

  const clear = () => {
    updateProfile({ shoppingPlan: undefined });
    setOpen(false);
  };

  const sheet = (
    <BottomSheet open={open} onClose={() => setOpen(false)} ariaLabel="Shopping plan">
      <h3 className="heading px-1 text-xl">
        {plan ? "Edit your plan" : "Set a shopping plan"}
      </h3>
      <p className="mb-4 mt-1 px-1 text-sm leading-relaxed text-muted">
        Name what you&apos;re shopping for and roughly what you want to spend. Your
        wishlist gets measured against it.
      </p>

      <label className="mb-1 block px-1 text-xs font-medium uppercase tracking-wide text-muted">
        What&apos;s it for
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Summer refresh"
        className="mb-3 h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm outline-none focus:border-accent focus:bg-surface"
      />

      <label className="mb-1 block px-1 text-xs font-medium uppercase tracking-wide text-muted">
        Budget ({currency})
      </label>
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        inputMode="decimal"
        placeholder="450"
        className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm outline-none focus:border-accent focus:bg-surface"
      />

      <div className="mt-4 flex gap-2">
        {plan && (
          <button
            type="button"
            onClick={clear}
            className="h-12 flex-[0_0_100px] rounded-xl border border-line bg-surface text-sm"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!Number(budget.replace(/[^0-9.]/g, ""))}
          className="h-12 flex-1 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-45"
        >
          {plan ? "Save plan" : "Start the plan"}
        </button>
      </div>
    </BottomSheet>
  );

  if (!plan) {
    return (
      <>
        <button
          type="button"
          onClick={edit}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Target size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Set a shopping plan</span>
            <span className="block text-xs text-muted">
              {wishlist.length
                ? `Give this list a budget — it's ${formatMoney(totals.committed, currency, 0)} so far`
                : "Name what you're shopping for and what you want to spend"}
            </span>
          </span>
        </button>
        {sheet}
      </>
    );
  }

  const dupes = wishlist.filter((it) => (verdicts.get(it.id)?.redundantCount ?? 0) > 0);
  const note = planNote({
    committed: totals.committed,
    budget: totals.budget,
    dupeTotal: dupes.reduce((s, it) => s + (it.price ?? 0), 0),
    dupeCount: dupes.length,
    itemCount: wishlist.length,
    currency,
  });

  return (
    <>
      <div
        className={`mb-3 rounded-2xl border p-4 ${
          totals.over ? "border-amber-200 bg-amber-50/70" : "border-line bg-surface"
        }`}
      >
        <div className="flex items-baseline gap-2">
          <Wallet size={15} className={totals.over ? "text-amber-600" : "text-muted"} />
          <span className="heading truncate text-lg">{plan.name}</span>
          <button
            type="button"
            onClick={edit}
            className="ml-auto shrink-0 text-xs font-semibold text-accent"
          >
            Edit plan
          </button>
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {formatMoney(totals.committed, currency, 0)}
          </span>
          <span className="text-xs text-muted">
            of {formatMoney(totals.budget, currency, 0)} planned
          </span>
        </div>

        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
              totals.over ? "bg-amber-500" : "bg-accent"
            }`}
            style={{ width: `${totals.pct}%` }}
          />
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-muted">{note}</p>
      </div>
      {sheet}
    </>
  );
}
