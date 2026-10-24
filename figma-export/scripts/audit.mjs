// Design-token extraction + UI audit.
//
//   node figma-export/scripts/audit.mjs
//
// Reads src/app/globals.css (the Tailwind v4 @theme source) and scans every .ts/.tsx/.css under
// src/ for how styling is actually written. Outputs:
//   figma-export/figma-tokens.json          W3C Design Tokens (DTCG) — light values in $value,
//                                           dark in $extensions["com.figma"].modes
//   figma-export/tokens/light.tokens.json   one file per mode, for Figma's native Variables import
//   figma-export/tokens/dark.tokens.json
//   figma-export/audit-data.json            raw findings (consumed by UI_AUDIT.md)

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(OUT, "..");
const SRC = join(REPO, "src");

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "navtest-figma" || e.name.startsWith("navtest")) continue;
      out.push(...(await walk(p)));
    } else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ———————————————————————————— Tokens from globals.css ————————————————————————————
const css = await readFile(join(SRC, "app/globals.css"), "utf8");
const block = (selector) => {
  const m = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
  return Object.fromEntries([...(m?.[1] ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
};
const light = block(":root");
const dark = block(".dark");
const themeMap = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*var\(--([\w-]+)\)/g)].map((m) => [m[1], m[2]]),
);

const DESCRIPTIONS = {
  background: "App canvas behind everything",
  surface: "Cards, sheets, tab dock",
  "surface-2": "Recessed fills: segmented controls, chips, inputs",
  line: "Hairline borders and dividers (Tailwind `line`, CSS var --border)",
  foreground: "Primary text and icons; also the Create FAB fill",
  muted: "Secondary text, inactive tab icons",
  accent: "Brand green — primary buttons, active states, links",
  "accent-soft": "Tinted accent fill — active tab pill, selected chips",
  "accent-foreground": "Text/icons on accent fills",
};

// ———————————————————————————— Usage scan ————————————————————————————
const files = await walk(SRC);
const rel = (f) => relative(REPO, f);

const TW_SPACE = { 0: 0, px: 1, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 20: 80, 24: 96, 28: 112, 32: 128, 36: 144, 40: 160, 44: 176, 48: 192, 56: 224, 64: 256, 72: 288, 80: 320, 96: 384 };
const TW_TEXT = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };
const TW_RADIUS = { none: 0, xs: 2, sm: 4, "": 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, "4xl": 32, full: 9999 };
const PALETTE = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white";
const TOKEN_HEX = new Set(Object.values(light).concat(Object.values(dark)).map((v) => v.toLowerCase()));

