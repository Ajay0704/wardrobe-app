"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isHandleAvailable } from "@/lib/chat";
import { sanitizeHandle, validateHandle } from "@/lib/profile";

/**
 * Username picker with live format + availability validation. Input is
 * normalized to a–z 0–9 . _ as the user types; availability is a debounced
 * directory check. Reports overall validity (format OK *and* available) via
 * onValidChange so the parent can gate its "continue" / "save" action.
 */
export function HandleField({
  value,
  onChange,
  onValidChange,
  myId,
}: {
  value: string;
  onChange: (handle: string) => void;
  onValidChange?: (valid: boolean) => void;
  myId: string | null;
}) {
  /**
   * An untouched EMPTY field shows no complaint.
   *
   * `validateHandle("")` fails, so rendering its reason unconditionally meant the sign-up sheet
   * opened with a red ✕ and "At least 3 characters" against a field nobody had typed in yet —
   * the first thing a new user saw was the form telling them they'd done something wrong.
   * Feedback should report status, not assign blame before there's anything to report
   * (apple-design §16).
   *
   * Validation itself is unchanged: `status` is still computed from the real value and
   * `onValidChange` still reports false while empty, so any parent gating a "continue" button
   * behaves exactly as before. Only the visible message and icon wait for interaction — the
   * first keystroke, or leaving the field. A PREFILLED value is not pristine, so a handle
   * carried in from elsewhere is still validated on sight.
   */
  const [touched, setTouched] = useState(false);
  const pristine = !touched && value === "";

  const fmt = validateHandle(value);
  const okHandle = fmt.ok ? fmt.handle : "";
  // Availability result tagged with the handle it was computed for, so a stale
  // answer never shows against newer input.
  const [avail, setAvail] = useState<{ handle: string; free: boolean } | null>(null);

  useEffect(() => {
    if (!okHandle) return;
    let alive = true;
    const t = setTimeout(async () => {
      const free = await isHandleAvailable(okHandle, myId);
      if (alive) setAvail({ handle: okHandle, free });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [okHandle, myId]);

  const status: "invalid" | "checking" | "ok" | "taken" = !fmt.ok
    ? "invalid"
    : avail && avail.handle === okHandle
      ? avail.free
        ? "ok"
        : "taken"
      : "checking";

  useEffect(() => {
    onValidChange?.(status === "ok");
  }, [status, onValidChange]);

  const msg = !fmt.ok
    ? fmt.reason
    : status === "ok"
      ? "Available"
      : status === "taken"
        ? "That handle is taken"
        : "";

  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-3 focus-within:border-accent">
        <span className="text-muted">@</span>
        <input
          value={value}
          onChange={(e) => {
            setTouched(true);
            onChange(sanitizeHandle(e.target.value));
          }}
          onBlur={() => setTouched(true)}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          className="flex-1 bg-transparent text-sm outline-none"
          aria-label="Username"
        />
        {status === "checking" && !pristine && (
          <Loader2 size={16} className="animate-spin text-muted" aria-hidden />
        )}
        {status === "ok" && <Check size={16} className="text-emerald-600" aria-hidden />}
        {(status === "taken" || status === "invalid") && !pristine && (
          <X size={16} className="text-red-500" aria-hidden />
        )}
      </div>
      {msg && !pristine && (
        <p className={`mt-1.5 text-xs ${status === "ok" ? "text-emerald-600" : "text-red-500"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
