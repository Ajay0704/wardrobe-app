/**
 * AJA-302 — every Travel failure has to reach the user as a sentence they can act on.
 *
 * Run: npm run test:trip-errors
 *
 * "New trip" looked dead because trips.ts threw and nothing caught it. Catching it is
 * half the fix; the other half is saying the RIGHT thing. Before this, a dropped
 * connection came back from `auth.getUser()` as "no user", so being offline read as
 * "Sign in to plan a trip", and the trip list read as "No trips yet". This suite is the
 * contract for both halves:
 *
 *  1. tripFailure() sorts any error into unconfigured / signed-out / network /
 *     forbidden / unknown, including the browser-specific "can't reach it" strings
 *     (Chrome "Failed to fetch", Safari and the iOS WebView "Load failed", Firefox
 *     "NetworkError…", Node "fetch failed").
 *  2. tripErrorMessage() turns each one into a sentence that names the action, and never
 *     leaks Supabase text (row-level security, TypeError, a bare "Offline").
 *  3. The REAL trips.ts, against a stubbed Supabase (fetch is replaced, nothing leaves the
 *     machine): not configured, signed out, auth unreachable, insert unreachable, RLS
 *     refusal, and the success path each land in the right bucket.
 */

const { tripFailure, tripErrorMessage, TripsError } = await import("@/lib/trip-errors");
type TripAction = import("@/lib/trip-errors").TripAction;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

/** Awaits `p` and returns what it rejected with, or a marker when it resolved. */
async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    return RESOLVED;
  } catch (e) {
    return e;
  }
}
const RESOLVED = Symbol("resolved");

/* ------------------------------------------------------------ 1. classification */

console.log("\n1. tripFailure sorts errors into what the user can do about them");

ok(tripFailure(new TripsError("unconfigured")) === "unconfigured", "TripsError(unconfigured)");
ok(tripFailure(new TripsError("signed-out")) === "signed-out", "TripsError(signed-out)");

const network = [
  "TypeError: Failed to fetch", // Chrome, wrapped by postgrest-js
  "TypeError: Load failed", // Safari and WKWebView, i.e. the iOS app
  "TypeError: NetworkError when attempting to fetch resource.", // Firefox
  "TypeError: fetch failed", // Node / undici
  "Failed to fetch",
];
for (const m of network) ok(tripFailure(new Error(m)) === "network", `network: "${m}"`);

// auth-js wraps an unreachable auth server in AuthRetryableFetchError (status 0, or 502-504).
const retryable = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 });
ok(tripFailure(retryable) === "network", "AuthRetryableFetchError → network");
const gateway = Object.assign(new Error("Bad Gateway"), { name: "AuthRetryableFetchError", status: 502 });
ok(tripFailure(gateway) === "network", "AuthRetryableFetchError 502 → network");

ok(
  tripFailure(new Error('new row violates row-level security policy for table "trips"')) === "forbidden",
  "RLS refusal → forbidden",
);
ok(tripFailure(Object.assign(new Error("permission denied"), { code: "42501" })) === "forbidden", "code 42501 → forbidden");

ok(tripFailure(new Error("boom")) === "unknown", "anything else → unknown");
ok(tripFailure("a string") === "unknown", "a thrown string → unknown");
ok(tripFailure(undefined) === "unknown", "undefined → unknown");
ok(tripFailure(new Error("boom"), false) === "network", "the browser says it's offline → network, whatever the error");
ok(
  tripFailure(new TripsError("signed-out"), false) === "signed-out",
  "…but a known cause still wins over the offline flag",
);

/* ------------------------------------------------------------------ 2. messages */

console.log("\n2. tripErrorMessage says what failed and what to do");

const actions: TripAction[] = [
  "create", "details", "delete", "pack", "unpack", "invite", "accept", "decline", "load", "loadTrip", "following",
];
const samples: [string, unknown][] = [
  ["unconfigured", new TripsError("unconfigured")],
  ["signed-out", new TripsError("signed-out")],
  ["network", new Error("TypeError: Load failed")],
  ["forbidden", new Error('new row violates row-level security policy for table "trip_items"')],
  ["unknown", new Error('duplicate key value violates unique constraint "trips_pkey"')],
];
const leaks = /row-level|TypeError|Load failed|fetch|duplicate key|constraint|^Offline$|undefined|null/i;
let allClean = true;
let allEnd = true;
const seen = new Set<string>();
for (const a of actions) {
  for (const [, err] of samples) {
    const m = tripErrorMessage(a, err, true);
    if (leaks.test(m) || m.length < 12) {
      allClean = false;
      console.log(`      leaked or empty: ${a} → "${m}"`);
    }
    if (!/[.!]$/.test(m)) allEnd = false;
    seen.add(m);
  }
}
ok(allClean, "no message leaks Supabase text or comes out empty", `${actions.length * samples.length} combinations`);
ok(allEnd, "every message is a finished sentence");
ok(seen.size >= actions.length * 3, "messages differ by action, not one generic string", `${seen.size} distinct`);

const create = (err: unknown) => tripErrorMessage("create", err, true);
ok(/sign in/i.test(create(new TripsError("signed-out"))), "signed out → tells you to sign in", create(new TripsError("signed-out")));
ok(/connection/i.test(create(new Error("Failed to fetch"))), "network → points at the connection", create(new Error("Failed to fetch")));
ok(!/sign in/i.test(create(new Error("Failed to fetch"))), "network → does NOT tell a signed-in user to sign in");
ok(/cloud sync/i.test(create(new TripsError("unconfigured"))), "unconfigured → says cloud sync is off", create(new TripsError("unconfigured")));
ok(/access/i.test(create(new Error("new row violates row-level security policy"))), "forbidden → says you lack access");
ok(/try again/i.test(create(new Error("boom"))), "unknown → invites a retry", create(new Error("boom")));
ok(/trip/i.test(create(new Error("boom"))), "the message names the thing that failed");
ok(/pack/i.test(tripErrorMessage("pack", new Error("boom"), true)), "pack names packing", tripErrorMessage("pack", new Error("boom"), true));
ok(
  /invite/i.test(tripErrorMessage("invite", new Error("Failed to fetch"), true)),
  "invite names the invite",
  tripErrorMessage("invite", new Error("Failed to fetch"), true),
);

