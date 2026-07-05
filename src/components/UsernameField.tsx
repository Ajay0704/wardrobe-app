"use client";

import { useEffect, useState } from "react";
import { sanitizeUsername, validateUsername } from "@/lib/profile";
import { isUsernameAvailable } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Field, inputClass } from "./ui";

type Status =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "error" };

/** Async availability result, tagged with the name it was checked for. */
type Result = { name: string; free: boolean } | { name: string; error: true };

/**
 * Username input with a debounced availability check. Sanitizes to letters
 * and numbers as the user types. Availability is informational — sign-up and
 * sign-in re-check server-side and the DB constraint is the real guarantee.
 *
 * `currentUsername` (Settings) is treated as already-yours, so it never shows
 * as "taken".
 */
export function UsernameField({
  value,
  onChange,
  currentUsername,
  label = "Username",
}: {
  value: string;
  onChange: (next: string) => void;
  currentUsername?: string;
  label?: string;
}) {
  const [result, setResult] = useState<Result | null>(null);

  const name = value.trim();
  const isSelf = Boolean(currentUsername && name === currentUsername);
  const formatError = name && !isSelf ? validateUsername(name) : null;
  const shouldCheck =
    Boolean(name) && !isSelf && !formatError && isSupabaseConfigured();

  useEffect(() => {
    if (!shouldCheck) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(name);
        if (!cancelled) setResult({ name, free });
      } catch {
        if (!cancelled) setResult({ name, error: true });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, shouldCheck]);

  // Derive the display status from props/state during render (no effect churn).
  let status: Status = { kind: "idle" };
  if (formatError) {
    status = { kind: "invalid", message: formatError };
  } else if (shouldCheck) {
    if (result && result.name === name) {
      status =
        "error" in result
          ? { kind: "error" }
          : { kind: result.free ? "available" : "taken" };
    } else {
      status = { kind: "checking" };
    }
  }

  return (
    <Field label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
          @
        </span>
        <input
          className={`${inputClass} !pl-8`}
          value={value}
          onChange={(e) => onChange(sanitizeUsername(e.target.value))}
          placeholder="username"
          autoComplete="username"
          spellCheck={false}
        />
      </div>
      <StatusHint status={status} />
    </Field>
  );
}

function StatusHint({ status }: { status: Status }) {
  switch (status.kind) {
    case "checking":
      return (
        <span className="mt-1 block text-xs text-muted">
          Checking availability…
        </span>
      );
    case "available":
      return (
        <span className="mt-1 block text-xs text-emerald-600 dark:text-emerald-400">
          Username is available.
        </span>
      );
    case "taken":
      return (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
          That username is already taken.
        </span>
      );
    case "invalid":
      return (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {status.message}
        </span>
      );
    case "error":
      return (
        <span className="mt-1 block text-xs text-muted">
          Couldn&apos;t check availability. You can still try to save.
        </span>
      );
    default:
      return (
        <span className="mt-1 block text-xs text-muted">
          Letters and numbers only, 3–20 characters.
        </span>
      );
  }
}
