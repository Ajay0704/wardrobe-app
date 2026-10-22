/**
 * AJA-303 — every Shared Closet failure has to reach the user as a sentence they can act on.
 *
 * Run: npm run test:shared-closet-errors
 *
 * SharedClosetView was built by mirroring TravelView, so it inherited Travel's silent
 * failures (AJA-302): "New" and "Add" threw and nothing caught it, a dropped connection
 * came back from `auth.getUser()` as "no user" (so offline read as "Sign in…" and the
 * list as "No shared closets yet"), and respond/leave resolved as silent no-ops with no
 * session. This suite is the contract for the data layer:
 *
 *  1. cloudFailure() — the classifier shared by every cloud-backed feature — sorts any
 *     error into unconfigured / signed-out / network / forbidden / unknown, including
 *     each engine's "can't reach it" wording (Chrome "Failed to fetch", Safari and the
 *     iOS WebView "Load failed", Firefox "NetworkError…", Node "fetch failed").
 *  2. sharedClosetErrorMessage() turns each one into a sentence that names the action,
 *     and never leaks Supabase text (row-level security, TypeError, a bare "Offline").
 *  3. The REAL shared-closet.ts, against a stubbed Supabase (fetch is replaced, nothing
 *     leaves the machine): not configured, signed out, auth unreachable, PostgREST
 *     unreachable, RLS refusal, and the success path each land in the right bucket.
 */

const { cloudFailure, CloudError } = await import("@/lib/cloud-errors");
const { sharedClosetErrorMessage } = await import("@/lib/shared-closet");
type SharedClosetAction = import("@/lib/shared-closet").SharedClosetAction;

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
const show = (e: unknown) => (e === RESOLVED ? "it resolved: a silent no-op" : String(e));

/* ------------------------------------------------------------ 1. classification */

console.log("\n1. cloudFailure sorts errors into what the user can do about them");

ok(cloudFailure(new CloudError("unconfigured")) === "unconfigured", "CloudError(unconfigured)");
ok(cloudFailure(new CloudError("signed-out")) === "signed-out", "CloudError(signed-out)");

const network = [
  "TypeError: Failed to fetch", // Chrome, wrapped by postgrest-js
  "TypeError: Load failed", // Safari and WKWebView, i.e. the iOS app
  "TypeError: NetworkError when attempting to fetch resource.", // Firefox
  "TypeError: fetch failed", // Node / undici
  "Failed to fetch",
];
for (const m of network) ok(cloudFailure(new Error(m)) === "network", `network: "${m}"`);

// auth-js wraps an unreachable auth server in AuthRetryableFetchError (status 0, or 502-504).
const retryable = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 });
ok(cloudFailure(retryable) === "network", "AuthRetryableFetchError → network");
const gateway = Object.assign(new Error("Bad Gateway"), { name: "AuthRetryableFetchError", status: 502 });
ok(cloudFailure(gateway) === "network", "AuthRetryableFetchError 502 → network");

ok(
  cloudFailure(new Error('new row violates row-level security policy for table "shared_closet_items"')) ===
    "forbidden",
  "RLS refusal → forbidden",
);
ok(cloudFailure(Object.assign(new Error("permission denied"), { code: "42501" })) === "forbidden", "code 42501 → forbidden");

ok(cloudFailure(new Error("boom")) === "unknown", "anything else → unknown");
ok(cloudFailure("a string") === "unknown", "a thrown string → unknown");
ok(cloudFailure(undefined) === "unknown", "undefined → unknown");
ok(cloudFailure(new Error("boom"), false) === "network", "the browser says it's offline → network, whatever the error");
ok(
  cloudFailure(new CloudError("signed-out"), false) === "signed-out",
  "…but a known cause still wins over the offline flag",
);

/* ------------------------------------------------------------------ 2. messages */

console.log("\n2. sharedClosetErrorMessage says what failed and what to do");

