"use client";

/**
 * AJA-290 · Working preview of the tight, 8-step first-run journey, built with the app's real
 * design tokens, fonts (Libre Baskerville `.heading`) and `Button` — so it renders exactly as it
 * would inside the app, not as a bezel mockup. Mounted at /first-run-preview.
 *
 * This is a PREVIEW, not the shipped onboarding: capture/extraction are simulated on the sample
 * cutouts in /public/samples (the real thing runs `detect-garments` + `cutout`, which need auth).
 * The flow, states and copy are the real ones. Steps, in order:
 *   welcome → who → vibe → upload → extract → closet → outfit → signup(+saved)
 */

import Image from "next/image";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readAnalyzedAttrs } from "@/lib/analyze-attrs";
import { detectGarments, type DetectedGarment } from "@/lib/detect-garments";
import { startGuestSession } from "@/lib/supabase/auth";
import { useWardrobe } from "@/lib/store";
import type { Category } from "@/lib/types";
import { Button } from "../ui";

type Slot = "top" | "bottom" | "shoes";
type Gender = "women" | "men";
type Piece = { slot: Slot; slug: string; name: string; tag: string; imageUrl?: string };

/** Map a detected garment's category onto the journey's 3-slot board model (best effort). */
const categoryToSlot = (c: Category): Slot =>
  c === "bottom" ? "bottom" : c === "shoes" ? "shoes" : "top";

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Couldn't read that photo."));
    r.readAsDataURL(file);
  });
type Step =
  | "welcome" | "who" | "vibe" | "upload"
  | "extract" | "closet" | "outfit" | "signup";

const STEPS: Step[] = ["welcome", "who", "vibe", "upload", "extract", "closet", "outfit", "signup"];

const SETS: Record<Gender, Piece[]> = {
  women: [
    { slot: "top", slug: "white-shirt", name: "White shirt", tag: "Shirt" },
    { slot: "top", slug: "camel-sweater", name: "Camel sweater", tag: "Sweater" },
    { slot: "bottom", slug: "blue-jeans", name: "Blue jeans", tag: "Jeans" },
    { slot: "bottom", slug: "trousers", name: "Trousers", tag: "Trousers" },
    { slot: "shoes", slug: "white-sneakers", name: "White sneakers", tag: "Trainers" },
    { slot: "shoes", slug: "loafers", name: "Loafers", tag: "Loafers" },
  ],
  men: [
    { slot: "top", slug: "white-oxford", name: "White oxford", tag: "Shirt" },
    { slot: "top", slug: "navy-sweater", name: "Navy sweater", tag: "Sweater" },
    { slot: "bottom", slug: "dark-jeans", name: "Dark jeans", tag: "Jeans" },
    { slot: "bottom", slug: "chinos", name: "Chinos", tag: "Chinos" },
    { slot: "shoes", slug: "white-sneakers", name: "White sneakers", tag: "Trainers" },
    { slot: "shoes", slug: "loafers", name: "Loafers", tag: "Loafers" },
  ],
};

const VIBES: Record<Gender, [string, string, string, string][]> = {
  women: [
    ["Quiet Classic", "white-shirt", "trousers", "Clean lines, few colours"],
    ["Relaxed", "camel-sweater", "blue-jeans", "Soft, easy, layered"],
    ["Statement", "white-shirt", "blue-jeans", "Colour and contrast"],
  ],
  men: [
    ["Quiet Classic", "white-oxford", "chinos", "Clean lines, few colours"],
    ["Relaxed", "navy-sweater", "dark-jeans", "Soft, easy, layered"],
    ["Statement", "white-oxford", "dark-jeans", "Colour and contrast"],
  ],
};

