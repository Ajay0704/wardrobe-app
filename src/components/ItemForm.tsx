"use client";

import { Pipette, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { extractDominantColor, nameColor } from "@/lib/color";
import { useWardrobe } from "@/lib/store";
import type { Category, Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS, SUGGESTED_TAGS } from "@/lib/types";
import { Button, Chip, Field, Modal, inputClass } from "./ui";

/**
 * Add / edit item modal. Handles both the URL flow and the file-upload
 * fallback (files are stored as data URLs so everything stays local).
 */
export function ItemForm({
  initial,
  defaultWishlist,
  onClose,
}: {
  initial?: WardrobeItem;
  defaultWishlist?: boolean;
  onClose: () => void;
}) {
  const { addItem, updateItem } = useWardrobe();

  const [name, setName] = useState(initial?.name ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [category, setCategory] = useState<Category>(initial?.category ?? "top");
  const [color, setColor] = useState(initial?.color ?? "#a8a29e");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [seasons, setSeasons] = useState<Season[]>(initial?.seasons ?? []);
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [price, setPrice] = useState(initial?.price?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [wishlist, setWishlist] = useState(
    initial?.wishlist ?? defaultWishlist ?? false,
  );
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");

  const colorName = useMemo(() => nameColor(color), [color]);
  const canSave = name.trim().length > 0 && imageUrl.trim().length > 0;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const commitTagInput = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    setExtracting(true);
    setExtractError("");
    try {
      setColor(await extractDominantColor(imageUrl));
    } catch {
      setExtractError(
        "Couldn't read colors from this image (host may block it). Pick manually.",
      );
    } finally {
      setExtracting(false);
    }
  };

  const save = () => {
    const data = {
      name: name.trim(),
      imageUrl: imageUrl.trim(),
      category,
      color,
      colorName,
      tags,
      seasons,
      brand: brand.trim() || undefined,
      price: price.trim() ? Number(price) : undefined,
      notes: notes.trim() || undefined,
      wishlist,
    };
    if (initial) updateItem(initial.id, data);
    else addItem(data);
    onClose();
  };

  return (
    <Modal title={initial ? "Edit item" : "Add item"} onClose={onClose} wide>
      <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
        {/* Live image preview */}
        <div className="space-y-2">
          <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-surface-2">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                Paste an image URL or upload a file
              </div>
            )}
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground">
            <Upload size={13} /> Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleFile(e.target.files[0])
              }
            />
          </label>
        </div>

        <div className="space-y-4">
          <Field label="Name">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Camel Knit Sweater"
              autoFocus
            />
          </Field>

          <Field label="Image URL" hint="Direct image links work best (.jpg, .png, .webp)">
            <input
              className={inputClass}
              value={imageUrl.startsWith("data:") ? "(uploaded file)" : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`Color — ${colorName}`}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent p-1"
                />
                <Button
                  variant="outline"
                  onClick={handleExtract}
                  disabled={!imageUrl || extracting}
                  title="Extract dominant color from the image"
                  className="!px-3 !py-2 text-xs"
                >
                  <Pipette size={13} />
                  {extracting ? "…" : "From image"}
                </Button>
              </div>
              {extractError && (
                <span className="mt-1 block text-xs text-amber-600">
                  {extractError}
                </span>
              )}
            </Field>
          </div>

          <Field label="Tags">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[...new Set([...SUGGESTED_TAGS, ...tags])].map((t) => (
                <Chip
                  key={t}
                  active={tags.includes(t)}
                  onClick={() => setTags(toggle(tags, t))}
                >
                  {t}
                </Chip>
              ))}
            </div>
            <input
              className={inputClass}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTagInput();
                }
              }}
              onBlur={commitTagInput}
              placeholder="Add custom tag, press Enter"
            />
          </Field>

          <Field label="Seasons">
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.map((s) => (
                <Chip
                  key={s}
                  active={seasons.includes(s)}
                  onClick={() => setSeasons(toggle(seasons, s))}
                >
                  {s}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Brand (optional)">
              <input
                className={inputClass}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Everlane"
              />
            </Field>
            <Field label="Price (optional)">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="49"
              />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fit notes, care instructions…"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wishlist}
              onChange={(e) => setWishlist(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            This is a wishlist item (I don&apos;t own it yet)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {initial ? "Save changes" : "Add to wardrobe"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
