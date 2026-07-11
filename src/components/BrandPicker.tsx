"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COMMON_BRANDS } from "@/lib/brands";
import { useWardrobe } from "@/lib/store";
import { inputClass } from "./ui";

/**
 * Searchable brand combobox: suggests from a curated brand list plus brands the
 * user has already used on other items, and lets them add any custom brand by
 * typing it. Free-typed text is still accepted (kept as the brand value); the
 * parent's `value` is the single source of truth, so no local mirror state.
 */
export function BrandPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (brand: string) => void;
}) {
  const items = useWardrobe((s) => s.items);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allBrands = useMemo(() => {
    const used = items
      .map((it) => it.brand)
      .filter((b): b is string => !!b && b.trim().length > 0);
    const seen = new Map<string, string>();
    for (const b of [...used, ...COMMON_BRANDS]) {
      const k = b.trim().toLowerCase();
      if (k && !seen.has(k)) seen.set(k, b.trim());
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const q = value.trim().toLowerCase();
  const matches = useMemo(
    () =>
      (q ? allBrands.filter((b) => b.toLowerCase().includes(q)) : allBrands).slice(
        0,
        40,
      ),
    [allBrands, q],
  );
  const exact = allBrands.some((b) => b.toLowerCase() === q);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (b: string) => {
    onChange(b);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        className={inputClass}
        value={value}
        placeholder="Search or add a brand"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && (matches.length > 0 || (!!q && !exact)) && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-surface shadow-lg shadow-black/10">
          {!!q && !exact && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(value.trim())}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent hover:bg-surface-2"
            >
              <Plus size={14} /> Add “{value.trim()}”
            </button>
          )}
          {matches.map((b) => (
            <button
              key={b}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(b)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                b.toLowerCase() === q ? "text-accent" : ""
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
