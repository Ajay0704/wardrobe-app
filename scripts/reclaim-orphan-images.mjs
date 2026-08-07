/**
 * AJA-283 — find (and optionally delete) images in `wardrobe-images` that nothing
 * references any more.
 *
 *   node scripts/reclaim-orphan-images.mjs                 # dry run, all users
 *   node scripts/reclaim-orphan-images.mjs --user <uuid>   # one user
 *   node scripts/reclaim-orphan-images.mjs --min-age 7     # only older than N days (default 7)
 *   node scripts/reclaim-orphan-images.mjs --yes           # actually delete
 *
 * Deleting is IRREVERSIBLE and the default is a dry run, deliberately.
 *
 * WHY THE REFERENCE SCAN IS SO BROAD. The obvious version — walk `wardrobe_snapshots`
 * and collect `items[].imageUrl` and friends — is wrong, and dangerously so: it misses
 * `profiles.avatarUrl`, shared-closet copies, styling-session pieces, detections and
 * notification thumbnails. On the account this was written against, the narrow scan
 * found 547 referenced paths and the full one found 685. The 138-file difference
 * included the user's own avatar. So: every REST-exposed table, every row, every user,
 * stringified and regex-scanned. Slower and boring, and it cannot quietly delete a live
 * image because it forgot a column.
 *
 * If any table fails to scan, the run refuses to delete — an incomplete reference set
 * is indistinguishable from "these files are orphans".
 *
 * The age floor guards a case the database cannot see: a device that is offline or has
 * not pushed yet holds items whose uploads exist in Storage but appear in no snapshot.
 * Recent uploads are exactly those, so they are left alone.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const APPLY = flag("--yes");
const ONLY_USER = value("--user", null);
const MIN_AGE_DAYS = Number(value("--min-age", 7));
const BUCKET = "wardrobe-images";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Every table PostgREST exposes — read from the live schema, never hand-listed. */
async function allTables() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const spec = await res.json();
  return Object.keys(spec.definitions ?? spec.components?.schemas ?? {});
}

const PATH_RX = /wardrobe-images\/([^"'\\\s)?]+)/g;

async function collectReferences(tables) {
  const refs = new Set();
  const failed = [];
  for (const t of tables) {
    let offset = 0;
    for (;;) {
      const { data, error } = await db.from(t).select("*").range(offset, offset + 499);
      if (error) {
        failed.push(`${t}: ${error.message}`);
        break;
      }
      if (!data?.length) break;
      for (const row of data) {
        const s = JSON.stringify(row);
        PATH_RX.lastIndex = 0;
        let m;
        while ((m = PATH_RX.exec(s))) {
          let p = m[1];
          try {
            p = decodeURIComponent(p);
          } catch {
            /* keep the raw form */
          }
          refs.add(p);
        }
      }
      if (data.length < 500) break;
      offset += 500;
    }
  }
  return { refs, failed };
}

async function listFolder(prefix) {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data?.length) break;
    for (const e of data) {
      if (e.id === null) out.push(...(await listFolder(`${prefix}/${e.name}`)));
      else out.push({ path: `${prefix}/${e.name}`, size: e.metadata?.size ?? 0, created: e.created_at });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;

const tables = await allTables();
console.log(`scanning ${tables.length} tables for image references…`);
const { refs, failed } = await collectReferences(tables);
console.log(`  ${refs.size} distinct paths referenced`);
if (failed.length) {
  console.log("\nREFUSING TO DELETE — these tables could not be scanned:");
  for (const f of failed) console.log(`  ${f}`);
  console.log("An incomplete reference set looks exactly like a pile of orphans.");
  process.exit(1);
}

let folders;
if (ONLY_USER) folders = [ONLY_USER];
else {
  const { data } = await db.storage.from(BUCKET).list("", { limit: 1000 });
  folders = (data ?? []).filter((e) => e.id === null).map((e) => e.name);
}

const cutoff = Date.now() - MIN_AGE_DAYS * 86400000;
let totalDeleted = 0;
let totalBytes = 0;

for (const uid of folders) {
  const objects = await listFolder(uid);
  const unreferenced = objects.filter((o) => !refs.has(o.path));
  const tooNew = unreferenced.filter((o) => o.created && Date.parse(o.created) > cutoff);
  const doomed = unreferenced.filter((o) => o.created && Date.parse(o.created) <= cutoff);
  const bytes = doomed.reduce((n, o) => n + o.size, 0);

  console.log(
    `\n${uid}\n  ${objects.length} objects · ${objects.length - unreferenced.length} referenced · ` +
      `${unreferenced.length} unreferenced` +
      (tooNew.length ? ` (${tooNew.length} held back, newer than ${MIN_AGE_DAYS}d)` : ""),
  );
  if (!doomed.length) continue;
  console.log(`  ${APPLY ? "DELETING" : "would delete"} ${doomed.length} files · ${mb(bytes)}`);

  if (APPLY) {
    for (let i = 0; i < doomed.length; i += 100) {
      const chunk = doomed.slice(i, i + 100).map((o) => o.path);
      const { error } = await db.storage.from(BUCKET).remove(chunk);
      if (error) {
        console.log(`  ERROR on chunk ${i / 100}: ${error.message}`);
        process.exit(1);
      }
      process.stdout.write(`\r  removed ${Math.min(i + 100, doomed.length)}/${doomed.length}`);
    }
    console.log("");
  }
  totalDeleted += doomed.length;
  totalBytes += bytes;
}

console.log(
  `\n${APPLY ? "Reclaimed" : "Would reclaim"} ${totalDeleted} files · ${mb(totalBytes)}` +
    (APPLY ? "" : "\nRe-run with --yes to actually delete."),
);
