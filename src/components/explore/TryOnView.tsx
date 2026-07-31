"use client";

import { Capacitor } from "@capacitor/core";
import { Check, ChevronLeft, ImagePlus, Loader2, RefreshCw, ScanFace, User } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { pickNativePhoto } from "@/lib/native-camera";
import { useWardrobe } from "@/lib/store";
import { deletePrivateRender, uploadPrivateRender } from "@/lib/supabase/private-storage";
import { dataUrlToFile, toCompressedDataUrl } from "@/lib/supabase/storage";
import { tryOnOutfit, TRYON_SCENES, type TryOnGarment, type TryOnScene } from "@/lib/tryon";

/**
 * "See it on you" (AJA-158 Phase 3; accuracy pass AJA-274; saving AJA-275).
 *
 * AJA-274 removed the render-on-mount: the screen used to spend a paid generation
 * on a stock model before you touched anything, so the first thing you saw on a
 * screen called "See it on you" was a stranger — and picking your own photo meant
 * paying twice for one answer. It now waits for a subject.
 *
 * AJA-275 adds saving. Two things stay true and are worth not breaking:
 *  - the photo you pick is still never stored, only the RENDER is;
 *  - the render goes to a PRIVATE bucket, not the public one the garment images
 *    live in, and only a bucket path is persisted (see private-storage.ts).
 */
export function TryOnView({
  garments,
  outfitId,
  onClose,
}: {
  garments: TryOnGarment[];
  /** Saved look to attach the render to. Absent for unsaved suggestions (Explore's
   *  hero look is a raw item list), in which case saving isn't offered. */
  outfitId?: string;
  onClose: () => void;
}) {
  const authUser = useWardrobe((s) => s.authUser);
  const setOutfitRender = useWardrobe((s) => s.setOutfitRender);
  const savedPath = useWardrobe((s) =>
    outfitId ? s.outfits.find((o) => o.id === outfitId)?.tryOnRenderPath : undefined,
  );

  const [personSrc, setPersonSrc] = useState<string | null>(null);
  const [scene, setScene] = useState<TryOnScene>("street");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  /** 501 = provider not configured; a retry can never succeed, so stop offering one. */
  const [unavailable, setUnavailable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (person: string | null, withScene: TryOnScene) => {
      if (!garments.length) {
        setError("This look has no items to try on.");
        return;
      }
      setLoading(true);
      setError(null);
      // A new render is not the saved one — re-arm the button.
      setSaveState("idle");
      try {
        setResult(await tryOnOutfit({ garments, personImage: person, scene: withScene }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Try-on failed. Try again.";
        setError(msg);
        if (/isn't configured/i.test(msg)) setUnavailable(true);
      } finally {
        setLoading(false);
      }
    },
    [garments],
  );

  const applyPhoto = async (file?: File) => {
    if (!file) return;
    try {
      // Compresses AND HEIC-decodes. The old bare FileReader did neither, so a
      // full-res photo went into the JSON body and an iPhone HEIC failed outright.
      const src = await toCompressedDataUrl(file);
      setPersonSrc(src);
      void run(src, scene);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo.");
    }
  };

  // WKWebView won't drive a bare <input type="file"> reliably — every other photo
  // entry point in the app goes through pickNativePhoto for exactly this reason.
  const pickPhoto = async () => {
    if (!Capacitor.isNativePlatform()) {
      fileRef.current?.click();
      return;
    }
    try {
      const file = await pickNativePhoto();
      if (file) void applyPhoto(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the photo library.");
    }
  };

  const changeScene = (next: TryOnScene) => {
    setScene(next);
    if (result || loading) void run(personSrc, next);
  };

  const saveRender = async () => {
    if (!result || !outfitId || !authUser || saveState !== "idle") return;
    setSaveState("saving");
    try {
      // The route returns a data URL, but tolerate a remote URL so this doesn't
      // break if the transport changes again.
      const blob = result.startsWith("data:")
        ? dataUrlToFile(result, "tryon")
        : await (await fetch(result)).blob();
      const path = await uploadPrivateRender(blob, authUser.id);
      const previous = savedPath;
      setOutfitRender(outfitId, path);
      // Replacing: drop the old blob, or it lingers unreferenced until the account
      // is deleted. Best-effort — the look already points at the new render.
      if (previous && previous !== path) void deletePrivateRender(previous);
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      setError(
        e instanceof Error ? `Couldn't save that render — ${e.message}` : "Couldn't save that render.",
      );
    }
  };

  const started = loading || result !== null || error !== null;
  const canSave = Boolean(result && !loading && outfitId && authUser);

  return (
    <div className="native-item-page native-page-in" role="dialog" aria-label="See it on you">
      <div className="native-item-page-header">
        <button type="button" onClick={onClose} className="native-item-page-back" aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="native-item-page-title">See it on you</span>
        <span className="native-item-page-spacer" />
      </div>

      <div className="native-item-page-body space-y-4">
        {/* Result canvas. object-contain, not object-cover: the render's aspect is the
            model's to choose, and cover silently sliced the head off a square one. */}
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-line bg-surface-2">
          {result && !loading && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result} alt="Try-on result" className="h-full w-full object-contain" />
          )}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
              <Loader2 size={26} className="animate-spin text-accent" />
              <p className="text-sm">Styling this on {personSrc ? "you" : "a model"}…</p>
              <p className="text-[11px]">Takes a few seconds</p>
            </div>
          )}
          {!loading && !result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted">
              <ScanFace size={26} />
              {error ? (
                <p className="text-sm">{error}</p>
              ) : (
                <>
                  <p className="text-sm text-foreground">See this look on your body</p>
                  <p className="text-[12px]">
                    Add a photo of yourself — full length, facing the camera.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {error && result && <p className="text-center text-xs text-red-500">{error}</p>}

        {/* Garment strip */}
        <div className="flex justify-center gap-2">
          {garments.slice(0, 5).map((g, i) => (
            <div key={i} className="h-12 w-10 overflow-hidden rounded-lg border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.image} alt={g.label ?? "item"} className="h-full w-full object-contain" />
            </div>
          ))}
        </div>

        {/* Subject. Your photo is the primary action — it's what the screen is for. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void pickPhoto()}
            disabled={loading || unavailable}
            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            <ImagePlus size={15} /> {personSrc ? "Change photo" : "Use my photo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPersonSrc(null);
              void run(null, scene);
            }}
            disabled={loading || unavailable}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <User size={15} /> On a model
          </button>
        </div>

        {/* Scene. Presets, not free text — a dim or busy backdrop hides the clothes. */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {TRYON_SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => changeScene(s.id)}
              disabled={loading || unavailable}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                scene === s.id
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {canSave && (
          <button
            type="button"
            onClick={() => void saveRender()}
            disabled={saveState !== "idle"}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent/10 py-2.5 text-sm font-medium text-foreground disabled:opacity-70"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Saving…
              </>
            ) : saveState === "saved" ? (
              <>
                <Check size={15} /> Saved to this look
              </>
            ) : (
              <>
                <ImagePlus size={15} /> {savedPath ? "Replace saved render" : "Save to this look"}
              </>
            )}
          </button>
        )}

        {started && !unavailable && (
          <button
            type="button"
            onClick={() => void run(personSrc, scene)}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={15} /> {loading ? "Working…" : "Try again"}
          </button>
        )}

        <p className="pb-2 text-center text-[11px] text-muted">
          AI try-on is experimental — the fit is an approximation, not a measurement.{" "}
          {saveState === "saved" || savedPath
            ? "Saved renders are private to your account — only you can see them. The photo you picked is never stored."
            : "Your photo is used only for this render, not stored."}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void applyPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
