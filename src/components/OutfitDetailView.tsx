"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  Copy,
  Pencil,
  ScanFace,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { outfitPayload } from "@/lib/chat";
import { wearSummary } from "@/lib/outfit-collections";
import { useWardrobe } from "@/lib/store";
import { toGarments } from "@/lib/tryon";
import { formatDisplayDate, type WardrobeItem } from "@/lib/types";
import { OutfitBoardThumb } from "./OutfitBoardThumb";
import { ShareToChatSheet } from "./chat/ShareToChatSheet";
import { TryOnView } from "./explore/TryOnView";

/**
 * Outfit detail (AJA-239). Tapping a look used to do nothing — the board, the notes field and
 * the per-outfit wear history in `calendar` all existed but were never shown, and lifecycle
 * actions (rename, duplicate, favourite, plan) didn't exist at all. This is that screen.
 */
export function OutfitDetailView() {
  const outfits = useWardrobe((s) => s.outfits);
  const items = useWardrobe((s) => s.items);
  const calendar = useWardrobe((s) => s.calendar);
  const selectedOutfitId = useWardrobe((s) => s.selectedOutfitId);
  const setView = useWardrobe((s) => s.setView);
  const logWear = useWardrobe((s) => s.logWear);
  const deleteOutfit = useWardrobe((s) => s.deleteOutfit);
  const renameOutfit = useWardrobe((s) => s.renameOutfit);
  const duplicateOutfit = useWardrobe((s) => s.duplicateOutfit);
  const toggleOutfitFavorite = useWardrobe((s) => s.toggleOutfitFavorite);
  const loadOutfitBoardIntoCanvas = useWardrobe((s) => s.loadOutfitBoardIntoCanvas);
  const openOutfitDetail = useWardrobe((s) => s.openOutfitDetail);

  const outfit = outfits.find((o) => o.id === selectedOutfitId) ?? null;
  const [share, setShare] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tryOn, setTryOn] = useState(false);

  const pieces = useMemo(
    () =>
      (outfit?.itemIds ?? [])
        .map((id) => items.find((it) => it.id === id))
        .filter((it): it is WardrobeItem => !!it),
    [outfit, items],
  );

  const tryOnGarments = useMemo(() => toGarments(pieces), [pieces]);

  const history = useMemo(
    () =>
      calendar
        .filter((e) => e.outfitId === outfit?.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    [calendar, outfit],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const back = () => setView("outfits");

  if (!outfit) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">That look is no longer here.</p>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-xl border border-line px-4 py-2 text-sm"
        >
          Back to looks
        </button>
      </div>
    );
  }

  const duplicate = () => {
    const id = duplicateOutfit(outfit.id);
    if (id) openOutfitDetail(id);
  };

  return (
    <div className="pb-8">
      <div className="-mx-4 mb-3 flex items-center gap-1 px-2">
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-sm text-accent active:scale-95"
        >
          <ChevronLeft size={19} /> Looks
        </button>
      </div>

      <OutfitBoardThumb
        outfit={outfit}
        items={items}
        className="aspect-[3/4] w-full rounded-3xl border border-line bg-surface"
      />

      <input
        value={outfit.name}
        onChange={(e) => renameOutfit(outfit.id, e.target.value)}
        aria-label="Look name"
        className="heading mt-4 w-full bg-transparent text-2xl outline-none"
        placeholder="Name this look"
      />
      <p className="mt-0.5 text-sm text-muted">
        {pieces.length} piece{pieces.length === 1 ? "" : "s"} · {wearSummary(outfit, items)}
      </p>

      {toast && (
        <p className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
          {toast}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Action
          wide
          primary
          icon={Check}
          label="Wore it today"
          onClick={() => {
            logWear({ outfitId: outfit.id, itemIds: outfit.itemIds });
            flash("Logged as worn today");
          }}
        />
        <Action
          wide
          icon={ScanFace}
          label="Try it on me"
          onClick={() => {
            if (!tryOnGarments.length) {
              flash("Add photos to the pieces first");
              return;
            }
            setTryOn(true);
          }}
        />
        <Action
          icon={CalendarDays}
          label="Plan a date"
          onClick={() => setView("calendar")}
        />
        <Action
          icon={Pencil}
          label="Edit board"
          onClick={() => loadOutfitBoardIntoCanvas(outfit.id)}
        />
        <Action icon={Copy} label="Duplicate" onClick={duplicate} />
        <Action
          icon={Star}
          label={outfit.favorite ? "Favourited" : "Favourite"}
          active={!!outfit.favorite}
          onClick={() => toggleOutfitFavorite(outfit.id)}
        />
        <Action icon={Send} label="Share" onClick={() => setShare(true)} />
        <Action
          icon={Trash2}
          label="Delete"
          danger
          onClick={() => setConfirmDelete(true)}
        />
      </div>

      {confirmDelete && (
        <div className="animate-fade-up mt-3 rounded-2xl border border-red-200 bg-surface p-4 text-center">
          <p className="text-sm font-medium">Delete this look?</p>
          <p className="mt-1 text-xs text-muted">
            The pieces stay in your closet — only the look is removed.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-xl border border-line py-2.5 text-sm"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => {
                deleteOutfit(outfit.id);
                back();
              }}
              className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <Section title="Pieces" />
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pieces.map((it) => (
          <div key={it.id} className="w-[78px] shrink-0">
            <div className="flex h-[92px] items-center justify-center rounded-xl border border-line bg-surface p-1.5">
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.imageUrl}
                  alt={it.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span
                  className="h-10 w-10 rounded-lg"
                  style={{ background: it.color }}
                />
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-muted">{it.name}</p>
          </div>
        ))}
      </div>

      <Section title="Wear history" />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {history.length === 0 ? (
          <p className="px-4 py-3.5 text-sm text-muted">Not worn yet.</p>
        ) : (
          history.map((e, i) => (
            <div
              key={`${e.date}-${i}`}
              className="flex items-center justify-between border-b border-line px-4 py-3 last:border-b-0"
            >
              <span className="text-sm">
                {e.kind === "planned" ? "Planned" : "Worn"}
              </span>
              <span className="text-xs text-muted">{formatDisplayDate(e.date)}</span>
            </div>
          ))
        )}
      </div>

      {outfit.notes && (
        <>
          <Section title="Notes" />
          <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            {outfit.notes}
          </p>
        </>
      )}

      <ShareToChatSheet
        open={share}
        kind="outfit"
        payload={outfitPayload(outfit, pieces)}
        onClose={() => setShare(false)}
      />

      {tryOn && (
        <TryOnView garments={tryOnGarments} onClose={() => setTryOn(false)} />
      )}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
      {title}
    </p>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  primary,
  danger,
  active,
  wide,
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  active?: boolean;
  wide?: boolean;
}) {
  const tone = primary
    ? "bg-accent border-accent text-accent-foreground font-medium"
    : danger
      ? "border-red-200 text-red-600 bg-surface"
      : active
        ? "border-accent/40 bg-accent-soft text-foreground"
        : "border-line bg-surface text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm transition-transform active:scale-[0.97] ${tone} ${
        wide ? "col-span-2" : ""
      }`}
    >
      <Icon size={16} fill={active && label !== "Delete" ? "currentColor" : "none"} />
      {label}
    </button>
  );
}
