/**
 * AJA-284 — the cross-table reference check that guards the image sweep.
 *
 * Run: npm run test:image-refs
 *
 * AJA-283 made deletion actually work, which made a latent bug reachable: three tables
 * deliberately snapshot an item's image URL so a friend can see it without reading the
 * owner's private wardrobe row, and the sweep asked only "does another ITEM use this?".
 * Deleting a shared piece left a permanently broken image in someone else's chat.
 *
 * Two halves:
 *   1. Pure assertions on the decision + guards. Always run.
 *   2. A LIVE drift scan — re-derives which tables actually hold wardrobe-images URLs
 *      and fails when one isn't in REF_SOURCES. The hand-written list is the weak point
 *      of this fix (it rots exactly like the assumption that caused the bug), so drift
 *      has to be a red test rather than a silent deletion. Needs the service key; when
 *      it can't run it says so LOUDLY and exits non-zero, because a skipped safety check
 *      that reports "passed" is the failure mode this whole issue is about.
 *
 * NON-VACUITY: every "kept" assertion is paired with a "deleted" control on the same
 * input. A function returning [] unconditionally is the bug; it must fail these.
 */
import {
  REF_SOURCES,
  ilikeOr,
  isFilterSafePath,
  mentionsPath,
  ownsPath,
  refColumns,
  unreferencedPaths,
} from "@/lib/image-refs";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const same = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const UID = "4cea3e46-1111-2222-3333-444455556666";
const OTHER = "99999999-aaaa-bbbb-cccc-dddddddddddd";
const A = `${UID}/a.jpg`;
const B = `${UID}/b.png`;
const pub = (p: string) =>
  `https://xyz.supabase.co/storage/v1/object/public/wardrobe-images/${p}`;

console.log("\n=== ownsPath — the guard that stops this route deleting other folders ===");
ok(ownsPath(A, UID) === true, "own folder accepted (POSITIVE CONTROL)");
ok(ownsPath(`${OTHER}/a.jpg`, UID) === false, "another user's folder rejected");
// The single assertion that a startsWith implementation fails.
ok(ownsPath(`${UID}x/a.jpg`, UID) === false, "prefix attack `<uid>x/` rejected");
ok(ownsPath(`${UID}/../${OTHER}/a.jpg`, UID) === false, "traversal rejected");
ok(ownsPath(UID, UID) === false, "bare folder with no file rejected");
ok(ownsPath(`/${UID}/a.jpg`, UID) === false, "leading slash rejected");
ok(ownsPath("", UID) === false, "empty string rejected");
ok(ownsPath(null, UID) === false, "null rejected");
ok(ownsPath(42, UID) === false, "non-string rejected");
ok(ownsPath(A, "") === false, "empty userId never matches");

console.log("\n=== mentionsPath — must be wrong in the KEEP direction, never the delete one ===");
ok(mentionsPath(pub(A), A) === true, "plain public URL matches (POSITIVE CONTROL)");
ok(mentionsPath(pub(A) + "?width=200", A) === true, "query string still matches");
ok(mentionsPath(pub(encodeURIComponent(A)), A) === true, "percent-encoded URL still matches");
ok(mentionsPath({ kind: "item", item: { imageUrl: pub(A) } }, A) === true, "nested jsonb payload matches");
ok(mentionsPath([{ imageUrl: pub(A) }], A) === true, "array payload matches");
ok(mentionsPath(pub(B), A) === false, "a DIFFERENT path does not match");
ok(mentionsPath(null, A) === false, "null does not match");
ok(mentionsPath(undefined, A) === false, "undefined does not match");
ok(mentionsPath(pub(A), "") === false, "empty path never matches anything");

