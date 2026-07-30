/**
 * WP0 — the attribute eval harness.
 *
 * Answers one question: if we change the tagging model, does quality hold?
 *
 * The closet is its own test set. Every owned item already carries attributes that have
 * been produced by the current pipeline and left in place by the user — so "does a new
 * model agree with what's stored" IS the no-regression test. Be precise about what that
 * means: this measures AGREEMENT WITH TODAY'S ACCEPTED OUTPUT, not absolute truth. Where
 * the user has hand-corrected a value it is truth; where they simply never objected it is
 * the incumbent's answer. Both are the right bar for "must not get worse", and neither
 * licenses a claim that the current pipeline is 100% correct.
 *
 * Three commands, deliberately separate so the expensive one runs once:
 *
 *   pull    read the closet out of Supabase          free
 *   run     send every photo to a model              costs money (~$0.004/item)
 *   score   compare a completed run to the closet    free, offline, re-runnable
 *
 * `run` caches every raw response, so changing the scoring rules never costs a second
 * API bill, and a run killed by a quota reset resumes exactly where it stopped.
 *
 *   npx tsx --env-file=.env.local scripts/eval-attrs.ts pull
 *   npx tsx --env-file=.env.local scripts/eval-attrs.ts run --limit 20 --yes
 *   npx tsx --env-file=.env.local scripts/eval-attrs.ts score
 *   npx tsx --env-file=.env.local scripts/eval-attrs.ts run --model gemini-flash-lite-latest --yes
 *   npx tsx --env-file=.env.local scripts/eval-attrs.ts score --model gemini-flash-lite-latest --vs gemini-3.5-flash
 *
 * `tsx`, not bare node: the app's own modules use extensionless imports, which Node's
 * ESM resolver rejects. Same as `scripts/test-smart-buy.ts`.
 *
 * Read-only against Supabase. Writes nothing to the app, nothing to the database, and
 * nothing inside this repo — all output goes to ~/Desktop/wardrobe-upload-research/eval/.
 */
import { createClient } from "@supabase/supabase-js";
import { homedir } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeFit } from "../src/lib/analyze-attrs";
import { ANALYZE_FORMALITY, ANALYZE_TONE, ANALYZE_GENERATION_CONFIG, buildAnalyzePrompt } from "../src/lib/analyze-prompt";
import { bestAnalyzeSource } from "../src/lib/backfill-attrs";
import { parseModelJson } from "../src/lib/model-json";
import { inferSubcategory, migrateSubcategory } from "../src/lib/subcategory";
import type { Category, WardrobeItem } from "../src/lib/types";

