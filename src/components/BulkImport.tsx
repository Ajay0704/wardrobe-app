"use client";

import { Check, Images, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useWardrobe } from "@/lib/store";
import { authHeaders } from "@/lib/supabase/client";
import { resolveImageSource } from "@/lib/supabase/storage";
import type { Category, Season } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { Button, Modal, inputClass } from "./ui";

type RowStatus = "analyzing" | "ready" | "error";

interface BulkRow {
  id: string;
  fileName: string;
  /** Local object URL for instant preview. */
  preview: string;
  /** Resolved storage URL / data URL used when saving (empty until resolved). */
  imageUrl: string;
  status: RowStatus;
  error?: string;
  include: boolean;
  name: string;
  category: Category;
  color: string;
  colorName?: string;
  tags: string[];
  seasons: Season[];
  brand?: string;
}

/** Filename → a reasonable default item name ("blue-linen-shirt.jpg" → "Blue Linen Shirt"). */
function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "New item";
  return base.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
}

/**
 * Bulk multi-photo import: pick many photos at once, auto-tag each with Gemini,
 * review/tweak in a grid, then add them all in one go. Attacks the manual
 * one-at-a-time setup wall (AJA-34).
 */
export function BulkImport({ onClose }: { onClose: () => void }) {
  const { addItem, authUser } = useWardrobe();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<BulkRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const analyzeRow = async (row: BulkRow, file: File) => {
    try {
      const src = await resolveImageSource(file, authUser?.id ?? null);
      patch(row.id, { imageUrl: src });
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ image: src }),
        });
        const data = await res.json();
        if (res.ok) {
          patch(row.id, {
            status: "ready",
            category: (data.category as Category) ?? row.category,
            color: data.color ?? row.color,
            colorName: data.colorName ?? row.colorName,
            brand: data.brand?.trim() || undefined,
            tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
            seasons: Array.isArray(data.seasons) ? (data.seasons as Season[]) : [],
            // Prefer the model's name only if the user hasn't retyped it.
            name: data.name?.trim() ? (data.name as string) : row.name,
          });
          return;
        }
      } catch {
        /* analyze failed — the item is still importable, just untagged */
      }
      patch(row.id, { status: "ready" }); // resolved image but no auto-tags
    } catch (err) {
      patch(row.id, {
        status: "error",
        include: false,
        error: err instanceof Error ? err.message : "Couldn't read that image.",
      });
    }
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const pending: { row: BulkRow; file: File }[] = files.map((file) => ({
      file,
      row: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        preview: URL.createObjectURL(file),
        imageUrl: "",
        status: "analyzing" as RowStatus,
        include: true,
        name: nameFromFile(file.name),
        category: "top" as Category,
        color: "#a8a29e",
        tags: [],
        seasons: [],
      },
    }));
    setRows((rs) => [...rs, ...pending.map((p) => p.row)]);

    // Limited concurrency so we don't hammer the analyze API with 20 files at once.
    setBusy(true);
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const { row, file } = pending[i++];
        await analyzeRow(row, file);
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    setBusy(false);
  };

  const included = rows.filter((r) => r.include && r.imageUrl && r.status !== "analyzing");
  const analyzing = rows.some((r) => r.status === "analyzing");

  const addAll = () => {
    for (const r of included) {
      addItem({
        name: r.name.trim() || nameFromFile(r.fileName),
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
    <Modal title="Import multiple photos" onClose={onClose} wide>
      {rows.length === 0 ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-6 py-14 text-center transition-colors hover:border-accent/60">
          <Images size={32} className="text-muted" />
          <div>
            <p className="font-medium">Select photos of your clothes</p>
            <p className="mt-1 text-sm text-muted">
              Pick several at once — each is auto-tagged so you can add your whole
              closet in one pass.
            </p>
          </div>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
            <Upload size={15} /> Choose photos
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
          />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {analyzing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" /> Auto-tagging…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={14} className="text-accent" /> {included.length}{" "}
                  of {rows.length} ready to add
                </span>
              )}
            </p>
            <label className="cursor-pointer text-sm font-medium text-accent hover:underline">
              + Add more
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
              />
            </label>
          </div>

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
                  <img
                    src={r.imageUrl || r.preview}
                    alt={r.name}
                    className="h-full w-full object-cover"
                  />
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
                    disabled={r.status === "error"}
                    onChange={(e) => patch(r.id, { name: e.target.value })}
                  />
                  {r.status === "error" ? (
                    <p className="text-xs text-red-500">{r.error}</p>
                  ) : (
                    <select
                      className={`${inputClass} !py-1.5 text-sm`}
                      value={r.category}
                      disabled={r.status === "analyzing"}
                      onChange={(e) =>
                        patch(r.id, { category: e.target.value as Category })
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <button
                  type="button"
                  aria-label={r.include ? "Exclude" : "Include"}
                  onClick={() => patch(r.id, { include: !r.include })}
                  disabled={r.status === "error"}
                  className={`h-6 w-6 shrink-0 self-start rounded-full border transition-colors ${
                    r.include
                      ? "border-accent bg-accent text-white"
                      : "border-line text-transparent hover:border-accent/60"
                  } disabled:opacity-40`}
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
              Add {included.length || ""} to wardrobe
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
