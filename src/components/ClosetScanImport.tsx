"use client";

import { Capacitor } from "@capacitor/core";
import { Camera, Images, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { enqueueImport } from "@/lib/import-queue";
import {
  canPickMultiplePhotos,
  captureNativePhoto,
  pickNativePhoto,
  pickNativePhotos,
} from "@/lib/native-camera";
import { useWardrobe } from "@/lib/store";
import { Button, Modal } from "./ui";

/**
 * Photo add launcher (AJA-234/235/236/237). Opens the camera or photo library, hands the picked
 * photos to the BACKGROUND import queue, then keeps the user informed instead of vanishing:
 * it stays open showing "Pulling out your items…" while extraction runs, and when the garments
 * are ready it hands off to the review sheet ("choose what to add"). A "Continue in background"
 * escape hatch closes the modal and lets the ImportProgress pill take over.
 *   - `library` — pick several at once (native multi-select / web <input multiple>).
 *   - `camera`  — snap one; it starts processing immediately, then Take another / Done.
 */
export function ClosetScanImport({
  source,
  onClose,
}: {
  source?: "camera" | "library";
  onClose: () => void;
}) {
  const importStatus = useWardrobe((s) => s.importStatus);
  const setImportReviewOpen = useWardrobe((s) => s.setImportReviewOpen);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0); // camera: photos snapped this session
  const [working, setWorking] = useState(false); // true once we've handed photos to the queue
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const handedOff = useRef(false);
  const isCamera = source === "camera";
  const native = Capacitor.isNativePlatform();
  const multiPick = canPickMultiplePhotos();
  const libraryMultiple = !native || multiPick;

  // Pick from the library, hand to the background queue, and stay open to show progress.
  const startLibrary = async () => {
    if (!native) {
      fileRef.current?.click(); // web: real browsers honour <input multiple>
      return;
    }
    try {
      const files = multiPick
        ? await pickNativePhotos(10)
        : await pickNativePhoto().then((f) => (f ? [f] : []));
      if (files.length) {
        void enqueueImport(files);
        setWorking(true);
      } else {
        onClose(); // cancelled the picker
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the photo library.");
    }
  };

  // Snap one photo; it starts processing immediately so the user can keep shooting.
  const snap = async () => {
    try {
      const file = await captureNativePhoto();
      if (file) {
        void enqueueImport([file]);
        setAdded((n) => n + 1);
      } else if (added === 0) {
        onClose(); // cancelled the very first shot
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  };

  // Auto-open the chosen source once (native plugin calls are deferred; web click stays direct).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (isCamera || native) {
      const id = setTimeout(() => void (isCamera ? snap() : startLibrary()), 0);
      return () => clearTimeout(id);
    }
    fileRef.current?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const onWebFiles = (files: File[]) => {
    if (files.length) {
      void enqueueImport(files);
      setWorking(true);
    } else {
      onClose();
    }
  };

  // Once extraction finishes, hand off to the review sheet (or surface "nothing found").
  useEffect(() => {
    if (!working || handedOff.current) return;
    if (!importStatus || importStatus.running || importStatus.phase !== "extract") return;
    handedOff.current = true;
    const t = setTimeout(() => {
      if (useWardrobe.getState().pendingImports.length > 0) {
        setImportReviewOpen(true);
        onClose();
      } else {
        setError("Couldn't find any items in those photos. Try clearer, full-item shots.");
        setWorking(false);
        handedOff.current = false;
      }
    }, 0);
    return () => clearTimeout(t);
  }, [working, importStatus, setImportReviewOpen, onClose]);

  const progress =
    importStatus && importStatus.phase === "extract" && importStatus.total > 0
      ? `${Math.min(importStatus.done + 1, importStatus.total)} of ${importStatus.total}`
      : null;

  return (
    <Modal
      title={isCamera ? "Take photos" : "Add photos"}
      onClose={onClose}
      dismissOnBackdrop={false}
    >
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-6 py-12 text-center">
        {working ? (
          <>
            <Loader2 size={30} className="animate-spin text-accent" />
            <div>
              <p className="font-medium">Pulling out your items…</p>
              <p className="mt-1 text-sm text-muted">
                {progress ? `Scanning ${progress} photos` : "Getting your photos ready"} — you&apos;ll
                choose what to add next.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-muted underline underline-offset-2"
            >
              Continue in background
            </button>
          </>
        ) : isCamera && added > 0 ? (
          <>
            <div>
              <p className="font-medium">
                {added} photo{added === 1 ? "" : "s"} taken
              </p>
              <p className="mt-1 text-sm text-muted">
                Keep shooting, or finish and choose what to add.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" onClick={() => void snap()}>
                <span className="inline-flex items-center gap-1.5">
                  <Camera size={15} /> Take another
                </span>
              </Button>
              <Button onClick={() => setWorking(true)}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="font-medium">
                {isCamera ? "Snap each piece" : "Add from your library"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {isCamera
                  ? "Take a photo of each item — you'll choose what to add after."
                  : libraryMultiple
                    ? "Pick several photos — I'll pull out each item, then you choose what to add."
                    : "Add a photo — I'll pull out the item, then you choose whether to add it."}
              </p>
            </div>
            <button
              type="button"
              onClick={isCamera ? () => void snap() : () => void startLibrary()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              {isCamera ? (
                <>
                  <Camera size={15} /> Take photo
                </>
              ) : (
                <>
                  <Images size={15} /> {libraryMultiple ? "Choose photos" : "Choose photo"}
                </>
              )}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onWebFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
    </Modal>
  );
}
