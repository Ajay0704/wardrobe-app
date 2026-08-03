"use client";

import { useState } from "react";
import { useWardrobe } from "@/lib/store";
import {
  deletePrivateImage,
  isOwnPrivatePath,
  uploadPrivateImage,
} from "@/lib/supabase/private-storage";
import { dataUrlToFile, toCompressedDataUrl } from "@/lib/supabase/storage";

/**
 * AJA-276 — the saved try-on reference photo, write side.
 *
 * Two screens can set or clear this photo (the try-on screen and Fit & sizes), and
 * the part that is easy to get wrong is the ORDERING, so it lives here once:
 * upload the new blob, repoint the profile, and only then delete the old blob.
 * Pointer first means a failed delete leaves an orphan (swept by account deletion)
 * rather than a profile pointing at an image the user asked to be rid of.
 *
 * Reading is deliberately NOT shared. The two readers want different things — the
 * try-on screen needs the bytes (it posts them to the render route), Fit & sizes
 * needs a signed URL for a three-second `<img>` — and each is about four lines.
 */
export function useTryOnPhoto() {
  const authUser = useWardrobe((s) => s.authUser);
  const setTryOnPhoto = useWardrobe((s) => s.setTryOnPhoto);
  const stored = useWardrobe((s) => s.profile.tryOnPhotoPath);
  const [saveError, setSaveError] = useState<string | null>(null);

  // FILTER, don't clear. `AuthProvider` seeds a new account from whatever profile
  // is in local state, so signing in as B on A's device inherits A's path — which
  // RLS makes unsignable. Clearing it would need a setState in an effect body (the
  // repo's react-hooks/set-state-in-effect rule) and would throw away a working
  // pointer on a transient failure. An unused 45-char string is harmless, and the
  // next save overwrites it.
  const path =
    stored && authUser && isOwnPrivatePath(stored, authUser.id) ? stored : undefined;

  /**
   * Compress, upload, repoint, drop the old blob.
   *
   * Resolves with the compressed data URL even when the upload fails: the user
   * asked for a render, and a storage outage must not block it. `saved` says
   * whether it will still be there next time, which is what the copy keys off.
   *
   * Returns the new `path` too. Callers need it to stamp their own
   * already-have-these-bytes guard — reading `path` from this hook right after
   * calling `save` gives the STALE value, because the store write hasn't
   * re-rendered yet. That mistake cost a duplicate download and a duplicate paid
   * render (AJA-276).
   *
   * Throws only when the FILE can't be read (an undecodable HEIC), because there
   * is nothing to render in that case.
   */
  const save = async (
    file: File,
  ): Promise<{ src: string; saved: boolean; path?: string }> => {
    setSaveError(null);
    // Bare call — the defaults are 1600/0.9, deliberately above compressImage's
    // 1200/0.82, because facial detail is the whole point of the reference photo.
    const src = await toCompressedDataUrl(file);
    if (!authUser) return { src, saved: false };
    try {
      const next = await uploadPrivateImage(dataUrlToFile(src, "tryon-photo"), authUser.id);
      const previous = path;
      setTryOnPhoto(next);
      if (previous && previous !== next) void deletePrivateImage(previous);
      return { src, saved: true, path: next };
    } catch (e) {
      // Leave the existing pointer and blob alone — a failed replace must not cost
      // the user the photo they already had.
      setSaveError(
        e instanceof Error
          ? `Couldn't save this photo for next time — ${e.message}`
          : "Couldn't save this photo for next time.",
      );
      return { src, saved: false };
    }
  };

  const remove = () => {
    const previous = path;
    setSaveError(null);
    setTryOnPhoto(null);
    if (previous) void deletePrivateImage(previous);
  };

  return { path, save, remove, saveError };
}
