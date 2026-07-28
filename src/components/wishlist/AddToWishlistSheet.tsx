"use client";

import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Link2,
  Loader2,
  Pencil,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { guessCategory } from "@/lib/import-item";
import { getSupabase } from "@/lib/supabase/client";
import { dataUrlToFile, resolveImageSource } from "@/lib/supabase/storage";
import { useWardrobe } from "@/lib/store";
import { BottomSheet } from "../BottomSheet";
import { Button, Field, inputClass } from "../ui";
import { extractDominantColor, nameColor, toneToHex } from "@/lib/color";
import { parseColor } from "@/lib/shop-category";

type Panel = "choose" | "link" | "fetching" | "confirm";

/**
 * Wishlist-first add flow (AJA-203). A bottom sheet framed by "How did you spot
 * it?" with three link-first paths, then a slim confirm — instead of dropping into
 * the full closet item form. The link path reuses /api/extract (same engine as the
 * share-to-app clip). Opened by the "+" on the wishlist view + the in-page button.
 */
export function AddToWishlistSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Body gated on `open` so each open starts fresh on the "choose" panel; the
  // BottomSheet latch keeps it visible through the slide-down exit.
  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Add to wishlist">
      {open && <AddToWishlistBody onClose={onClose} />}
    </BottomSheet>
  );
}