type Pos = { left: string; top: string; width: string };
type Upload = { name: string; items: [string, Pos][] };
const UPLOADS: Record<Gender, Upload[]> = {
  women: [
    { name: "IMG_4821.jpg", items: [
      ["white-shirt", { left: "14%", top: "8%", width: "46%" }],
      ["blue-jeans", { left: "50%", top: "30%", width: "40%" }],
      ["white-sneakers", { left: "20%", top: "62%", width: "38%" }]] },
    { name: "IMG_5093.jpg", items: [
      ["camel-sweater", { left: "16%", top: "9%", width: "46%" }],
      ["trousers", { left: "48%", top: "32%", width: "42%" }],
      ["loafers", { left: "22%", top: "64%", width: "36%" }]] },
  ],
  men: [
    { name: "IMG_4821.jpg", items: [
      ["white-oxford", { left: "14%", top: "8%", width: "46%" }],
      ["dark-jeans", { left: "50%", top: "30%", width: "40%" }],
      ["white-sneakers", { left: "20%", top: "62%", width: "38%" }]] },
    { name: "IMG_5093.jpg", items: [
      ["navy-sweater", { left: "16%", top: "9%", width: "46%" }],
      ["chinos", { left: "48%", top: "32%", width: "42%" }],
      ["loafers", { left: "22%", top: "64%", width: "36%" }]] },
  ],
};

/** Board placement, mirroring CanvasBuilderView.placeLook — the layout the real builder uses. */
const BOX: Record<Slot, Pos> = {
  top: { left: "3%", top: "6%", width: "52%" },
  bottom: { left: "0", top: "50%", width: "58.24%" },
  shoes: { left: "56%", top: "70%", width: "36%" },
};

const src = (g: Gender, slug: string) => `/samples/${g}/${slug}-sticker.png`;