const actions: SharedClosetAction[] = [
  "create", "rename", "delete", "add", "remove", "edit", "invite", "accept", "decline", "leave",
  "load", "loadCloset", "following",
];
const samples: [string, unknown][] = [
  ["unconfigured", new CloudError("unconfigured")],
  ["signed-out", new CloudError("signed-out")],
  ["network", new Error("TypeError: Load failed")],
  ["forbidden", new Error('new row violates row-level security policy for table "shared_closet_items"')],
  ["unknown", new Error('duplicate key value violates unique constraint "shared_closets_pkey"')],
];
const leaks = /row-level|TypeError|Load failed|fetch|duplicate key|constraint|^Offline$|undefined|null/i;
let allClean = true;
let allEnd = true;
const seen = new Set<string>();
for (const a of actions) {
  for (const [, err] of samples) {
    const m = sharedClosetErrorMessage(a, err, true);
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

const create = (err: unknown) => sharedClosetErrorMessage("create", err, true);
ok(/sign in/i.test(create(new CloudError("signed-out"))), "signed out → tells you to sign in", create(new CloudError("signed-out")));
ok(/connection/i.test(create(new Error("Failed to fetch"))), "network → points at the connection", create(new Error("Failed to fetch")));
ok(!/sign in/i.test(create(new Error("Failed to fetch"))), "network → does NOT tell a signed-in user to sign in");
ok(
  /shared closets need cloud sync/i.test(create(new CloudError("unconfigured"))),
  "unconfigured → says Shared Closets need cloud sync",
  create(new CloudError("unconfigured")),
);
ok(
  /access to this closet/i.test(create(new Error("new row violates row-level security policy"))),
  "forbidden → says you lack access to this closet",
);
ok(/try again/i.test(create(new Error("boom"))), "unknown → invites a retry", create(new Error("boom")));
ok(/closet/i.test(create(new Error("boom"))), "the message names the thing that failed");
const add = sharedClosetErrorMessage("add", new Error("Failed to fetch"), true);
ok(/add/i.test(add), "add names adding", add);
const rename = sharedClosetErrorMessage("rename", new Error("boom"), true);
ok(/rename/i.test(rename), "rename names renaming", rename);
const leave = sharedClosetErrorMessage("leave", new Error("Failed to fetch"), true);
ok(/leave/i.test(leave), "leave names leaving", leave);

/* ------------------------------------------------------ 3. the real shared-closet.ts */

console.log("\n3. shared-closet.ts, against a stubbed Supabase");

// getSupabase() reads the env on every call and caches the client once it exists, so the
// unconfigured case has to run before the env is set.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SC = await import("@/lib/shared-closet");
const { getSupabase } = await import("@/lib/supabase/client");

const unconfigured = await rejection(SC.createSharedCloset("Shared closet"));
ok(cloudFailure(unconfigured) === "unconfigured", "no Supabase → createSharedCloset rejects as unconfigured", show(unconfigured));

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
    if (path === "/rest/v1/shared_closets" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const now = new Date().toISOString();
      return json(201, { id: "closet-1", cover_url: null, ...body, created_at: now, updated_at: now });
    }
    if (method === "GET") return json(200, []);
    return new Response(null, { status: 204 });
  }
  throw new Error(`unstubbed ${method} ${url}`);
};

const tee = { id: "i1", name: "Tee", imageUrl: "https://img.example/tee.png", category: "top" } as never;
const invitee = { id: "22222222-2222-4222-8222-222222222222", name: "Rin", handle: "rin" };
const me = { name: "Tess", handle: "tess" };

