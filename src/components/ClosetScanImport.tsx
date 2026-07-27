"use client";

import { Capacitor } from "@capacitor/core";
import { Camera, Images } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { enqueueImport } from "@/lib/import-queue";
import {
  canPickMultiplePhotos,
  captureNativePhoto,
  pickNativePhoto,
  pickNativePhotos,
} from "@/lib/native-camera";
import { Button, Modal } from "./ui";

/**
 * Photo add launcher (AJA-234/235/236). Opens the camera or photo library, then hands the
 * picked photos to the BACKGROUND import queue (src/lib/import-queue.ts) and closes — the user
 * never waits on this screen. Detection / cutout / upload happen in the background and items
 * pop into the closet as each finishes (progress via the global ImportProgress pill).
 *   - `library` — pick several at once (native multi-select / web <input multiple>), enqueue, close.
 *   - `camera`  — snap one; it starts processing immediately, then Take another / Done.
 * The single-photo split + beautify flow still lives in OutfitSplitImport ("add whole outfit").
 */
export function ClosetScanImport({
  source,
  onClose,
}: {
  source?: "camera" | "library";
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0); // camera: photos snapped this session
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const isCamera = source === "camera";
  const native = Capacitor.isNativePlatform();
  const multiPick = canPickMultiplePhotos();
  const libraryMultiple = !native || multiPick;

  // Pick from the library (native picker or web input), enqueue to the background queue, close.
  const startLibrary = async () => {
    if (!native) {
      fileRef.current?.click(); // web: real browsers honour <input multiple>
      return;
    }
    try {
      const files = multiPick
        ? await pickNativePhotos(10)
        : await pickNativePhoto().then((f) => (f ? [f] : []));
      if (files.length) void enqueueImport(files);
      onClose(); // close whether they picked or cancelled — processing runs in the background
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
        onClose(); // cancelled the very first shot → nothing to do
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  };

  // Auto-open the chosen source once. Native plugin calls are deferred (no DOM gesture needed,
  // and to keep setState out of the effect body); the web input click stays direct (gesture).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (isCamera) {
      const id = setTimeout(() => void snap(), 0);
      return () => clearTimeout(id);
    }
    if (native) {
      const id = setTimeout(() => void startLibrary(), 0);
      return () => clearTimeout(id);
    }
    fileRef.current?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const onWebFiles = (files: File[]) => {
    if (files.length) void enqueueImport(files);
    onClose();
  };

  return (
    <Modal
      title={isCamera ? "Take photos" : "Add photos"}
      onClose={onClose}
      dismissOnBackdrop={false}
    >
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-6 py-12 text-center">
        {isCamera && added > 0 ? (
          <>
            <div>
              <p className="font-medium">
                {added} photo{added === 1 ? "" : "s"} added
              </p>
              <p className="mt-1 text-sm text-muted">
                They&apos;re processing in the background — keep shooting, or head back to your
                closet and they&apos;ll appear as they&apos;re ready.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" onClick={() => void snap()}>
                <span className="inline-flex items-center gap-1.5">
                  <Camera size={15} /> Take another
                </span>
              </Button>
              <Button onClick={onClose}>Done</Button>
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
                  ? "Take a photo of each item — they'll be added in the background."
                  : libraryMultiple
                    ? "Pick several photos — they'll be added in the background as each is ready."
                    : "Add a photo — it'll be processed in the background."}
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
