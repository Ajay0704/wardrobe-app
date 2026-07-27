"use client";

import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Maximize2,
  Pipette,
  RefreshCw,
  Trash2,
  Sparkles,
  Upload,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProductCandidate } from "@/app/api/find-product/route";
import { affiliateUrl } from "@/lib/affiliate";
import { extractDominantColor, nameColor } from "@/lib/color";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { captureNativePhoto } from "@/lib/native-camera";
import { isNativeApp, openExternalUrl } from "@/lib/platform";
import { embedItem } from "@/lib/style-embed";
import { useWardrobe } from "@/lib/store";
import { cutout } from "@/lib/cutout";
import { BEAUTIFY_PIPELINE, beautify } from "@/lib/beautify";
import { authHeaders } from "@/lib/supabase/client";
import { dataUrlToFile, resolveImageSource } from "@/lib/supabase/storage";
import type { Category, Fit, Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, FIT_VALUES, SEASONS, SUGGESTED_TAGS } from "@/lib/types";
import { Button, Chip, Field, Modal, inputClass } from "./ui";
import { BottomSheet } from "./BottomSheet";
import { FindProductSheet } from "./FindProductSheet";
import { SmartBuy } from "./SmartBuy";
import { BrandPicker } from "./BrandPicker";
import { BeautifyCompare } from "./BeautifyCompare";
import { PhotoLightbox } from "./PhotoLightbox";
import { useIsNativeApp } from "./NativeAppClass";

/** Which attribute row's picker sheet is open (Acloset-style edit — AJA-207). */
type SheetKey =
  | "name"
  | "category"
  | "color"
  | "fit"
  | "formality"
  | "material"
  | "pattern"
  | "tone"
  | "size"
  | "brand"
  | "price"
  | "season"
  | "tags"
  | "link"
  | "notes";

const SHEET_TITLES: Record<SheetKey, string> = {
  name: "Name",
  category: "Category",
  color: "Color",
  fit: "Fit",
  formality: "Formality",
  material: "Material",
  pattern: "Pattern",
  tone: "Tone",
  size: "Size",
  brand: "Brand",
  price: "Price",
  season: "Season",
  tags: "Tags",
  link: "Product link",
  notes: "Notes",
};

/** Single-select vocab for the AI-fillable attribute pickers (mirrors /api/analyze). */
const FORMALITY_OPTIONS = ["casual", "smart-casual", "formal", "statement"];
const PATTERN_OPTIONS = ["solid", "stripe", "check", "print"];
const TONE_OPTIONS = ["neutral", "warm", "cool", "black", "white", "bright", "pastel", "earth"];
const MATERIAL_OPTIONS = [
  "cotton", "linen", "wool", "denim", "leather", "silk", "knit", "cashmere", "synthetic",
];

/** Phone / Capacitor: keep the stacked editor — never jump to desktop modal chrome. */
function usePhoneEditorLayout(nativeHook: boolean): boolean {
  const [narrow, setNarrow] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const htmlNative =
    mounted && document.documentElement.classList.contains("native-app");
  return nativeHook || isNativeApp() || htmlNative || narrow;
}