// 3a. no session at all
const sb = getSupabase()!;
ok(Boolean(sb), "the stubbed client exists");
for (const [label, p] of [
  ["createSharedCloset", () => SC.createSharedCloset("Shared closet")],
  ["addItemsFromMyCloset", () => SC.addItemsFromMyCloset("closet-1", [tee])],
  ["inviteMember", () => SC.inviteMember("closet-1", invitee, me)],
  ["respondInvite(accept)", () => SC.respondInvite("closet-1", true)],
  ["respondInvite(decline)", () => SC.respondInvite("closet-1", false)],
  ["leaveSharedCloset", () => SC.leaveSharedCloset("closet-1")],
] as const) {
  const e = await rejection(p());
  ok(cloudFailure(e) === "signed-out", `no session → ${label} rejects as signed-out`, show(e));
}
ok((await SC.listSharedClosets()).length === 0, "no session → listSharedClosets is still just empty");
ok((await SC.listPendingInvites()).length === 0, "no session → listPendingInvites is still just empty");

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
for (const [label, p] of [
  ["createSharedCloset", () => SC.createSharedCloset("Shared closet")],
  ["addItemsFromMyCloset", () => SC.addItemsFromMyCloset("closet-1", [tee])],
  ["inviteMember", () => SC.inviteMember("closet-1", invitee, me)],
  ["respondInvite(accept)", () => SC.respondInvite("closet-1", true)],
  ["leaveSharedCloset", () => SC.leaveSharedCloset("closet-1")],
] as const) {
  const e = await rejection(p());
  ok(cloudFailure(e) === "network", `auth unreachable → ${label} is network, not signed-out`, show(e));
}
const createAuthDown = await rejection(SC.createSharedCloset("Shared closet"));
ok(
  !/sign in/i.test(sharedClosetErrorMessage("create", createAuthDown, true)),
  "…so New no longer says 'sign in'",
  sharedClosetErrorMessage("create", createAuthDown, true),
);
const listDown = await rejection(SC.listSharedClosets());
ok(cloudFailure(listDown) === "network", "auth unreachable → listSharedClosets rejects instead of claiming none", show(listDown));
const invitesDown = await rejection(SC.listPendingInvites());
ok(cloudFailure(invitesDown) === "network", "auth unreachable → listPendingInvites rejects instead of claiming none", show(invitesDown));
ok((await sb.auth.getSession()).data.session?.user.id === USER.id, "a dropped connection does not sign you out");
console.error = logError;

mode.auth = "ok";
mode.rest = "down";
for (const [label, p] of [
  ["createSharedCloset", () => SC.createSharedCloset("Shared closet")],
  ["renameSharedCloset", () => SC.renameSharedCloset("closet-1", "Ours")],
  ["deleteSharedCloset", () => SC.deleteSharedCloset("closet-1")],
  ["addItemsFromMyCloset", () => SC.addItemsFromMyCloset("closet-1", [tee])],
  ["updateClosetItem", () => SC.updateClosetItem("item-1", { name: "Linen tee" })],
  ["removeClosetItem", () => SC.removeClosetItem("item-1")],
  ["inviteMember", () => SC.inviteMember("closet-1", invitee, me)],
  ["respondInvite(accept)", () => SC.respondInvite("closet-1", true)],
  ["leaveSharedCloset", () => SC.leaveSharedCloset("closet-1")],
  ["listSharedClosets", () => SC.listSharedClosets()],
  ["listPendingInvites", () => SC.listPendingInvites()],
  ["listClosetItems", () => SC.listClosetItems("closet-1")],
  ["listMembers", () => SC.listMembers("closet-1")],
] as const) {
  const e = await rejection(p());
  ok(cloudFailure(e) === "network", `PostgREST unreachable → ${label} is network`, show(e));
}

mode.rest = "rls";
const refused = await rejection(SC.createSharedCloset("Shared closet"));
ok(cloudFailure(refused) === "forbidden", "RLS refusal → forbidden", show(refused));
const addRefused = await rejection(SC.addItemsFromMyCloset("closet-1", [tee]));
ok(cloudFailure(addRefused) === "forbidden", "adding to a closet you were removed from → forbidden", show(addRefused));
const editRefused = await rejection(SC.updateClosetItem("item-1", { name: "Linen tee" }));
ok(cloudFailure(editRefused) === "forbidden", "editing in a closet you were removed from → forbidden", show(editRefused));

mode.rest = "ok";
calls.length = 0;
const made = await SC.createSharedCloset("Shared closet", me);
ok(
  made.id === "closet-1" && made.name === "Shared closet" && made.ownerId === USER.id,
  "success → the new closet comes back",
  JSON.stringify(made),
);
ok(calls.includes("PATCH /rest/v1/shared_closet_members"), "success → the owner's name is stamped on the membership", calls.join(", "));
calls.length = 0;
const added = await rejection(SC.addItemsFromMyCloset("closet-1", [tee]));
ok(added === RESOLVED && calls.includes("POST /rest/v1/shared_closet_items"), "success → Add upserts the pieces", calls.join(", "));
ok((await rejection(SC.leaveSharedCloset("closet-1"))) === RESOLVED, "success → leaving resolves");

console.log(`\n${fails === 0 ? "SHARED CLOSET ERROR CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
