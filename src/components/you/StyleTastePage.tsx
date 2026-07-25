"use client";

import { X } from "lucide-react";
import { useState } from "react";
import {
  BUDGET_CATEGORIES,
  type BudgetCategory,
  PROFILE_COLORS,
  STYLE_QUIZ_VIBES,
} from "@/lib/profile";
import { currencySymbol, DEFAULT_CURRENCY } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";
import { Button, Chip, Field, inputClass } from "../ui";
import { Note, PageShell } from "./settings-ui";

/**
 * Style & taste (AJA-202) — the personalization half of the old "My information":
 * vibes, colors, brands, and budgets. Everything here tunes Today, Generate outfit,
 * and Shop recommendations. Consolidated so vibes/brands live in exactly one place.
 */
export function StyleTastePage() {
  const profile = useWardrobe((s) => s.profile);
  const updateProfile = useWardrobe((s) => s.updateProfile);
  const [brandInput, setBrandInput] = useState("");

  const vibes = profile.styleVibes ?? [];
  const love = profile.colorsLove ?? [];
  const avoid = profile.colorsAvoid ?? [];
  const brands = profile.customBrands ?? [];
  const budgets = profile.budgets ?? {};
  const cur = currencySymbol(profile.currency ?? DEFAULT_CURRENCY);

  const toggleVibe = (v: string) => {
    if (vibes.includes(v)) return updateProfile({ styleVibes: vibes.filter((x) => x !== v) });
    updateProfile({ styleVibes: vibes.length >= 3 ? [...vibes.slice(1), v] : [...vibes, v] });
  };

  const toggleColor = (c: string, list: "love" | "avoid") => {
    const inLove = love.includes(c);
    const inAvoid = avoid.includes(c);
    if (list === "love") {
      updateProfile({
        colorsLove: inLove ? love.filter((x) => x !== c) : [...love, c],
        colorsAvoid: inAvoid ? avoid.filter((x) => x !== c) : avoid,
      });
    } else {
      updateProfile({
        colorsAvoid: inAvoid ? avoid.filter((x) => x !== c) : [...avoid, c],
        colorsLove: inLove ? love.filter((x) => x !== c) : love,
      });
    }
  };

  const addBrand = () => {
    const t = brandInput.trim();
    if (t && !brands.some((b) => b.toLowerCase() === t.toLowerCase())) {
      updateProfile({ customBrands: [...brands, t] });
    }
    setBrandInput("");
  };

  const setBudget = (k: BudgetCategory, raw: string) => {
    const n = raw.trim() === "" ? undefined : Math.max(0, Math.round(Number(raw)));
    updateProfile({
      budgets: { ...budgets, [k]: n !== undefined && Number.isFinite(n) ? n : undefined },
    });
  };

  return (
    <PageShell>
      <Note>Tunes your Today suggestions, Generate outfit, and Shop picks.</Note>

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
          <Button onClick={addBrand} variant="outline" className="shrink-0">
            Add
          </Button>
        </div>
        {brands.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {brands.map((b) => (
              <span
                key={b}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm"
              >
                {b}
                <button
                  type="button"
                  onClick={() => updateProfile({ customBrands: brands.filter((x) => x !== b) })}
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

      <Field label="Budget per category" hint={`Rough max you'd spend, in ${profile.currency ?? DEFAULT_CURRENCY}.`}>
        <div className="grid grid-cols-2 gap-3">
          {BUDGET_CATEGORIES.map((c) => (
            <div key={c.key} className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                {cur}
              </span>
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
    </PageShell>
  );
}
