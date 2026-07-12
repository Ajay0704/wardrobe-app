"use client";

import {
  Bookmark,
  Heart,
  RefreshCw,
  Shirt,
  ShoppingBag,
  Sparkles,
  User,
  Wand2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildClosetLooks,
  closetMatch,
  composeFeed,
  recreateDraft,
  type ExplorePin,
} from "@/lib/explore";
import { primaryStyleVibe } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";

const CHIPS = ["All", "minimal", "streetwear", "casual", "work", "summer", "formal", "cozy"];

/**
 * Explore — a fashion discovery feed ("Pinterest, but every pin knows your
 * closet"). Prototype content: AI-recombined looks from your closet + a seeded
 * inspiration catalogue. Tap a pin to see closet-match, recreate, shop, save.
 */
export function ExploreView() {
  const isNative = useIsNativeApp();
  const { items, profile, setView, setDraft, savedPinIds, toggleSavePin, saveOutfit } =
    useWardrobe();
  const [seed, setSeed] = useState(0);
  const [tab, setTab] = useState<"foryou" | "saved">("foryou");
  const [chip, setChip] = useState("All");
  const [openPin, setOpenPin] = useState<ExplorePin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1900);
  };

  const vibe = primaryStyleVibe(profile);
  const closetLooks = useMemo(
    () => buildClosetLooks(items, vibe, seed, 6),
    [items, vibe, seed],
  );
  const feed = useMemo(() => composeFeed(closetLooks, seed), [closetLooks, seed]);
  const shown = useMemo(() => {
    let list = tab === "saved" ? feed.filter((p) => savedPinIds.includes(p.id)) : feed;
    if (chip !== "All") list = list.filter((p) => p.tags.includes(chip));
    return list;
  }, [feed, tab, chip, savedPinIds]);

  const recreate = (pin: ExplorePin) => {
    setDraft(recreateDraft(pin, items));
    setOpenPin(null);
    setView("builder");
  };

  return (
    <div className="space-y-4">
      {!isNative && <h2 className="heading text-2xl">Explore</h2>}

      {/* Tabs */}
      <div className="flex items-center gap-5 border-b border-line text-sm">
        {(
          [
            ["foryou", "For you"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
              tab === id ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => flash("Following feed — coming soon")}
          className="-mb-px border-b-2 border-transparent pb-2 font-medium text-muted"
        >
          Following
        </button>
      </div>

      {/* Category chips */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${
              chip === c
                ? "bg-foreground text-background"
                : "border border-line text-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Masonry feed */}
      {shown.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          {tab === "saved"
            ? "No saved looks yet — tap the bookmark on any pin."
            : "No looks here yet. Add a few closet items to get personalized fits."}
        </div>
      ) : (
        <div style={{ columnCount: 2, columnGap: "12px" }}>
          {shown.map((pin) => (
            <PinCard
              key={pin.id}
              pin={pin}
              items={items}
              saved={savedPinIds.includes(pin.id)}
              onOpen={() => setOpenPin(pin)}
              onSave={() => toggleSavePin(pin.id)}
            />
          ))}
        </div>
      )}

      {tab === "foryou" && shown.length > 0 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setSeed((n) => n + 1)}
            className="flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium"
          >
            <RefreshCw size={15} /> Shuffle looks
          </button>
        </div>
      )}

      {openPin && (
        <PinSheet
          pin={openPin}
          items={items}
          saved={savedPinIds.includes(openPin.id)}
          onClose={() => setOpenPin(null)}
          onSave={() => toggleSavePin(openPin.id)}
          onRecreate={() => recreate(openPin)}
          onShop={(n) => flash(`Shopping ${n} piece${n === 1 ? "" : "s"} — affiliate links coming soon`)}
          onTryOn={() => {
            setOpenPin(null);
            setView("builder");
          }}
          onSaveOutfit={() => {
            if (openPin.itemIds) {
              saveOutfit(openPin.title, "", openPin.itemIds);
              flash("Saved to Outfits");
            }
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- pin card */

function PinCard({
  pin,
  items,
  saved,
  onOpen,
  onSave,
}: {
  pin: ExplorePin;
  items: WardrobeItem[];
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const match = closetMatch(pin, items);
  return (
    <div className="mb-3 break-inside-avoid">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div
          className="relative overflow-hidden rounded-2xl bg-surface-2"
          style={{ aspectRatio: String(1 / pin.ratio) }}
        >
          {pin.kind === "closet" ? (
            <ClosetCollage pin={pin} items={items} />
          ) : (
            <PinImage src={pin.imageUrl} tint={pin.tint} />
          )}
          <span
            role="button"
            aria-label={saved ? "Unsave" : "Save"}
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90"
          >
            <Heart
              size={16}
              className={saved ? "fill-accent text-accent" : "text-foreground"}
            />
          </span>
          {pin.kind === "closet" ? (
            <span className="absolute bottom-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-foreground">
              <Sparkles size={10} className="mr-1 inline" /> your closet
            </span>
          ) : match.total > 0 && match.owned > 0 ? (
            <span className="absolute bottom-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              {match.owned}/{match.total} owned
            </span>
          ) : null}
        </div>
      </button>
      <div className="px-1 pt-1.5">
        <p className="truncate text-sm">{pin.title}</p>
        <p className="text-xs text-muted">
          {pin.author} · {formatSaves(pin.saves)}
        </p>
      </div>
    </div>
  );
}

function PinImage({ src, tint }: { src?: string; tint: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: tint }}>
        <Shirt size={30} style={{ color: "rgba(255,255,255,0.85)" }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setErr(true)}
      className="h-full w-full object-cover"
    />
  );
}

function ClosetCollage({ pin, items }: { pin: ExplorePin; items: WardrobeItem[] }) {
  const looks = (pin.itemIds ?? [])
    .map((id) => items.find((it) => it.id === id))
    .filter(Boolean) as WardrobeItem[];
  const cells = looks.slice(0, 4);
  return (
    <div className="grid h-full w-full grid-cols-2 gap-0.5 bg-surface">
      {cells.map((it) => (
        <div key={it.id} className="overflow-hidden bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
        </div>
      ))}
      {Array.from({ length: Math.max(0, 4 - cells.length) }).map((_, i) => (
        <div key={i} className="bg-surface-2" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- pin sheet */

function PinSheet({
  pin,
  items,
  saved,
  onClose,
  onSave,
  onRecreate,
  onShop,
  onTryOn,
  onSaveOutfit,
}: {
  pin: ExplorePin;
  items: WardrobeItem[];
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onRecreate: () => void;
  onShop: (missing: number) => void;
  onTryOn: () => void;
  onSaveOutfit: () => void;
}) {
  const match = closetMatch(pin, items);
  const pct = match.total ? Math.round((match.owned / match.total) * 100) : 0;
  const missing = Math.max(0, match.total - match.owned);
  const isCloset = pin.kind === "closet";

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={pin.title}
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">{isCloset ? "Your look" : "Look"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface-2" style={{ aspectRatio: "1 / 1.1" }}>
          {isCloset ? (
            <ClosetCollage pin={pin} items={items} />
          ) : (
            <PinImage src={pin.imageUrl} tint={pin.tint} />
          )}
        </div>

        <p className="mt-3 font-medium">{pin.title}</p>
        <p className="text-sm text-muted">
          {pin.author} · {formatSaves(pin.saves)}
        </p>

        {/* Closet match */}
        <div className="mt-3 rounded-2xl bg-surface-2 p-3">
          {isCloset ? (
            <p className="text-sm">
              <Sparkles size={14} className="mr-1 inline text-accent" />
              Built from your closet · {match.total} pieces
            </p>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted">You own {match.owned} of {match.total} pieces</span>
                <span className="text-accent">{pct}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={onRecreate}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 font-medium text-accent-foreground"
        >
          <Wand2 size={17} /> {isCloset ? "Open in builder" : "Recreate from my closet"}
        </button>
        <div className="mt-2 flex gap-2">
          {isCloset ? (
            <ActionBtn icon={Bookmark} label="Save to Outfits" onClick={onSaveOutfit} />
          ) : (
            <ActionBtn
              icon={ShoppingBag}
              label={missing > 0 ? `Shop ${missing}` : "Shop"}
              onClick={() => onShop(missing || match.total)}
            />
          )}
          <ActionBtn icon={User} label="Try on" onClick={onTryOn} />
          <ActionBtn
            icon={Heart}
            label={saved ? "Saved" : "Save"}
            active={saved}
            onClick={onSave}
          />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Heart;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border border-line py-2.5 text-xs ${
        active ? "text-accent" : "text-foreground"
      }`}
    >
      <Icon size={18} className={active ? "fill-accent text-accent" : ""} />
      {label}
    </button>
  );
}

function formatSaves(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k saves`;
  return `${n} saves`;
}