console.log("\n=== unreferencedPaths — the decision ===");
ok(same(unreferencedPaths([A, B], new Set(), false), [A, B]), "nothing referenced -> both deleted (POSITIVE CONTROL)");
ok(same(unreferencedPaths([A, B], new Set([A]), false), [B]), "referenced path kept, free one deleted");
ok(same(unreferencedPaths([A, B], new Set([A, B]), false), []), "all referenced -> nothing deleted");
// The fail-closed property. Without it a partial scan reads as "unreferenced".
ok(same(unreferencedPaths([A, B], new Set(), true), []), "scan failed -> delete NOTHING even though nothing was found");
ok(
  same(unreferencedPaths([A, B], new Set(), false), [A, B]) &&
    same(unreferencedPaths([A, B], new Set(), true), []),
  "…and the scanFailed flag is what makes the difference (same inputs otherwise)",
);
ok(same(unreferencedPaths([], new Set(), false), []), "no candidates -> nothing deleted");

console.log("\n=== REF_SOURCES shape ===");
ok(REF_SOURCES.length > 0, "reference map is not empty");
ok(
  REF_SOURCES.every((s) => s.table && (s.text.length > 0 || (s.jsonb?.length ?? 0) > 0)),
  "every source names a table and at least one column",
);
ok(
  new Set(refColumns()).size === refColumns().length,
  "no duplicate table.column pairs",
);

console.log("\n=== filter safety — a malformed filter matches nothing, which reads as 'delete me' ===");
ok(isFilterSafePath(A) === true, "a normal uuid path is filter-safe (POSITIVE CONTROL)");
ok(isFilterSafePath(`${UID}/a,b.jpg`) === false, "a comma would end the or() term — rejected");
ok(isFilterSafePath(`${UID}/a).jpg`) === false, "a paren would close the or() group — rejected");
ok(isFilterSafePath(`${UID}/a*b.jpg`) === false, "a wildcard would widen the match — rejected");
ok(isFilterSafePath(`${UID}/../x.jpg`) === false, "traversal rejected here too");
ok(
  ilikeOr(["c1", "c2"], ["p1", "p2"]) === "c1.ilike.*p1*,c1.ilike.*p2*,c2.ilike.*p1*,c2.ilike.*p2*",
  "ilikeOr builds the full column x path cross product",
  ilikeOr(["c1", "c2"], ["p1", "p2"]),
);

// ---------------------------------------------------------------------------
// LIVE drift scan
// ---------------------------------------------------------------------------
console.log("\n=== live drift scan (does REF_SOURCES still match the database?) ===");

