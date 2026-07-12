"use client";

import { Archive, Check, DoorClosed, X } from "lucide-react";
import { useState } from "react";
import type { WardrobeItem } from "@/lib/types";
import { SEASONS, type Season } from "@/lib/types";

/** Shared bottom-sheet chrome (reuses the native create-sheet styling). */
function Sheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="native-sheet-handle" />
        {children}
      </div>
    </div>
  );
}

/** Closet selector — All clothes / Archive / New closet (AJA-86). */
export function ClosetsSheet({
  items,
  onClose,
}: {
  items: WardrobeItem[];
  onClose: () => void;
}) {
  const owned = items.filter((it) => !it.wishlist);
  const preview = owned.slice(0, 4);
  return (
    <Sheet onClose={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <div className="grid h-14 w-14 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl border border-line bg-surface-2">
          {preview.map((it) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={it.id} src={it.imageUrl} alt="" className="h-full w-full object-cover" />
          ))}
        </div>
        <div className="flex-1">
          <p className="font-semibold">All clothes</p>
          <p className="text-sm text-muted">{owned.length} items</p>
        </div>
        <Check size={18} className="text-accent" />
      </button>

      <div className="flex w-full items-center gap-3 py-3 text-left opacity-60">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">
          <Archive size={22} />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Archive</p>
          <p className="text-sm text-muted">0 items · coming soon</p>
        </div>
      </div>

      <div className="flex w-full items-center gap-3 py-3 text-left opacity-60">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line text-muted">
          <DoorClosed size={22} />
        </div>
        <p className="font-semibold">New closet</p>
      </div>
    </Sheet>
  );
}

/** Sort selector — radio list (AJA-86). Options are provided by the caller. */
export function SortSheet<T extends string>({
  value,
  options,
  onSelect,
  onClose,
}: {
  value: T;
  options: { key: T; label: string }[];
  onSelect: (key: T) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              onSelect(o.key);
              onClose();
            }}
            className="flex w-full items-center gap-3 border-b border-line py-3.5 text-left last:border-0"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                value === o.key ? "border-foreground" : "border-line"
              }`}
            >
              {value === o.key && <span className="h-2.5 w-2.5 rounded-full bg-foreground" />}
            </span>
            <span className={value === o.key ? "font-semibold" : ""}>{o.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Filter sheet — Season + Occasions functional; other sections collapsible
 *  placeholders matching the reference (AJA-86). */
export function FilterSheet({
  season,
  tag,
  allTags,
  onChange,
  onClear,
  onClose,
}: {
  season: Season | "all";
  tag: string;
  allTags: string[];
  onChange: (patch: { season?: Season | "all"; tag?: string }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>("season");
  const sec = { open, setOpen };
  const pill = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm capitalize ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-foreground"
    }`;

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div className="native-sheet !max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={onClose} aria-label="Close"><X size={22} /></button>
          <span className="text-lg font-semibold">Filter</span>
          <span className="w-6" />
        </div>

        <FilterSection id="season" label="Season" {...sec}>
          <div className="flex flex-wrap gap-2">
            {SEASONS.map((s) => (
              <button key={s} type="button" onClick={() => onChange({ season: season === s ? "all" : s })} className={pill(season === s)}>
                {s}
              </button>
            ))}
          </div>
        </FilterSection>

        <FilterSection id="occasions" label="Occasions" {...sec}>
          <div className="flex flex-wrap gap-2">
            {allTags.length === 0 && <p className="text-sm text-muted">No tags yet.</p>}
            {allTags.map((t) => (
              <button key={t} type="button" onClick={() => onChange({ tag: tag === t ? "all" : t })} className={pill(tag === t)}>
                {t}
              </button>
            ))}
          </div>
        </FilterSection>

        <FilterSection id="color" label="Color" {...sec}><p className="text-sm text-muted">Coming soon.</p></FilterSection>
        <FilterSection id="material" label="Material" {...sec}><p className="text-sm text-muted">Coming soon.</p></FilterSection>
        <FilterSection id="pattern" label="Pattern" {...sec}><p className="text-sm text-muted">Coming soon.</p></FilterSection>
        <FilterSection id="brand" label="Brand" {...sec}><p className="text-sm text-muted">Coming soon.</p></FilterSection>

        <div className="sticky bottom-0 mt-3 flex gap-3 bg-surface pt-3">
          <button type="button" onClick={onClear} className="flex-1 rounded-full border border-line py-3 font-medium text-muted">
            Clear
          </button>
          <button type="button" onClick={onClose} className="flex-[2] rounded-full bg-foreground py-3 font-medium text-background">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({
  id,
  label,
  open,
  setOpen,
  children,
}: {
  id: string;
  label: string;
  open: string | null;
  setOpen: (v: string | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-line py-4">
      <button
        type="button"
        onClick={() => setOpen(open === id ? null : id)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-base font-semibold">{label}</span>
        <span className="text-muted">{open === id ? "▲" : "▼"}</span>
      </button>
      {open === id && children && <div className="mt-3">{children}</div>}
    </div>
  );
}