export function FirstRunJourney({ live = false, onSignup, onLogin }: {
  /**
   * `live` (in the app, signed-out) wires the journey to the real world: it mints an anonymous
   * guest session on mount, writes each captured piece to the real store, and hands the signup
   * step to the app's AuthModal — which converts the guest into a real account with the pieces
   * kept. Without it (the /first-run-preview route) the journey is a self-contained mock: local
   * state, a fake signup screen, no session touched.
   *
   * Slice 1: capture is still a sample stand-in in both modes — `acceptExtract` files the sample
   * cutout as a real store item. Slice 2 swaps that for real `detectGarments()` output.
   */
  live?: boolean;
  onSignup?: () => void;
  onLogin?: () => void;
} = {}) {
  const [step, setStep] = useState<Step>("welcome");
  const [gender, setGender] = useState<Gender>("women");
  const [whoTouched, setWhoTouched] = useState(false);
  const [vibe, setVibe] = useState("Quiet Classic");
  const [owned, setOwned] = useState<Piece[]>([]);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [oVariant, setOVariant] = useState(0);
  const [saved, setSaved] = useState(false);

  // extract animation (preview mode)
  const [exReveal, setExReveal] = useState(0);
  const [exDone, setExDone] = useState(false);

  // live capture (real photo → detect-garments)
  const [guestId, setGuestId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadedImg, setUploadedImg] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedGarment[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const pieces = SETS[gender];
  const metaOf = useCallback((slug: string) => pieces.find((p) => p.slug === slug)!, [pieces]);
  const outfits = useMemo(() => {
    const t = owned.filter((p) => p.slot === "top").length;
    const b = owned.filter((p) => p.slot === "bottom").length;
    return t * b;
  }, [owned]);
  const currentUpload = UPLOADS[gender][uploadIdx % UPLOADS[gender].length];

  const go = (s: Step) => setStep(s);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  // Reset the reveal state BEFORE navigating in, so the effect only schedules timers (no
  // synchronous setState in an effect).
  const startExtract = () => { setExReveal(0); setExDone(false); setStep("extract"); };

  // In the app, the "keep it" / "log in" affordances hand off to the real AuthModal (which does the
  // guest→real conversion). In the preview, they just drive the mock signup step.
  const goSignup = () => (live ? onSignup?.() : go("signup"));
  const goLogin = () => (live ? onLogin?.() : go("signup"));

  // Live only: mint (or reuse) the anonymous guest session so capture + conversion work. Runs once.
  // The guest id is threaded into detectGarments so cutouts upload to Storage under this same id —
  // convertGuest then keeps them (store `authUser` stays null for a guest, so we can't read it there).
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void startGuestSession().then((r) => {
      if (cancelled) return;
      if (r.ok) setGuestId(r.userId);
      else console.warn("[guest] session not started:", r.error);
    });
    return () => { cancelled = true; };
  }, [live]);

  // Live capture: real photo → detect-garments (segment/detect → per-garment cutout → tag).
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setStep("extract");
    setDetecting(true);
    setDetected(null);
    setDetectError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUploadedImg(dataUrl);
      const garments = await detectGarments(dataUrl, guestId, 2);
      if (!garments.length) throw new Error("No clothes found in that photo — try one where the pieces are clearer.");
      setDetected(garments);
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Couldn't read that photo.");
    } finally {
      setDetecting(false);
    }
  };

  const acceptRealExtract = () => {
    const garments = detected ?? [];
    const { addItem } = useWardrobe.getState();
    for (const g of garments) {
      addItem({
        ...readAnalyzedAttrs(g as unknown as Record<string, unknown>),
        name: g.name,
        category: g.category,
        color: g.color,
        colorName: g.colorName,
        tags: g.tags,
        seasons: g.seasons,
        cutoutEngine: g.cutoutEngine,
        imageUrl: g.url,
        wishlist: false,
      });
    }
    // Mirror into the journey's own board model so the closet/outfit screens can show them.
    setOwned((prev) => [
      ...prev,
      ...garments.map((g) => ({
        slot: categoryToSlot(g.category),
        slug: g.url,
        name: g.name,
        tag: g.category,
        imageUrl: g.url,
      })),
    ]);
    setUploadedImg(null);
    setDetected(null);
    go("closet");
  };

  // run the extraction timeline whenever we (re-)enter the extract step
  useEffect(() => {
    if (step !== "extract") return;
    const boxes = currentUpload.items.length;
    const timers: number[] = [];
    for (let i = 0; i < boxes; i++) {
      timers.push(window.setTimeout(() => setExReveal(i + 1), 1150 + i * 380));
    }
    timers.push(window.setTimeout(() => setExDone(true), 1150 + boxes * 380 + 500));
    return () => timers.forEach(clearTimeout);
  }, [step, uploadIdx, currentUpload.items.length]);

  // Preview-only: the simulated flat-lay accept (live mode uses onFile → acceptRealExtract).
  const acceptExtract = () => {
    setOwned((prev) => {
      const nextOwned = [...prev];
      for (const [slug] of currentUpload.items) {
        if (!nextOwned.find((p) => p.slug === slug)) nextOwned.push(metaOf(slug));
      }
      return nextOwned;
    });
    setUploadIdx((n) => n + 1);
    go("closet");
  };

  const outfitLook = useMemo(() => {
    const tops = owned.filter((p) => p.slot === "top");
    const bots = owned.filter((p) => p.slot === "bottom");
    const sh = owned.filter((p) => p.slot === "shoes");
    const combos: [Piece, Piece][] = [];
    tops.forEach((t) => bots.forEach((b) => combos.push([t, b])));
    if (!combos.length) return null;
    const [t, b] = combos[oVariant % combos.length];
    const s = sh.length ? sh[oVariant % sh.length] : null;
    return { t, b, s, count: combos.length };
  }, [owned, oVariant]);

  const restart = () => {
    setStep("welcome"); setGender("women"); setWhoTouched(false); setVibe("Quiet Classic");
    setOwned([]); setUploadIdx(0); setOVariant(0); setSaved(false);
  };

  return (
    <div className="frj-root relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-background">
      <Style />

      {/* progress on the two question steps */}
      {(step === "who" || step === "vibe") && (
        <div className="flex flex-none gap-1.5 px-6 pt-[max(14px,env(safe-area-inset-top))]">
          {STEPS.map((_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent transition-all" style={{ width: i <= idx ? "100%" : 0 }} />
            </span>
          ))}
        </div>
      )}

      {/* ── 1 · WELCOME ── */}
      {step === "welcome" && (
        <div className="relative flex-1 overflow-hidden bg-[#141310]">
          <video autoPlay muted loop playsInline poster="/hero-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover opacity-60">
            <source src="/bg-video-v2.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(20,19,16,.2),rgba(20,19,16,.86))" }} />
          <div className="absolute inset-0 flex flex-col justify-end px-7 pb-[max(30px,env(safe-area-inset-bottom))] text-white">
            <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">Your Personal Wardrobe</span>
            <h1 className="heading mt-2 text-[34px] font-normal leading-[1.1]">Get dressed in seconds.<br />Buy less. Wear more.</h1>
            <p className="mt-3 max-w-[300px] text-[15px] text-white/75">A minute to set up. No account until you want to keep it.</p>
            <button onClick={next} className="mt-6 w-full rounded-full bg-white py-[15px] text-[16px] font-semibold text-[#141310] active:scale-[0.98]">Let&apos;s build your closet</button>
            <p className="mt-3 text-center text-[12.5px] text-white/55">Already have an account? <b className="cursor-pointer text-white" onClick={goLogin}>Log in</b></p>
          </div>
        </div>
      )}

      {/* ── 2 · WHO ── */}
      {step === "who" && (
        <StepBody>
          <h2 className="heading mt-3.5 text-[25px]">First — who are we dressing?</h2>
          <p className="mt-2 text-[14.5px] text-muted">Sets the pieces you&apos;ll see in a moment.</p>
          <div className="mt-3 space-y-2.5">
            {(["women", "men"] as Gender[]).map((g) => (
              <ChoiceCard key={g} active={whoTouched && gender === g}
                onClick={() => { setGender(g); setWhoTouched(true); if (live) useWardrobe.getState().updateProfile({ shopGender: g === "women" ? "female" : "male" }); }}
                emoji={g === "women" ? "👗" : "👔"}
                title={g === "women" ? "Women's" : "Men's"}
                hint={g === "women" ? "Show women's styles" : "Show men's styles"} />
            ))}
          </div>
          <div className="flex-1" />
          <Footer>
            <Button className="w-full py-[15px] text-[16px]" disabled={!whoTouched} onClick={next}>Continue</Button>
          </Footer>
        </StepBody>
      )}

      {/* ── 3 · VIBE ── */}
      {step === "vibe" && (
        <StepBody>
          <h2 className="heading mt-3.5 text-[25px]">Which feels most like you?</h2>
          <p className="mt-2 text-[14.5px] text-muted">Just a starting point — it learns as you go.</p>
          <div className="mt-3 space-y-2.5">
            {VIBES[gender].map(([name, a, b, desc]) => (
              <button key={name} onClick={() => { setVibe(name); setTimeout(next, 220); }}
                className={`flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors active:scale-[0.99] ${vibe === name ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
                <span className="flex flex-none gap-1">
                  <Image src={src(gender, a)} alt="" width={30} height={30} unoptimized className="h-[30px] w-[30px] object-contain" />
                  <Image src={src(gender, b)} alt="" width={30} height={30} unoptimized className="h-[30px] w-[30px] object-contain" />
                </span>
                <span><b className="block text-[15px] font-semibold">{name}</b><i className="mt-0.5 block text-[12.5px] not-italic text-muted">{desc}</i></span>
              </button>
            ))}
          </div>
        </StepBody>
      )}

      {/* ── 4 · UPLOAD (bridge folded in) ── */}
      {step === "upload" && (
        <StepBody>
          <Chead kicker={owned.length ? "Add more" : "Now the real thing"} title={owned.length ? "Another photo" : "Fill it with your clothes"} />
          {live && (
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          )}
          <button onClick={live ? () => fileRef.current?.click() : startExtract}
            className="mt-3.5 flex flex-1 flex-col items-center justify-center gap-3.5 rounded-[22px] border-2 border-dashed border-line bg-surface px-8 text-center transition-colors active:border-accent active:bg-accent-soft">
            <span className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-accent-soft text-[28px]">⬆️</span>
            <b className="heading text-[19px] font-normal">Upload a photo</b>
            <p className="text-[13.5px] leading-snug text-muted">Any photo with clothes in it works — even an old selfie. We find each piece, cut out the background, and tag it.</p>
            <span className="mt-1 flex gap-1.5">
              {["👗 Outfit selfie", "🛏️ Flat-lay", "🧺 A pile"].map((t) => (
                <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">{t}</span>
              ))}
            </span>
          </button>
          <p className="flex-none px-1.5 pt-3 text-center text-[12.5px] text-muted">
            {owned.length ? "Each photo adds a few more pieces — two or three is plenty to start." : "No clean product shots, no photographing one at a time — one messy photo becomes several catalogued pieces."}
          </p>
          <Footer>
            {owned.length > 0 ? (
              <Button variant="ghost" className="w-full" onClick={() => go("closet")}>Back to closet</Button>
            ) : (
              // No pieces yet, and maybe no photo handy — don't trap the flow on a step that needs
              // one. Let them past the gate to make an account and add clothes whenever they're ready.
              <Button variant="ghost" className="w-full" onClick={goSignup}>Skip for now</Button>
            )}
          </Footer>
        </StepBody>
      )}

      {/* ── 5 · EXTRACT (live: real detect-garments) ── */}
      {step === "extract" && live && (
        <StepBody>
          <Chead
            kicker={detecting ? "Reading your photo" : detectError ? "Hmm" : "From your photo"}
            title={detecting ? "Finding the pieces…" : detectError ? "Couldn't read that one" : `${detected?.length ?? 0} piece${(detected?.length ?? 0) === 1 ? "" : "s"} found`}
          />
          <div className="mt-3 flex flex-1 flex-col">
            <div className="relative flex-1 overflow-hidden rounded-[20px] bg-surface-2">
              {uploadedImg && <Image src={uploadedImg} alt="" fill unoptimized className="object-cover" />}
              {detecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/35 text-white">
                  <span className="frj-spin h-10 w-10 rounded-full border-[3px] border-white/25 border-t-white" />
                  <span className="text-[13px]">Detecting garments…</span>
                </div>
              )}
            </div>
            {!detecting && !detectError && detected && detected.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {detected.map((g, i) => (
                  <div key={i} className="frj-rise w-[92px] flex-none rounded-[14px] border border-accent bg-surface px-1.5 pb-[9px] pt-2 text-center">
                    <Image src={g.url} alt="" width={80} height={44} unoptimized className="mx-auto h-[44px] object-contain" />
                    <span className="mt-1 block truncate text-[11px] text-muted">{g.name}</span>
                  </div>
                ))}
              </div>
            )}
            {detectError && <p className="mt-3 text-center text-[13px] text-red-600">{detectError}</p>}
            {!detecting && !detectError && detected && (
              <div className="mt-3 min-h-[20px] text-center text-[13.5px] font-semibold text-accent">Background removed · tagged · ready</div>
            )}
          </div>
          <Footer>
            {detectError ? (
              <Button className="w-full py-[15px] text-[16px]" onClick={() => go("upload")}>Try another photo</Button>
            ) : (
              <Button className="w-full py-[15px] text-[16px]" disabled={detecting || !(detected && detected.length)} onClick={acceptRealExtract}>
                {detecting ? "Detecting…" : `Add ${detected?.length ?? 0} to my closet`}
              </Button>
            )}
          </Footer>
        </StepBody>
      )}

      {/* ── 5 · EXTRACT (preview: simulated flat-lay) ── */}
      {step === "extract" && !live && (
        <StepBody>
          <Chead kicker={currentUpload.name} title={exDone ? `${currentUpload.items.length} pieces found` : "Finding the pieces…"} />
          <div className="mt-3 flex flex-1 flex-col">
            <div className="relative flex-1 overflow-hidden rounded-[20px]"
              style={{ background: "radial-gradient(circle at 30% 20%,#e4dccf,transparent 55%),radial-gradient(circle at 75% 85%,#b8ad9c,transparent 60%),linear-gradient(160deg,#d8cebd,#a99f8d)" }}>
              {currentUpload.items.map(([slug, pos]) => (
                <div key={"g" + slug} className="absolute flex items-center justify-center" style={{ left: pos.left, top: pos.top, width: pos.width, aspectRatio: "1" }}>
                  <Image src={src(gender, slug)} alt="" width={200} height={200} unoptimized className="max-h-full max-w-full object-contain [filter:drop-shadow(0_8px_14px_rgba(0,0,0,.22))]" />
                </div>
              ))}
              {currentUpload.items.map(([slug, pos], i) => (
                <div key={"b" + slug} className="frj-dbox absolute rounded-[10px]" data-on={i < exReveal}
                  style={{ left: pos.left, top: pos.top, width: pos.width, aspectRatio: "1" }}>
                  <b className="absolute -top-[11px] left-2 rounded-[6px] bg-accent px-[7px] py-0.5 text-[10.5px] font-semibold text-white">{metaOf(slug).tag}</b>
                </div>
              ))}
              {!exDone && <div className="frj-scan absolute inset-x-0" />}
            </div>
            {exDone && (
              <div className="mt-3 flex gap-2">
                {currentUpload.items.map(([slug], i) => (
                  <div key={slug} className="frj-rise flex-1 rounded-[14px] border border-accent bg-surface px-1.5 pb-[9px] pt-2 text-center" style={{ animationDelay: `${i * 0.08}s` }}>
                    <Image src={src(gender, slug)} alt="" width={80} height={44} unoptimized className="mx-auto h-[44px] object-contain" />
                    <span className="mt-1 block text-[11px] text-muted">{metaOf(slug).name}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 min-h-[20px] text-center text-[13.5px] font-semibold text-accent">
              {exDone ? "Background removed · tagged · ready" : exReveal ? `Found ${exReveal} of ${currentUpload.items.length}…` : ""}
            </div>
          </div>
          <Footer>
            <Button className="w-full py-[15px] text-[16px]" disabled={!exDone} onClick={acceptExtract}>
              {exDone ? `Add ${currentUpload.items.length} to my closet` : "Scanning…"}
            </Button>
          </Footer>
        </StepBody>
      )}

      {/* ── 6 · CLOSET ── */}
      {step === "closet" && (
        <StepBody>
          <Chead kicker="Your closet" title={`${owned.length} piece${owned.length === 1 ? "" : "s"}`}
            tally={outfits ? `${outfits} outfit${outfits === 1 ? "" : "s"}` : "keep going"} />
          <div className="flex flex-1 flex-col justify-center">
            <ClosetGrid gender={gender} owned={owned} pieces={pieces} />
            <div className="mt-4 text-center">
              <b className="heading block text-[18px]">{outfits ? `${owned.length} pieces. ${outfits} outfit${outfits === 1 ? "" : "s"}.` : "One top and one bottom starts it."}</b>
              <span className="mt-1.5 block text-[13.5px] leading-snug text-muted">{outfits ? "That's from one photo. Add another and it multiplies — six is the sweet spot." : "Add one more photo and the outfits begin."}</span>
            </div>
          </div>
          <Footer>
            <Button className="w-full py-[15px] text-[16px]" onClick={() => go("upload")}>{owned.length >= 6 ? "Add more later" : "Add another photo"}</Button>
            {outfits >= 1 && <Button variant="ghost" className="w-full" onClick={() => go("outfit")}>Style me from these →</Button>}
          </Footer>
          {owned.length >= 2 && (
            <div className="-mx-6 flex flex-none items-center gap-3 border-t border-[#cfe0c6] bg-accent-soft px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-3.5">
              <p className="flex-1 text-[13px] leading-tight text-muted"><b className="block text-[13.5px] text-foreground">{owned.length} pieces, not saved.</b>Create an account and they&apos;re yours on every device.</p>
              <button onClick={goSignup} className="flex-none rounded-full bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-accent-foreground">Keep it</button>
            </div>
          )}
        </StepBody>
      )}

      {/* ── 7 · OUTFIT ── */}
      {step === "outfit" && outfitLook && (
        <StepBody>
          <div className="pt-1.5 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.19em] text-muted">Your first outfit</span>
            <div><span className="mt-1 inline-block rounded-full bg-accent-soft px-3.5 py-[5px] text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">{vibe}</span></div>
          </div>
          <div className="flex flex-1 items-center justify-center py-2">
            <div className="relative aspect-[3/4] h-full max-w-full overflow-hidden rounded-[18px] border border-line bg-white">
              {([["top", outfitLook.t], ["bottom", outfitLook.b], ["shoes", outfitLook.s]] as [Slot, Piece | null][]).map(([slot, p]) =>
                p ? (
                  <div key={slot} className="absolute flex aspect-square items-center justify-center" style={{ left: BOX[slot].left, top: BOX[slot].top, width: BOX[slot].width }}>
                    <Image src={p.imageUrl ?? src(gender, p.slug)} alt={p.name} width={240} height={240} unoptimized className="animate-canvas-pop max-h-full max-w-full object-contain [filter:drop-shadow(0_6px_10px_rgba(0,0,0,.18))]" />
                  </div>
                ) : null,
              )}
            </div>
          </div>
          <p className="text-center text-[14.5px] text-muted">{owned.length} pieces already make {outfitLook.count} outfit{outfitLook.count === 1 ? "" : "s"} — all yours.</p>
          <Footer>
            <Button className="w-full py-[15px] text-[16px]" onClick={goSignup}>Love it — keep it</Button>
            <Button variant="ghost" className="w-full" onClick={() => setOVariant((v) => v + 1)}>Show me another</Button>
          </Footer>
        </StepBody>
      )}

      {/* ── 8 · SIGNUP (+ saved) ── */}
      {step === "signup" && !saved && (
        <StepBody>
          <Chead kicker="Last step" title="Keep your closet" />
          <div className="mt-3.5 flex gap-2">
            <Recap b={`${owned.length}`} label="pieces" />
            <Recap b={`${outfits}`} label="outfits" />
            <Recap b={vibe.split(" ")[0]} label="vibe" />
          </div>
          <p className="mt-2 text-[14.5px] text-muted">
            {owned.length
              ? "All of it is already in here. An account just keeps it — nothing is re-uploaded, this session becomes yours."
              : "Nothing saved yet — create your account and add your clothes whenever you're ready. It all syncs to every device."}
          </p>
          <Field label="Email" value="maya@example.com" />
          <Field label="Password" value="••••••••••" />
          <div className="flex-1" />
          <Footer>
            <Button className="w-full py-[15px] text-[16px]" onClick={() => setSaved(true)}>Create account &amp; keep it</Button>
            <div className="flex items-center gap-3 py-0.5 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            {/* Real app wires these through OAuthButtons (AJA-194: Google + Apple native OAuth). */}
            <Button variant="outline" className="w-full" onClick={() => setSaved(true)}>Continue with Google</Button>
            <Button variant="outline" className="w-full" onClick={() => setSaved(true)}>Continue with Apple</Button>
          </Footer>
        </StepBody>
      )}
      {step === "signup" && saved && (
        <StepBody>
          <Chead kicker="Your closet" title="Saved ✓" tally={`${owned.length} pieces · ${outfits} outfits`} />
          <div className="flex flex-1 flex-col justify-center">
            <ClosetGrid gender={gender} owned={owned} pieces={pieces} noGhost />
            <div className="mt-4 text-center">
              <b className="heading block text-[18px]">Same closet, same photos.</b>
              <span className="mt-1.5 block text-[13.5px] leading-snug text-muted">The guest session became a real account — nothing was copied or re-uploaded.</span>
            </div>
          </div>
          <Footer><Button variant="outline" className="w-full py-[15px] text-[16px]" onClick={restart}>Run it again</Button></Footer>
        </StepBody>
      )}
    </div>
  );
}

/* ── small building blocks, all on the app's tokens ── */

function StepBody({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))]">{children}</div>;
}
function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-none flex-col gap-2 pt-3">{children}</div>;
}
function Chead({ kicker, title, tally }: { kicker: string; title: string; tally?: string }) {
  return (
    <div className="flex flex-none items-end justify-between pt-2">
      <div>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.19em] text-muted">{kicker}</span>
        <h1 className="heading mt-0.5 text-[24px] font-normal">{title}</h1>
      </div>
      {tally && <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-accent">{tally}</span>}
    </div>
  );
}
function ChoiceCard({ active, onClick, emoji, title, hint }: { active: boolean; onClick: () => void; emoji: string; title: string; hint: string }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors active:scale-[0.99] ${active ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
      <span className="w-[30px] flex-none text-center text-[22px]">{emoji}</span>
      <span><b className="block text-[15px] font-semibold">{title}</b><i className="mt-0.5 block text-[12.5px] not-italic text-muted">{hint}</i></span>
    </button>
  );
}
function ClosetGrid({ gender, owned, pieces, noGhost }: { gender: Gender; owned: Piece[]; pieces: Piece[]; noGhost?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => {
        const p = owned[i];
        const isNext = !p && i === owned.length && !noGhost;
        return (
          <div key={i} className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface transition-colors ${p ? "border border-accent" : `border-[1.5px] border-dashed border-line ${isNext ? "frj-pulse" : ""}`}`}>
            {p ? (
              <Image src={p.imageUrl ?? src(gender, p.slug)} alt={p.name} width={120} height={120} unoptimized className="animate-canvas-pop max-h-[78%] max-w-[78%] object-contain" />
            ) : (
              <>
                <span className="absolute left-2 top-[7px] text-[10.5px] font-bold text-line">{i + 1}</span>
                {!noGhost && <Image src={src(gender, pieces[i].slug)} alt="" width={80} height={80} unoptimized className="max-h-[64%] max-w-[64%] object-contain opacity-[0.12] grayscale" />}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
function Recap({ b, label }: { b: string; label: string }) {
  return (
    <div className="flex-1 rounded-[14px] border border-line bg-surface px-2.5 py-3 text-center">
      <b className="heading block text-[22px]">{b}</b>
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2.5">
      <label className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted">{label}</label>
      <div className="mt-1.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-[14.5px] text-muted">{value}</div>
    </div>
  );
}

/** Scoped keyframes for the bits Tailwind can't express cleanly. */
function Style() {
  return (
    <style>{`
      .frj-dbox{border:2px solid var(--accent);box-shadow:0 0 0 3px rgba(86,122,74,.18);opacity:0;transform:scale(1.06)}
      .frj-dbox[data-on="true"]{opacity:1;transform:none;transition:opacity .3s,transform .3s cubic-bezier(.32,.72,0,1)}
      .frj-scan{height:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);box-shadow:0 0 16px 3px rgba(255,255,255,.5);top:0;animation:frjScan 1.15s cubic-bezier(.32,.72,0,1) forwards}
      @keyframes frjScan{0%{top:0;opacity:1}100%{top:100%;opacity:0}}
      .frj-rise{opacity:0;transform:translateY(8px);animation:frjRise .34s cubic-bezier(.32,.72,0,1) forwards}
      @keyframes frjRise{to{opacity:1;transform:none}}
      .frj-pulse{animation:frjPulse 1.6s infinite}
      @keyframes frjPulse{0%,100%{opacity:1}50%{opacity:.45}}
      .frj-spin{animation:frjSpin .8s linear infinite}
      @keyframes frjSpin{to{transform:rotate(360deg)}}
    `}</style>
  );
}
