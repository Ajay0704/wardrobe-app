/**
 * AJA-304 — a follows read that failed must not come back as "you follow nobody".
 *
 * Run: npm run test:follow-errors
 *
 * `fetchFollowingUsers` ignored the error from its `follows` query (so did the
 * `fetchFollowing` and `fetchProfilesByIds` it leans on), so offline it resolved `[]` and
 * the Trip and Shared Closet invite panels said "Follow people to invite them…". And
 * community.ts's own `currentUserId()` read an unreachable auth server as "no user" — the
 * bug trips.ts (AJA-302) and shared-closet.ts (AJA-303) had — so posting offline said
 * "Sign in to post" and likes/follows resolved as silent no-ops. This suite runs the REAL
 * community.ts against a stubbed Supabase (fetch is replaced, nothing leaves the machine):
 *
 *  1. Not configured: the follow reads are still just empty (there's no cloud to fail).
 *  2. Genuinely signed out keeps its old behaviour.
 *  3. Signed in, everything up: identities resolve from the profiles directory.
 *  4. A follows or profiles read that errors (500, or PostgREST unreachable) rejects,
 *     and a dropped connection reads as a network failure the views can word.
 *  5. Auth server unreachable: reads and writes reject as network instead of
 *     "no user" — but the feed still loads, because viewer state is decoration.
 */

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
const show = (e: unknown) => (e === RESOLVED ? "it resolved" : String(e));

// The invite panels' own classifier and wording. `online` is pinned to true so an error
// only counts as "network" on its own merits, not because the runtime says it's offline.
const { cloudFailure } = await import("@/lib/cloud-errors");
const { tripErrorMessage } = await import("@/lib/trips");
const { sharedClosetErrorMessage } = await import("@/lib/shared-closet");
const isNetwork = (e: unknown) => cloudFailure(e, true) === "network";
/** What Travel's and Shared Closets' invite panels toast for this failure. */
const panelsSay = (e: unknown, when: string) => {
  for (const [view, say] of [
    ["Travel", tripErrorMessage],
    ["Shared Closet", sharedClosetErrorMessage],
  ] as const) {
    const m = say("following", e, true);
    ok(/check your connection/i.test(m) && !/follow people/i.test(m), `${when} → ${view}'s invite panel says to check the connection`, m);
  }
};

/* ------------------------------------------------------------- 1. unconfigured */

console.log("\n1. No Supabase configured");

// getSupabase() reads the env on every call and caches the client once it exists, so the
// unconfigured case has to run before the env is set.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const C = await import("@/lib/community");
const { getSupabase } = await import("@/lib/supabase/client");

ok((await C.fetchFollowingUsers("anyone")).length === 0, "fetchFollowingUsers is just empty");
ok((await C.fetchFollowing("anyone")).length === 0, "fetchFollowing is just empty");
ok((await C.fetchFollowers("anyone")).length === 0, "fetchFollowers is just empty");

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

/* ---------------------------------------------------------------- the stub */

