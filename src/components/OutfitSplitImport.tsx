"use client";

import { Camera, Check, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { beautify } from "@/lib/beautify";
import { cutoutMulti } from "@/lib/cutout";
import { detectGarments } from "@/lib/detect-garments";
import { captureNativePhoto } from "@/lib/native-camera";
import { useWardrobe } from "@/lib/store";
import { authHeaders } from "@/lib/supabase/client";
import type { Category, Season } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { Button, Modal, inputClass } from "./ui";

type SplitSource = "camera" | "library";

interface SplitRow {
  id: string;
  imageUrl: string; // re-hosted garment cutout (transparent PNG)
  status: "analyzing" | "ready";
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
    r.onerror = () => reject(r.error ?? new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });

/**
 * "Add whole outfit": take or pick ONE photo, detect every garment in it (top,
 * bottom, shoes, accessories) via the Gemini detector, review each as its own item,
 * then add them all. Falls back to SegFormer (cutoutMulti) then a single cutout if
 * detection is unavailable. Single-item add is unaffected.
 */
export function OutfitSplitImport({
  source,
  onClose,
}: {
  source?: SplitSource;
  onClose: () => void;
}) {
  const { addItem, authUser, openAdd } = useWardrobe();
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const patch = (id: string, p: Partial<SplitRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // Fallback tagger for the SegFormer path (Gemini detection already fills attributes).
  const analyzeRow = async (row: SplitRow) => {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ image: row.imageUrl }),
      });
      const data = await res.json();
      patch(row.id, {
        status: "ready",
        ...(res.ok
          ? {
              color: data.color ?? row.color,
              colorName: data.colorName ?? row.colorName,
              brand: data.brand?.trim() || undefined,
              tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
              seasons: Array.isArray(data.seasons) ? (data.seasons as Season[]) : [],
              name: data.name?.trim() ? (data.name as string) : row.name,
            }
          : {}),
      });
    } catch {
      patch(row.id, { status: "ready" });
    }
  };

  const onImage = async (dataUrl: string) => {
    setError("");
    setSplitting(true);
    try {
      // Primary: Gemini detector — every garment, boxed + attributed.
      const detected = await detectGarments(dataUrl, authUser?.id ?? null);
      if (detected.length) {
        setRows(
          detected.map((g, idx) => ({
            id: `${Date.now()}-${idx}`,
            imageUrl: g.url,
            status: "ready",
            include: true,
            name: g.name || CATEGORY_LABEL[g.category],
            category: g.category,
            color: g.color,
            colorName: g.colorName,
            tags: g.tags,
            seasons: g.seasons,
          })),
        );
        setSplitting(false);
        return;
      }

      // Fallback: SegFormer split, then tag each cutout.
      const cuts = await cutoutMulti(dataUrl, authUser?.id ?? null);
      if (!cuts.length) {
        setError("Couldn't find any garments. Try a clearer, full-length photo.");
        setSplitting(false);
        return;
      }
      const newRows: SplitRow[] = cuts.map((c, idx) => ({
        id: `${Date.now()}-${idx}`,
        imageUrl: c.url,
        status: "analyzing",
        include: true,
        name: CATEGORY_LABEL[c.category as Category] ?? "Item",
        category: (c.category as Category) ?? "top",
        color: "#a8a29e",
        tags: [],
        seasons: [],
      }));
      setRows(newRows);
      setSplitting(false);
      setBusy(true);
      let i = 0;
      const worker = async () => {
        while (i < newRows.length) await analyzeRow(newRows[i++]);
      };
      await Promise.all([worker(), worker()]);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that photo.");
      setSplitting(false);
    }
  };

  const pickLibrary = () => fileRef.current?.click();

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      onImage(await fileToDataUrl(file));
    } catch {
      setError("Couldn't read that photo.");
    }
  };

  const takePhoto = async () => {
    try {
      const file = await captureNativePhoto();
      if (file) onImage(await fileToDataUrl(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  };

  // Auto-trigger the chosen source once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (source === "camera") void takePhoto();
    else if (source === "library") pickLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const included = rows.filter((r) => r.include && r.status !== "analyzing");
  const analyzing = rows.some((r) => r.status === "analyzing");

  // Garments become clean product shots; accessories/bags stay as plain cutouts
  // (beautify would hallucinate a garment out of a belt).
  const BEAUTIFY_CATS = new Set<Category>(["top", "bottom", "dress", "outerwear", "shoes"]);

  const addAll = async () => {
    if (busy) return;
    setBusy(true);
    const items = [...included];
    try {
      let i = 0;
      for (const r of items) {
        i++;
        let imageUrl = r.imageUrl;
        let beautifiedImageUrl: string | undefined;
        let beautifyWhiteUrl: string | undefined;
        let beautifyModel: string | undefined;
        if (BEAUTIFY_CATS.has(r.category)) {
          setProgress(`Creating product shots… ${i}/${items.length}`);
          try {
            const res = await beautify(r.imageUrl, authUser?.id ?? null, r.category);
            imageUrl = res.url;
            beautifiedImageUrl = res.url;
            beautifyWhiteUrl = res.whiteUrl;
            beautifyModel = res.model;
          } catch {
            /* beautify failed (or key missing) — keep the plain cutout */
          }
        }
        addItem({
          name: r.name.trim() || CATEGORY_LABEL[r.category],
          imageUrl,
          beautifiedImageUrl,
          beautifyWhiteUrl,
          beautifyModel,
          category: r.category,
          color: r.color,
          colorName: r.colorName,
          tags: r.tags,
          seasons: r.seasons,
          brand: r.brand,
          wishlist: false,
        });
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
    onClose();
  };

  const addByLink = () => {
    openAdd("link");
    onClose();
  };

  return (
    <Modal title="Add whole outfit" onClose={onClose} wide dismissOnBackdrop={false}>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          {splitting ? (
            <>
              <Loader2 size={30} className="animate-spin text-accent" />
              <p className="font-medium">Detecting every garment…</p>
              <p className="text-sm text-muted">Finding tops, bottoms, shoes and accessories.</p>
            </>
          ) : (
            <>
              <div>
                <p className="font-medium">Add a photo of a full outfit</p>
                <p className="mt-1 text-sm text-muted">
                  I&apos;ll find every piece and add each as its own item.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={takePhoto}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
                >
                  <Camera size={15} /> Take photo
                </button>
                <button
                  type="button"
                  onClick={pickLibrary}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2"
                >
                  <Upload size={15} /> Choose photo
                </button>
              </div>
              <button type="button" onClick={addByLink} className="text-xs text-muted underline">
                or add by link instead
              </button>
            </>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {analyzing ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Tagging garments…
              </span>
            ) : (
              <span>
                Found {rows.length} piece{rows.length === 1 ? "" : "s"} — {included.length} to add
              </span>
            )}
          </p>

          <div className="grid max-h-[52vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`flex gap-3 rounded-2xl border p-2.5 transition-opacity ${
                  r.include ? "border-line" : "border-line/60 opacity-50"
                }`}
              >
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.imageUrl} alt={r.name} className="h-full w-full object-contain" />
                  {r.status === "analyzing" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 size={16} className="animate-spin text-white" />
                    </div>
                  )}
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
            <Button onClick={() => void addAll()} disabled={busy || included.length === 0}>
              {progress ?? `Add ${included.length || ""} to closet`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
