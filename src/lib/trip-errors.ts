/**
 * What to tell the user when a Travel action fails (AJA-302). trips.ts throws whatever
 * Supabase hands back — a TypeError from fetch, a Postgres RLS message, its own
 * TripsError — and none of that is fit to show. This sorts a failure into what the
 * user can do about it and says so, naming the action that didn't happen.
 *
 * Pure: no Supabase import, so the test suite can exercise it directly.
 */

/** A failure trips.ts can name itself, rather than one passed through from Supabase. */
export class TripsError extends Error {
  readonly kind: "unconfigured" | "signed-out";
  constructor(kind: "unconfigured" | "signed-out") {
    super(kind === "unconfigured" ? "Trips need cloud sync" : "No signed-in session");
    this.name = "TripsError";
    this.kind = kind;
  }
}

export type TripFailure = "unconfigured" | "signed-out" | "network" | "forbidden" | "unknown";

export type TripAction =
  | "create"
  | "details"
  | "delete"
  | "pack"
  | "unpack"
  | "invite"
  | "accept"
  | "decline"
  | "load"
  | "loadTrip"
  | "following";

// "Can't reach it", as each engine words it: Chrome, Safari and the iOS WebView, Firefox,
// Node. postgrest-js prefixes the error name ("TypeError: Load failed").
const NETWORK = /failed to fetch|load failed|networkerror|fetch failed|network request failed/i;

function field(err: unknown, key: string): unknown {
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

export function tripFailure(
  err: unknown,
  online = typeof navigator === "undefined" || navigator.onLine !== false,
): TripFailure {
  if (field(err, "name") === "TripsError") {
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

// Each reads after "Couldn't …" and after "sign in again to …".
const WHAT: Record<TripAction, string> = {
  create: "start a new trip",
  details: "save the trip details",
  delete: "delete the trip",
  pack: "pack that piece",
  unpack: "take that piece out",
  invite: "send the invite",
  accept: "join the trip",
  decline: "decline the invite",
  load: "load your trips",
  loadTrip: "load this trip",
  following: "load the people you follow",
};

export function tripErrorMessage(action: TripAction, err: unknown, online?: boolean): string {
  const what = WHAT[action];
  switch (tripFailure(err, online)) {
    case "unconfigured":
      return "Trips need cloud sync, and it isn't set up here.";
    case "signed-out":
      return `Your session has ended — sign in again to ${what}.`;
    case "network":
      return `Couldn't ${what} — check your connection and try again.`;
    case "forbidden":
      return `Couldn't ${what} — you no longer have access to this trip.`;
    default:
      return `Couldn't ${what}. Please try again.`;
  }
}