// One router stands in for the auth server and PostgREST. `fail` breaks one table at a
// time: "down" throws like a dropped connection, "500" answers with a PostgREST error.
type Break = "down" | "500";
const mode: { auth: "ok" | "down"; fail: Record<string, Break> } = { auth: "ok", fail: {} };
const calls: string[] = [];
const ME = "11111111-1111-4111-8111-111111111111";
const RIN = "22222222-2222-4222-8222-222222222222";
const KAI = "33333333-3333-4333-8333-333333333333";
const USER = { id: ME, aud: "authenticated", role: "authenticated", email: "t@example.com" };
const follows = [
  { follower_id: ME, following_id: RIN, actor_name: "Tess", actor_handle: "tess", actor_avatar: null, created_at: "2026-10-01T00:00:00Z" },
  { follower_id: ME, following_id: KAI, actor_name: "Tess", actor_handle: "tess", actor_avatar: null, created_at: "2026-09-01T00:00:00Z" },
  { follower_id: RIN, following_id: ME, actor_name: "Rin", actor_handle: "rin", actor_avatar: null, created_at: "2026-09-15T00:00:00Z" },
];
const profiles = [
  { id: RIN, username: "rin", display_name: "Rin", avatar_url: null },
  { id: KAI, username: "kai", display_name: "Kai", avatar_url: null },
  { id: ME, username: "tess", display_name: "Tess", avatar_url: null },
];
const post = {
  id: "post-1", author_id: RIN, author_name: "Rin", author_handle: "rin", author_avatar: null,
  kind: "ootd", image_url: null, caption: "Linen day", tags: [], look_title: null, poll_options: [],
  tagged_user_ids: [], likes: 3, saves: 1, comments: 0, created_at: "2026-10-20T00:00:00Z",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
/** PostgREST's `col=eq.x` / `col=in.(a,b)` filters, enough for these tables. */
const matches = (row: Record<string, unknown>, params: URLSearchParams) =>
  [...params].every(([col, f]) => {
    if (col === "select" || col === "order" || col === "limit") return true;
    if (f.startsWith("eq.")) return String(row[col]) === f.slice(3);
    if (f.startsWith("in.(")) return f.slice(4, -1).split(",").map((v) => v.replace(/"/g, "")).includes(String(row[col]));
    return true;
  });

(globalThis as { fetch: typeof fetch }).fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push(`${method} ${url.pathname}`);
  if (url.pathname === "/auth/v1/user") {
    if (mode.auth === "down") throw new TypeError("fetch failed");
    return json(200, USER);
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length);
    const broken = mode.fail[table];
    if (broken === "down") throw new TypeError("fetch failed");
    if (broken === "500") {
      return json(500, { code: "XX000", message: "upstream connect error", details: null, hint: null });
    }
    if (method === "GET") {
      const rows = table === "follows" ? follows : table === "profiles" ? profiles : table === "posts" ? [post] : [];
      return json(200, rows.filter((r) => matches(r as Record<string, unknown>, url.searchParams)));
    }
    if (method === "POST" && table === "posts") {
      return json(201, { ...post, id: "post-2", author_id: ME, ...JSON.parse(String(init?.body ?? "{}")) });
    }
    if (method === "POST" && table === "post_comments") {
      return json(201, { id: "c-1", post_id: "post-1", user_id: ME, created_at: post.created_at, ...JSON.parse(String(init?.body ?? "{}")) });
    }
    return new Response(null, { status: method === "POST" ? 201 : 204 });
  }
  throw new Error(`unstubbed ${method} ${url.href}`);
};

// postgrest-js retries a failed GET three times with a 1s/2s/4s backoff. Collapse that
// backoff while a table is "down" so each case takes milliseconds, not seven seconds.
const realSetTimeout = globalThis.setTimeout;
(globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) =>
  realSetTimeout(fn, ms === 1000 || ms === 2000 || ms === 4000 ? 0 : ms, ...rest)) as typeof setTimeout;

const sb = getSupabase()!;
ok(Boolean(sb), "the stubbed client exists");
const me = { name: "Tess", handle: "tess" };

/* -------------------------------------------------------------- 2. signed out */

console.log("\n2. Genuinely signed out keeps its old behaviour");

ok(
  /sign in to post/i.test(show(await rejection(C.createPost({ kind: "ootd", caption: "x" }, me)))),
  "createPost still says 'Sign in to post'",
);
ok(
  /sign in to comment/i.test(show(await rejection(C.addComment("post-1", "nice", me)))),
  "addComment still says 'Sign in to comment'",
);
for (const [label, p] of [
  ["toggleLike", () => C.toggleLike("post-1", true, me)],
  ["toggleFollow", () => C.toggleFollow(RIN, true, me)],
] as const) {
  ok((await rejection(p())) === RESOLVED, `${label} is still a no-op, not a rejection`);
}

/* ----------------------------------------------------------- 3. signed in, up */

console.log("\n3. Signed in, everything up");

// A well-formed JWT the stub accepts; nothing verifies the signature.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ME, exp, role: "authenticated", aud: "authenticated" })}.sig`;
const set = await sb.auth.setSession({ access_token: jwt, refresh_token: "stub-refresh" });
ok(!set.error && set.data.session?.user.id === ME, "signed in on the stub", set.error?.message ?? "");

const following = await C.fetchFollowingUsers(ME);
ok(
  following.map((u) => u.name).join(",") === "Rin,Kai",
  "fetchFollowingUsers names everyone you follow from the profiles directory",
  JSON.stringify(following),
);
ok(following.every((u) => u.isFollowing), "…and marks them as followed");
ok((await C.fetchFollowing(ME)).join(",") === `${RIN},${KAI}`, "fetchFollowing returns the ids");
const followers = await C.fetchFollowers(ME);
ok(followers.length === 1 && followers[0].name === "Rin", "fetchFollowers names your follower", JSON.stringify(followers));
ok((await C.fetchFollowingUsers(KAI)).length === 0, "someone who follows nobody → []");
const feed = await C.fetchFeed();
ok(feed.posts.length === 1 && feed.posts[0].caption === "Linen day", "fetchFeed loads");

