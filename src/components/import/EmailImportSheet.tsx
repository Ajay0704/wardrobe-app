"use client";

import { Check, Copy, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  acceptCandidates,
  confirmSender,
  dismissCandidates,
  fetchHeldCandidates,
  fetchPendingCandidates,
  inboxAddress,
  updateCandidateCategory,
  type ImportCandidate,
} from "@/lib/import";
import { useWardrobe } from "@/lib/store";
import { pullSnapshot } from "@/lib/supabase/sync";
import { CATEGORIES } from "@/lib/types";

/** Confirm-and-review sheet for email-imported purchases. Nothing here writes to the
 *  closet until the user taps "Add" (the review gate). */
export function EmailImportSheet({ onClose }: { onClose: () => void }) {
  const authUser = useWardrobe((s) => s.authUser);
  const hydrateFromRemote = useWardrobe((s) => s.hydrateFromRemote);
  const [address, setAddress] = useState<string | null>(null);
  const [pending, setPending] = useState<ImportCandidate[]>([]);
  const [held, setHeld] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };

  const load = useCallback(async () => {
    const [addr, p, h] = await Promise.all([
      inboxAddress(),
      fetchPendingCandidates(),
      fetchHeldCandidates(),
    ]);
    setAddress(addr);
    setPending(p);
    setHeld(h);
    setSelected(new Set(p.map((c) => c.id)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const refreshCloset = async () => {
    if (!authUser) return;
    const remote = await pullSnapshot(authUser.id);
    if (remote) {
      hydrateFromRemote({
        items: remote.items,
        outfits: remote.outfits,
        calendar: remote.calendar,
        profile: remote.profile,
        theme: remote.theme,
        draft: remote.draft,
      });
    }
  };

  const add = async () => {
    const ids = [...selected];
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      const ok = await acceptCandidates(ids);
      if (ok) {
        await refreshCloset();
        flash(`Added ${ids.length} to your closet`);
        await load();
      } else {
        flash("Couldn't add those.");
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (id: string) => {
    setPending((prev) => prev.filter((c) => c.id !== id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    await dismissCandidates([id]);
  };

  const trustSender = async (sender: string | null) => {
    await confirmSender(sender || "");
    flash("Sender trusted");
    await load();
  };

  const setCategory = async (id: string, category: string) => {
    setPending((prev) => prev.map((c) => (c.id === id ? { ...c, category } : c)));
    await updateCandidateCategory(id, category);
  };

  const heldSenders = [...new Set(held.map((c) => c.sender).filter(Boolean))] as string[];

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet flex max-h-[88vh] flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Import from email"
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">Import from email</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        {/* forward address */}
        {address && (
          <div className="mb-3 rounded-2xl border border-line bg-surface-2/60 p-3">
            <p className="text-xs text-muted">Forward your order confirmation emails to:</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-[12px]">
                {address}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(address);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-xs"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className="min-h-24 flex-1 overflow-y-auto">
          {/* held / needs verification */}
          {held.length > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-3 dark:bg-amber-500/10">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck size={15} /> {held.length} item{held.length === 1 ? "" : "s"} held for review
              </p>
              <p className="mt-1 text-xs text-muted">
                Forwarded from an address that isn&apos;t linked to your account yet.
              </p>
              {heldSenders.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => trustSender(s)}
                  className="mt-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                >
                  Trust {s}
                </button>
              ))}
            </div>
          )}

          {pending.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Nothing to review yet — forward an order email to the address above.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-2">
              {pending.map((c) => {
                const on = selected.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`overflow-hidden rounded-2xl border ${on ? "border-accent" : "border-line"} bg-surface`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="relative block aspect-square w-full bg-surface-2"
                    >
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imageUrl} alt={c.name ?? ""} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] text-muted">
                          image unavailable
                        </span>
                      )}
                      <span
                        className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border ${
                          on ? "border-accent bg-accent text-accent-foreground" : "border-line bg-background text-transparent"
                        }`}
                      >
                        <Check size={14} />
                      </span>
                      <span
                        role="button"
                        aria-label="Dismiss"
                        onClick={(e) => {
                          e.stopPropagation();
                          void dismiss(c.id);
                        }}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted"
                      >
                        <X size={13} />
                      </span>
                    </button>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-[13px] font-medium">{c.name}</p>
                      {(c.brand || c.price != null) && (
                        <p className="truncate text-[11px] text-muted">
                          {[c.brand, c.price != null ? `£${c.price}` : ""].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <select
                        value={c.category ?? "top"}
                        onChange={(e) => void setCategory(c.id, e.target.value)}
                        className="w-full rounded-lg border border-line bg-background px-2 py-1 text-[11px]"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pending.length > 0 && (
          <button
            type="button"
            onClick={add}
            disabled={!selected.size || busy}
            className="mt-3 h-12 w-full rounded-xl bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {busy ? "Adding…" : `Add ${selected.size} to closet`}
          </button>
        )}

        {toast && (
          <p className="mt-2 rounded-full bg-surface-2 px-4 py-2 text-center text-sm text-muted">{toast}</p>
        )}
      </div>
    </div>
  );
}
