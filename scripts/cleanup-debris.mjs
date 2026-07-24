// AJA-196 — delete E2E/test/demo auth accounts (and their cascaded data) so they
// stop polluting Find Friends + user counts. IRREVERSIBLE. Runs on your Mac.
//
// Targets (by email):
//   • @wardrobe.demo / @wardrobe.dev   (seeded demo + dev-test profiles)
//   • wp.qa.*                          (QA accounts)
//   • *.<7+ digit timestamp>@…         (automated E2E signups: probe/uitest/snap/…)
// NEVER deletes: apple-review@wardrobe.app (App Store review login) or any real user.
// `hu@gmail.com` is reported but NOT auto-deleted (ambiguous) — pass --include-hu to add it.
//
// Dry run (lists, deletes nothing):
//   node --env-file=.env.local scripts/cleanup-debris.mjs
// Commit (deletes):
//   node --env-file=.env.local scripts/cleanup-debris.mjs --commit

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Run with:  node --env-file=.env.local scripts/cleanup-debris.mjs"); process.exit(1); }
const commit = process.argv.includes("--commit");
const includeHu = process.argv.includes("--include-hu");
const admin = createClient(url, key, { auth: { persistSession: false } });

const NEVER_DELETE = new Set(["apple-review@wardrobe.app"]);
const isDebris = (email) => {
  const e = (email || "").toLowerCase();
  if (NEVER_DELETE.has(e)) return false;
  if (e.endsWith("@wardrobe.demo") || e.endsWith("@wardrobe.dev")) return true;
  if (/(^|\+|\.)wp\.qa\./.test(e) || e.startsWith("wp.qa.")) return true;
  if (/\.\d{7,}@/.test(e)) return true;               // *.1783xxxxxxx@… E2E signups
  if (includeHu && e === "hu@gmail.com") return true;
  return false;
};

let page = 1, users = [];
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error("listUsers failed:", error.message); process.exit(1); }
  users = users.concat(data.users);
  if (data.users.length < 1000) break;
  page += 1;
}

const toDelete = users.filter((u) => isDebris(u.email));
const keep = users.filter((u) => !isDebris(u.email));

console.log(`total ${users.length} | DELETE ${toDelete.length} | KEEP ${keep.length}\n`);
console.log("WOULD DELETE:");
for (const u of toDelete) console.log(`  ✗ ${u.email}`);
console.log("\nKEEP (sample of real/kept):");
for (const u of keep) console.log(`  ✓ ${u.email}`);

if (!commit) { console.log("\nDRY RUN — review the DELETE list, then re-run with --commit."); process.exit(0); }

let ok = 0, fail = 0;
for (const u of toDelete) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) { console.error(`  failed ${u.email}: ${error.message}`); fail += 1; }
  else ok += 1;
}
console.log(`\n✅ deleted ${ok}${fail ? `, ${fail} failed` : ""}. Now run the backfill for the real stragglers.`);