const toPx = (v) => {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(v.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
};

const tally = () => new Map();
const bump = (map, key, file, line) => {
  if (!map.has(key)) map.set(key, { count: 0, files: new Map() });
  const e = map.get(key);
  e.count++;
  const where = e.files.get(file) ?? [];
  where.push(line);
  e.files.set(file, where);
};
const hex = tally(); // raw hex literals outside token definitions
const rgba = tally(); // rgb()/rgba()/hsl() literals
const paletteCls = tally(); // Tailwind default palette (bypasses the theme)
const textSize = tally(); // font sizes (px)
const arbitraryText = tally();
const spacing = tally(); // spacing (px)
const offGrid = tally(); // spacing not on the 4px grid
const radius = tally();
const shadow = tally();
const tracking = tally();
const fontWeight = tally();
let tokenClassUses = 0;

for (const f of files) {
  const text = await readFile(f, "utf8");
  const isGlobals = f.endsWith("globals.css");
  const lines = text.split("\n");
  lines.forEach((ln, i) => {
    const L = i + 1;
    const file = rel(f);
    // Skip the token definition blocks themselves.
    if (isGlobals && /^\s*--(background|surface|surface-2|border|foreground|muted|accent|accent-soft|accent-foreground):/.test(ln)) return;
    // Ignore comments-only lines.
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;

    for (const m of ln.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      // `#` followed by hex inside a URL fragment / id selector is rare in this codebase; keep
      // only things in a colour position: quotes, brackets, CSS values.
      const before = ln[m.index - 1] ?? "";
      if (!/["'`\[(:\s,]/.test(before)) continue;
      const v = m[0].toLowerCase();
      bump(hex, v, file, L);
    }
    for (const m of ln.matchAll(/\b(rgba?|hsla?)\(\s*[\d.]+[\s,]+[\d.]+%?[\s,]+[\d.]+%?(?:[\s,/]+[\d.]+%?)?\s*\)/g)) bump(rgba, m[0].replace(/\s+/g, " "), file, L);

    if (/\.tsx?$/.test(f)) {
      for (const m of ln.matchAll(new RegExp(`(?<![\\w-])(?:[a-z]+:)*(bg|text|border|ring|outline|divide|from|via|to|fill|stroke|shadow|placeholder|decoration|accent|caret)-(${PALETTE})(?:-(\\d{2,3}))?(?:\\/(\\d+|\\[[^\\]]+\\]))?(?![\\w-])`, "g"))) {
        bump(paletteCls, m[0].replace(/^(?:[a-z]+:)+/, ""), file, L);
      }
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*(bg|text|border|ring|from|to|via|fill|stroke)-(background|surface|surface-2|line|foreground|muted|accent|accent-soft|accent-foreground)\b/g)) {
        tokenClassUses++;
        void m;
      }
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g)) bump(textSize, TW_TEXT[m[1]], file, L);
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*text-\[([\d.]+(?:px|rem|em))\]/g)) {
        const px = toPx(m[1]);
        bump(textSize, px, file, L);
        bump(arbitraryText, m[1], file, L);
      }
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*-?(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left)-(px|\d+(?:\.\d+)?|\[[^\]]+\])(?![\w-])/g)) {
        let px;
        if (m[2].startsWith("[")) px = toPx(m[2].slice(1, -1));
        else px = TW_SPACE[m[2]] ?? (m[2] === "px" ? 1 : parseFloat(m[2]) * 4);
        if (px == null || Number.isNaN(px)) continue;
        bump(spacing, px, file, L);
        if (px > 2 && px % 4 !== 0) bump(offGrid, `${m[1]}-${m[2]} (${px}px)`, file, L);
      }
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\[[^\]]+\]))?(?![\w-])/g)) {
        const k = m[1] ?? "";
        const px = k.startsWith("[") ? (toPx(k.slice(1, -1)) ?? k) : TW_RADIUS[k];
        bump(radius, px, file, L);
      }
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*shadow(?:-(xs|sm|md|lg|xl|2xl|inner|none|\[[^\]]+\]))?(?![\w-])/g)) bump(shadow, m[1] ?? "DEFAULT", file, L);
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*tracking-(tighter|tight|normal|wide|wider|widest|\[[^\]]+\])(?![\w-])/g)) bump(tracking, m[1], file, L);
      for (const m of ln.matchAll(/(?<![\w-])(?:[a-z]+:)*font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])/g)) bump(fontWeight, m[1], file, L);
      // Inline style objects: fontSize: 13 / "13px", padding: 10 …
      for (const m of ln.matchAll(/fontSize:\s*["']?([\d.]+(?:px|rem)?)["']?/g)) {
        const px = toPx(/\d$/.test(m[1]) ? m[1] + "px" : m[1]);
        bump(textSize, px, file, L);
        bump(arbitraryText, `style fontSize ${m[1]}`, file, L);
      }
    } else {
      for (const m of ln.matchAll(/font-size:\s*([\d.]+(?:px|rem|em))/g)) bump(textSize, toPx(m[1]), file, L);
      for (const m of ln.matchAll(/\b(padding|margin|gap)(?:-(?:top|right|bottom|left|inline|block))?:\s*([^;]+);/g)) {
        for (const part of m[2].split(/\s+/)) {
          const px = toPx(part);
          if (px == null) continue;
          bump(spacing, px, file, L);
          if (px > 2 && px % 4 !== 0) bump(offGrid, `${m[1]}: ${part} (${+px.toFixed(2)}px)`, file, L);
        }
      }
      for (const m of ln.matchAll(/border-radius:\s*([\d.]+(?:px|rem))/g)) bump(radius, toPx(m[1]), file, L);
    }
  });
}

const serial = (map, { limit = 999, sort = "count" } = {}) =>
  [...map.entries()]
    .sort((a, b) => (sort === "key" ? Number(a[0]) - Number(b[0]) : b[1].count - a[1].count))
    .slice(0, limit)
    .map(([k, v]) => ({
      value: k,
      count: v.count,
      files: [...v.files.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([file, ls]) => `${file}:${ls.slice(0, 4).join(",")}${ls.length > 4 ? "…" : ""}`),
    }));

