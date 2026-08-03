"use client";

import { Capacitor } from "@capacitor/core";
import { Check, ChevronLeft, ImagePlus, Loader2, RefreshCw, ScanFace, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { captureNativePhoto, pickNativePhoto } from "@/lib/native-camera";
import { useWardrobe } from "@/lib/store";
import {
  deletePrivateImage,
  privateImageDataUrl,
  signedPrivateUrl,
  uploadPrivateImage,
} from "@/lib/supabase/private-storage";
import { dataUrlToFile } from "@/lib/supabase/storage";
import { tryOnOutfit, TRYON_SCENES, type TryOnGarment, type TryOnScene } from "@/lib/tryon";
import { useTryOnPhoto } from "../useTryOnPhoto";

/**
 * "See it on you" (AJA-158 Phase 3; accuracy pass AJA-274; render saving AJA-275;
 * saved reference photo AJA-276).
 *
 * AJA-274 removed the render-on-mount: the screen used to spend a paid generation
 * on a stock model before you touched anything, so the first thing you saw on a
 * screen called "See it on you" was a stranger — and picking your own photo meant
 * paying twice for one answer.
 *
 * AJA-276 brings an auto-render back, but only under the conditions that made the
 * old one wrong. It fires ONLY when we already hold the user's own photo, and NOT
 * when the look already has a saved render — paying to reproduce something already
 * stored is waste, so that render is shown instead and "Try again" is right there.
 * It never renders a stranger unprompted.
 *
 * The reference photo IS now stored — same private bucket as the renders, as a PATH
 * on the profile (see private-storage.ts). The disclaimer composes from the real
 * state rather than asserting one blanket promise, because "your photo is never
 * stored" stopped being true.
 */
export function TryOnView({
  garments,
  outfitId,
  onClose,
}: {
  garments: TryOnGarment[];
  /** Saved look to attach the render to. Absent for unsaved suggestions (Explore's
   *  hero look is a raw item list), in which case render saving isn't offered — the
   *  reference photo still works there, because it lives on the profile. */
  outfitId?: string;
  onClose: () => void;
}) {
  const authUser = useWardrobe((s) => s.authUser);
  const setOutfitRender = useWardrobe((s) => s.setOutfitRender);
  const savedPath = useWardrobe((s) =>
    outfitId ? s.outfits.find((o) => o.id === outfitId)?.tryOnRenderPath : undefined,
  );
  const { path: photoPath, save, remove, saveError } = useTryOnPhoto();

  /** Photo chosen in THIS session. */
  const [picked, setPicked] = useState<string | null>(null);
  /** The saved reference photo, decoded to bytes we can post. */
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [savedPhotoFailed, setSavedPhotoFailed] = useState(false);
  /** Explicitly asked for a generic model. Kept separate from the photo so switching
   *  back doesn't destroy it — it used to force a re-pick. */
  const [onModel, setOnModel] = useState(false);
  const [scene, setScene] = useState<TryOnScene>("street");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  /** 501 = provider not configured; a retry can never succeed, so stop offering one. */
  const [unavailable, setUnavailable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const havePhoto = !!(picked ?? savedPhoto);
  const person = onModel ? null : (picked ?? savedPhoto);
  // Derived, not stored — storing it would need a setState in an effect body.
  const loadingPhoto = !!photoPath && !havePhoto && !savedPhotoFailed;

  const run = useCallback(
    async (subject: string | null, withScene: TryOnScene) => {
      if (!garments.length) {
        setError("This look has no items to try on.");
        return;
      }
      setLoading(true);
      setError(null);
      // A new render is not the saved one — re-arm the button.
      setSaveState("idle");
      try {
        setResult(await tryOnOutfit({ garments, personImage: subject, scene: withScene }));
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

  // Show the look's existing render rather than paying to make another. Signing is
  // correct here (display only, bytes never re-posted), and `saveState: "saved"`
  // keeps the button honest — it IS already saved.
  const seededRender = useRef(false);
  useEffect(() => {
    if (!savedPath || seededRender.current) return;
    seededRender.current = true;
    let alive = true;
    void signedPrivateUrl(savedPath).then((url) => {
      if (!alive || !url) return;
      setResult(url);
      setSaveState("saved");
    });
    return () => {
      alive = false;
    };
  }, [savedPath]);

  // Decode the saved reference photo, then auto-render on it. Every setState sits in
  // a promise callback, never the effect body — the repo's
  // react-hooks/set-state-in-effect rule is a static check on the body.
  const loadedPath = useRef<string | null>(null);
  useEffect(() => {
    if (!photoPath || loadedPath.current === photoPath) return;
    loadedPath.current = photoPath;
    // `savedPath` is a synchronous store read, so there is no race with the effect
    // above: we already know whether a saved render will be shown.
    const shouldRender = !savedPath;
    let alive = true;
    void privateImageDataUrl(photoPath).then(
      (src) => {
        if (!alive) return;
        setSavedPhoto(src);
        if (shouldRender) void run(src, scene);
      },
      () => {
        if (alive) setSavedPhotoFailed(true);
      },
    );
    return () => {
      alive = false;
    };
    // Read once at open. Adding `scene`/`run` would re-download the photo and fire a
    // second paid render every time the user changed scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoPath]);

  const applyPhoto = async (file?: File) => {
    if (!file) return;
    try {
      // Compresses, HEIC-decodes, uploads, repoints the profile. Resolves with the
      // bytes even if the upload failed, so a storage outage still renders.
      const { src } = await save(file);
      // We already hold the bytes — stop the load effect re-downloading them.
      loadedPath.current = photoPath ?? null;
      setPicked(src);
      setSavedPhotoFailed(false);
      setOnModel(false);
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

  const takeSelfie = async () => {
    try {
      const file = await captureNativePhoto("front");
      if (file) void applyPhoto(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  };

  const forgetPhoto = () => {
    remove();
    setPicked(null);
    setSavedPhoto(null);
    setSavedPhotoFailed(false);
    loadedPath.current = null;
  };

  const changeScene = (next: TryOnScene) => {
    setScene(next);
    if (result || loading) void run(person, next);
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
      const path = await uploadPrivateImage(blob, authUser.id);
      const previous = savedPath;
      setOutfitRender(outfitId, path);
      // Replacing: drop the old blob, or it lingers unreferenced until the account
      // is deleted. Best-effort — the look already points at the new render.
      if (previous && previous !== path) void deletePrivateImage(previous);
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
              <p className="text-sm">Styling this on {person ? "you" : "a model"}…</p>
              <p className="text-[11px]">Takes a few seconds</p>
            </div>
          )}
          {!loading && !result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted">
              {loadingPhoto ? (
                <>
                  <Loader2 size={26} className="animate-spin text-accent" />
                  <p className="text-sm">Getting your photo…</p>
                </>
              ) : (
                <>
                  <ScanFace size={26} />
                  {error ? (
                    <p className="text-sm">{error}</p>
                  ) : savedPhotoFailed ? (
                    <p className="text-sm">
                      {authUser
                        ? "Couldn't load your saved photo — pick one for this render."
                        : "Sign in to use your saved photo, or pick one for this render."}
                    </p>
                  ) : havePhoto ? (
                    <p className="text-sm text-foreground">Ready when you are</p>
                  ) : (
                    <>
                      <p className="text-sm text-foreground">See this look on your body</p>
                      <p className="text-[12px]">
                        Add a photo of yourself — full length works best. It&rsquo;s saved,
                        so you only do this once.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {error && result && <p className="text-center text-xs text-red-500">{error}</p>}
        {saveError && <p className="text-center text-xs text-amber-600">{saveError}</p>}

        {/* Garment strip */}
        <div className="flex justify-center gap-2">
          {garments.slice(0, 5).map((g, i) => (
            <div key={i} className="h-12 w-10 overflow-hidden rounded-lg border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.image} alt={g.label ?? "item"} className="h-full w-full object-contain" />
            </div>
          ))}
        </div>

        {/* Subject. Two buttons only — this row measured 343/343 and the scene chips
            below already overflowed once, so extra verbs go in the text row. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (havePhoto ? void run(picked ?? savedPhoto, scene) : void pickPhoto())}
            disabled={loading || unavailable || loadingPhoto}
            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {havePhoto ? <ScanFace size={15} /> : <ImagePlus size={15} />}{" "}
            {loadingPhoto ? "Loading photo…" : havePhoto ? "See it on me" : "Use my photo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOnModel(true);
              void run(null, scene);
            }}
            disabled={loading || unavailable}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <User size={15} /> On a model
          </button>
        </div>

        {/* Photo actions as text, so the button row keeps its measured width. */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted">
          <button
            type="button"
            onClick={() => void pickPhoto()}
            disabled={loading}
            className="active:scale-95 disabled:opacity-50"
          >
            {havePhoto ? "Change photo" : "Choose photo"}
          </button>
          {Capacitor.isNativePlatform() && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => void takeSelfie()}
                disabled={loading}
                className="active:scale-95 disabled:opacity-50"
              >
                Take a selfie
              </button>
            </>
          )}
          {photoPath && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={forgetPhoto}
                disabled={loading}
                className="active:scale-95 disabled:opacity-50"
              >
                Forget photo
              </button>
            </>
          )}
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
            onClick={() => void run(person, scene)}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={15} /> {loading ? "Working…" : "Try again"}
          </button>
        )}

        {/* Composed from the real state. No single sentence is true across all of
            them: the photo may be stored, held for one render, or absent. */}
        <p className="pb-2 text-center text-[11px] text-muted">
          AI try-on is experimental — the fit is an approximation, not a measurement.{" "}
          {photoPath
            ? "Your photo is saved privately to your account so try-on stops asking for it — only you can see it, and Forget photo deletes it. "
            : havePhoto
              ? "Your photo is used only for this render, not stored. "
              : ""}
          {saveState === "saved" || savedPath
            ? "Saved renders are private to your account — only you can see them."
            : ""}
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
