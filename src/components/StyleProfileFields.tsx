"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { CURRENCIES, currencySymbol, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  BODY_SHAPES,
  BUDGET_CATEGORIES,
  type BudgetCategory,
  FIT_PREFERENCES,
  PROFILE_COLORS,
  STYLE_QUIZ_VIBES,
  type UserProfile,
} from "@/lib/profile";
import { Chip, Field, inputClass } from "./ui";

type ShopGender = NonNullable<UserProfile["shopGender"]>;
type SizeKey = keyof NonNullable<UserProfile["sizes"]>;

const SHOP_OPTIONS: { value: ShopGender; label: string }[] = [
  { value: "male", label: "Menswear" },
  { value: "female", label: "Womenswear" },
  { value: "all", label: "Everything" },
];

/**
 * The style / fit / shopping half of "My information" (AJA-171). Groups the data
 * that personalizes recommendations, try-on, and Shop. Everything writes straight
 * to the profile via `onChange`; fit + body fields are optional and stay on-device.
 */
export function StyleProfileFields({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (patch: Partial<UserProfile>) => void;
}) {
  const [brandInput, setBrandInput] = useState("");
  const sizes = profile.sizes ?? {};
  const vibes = profile.styleVibes ?? [];
  const love = profile.colorsLove ?? [];
  const avoid = profile.colorsAvoid ?? [];
  const brands = profile.customBrands ?? [];
  const budgets = profile.budgets ?? {};
  const cur = currencySymbol(profile.currency ?? DEFAULT_CURRENCY);

  const setSize = (k: SizeKey, v: string) =>
    onChange({ sizes: { ...sizes, [k]: v.trim() || undefined } });

  const toggleVibe = (v: string) => {
    if (vibes.includes(v)) return onChange({ styleVibes: vibes.filter((x) => x !== v) });
    onChange({ styleVibes: vibes.length >= 3 ? [...vibes.slice(1), v] : [...vibes, v] });
  };

  // A color lives in at most one of love/avoid — toggling into one clears the other.
  const toggleColor = (c: string, list: "love" | "avoid") => {
    const inLove = love.includes(c);
    const inAvoid = avoid.includes(c);
    if (list === "love") {
      onChange({
        colorsLove: inLove ? love.filter((x) => x !== c) : [...love, c],
        colorsAvoid: inAvoid ? avoid.filter((x) => x !== c) : avoid,
      });
    } else {
      onChange({
        colorsAvoid: inAvoid ? avoid.filter((x) => x !== c) : [...avoid, c],
        colorsLove: inLove ? love.filter((x) => x !== c) : love,
      });
    }
  };

  const addBrand = () => {
    const t = brandInput.trim();
    if (t && !brands.some((b) => b.toLowerCase() === t.toLowerCase())) {
      onChange({ customBrands: [...brands, t] });
    }
    setBrandInput("");
  };

  const setBudget = (k: BudgetCategory, raw: string) => {
    const n = raw.trim() === "" ? undefined : Math.max(0, Math.round(Number(raw)));
    onChange({
      budgets: { ...budgets, [k]: n !== undefined && Number.isFinite(n) ? n : undefined },
    });
  };

  return (
    <>
      <section className="space-y-4">
        <SectionHeader
          title="Fit & sizes"
          note="Used for size hints on Shop and on-body try-on. Private — never shown on your profile."
        />
        <Field label="How you shop">
          <Seg
            options={SHOP_OPTIONS}
            value={(profile.shopGender ?? "all") as ShopGender}
            onChange={(v) => onChange({ shopGender: v })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Top">
            <input className={inputClass} value={sizes.top ?? ""} onChange={(e) => setSize("top", e.target.value)} placeholder="M" />
          </Field>
          <Field label="Bottom">
            <input className={inputClass} value={sizes.bottom ?? ""} onChange={(e) => setSize("bottom", e.target.value)} placeholder="32" />
          </Field>
          <Field label="Shoes">
            <input className={inputClass} value={sizes.shoes ?? ""} onChange={(e) => setSize("shoes", e.target.value)} placeholder="10" />
          </Field>
          <Field label="Dress">
            <input className={inputClass} value={sizes.dress ?? ""} onChange={(e) => setSize("dress", e.target.value)} placeholder="—" />
          </Field>
        </div>
        <Field label="Fit preference">
          <div className="flex flex-wrap gap-2">
            {FIT_PREFERENCES.map((f) => (
              <Chip
                key={f}
                active={profile.fitPreference === f}
                onClick={() => onChange({ fitPreference: profile.fitPreference === f ? undefined : f })}
              >
                {f}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Height" hint="Optional — sharpens size and try-on.">
          <div className="relative">
            <input
              className={inputClass}
              style={{ paddingRight: "2.75rem" }}
              type="number"
              inputMode="numeric"
              value={profile.heightCm ?? ""}
              onChange={(e) => onChange({ heightCm: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="175"
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">cm</span>
          </div>
        </Field>
        <Field label="Body shape" hint="Optional.">
          <div className="flex flex-wrap gap-2">
            {BODY_SHAPES.map((b) => (
              <Chip
                key={b}
                active={profile.bodyShape === b}
                onClick={() => onChange({ bodyShape: profile.bodyShape === b ? undefined : b })}
              >
                {b}
              </Chip>
            ))}
          </div>
        </Field>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Style" />
        <Field label="Style vibes" hint="Up to three — used for Today and Generate outfit.">
          <div className="flex flex-wrap gap-2">
            {STYLE_QUIZ_VIBES.map((v) => (
              <Chip key={v} active={vibes.includes(v)} onClick={() => toggleVibe(v)}>
                {v}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Colors you love">
          <div className="flex flex-wrap gap-2">
            {PROFILE_COLORS.map((c) => (
              <Chip key={c} active={love.includes(c)} onClick={() => toggleColor(c, "love")}>
                {c}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Colors you avoid">
          <div className="flex flex-wrap gap-2">
            {PROFILE_COLORS.map((c) => (
              <Chip key={c} active={avoid.includes(c)} onClick={() => toggleColor(c, "avoid")}>
                {c}
              </Chip>
            ))}
          </div>
        </Field>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Shopping" />
        <Field label="Budget per category" hint={`Rough max you'd spend, in ${profile.currency ?? DEFAULT_CURRENCY}.`}>
          <div className="grid grid-cols-2 gap-4">
            {BUDGET_CATEGORIES.map((c) => (
              <div key={c.key} className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{cur}</span>
                <input
                  className={inputClass}
                  style={{ paddingLeft: "2rem" }}
                  type="number"
                  inputMode="numeric"
                  value={budgets[c.key] ?? ""}
                  onChange={(e) => setBudget(c.key, e.target.value)}
                  placeholder={c.label}
                  aria-label={`${c.label} budget`}
                />
              </div>
            ))}
          </div>
        </Field>
        <Field label="Preferred brands" hint="Shown as suggestions when you add items.">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={brandInput}
              placeholder="Add a brand"
              onChange={(e) => setBrandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBrand();
                }
              }}
            />
            <button type="button" onClick={addBrand} className="shrink-0 rounded-xl border border-line px-4 text-sm font-medium">
              Add
            </button>
          </div>
          {brands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {brands.map((b) => (
                <span key={b} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm">
                  {b}
                  <button
                    type="button"
                    onClick={() => onChange({ customBrands: brands.filter((x) => x !== b) })}
                    aria-label={`Remove ${b}`}
                    className="text-muted"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
        <Field label="Currency">
          <select
            className={inputClass}
            value={profile.currency ?? DEFAULT_CURRENCY}
            onChange={(e) => onChange({ currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.label} · {c.code}
              </option>
            ))}
          </select>
        </Field>
      </section>
    </>
  );
}

export function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">{title}</h3>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${
            value === o.value
              ? "border border-line bg-surface font-medium text-foreground"
              : "border border-transparent text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
