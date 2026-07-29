"use client";

/**
 * AJA-258 — in-app prototype for the Surprise me context override.
 * TEMPORARY: delete this route once a variant is chosen and built for real.
 *
 * Why this exists and not just public/context-proto.html: a standalone HTML page
 * shows the *shape* of a control but not what it will feel like sitting in
 * Settings, and it cannot reach the closet (the installed app runs in a WKWebView
 * with its own storage jar). So this route:
 *
 *   - builds each variant out of the REAL `Group` / `Row` / `Toggle` / `Chip`
 *     components Settings already uses, so it is not a mock-up — it is the same
 *     code that would ship, wrapped in the same page container as YouView;
 *   - sits among real sibling rows, so you can see it in context rather than
 *     alone on a page;
 *   - uses the REAL occasion vocabulary (STYLE_OCCASIONS), not invented labels;
 *   - calls the REAL suggestLooks() on your REAL closet and renders the three
 *     looks, so changing the season visibly changes the outfits.
 *
 * No shared app code is modified by this file. The resolver below is deliberately
 * local: when a variant is chosen it moves into one shared helper that both the
 * canvas and the nine other call sites read — not copied ten times.
 */

import { useMemo, useState } from "react";
import { CloudSun, Shirt, Sparkles, Wand2 } from "lucide-react";
import { suggestLooks } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import { isSampleItem } from "@/lib/demo-data";
import { readCachedWeather } from "@/lib/weather";
import { STYLE_OCCASIONS } from "@/lib/style-quiz";
import type { Season, WardrobeItem } from "@/lib/types";
import { Group, Row } from "@/components/you/settings-ui";
import { Chip, Toggle } from "@/components/ui";

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

/** Short chip labels; STYLE_OCCASIONS labels ("Everyday / casual") are too long for a chip row. */
const OCC = STYLE_OCCASIONS.map((o) => ({ id: o.id, short: o.label.split(" / ")[0] }));

type Variant = "A" | "B" | "C";

interface Ctx {
  auto: boolean;
  season: Season;
  occasion: string;
  temp: number;
  coat: boolean;
  preset: string | null;
}

const PRESETS = [
  { key: "hot", name: "Hot day", hint: "summer · 31°", season: "summer" as Season, occasion: "everyday", temp: 31, coat: false },
  { key: "office", name: "Office", hint: "work · 21°", season: "spring" as Season, occasion: "work", temp: 21, coat: false },
  { key: "night", name: "Night out", hint: "nights out · 17°", season: "fall" as Season, occasion: "nights_out", temp: 17, coat: false },
  { key: "cold", name: "Cold snap", hint: "winter · coat · 1°", season: "winter" as Season, occasion: "everyday", temp: 1, coat: true },
];

const SLATE = ["Safe", "Elevated", "Experimental"];

/** A settings field that holds interactive children. `Row` renders a <button>, so
 *  chips can't nest inside it — this mirrors Row's padding and hairline instead. */
function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line">
      <p className="mb-2 text-[13px] font-medium text-muted">{title}</p>
      {children}
    </div>
  );
}