/* ----------------------------------------------------- 3. the real trips.ts */

console.log("\n3. trips.ts, against a stubbed Supabase");

// getSupabase() reads the env on every call and caches the client once it exists, so the
// unconfigured case has to run before the env is set.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const Trips = await import("@/lib/trips");
const { getSupabase } = await import("@/lib/supabase/client");

const unconfigured = await rejection(Trips.createTrip({ name: "New trip" }));
ok(tripFailure(unconfigured) === "unconfigured", "no Supabase → createTrip rejects as unconfigured", String(unconfigured));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

// One router stands in for the auth server and PostgREST. Each case sets the modes.
type Mode = "ok" | "down" | "rls";
const mode: { auth: Mode; rest: Mode } = { auth: "ok", rest: "ok" };
const calls: string[] = [];
const USER = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "t@example.com" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
(globalThis as { fetch: typeof fetch }).fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const path = new URL(url).pathname;
  calls.push(`${method} ${path}`);
  if (path === "/auth/v1/user") {
    if (mode.auth === "down") throw new TypeError("fetch failed");
    return json(200, USER);
  }
  if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (path.startsWith("/rest/v1/")) {
    if (mode.rest === "down") throw new TypeError("fetch failed");
    if (mode.rest === "rls") {
      return json(403, {
        code: "42501",
        message: `new row violates row-level security policy for table "${path.split("/").pop()}"`,
        details: null,
        hint: null,
      });
    }
    if (path === "/rest/v1/trips" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const now = new Date().toISOString();
      return json(201, { id: "trip-1", ...body, created_at: now, updated_at: now });
    }
    if (method === "GET") return json(200, []);
    return new Response(null, { status: 204 });
  }
  throw new Error(`unstubbed ${method} ${url}`);
};

// 3a. no session at all
const sb = getSupabase()!;
ok(Boolean(sb), "the stubbed client exists");
for (const [label, p] of [
  ["createTrip", Trips.createTrip({ name: "New trip" })],
  ["packItem", Trips.packItem("trip-1", { id: "i1", name: "Tee", imageUrl: "", category: "top" } as never)],
  ["unpackItem", Trips.unpackItem("trip-1", "i1")],
  ["respondInvite(accept)", Trips.respondInvite("trip-1", true)],
  ["respondInvite(decline)", Trips.respondInvite("trip-1", false)],
  ["leaveTrip", Trips.leaveTrip("trip-1")],
] as const) {
  const e = await rejection(p);
  ok(tripFailure(e) === "signed-out", `no session → ${label} rejects as signed-out`, e === RESOLVED ? "it resolved: a silent no-op" : String(e));
}
ok((await Trips.listTrips()).length === 0, "no session → listTrips is still just empty");

// 3b. a signed-in session (a well-formed JWT the stub accepts; nothing verifies the signature)
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, exp, role: "authenticated", aud: "authenticated" })}.sig`;
const set = await sb.auth.setSession({ access_token: jwt, refresh_token: "stub-refresh" });
ok(!set.error && set.data.session?.user.id === USER.id, "signed in on the stub", set.error?.message ?? "");

// auth-js console.errors every failed fetch before wrapping it; that's expected here.
const logError = console.error;
console.error = () => {};
mode.auth = "down";
const authDown = await rejection(Trips.createTrip({ name: "New trip" }));
ok(tripFailure(authDown) === "network", "auth unreachable → createTrip is network, not signed-out", String(authDown));
ok(!/sign in/i.test(tripErrorMessage("create", authDown, true)), "…so it no longer says 'sign in'", tripErrorMessage("create", authDown, true));
const listDown = await rejection(Trips.listTrips());
ok(tripFailure(listDown) === "network", "auth unreachable → listTrips rejects instead of claiming no trips", listDown === RESOLVED ? "resolved" : String(listDown));
ok((await sb.auth.getSession()).data.session?.user.id === USER.id, "a dropped connection does not sign you out");
console.error = logError;

mode.auth = "ok";
mode.rest = "down";
const insertDown = await rejection(Trips.createTrip({ name: "New trip" }));
ok(tripFailure(insertDown) === "network", "insert unreachable → network", String(insertDown));

mode.rest = "rls";
const refused = await rejection(Trips.createTrip({ name: "New trip" }));
ok(tripFailure(refused) === "forbidden", "RLS refusal → forbidden", String(refused));
const packRefused = await rejection(Trips.packItem("trip-1", { id: "i1", name: "Tee", imageUrl: "", category: "top" } as never));
ok(tripFailure(packRefused) === "forbidden", "packing into a trip you left → forbidden", String(packRefused));

mode.rest = "ok";
calls.length = 0;
const made = await Trips.createTrip({ name: "New trip" }, { name: "Tess", handle: "tess" });
ok(made.id === "trip-1" && made.name === "New trip" && made.ownerId === USER.id, "success → the new trip comes back", JSON.stringify(made));
ok(calls.includes("PATCH /rest/v1/trip_members"), "success → the owner's name is stamped on the membership", calls.join(", "));

console.log(`\n${fails === 0 ? "TRIP ERROR CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
