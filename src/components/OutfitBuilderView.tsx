"use client";

import {
  Download,
  Link2,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toPng } from "html-to-image";
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { scorePair } from "@/lib/color";
import { generateOutfit, outfitScore } from "@/lib/matching";
import { draftItemIds, useWardrobe } from "@/lib/store";
import type { Season, SlotKey, WardrobeItem } from "@/lib/types";
import { SEASONS, SLOT_CONFIG, SUGGESTED_TAGS } from "@/lib/types";
import { filterItems } from "./WardrobeView";
import { ItemCard } from "./ItemCard";
import { OutfitPreview } from "./OutfitPreview";
import { Button, Chip, EmptyState, Field, MatchBadge, Modal, inputClass } from "./ui";

/** Copy text to the clipboard, falling back to execCommand on HTTP/denied. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function OutfitBuilderView() {
  const {
    items,
    draft,
    filters,
    setFilters,
    addToDraft,
    removeFromDraft,
    clearDraft,
    setDraft,
    saveOutfit,
  } = useWardrobe();

  const previewRef = useRef<HTMLDivElement>(null);
  const [vibe, setVibe] = useState<string>("casual");
  const [genSeason, setGenSeason] = useState<Season | "all">("all");
  const [anchorId, setAnchorId] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [exporting, setExporting] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  const buildable = useMemo(() => items, [items]);
  const filtered = useMemo(
    () => filterItems(buildable, filters),
    [buildable, filters],
  );

  const draftItems = useMemo(() => {
    const ids = draftItemIds(draft);
    return ids
      .map((id) => buildable.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];
  }, [draft, buildable]);

  const overallScore = draftItems.length >= 2 ? outfitScore(draftItems) : null;

  /** How well each candidate pairs with what's already in the draft. */
  const matchScoreFor = useCallback(
    (item: WardrobeItem) => {
      if (draftItems.length === 0) return undefined;
      const scores = draftItems
        .filter((d) => d.id !== item.id)
        .map((d) => scorePair(d.color, item.color).score);
      return scores.length ? Math.min(...scores) : undefined;
    },
    [draftItems],
  );

  const handleDrop = (slot: SlotKey, itemId: string) => {
    addToDraft(itemId);
  };

  const handleGenerate = () => {
    const anchor = anchorId
      ? buildable.find((it) => it.id === anchorId)
      : undefined;
    const next = generateOutfit(buildable, {
      anchor,
      vibe: vibe || undefined,
      season: genSeason,
    });
    setDraft(next);
  };

  const handleExport = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(previewRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `outfit-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    const ids = draftItemIds(draft);
    if (ids.length === 0) return;
    const payload = btoa(JSON.stringify(ids));
    const url = `${window.location.origin}${window.location.pathname}?outfit=${payload}`;
    const ok = await copyText(url);
    setShareMsg(ok ? "Link copied!" : "Couldn't copy — try again.");
    setTimeout(() => setShareMsg(""), ok ? 2500 : 3500);
  };

  const confirmSave = () => {
    const ids = draftItemIds(draft);
    if (!saveName.trim() || ids.length === 0) return;
    saveOutfit(saveName.trim(), saveNotes.trim(), ids);
    setSaveOpen(false);
    setSaveName("");
    setSaveNotes("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Live preview + actions */}
        <div className="w-full shrink-0 space-y-4 lg:sticky lg:top-24 lg:w-[340px]">
          <div className="flex items-center justify-between">
            <h2 className="heading text-xl">Live preview</h2>
            {overallScore !== null && <MatchBadge score={overallScore} />}
          </div>

          <OutfitPreview ref={previewRef} items={draftItems} />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setSaveOpen(true)}
              disabled={draftItems.length === 0}
            >
              <Save size={14} /> Save
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={draftItems.length === 0 || exporting}
            >
              <Download size={14} />
              {exporting ? "Exporting…" : "Export PNG"}
            </Button>
            <Button
              variant="outline"
              onClick={handleShare}
              disabled={draftItems.length === 0}
            >
              <Link2 size={14} /> {shareMsg || "Share link"}
            </Button>
            <Button variant="ghost" onClick={clearDraft}>
              <Trash2 size={14} /> Clear
            </Button>
          </div>

          {/* Generate controls */}
          <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
            <h3 className="text-sm font-semibold">Generate outfit</h3>
            <Field label="Vibe">
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_TAGS.slice(0, 6).map((t) => (
                  <Chip key={t} active={vibe === t} onClick={() => setVibe(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Season">
              <select
                className={inputClass}
                value={genSeason}
                onChange={(e) =>
                  setGenSeason(e.target.value as Season | "all")
                }
              >
                <option value="all">Any season</option>
                {SEASONS.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anchor piece (optional)">
              <select
                className={inputClass}
                value={anchorId}
                onChange={(e) => setAnchorId(e.target.value)}
              >
                <option value="">None — surprise me</option>
                {buildable.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                    {it.wishlist ? " (wishlist)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Button onClick={handleGenerate} className="w-full">
              <RefreshCw size={14} /> Generate outfit
            </Button>
          </div>
        </div>

        {/* Builder slots + item picker */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Sticky drop zones — always reachable while scrolling items below */}
          <div className="sticky top-[4.5rem] z-20 -mx-4 space-y-3 border-b border-line bg-background/95 px-4 py-4 backdrop-blur-md sm:top-20 sm:-mx-0 sm:rounded-2xl sm:border sm:border-line sm:px-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Drop into outfit slots
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SLOT_CONFIG.map((slot) => (
                <SlotDropZone
                  key={slot.key}
                  slot={slot.key}
                  label={slot.label}
                  max={slot.max}
                  itemIds={draft[slot.key]}
                  items={buildable}
                  onDrop={handleDrop}
                  onRemove={(id) => removeFromDraft(slot.key, id)}
                />
              ))}
            </div>
          </div>

          {/* Item grid */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="heading text-lg">Your pieces</h3>
                <p className="text-xs text-muted">
                  Wardrobe + wishlist — plan outfits with items you own or want
                </p>
              </div>
              <input
                className={`${inputClass} !w-auto max-w-[200px]`}
                placeholder="Filter…"
                value={filters.search}
                onChange={(e) => setFilters({ search: e.target.value })}
              />
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="No items to add"
                subtitle="Add clothing to your wardrobe first, then come back to build outfits."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    compact
                    matchScore={matchScoreFor(item)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Harmony legend */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-2.5 text-xs text-muted">
            <span className="font-semibold text-foreground">Color harmony:</span>
            <MatchBadge score={85} label="Great match" />
            <MatchBadge score={55} label="Okay match" />
            <MatchBadge score={30} label="May clash" />
            <span className="text-muted">— shown on item cards vs current draft</span>
          </div>
        </div>
      </div>

      {saveOpen && (
        <Modal title="Save outfit" onClose={() => setSaveOpen(false)}>
          <div className="space-y-4">
            <Field label="Outfit name">
              <input
                className={inputClass}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Weekend brunch look"
                autoFocus
              />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="Where you'd wear this, styling tips…"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmSave}
                disabled={!saveName.trim() || draftItems.length === 0}
              >
                Save outfit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SlotDropZone({
  slot,
  label,
  max,
  itemIds,
  items,
  onDrop,
  onRemove,
}: {
  slot: SlotKey;
  label: string;
  max: number;
  itemIds: string[];
  items: WardrobeItem[];
  onDrop: (slot: SlotKey, itemId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const enterDepth = useRef(0);
  const placed = itemIds
    .map((id) => items.find((it) => it.id === id))
    .filter(Boolean) as WardrobeItem[];

  const allowDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const handleEnter = (e: DragEvent) => {
    allowDrop(e);
    enterDepth.current += 1;
    setOver(true);
  };

  const handleLeave = () => {
    enterDepth.current -= 1;
    if (enterDepth.current <= 0) {
      enterDepth.current = 0;
      setOver(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    enterDepth.current = 0;
    setOver(false);
    const id =
      e.dataTransfer.getData("text/item-id") ||
      e.dataTransfer.getData("text/plain");
    if (id) onDrop(slot, id);
  };

  return (
    <div
      onDragEnter={handleEnter}
      onDragOver={allowDrop}
      onDragLeave={handleLeave}
      onDrop={handleDrop}
      className={`min-h-[100px] rounded-2xl border-2 border-dashed p-3 transition-colors ${
        over
          ? "border-accent bg-accent-soft/40"
          : "border-line bg-surface-2/30"
      }`}
    >
      <div className="pointer-events-none mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        <span className="text-[10px] text-muted">
          {placed.length}/{max}
        </span>
      </div>

      {placed.length === 0 ? (
        <p className="pointer-events-none py-4 text-center text-xs text-muted">
          Drag or click + on an item
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {placed.map((item) => (
            <div
              key={item.id}
              className="group relative h-16 w-12 overflow-hidden rounded-lg border border-line bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.name}
                draggable={false}
                className="pointer-events-none h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Remove ${item.name}`}
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