// Rogue hex = not one of the 9 token colours (either mode). Token hex re-typed by hand is
// reported separately: it renders right today but silently ignores dark mode.
const hexAll = serial(hex);
// src/lib + API routes hold garment colour palettes, colour naming and sample data — product
// data, not UI styling. Only components/pages count as rogue UI colour.
const isData = (f) => f.startsWith("src/lib/") || f.startsWith("src/app/api/");
const splitBy = (list, keep) =>
  list
    .map((h) => ({ ...h, files: h.files.filter((f) => keep(f.split(":")[0])) }))
    .filter((h) => h.files.length)
    .map((h) => ({ ...h, count: h.files.reduce((n, f) => n + f.split(":")[1].split(",").length, 0) }));
const rogueAll = hexAll.filter((h) => !TOKEN_HEX.has(h.value));
const audit = {
  filesScanned: files.length,
  tokenClassUses,
  hexRogue: splitBy(rogueAll, (f) => !isData(f)),
  hexData: splitBy(rogueAll, isData),
  hexTokenDuplicates: hexAll.filter((h) => TOKEN_HEX.has(h.value)),
  rgba: serial(rgba),
  paletteClasses: serial(paletteCls),
  fontSizes: serial(textSize, { sort: "key" }),
  arbitraryFontSizes: serial(arbitraryText),
  spacing: serial(spacing, { sort: "key" }),
  offGridSpacing: serial(offGrid),
  radii: serial(radius, { sort: "key" }),
  shadows: serial(shadow),
  tracking: serial(tracking),
  fontWeights: serial(fontWeight),
  cssShadows: [...css.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim()),
  motion: [...css.matchAll(/\.(animate-[\w-]+|native-page-in)\s*\{\s*animation:\s*([^;]+);/g)].map((m) => ({ cls: m[1], animation: m[2].trim() })),
};

// ———————————————————————————— DTCG tokens ————————————————————————————
const color = {};
for (const [name, cssVar] of Object.entries(themeMap)) {
  color[name] = {
    $type: "color",
    $value: light[cssVar],
    $description: `${DESCRIPTIONS[name] ?? ""} · Tailwind: bg-${name} / text-${name} · CSS: var(--${cssVar})`.trim(),
    $extensions: { "com.figma": { modes: { Light: light[cssVar], Dark: dark[cssVar] } } },
  };
}

const px = (n) => ({ $type: "dimension", $value: `${n}px` });
// Scale tokens are the values the code ACTUALLY leans on (≥10 uses), so Figma variables match
// what ships rather than Tailwind's full theoretical scale. One-off values (14.5px, 15.2px…) are
// deliberately NOT promoted to tokens — UI_AUDIT.md lists them as drift to fold back in.
const used = (list, min = 10) =>
  list.filter((x) => typeof x.value === "number" && x.count >= min).map((x) => x.value).sort((a, b) => a - b);
const fontSizeScale = used(audit.fontSizes);
const spacingScale = used(audit.spacing).filter((n) => n >= 0 && n <= 128);
const radiusScale = used(audit.radii, 3);

// Named by px value (integer keys keep the scale in order — JS hoists integer-like keys ahead of
// strings, so mixing "10" with "xs" scrambles it); the Tailwind alias goes in $description.
// DTCG reserves "." for alias paths, so a fractional px becomes "_".
const named = (vals, names, prefix) =>
  Object.fromEntries(
    vals.map((v) => [
      v === 9999 ? "full" : String(v).replace(".", "_"),
      { ...px(v), ...(names?.[v] ? { $description: `Tailwind: ${prefix}-${names[v]}` } : {}) },
    ]),
  );
const TEXT_NAMES = Object.fromEntries(Object.entries(TW_TEXT).map(([k, v]) => [v, k]));
const RADIUS_NAMES = { 0: "none", 2: "xs", 4: "sm", 6: "md", 8: "lg", 12: "xl", 16: "2xl", 24: "3xl", 9999: "full" };

const tokens = {
  $description: "Your Personal Wardrobe — design tokens extracted from src/app/globals.css (Tailwind v4 @theme) plus the scales the codebase actually uses. Generated by figma-export/scripts/audit.mjs.",
  color,
  font: {
    family: {
      sans: { $type: "fontFamily", $value: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"], $description: "Web UI text (next/font Geist 400/500/600/700) · Tailwind: font-sans" },
      display: { $type: "fontFamily", $value: ["Libre Baskerville", "Georgia", "serif"], $description: "Wordmark, .heading, outfit titles (400/700) · Tailwind: font-display" },
      native: { $type: "fontFamily", $value: ["SF Pro Text", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"], $description: "Native iOS shell (.native-shell) overrides Geist with the system font" },
    },
    weight: {
      regular: { $type: "fontWeight", $value: 400 },
      medium: { $type: "fontWeight", $value: 500 },
      semibold: { $type: "fontWeight", $value: 600 },
      bold: { $type: "fontWeight", $value: 700 },
    },
    size: named(fontSizeScale, TEXT_NAMES, "text"),
  },
  spacing: named(spacingScale),
  radius: named(radiusScale, RADIUS_NAMES, "rounded"),
  shadow: {
    dock: { $type: "shadow", $value: { color: "#1c191724", offsetX: "0px", offsetY: "6px", blur: "20px", spread: "0px" }, $description: ".native-tabbar floating dock" },
    fab: { $type: "shadow", $value: { color: "#00000038", offsetX: "0px", offsetY: "4px", blur: "12px", spread: "0px" }, $description: ".native-fab Create button" },
    sheet: { $type: "shadow", $value: { color: "#00000040", offsetX: "0px", offsetY: "-10px", blur: "40px", spread: "0px" }, $description: ".native-sheet-content bottom sheet" },
  },
  motion: {
    duration: {
      instant: { $type: "duration", $value: "150ms", $description: "pop-in, tab press" },
      fast: { $type: "duration", $value: "200ms", $description: "theme cross-fade" },
      base: { $type: "duration", $value: "260ms", $description: "fade-up, native page push" },
      spring: { $type: "duration", $value: "420ms", $description: "canvas-pop" },
      slow: { $type: "duration", $value: "900ms", $description: "board-win ring" },
    },
    easing: {
      standard: { $type: "cubicBezier", $value: [0.22, 1, 0.36, 1], $description: "pop-in, page-in, try-on reveal" },
      spring: { $type: "cubicBezier", $value: [0.34, 1.5, 0.5, 1], $description: "canvas-pop overshoot" },
      sheet: { $type: "cubicBezier", $value: [0.32, 0.72, 0, 1], $description: "iOS-sheet curve (board-win)" },
    },
  },
  opacity: {
    scrim: { $type: "number", $value: 0.4, $description: ".native-sheet-overlay rgba(0,0,0,.4) + 4px blur" },
    topbar: { $type: "number", $value: 0.88, $description: ".native-topbar background mix + 12px blur" },
  },
};

// Per-mode files for Figma's native "Import variables" (one DTCG file per mode).
const modeFile = (mode) => ({
  color: Object.fromEntries(
    Object.entries(color).map(([k, v]) => [k, { $type: "color", $value: v.$extensions["com.figma"].modes[mode], $description: v.$description }]),
  ),
});

await mkdir(join(OUT, "tokens"), { recursive: true });
await writeFile(join(OUT, "figma-tokens.json"), JSON.stringify(tokens, null, 2) + "\n");
await writeFile(join(OUT, "tokens/light.tokens.json"), JSON.stringify(modeFile("Light"), null, 2) + "\n");
await writeFile(join(OUT, "tokens/dark.tokens.json"), JSON.stringify(modeFile("Dark"), null, 2) + "\n");
await writeFile(join(OUT, "audit-data.json"), JSON.stringify(audit, null, 2) + "\n");

console.log(`scanned ${files.length} files · token class uses ${tokenClassUses}`);
console.log(`rogue UI hex: ${audit.hexRogue.length} distinct / ${audit.hexRogue.reduce((a, b) => a + b.count, 0)} uses (+${audit.hexData.length} data colours in lib/api)`);
console.log(`token hex retyped: ${audit.hexTokenDuplicates.reduce((a, b) => a + b.count, 0)} uses`);
console.log(`palette classes: ${audit.paletteClasses.length} distinct / ${audit.paletteClasses.reduce((a, b) => a + b.count, 0)} uses`);
console.log(`font sizes: ${audit.fontSizes.map((x) => `${x.value}px×${x.count}`).join(" ")}`);
console.log(`off-grid spacing: ${audit.offGridSpacing.length} distinct / ${audit.offGridSpacing.reduce((a, b) => a + b.count, 0)} uses`);
console.log(`radii: ${audit.radii.map((x) => `${x.value}×${x.count}`).join(" ")}`);