const OUT = join(homedir(), "Desktop", "wardrobe-upload-research", "eval");
const DATASET = join(OUT, "dataset.json");
const DEFAULT_MODEL = "gemini-3.5-flash"; // what /api/analyze uses today
const SEASONS = ["spring", "summer", "fall", "winter"];

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.slice(hit.indexOf("=") + 1);
  return argv[argv.indexOf(hit) + 1];
};
const has = (name: string) => argv.includes(`--${name}`);
const num = (name: string, fallback: number) => {
  const v = flag(name);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------- shaping
//
// `/api/analyze` shapes the model's raw JSON before anything sees it — a model that says
// "sweater" must be scored against the "top" the route would have stored, or every run
// looks catastrophically wrong for no reason.
//
// Everything below is imported from the real modules EXCEPT `normalizeCategory`, which is
// a private function inside `src/app/api/analyze/route.ts`. This is a copy. If the route's
// category mapping ever changes, change it here too — a silently diverged harness gives
// confident wrong numbers, which is worse than no harness at all.

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"];

function normalizeCategory(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.toLowerCase().trim();
  if (CATEGORIES.includes(v)) return v;
  if (/(t-?shirt|shirt|blouse|sweater|top|tee|tank|hoodie|cardigan|polo)/.test(v)) return "top";
  if (/(jean|pant|trouser|short|skirt|legging|chino|bottom)/.test(v)) return "bottom";
  if (/(dress|gown|jumpsuit|romper)/.test(v)) return "dress";
  if (/(jacket|coat|blazer|outerwear|parka|overcoat|vest)/.test(v)) return "outerwear";
  if (/(shoe|sneaker|boot|heel|sandal|loafer|trainer|footwear)/.test(v)) return "shoes";
  if (/(bag|purse|tote|backpack|clutch|handbag)/.test(v)) return "bag";
  if (/(hat|scarf|belt|jewel|necklace|ring|watch|glove|sunglass|accessor)/.test(v)) return "accessory";
  return undefined;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** The raw model JSON, shaped exactly as `/api/analyze` would return it. */
function shapeResponse(parsed: Record<string, unknown>) {
  const category = normalizeCategory(parsed.category);
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 6)
    : [];
  const formalityRaw = str(parsed.formality)?.toLowerCase();
  const toneRaw = str(parsed.tone)?.toLowerCase();
  return {
    name: str(parsed.name),
    category,
    subcategory: category
      ? inferSubcategory(category as Category, `${str(parsed.type) ?? ""} ${str(parsed.name) ?? ""}`, tags)
      : undefined,
    color: typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : undefined,
    colorName: str(parsed.colorName),
    seasons: Array.isArray(parsed.seasons) ? parsed.seasons.filter((s): s is string => SEASONS.includes(s as string)) : [],
    tags,
    brand: str(parsed.brand),
    fit: normalizeFit(parsed.fit),
    formality: formalityRaw && ANALYZE_FORMALITY.includes(formalityRaw) ? formalityRaw : undefined,
    material: str(parsed.material)?.toLowerCase(),
    pattern: str(parsed.pattern)?.toLowerCase(),
    tone: toneRaw && ANALYZE_TONE.includes(toneRaw) ? toneRaw : undefined,
    styleCaption: str(parsed.styleCaption),
  };
}
type Shaped = ReturnType<typeof shapeResponse>;

// ---------------------------------------------------------------- pull

interface Case {
  id: string;
  name: string;
  imageUrl: string;
  /** False when the only image is a beautify render — brand is then unscoreable. */
  trustBrand: boolean;
  truth: Partial<Shaped>;
}

async function pull() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.from("wardrobe_snapshots").select("user_id, items");
  if (error) throw new Error(error.message);

  // One row per user. Summing across rows was a real mistake once — the coverage numbers
  // it produced described nobody's actual closet.
  const rows = (data ?? []).map((r) => ({
    userId: r.user_id as string,
    items: (Array.isArray(r.items) ? r.items : []) as WardrobeItem[],
  }));
  rows.sort((a, b) => b.items.filter((i) => !i.wishlist).length - a.items.filter((i) => !i.wishlist).length);

  console.log(`${rows.length} snapshot row(s):`);
  for (const r of rows) {
    console.log(`  ${r.userId}  ${r.items.filter((i) => !i.wishlist).length} owned / ${r.items.length} total`);
  }

  const wanted = flag("user");
  const chosen = wanted ? rows.find((r) => r.userId === wanted) : rows[0];
  if (!chosen) throw new Error(`No snapshot for user ${wanted}`);
  console.log(`\nUsing ${chosen.userId}${wanted ? "" : "  (largest — pass --user <id> to override)"}`);

  const cases: Case[] = [];
  let noImage = 0;
  for (const item of chosen.items) {
    if (item.wishlist) continue; // wishlist attrs come from the retailer page, not a photo
    const source = bestAnalyzeSource(item);
    if (!source) { noImage++; continue; }
    cases.push({
      id: item.id,
      name: item.name,
      imageUrl: source.url,
      trustBrand: source.trustBrand,
      truth: {
        category: item.category,
        // Migrate the stored value the way the app does. `normalizeItem` runs
        // `migrateSubcategory` on every load (AJA-265), so the closet's live value for a
        // retired subcategory is NOT what sits in the snapshot. Reading the raw blob without
        // this made the harness score the model against stale vocabulary: 10 items still hold
        // `longsleeve`, which was removed, and every one counted as a miss — a 6.5-point
        // artefact on a field that had not actually regressed.
        subcategory: migrateSubcategory(item.category, item.subcategory, item.name),
        color: item.color,
        colorName: item.colorName,
        seasons: item.seasons,
        brand: item.brand,
        fit: item.fit,
        formality: item.formality,
        material: item.material,
        pattern: item.pattern,
        tone: item.tone,
      },
    });
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(DATASET, JSON.stringify({ userId: chosen.userId, pulledAt: new Date().toISOString(), cases }, null, 2));

  console.log(`\n${cases.length} scoreable items${noImage ? `  (${noImage} skipped — no usable image)` : ""}`);
  console.log(`  ${cases.filter((c) => !c.trustBrand).length} are beautify-only, so brand is excluded for them`);
  console.log("\nGround-truth coverage (the denominator for each field):");
  for (const k of ["category", "subcategory", "brand", "fit", "formality", "material", "pattern", "tone", "colorName"] as const) {
    const n = cases.filter((c) => {
      if (k === "brand" && !c.trustBrand) return false;
      const v = c.truth[k];
      return typeof v === "string" && v.trim();
    }).length;
    console.log(`  ${k.padEnd(12)} ${String(n).padStart(4)} / ${cases.length}  (${Math.round((100 * n) / cases.length)}%)`);
  }
  console.log(`\nWritten to ${DATASET}`);
}

// ---------------------------------------------------------------- run

interface RunRecord {
  id: string;
  ok: boolean;
  ms: number;
  raw?: Record<string, unknown>;
  error?: string;
}

function loadDataset(): { userId: string; cases: Case[] } {
  if (!existsSync(DATASET)) throw new Error(`No dataset. Run \`pull\` first.`);
  return JSON.parse(readFileSync(DATASET, "utf8"));
}

const runPath = (model: string) => join(OUT, "runs", `${model.replace(/[^\w.-]/g, "_")}.json`);

async function toInline(src: string): Promise<{ mime_type: string; data: string } | null> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    return m ? { mime_type: m[1], data: m[2] } : null;
  }
  const res = await fetch(src, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  return {
    mime_type: res.headers.get("content-type") || "image/jpeg",
    data: Buffer.from(await res.arrayBuffer()).toString("base64"),
  };
}

