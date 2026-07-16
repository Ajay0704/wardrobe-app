"use client";

import { Bookmark, Check, PencilRuler, Plus, Shirt, Sparkles } from "lucide-react";
import { useState } from "react";
import type { WardrobeItem } from "@/lib/types";
import type {
  OutfitCardData,
  StylistBlock,
  StylistChip,
  VerdictCardData,
} from "@/lib/stylist/types";

type Resolve = (id: string) => WardrobeItem | undefined;

export interface BlockHandlers {
  resolve: Resolve;
  onWear: (itemIds: string[]) => void;
  onSave: (o: OutfitCardData) => void;
  onOpen: (o: OutfitCardData) => void;
  onChip: (send: string) => void;
  onAddItems: () => void;
}

function Thumb({ item, size = 64 }: { item?: WardrobeItem; size?: number }) {
  const [err, setErr] = useState(false);
  const src = item?.beautifiedImageUrl || item?.imageUrl;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg bg-surface-2"
      style={{ width: size, height: size }}
    >
      {!src || err ? (
        <div className="flex h-full w-full items-center justify-center">
          <Shirt size={size * 0.34} className="text-muted" strokeWidth={1.5} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={item?.name ?? ""} onError={() => setErr(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function OutfitCard({
  outfit,
  h,
  compact,
}: {
  outfit: OutfitCardData;
  h: BlockHandlers;
  compact?: boolean;
}) {
  const items = outfit.itemIds.map(h.resolve).filter((x): x is WardrobeItem => !!x);
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-surface ${compact ? "w-60 shrink-0" : ""}`}>
      <div className="flex items-center gap-2 overflow-x-auto p-3">
        {items.map((it) => (
          <Thumb key={it.id} item={it} />
        ))}
        <span className="ml-auto shrink-0 self-start rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
          {Math.round(outfit.score)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 border-t border-line px-2 py-2">
        <button
          type="button"
          onClick={() => h.onWear(outfit.itemIds)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-semibold text-accent-foreground"
        >
          <Check size={14} /> Wear
        </button>
        <button
          type="button"
          onClick={() => h.onSave(outfit)}
          aria-label="Save look"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-foreground hover:bg-surface-2"
        >
          <Bookmark size={16} />
        </button>
        <button
          type="button"
          onClick={() => h.onOpen(outfit)}
          aria-label="Open in builder"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-foreground hover:bg-surface-2"
        >
          <PencilRuler size={16} />
        </button>
      </div>
    </div>
  );
}

function ItemListBlock({
  title,
  itemIds,
  h,
}: {
  title: string;
  itemIds: string[];
  h: BlockHandlers;
}) {
  const items = itemIds.map(h.resolve).filter((x): x is WardrobeItem => !!x);
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">{title}</p>
      <div className="flex gap-2 overflow-x-auto">
        {items.map((it) => (
          <div key={it.id} className="w-16 shrink-0">
            <Thumb item={it} size={64} />
            <p className="mt-1 truncate text-[10px] text-muted">{it.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">{title}</p>
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className="text-sm font-medium text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const VERDICT_STYLE: Record<VerdictCardData["verdict"], string> = {
  buy: "bg-green-500/15 text-green-700 dark:text-green-400",
  maybe: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  skip: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function VerdictCard({ verdict, h }: { verdict: VerdictCardData; h: BlockHandlers }) {
  const pairs = verdict.pairsWithIds.map(h.resolve).filter((x): x is WardrobeItem => !!x).slice(0, 4);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 p-3">
        <Thumb item={{ imageUrl: verdict.subject.imageUrl, name: verdict.subject.name } as WardrobeItem} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{verdict.subject.name}</p>
          {verdict.subject.brand && <p className="truncate text-xs text-muted">{verdict.subject.brand}</p>}
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict.verdict]}`}>
            {verdict.verdictLabel}
          </span>
        </div>
      </div>
      {verdict.reasons.length > 0 && (
        <ul className="space-y-1 border-t border-line px-3 py-2">
          {verdict.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="text-xs text-muted">• {r.text}</li>
          ))}
        </ul>
      )}
      {pairs.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Pairs with</p>
          <div className="flex gap-2 overflow-x-auto">
            {pairs.map((it) => (
              <Thumb key={it.id} item={it} size={48} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chips({ chips, onChip }: { chips: StylistChip[]; onChip: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onChip(c.send)}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function EmptyCloset({ needed, onAdd }: { needed: string; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-accent-soft/60 p-4 text-center">
      <Sparkles size={22} className="mx-auto mb-2 text-accent" />
      <p className="text-sm text-foreground">
        Add {needed || "a few more pieces"} and I can build you a full look.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground"
      >
        <Plus size={14} /> Add items
      </button>
    </div>
  );
}

/** Render one bot turn's blocks (cards + chips), below its narration bubble. */
export function StylistBlocks({ blocks, h }: { blocks: StylistBlock[]; h: BlockHandlers }) {
  return (
    <div className="mt-2 space-y-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "outfit":
            return <OutfitCard key={i} outfit={b.outfit} h={h} />;
          case "carousel":
            return (
              <div key={i} className="-mr-4 flex gap-2 overflow-x-auto pr-4">
                {b.outfits.map((o, j) => (
                  <OutfitCard key={j} outfit={o} h={h} compact />
                ))}
              </div>
            );
          case "item_list":
            return <ItemListBlock key={i} title={b.title} itemIds={b.itemIds} h={h} />;
          case "insight":
            return <InsightCard key={i} title={b.title} rows={b.rows} />;
          case "verdict":
            return <VerdictCard key={i} verdict={b.verdict} h={h} />;
          case "chips":
            return <Chips key={i} chips={b.chips} onChip={h.onChip} />;
          case "empty_closet":
            return <EmptyCloset key={i} needed={b.needed} onAdd={h.onAddItems} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
