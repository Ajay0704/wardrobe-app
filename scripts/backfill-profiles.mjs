// AJA-196 — backfill the public `profiles` directory for auth users who have no
// row (so username/name search in Find Friends can surface them). Reuses the
// app's handle rules (sanitizeHandle/validateHandle) and the ensureProfile
// collision strategy. Runs on your Mac with the service-role key; prints nothing
// to Claude's transcript.
//
// Dry run (prints what it WOULD do, writes nothing):
//   node --env-file=.env.local scripts/backfill-profiles.mjs
// Commit (writes to prod):
//   node --env-file=.env.local scripts/backfill-profiles.mjs --commit

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env — run with:  node --env-file=.env.local scripts/backfill-profiles.mjs");
  process.exit(1);
}
const commit = process.argv.includes("--commit");
const admin = createClient(url, key, { auth: { persistSession: false } });

// Mirror of sanitizeHandle + validateHandle rules (a–z 0–9 . _, 3–20 chars,
// no leading/trailing or doubled . _).
const sanitize = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .replace(/[._]{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "");

function deriveBase(email, name) {
  let h = sanitize((email && email.split("@")[0]) || name || "");
  if (h.length < 3) h = (h + "user").replace(/[._]{2,}/g, ".");
  return h.slice(0, 20).replace(/[._]+$/g, "") || "user";
}

let page = 1;
let users = [];
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error("listUsers failed:", error.message); process.exit(1); }
  users = users.concat(data.users);
  if (data.users.length < 1000) break;
  page += 1;
}

const { data: existing, error: pe } = await admin.from("profiles").select("id, username");
if (pe) { console.error("read profiles failed:", pe.message); process.exit(1); }
const haveId = new Set(existing.map((r) => r.id));
const usedHandles = new Set(existing.map((r) => (r.username || "").toLowerCase()).filter(Boolean));

const missing = users.filter((u) => !haveId.has(u.id) && u.email);
const rows = [];
for (const u of missing) {
  const meta = u.user_metadata || {};
  const name = meta.display_name || meta.name || meta.full_name || null;
  let handle = deriveBase(u.email, name);
  if (usedHandles.has(handle)) handle = `${handle}-${u.id.slice(0, 4)}`.slice(0, 20);
  usedHandles.add(handle);
  rows.push({ id: u.id, username: handle, display_name: name, updated_at: new Date().toISOString() });
}

console.log(`auth users: ${users.length} | existing profiles: ${existing.length} | to backfill: ${rows.length}`);
for (const r of rows) console.log(`  ${r.id.slice(0, 8)}  @${r.username}${r.display_name ? "  (" + r.display_name + ")" : ""}`);

if (!commit) {
  console.log("\nDRY RUN — review the handles above, then re-run with --commit to write.");
  process.exit(0);
}

const { error } = await admin.from("profiles").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
if (error) { console.error("write failed:", error.message); process.exit(1); }
console.log(`\n✅ Backfilled ${rows.length} profiles. Find Friends can now surface them.`);