const { readFileSync } = await import("node:fs");
let env: Record<string, string> = {};
try {
  env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
} catch {
  /* handled below */
}
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  fails++;
  console.log("  FAIL  cannot reach the database — no SUPABASE_SERVICE_ROLE_KEY.");
  console.log("        This check is NOT optional: REF_SOURCES falling behind the schema is");
  console.log("        the same class of bug AJA-284 fixes, so an unrun scan is a failure,");
  console.log("        not a skip.");
} else {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const spec = (await (await fetch(`${SB_URL}/rest/v1/`, { headers })).json()) as {
    definitions?: Record<string, { properties?: Record<string, { format?: string }> }>;
  };
  const defs = spec.definitions ?? {};
  const tables = Object.keys(defs);
  ok(tables.length > 0, "read the live OpenAPI spec", `${tables.length} tables`);

  // Never hand-list the tables to scan — that is the assumption being tested.
  const known = new Set(refColumns());
  const RE = /wardrobe-images\/[^"'\\\s)?]+/;
  const surprises: string[] = [];
  const unreadable: string[] = [];

  for (const table of tables) {
    if (table === "wardrobe_snapshots") continue; // checked separately by the route
    const cols = Object.entries(defs[table]?.properties ?? {})
      .filter(([, v]) => v.format === "text" || v.format === "jsonb" || v.format === "character varying")
      .map(([k]) => k);
    if (!cols.length) continue;
    const res = await fetch(
      `${SB_URL}/rest/v1/${table}?select=${encodeURIComponent(cols.join(","))}&limit=2000`,
      { headers },
    );
    if (!res.ok) {
      unreadable.push(`${table} (HTTP ${res.status})`);
      continue;
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    for (const row of rows) {
      for (const c of cols) {
        const v = row[c];
        if (v == null) continue;
        const s = typeof v === "string" ? v : JSON.stringify(v);
        if (RE.test(s) && !known.has(`${table}.${c}`)) surprises.push(`${table}.${c}`);
      }
    }
  }

  ok(
    unreadable.length === 0,
    "every table was readable (an unreadable one could hide a reference)",
    unreadable.join(", "),
  );
  ok(
    surprises.length === 0,
    "no table outside REF_SOURCES holds a wardrobe-images URL",
    [...new Set(surprises)].join(", "),
  );

  // Positive control: the scan must actually be finding references, or "no surprises"
  // means nothing at all. Confirm it sees the sources we DO know about.
  const seen: string[] = [];
  for (const s of REF_SOURCES) {
    for (const col of [...s.text, ...(s.jsonb ?? [])]) {
      const res = await fetch(
        `${SB_URL}/rest/v1/${s.table}?select=${encodeURIComponent(col)}&limit=2000`,
        { headers },
      );
      if (!res.ok) continue;
      const rows = (await res.json()) as Record<string, unknown>[];
      const hit = rows.some((r) => {
        const v = r[col];
        if (v == null) return false;
        return RE.test(typeof v === "string" ? v : JSON.stringify(v));
      });
      if (hit) seen.push(`${s.table}.${col}`);
    }
  }
  ok(
    seen.length > 0,
    "POSITIVE CONTROL: the scanner does find real references",
    `${seen.length}/${refColumns().length} mapped columns currently populated`,
  );

  // -------------------------------------------------------------------------
  // The REAL scan, against the REAL database. Not a reimplementation — this is the
  // exact function the route calls. Without this the scan only ever runs behind an
  // authenticated HTTP call, i.e. it ships unrun, which is how AJA-283 went out
  // against a bucket that had no delete policy.
  // -------------------------------------------------------------------------
  console.log("\n=== scanReferences against live data ===");
  const { createClient } = await import("@supabase/supabase-js");
  const { scanReferences } = await import("@/lib/image-refs-server");
  const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  // Find a path that IS shared (in shared_closet_items) and one that is not, straight
  // from the database, so the fixtures can't drift out of date.
  const sharedRes = await fetch(
    `${SB_URL}/rest/v1/shared_closet_items?select=item_image_url&item_image_url=ilike.*wardrobe-images*&limit=1`,
    { headers },
  );
  const sharedBody = await sharedRes.json();
  const sharedRows = (Array.isArray(sharedBody) ? sharedBody : []) as { item_image_url: string }[];
  if (!Array.isArray(sharedBody))
    console.log(`  ....  shared_closet_items query error: ${JSON.stringify(sharedBody).slice(0, 120)}`);
  const MARK = "/storage/v1/object/public/wardrobe-images/";
  const sharedPath = sharedRows[0]?.item_image_url?.includes(MARK)
    ? decodeURIComponent(sharedRows[0].item_image_url.split(MARK)[1].split("?")[0])
    : null;

  if (!sharedPath) {
    fails++;
    console.log("  FAIL  no shared_closet_items row to test against — cannot prove the scan works");
  } else {
    const owner = sharedPath.slice(0, sharedPath.indexOf("/"));
    const invented = `${owner}/00000000-0000-4000-8000-000000000000.jpg`;

    // Which of the owner's items holds that path? Excluding it is what makes the rest of
    // this an honest test — otherwise the owner's own snapshot answers "referenced" and
    // the shared-closet lookup is never the thing being measured.
    const snapRes = await fetch(
      `${SB_URL}/rest/v1/wardrobe_snapshots?select=items&user_id=eq.${owner}&limit=1`,
      { headers },
    );
    const snapRows = (await snapRes.json()) as { items?: Record<string, unknown>[] }[];
    const holder = (snapRows[0]?.items ?? []).find((it) =>
      JSON.stringify(it).includes(sharedPath),
    );
    const holderId = holder?.id as string | undefined;
    ok(!!holderId, "the shared path belongs to a real item the owner still has", String(holderId));

    // THE RACE. `deleteItem` fires the sweep before the snapshot push lands, so the
    // server still lists the item. Without excludeItemId everything reads as referenced
    // and the sweep silently removes nothing.
    const stale = await scanReferences(admin, [invented], owner);
    const excluded = holderId
      ? await scanReferences(admin, [sharedPath], owner, holderId)
      : null;
    void stale;

    const r = await scanReferences(admin, [sharedPath, invented], owner, holderId);
    ok(!r.failed, "scan completed without falling back to fail-closed", r.notes.join("; "));
    ok(
      excluded !== null && excluded.referenced.has(sharedPath),
      "with the deleted item EXCLUDED, the shared closet alone still marks the path referenced",
      sharedPath,
    );
    ok(
      r.referenced.has(sharedPath),
      "a path in a SHARED CLOSET is reported as referenced",
      sharedPath,
    );
    // The control. Without it, a scan that marked everything referenced would pass above.
    ok(
      !r.referenced.has(invented),
      "a path nothing points at is NOT reported as referenced",
      invented,
    );
    ok(
      same(unreferencedPaths([sharedPath, invented], r.referenced, r.failed), [invented]),
      "…so exactly the unshared path would be deleted",
    );

    // A message payload is jsonb — the code path PostgREST cannot filter, scanned in
    // memory instead. Different mechanism, so it needs its own evidence.
    const msgRes = await fetch(`${SB_URL}/rest/v1/messages?select=payload&limit=200`, { headers });
    const msgs = (await msgRes.json()) as { payload: unknown }[];
    const inMsg = msgs
      .map((m) => JSON.stringify(m.payload ?? ""))
      .flatMap((s) => [...s.matchAll(/wardrobe-images\\?\/([^"'\\\s)?]+)/g)].map((m) => m[1]))
      .map((p) => decodeURIComponent(p.replace(/\\\//g, "/")))[0];
    if (!inMsg) {
      console.log("  ....  no message payload holds an image — jsonb path not exercised");
    } else {
      const mOwner = inMsg.slice(0, inMsg.indexOf("/"));
      const mSnap = await fetch(
        `${SB_URL}/rest/v1/wardrobe_snapshots?select=items&user_id=eq.${mOwner}&limit=1`,
        { headers },
      );
      const mRows = (await mSnap.json()) as { items?: Record<string, unknown>[] }[];
      const mHolder = (mRows[0]?.items ?? []).find((it) => JSON.stringify(it).includes(inMsg));
      const r2 = await scanReferences(admin, [inMsg], mOwner, mHolder?.id as string | undefined);
      ok(
        r2.referenced.has(inMsg),
        "a path inside a CHAT MESSAGE payload (jsonb) is referenced, with its item excluded",
        inMsg,
      );
    }

    // The exclusion must be surgical: it removes ONE item from consideration, not the
    // whole snapshot. Pick a path held by a different item and confirm it stays
    // referenced while `holderId` is excluded.
    const others = (snapRows[0]?.items ?? []).filter((it) => it.id !== holderId);
    const MARK2 = "/storage/v1/object/public/wardrobe-images/";
    const otherPath = others
      .map((it) => String(it.imageUrl ?? ""))
      .find((u) => u.includes(MARK2) && u.includes(owner));
    if (otherPath) {
      const p = decodeURIComponent(otherPath.split(MARK2)[1].split("?")[0]);
      const r3 = await scanReferences(admin, [p], owner, holderId);
      ok(
        r3.referenced.has(p),
        "excluding one item does NOT stop other items protecting their own images",
        p,
      );
    } else {
      fails++;
      console.log("  FAIL  no second item image found — surgical-exclusion check could not run");
    }
  }
}

console.log(`\n${fails === 0 ? "ALL IMAGE-REF CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
