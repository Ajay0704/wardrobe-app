#!/usr/bin/env node
/**
 * A lint ratchet: the known errors are allowed, one more is not.
 *
 * This repo had no CI at all, so `npx eslint src/` had drifted to 18 errors that nothing was
 * checking. 15 of them are `react-hooks/set-state-in-effect` spread over 15 screens. Fixing
 * those is real work with real regression risk — that rule governs render timing, and two of
 * the bugs shipped this week (AJA-282's effect cancelling its own timer, AJA-294's state write
 * unmounting its own modal) were exactly that failure mode. Rewriting fifteen effects blind, to
 * silence a warning nobody was seeing, is how you trade one dormant problem for three live ones.
 *
 * So: freeze the count, block any increase, and burn it down deliberately (AJA-295).
 *
 * Compares per-rule error counts against lint-baseline.json and fails when any rule goes UP or a
 * new rule appears. Counts going DOWN is a pass, and the script says so — run with --update after
 * fixing some, and commit the smaller numbers.
 *
 * Deliberately counts by RULE, not by file+line: line numbers churn on every edit above them, so
 * a file:line baseline would need regenerating constantly and would stop being read.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASELINE = new URL("../lint-baseline.json", import.meta.url);
const update = process.argv.includes("--update");

let raw = "";
try {
  raw = execFileSync("npx", ["eslint", "src/", "-f", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // eslint exits non-zero when it finds errors — that is the normal path here.
  raw = err.stdout ?? "";
  if (!raw) {
    console.error("eslint produced no output:", err.message);
    process.exit(1);
  }
}

const counts = {};
for (const file of JSON.parse(raw)) {
  for (const m of file.messages) {
    if (m.severity !== 2) continue;
    const rule = m.ruleId ?? "(no rule)";
    counts[rule] = (counts[rule] ?? 0) + 1;
  }
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (update) {
  writeFileSync(BASELINE, JSON.stringify({ total, counts }, null, 2) + "\n");
  console.log(`baseline updated: ${total} error(s)`);
  for (const [r, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(3)}  ${r}`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const rules = [...new Set([...Object.keys(base.counts), ...Object.keys(counts)])].sort();

let worse = false;
let better = false;
for (const rule of rules) {
  const was = base.counts[rule] ?? 0;
  const now = counts[rule] ?? 0;
  if (now > was) {
    worse = true;
    console.error(`  WORSE   ${rule}: ${was} -> ${now}`);
  } else if (now < was) {
    better = true;
    console.log(`  better  ${rule}: ${was} -> ${now}`);
  }
}

if (worse) {
  console.error(`\nLint got worse (${base.total} -> ${total}).`);
  console.error("Fix the new error. Do NOT run --update to make this pass — the baseline exists");
  console.error("to shrink, and raising it hides the thing it was built to catch.");
  process.exit(1);
}

if (better) {
  console.log(`\nLint improved: ${base.total} -> ${total}. Run \`npm run lint:baseline -- --update\` and commit.`);
} else {
  console.log(`Lint holding at the baseline: ${total} known error(s), none new.`);
}
process.exit(0);
