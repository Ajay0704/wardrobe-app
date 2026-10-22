/**
 * What to tell the user when an action on a cloud-backed feature fails (Shared Closets,
 * AJA-303; generalised from Travel's AJA-302 classifier so each feature doesn't carry its
 * own copy). The data layers throw whatever Supabase hands back — a TypeError from fetch,
 * a Postgres RLS message, their own CloudError — and none of that is fit to show. This
 * sorts a failure into what the user can do about it and says so, naming the action that
 * didn't happen.
 *
 * Pure: no Supabase import, so test suites can exercise it directly.
 */

/** A failure a data layer can name itself, rather than one passed through from Supabase. */
export class CloudError extends Error {
  readonly kind: "unconfigured" | "signed-out";
  constructor(kind: "unconfigured" | "signed-out") {
    super(kind === "unconfigured" ? "Cloud sync isn't configured" : "No signed-in session");
    this.name = "CloudError";
    this.kind = kind;
  }
}

export type CloudFailure = "unconfigured" | "signed-out" | "network" | "forbidden" | "unknown";

// "Can't reach it", as each engine words it: Chrome, Safari and the iOS WebView, Firefox,
// Node. postgrest-js prefixes the error name ("TypeError: Load failed").
const NETWORK = /failed to fetch|load failed|networkerror|fetch failed|network request failed/i;

function field(err: unknown, key: string): unknown {
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

export function cloudFailure(
  err: unknown,
  online = typeof navigator === "undefined" || navigator.onLine !== false,
): CloudFailure {
  if (field(err, "name") === "CloudError") {
    const kind = field(err, "kind");
    if (kind === "unconfigured" || kind === "signed-out") return kind;
  }
  // auth-js: the auth server didn't answer (status 0) or answered 502-504.
  if (field(err, "name") === "AuthRetryableFetchError") return "network";
  const message = String(field(err, "message") ?? "");
  if (NETWORK.test(message)) return "network";
  if (field(err, "code") === "42501" || /row-level security|permission denied/i.test(message)) {
    return "forbidden";
  }
  return online ? "unknown" : "network";
}

/** The feature-specific words a message is built from. */
export interface FailureCopy {
  /** The action, reading after "Couldn't …" and after "sign in again to …". */
  what: string;
  /** The feature as a plural subject: "Shared closets need cloud sync…". */
  feature: string;
  /** What access was lost to: "…you no longer have access to this closet." */
  scope: string;
}

export function cloudErrorMessage(err: unknown, copy: FailureCopy, online?: boolean): string {
  const { what } = copy;
  switch (cloudFailure(err, online)) {
    case "unconfigured":
      return `${copy.feature} need cloud sync, and it isn't set up here.`;
    case "signed-out":
      return `Your session has ended — sign in again to ${what}.`;
    case "network":
      return `Couldn't ${what} — check your connection and try again.`;
    case "forbidden":
      return `Couldn't ${what} — you no longer have access to ${copy.scope}.`;
    default:
      return `Couldn't ${what}. Please try again.`;
  }
}
