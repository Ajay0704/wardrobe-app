"use client";

import { Link2, Pipette, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { extractDominantColor, nameColor } from "@/lib/color";
import { useWardrobe } from "@/lib/store";
import { authHeaders } from "@/lib/supabase/client";
import { resolveImageSource } from "@/lib/supabase/storage";
import type { Category, Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS, SUGGESTED_TAGS } from "@/lib/types";
import { Button, Chip, Field, Modal, inputClass } from "./ui";

/** Turn a base64 data URL into a File so it can be re-hosted via Storage. */
function dataUrlToFile(dataUrl: string, name = "product.jpg"): File {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : "jpg";
  return new File([bytes], name.replace(/\.\w+$/, "") + "." + ext, { type: mime });
}

/**
 * Add / edit item modal. Uploaded images go to Supabase Storage when signed in
 * (only a small URL is stored), falling back to a data URL otherwise.
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
  const { addItem, updateItem, authUser } = useWardrobe();

  const [name, setName] = useState(initial?.name ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [productUrl, setProductUrl] = useState(initial?.productUrl ?? "");
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
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  const colorName = useMemo(() => nameColor(color), [color]);
  const canSave =
    name.trim().length > 0 &&
    imageUrl.trim().length > 0 &&
    !uploading &&
    !fetching;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const commitTagInput = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      setImageUrl(await resolveImageSource(file, authUser?.id ?? null));
    } finally {
      setUploading(false);
    }
  };

  const handleFetchDetails = async () => {
    const url = productUrl.trim();
    if (!url) return;
    setFetching(true);
    setFetchMsg("");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchMsg(data.error || "Couldn't read details from that link.");
        return;
      }
      if (data.name) setName(data.name);
      if (data.brand) setBrand(data.brand);
      if (typeof data.price === "number") setPrice(String(data.price));
      if (data.description && !notes.trim()) setNotes(data.description);
      // Re-host the fetched image to Storage (durable + CORS-friendly for color
      // extraction). Fall back to the remote URL if re-hosting fails.
      if (data.imageData) {
        try {
          const file = dataUrlToFile(data.imageData);
          setImageUrl(await resolveImageSource(file, authUser?.id ?? null));
        } catch {
          if (data.imageUrl) setImageUrl(data.imageUrl);
        }
      } else if (data.imageUrl) {
        setImageUrl(data.imageUrl);
      }
      setFetchMsg("Details filled in — review and adjust before saving.");
    } catch {
      setFetchMsg("Something went wrong. Fill the details in manually.");
    } finally {
      setFetching(false);
    }
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
      productUrl: productUrl.trim() || undefined,
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
                Upload an image to preview it here
              </div>
            )}
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground">
            <Upload size={13} /> {uploading ? "Uploading…" : "Upload image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
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

          <Field
            label="Product URL (optional)"
            hint="Paste a shop link, then Fetch details to auto-fill name, photo, price and brand."
          >
            <div className="flex items-center gap-2">
              <input
                className={inputClass}
                type="url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://store.com/product"
              />
              <Button
                variant="outline"
                onClick={handleFetchDetails}
                disabled={!productUrl.trim() || fetching}
                title="Fetch product details from this link"
                className="!px-3 !py-2 text-xs whitespace-nowrap"
              >
                <Link2 size={13} />
                {fetching ? "Fetching…" : "Fetch details"}
              </Button>
            </div>
            {fetchMsg && (
              <span className="mt-1 block text-xs text-muted">{fetchMsg}</span>
            )}
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
