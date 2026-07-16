"use client";

import { ChevronLeft, MoreVertical, Plus, Send, Shirt, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyIntent } from "@/lib/stylist/intent";
import { postNarration, resolveBuyProduct, templateReason } from "@/lib/stylist/narrate";
import { runTool } from "@/lib/stylist/tools";
import { clearTranscript, loadTranscript, saveTranscript } from "@/lib/stylist/transcript";
import type { OutfitCardData, StylistBlock, StylistTurn } from "@/lib/stylist/types";
import { useWardrobe } from "@/lib/store";
import { todayISO, type WardrobeItem } from "@/lib/types";
import { StylistAttachSheet } from "./StylistAttachSheet";
import { StylistBlocks, type BlockHandlers } from "./StylistBlocks";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function greeting(): StylistTurn {
  return {
    id: "greeting",
    role: "bot",
    text: "Hi — I'm your Stylist. I dress you from your own closet. What's the occasion?",
    blocks: [
      {
        type: "chips",
        chips: [
          { label: "Dress me today", send: "what should I wear today?" },
          { label: "For work", send: "what should I wear to work?" },
          { label: "What am I not wearing?", send: "what am I not wearing?" },
          { label: "Closet stats", send: "show my closet stats" },
        ],
      },
    ],
    createdAt: Date.now(),
  };
}

/** Find the most recent outfit shown, so "swap the shoes" has a look to edit. */
function latestOutfitIds(turns: StylistTurn[]): string[] | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    for (const b of turns[i].blocks ?? []) {
      if (b.type === "outfit") return b.outfit.itemIds;
      if (b.type === "carousel" && b.outfits[0]) return b.outfits[0].itemIds;
    }
  }
  return undefined;
}

/**
 * The Stylist thread — a full-screen overlay (like ChatView) reached from the
 * pinned first row in Messages or the Home "What should I wear?" button. Runs
 * the whole loop client-side: classify the message, run the deterministic
 * engines, render cards instantly, then swap in LLM narration when it arrives.
 */
