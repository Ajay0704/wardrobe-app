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
          onChange={(e) => onChange(sanitizeHandle(e.target.value))}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          className="flex-1 bg-transparent text-sm outline-none"
          aria-label="Username"
        />
        {status === "checking" && (
          <Loader2 size={16} className="animate-spin text-muted" aria-hidden />
        )}
        {status === "ok" && <Check size={16} className="text-emerald-600" aria-hidden />}
        {(status === "taken" || status === "invalid") && (
          <X size={16} className="text-red-500" aria-hidden />
        )}
      </div>
      {msg && (
        <p className={`mt-1.5 text-xs ${status === "ok" ? "text-emerald-600" : "text-red-500"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