export default function ContextProto() {
  const items = useWardrobe((s) => s.items);
  const [variant, setVariant] = useState<Variant>("B");
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cached = useMemo(() => readCachedWeather(), []);

  const [ctx, setCtx] = useState<Ctx>({
    auto: true,
    season: cached?.season ?? "summer",
    occasion: "everyday",
    temp: cached?.tempC ?? 22,
    coat: cached?.needsOuterwear ?? false,
    preset: null,
  });

  // Any manual edit turns the override on and clears a preset — the same rule the
  // real thing needs, so the prototype behaves honestly.
  const edit = (patch: Partial<Ctx>) =>
    setCtx((c) => ({ ...c, ...patch, auto: false, preset: null }));

  const owned = useMemo(
    () => items.filter((i) => i && !i.wishlist && i.imageUrl),
    [items],
  );

  // Keyed on the DATA, not on `authUser`. A signed-out session still has the real
  // closet persisted locally, and warning "not your closet" over 154 real garments
  // is worse than not warning at all — it teaches you to distrust a correct screen.
  const isDemo = owned.length > 0 && owned.every(isSampleItem);

  /** Exactly what Surprise me would receive. This object is the contract. */
  const resolved = useMemo(() => {
    if (ctx.auto) {
      return {
        season: cached?.season,
        tempC: cached?.tempC ?? null,
        needsOuterwear: cached?.needsOuterwear ?? false,
        occasion: "everyday",
        source: cached ? "auto · detected weather" : "auto · no weather cached",
      };
    }
    return {
      season: ctx.season,
      tempC: ctx.temp,
      needsOuterwear: ctx.coat,
      occasion: ctx.occasion,
      source: ctx.preset ? `override · ${ctx.preset}` : "override · manual",
    };
  }, [ctx, cached]);

  // useMemo, not state+effect: react-hooks/set-state-in-effect rejects setState
  // from an effect body, and this also keeps the three looks stable between
  // renders so the list doesn't reshuffle every time you touch a chip.
  const looks = useMemo(() => {
    if (owned.length < 2) return [];
    void nonce;
    return suggestLooks(owned, {
      weather: resolved.season
        ? {
            season: resolved.season,
            needsOuterwear: resolved.needsOuterwear,
            tempC: resolved.tempC ?? undefined,
          }
        : null,
      season: resolved.season,
      occasion: resolved.occasion,
      vibe: STYLE_OCCASIONS.find((o) => o.id === resolved.occasion)?.vibe,
      count: 3,
      engine: "v2",
    });
  }, [owned, resolved, nonce]);

  /**
   * Season and temperature are separate controls here, so they can contradict each
   * other — and that contradiction is REACHABLE in a way it never was before.
   * `rejectOutfit` filter 8 rejects knit accessories on the season alone:
   *
   *   if ((season === "summer" || season === "spring") && items.some(isColdAccessory))
   *
   * It never consults `tempC`. Today both values come from one weather snapshot so
   * they always agree; the instant you can set them apart, "winter at 27°C" hands
   * you a wool scarf. Surfacing it rather than hiding it, because it decides the
   * shape of the real build: either temperature is derived from season (one
   * control, contradiction impossible) or that filter has to learn about tempC.
   */
  const contradiction =
    !ctx.auto &&
    (((ctx.season === "summer" || ctx.season === "spring") && ctx.temp < 10) ||
      ((ctx.season === "winter" || ctx.season === "fall") && ctx.temp > 22))
      ? `${ctx.season} at ${ctx.temp}°C is contradictory — the season rules and the temperature rules will disagree.`
      : null;

  const summary = ctx.auto
    ? "Auto"
    : `${ctx.season} · ${OCC.find((o) => o.id === ctx.occasion)?.short ?? ctx.occasion} · ${ctx.temp}°${ctx.coat ? " · coat" : ""}`;

  const seasonChips = (
    <div className="flex flex-wrap gap-1.5">
      {SEASONS.map((s) => (
        <Chip key={s} active={!ctx.auto && ctx.season === s} onClick={() => edit({ season: s })}>
          {s}
        </Chip>
      ))}
    </div>
  );
  const occChips = (
    <div className="flex flex-wrap gap-1.5">
      {OCC.map((o) => (
        <Chip key={o.id} active={!ctx.auto && ctx.occasion === o.id} onClick={() => edit({ occasion: o.id })}>
          {o.short}
        </Chip>
      ))}
    </div>
  );
  const tempField = (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={-10}
        max={40}
        value={ctx.temp}
        onChange={(e) => edit({ temp: Number(e.target.value) })}
        className="h-1.5 w-full"
        style={{ accentColor: "var(--accent)" }}
        aria-label="Temperature"
      />
      <b className="w-12 shrink-0 text-right text-[15px] tabular-nums">{ctx.temp}°C</b>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg">
      {/* Prototype chrome. A WKWebView has no back button, so without this link the
          app is a force-quit away from being usable again. */}
      <div
        className="flex items-center gap-3 bg-black px-4 text-sm"
        style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: 10 }}
      >
        <a href="/n?native=1" className="font-semibold text-white/90 underline">
          ‹ Back to app
        </a>
        <span className="text-white/40">AJA-258 prototype</span>
        <span className="ml-auto flex overflow-hidden rounded-full border border-white/25">
          {(["A", "B", "C"] as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={`px-2.5 py-1 text-[12px] font-semibold ${
                variant === v ? "bg-white text-black" : "text-white/70"
              }`}
            >
              {v}
            </button>
          ))}
        </span>
      </div>

      {isDemo && (
        <p className="bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          These are the {owned.length} built-in demo garments — <b>not your closet</b>.
          Sign in, let it sync, then reload.
        </p>
      )}

      {/* Everything below is the real Settings container + real Settings components. */}
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-10">
        <p className="px-1 text-[13px] text-muted">
          {variant === "A" && "A · Literal — every control visible at once, as its own Settings block."}
          {variant === "B" && "B · Progressive — one row that expands. Auto is the default, so nothing changes unless you opt in."}
          {variant === "C" && "C · Presets — one tap sets all four."}
        </p>

        <Group label="Closet">
          {/* Real sibling rows, so you see the control in context and not alone. */}
          <Row icon={Sparkles} label="Standardize my closet" chevron />
          <Row icon={Wand2} label="Fill in missing details" value={`${owned.length} items`} chevron />

          {variant === "A" && (
            <>
              <Field title="Season">{seasonChips}</Field>
              <Field title="Occasion">{occChips}</Field>
              <Field title="Temperature">{tempField}</Field>
              <Row
                icon={CloudSun}
                label="Needs a coat"
                right={<Toggle on={ctx.coat} onChange={() => edit({ coat: !ctx.coat })} label="Needs a coat" />}
              />
              <Row
                icon={CloudSun}
                label="Use detected weather"
                right={
                  <Toggle
                    on={ctx.auto}
                    onChange={() => setCtx((c) => ({ ...c, auto: !c.auto, preset: null }))}
                    label="Use detected weather"
                  />
                }
              />
            </>
          )}

          {variant === "B" && (
            <>
              <Row
                icon={CloudSun}
                label="Style context"
                onClick={() => setOpen((o) => !o)}
                // `right`, not `value`: the summary is longer than Row's single-line
                // value slot and overlapped the label in the HTML prototype.
                right={
                  <span className="max-w-[46%] shrink-0 text-right text-[11.5px] capitalize leading-[1.35] text-muted">
                    {summary}
                  </span>
                }
                chevron
              />
              {open && (
                <>
                  <Field title="Use">
                    <div className="flex flex-wrap gap-1.5">
                      {/* Single words: the app's Chip applies `capitalize`, which turns
                          "Set it myself" into "Set It Myself". */}
                      <Chip active={ctx.auto} onClick={() => setCtx((c) => ({ ...c, auto: true, preset: null }))}>
                        Auto
                      </Chip>
                      <Chip active={!ctx.auto} onClick={() => setCtx((c) => ({ ...c, auto: false }))}>
                        Manual
                      </Chip>
                    </div>
                  </Field>
                  {!ctx.auto && (
                    <>
                      <Field title="Season">{seasonChips}</Field>
                      <Field title="Occasion">{occChips}</Field>
                      <Field title="Temperature">{tempField}</Field>
                      <Row
                        icon={CloudSun}
                        label="Needs a coat"
                        right={<Toggle on={ctx.coat} onChange={() => edit({ coat: !ctx.coat })} label="Needs a coat" />}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}

          {variant === "C" && (
            <>
              <Field title="Style context">
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() =>
                        setCtx({
                          auto: false,
                          season: p.season,
                          occasion: p.occasion,
                          temp: p.temp,
                          coat: p.coat,
                          preset: p.name,
                        })
                      }
                      aria-pressed={ctx.preset === p.name}
                      className={`rounded-xl border p-2.5 text-left transition-colors active:scale-[0.98] ${
                        ctx.preset === p.name ? "border-accent bg-accent-soft" : "border-line bg-surface"
                      }`}
                    >
                      <b className="block text-[13.5px]">{p.name}</b>
                      <span className="block text-[11px] text-muted">{p.hint}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <Row
                icon={CloudSun}
                label="Back to auto"
                value={ctx.auto ? "in use" : "using weather"}
                onClick={() => setCtx((c) => ({ ...c, auto: true, preset: null }))}
              />
            </>
          )}
        </Group>

        {contradiction && (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
            <b>Heads up:</b> {contradiction} This is a real gap the prototype found —
            see the note at the bottom.
          </p>
        )}

        {/* The part a static page can't show: the same engine, your closet, live. */}
        <Group label="What Surprise me gives you" right={resolved.source}>
          {looks.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-muted">
              {owned.length < 2
                ? "Not enough usable items in the closet yet."
                : "No look survived the filters for this context — try a different season or temperature."}
            </p>
          ) : (
            looks.map((look, i) => (
              <div
                key={look.itemIds.join("|")}
                className="px-3.5 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line"
              >
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{SLATE[i] ?? `Look ${i + 1}`}</span>
                  <span className="truncate text-[11.5px] text-muted">{look.reasons[0] ?? ""}</span>
                </div>
                {/* A winter look can reach five pieces (top, bottom, shoes, coat,
                    accessory), which overflows 375px and clipped the last thumbnail. */}
                <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5">
                  {look.items.map((it: WardrobeItem) => (
                    <div
                      key={it.id}
                      className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2"
                      title={it.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.imageUrl} alt={it.name} className="h-full w-full object-contain p-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <Row
            icon={Shirt}
            label="Shuffle these three"
            value={`${looks.length} looks`}
            onClick={() => setNonce((n) => n + 1)}
          />
        </Group>

        <div className="space-y-2 px-1 text-[12px] leading-relaxed text-muted">
          <p>
            Change the season or temperature and the three looks above change with it —
            that is the whole feature. Nothing here is saved yet, and no app code has
            been changed. Tell me which of A / B / C to build.
          </p>
          <p>
            <b className="text-foreground">What this prototype already found:</b> season
            and temperature are separate controls, so they can contradict each other.
            The engine&rsquo;s knit-accessory rule checks the <i>season</i> and never the
            temperature, so &ldquo;winter at 27°C&rdquo; will put a wool scarf on you.
            That can&rsquo;t happen today because both values come from the same weather
            reading. Whichever variant you pick, this has to be settled first — either
            temperature is derived from the season (one control, no contradiction
            possible) or that rule learns about temperature.
          </p>
        </div>
      </div>
    </div>
  );
}
