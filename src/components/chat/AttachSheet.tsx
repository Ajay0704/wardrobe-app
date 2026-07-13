"use client";

import { ChevronLeft, Image as ImageIcon, LayoutGrid, Shirt, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { itemPayload, outfitPayload, type ChatKind, type ChatPayload } from "@/lib/chat";
import { useWardrobe } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";

type Mode = "menu" | "outfit" | "item";

/** In-thread attach: send a photo, a saved outfit, or a closet item. Builds a
 *  self-contained payload and hands it back to the thread to send. */
export function AttachSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (kind: ChatKind, payload: ChatPayload) => void;
}) {
  const outfits = useWardrobe((s) => s.outfits);
  const items = useWardrobe((s) => s.items);
  const authUser = useWardrobe((s) => s.authUser);
  const [mode, setMode] = useState<Mode>("menu");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const owned = useMemo(() => items.filter((it) => !it.wishlist && it.imageUrl), [items]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const imageUrl = await resolveImageSource(file, authUser?.id ?? null);
      onPick("image", { imageUrl });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't attach that photo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet flex max-h-[80vh] flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Attach"
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {mode !== "menu" && (
              <button type="button" onClick={() => setMode("menu")} aria-label="Back" className="p-1 text-muted">
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="heading text-lg">
              {mode === "menu" ? "Share" : mode === "outfit" ? "Pick an outfit" : "Pick an item"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        {mode === "menu" && (
          <div className="space-y-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Row icon={ImageIcon} label={uploading ? "Uploading…" : "Photo"} onClick={() => fileRef.current?.click()} />
            <Row icon={LayoutGrid} label="Saved outfit" onClick={() => setMode("outfit")} />
            <Row icon={Shirt} label="Closet item" onClick={() => setMode("item")} />
          </div>
        )}

        {mode === "outfit" && (
          <div className="min-h-24 flex-1 overflow-y-auto">
            {outfits.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">No saved outfits yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {outfits.map((o) => {
                  const pieces = o.itemIds
                    .map((id) => items.find((i) => i.id === id))
                    .filter(Boolean)
                    .slice(0, 4);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onPick("outfit", outfitPayload(o, items))}
                      className="text-left"
                    >
                      <div className="grid aspect-square grid-cols-2 gap-px overflow-hidden rounded-lg bg-line">
                        {pieces.map((p, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={p!.imageUrl} alt="" className="h-full w-full bg-surface-2 object-cover" />
                        ))}
                      </div>
                      <p className="mt-1 truncate text-[11px]">{o.name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mode === "item" && (
          <div className="min-h-24 flex-1 overflow-y-auto">
            {owned.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Your closet is empty.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {owned.map((it) => (
                  <button key={it.id} type="button" onClick={() => onPick("item", itemPayload(it))} className="text-left">
                    <div className="aspect-square overflow-hidden rounded-lg bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                    </div>
                    <p className="mt-1 truncate text-[11px]">{it.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Shirt;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-sm hover:bg-surface-2"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent">
        <Icon size={18} />
      </span>
      {label}
    </button>
  );
}
