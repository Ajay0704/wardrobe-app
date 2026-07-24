"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useState } from "react";
import { deleteAccount } from "@/lib/account";
import { useWardrobe } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";

const CONFIRM_WORD = "DELETE";

/**
 * Type-to-confirm account deletion (App Store Guideline 5.1.1(v)). Irreversible:
 * removes the account and all wardrobe/social data server-side. On success we
 * clear the local session + cached snapshot and sign out (local scope), which
 * drops the app back to the landing / sign-in screen (authUser === null re-gates
 * it). Shared by the native "You" hub and the web Settings danger zone.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const setAuthUser = useWardrobe((s) => s.setAuthUser);
  const setSyncStatus = useWardrobe((s) => s.setSyncStatus);
  const resetAll = useWardrobe((s) => s.resetAll);

  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD;

  const handleDelete = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      setAuthUser(null);
      setSyncStatus("offline");
      resetAll();
      await signOut();
      // No onClose(): authUser === null re-gates the app to the landing screen,
      // which unmounts this dialog along with the settings view behind it.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Delete account"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="heading text-lg leading-tight">Delete account</h2>
            <p className="mt-1 text-sm text-muted">
              This permanently deletes your account and everything in it —
              wardrobe, outfits, posts, trips, and messages. This can’t be
              undone.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="p-1 text-muted disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <label htmlFor="delete-confirm" className="block text-xs font-medium text-muted">
          Type <span className="font-semibold text-foreground">{CONFIRM_WORD}</span> to confirm
        </label>
        <input
          id="delete-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={CONFIRM_WORD}
          disabled={busy}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-red-500 disabled:opacity-60"
        />

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-full border border-line py-2.5 text-sm font-medium disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!armed || busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