async function callModel(model: string, inline: { mime_type: string; data: string }) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildAnalyzePrompt() }, { inline_data: inline }] }],
      generationConfig: ANALYZE_GENERATION_CONFIG,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const parts = (await res.json())?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new Error("no parts in response");
  // Gemini interleaves "thinking" parts; joining them in splices prose into the JSON.
  const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
  // The route's own parser, imported rather than reimplemented: a harness that parses more
  // forgivingly than production reports a failure rate nobody experiences, and one that
  // parses less forgivingly invents failures. Keep the text on a miss — a parse failure you
  // can't read is unfixable.
  const parsed = parseModelJson(text);
  if (!parsed) throw new Error(`unparseable || text: ${text.slice(0, 1500)}`);
  return parsed;
}

async function run() {
  const model = flag("model") ?? DEFAULT_MODEL;
  const { cases } = loadDataset();
  const limit = num("limit", cases.length);
  const concurrency = num("concurrency", 4);

  mkdirSync(join(OUT, "runs"), { recursive: true });
  const path = runPath(model);
  const done: Record<string, RunRecord> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};

  const todo = cases.filter((c) => !done[c.id]?.ok).slice(0, limit);
  if (!todo.length) { console.log(`Nothing to do — ${Object.keys(done).length} already cached for ${model}.`); return; }

  console.log(`Model:   ${model}`);
  console.log(`Items:   ${todo.length} to call, ${Object.values(done).filter((d) => d.ok).length} already cached`);
  console.log(`Est cost ~$${(todo.length * 0.0043).toFixed(2)} (at the current per-item rate)`);
  if (!has("yes")) {
    console.log("\nRe-run with --yes to actually spend it.");
    return;
  }

  let n = 0;
  const queue = [...todo];
  const save = () => writeFileSync(path, JSON.stringify(done, null, 2));

  const worker = async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      const t0 = Date.now();
      try {
        const inline = await toInline(c.imageUrl);
        if (!inline) throw new Error("image fetch failed");
        // Await FIRST, then read the clock. Object properties evaluate left to right, so
        // `ms: Date.now() - t0` alongside an awaited `raw:` was computed BEFORE the model call
        // resolved — every latency this harness reported was image-fetch time with the model
        // call excluded, understating tagging by more than 10x (AJA-268).
        const raw = await callModel(model, inline);
        done[c.id] = { id: c.id, ok: true, ms: Date.now() - t0, raw };
      } catch (e) {
        done[c.id] = { id: c.id, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 2000) };
      }
      // Written after every single item, on purpose: a run killed mid-way keeps everything
      // it paid for, and resumes from exactly here.
      save();
      n++;
      process.stdout.write(`\r${n}/${todo.length}  ${done[c.id].ok ? "ok " : "ERR"}  ${c.name.slice(0, 40).padEnd(40)}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  const oks = Object.values(done).filter((d) => d.ok);
  const lat = oks.map((d) => d.ms).sort((a, b) => a - b);
  console.log(`\n\n${oks.length} ok, ${Object.values(done).length - oks.length} failed`);
  console.log(`latency  p50 ${lat[Math.floor(lat.length * 0.5)]}ms   p95 ${lat[Math.floor(lat.length * 0.95)]}ms`);
  console.log(`cached → ${path}\nNow: score --model ${model}`);
}

// ---------------------------------------------------------------- score

/** Compare loosely enough that punctuation and case aren't scored as model errors. */
const norm = (v: unknown) =>
  typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

const FIELDS = ["category", "subcategory", "brand", "fit", "formality", "material", "pattern", "tone", "colorName"] as const;

/**
 * Fields where an exact string match is the wrong test, because the two sides don't share a
 * vocabulary. Stored `colorName` is mostly `nameColor(hex)` — a fixed word list derived from
 * the extracted pixel colour — while the model writes free text. "navy" vs "navy blue" and
 * "cream" vs "beige" are agreement, not error; scoring them strictly reported 37% for a
 * model that is mostly right. Measured both ways so the gap between them is visible.
 */
const LOOSE_FIELDS = new Set<string>(["colorName", "brand", "subcategory"]);

const looseMatch = (a: string, b: string) => a === b || a.includes(b) || b.includes(a);

interface Tally { both: number; agree: number; loose: number; newFill: number; dropped: number; disagreements: string[] }


function scoreRun(model: string, cases: Case[]) {
  const path = runPath(model);
  if (!existsSync(path)) throw new Error(`No run cached for ${model}. Run \`run --model ${model} --yes\` first.`);
  const records: Record<string, RunRecord> = JSON.parse(readFileSync(path, "utf8"));

  const tallies = new Map<string, Tally>(FIELDS.map((f) => [f, { both: 0, agree: 0, loose: 0, newFill: 0, dropped: 0, disagreements: [] }]));
  let scored = 0;
  let failed = 0;

  for (const c of cases) {
    const rec = records[c.id];
    if (!rec) continue;
    if (!rec.ok || !rec.raw) { failed++; continue; }
    scored++;
    const got = shapeResponse(rec.raw);

    for (const f of FIELDS) {
      // A brand read off a generated image is the image model's invention, not an
      // observation — scoring it would measure hallucination agreement.
      if (f === "brand" && !c.trustBrand) continue;
      const t = tallies.get(f)!;
      const truth = norm(c.truth[f]);
      const pred = norm(got[f]);
      if (truth && pred) {
        t.both++;
        const exact = truth === pred;
        if (exact) { t.agree++; t.loose++; }
        else if (LOOSE_FIELDS.has(f) && looseMatch(truth, pred)) t.loose++;
        if (!exact && t.disagreements.length < 40) {
          const near = LOOSE_FIELDS.has(f) && looseMatch(truth, pred) ? " *(loose match)*" : "";
          t.disagreements.push(`${c.name.slice(0, 38)} — stored \`${c.truth[f]}\` · model \`${got[f]}\`${near}`);
        }
      } else if (!truth && pred) t.newFill++;
      else if (truth && !pred) t.dropped++;
    }
  }
  return { tallies, scored, failed, records };
}

