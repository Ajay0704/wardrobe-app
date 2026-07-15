"use client";

import { Check, Loader2, Shirt, Upload, X } from "lucide-react";
import { useState } from "react";
import { cutoutMulti } from "@/lib/cutout";
import { useWardrobe } from "@/lib/store";
import { authHeaders } from "@/lib/supabase/client";
import { resolveImageSource } from "@/lib/supabase/storage";
import type { Category, Season } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { Button, Modal, inputClass } from "./ui";

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

/**
 * "Add whole outfit": pick ONE photo, split it into a separate garment cutout per class
 * (cutoutMulti), review each as its own item (category pre-filled from the split), then add them
 * all. Reuses the BulkImport review-grid/addAll pattern; single-add is unaffected.
 */
export function OutfitSplitImport({ onClose }: { onClose: () => void }) {
  const { addItem, authUser } = useWardrobe();
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = (id: string, p: Partial<SplitRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // Auto-tag a split cutout for name/color/tags (keep the split's category — it's authoritative).
  const analyzeRow = async (row: SplitRow) => {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ image: row.imageUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        patch(row.id, {
          status: "ready",
          color: data.color ?? row.color,
          colorName: data.colorName ?? row.colorName,
          brand: data.brand?.trim() || undefined,
          tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
          seasons: Array.isArray(data.seasons) ? (data.seasons as Season[]) : [],
          name: data.name?.trim() ? (data.name as string) : row.name,
        });
      } else {
        patch(row.id, { status: "ready" });
      }
    } catch {
      patch(row.id, { status: "ready" });
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setSplitting(true);
    try {
      const src = await resolveImageSource(file, authUser?.id ?? null);
      const cuts = await cutoutMulti(src, authUser?.id ?? null);
      if (!cuts.length) {
        setError("Couldn't find any garments in that photo. Try a clearer full-length shot.");
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

      // Limited concurrency so we don't hammer /api/analyze.
      setBusy(true);
      let i = 0;
      const worker = async () => {
        while (i < newRows.length) await analyzeRow(newRows[i++]);
      };
      await Promise.all(Array.from({ length: 2 }, worker));
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that photo.");
      setSplitting(false);
    }
  };

  const included = rows.filter((r) => r.include && r.status !== "analyzing");
  const analyzing = rows.some((r) => r.status === "analyzing");

  const addAll = () => {
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
    onClose();
  };

  return (
    <Modal title="Add whole outfit" onClose={onClose} wide>
      {rows.length === 0 ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-6 py-14 text-center transition-colors hover:border-accent/60">
          {splitting ? (
            <>
              <Loader2 size={30} className="animate-spin text-accent" />
              <p className="font-medium">Splitting the outfit into garments…</p>
              <p className="text-sm text-muted">First split of a session can take ~15s.</p>
            </>
          ) : (
            <>
              <Shirt size={32} className="text-muted" />
              <div>
                <p className="font-medium">Add a photo of a full outfit</p>
                <p className="mt-1 text-sm text-muted">
                  Each garment is cut out separately and added as its own item.
                </p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                <Upload size={15} /> Choose a photo
              </span>
            </>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={splitting}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {analyzing ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Tagging garments…
              </span>
            ) : (
              <span>
                Found {rows.length} garment{rows.length === 1 ? "" : "s"} — {included.length} to add
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
            <Button onClick={addAll} disabled={busy || included.length === 0}>
              Add {included.length || ""} to closet
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