function portalToBody(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

/**
 * Add / edit item modal. Uploaded images go to Supabase Storage when signed in
 * (only a small URL is stored), falling back to a data URL otherwise.
 */
export function ItemForm({
  initial,
  defaultWishlist,
  intent,
  onClose,
}: {
  initial?: WardrobeItem;
  defaultWishlist?: boolean;
  /** When opened from a "+" row, jump straight to this input. */
  intent?: "camera" | "upload" | "link" | null;
  onClose: () => void;
}) {
  const { addItem, updateItem, deleteItem, authUser } = useWardrobe();
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const pendingSharedImage = useWardrobe((s) => s.pendingSharedImage);
  const setPendingSharedImage = useWardrobe((s) => s.setPendingSharedImage);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const nativeHook = useIsNativeApp();
  const isNative = nativeHook || isNativeApp();
  const phoneEditor = usePhoneEditorLayout(nativeHook);

  const [name, setName] = useState(initial?.name ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [originalImageUrl, setOriginalImageUrl] = useState<string | undefined>(
    initial?.originalImageUrl,
  );
  const [cutoutEngine, setCutoutEngine] = useState<string | undefined>(
    initial?.cutoutEngine,
  );
  const [beautifiedImageUrl, setBeautifiedImageUrl] = useState<string | undefined>(
    initial?.beautifiedImageUrl,
  );
  const [beautifyWhiteUrl, setBeautifyWhiteUrl] = useState<string | undefined>(
    initial?.beautifyWhiteUrl,
  );
  const [cutoutImageUrl, setCutoutImageUrl] = useState<string | undefined>(
    initial?.cutoutImageUrl,
  );
  const [beautifyModel, setBeautifyModel] = useState<string | undefined>(
    initial?.beautifyModel,
  );
  const [beautifying, setBeautifying] = useState(false);
  const [beautifyDisabled, setBeautifyDisabled] = useState(false);
  const [beautifyCompare, setBeautifyCompare] = useState<
    { before: string; after: string } | null
  >(null);
  const [productUrl, setProductUrl] = useState(initial?.productUrl ?? "");
  const [category, setCategory] = useState<Category>(initial?.category ?? "top");
  const [fit, setFit] = useState<Fit | undefined>(initial?.fit);
  const [formality, setFormality] = useState<string | undefined>(initial?.formality);
  const [material, setMaterial] = useState<string | undefined>(initial?.material);
  const [pattern, setPattern] = useState<string | undefined>(initial?.pattern);
  const [tone, setTone] = useState<string | undefined>(initial?.tone);
  const [size, setSize] = useState(initial?.size ?? "");
  const [styleCaption, setStyleCaption] = useState<string | undefined>(
    initial?.styleCaption,
  );
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
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState("");
  const [removingBg, setRemovingBg] = useState(false);
  const [findingProduct, setFindingProduct] = useState(false);
  const [findCandidates, setFindCandidates] = useState<ProductCandidate[] | null>(
    null,
  );
  const [findMessage, setFindMessage] = useState("");
  const [findMsg, setFindMsg] = useState("");
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const photoMenuRef = useRef<HTMLDivElement>(null);

  // Close the "Edit photo" menu on an outside tap (mirrors ProfileMenu).
  useEffect(() => {
    if (!photoMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target as Node)) {
        setPhotoMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [photoMenuOpen]);

  // Hide the shell's floating chat button while the editor covers the screen, so it
  // never overlaps the pinned Save bar.
  useEffect(() => {
    document.body.classList.add("item-editor-open");
    return () => document.body.classList.remove("item-editor-open");
  }, []);

  // Phone: don't steal focus into Name when opening a clipped wishlist item.
  useEffect(() => {
    if (!phoneEditor) return;
    const t = window.setTimeout(() => {
      const ae = document.activeElement;
      if (ae instanceof HTMLElement) ae.blur();
    }, 50);
    return () => window.clearTimeout(t);
  }, [phoneEditor, initial?.id]);

  const colorName = useMemo(() => nameColor(color), [color]);
  const canSave =
    name.trim().length > 0 &&
    imageUrl.trim().length > 0 &&
    !uploading &&
    !fetching &&
    !analyzing &&
    !removingBg &&
    !beautifying;

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
      wishlist,
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
      wishlist,
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
      setOriginalImageUrl(src); // keep the pre-cutout image
      // Auto-tag first so the garment engine knows which clothing class to keep,
      // then cut out (the imgly engine ignores the category).
      const cat = await runAnalyze(src);
      void autoCutout(src, cat ?? category);
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

  // When opened from a "+" row, jump straight to that input (camera / library / link). Once,
  // deferred a tick so the modal/portal has painted and the target input is focusable.
  const intentFired = useRef(false);
  useEffect(() => {
    if (intentFired.current || !intent) return;
    intentFired.current = true;
    const t = setTimeout(() => {
      if (intent === "camera") void handleTakePhoto();
      else if (intent === "upload") uploadInputRef.current?.click();
      else if (intent === "link") urlInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  // A photo shared via the iOS Share Extension: load it into the add form and run the
  // normal photo pipeline (analyze + cutout), so the user reviews the auto-tagged item.
  const sharedImageConsumed = useRef(false);
  useEffect(() => {
    if (sharedImageConsumed.current || initial || !pendingSharedImage) return;
    sharedImageConsumed.current = true;
    const dataUrl = pendingSharedImage;
    setPendingSharedImage(null);
    const t = setTimeout(() => {
      try {
        void handleFile(dataUrlToFile(dataUrl));
      } catch {
        /* ignore a malformed shared image */
      }
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSharedImage]);

  /** Ask Gemini to read the photo and pre-fill category/color/name/tags/season. */
  const runAnalyze = async (src: string): Promise<Category | undefined> => {
    if (!src) return undefined;
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
        return undefined;
      }
      const detected = data.category as Category | undefined;
      if (detected) setCategory(detected);
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
      if (typeof data.formality === "string" && data.formality) {
        setFormality((prev) => prev || data.formality);
      }
      if (typeof data.material === "string" && data.material) {
        setMaterial((prev) => prev || data.material);
      }
      if (typeof data.pattern === "string" && data.pattern) {
        setPattern((prev) => prev || data.pattern);
      }
      if (typeof data.tone === "string" && data.tone) {
        setTone((prev) => prev || data.tone);
      }
      if (typeof data.styleCaption === "string" && data.styleCaption) {
        setStyleCaption((prev) => prev || data.styleCaption);
      }
      setAnalyzeMsg("Auto-filled from photo — review and adjust.");
      return detected;
    } catch {
      setAnalyzeMsg("Couldn't auto-tag. Fill the fields manually.");
      return undefined;
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Automatic cutout after a photo is added (upload/camera/fetch). Shows the
   * original immediately, then swaps in the cutout when ready; silently keeps the
   * original if removal fails so an add never gets blocked.
   */
  const autoCutout = async (src: string, cat?: Category) => {
    setRemovingBg(true);
    try {
      const r = await cutout(src, authUser?.id ?? null, { category: cat });
      setImageUrl(r.url);
      setCutoutEngine(r.engine);
    } catch {
      /* keep original */
    } finally {
      setRemovingBg(false);
    }
  };

  /** Revert to the pre-cutout image (undo a bad removal). */
  const restoreOriginal = () => {
    if (!originalImageUrl) return;
    setImageUrl(originalImageUrl);
    setCutoutEngine(undefined);
    setAnalyzeMsg("Restored the original photo.");
  };

  const beautifyApplied = !!beautifiedImageUrl && imageUrl === beautifiedImageUrl;
  // A cached beautify whose stamp lacks the current pipeline marker was made by an older pipeline
  // (white-bg, or transparent-but-unnormalized) and is worth regenerating once — which ignores the
  // cache and re-runs from the stored cutout through the current prompt + normalization.
  const beautifyStale =
    !!beautifiedImageUrl && !(beautifyModel ?? "").includes(BEAUTIFY_PIPELINE);

  /**
   * Beautify toggle (generative product-shot redraw). Generates once and caches, so it never
   * regenerates: applied → revert to the cutout; cached-but-not-applied → re-apply (no regen);
   * none → call Gemini, cache, apply. `force` skips the cache and regenerates from the stored
   * cutout (used to refresh a stale white-bg beautify). A missing key (501) disables the button.
   */
  const handleBeautify = async (force = false) => {
    if (!imageUrl) return;
    if (!force) {
      if (beautifyApplied) {
        // Revert to the stored cutout, keep the cache for instant re-apply.
        setImageUrl(cutoutImageUrl ?? imageUrl);
        setAnalyzeMsg("Reverted to the cutout.");
        return;
      }
      if (beautifiedImageUrl) {
        // Cached → show the before/after again instead of silently re-applying.
        setBeautifyCompare({
          before: cutoutImageUrl ?? imageUrl,
          after: beautifyWhiteUrl ?? beautifiedImageUrl,
        });
        return;
      }
    }
    // Regenerate from the stored cutout when forcing; otherwise the current (cutout) image.
    const base = force ? (cutoutImageUrl ?? imageUrl) : imageUrl;
    setBeautifying(true);
    setAnalyzeMsg("");
    try {
      const r = await beautify(base, authUser?.id ?? null, category);
      setCutoutImageUrl(base);
      setBeautifiedImageUrl(r.url);
      setBeautifyWhiteUrl(r.whiteUrl);
      setBeautifyModel(r.model);
      // Don't silently replace the photo — let the user compare and choose.
      setBeautifyCompare({ before: base, after: r.whiteUrl });
      setAnalyzeMsg("");
    } catch (e) {
      if ((e as Error).message === "beautify 501") {
        setBeautifyDisabled(true);
        setAnalyzeMsg("Beautify isn't available (needs GEMINI_API_KEY).");
      } else {
        setAnalyzeMsg("Beautify failed — kept the current image.");
      }
    } finally {
      setBeautifying(false);
    }
  };

  const keepBeautify = () => {
    if (beautifiedImageUrl) {
      setImageUrl(beautifiedImageUrl);
      setAnalyzeMsg("Beautified into a product shot.");
    }
    setBeautifyCompare(null);
  };
  const discardBeautify = () => {
    setBeautifyCompare(null);
    setAnalyzeMsg("Kept your original photo.");
  };

  const handleFetchDetails = async (
    overrideUrl?: string,
    opts?: { keepImage?: boolean; keepName?: boolean },
  ) => {
    const url = (overrideUrl ?? productUrl).trim();
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
        setName((prev) =>
          opts?.keepName && prev.trim() ? prev : data.name.trim(),
        );
      }
      if (typeof data.brand === "string" && data.brand.trim()) {
        setBrand((prev) => (prev.trim() ? prev : data.brand.trim()));
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

      if (opts?.keepImage) {
        setFetchMsg("Filled link, price and brand — review before saving.");
        return;
      }

      let gotImage = false;
      // Re-host the fetched image to Storage (durable + CORS-friendly for color
      // extraction). Fall back to the remote URL if re-hosting fails.
      if (data.imageData) {
        try {
          const file = dataUrlToFile(data.imageData);
          const src = await resolveImageSource(file, authUser?.id ?? null);
          setImageUrl(src);
          setOriginalImageUrl(src);
          gotImage = true;
          // Analyze fills category/tags/color; keep fetched name/brand (non-empty).
          const cat = await runAnalyze(src);
          void autoCutout(src, cat ?? category); // cut out the fetched product image too
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

  const handleFindProduct = async () => {
    if (!imageUrl.startsWith("http")) {
      setFindMsg(
        "Upload the photo while signed in first so it has a public Storage URL.",
      );
      return;
    }
    setFindingProduct(true);
    setFindMsg("");
    setFindMessage("");
    setFindCandidates(null);
    try {
      const hint = [name, brand, category].filter(Boolean).join(" ").trim();
      const res = await fetch("/api/find-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ imageUrl, hint: hint || undefined }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        candidates?: ProductCandidate[];
      };
      if (!res.ok) {
        setFindMsg(data.error || "Couldn't search for this product.");
        return;
      }
      setFindMessage(data.message || "");
      setFindCandidates(data.candidates ?? []);
      if (!(data.candidates ?? []).length) {
        setFindMsg(
          data.message ||
            "No product listings found. Try a clearer photo or paste a shop link.",
        );
      }
    } catch {
      setFindMsg("Product search failed. Try again or paste a shop link.");
    } finally {
      setFindingProduct(false);
    }
  };

  const handlePickCandidate = (c: ProductCandidate) => {
    setFindCandidates(null);
    setProductUrl(c.link);
    if (c.price != null && Number.isFinite(c.price) && c.price > 0) {
      setPrice(String(c.price));
    }
    setFetchMsg("Fetching full details from that listing…");
    void handleFetchDetails(c.link, { keepImage: true, keepName: true });
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
    const partial = {
      name: name.trim(),
      imageUrl: imageUrl.trim(),
      originalImageUrl:
        originalImageUrl && originalImageUrl !== imageUrl.trim()
          ? originalImageUrl
          : undefined,
      cutoutEngine: cutoutEngine || undefined,
      beautifiedImageUrl: beautifiedImageUrl || undefined,
      beautifyWhiteUrl: beautifyWhiteUrl || undefined,
      cutoutImageUrl: cutoutImageUrl || undefined,
      beautifyModel: beautifyModel || undefined,
      productUrl: productUrl.trim() || undefined,
      category,
      fit,
      formality: formality || undefined,
      material: material || undefined,
      pattern: pattern || undefined,
      tone: tone || undefined,
      size: size.trim() || undefined,
      styleCaption: styleCaption || undefined,
      color,
      colorName,
      tags,
      seasons,
      brand: brand.trim() || undefined,
      price: price.trim() ? Number(price) : undefined,
      notes: notes.trim() || undefined,
      wishlist,
    };
    const styleEmbedding = embedItem(partial);
    const data = { ...partial, styleEmbedding };
    if (initial) updateItem(initial.id, data);
    else addItem(data);
    onClose();
  };

  // Two-tap delete confirm (edit mode only): first tap arms it, second tap deletes.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const handleDelete = () => {
    if (!initial) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteItem(initial.id);
    onClose();
  };

  const title = initial ? "Edit item" : "Add item";
  // On the detail screen show the garment-on-white product shot; the transparent sticker
  // (imageUrl) is for the canvas. Fall back to imageUrl before/without Beautify.
  const previewUrl = beautifyApplied && beautifyWhiteUrl ? beautifyWhiteUrl : imageUrl;

  // The link auto-fill only makes sense when you're saving something you found
  // online — hide it entirely when editing a piece you already own (AJA-207).
  const showAutofill = wishlist || intent === "link";
  const categoryLabel =
    CATEGORIES.find((c) => c.value === category)?.label ?? category;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const photoBusy = uploading || removingBg || beautifying;

  // Accessories (watch/jewelry/bag) are often shot held in a hand, which the
  // background remover can't isolate — nudge a flat-lay reshoot (AJA-217 / fix C).
  const captureTip =
    imageUrl && (category === "accessory" || category === "bag") ? (
      <p className="text-center text-[11px] leading-relaxed text-muted">
        Tip: watches, jewelry &amp; bags cut out best shot flat on a plain surface — not
        held in hand.
      </p>
    ) : null;

  // The "Edit photo" menu items, shared by the desktop square block and the phone
  // editorial hero's Edit pill (both anchor their own dropdown around these).
  const photoMenuItems = (
    <>
      <PhotoMenuItem
        icon={Upload}
        onClick={() => {
          setPhotoMenuOpen(false);
          uploadInputRef.current?.click();
        }}
      >
        {imageUrl ? "Replace with upload" : "Upload photo"}
      </PhotoMenuItem>
      {isNative && (
        <PhotoMenuItem
          icon={Camera}
          onClick={() => {
            setPhotoMenuOpen(false);
            void handleTakePhoto();
          }}
        >
          Take photo
        </PhotoMenuItem>
      )}
      {imageUrl && !beautifyDisabled && (
        <>
          <div className="my-1 border-t border-line" />
          <PhotoMenuItem
            icon={Wand2}
            accent
            onClick={() => {
              setPhotoMenuOpen(false);
              void handleBeautify();
            }}
          >
            {beautifyApplied ? "Revert to cutout" : "Beautify — product shot"}
          </PhotoMenuItem>
          {beautifyStale && (
            <PhotoMenuItem
              icon={RefreshCw}
              onClick={() => {
                setPhotoMenuOpen(false);
                void handleBeautify(true);
              }}
            >
              Regenerate product shot
            </PhotoMenuItem>
          )}
        </>
      )}
      {imageUrl && originalImageUrl && originalImageUrl !== imageUrl && (
        <PhotoMenuItem
          icon={ImageIcon}
          onClick={() => {
            setPhotoMenuOpen(false);
            restoreOriginal();
          }}
        >
          Use original photo
        </PhotoMenuItem>
      )}
    </>
  );

  // Large live preview + one "Edit photo" menu (upload / camera / beautify / restore).
  // Desktop modal only — the phone editor uses the editorial hero below.
  const photoBlock = (
    <div className="mx-auto w-44 space-y-2.5">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
        {imageUrl ? (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="Enlarge photo"
            className="relative h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Preview"
              className="h-full w-full object-contain"
            />
            <span className="absolute bottom-2 right-2 flex items-center justify-center rounded-full bg-black/45 p-1.5 text-white backdrop-blur">
              <Maximize2 size={13} />
            </span>
          </button>
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
            Add a photo to preview it here
          </div>
        )}
      </div>
      {zoomOpen &&
        previewUrl &&
        portalToBody(
          <PhotoLightbox src={previewUrl} onClose={() => setZoomOpen(false)} />,
        )}

      {/* One control for every photo action (replaces the old stack of buttons). */}
      <div ref={photoMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setPhotoMenuOpen((o) => !o)}
          disabled={uploading || removingBg || beautifying}
          aria-haspopup="menu"
          aria-expanded={photoMenuOpen}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent/60 disabled:opacity-60"
        >
          <ImageIcon size={13} />
          {uploading
            ? "Uploading…"
            : removingBg
              ? "Removing background…"
              : beautifying
                ? "Beautifying…"
                : imageUrl
                  ? "Edit photo"
                  : "Add photo"}
          <ChevronDown size={13} className="text-muted" />
        </button>

        {photoMenuOpen && (
          <div
            role="menu"
            className="animate-fade-up absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg shadow-black/10"
          >
            {photoMenuItems}
          </div>
        )}
      </div>

      {analyzeMsg && (
        <span className="block text-center text-[11px] text-muted">
          {analyzeMsg}
        </span>
      )}
      {captureTip}
    </div>
  );

  // Phone editorial hero (Option C — AJA-210): a tall edge-to-edge photo with the
  // name + category laid over a gradient scrim, and an "Edit" pill for the photo menu.
  const editorialHero = (
    <div>
      <div
        className="relative -mx-4 -mt-5 overflow-hidden bg-gradient-to-b from-surface to-surface-2"
        style={{ height: "min(58vh, 480px)" }}
      >
        {/* The photo — tap to enlarge. */}
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="Enlarge photo"
          className="absolute inset-0 h-full w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            className="h-full w-full object-contain"
          />
        </button>

        {/* Zoom hint — non-interactive, the tap falls through to the photo. */}
        <span className="pointer-events-none absolute left-3 top-3 flex items-center justify-center rounded-full bg-black/40 p-1.5 text-white backdrop-blur">
          <Maximize2 size={13} />
        </span>

        {/* Legibility scrim under the name. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        {/* Edit-photo pill + dropdown, top-right. */}
        <div ref={photoMenuRef} className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => setPhotoMenuOpen((o) => !o)}
            disabled={photoBusy}
            aria-haspopup="menu"
            aria-expanded={photoMenuOpen}
            className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-[transform,background-color] duration-150 ease-out hover:bg-white active:scale-95 disabled:opacity-60"
          >
            <ImageIcon size={13} />
            {uploading
              ? "Uploading…"
              : removingBg
                ? "Removing…"
                : beautifying
                  ? "Beautifying…"
                  : "Edit"}
            <ChevronDown size={13} className="text-muted" />
          </button>
          {photoMenuOpen && (
            <div
              role="menu"
              className="animate-pop absolute right-0 top-full z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-line bg-surface py-1 text-left shadow-lg shadow-black/10"
            >
              {photoMenuItems}
            </div>
          )}
        </div>

        {/* Name + category overlaid on the scrim (tap either to edit). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <button
            type="button"
            onClick={() => setOpenSheet("category")}
            className="pointer-events-auto mb-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur transition-[transform,background-color] duration-150 ease-out hover:bg-white/30 active:scale-95"
          >
            {categoryLabel}
            <ChevronRight size={12} className="opacity-70" />
          </button>
          <button
            type="button"
            onClick={() => setOpenSheet("name")}
            aria-label="Edit name"
            className="pointer-events-auto block w-full text-left transition-opacity duration-150 ease-out active:opacity-70"
          >
            <span
              className={`line-clamp-2 text-[21px] font-semibold leading-tight tracking-tight ${
                name.trim() ? "text-white" : "text-white/60"
              }`}
              style={{ textShadow: "0 1px 12px rgba(0,0,0,.45)" }}
            >
              {name.trim() || "Name this item"}
            </span>
          </button>
        </div>
      </div>

      {analyzeMsg && (
        <p className="mt-2 text-center text-[11px] text-muted">{analyzeMsg}</p>
      )}
      {captureTip && <div className="mt-2">{captureTip}</div>}

      {zoomOpen &&
        previewUrl &&
        portalToBody(
          <PhotoLightbox src={previewUrl} onClose={() => setZoomOpen(false)} />,
        )}
    </div>
  );

  // Phone empty state (no photo yet): a clean prompt with direct add actions.
  const addPhotoPlaceholder = (
    <div className="flex aspect-[4/5] max-h-[46vh] w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface px-6 text-center">
      <ImageIcon size={26} className="text-muted/60" />
      <p className="text-sm text-muted">Add a photo to get started</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
          <Upload size={15} />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        {isNative && (
          <Button variant="outline" onClick={() => void handleTakePhoto()}>
            <Camera size={15} />
            Camera
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted/80">
        Tip: lay the item flat on a plain surface for the cleanest cutout.
      </p>
    </div>
  );

  // Paste-a-link auto-fill — only shown for wishlist / "paste a link" adds.
  const autofillCard = (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-3.5">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent">
        <Sparkles size={13} /> Auto-fill from the web
      </p>
      <div className="flex gap-2">
        <input
          ref={urlInputRef}
          className={`${inputClass} min-w-0 flex-1 bg-surface`}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && productUrl.trim() && !fetching) {
              e.preventDefault();
              void handleFetchDetails();
            }
          }}
          placeholder="Paste a shop link…"
        />
        <button
          type="button"
          onClick={() => void handleFetchDetails()}
          disabled={!productUrl.trim() || fetching}
          aria-label="Fetch details from this link"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity disabled:opacity-40"
        >
          <ArrowRight size={18} className={fetching ? "animate-pulse" : ""} />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Fills name, photo, price &amp; brand — or{" "}
        <button
          type="button"
          onClick={() => void handleFindProduct()}
          disabled={findingProduct || uploading || fetching}
          className="font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-50"
        >
          {findingProduct ? "searching…" : "search the web for this item"}
        </button>
      </p>
      {(fetchMsg || findMsg) && (
        <span className="mt-1.5 block text-[11px] text-muted">
          {fetchMsg || findMsg}
        </span>
      )}
      {productUrl.trim() && (
        <button
          type="button"
          onClick={() => {
            const url = affiliateUrl(productUrl.trim());
            if (url) void openExternalUrl(url);
          }}
          className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent"
        >
          <ExternalLink size={11} />
          {isNative ? "Open product page in Safari" : "Open product page"}
        </button>
      )}
    </div>
  );

  // On phone with a photo, the editorial hero shows the name overlay + category chip,
  // so those move off the rows/standalone-Name field (they stay for desktop + empty state).
  const heroActive = phoneEditor && !!imageUrl;

  // The tappable attribute rows (Acloset-style) — each opens a bottom-sheet picker.
  const rows = (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {!heroActive && (
        <EditRow
          label="Category"
          value={categoryLabel}
          onClick={() => setOpenSheet("category")}
        />
      )}
      <EditRow
        label="Color"
        value={colorName}
        swatch={color}
        onClick={() => setOpenSheet("color")}
      />
      <EditRow
        label="Fit"
        value={fit ? cap(fit) : undefined}
        onClick={() => setOpenSheet("fit")}
      />
      <EditRow
        label="Formality"
        value={formality ? cap(formality) : undefined}
        onClick={() => setOpenSheet("formality")}
      />
      <EditRow
        label="Material"
        value={material ? cap(material) : undefined}
        onClick={() => setOpenSheet("material")}
      />
      <EditRow
        label="Pattern"
        value={pattern ? cap(pattern) : undefined}
        onClick={() => setOpenSheet("pattern")}
      />
      <EditRow
        label="Tone"
        value={tone ? cap(tone) : undefined}
        onClick={() => setOpenSheet("tone")}
      />
      <EditRow
        label="Size"
        value={size.trim() || undefined}
        onClick={() => setOpenSheet("size")}
      />
      <EditRow
        label="Brand"
        value={brand.trim() || undefined}
        onClick={() => setOpenSheet("brand")}
      />
      <EditRow
        label="Price"
        value={price.trim() ? formatMoney(Number(price), currency, 0) : undefined}
        onClick={() => setOpenSheet("price")}
      />
      <EditRow
        label="Season"
        value={seasons.length ? seasons.join(" · ") : undefined}
        onClick={() => setOpenSheet("season")}
      />
      <EditRow
        label="Tags"
        value={tags.length ? tags.join(" · ") : undefined}
        onClick={() => setOpenSheet("tags")}
      />
      <EditRow
        label="Product link"
        value={productUrl.trim() ? productUrl.trim().replace(/^https?:\/\/(www\.)?/, "") : undefined}
        onClick={() => setOpenSheet("link")}
      />
      <EditRow
        label="Notes"
        value={notes.trim() || undefined}
        onClick={() => setOpenSheet("notes")}
        last
      />
    </div>
  );

  // Single-select picker body shared by the formality / pattern / tone sheets.
  const renderChoice = (
    current: string | undefined,
    options: string[],
    set: (v: string | undefined) => void,
  ) => (
    <div className="pb-1">
      <button
        type="button"
        onClick={() => {
          set(undefined);
          setOpenSheet(null);
        }}
        className="flex w-full items-center border-b border-line/60 px-2 py-3 text-left text-[15px]"
      >
        <span className="text-muted">None</span>
        {!current && <Check size={18} className="ml-auto text-accent" />}
      </button>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => {
            set(o);
            setOpenSheet(null);
          }}
          className="flex w-full items-center border-b border-line/60 px-2 py-3 text-left text-[15px] last:border-0"
        >
          <span>{cap(o)}</span>
          {current === o && <Check size={18} className="ml-auto text-accent" />}
        </button>
      ))}
    </div>
  );

  // Body of the currently-open picker sheet.
  const sheetBody = (() => {
    switch (openSheet) {
      case "name":
        return (
          <div className="space-y-3 px-1 pb-1">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Camel Knit Sweater"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setOpenSheet(null);
                }
              }}
            />
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "category":
        return (
          <div className="pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  setCategory(c.value);
                  setOpenSheet(null);
                }}
                className="flex w-full items-center border-b border-line/60 px-2 py-3 text-left text-[15px] last:border-0"
              >
                <span>{c.label}</span>
                {category === c.value && (
                  <Check size={18} className="ml-auto text-accent" />
                )}
              </button>
            ))}
          </div>
        );
      case "fit":
        return (
          <div className="pb-1">
            <button
              type="button"
              onClick={() => {
                setFit(undefined);
                setOpenSheet(null);
              }}
              className="flex w-full items-center border-b border-line/60 px-2 py-3 text-left text-[15px]"
            >
              <span className="text-muted">None</span>
              {!fit && <Check size={18} className="ml-auto text-accent" />}
            </button>
            {FIT_VALUES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFit(f);
                  setOpenSheet(null);
                }}
                className="flex w-full items-center border-b border-line/60 px-2 py-3 text-left text-[15px] last:border-0"
              >
                <span>{cap(f)}</span>
                {fit === f && <Check size={18} className="ml-auto text-accent" />}
              </button>
            ))}
          </div>
        );
      case "formality":
        return renderChoice(formality, FORMALITY_OPTIONS, setFormality);
      case "pattern":
        return renderChoice(pattern, PATTERN_OPTIONS, setPattern);
      case "tone":
        return renderChoice(tone, TONE_OPTIONS, setTone);
      case "material":
        return (
          <div className="space-y-3 px-1 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {MATERIAL_OPTIONS.map((m) => (
                <Chip
                  key={m}
                  active={material === m}
                  onClick={() => setMaterial(material === m ? undefined : m)}
                >
                  {cap(m)}
                </Chip>
              ))}
            </div>
            <input
              className={inputClass}
              value={material ?? ""}
              onChange={(e) => setMaterial(e.target.value || undefined)}
              placeholder="Or type a fabric…"
            />
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "size":
        return (
          <div className="space-y-3 px-1 pb-1">
            <input
              className={inputClass}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="e.g. M, 32, 10"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setOpenSheet(null);
                }
              }}
            />
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "link":
        return (
          <div className="space-y-3 px-1 pb-1">
            <input
              className={inputClass}
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="Paste a shop link…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setOpenSheet(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                setOpenSheet(null);
                void handleFindProduct();
              }}
              disabled={findingProduct || uploading || fetching}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-accent disabled:opacity-50"
            >
              <Sparkles size={13} />
              {findingProduct ? "Searching…" : "Search the web for this item"}
            </button>
            {productUrl.trim() && (
              <button
                type="button"
                onClick={() => {
                  const url = affiliateUrl(productUrl.trim());
                  if (url) void openExternalUrl(url);
                }}
                className="flex items-center gap-1.5 text-[11px] font-medium text-accent"
              >
                <ExternalLink size={11} />
                {isNative ? "Open product page in Safari" : "Open product page"}
              </button>
            )}
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "color":
        return (
          <div className="space-y-3 px-1 pb-1">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-12 w-16 cursor-pointer rounded-lg border border-line bg-transparent p-1"
              />
              <span className="text-sm text-muted">{colorName}</span>
              <Button
                variant="outline"
                onClick={handleExtract}
                disabled={!imageUrl || extracting}
                title="Pick the dominant color from the photo"
                className="ml-auto !px-3 !py-2 text-xs"
              >
                <Pipette size={13} />
                {extracting ? "…" : "From photo"}
              </Button>
            </div>
            {extractError && (
              <span className="block text-xs text-amber-600">{extractError}</span>
            )}
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "brand":
        return (
          <div className="space-y-3 px-1 pb-1">
            <BrandPicker value={brand} onChange={setBrand} />
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "price":
        return (
          <div className="space-y-3 px-1 pb-1">
            <input
              className={inputClass}
              type="number"
              min="0"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="49"
            />
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "season":
        return (
          <div className="space-y-3 px-1 pb-1">
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
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      case "tags":
        return (
          <div className="space-y-3 px-1 pb-1">
            <div className="flex flex-wrap gap-1.5">
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
              placeholder="Add custom tag, press Enter"
            />
            <Button
              onClick={() => {
                commitTagInput();
                setOpenSheet(null);
              }}
              className="w-full"
            >
              Done
            </Button>
          </div>
        );
      case "notes":
        return (
          <div className="space-y-3 px-1 pb-1">
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fit notes, care instructions…"
            />
            <Button onClick={() => setOpenSheet(null)} className="w-full">
              Done
            </Button>
          </div>
        );
      default:
        return null;
    }
  })();

  const form = (
    <>
      {/* Shared hidden file input — triggered by the photo menu, the empty-state
          buttons, and the "+ → library" intent, on every layout. */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <div className="mx-auto max-w-md space-y-5">
        {phoneEditor
          ? imageUrl
            ? editorialHero
            : addPhotoPlaceholder
          : photoBlock}

        {showAutofill && autofillCard}

        {!heroActive && (
          <Field label="Name">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Camel Knit Sweater"
            />
          </Field>
        )}

        {rows}

        {/* Wishlist toggle — a clean switch row instead of a bare checkbox. */}
        <button
          type="button"
          role="switch"
          aria-checked={wishlist}
          onClick={() => setWishlist(!wishlist)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left"
        >
          <span className="text-sm text-foreground">
            I don&apos;t own this yet
          </span>
          <span
            className={`ml-auto flex h-[26px] w-[44px] items-center rounded-full p-0.5 transition-colors ${
              wishlist ? "bg-accent" : "border border-line bg-surface-2"
            }`}
          >
            <span
              className={`h-[21px] w-[21px] rounded-full bg-white shadow transition-transform ${
                wishlist ? "translate-x-[18px]" : ""
              }`}
            />
          </span>
        </button>

        {wishlist && (
          <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <Sparkles size={13} /> Smart Buy
            </p>
            {imageUrl ? (
              <SmartBuy item={candidate} />
            ) : (
              <p className="text-sm text-muted">
                Add a photo to check how this piece fits your closet.
              </p>
            )}
          </div>
        )}
      </div>

      <RowSheet
        open={!!openSheet}
        title={openSheet ? SHEET_TITLES[openSheet] : ""}
        onClose={() => setOpenSheet(null)}
      >
        {sheetBody}
      </RowSheet>

      {findCandidates !== null && (
        <FindProductSheet
          candidates={findCandidates}
          message={findMessage}
          onPick={handlePickCandidate}
          onClose={() => setFindCandidates(null)}
        />
      )}

      {beautifyCompare &&
        portalToBody(
          <BeautifyCompare
            before={beautifyCompare.before}
            after={beautifyCompare.after}
            onKeep={keepBeautify}
            onDiscard={discardBeautify}
          />,
        )}
    </>
  );

  // Save / Cancel / Delete — pinned in a footer on phone, inline under the form on desktop.
  const actions = (
    <div className="flex items-center gap-2">
      {initial && (
        <Button variant="danger" onClick={handleDelete}>
          <Trash2 size={15} />
          {confirmDelete ? "Confirm delete" : "Delete"}
        </Button>
      )}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!canSave}>
          {initial ? "Save changes" : "Add to wardrobe"}
        </Button>
      </div>
    </div>
  );

  // Phone + Capacitor: full-page editor portaled to <body> so iOS WebKit
  // doesn't trap position:fixed inside .native-shell { overflow:hidden }
  // (that bug felt like flipping off the mobile layout — AJA-33 / clipper).
  if (phoneEditor) {
    return portalToBody(
      <NativeItemPage title={title} onClose={onClose} footer={actions}>
        {form}
      </NativeItemPage>,
    );
  }

  return portalToBody(
    <Modal title={title} onClose={onClose} wide>
      {form}
      <div className="mt-5">{actions}</div>
    </Modal>,
  );
}

/** One tappable attribute row: label on the left, current value + chevron on the right. */
function EditRow({
  label,
  value,
  swatch,
  onClick,
  last,
}: {
  label: string;
  value?: string;
  swatch?: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 ${
        last ? "" : "border-b border-line/70"
      }`}
    >
      <span className="shrink-0 text-sm text-foreground">{label}</span>
      <span className="ml-auto flex min-w-0 items-center gap-2 text-sm">
        {swatch && (
          <span
            className="h-4 w-4 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: swatch }}
          />
        )}
        <span className={`truncate ${value ? "text-muted" : "text-muted/50"}`}>
          {value ?? "Add"}
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted/40" />
      </span>
    </button>
  );
}

/** Bottom-sheet picker opened from a row (reuses the native sheet chrome). */
function RowSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      {children}
    </BottomSheet>
  );
}

function NativeItemPage({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
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
      {footer && <div className="native-item-page-footer">{footer}</div>}
    </div>
  );
}

/** Row in the "Edit photo" dropdown (mirrors ProfileMenu's MenuItem). */
function PhotoMenuItem({
  icon: Icon,
  children,
  onClick,
  accent,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 ${
        accent ? "font-medium text-accent" : "text-foreground"
      }`}
    >
      <Icon size={16} strokeWidth={1.75} className={accent ? "" : "text-muted"} />
      {children}
    </button>
  );
}
