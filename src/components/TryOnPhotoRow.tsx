"use client";
/**
 * AJA-276 — the try-on photo as a settings row (Apple pattern).
 *
 * The photo was previously reachable only from inside Fit & sizes, behind a text
 * row that showed the word "Added" — so the one thing the user wanted to see, the
 * photo itself, was two taps away and never visible. iOS shows your Apple ID photo
 * as a thumbnail in the row and lets you tap straight into it; that's what this is.
 *
 * ONE implementation with two entry points (Settings and the try-on screen), because
 * the ordering rules for replace and remove live in `useTryOnPhoto` and duplicating
 * the surface would eventually mean duplicating those.
 */
import { Capacitor } from "@capacitor/core";
import { ImageOff, ImagePlus, ScanFace, SwitchCamera } from "lucide-react";
import { useRef, useState } from "react";
import { captureNativePhoto, pickNativePhoto } from "@/lib/native-camera";
import { useWardrobe } from "@/lib/store";
import { Row, Sheet } from "./you/settings-ui";
import { usePrivateImageUrl } from "./useSavedRenderUrls";
import { useTryOnPhoto } from "./useTryOnPhoto";

export function TryOnPhotoRow() {
  const authUser = useWardrobe((s) => s.authUser);
  const { path, save, remove, saveError } = useTryOnPhoto();
  const [open, setOpen] = useState(false);
  // Singular variant, because it distinguishes "still signing" from "can't be
  // signed" — a screen that exists to show one photo must not shimmer forever.
  const { url, failed } = usePrivateImageUrl(path);

  return (
    <>
      <Row
        icon={ScanFace}
        label="Try-on photo"
        // The thumbnail IS the value once there is one — no point writing "Added"
        // next to a picture of yourself.
        value={!authUser ? "Sign in to save" : path ? undefined : "Add"}
        right={path ? <Thumb url={url} failed={failed} /> : undefined}
        onClick={() => setOpen(true)}
        chevron
      />
      <Sheet open={open} title="Try-on photo" onClose={() => setOpen(false)}>
        {/* Gated on `open` so state re-seeds per opening, matching FitSizesPage's
            InputSheet — otherwise a dismissed confirm would still be armed. */}
        {open && (
          <PhotoSheet
            path={path}
            url={url}
            failed={failed}
            signedIn={!!authUser}
            saveError={saveError}
            onPick={save}
            onRemove={remove}
          />
        )}
      </Sheet>
    </>
  );
}

/** 40px so it sits inside the row's rhythm without stretching it. */
function Thumb({ url, failed }: { url?: string; failed: boolean }) {
  if (failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-muted/70">
        <ImageOff size={16} />
      </span>
    );
  }
  if (!url) {
    // Skeleton, not a spinner or text: identical footprint to the image, so the row
    // doesn't reflow when it resolves. motion-reduce kills the pulse.
    return (
      <span className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-surface-2 motion-reduce:animate-none" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Your try-on photo"
      className="h-10 w-10 shrink-0 rounded-[10px] border border-line object-cover"
    />
  );
}

function PhotoSheet({
  path,
  url,
  failed,
  signedIn,
  saveError,
  onPick,
  onRemove,
}: {
  path: string | undefined;
  url: string | undefined;
  failed: boolean;
  signedIn: boolean;
  saveError: string | null;
  onPick: (file: File) => Promise<{ src: string; saved: boolean }>;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const native = Capacitor.isNativePlatform();

  const apply = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      await onPick(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that photo.");
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    if (!native) {
      fileRef.current?.click();
      return;
    }
    try {
      const file = await pickNativePhoto();
      if (file) await apply(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open the photo library.");
    }
  };

  const selfie = async () => {
    try {
      const file = await captureNativePhoto("front");
      if (file) await apply(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  };

  return (
    <div className="pt-1">
      {/* Preview frame is 3:4 and centred, not full-width: we ask for a full-length
          photo, so a portrait frame fills edge to edge instead of sitting in grey
          letterbox bars that read as a bug. object-contain keeps an odd aspect visible
          as letterboxing rather than silently cropping someone's head off. */}
      <div className="mx-auto mb-3 flex h-64 w-48 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-2">
        {path && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Your try-on photo" className="h-full w-full object-contain" />
        ) : path && failed ? (
          // Never auto-clear the path on a failure — a network blip must not delete a
          // working photo. Say what happened and leave Replace/Remove reachable, which
          // is the only way out of a pointer whose file is genuinely gone.
          <div className="px-6 text-center text-muted">
            <ImageOff size={24} className="mx-auto" />
            <p className="mt-2 text-sm">That photo couldn&rsquo;t be loaded.</p>
            <p className="mt-0.5 text-[12px]">
              {signedIn ? "Replace it, or remove it below." : "Sign in, or replace it."}
            </p>
          </div>
        ) : path ? (
          <div className="h-full w-full animate-pulse bg-surface-2 motion-reduce:animate-none" />
        ) : (
          <div className="px-6 text-center text-muted">
            <ScanFace size={26} className="mx-auto" />
            <p className="mt-2 text-sm">No photo yet</p>
            <p className="mt-0.5 text-[12px]">Add one and try-on stops asking.</p>
          </div>
        )}
      </div>

      {!signedIn && (
        <p className="mb-3 text-sm text-muted">
          Sign in to keep a photo. Until then try-on asks for one each time and it
          isn&rsquo;t stored.
        </p>
      )}
      {(err ?? saveError) && <p className="mb-3 text-sm text-red-500">{err ?? saveError}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void choose()}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <ImagePlus size={16} /> {busy ? "Saving…" : path ? "Replace" : "Choose photo"}
        </button>
        {native && (
          <button
            type="button"
            onClick={() => void selfie()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-3 text-sm font-medium transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            <SwitchCamera size={16} /> Take a selfie
          </button>
        )}
      </div>

      {/* Honest, non-blocking: a selfie is allowed, it just gives the model no body
          to work from. `personImage` is the body reference. */}
      <p className="mt-2 text-center text-[11px] text-muted">
        Full length works best — a selfie works, but the fit will be more of a guess.
      </p>

      {path &&
        (confirm ? (
          <div className="animate-fade-up mt-3 rounded-2xl border border-red-200 p-4 text-center">
            <p className="text-sm font-medium">Remove your try-on photo?</p>
            <p className="mt-1 text-xs text-muted">
              The file is deleted. Try-on will ask for a photo next time.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl border border-line py-2.5 text-sm transition-transform active:scale-[0.97]"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirm(false);
                  onRemove();
                }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white transition-transform active:scale-[0.97]"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-medium text-red-600 transition-colors active:bg-red-500/10"
          >
            Remove photo
          </button>
        ))}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void apply(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
