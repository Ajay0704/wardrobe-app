"use client";

import {
  Camera,
  ChevronLeft,
  ExternalLink,
  Link2,
  Pipette,
  Scissors,
  Sparkles,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { affiliateUrl } from "@/lib/affiliate";
import { agentLog } from "@/lib/agent-log";
import { extractDominantColor, nameColor } from "@/lib/color";
import { captureNativePhoto } from "@/lib/native-camera";
import { isNativeApp, openExternalUrl } from "@/lib/platform";
import { useWardrobe } from "@/lib/store";
import { authHeaders } from "@/lib/supabase/client";
import { dataUrlToFile, resolveImageSource } from "@/lib/supabase/storage";
import type { Category, Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS, SUGGESTED_TAGS } from "@/lib/types";
import { Button, Chip, Field, Modal, inputClass } from "./ui";
import { SmartBuy } from "./SmartBuy";
import { BrandPicker } from "./BrandPicker";
import { useIsNativeApp } from "./NativeAppClass";

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
  const isNative = useIsNativeApp();

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
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState("");
  const [removingBg, setRemovingBg] = useState(false);

  const colorName = useMemo(() => nameColor(color), [color]);
  const canSave =
    name.trim().length > 0 &&
    imageUrl.trim().length > 0 &&
    !uploading &&
    !fetching &&
    !analyzing &&
    !removingBg;

  // Provisional item from the current form, so the Smart Buy analysis below
  // reacts live as you fill in / fetch details for a wishlist piece.
  const candidate = useMemo<WardrobeItem>(
    () => ({
      id: initial?.id ?? "__candidate__",
      name: name.trim() || "This item",
      imageUrl,
      productUrl: productUrl.trim() || undefined,
      category,
      color,
      colorName,
      tags,
      seasons,
      brand: brand.trim() || undefined,
      price: price.trim() ? Number(price) : undefined,
      wishlist: true,
      createdAt: initial?.createdAt ?? 0,
    }),
    [
      initial?.id,
      initial?.createdAt,
      name,
      imageUrl,
      productUrl,
      category,
      color,
      colorName,
      tags,
      seasons,
      brand,
      price,
    ],
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const commitTagInput = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setAnalyzeMsg("");
    try {
      const src = await resolveImageSource(file, authUser?.id ?? null);
      setImageUrl(src);
      void runAnalyze(src); // auto-tag in the background
    } catch (err) {
      setAnalyzeMsg(
        err instanceof Error ? err.message : "Couldn't upload that image.",
      );
    } finally {
      setUploading(false);
    }
  };

  /** Native camera via Capacitor — HTML capture= flashes and exits in WKWebView. */
  const handleTakePhoto = async () => {
    setAnalyzeMsg("");
    try {
      const file = await captureNativePhoto();
      if (!file) return;
      await handleFile(file);
    } catch (err) {
      setAnalyzeMsg(
        err instanceof Error
          ? err.message
          : "Couldn't open the camera. Check Settings → Wardrobe → Camera.",
      );
    }
  };

  /** Ask Gemini to read the photo and pre-fill category/color/name/tags/season. */
  const runAnalyze = async (src: string) => {
    if (!src) return;
    setAnalyzing(true);
    setAnalyzeMsg("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ image: src }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeMsg(data.error || "Couldn't auto-tag this photo.");
        return;
      }
      if (data.category) setCategory(data.category as Category);
      if (data.color) setColor(data.color);
      // Use functional updates so a name/brand typed while analyzing isn't
      // overwritten, and empty fields still get filled from the photo.
      if (data.name) {
        setName((prev) => (prev.trim() ? prev : (data.name as string)));
      }
      if (data.brand) {
        setBrand((prev) => (prev.trim() ? prev : (data.brand as string)));
      }
      if (Array.isArray(data.seasons) && data.seasons.length) {
        setSeasons((prev) => (prev.length ? prev : (data.seasons as Season[])));
      }
      if (Array.isArray(data.tags) && data.tags.length) {
        setTags((prev) => [...new Set([...prev, ...(data.tags as string[])])]);
      }
      setAnalyzeMsg("Auto-filled from photo — review and adjust.");
    } catch {
      setAnalyzeMsg("Couldn't auto-tag. Fill the fields manually.");
    } finally {
      setAnalyzing(false);
    }
  };

  /** Remove the background on-device (private, free) for a clean cutout. */
  const handleRemoveBg = async () => {
    if (!imageUrl) return;
    setRemovingBg(true);
    setAnalyzeMsg("");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      // Fetch into a blob first so CORS-restricted remote hosts (and data URLs)
      // are handled consistently by the WASM pipeline.
      let input: Blob | string = imageUrl;
      if (imageUrl.startsWith("http")) {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error("fetch-failed");
        input = await res.blob();
      }
      const blob = await removeBackground(input);
      const file = new File([blob], "cutout.png", { type: "image/png" });
      setImageUrl(await resolveImageSource(file, authUser?.id ?? null));
      setAnalyzeMsg("Background removed.");
    } catch {
      setAnalyzeMsg("Background removal failed — kept the original image.");
    } finally {
      setRemovingBg(false);
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
      if (typeof data.name === "string" && data.name.trim()) {
        setName(data.name.trim());
      }
      if (typeof data.brand === "string" && data.brand.trim()) {
        setBrand(data.brand.trim());
      }
      // API may return price as number or numeric string depending on the shop.
      const priceVal =
        typeof data.price === "number"
          ? data.price
          : typeof data.price === "string"
            ? Number(data.price.replace(/,/g, ""))
            : NaN;
      if (Number.isFinite(priceVal) && priceVal > 0) {
        setPrice(String(priceVal));
      }
      if (data.description && !notes.trim()) setNotes(data.description);

      let gotImage = false;
      // Re-host the fetched image to Storage (durable + CORS-friendly for color
      // extraction). Fall back to the remote URL if re-hosting fails.
      if (data.imageData) {
        try {
          const file = dataUrlToFile(data.imageData);
          const src = await resolveImageSource(file, authUser?.id ?? null);
          setImageUrl(src);
          gotImage = true;
          // Analyze fills category/tags/color; keep fetched name/brand (non-empty).
          void runAnalyze(src);
        } catch {
          if (typeof data.imageUrl === "string" && data.imageUrl) {
            setImageUrl(data.imageUrl);
            gotImage = true;
            void runAnalyze(data.imageUrl);
          }
        }
      } else if (typeof data.imageUrl === "string" && data.imageUrl) {
        setImageUrl(data.imageUrl);
        gotImage = true;
        void runAnalyze(data.imageUrl);
      }

      const bits = [
        data.name && "name",
        data.brand && "brand",
        Number.isFinite(priceVal) && priceVal > 0 && "price",
        gotImage && "photo",
      ].filter(Boolean);
      setFetchMsg(
        bits.length
          ? `Filled ${bits.join(", ")} — review before saving.` +
              (gotImage
                ? ""
                : " Add a photo manually if this store blocks image fetch.")
          : "Couldn't read much from that link — fill details manually.",
      );
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

  const title = initial ? "Edit item" : "Add item";
  const form = (
      <div className="item-form-layout grid gap-5 sm:grid-cols-[180px_1fr]">
        {/* Live image preview */}
        <div className="mx-auto w-44 space-y-2 sm:mx-0 sm:w-auto">
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
          {isNative ? (
            <div className="flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground">
                <Upload size={13} /> {uploading ? "…" : "Upload"}
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
              <button
                type="button"
                disabled={uploading}
                onClick={() => void handleTakePhoto()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground disabled:opacity-60"
              >
                <Camera size={13} /> {uploading ? "…" : "Take photo"}
              </button>
            </div>
          ) : (
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
          )}

          {imageUrl && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => runAnalyze(imageUrl)}
                disabled={analyzing || uploading}
                className="flex items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground disabled:opacity-60"
              >
                <Sparkles size={13} /> {analyzing ? "Analyzing…" : "Auto-tag"}
              </button>
              <button
                type="button"
                onClick={handleRemoveBg}
                disabled={removingBg || uploading}
                className="flex items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground disabled:opacity-60"
              >
                <Scissors size={13} /> {removingBg ? "Removing…" : "Remove background"}
              </button>
            </div>
          )}
          {analyzeMsg && (
            <span className="block text-center text-[11px] text-muted">
              {analyzeMsg}
            </span>
          )}
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
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
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
            {productUrl.trim() && (
              <button
                type="button"
                onClick={() => {
                  const url = affiliateUrl(productUrl.trim());
                  // #region agent log
                  agentLog("C", "ItemForm.tsx:openProduct", "Open product page tapped", {
                    hasUrl: !!url,
                    isNative,
                    isNativeAppFn: isNativeApp(),
                    host: (() => {
                      try {
                        return url ? new URL(url).hostname : "";
                      } catch {
                        return "";
                      }
                    })(),
                  });
                  // #endregion
                  if (url) void openExternalUrl(url);
                }}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent"
              >
                <ExternalLink size={12} />
                {isNative ? "Open product page in Safari" : "Open product page"}
              </button>
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
              <BrandPicker value={brand} onChange={setBrand} />
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

          {wishlist && imageUrl && (
            <div className="rounded-xl border border-line bg-surface-2/40 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                <Sparkles size={13} /> Smart Buy
              </p>
              <SmartBuy item={candidate} />
            </div>
          )}

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
  );

  // Native: in-app page that leaves the bottom tab bar visible. A full-screen
  // modal covered the tabs and felt like flipping to the website (AJA-33).
  if (isNative) {
    return (
      <NativeItemPage title={title} onClose={onClose}>
        {form}
      </NativeItemPage>
    );
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      {form}
    </Modal>
  );
}

function NativeItemPage({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="native-item-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="native-item-page-header">
        <button
          type="button"
          onClick={onClose}
          className="native-item-page-back"
          aria-label="Back"
        >
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Back</span>
        </button>
        <h2 className="native-item-page-title">{title}</h2>
        <span className="native-item-page-spacer" aria-hidden />
      </header>
      <div className="native-item-page-body">{children}</div>
    </div>
  );
}