/* ------------------------------------------------------- 4. a read that errors */

console.log("\n4. A follows or profiles read that errors rejects instead of claiming nobody");

const logError = console.error;
for (const broken of ["500", "down"] as const) {
  mode.fail = { follows: broken };
  for (const [label, p] of [
    ["fetchFollowingUsers", () => C.fetchFollowingUsers(ME)],
    ["fetchFollowing", () => C.fetchFollowing(ME)],
    ["fetchFollowers", () => C.fetchFollowers(ME)],
  ] as const) {
    const e = await rejection(p());
    ok(e !== RESOLVED, `follows ${broken} → ${label} rejects`, show(e));
    if (broken === "down") ok(isNetwork(e), `…and reads as a network failure`, show(e));
  }

  // The follows rows came back but the names didn't: "@user" ×2 is not an invite list.
  mode.fail = { profiles: broken };
  const e = await rejection(C.fetchFollowingUsers(ME));
  ok(e !== RESOLVED, `profiles ${broken} → fetchFollowingUsers rejects`, show(e));
  if (broken === "down") ok(isNetwork(e), "…and reads as a network failure", show(e));
}

// The bug as reported: offline, the invite panel said you follow nobody.
mode.fail = { follows: "down" };
panelsSay(await rejection(C.fetchFollowingUsers(ME)), "follows unreachable");
mode.fail = {};

/* ------------------------------------------------------- 5. auth unreachable */

console.log("\n5. Auth server unreachable is a network failure, not 'no user'");

// auth-js console.errors every failed fetch before wrapping it; that's expected here.
console.error = () => {};
mode.auth = "down";
const invite = await rejection(C.fetchFollowingUsers(ME));
ok(isNetwork(invite), "fetchFollowingUsers rejects as network", show(invite));
panelsSay(invite, "auth unreachable");

const post1 = await rejection(C.createPost({ kind: "ootd", caption: "x" }, me));
ok(isNetwork(post1) && !/sign in/i.test(show(post1)), "createPost is network, not 'Sign in to post'", show(post1));
const comment = await rejection(C.addComment("post-1", "nice", me));
ok(isNetwork(comment) && !/sign in/i.test(show(comment)), "addComment is network, not 'Sign in to comment'", show(comment));

// These used to resolve as silent no-ops; every caller already reverts in its .catch.
for (const [label, p] of [
  ["toggleLike", () => C.toggleLike("post-1", true, me)],
  ["toggleSave", () => C.toggleSave("post-1", true)],
  ["toggleRepost", () => C.toggleRepost("post-1", true)],
  ["votePoll", () => C.votePoll("post-1", 0, me)],
  ["toggleFollow", () => C.toggleFollow(RIN, true, me)],
] as const) {
  calls.length = 0;
  const e = await rejection(p());
  ok(isNetwork(e), `${label} rejects as network instead of a silent no-op`, show(e));
  ok(!calls.some((c) => c.startsWith("POST /rest/")), `…and writes nothing`, calls.join(", "));
}

// Viewer state (liked / saved / my vote) only decorates the cards. A flaky auth server
// mustn't take the feed down with it.
const feedAuthDown = await rejection(C.fetchFeed());
ok(feedAuthDown === RESOLVED, "fetchFeed still resolves", show(feedAuthDown));
const feedPosts = (await C.fetchFeed()).posts;
ok(feedPosts.length === 1 && !feedPosts[0].liked, "…with the posts, viewer state left blank", JSON.stringify(feedPosts.map((p) => p.id)));
const profilePosts = await rejection(C.fetchUserPosts(RIN));
ok(profilePosts === RESOLVED, "fetchUserPosts (profile grid) still resolves", show(profilePosts));

ok((await sb.auth.getSession()).data.session?.user.id === ME, "a dropped connection does not sign you out");
console.error = logError;
mode.auth = "ok";

ok((await C.fetchFollowingUsers(ME)).length === 2, "back online → the list loads again");

console.log(`\n${fails === 0 ? "FOLLOW ERROR CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
