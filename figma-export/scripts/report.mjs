// Builds figma-export/UI_AUDIT.md from manifest.json (captures) + audit-data.json (code scan).
// The hand-written findings live in figma-export/scripts/audit-summary.md and are spliced in
// at the top, so re-running the export + audit refreshes every table without losing them.
//
//   node figma-export/scripts/report.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(OUT, "manifest.json"), "utf8"));
const a = JSON.parse(await readFile(join(OUT, "audit-data.json"), "utf8"));
const summary = await readFile(join(OUT, "scripts/audit-summary.md"), "utf8").catch(() => "");

const sum = (list) => list.reduce((n, x) => n + x.count, 0);
const where = (files, n = 3) => files.slice(0, n).map((f) => `\`${f}\``).join("<br>") + (files.length > n ? `<br>+${files.length - n} more` : "");
const kb = (b) => (b ? `${Math.round(b / 1024)} KB` : "—");

// ——— Screens table: one row per scene, desktop + mobile side by side ———
const bySlug = new Map();
for (const s of manifest.screens) {
  const key = s.file.replace(/-(desktop|mobile)$/, "");
  if (!bySlug.has(key)) bySlug.set(key, { key, title: s.title, url: s.url, state: s.state, theme: s.theme });
  bySlug.get(key)[s.viewport] = s;
}
const rows = [...bySlug.values()].sort((x, y) => x.key.localeCompare(y.key));
const how = (r) => (r.state ? `\`${JSON.stringify(r.state)}\``.replace(/\|/g, "\\|") : `\`${r.url}\``);
const cell = (s) => (s ? `[png](screens/${s.file}.png) · [html](html/${s.file}.html) ${kb(s.htmlBytes)}` : "—");
const warn = (r) => {
  const issues = [r.desktop, r.mobile].filter(Boolean).flatMap((s) => [...s.failedRequests, ...s.consoleErrors]);
  return issues.length ? `⚠ ${[...new Set(issues)].slice(0, 2).join("; ").replace(/\|/g, "\\|").slice(0, 140)}` : "";
};

const screens = [
  `| # | Screen | Reached via | Desktop 1440 (web) | Mobile 390 (iOS shell) | Notes |`,
  `|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.key.slice(0, 2)} | ${r.title} | ${how(r)} | ${cell(r.desktop)} | ${cell(r.mobile)} | ${warn(r)} |`),
].join("\n");

const table = (head, list, fmt, n = 40) =>
  [head, head.replace(/[^|]+/g, "---"), ...list.slice(0, n).map(fmt)].join("\n") +
  (list.length > n ? `\n\n…and ${list.length - n} more in \`audit-data.json\`.` : "");

const md = `# UI Audit — Your Personal Wardrobe

_Generated ${new Date().toISOString().slice(0, 10)} by \`figma-export/scripts/report.mjs\` from ${manifest.screens.length} captures and a scan of ${a.filesScanned} source files under \`src/\`._

${summary.trim()}

---

## 1. Captured screens

${rows.length} screens/states · ${manifest.screens.length} captures. Every PNG is 2× (\`deviceScaleFactor: 2\`), full height. Mobile renders the **native iOS shell** (bottom dock) that TestFlight users see; desktop renders the **web shell** (top nav). Data is the seeded fixture closet in \`scripts/seed.mjs\` (16 real product photos, 7 looks, 13 calendar entries) — no account or production data.

${screens}

## 2. Colour

**Token adoption:** ${a.tokenClassUses} uses of the 9 semantic token classes (\`bg-surface\`, \`text-muted\`, …) vs **${sum(a.paletteClasses)} uses of Tailwind's default palette** and **${sum(a.hexRogue)} raw hex literals in UI code**.

### 2a. Rogue hex codes in UI code (${a.hexRogue.length} distinct, ${sum(a.hexRogue)} uses)

Hex values in components/pages that are not one of the 9 tokens. (${a.hexData.length} more live in \`src/lib/\` and API routes — garment colour palettes, colour naming and sample data; that's product data, not styling, so it's excluded here.)

${table("| Hex | Uses | Where |", a.hexRogue, (h) => `| \`${h.value}\` <span style="color:${h.value}">■</span> | ${h.count} | ${where(h.files)} |`)}

