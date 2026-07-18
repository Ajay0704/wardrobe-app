/**
 * Backfill shop_products.tone / fit / formality from each product title, using the
 * SAME classifiers the live ingest path now uses (src/lib/shop-category.ts). This
 * un-degenerates the closet-aware ranker: without these attributes closetScore is a
 * per-category constant, so Phase-2 interleaving can't detect a winner (AJA-175).
 *
 * Idempotent + non-destructive: only fills columns that are currently null; never
 * overwrites an existing value; never deletes a row.
 *
 * Run (dry-run — prints what would change, writes nothing):
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-shop-attrs.ts
 * Apply for real:
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-shop-attrs.ts --write
 */
import { createClient } from "@supabase/supabase-js";
import { classifyFit, classifyFormality, parseColor } from "../src/lib/shop-category.ts";
import type { Category } from "../src/lib/types.ts";

const WRITE = process.argv.includes("--write");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Row = {
  id: string;
  title: string;
  category: string;
  tone: string | null;
  fit: string | null;
  formality: string | null;
  attributes: Record<string, unknown> | null;
};

async function main() {
  const { data, error } = await sb
    .from("shop_products")
    .select("id,title,category,tone,fit,formality,attributes")
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  const before = { tone: 0, fit: 0, formality: 0 };
  const after = { tone: 0, fit: 0, formality: 0 };
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const r of rows) {
    if (r.tone) before.tone++;
    if (r.fit) before.fit++;
    if (r.formality) before.formality++;

    const cat = r.category as Category;
    const tone = r.tone ?? parseColor(r.title);
    const fit = r.fit ?? classifyFit(r.title);
    const formality = r.formality ?? classifyFormality(r.title, cat);

    if (tone) after.tone++;
    if (fit) after.fit++;
    if (formality) after.formality++;

    const patch: Record<string, unknown> = {};
    if (!r.tone && tone) patch.tone = tone;
    if (!r.fit && fit) patch.fit = fit;
    if (!r.formality && formality) patch.formality = formality;
    // keep attributes colour in sync so the fallback path + display agree
    const a = r.attributes ?? {};
    if (tone && !a.colorName) patch.attributes = { ...a, colorName: tone, color: tone };
    if (Object.keys(patch).length) updates.push({ id: r.id, patch });
  }

  const pct = (n: number) => `${n}/${rows.length} (${Math.round((100 * n) / rows.length)}%)`;
  console.log(`shop_products: ${rows.length} rows`);
  console.log(`  tone      ${pct(before.tone)}  ->  ${pct(after.tone)}`);
  console.log(`  fit       ${pct(before.fit)}  ->  ${pct(after.fit)}`);
  console.log(`  formality ${pct(before.formality)}  ->  ${pct(after.formality)}`);
  console.log(`  rows to update: ${updates.length}`);

  if (!WRITE) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to apply.");
    console.log("sample:", JSON.stringify(updates.slice(0, 5), null, 2));
    return;
  }

  let done = 0;
  for (let i = 0; i < updates.length; i += 25) {
    await Promise.all(
      updates.slice(i, i + 25).map((u) => sb.from("shop_products").update(u.patch).eq("id", u.id)),
    );
    done += Math.min(25, updates.length - i);
    process.stdout.write(`\rwrote ${done}/${updates.length}`);
  }
  console.log(`\nDone — updated ${updates.length} rows.`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