export function StylistView() {
  const items = useWardrobe((s) => s.items);
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const stylistSeed = useWardrobe((s) => s.stylistSeed);
  const clearStylistSeed = useWardrobe((s) => s.clearStylistSeed);
  const setView = useWardrobe((s) => s.setView);
  const setDraft = useWardrobe((s) => s.setDraft);
  const logWear = useWardrobe((s) => s.logWear);
  const saveOutfit = useWardrobe((s) => s.saveOutfit);
  const openAdd = useWardrobe((s) => s.openAdd);

  const userId = authUser?.id ?? null;
  const [turns, setTurns] = useState<StylistTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attached, setAttached] = useState<WardrobeItem[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const seedRef = useRef(false);

  // Hydrate the transcript for the current user (auth resolves after mount).
  useEffect(() => {
    const loaded = loadTranscript(userId);
    setTurns(loaded.length ? loaded : [greeting()]);
  }, [userId]);

  useEffect(() => {
    if (turns.length) saveTranscript(userId, turns);
  }, [turns, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };

  const resolve = useCallback((id: string) => items.find((it) => it.id === id), [items]);

  const submit = useCallback(
    async (raw: string) => {
      const attachedNow = attached;
      const message =
        raw.trim() ||
        (attachedNow.length >= 2
          ? "which of these should I wear?"
          : attachedNow.length === 1
            ? "how do I wear this?"
            : "");
      if (!message || busy) return;
      setBusy(true);
      setText("");
      setAttached([]);

      const userTurn: StylistTurn = { id: uid(), role: "user", text: message, createdAt: Date.now() };
      const botId = uid();
      const history = turns
        .filter((t) => t.text)
        .slice(-6)
        .map((t) => ({ role: t.role, text: t.text as string }));

      const lastOutfitIds = latestOutfitIds(turns);
      setTurns((prev) => [...prev, userTurn, { id: botId, role: "bot", pending: true, createdAt: Date.now() }]);

      const attachedIds = attachedNow.map((it) => it.id);
      const cls = classifyIntent(message, attachedIds);
      let blocks: StylistBlock[] = [];
      let seed = "";
      try {
        // "should I buy this?" needs a resolved product (from a URL or an
        // attached wishlist item) before the engine can score it.
        const product =
          cls.intent === "buy_advice"
            ? (await resolveBuyProduct(cls.slots.url, attachedNow[0])) ?? undefined
            : undefined;
        const result = await runTool(cls.intent, cls.slots, { items, profile, lastOutfitIds, product });
        blocks = result.blocks;
        seed = templateReason(result.compact);
        setTurns((prev) => prev.map((t) => (t.id === botId ? { ...t, text: seed, blocks } : t)));
        const narrated = await postNarration({
          intent: cls.intent,
          message,
          compact: result.compact,
          history,
        });
        setTurns((prev) =>
          prev.map((t) => (t.id === botId ? { ...t, text: narrated, blocks, pending: false } : t)),
        );
      } catch {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === botId
              ? { ...t, text: seed || "Something went wrong — try again.", blocks, pending: false }
              : t,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, items, profile, attached],
  );

  // Auto-send a seed message (e.g. from the Home "What should I wear?" button),
  // once, after the transcript has hydrated so it lands in the right thread.
  useEffect(() => {
    if (seedRef.current || !stylistSeed || turns.length === 0) return;
    seedRef.current = true;
    const seed = stylistSeed;
    clearStylistSeed();
    void submit(seed);
  }, [stylistSeed, turns, clearStylistSeed, submit]);

  const handlers: BlockHandlers = useMemo(
    () => ({
      resolve,
      onWear: (itemIds) => {
        logWear({ itemIds, date: todayISO() });
        flash("Added to today");
      },
      onSave: (o: OutfitCardData) => {
        saveOutfit("Stylist look", "", o.itemIds);
        flash("Saved to your outfits");
      },
      onOpen: (o: OutfitCardData) => {
        setDraft(o.draft);
        setView("builder");
      },
      onChip: (send) => void submit(send),
      onAddItems: () => openAdd(),
    }),
    [resolve, logWear, saveOutfit, setDraft, setView, openAdd, submit],
  );

  const clearChat = () => {
    setMenuOpen(false);
    clearTranscript(userId);
    setTurns([greeting()]);
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => setView("messages")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-surface-2"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Stylist</p>
          <p className="truncate text-xs text-muted">Dresses you from your closet</p>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="More options"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            <MoreVertical size={20} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[71]" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-[72] mt-1 w-40 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-black/10">
                <button
                  type="button"
                  onClick={clearChat}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-2"
                >
                  <Trash2 size={16} /> Clear chat
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* transcript */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-accent px-3.5 py-2 text-sm text-accent-foreground">
                {t.text}
              </div>
            </div>
          ) : (
            <div key={t.id} className="flex justify-start">
              <div className="max-w-[88%]">
                {t.pending && !t.text ? (
                  <div className="flex gap-1 rounded-2xl bg-surface-2 px-3.5 py-3">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </div>
                ) : (
                  <>
                    {t.text && (
                      <div className="rounded-2xl bg-surface-2 px-3.5 py-2 text-sm text-foreground">{t.text}</div>
                    )}
                    {t.blocks && t.blocks.length > 0 && <StylistBlocks blocks={t.blocks} h={handlers} />}
                  </>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div className="border-t border-line px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        {attached.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attached.map((it) => (
              <span key={it.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-2 text-xs">
                <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-surface">
                  {it.beautifiedImageUrl || it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.beautifiedImageUrl || it.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Shirt size={11} className="text-muted" />
                  )}
                </span>
                <span className="max-w-[120px] truncate">{it.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${it.name}`}
                  onClick={() => setAttached((prev) => prev.filter((x) => x.id !== it.id))}
                  className="text-muted hover:text-foreground"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Attach a piece"
            onClick={() => setAttachOpen(true)}
            disabled={attached.length >= 2}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground disabled:opacity-40"
          >
            <Plus size={20} />
          </button>
          <input
            className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            placeholder="Ask your stylist…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit(text);
              }
            }}
          />
          <button
            type="button"
            onClick={() => void submit(text)}
            disabled={(!text.trim() && attached.length === 0) || busy}
            aria-label="Send"
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              (text.trim() || attached.length > 0) && !busy
                ? "bg-accent text-accent-foreground"
                : "bg-surface-2 text-muted"
            }`}
          >
            <Send size={17} />
          </button>
        </div>
      </div>

      {attachOpen && (
        <StylistAttachSheet
          excludeIds={attached.map((it) => it.id)}
          onClose={() => setAttachOpen(false)}
          onPick={(it) => {
            setAttached((prev) => (prev.length >= 2 ? prev : [...prev, it]));
            setAttachOpen(false);
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[80] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">{toast}</p>
        </div>
      )}
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay }}
    />
  );
}
