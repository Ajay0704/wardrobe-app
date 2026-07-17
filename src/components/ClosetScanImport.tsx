"use client";

import { Check, Images, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { detectGarments } from "@/lib/detect-garments";
import { useWardrobe } from "@/lib/store";
import type { Category, Season } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { Button, Modal, inputClass } from "./ui";

interface ScanRow {
  id: string;
  imageUrl: string;
  include: boolean;
  name: string;
  category: Category;
  color: string;
  colorName?: string;
  tags: string[];
  seasons: Season[];
  brand?: string;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read-failed"));
    r.readAsDataURL(file);
  });

const MAX_PHOTOS = 12;

/**
 * Camera-roll auto-onboarding (AJA-162) — "closet builds itself". Pick several
 * photos; each is run through the whole-outfit detector (detectGarments) and the
 * garments are aggregated into one review list to bulk-add. This is the
 * buildable-now core; the on-device selfie-filter + dedup model is deferred.
 */
export function ClosetScanImport({ onClose }: { onClose: () => void }) {
  const { addItem, authUser } = useWardrobe();
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const patch = (id: string, p: Partial<ScanRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, MAX_PHOTOS);
    setScanning(true);
    setError("");
    const collected: ScanRow[] = [];
    let i = 0;
    for (const file of list) {
      i++;
      setProgress(`Scanning photo ${i} of ${list.length}…`);
      try {
        const dataUrl = await fileToDataUrl(file);
        const detected = await detectGarments(dataUrl, authUser?.id ?? null);
        detected.forEach((g, idx) =>
          collected.push({
            id: `${Date.now()}-${i}-${idx}`,
            imageUrl: g.url,
            include: true,
            name: g.name || CATEGORY_LABEL[g.category],
            category: g.category,
            color: g.color,
            colorName: g.colorName,
            tags: g.tags,
            seasons: g.seasons,
          }),
        );
      } catch {
        /* skip a photo that couldn't be processed */
      }
    }
    setRows(collected);
    setScanning(false);
    setProgress(null);
    if (!collected.length) {
      setError("Couldn't find garments in those photos. Try clearer, full-item shots.");
    }
  };

  const pick = () => fileRef.current?.click();

  // Auto-open the picker once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    pick();
  }, []);

  const included = rows.filter((r) => r.include);

  const addAll = () => {
    if (busy) return;
    setBusy(true);
    for (const r of included) {
      addItem({
        name: r.name.trim() || CATEGORY_LABEL[r.category],
        imageUrl: r.imageUrl,
        category: r.category,
        color: r.color,
        colorName: r.colorName,
        tags: r.tags,
        seasons: r.seasons,
        brand: r.brand,
        wishlist: false,
      });
    }
    setBusy(false);
    onClose();
  };

  return (
    <Modal title="Scan your photos" onClose={onClose} wide dismissOnBackdrop={false}>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          {scanning ? (
            <>
              <Loader2 size={30} className="animate-spin text-accent" />
              <p className="font-medium">{progress ?? "Scanning your photos…"}</p>
              <p className="text-sm text-muted">Finding every garment across your photos.</p>
            </>
          ) : (
            <>
              <div>
                <p className="font-medium">Build your closet from photos</p>
                <p className="mt-1 text-sm text-muted">
                  Pick a few photos and I&apos;ll detect the clothes and add each piece.
                </p>
              </div>
              <button
                type="button"
                onClick={pick}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                <Images size={15} /> Choose photos
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
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Found {rows.length} piece{rows.length === 1 ? "" : "s"} — {included.length} to add
          </p>
          <div className="grid max-h-[52vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`flex gap-3 rounded-2xl border p-2.5 transition-opacity ${
                  r.include ? "border-line" : "border-line/60 opacity-50"
                }`}
              >
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.imageUrl} alt={r.name} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    className={`${inputClass} !py-1.5 text-sm`}
                    value={r.name}
                    onChange={(e) => patch(r.id, { name: e.target.value })}
                  />
                  <select
                    className={`${inputClass} !py-1.5 text-sm`}
                    value={r.category}
                    onChange={(e) => patch(r.id, { category: e.target.value as Category })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  aria-label={r.include ? "Exclude" : "Include"}
                  onClick={() => patch(r.id, { include: !r.include })}
                  className={`h-6 w-6 shrink-0 self-start rounded-full border transition-colors ${
                    r.include
                      ? "border-accent bg-accent text-white"
                      : "border-line text-transparent hover:border-accent/60"
                  }`}
                >
                  {r.include ? (
                    <Check size={14} className="mx-auto" />
                  ) : (
                    <X size={14} className="mx-auto text-muted" />
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={addAll} disabled={busy || included.length === 0}>
              Add {included.length || ""} to closet
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
