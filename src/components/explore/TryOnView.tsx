"use client";

import { ChevronLeft, ImagePlus, Loader2, RefreshCw, ScanFace, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { tryOnOutfit, type TryOnGarment } from "@/lib/tryon";

/**
 * "See it on you" (AJA-158, Phase 3). Renders the given outfit on the user's
 * body via /api/tryon. Opens rendering on a generic model immediately; the user
 * can add a photo of themselves to keep their own identity. The photo is used
 * for the request only — not stored. Experimental (AI try-on), labeled as such.
 */
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read-failed"));
    r.readAsDataURL(file);
  });

export function TryOnView({
  garments,
  onClose,
}: {
  garments: TryOnGarment[];
  onClose: () => void;
}) {
  const [personSrc, setPersonSrc] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (person: string | null) => {
      if (!garments.length) {
        setError("This look has no items to try on.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setResult(await tryOnOutfit(garments, person));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Try-on failed. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [garments],
  );

  // Kick off on a model as soon as the page opens.
  useEffect(() => {
    void run(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const src = await fileToDataUrl(file);
      setPersonSrc(src);
      void run(src);
    } catch {
      setError("Couldn't read that photo.");
    }
  };

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
        {/* Result canvas */}
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-line bg-surface-2">
          {result && !loading && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result} alt="Try-on result" className="h-full w-full object-cover" />
          )}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
              <Loader2 size={26} className="animate-spin text-accent" />
              <p className="text-sm">Styling this on {personSrc ? "you" : "a model"}…</p>
              <p className="text-[11px]">Takes a few seconds</p>
            </div>
          )}
          {!loading && !result && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted">
              <ScanFace size={26} />
              <p className="text-sm">{error}</p>
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

        {/* Controls */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <ImagePlus size={15} /> {personSrc ? "Change photo" : "Use my photo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPersonSrc(null);
              void run(null);
            }}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <User size={15} /> On a model
          </button>
        </div>
        <button
          type="button"
          onClick={() => void run(personSrc)}
          disabled={loading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          <RefreshCw size={15} /> {loading ? "Working…" : "Try again"}
        </button>

        <p className="pb-2 text-center text-[11px] text-muted">
          AI try-on is experimental — it keeps your face but the fit is an approximation. Your photo
          is used only for this render, not stored.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onPickPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