### 2b. Token colours re-typed as hex (${sum(a.hexTokenDuplicates)} uses)

These match a token today but are hard-coded, so they **don't switch in dark mode**.

${table("| Hex | Uses | Where |", a.hexTokenDuplicates, (h) => `| \`${h.value}\` | ${h.count} | ${where(h.files)} |`)}

### 2c. Tailwind default-palette classes (${a.paletteClasses.length} distinct, ${sum(a.paletteClasses)} uses)

Bypass the theme entirely. Mostly status colours (red/amber/emerald) and white-on-photo overlays.

${table("| Class | Uses | Where |", a.paletteClasses, (h) => `| \`${h.value}\` | ${h.count} | ${where(h.files, 2)} |`, 30)}

### 2d. rgb()/rgba() literals (${a.rgba.length} distinct)

${table("| Value | Uses | Where |", a.rgba, (h) => `| \`${h.value}\` | ${h.count} | ${where(h.files, 2)} |`, 20)}

## 3. Typography

**${a.fontSizes.length} distinct font sizes** in use. Tailwind's scale has 13 steps; anything not on it (or used once or twice) is drift.

${table("| Size | Uses | On Tailwind scale? | Where (top) |", a.fontSizes, (h) => `| ${h.value}px | ${h.count} | ${[12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128].includes(h.value) ? "yes" : "**no**"} | ${where(h.files, 2)} |`, 60)}

### Arbitrary sizes (\`text-[…]\` / inline \`fontSize\`)

${table("| Value | Uses | Where |", a.arbitraryFontSizes, (h) => `| \`${h.value}\` | ${h.count} | ${where(h.files, 2)} |`, 30)}

### Weights · tracking

${a.fontWeights.map((w) => `\`font-${w.value}\` ×${w.count}`).join(" · ")}

${a.tracking.map((w) => `\`tracking-${w.value}\` ×${w.count}`).join(" · ")}

## 4. Spacing

**${a.spacing.length} distinct spacing values**; **${sum(a.offGridSpacing)} uses across ${a.offGridSpacing.length} values are off the 4px grid** (2px and 1px hairlines excluded).

${table("| Off-grid value | Uses | Where |", a.offGridSpacing, (h) => `| \`${h.value}\` | ${h.count} | ${where(h.files, 2)} |`, 40)}

<details><summary>Full spacing distribution</summary>

${table("| px | Uses |", a.spacing, (h) => `| ${h.value} | ${h.count} |`, 100)}

</details>

## 5. Radius & elevation

${table("| Radius | Uses | Where (top) |", a.radii, (h) => `| ${h.value === 9999 || h.value === 999 ? `${h.value} (pill)` : `${h.value}px`} | ${h.count} | ${where(h.files, 2)} |`, 30)}

**Tailwind shadows:** ${a.shadows.map((s) => `\`shadow${s.value === "DEFAULT" ? "" : "-" + s.value}\` ×${s.count}`).join(" · ")}

**CSS shadows in globals.css:** ${a.cssShadows.map((s) => `\`${s}\``).join(" · ")}

## 6. Motion

${a.motion.map((m) => `- \`.${m.cls}\` → \`${m.animation}\``).join("\n")}

---

_Raw data: \`audit-data.json\`. Tokens: \`figma-tokens.json\` (DTCG, both modes) and \`tokens/{light,dark}.tokens.json\` (one file per mode for Figma's native Variables import)._
`;

await writeFile(join(OUT, "UI_AUDIT.md"), md);
console.log(`UI_AUDIT.md — ${rows.length} screens, ${md.length} chars`);