function score() {
  const model = flag("model") ?? DEFAULT_MODEL;
  const { cases } = loadDataset();
  const mine = scoreRun(model, cases);
  const vs = flag("vs") ? scoreRun(flag("vs")!, cases) : null;

  const lines: string[] = [];
  const say = (s = "") => { lines.push(s); console.log(s); };

  say(`# Attribute eval — ${model}`);
  say();
  say(`Scored ${mine.scored} items${mine.failed ? `, ${mine.failed} failed outright` : ""}.`);
  if (mine.failed) {
    const total = mine.scored + mine.failed;
    say();
    say(`**Parse failures: ${mine.failed}/${total} (${Math.round((100 * mine.failed) / total)}%)** — the`);
    say(`model returned JSON that survived neither a strict parse nor the brace repairs in`);
    say(`\`parseModelJson\`, so \`/api/analyze\` would have 502'd on it (AJA-251).`);
  }
  say();
  say("**exact** = identical string. **loose** = also counts synonym-level agreement, and is the");
  say("honest number for colorName / brand / subcategory, where the stored side uses a fixed");
  say("vocabulary and the model writes free text (\"navy\" vs \"navy blue\"). **new** = model filled");
  say("a field the closet left empty (a gain). **none** = model returned nothing where the closet");
  say("has a value — for brand that is usually correct behaviour, not a loss, because ~1 in 4");
  say("stored brands were typed by the owner and are nowhere in the photo.");
  say();
  say("Measures agreement with today's accepted output, not absolute truth.");
  say();
  say(vs ? `| field | n | exact | loose | ${flag("vs")} loose | Δ | new | none |` : `| field | n | exact | loose | new | none |`);
  say(vs ? `|---|---:|---:|---:|---:|---:|---:|---:|` : `|---|---:|---:|---:|---:|---:|`);

  for (const f of FIELDS) {
    const t = mine.tallies.get(f)!;
    const pct = t.both ? Math.round((100 * t.agree) / t.both) : 0;
    const lpct = t.both ? Math.round((100 * t.loose) / t.both) : 0;
    if (vs) {
      const o = vs.tallies.get(f)!;
      const olpct = o.both ? Math.round((100 * o.loose) / o.both) : 0;
      const d = lpct - olpct;
      say(`| ${f} | ${t.both} | ${pct}% | ${lpct}% | ${olpct}% | ${d > 0 ? "+" : ""}${d} | ${t.newFill} | ${t.dropped} |`);
    } else {
      say(`| ${f} | ${t.both} | ${pct}% | ${lpct}% | ${t.newFill} | ${t.dropped} |`);
    }
  }

  const lat = Object.values(mine.records).filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
  if (lat.length) {
    say();
    say(`Latency p50 ${lat[Math.floor(lat.length * 0.5)]}ms · p95 ${lat[Math.floor(lat.length * 0.95)]}ms (includes image fetch).`);
  }

  say();
  say("## Disagreements");
  for (const f of FIELDS) {
    const t = mine.tallies.get(f)!;
    if (!t.disagreements.length) continue;
    say();
    say(`### ${f} (${t.both - t.agree} of ${t.both})`);
    for (const d of t.disagreements) say(`- ${d}`);
  }

  mkdirSync(join(OUT, "reports"), { recursive: true });
  const out = join(OUT, "reports", `${model.replace(/[^\w.-]/g, "_")}.md`);
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\nWritten to ${out}`);
}

// ---------------------------------------------------------------- presentation labels

/**
 * What the photos actually LOOK like. Round 1 assumed a 30/70 flat-lay/worn split and was
 * told it's the reverse; a segmentation model that needs a person in frame is only viable
 * if "worn" genuinely dominates, so this stops being a guess.
 */
async function label() {
  const { cases } = loadDataset();
  const limit = num("limit", cases.length);
  const path = join(OUT, "runs", "presentation.json");
  mkdirSync(join(OUT, "runs"), { recursive: true });
  const done: Record<string, string> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const todo = cases.filter((c) => !done[c.id]).slice(0, limit);

  console.log(`${todo.length} to label, ${Object.keys(done).length} cached. Est ~$${(todo.length * 0.002).toFixed(2)}`);
  if (todo.length && !has("yes")) { console.log("Re-run with --yes."); return; }

  const prompt =
    `How is this garment photographed? Answer with JSON {"presentation": one of ` +
    `["flat-lay","hanger","worn","product-shot","cutout","other"]}. ` +
    `"worn" = on a person. "product-shot" = a retailer's studio image with no person. ` +
    `"cutout" = already background-removed onto transparency or flat white. Output only JSON.`;

  let n = 0;
  for (const c of todo) {
    try {
      const inline = await toInline(c.imageUrl);
      if (!inline) throw new Error("fetch failed");
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: inline }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
      const parts = (await res.json())?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
      done[c.id] = String(JSON.parse(text).presentation ?? "other");
    } catch {
      done[c.id] = "error";
    }
    writeFileSync(path, JSON.stringify(done, null, 2));
    process.stdout.write(`\r${++n}/${todo.length}`);
  }

  const counts = new Map<string, number>();
  for (const v of Object.values(done)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = Object.keys(done).length;
  console.log("\n\nPhoto presentation across the closet:");
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${Math.round((100 * v) / total)}%`);
  }
}

// ---------------------------------------------------------------- main

const COMMANDS: Record<string, () => void | Promise<void>> = { pull, run, score, label };

const go = COMMANDS[cmd ?? ""];
if (!go) {
  console.log(`usage: eval-attrs.ts <pull|run|score|label> [flags]

  pull                          read the closet from Supabase into a local dataset (free)
       --user <id>              pick a specific snapshot (default: the largest)

  run                           send each photo to a model and cache the raw reply
       --model <id>             default ${DEFAULT_MODEL}
       --limit <n>              only the first n items — use this to sanity-check cheaply
       --concurrency <n>        default 4
       --yes                    actually spend money (otherwise it only estimates)

  score                         compare a cached run to the closet (free, re-runnable)
       --model <id>             which run to score
       --vs <id>                second run to diff against, side by side

  label                         classify how each photo is shot (flat-lay/hanger/worn/...)
       --limit <n> --yes

Output goes to ${OUT} — nothing is written to the app or the database.`);
  process.exit(1);
}
Promise.resolve(go()).catch((e) => {
  console.error("\nFATAL", e);
  process.exit(1);
});