function AddToWishlistBody({ onClose }: { onClose: () => void }) {
  const addItem = useWardrobe((s) => s.addItem);
  const authUser = useWardrobe((s) => s.authUser);

  const [panel, setPanel] = useState<Panel>("choose");
  const [link, setLink] = useState("");
  const [fetchMsg, setFetchMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const resetDraft = () => {
    setName("");
    setBrand("");
    setPrice("");
    setProductUrl("");
    setImageFile(null);
    setImageSrc("");
    setFetchMsg("");
  };

  const openManual = () => {
    resetDraft();
    setPanel("confirm");
  };

  const onPhoto = (file?: File | null) => {
    if (!file) return;
    resetDraft();
    setImageFile(file);
    setImageSrc(URL.createObjectURL(file));
    setPanel("confirm");
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setLink(t.trim());
    } catch {
      /* clipboard blocked — user can type/paste into the field */
    }
  };

  const fetchDetails = async () => {
    const url = link.trim();
    if (!url) return;
    resetDraft();
    setProductUrl(url);
    setPanel("fetching");
    try {
      const token = (await getSupabase()?.auth.getSession())?.data?.session?.access_token;
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        brand?: string;
        price?: number | string;
        imageData?: string;
        imageUrl?: string;
        error?: string;
      };
      if (res.ok) {
        if (typeof data.name === "string") setName(data.name.trim());
        if (typeof data.brand === "string") setBrand(data.brand.trim());
        const p =
          typeof data.price === "number"
            ? data.price
            : typeof data.price === "string"
              ? Number(data.price.replace(/,/g, ""))
              : NaN;
        if (Number.isFinite(p) && p > 0) setPrice(String(p));
        if (data.imageData) {
          setImageFile(dataUrlToFile(data.imageData));
          setImageSrc(data.imageData);
        } else if (typeof data.imageUrl === "string" && data.imageUrl) {
          setImageSrc(data.imageUrl);
        }
      } else {
        setFetchMsg(data.error || "Couldn't read that link — add the details below.");
      }
    } catch {
      setFetchMsg("Couldn't reach that link — add the details below.");
    } finally {
      setPanel("confirm");
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let hosted = imageSrc;
      if (imageFile) {
        try {
          hosted = await resolveImageSource(imageFile, authUser?.id ?? null);
        } catch {
          /* keep the preview src as a fallback */
        }
      }
      // A real colour, so the duplicate check can actually fire (AJA-243). Read from
      // the LOCAL preview rather than the hosted URL — a blob/data URL is same-origin,
      // so the canvas isn't tainted and this can't fail on CORS.
      let color: string | null = toneToHex(parseColor(`${brand} ${name}`));
      if (!color && imageSrc) {
        try {
          color = await extractDominantColor(imageSrc);
        } catch {
          /* unreadable image — leave it unknown rather than guess */
        }
      }
      addItem({
        name: name.trim() || "Wishlist item",
        imageUrl: hosted || "",
        productUrl: productUrl.trim() || undefined,
        category: guessCategory(name),
        color: color || "#a8a29e",
        colorName: color ? nameColor(color) : undefined,
        tags: [],
        seasons: [],
        brand: brand.trim() || undefined,
        price: price.trim() ? Number(price) : undefined,
        wishlist: true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onPhoto(e.target.files?.[0])}
      />

      {panel === "choose" && (
          <div className="animate-fade-up">
            <h2 className="heading text-xl">Add to wishlist</h2>
            <p className="mt-0.5 text-sm text-muted">How did you spot it?</p>
            <div className="mt-4 space-y-2.5">
              <OptionRow
                primary
                icon={Link2}
                title="Paste a link"
                sub="From any shop — we grab the photo & price for you"
                onClick={() => setPanel("link")}
              />
              <OptionRow
                icon={Camera}
                title="Add a photo"
                sub="A screenshot or a snap from a store"
                onClick={() => fileRef.current?.click()}
              />
              <OptionRow
                icon={Pencil}
                title="Enter it manually"
                sub="Type the name, brand and price"
                onClick={openManual}
              />
            </div>
            <div className="mt-3 flex gap-2.5 rounded-xl bg-surface-2 p-3">
              <Share2 size={17} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-medium text-foreground">Fastest way:</span> in any
                shop or Safari, tap Share → Wardrobe and it lands here.
              </p>
            </div>
          </div>
        )}

        {panel === "link" && (
          <div className="animate-fade-up">
            <BackRow onClick={() => setPanel("choose")} />
            <h2 className="heading text-xl">Paste the link</h2>
            <p className="mt-0.5 text-sm text-muted">
              Copy a product link from any shop, then paste it here.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                className={inputClass}
                value={link}
                autoFocus
                inputMode="url"
                placeholder="https://…"
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && link.trim() && void fetchDetails()}
              />
              <button
                type="button"
                onClick={() => void paste()}
                className="shrink-0 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium"
              >
                Paste
              </button>
            </div>
            <Button
              className="mt-4 w-full"
              disabled={!link.trim()}
              onClick={() => void fetchDetails()}
            >
              Get details
            </Button>
          </div>
        )}

        {panel === "fetching" && (
          <div className="flex flex-col items-center gap-3 py-10 text-muted">
            <Loader2 size={30} className="animate-spin text-accent" />
            <span className="text-sm">Reading the page…</span>
          </div>
        )}

        {panel === "confirm" && (
          <div className="animate-fade-up">
            <BackRow onClick={() => setPanel("choose")} />
            <h2 className="heading text-xl">Add to wishlist</h2>
            {fetchMsg && (
              <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                {fetchMsg}
              </p>
            )}
            {imageSrc && (
              <div className="mt-3 flex gap-3 rounded-2xl bg-surface-2 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt=""
                  className="h-24 w-20 shrink-0 rounded-xl object-cover"
                />
                <p className="self-center text-sm text-muted">
                  Looks good? Tweak anything below, then save.
                </p>
              </div>
            )}
            <Field label="Name">
              <input
                className={inputClass}
                value={name}
                autoFocus={!imageSrc && !name}
                placeholder="What is it?"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Brand">
                <input
                  className={inputClass}
                  value={brand}
                  placeholder="Optional"
                  onChange={(e) => setBrand(e.target.value)}
                />
              </Field>
              <Field label="Price">
                <input
                  className={inputClass}
                  value={price}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Link (optional)">
                <input
                  className={inputClass}
                  value={productUrl}
                  inputMode="url"
                  placeholder="https://…"
                  onChange={(e) => setProductUrl(e.target.value)}
                />
              </Field>
            </div>
            <Button className="mt-5 w-full" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save to wishlist"}
            </Button>
            <Button variant="ghost" className="mt-1 w-full" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
    </>
  );
}

function OptionRow({
  icon: Icon,
  title,
  sub,
  onClick,
  primary,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-colors ${
        primary
          ? "border-accent/30 bg-accent-soft"
          : "border-line bg-surface hover:bg-surface-2"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-accent ${
          primary ? "bg-surface" : "bg-accent-soft"
        }`}
      >
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted/60" />
    </button>
  );
}

function BackRow({ onClick }: { onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex items-center gap-1 pb-2 text-sm text-muted"
    >
      <ChevronLeft size={18} /> Back
    </button>
  );
}
