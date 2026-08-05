/**
 * Generates the drawn starter-closet garments (AJA-277).
 *
 * WHY DRAWINGS. The previous starter closet used genuine beautified product photos, which
 * made samples indistinguishable from a user's own clothes. Four of eighteen real users
 * ended up looking like they had a closet when they had nothing, and the samples shipped
 * with fabricated `wearCount` (up to 19) and `lastWornAt` dates EARLIER than their own
 * `createdAt`, which made every wear/analytics figure unusable. A line drawing cannot be
 * mistaken for a photograph of your own shirt.
 *
 * WHY BAKED INK, NOT `currentColor`. Items render through `<img src>` everywhere (ItemCard,
 * ClosetGrid, the canvas board), and an SVG loaded as an image cannot inherit the page's
 * colour — `currentColor` resolves to black. So the stroke is baked, and a
 * `prefers-color-scheme` block inside each SVG lightens it when the OS is dark. The app's
 * dark mode is a `.dark` CLASS, so OS and app theme can disagree; the mid-tone ink is chosen
 * to stay legible on both #faf9f7 and #1c1a19 for that case.
 *
 * Run: node scripts/gen-sketch-samples.mjs
 * Output: public/samples/sketch/<slug>.svg (12 files, ~1KB each)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Flat-sketch garments on a 120x130 canvas. `d` = outline (2.1), `dt` = detail (1.25, faded). */
const GARMENTS = {
  chinos: {
    name: "Chinos",
    d: "<path d=\"M35 20h50v10H35z\"/> <path d=\"M35 30l3 94h18l4-62 4 62h18l3-94\"/>",
    dt: "<path d=\"M47 34v88M73 34v88\"/><path d=\"M60 30v11\"/>",
  },
  coat: {
    name: "Trench coat",
    d: "<path d=\"M41 24 17 38l-3 44 13 4 5-34\"/><path d=\"M79 24l24 14 3 44-13 4-5-34\"/> <path d=\"M41 24v98c0 4 2 6 6 6h26c4 0 6-2 6-6V24\"/> <path d=\"M41 24l19 13 19-13\"/>",
    dt: "<path d=\"M55 37v91\"/><path d=\"M42 80h37\"/><circle cx=\"48\" cy=\"56\" r=\"1.5\"/><circle cx=\"48\" cy=\"70\" r=\"1.5\"/>",
  },
  dress: {
    name: "Dress",
    d: "<path d=\"M45 24c0 0 6-6 15-6s15 6 15 6l12 8-5 16-6-3v9l14 68c1 4-1 6-5 6H35c-4 0-6-2-5-6l14-68v-9l-6 3-5-16z\"/> <path d=\"M45 24c5 8 25 8 30 0\"/>",
    dt: "<path d=\"M44 62c10 4 22 4 32 0\"/>",
  },
  jacket: {
    name: "Field jacket",
    d: "<path d=\"M42 24 18 37l-3 46 14 4 5-36\"/><path d=\"M78 24l24 13 3 46-14 4-5-36\"/> <path d=\"M42 24v92c0 4 2 6 6 6h24c4 0 6-2 6-6V24\"/> <path d=\"M42 24l18 12 18-12\"/>",
    dt: "<path d=\"M60 36v86\"/><rect x=\"45\" y=\"74\" width=\"12\" height=\"11\" rx=\"1.5\"/><rect x=\"63\" y=\"74\" width=\"12\" height=\"11\" rx=\"1.5\"/>",
  },
  jeans: {
    name: "Jeans",
    d: "<path d=\"M34 20h52v11H34z\"/> <path d=\"M34 31l4 92h17l5-58 5 58h17l4-92\"/>",
    dt: "<path d=\"M60 31v13\"/><path d=\"M39 44c5 1 9 3 11 6M81 44c-5 1-9 3-11 6\"/> <path d=\"M41 20v-3m12 3v-3m14 3v-3m12 3v-3\"/>",
  },
  loafers: {
    name: "Loafers",
    d: "<path d=\"M20 85 L21 67 C21 64 23 62 26 62 L35 62 C39 62 43 64 46 67 L50 71 C58 75 68 78 77 81 C83 83 87 84 90 86 Z\"/> <path d=\"M16 85h80v4c0 3-2 5-5 5H21c-3 0-5-2-5-5z\"/>",
    dt: "<path d=\"M27 66C35 72 45 76 54 79\"/><path d=\"M45 72C50 75 56 77 61 79\"/>",
  },
  shirt: {
    name: "Oxford shirt",
    d: "<path d=\"M41 26 19 38l-4 42 14 4 6-34\"/><path d=\"M79 26l22 12 4 42-14 4-6-34\"/> <path d=\"M41 26v90c0 4 2 6 6 6h26c4 0 6-2 6-6V26\"/> <path d=\"M52 19l8 11 8-11\"/><path d=\"M52 19l-7 9m23-9l7 9\"/>",
    dt: "<path d=\"M60 30v92\"/><circle cx=\"60\" cy=\"46\" r=\"1.5\"/><circle cx=\"60\" cy=\"66\" r=\"1.5\"/><circle cx=\"60\" cy=\"86\" r=\"1.5\"/><circle cx=\"60\" cy=\"106\" r=\"1.5\"/>",
  },
  skirt: {
    name: "Skirt",
    d: "<path d=\"M36 22h48v9H36z\"/><path d=\"M36 31l-8 82c-.5 4 1 6 5 6h54c4 0 5.5-2 5-6l-8-82\"/>",
    dt: "<path d=\"M48 35l-4 80M60 35v80M72 35l4 80\"/>",
  },
  sneakers: {
    name: "Sneakers",
    d: "<path d=\"M18 85 L19 61 C19 58 21 56 24 56 L35 56 C39 56 43 58 47 62 L52 67 C61 72 72 76 82 79 C88 81 92 83 95 86 Z\"/> <path d=\"M14 85h86v5c0 3-2 5-5 5H19c-3 0-5-2-5-5z\"/>",
    dt: "<path d=\"M20 64C26 61 32 60 38 60\"/><path d=\"M47 62 43 75\"/> <path d=\"M53 68 50 77M61 72 58 81M69 76 67 84\"/><path d=\"M82 85C82 82 84 80 87 79\"/>",
  },
  sweater: {
    name: "Crew sweater",
    d: "<path d=\"M44 25c0 0 6-6 16-6s16 6 16 6l26 15-8 42-10-6v34c0 4-2 6-6 6H42c-4 0-6-2-6-6V76l-10 6-8-42z\"/> <path d=\"M44 25c5 9 27 9 32 0\"/>",
    dt: "<path d=\"M46 30c4 6 24 6 28 0\"/><path d=\"M36 104h48\"/>",
  },
  tee: {
    name: "Tee",
    d: "<path d=\"M43 23c0 0 6-5 17-5s17 5 17 5l21 12-8 19-7-6v66c0 4-2 6-6 6H43c-4 0-6-2-6-6V48l-7 6-8-19z\"/> <path d=\"M43 23c6 9 28 9 34 0\"/>",
  },
  trousers: {
    name: "Wide trousers",
    d: "<path d=\"M33 20h54v11H33z\"/> <path d=\"M33 31l-2 94h24l5-62 5 62h24l-2-94\"/>",
    dt: "<path d=\"M45 35v86M75 35v86\"/><path d=\"M60 31v11\"/>",
  },
};

const INK_LIGHT = "#6f6862"; // on #faf9f7 / #fff
const INK_DARK = "#b9b1a7"; // on #131211 / #1c1a19

function svg({ d, dt }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" fill="none">
<style>
.o,.t{stroke:${INK_LIGHT};stroke-linecap:round;stroke-linejoin:round;fill:none}
.o{stroke-width:2.1}
.t{stroke-width:1.25;opacity:.42}
@media (prefers-color-scheme:dark){.o,.t{stroke:${INK_DARK}}}
</style>
<g class="o">${d}</g>${dt ? `\n<g class="t">${dt}</g>` : ""}
</svg>
`;
}

const dir = join(process.cwd(), "public", "samples", "sketch");
mkdirSync(dir, { recursive: true });
let n = 0;
for (const [slug, g] of Object.entries(GARMENTS)) {
  writeFileSync(join(dir, `${slug}.svg`), svg(g), "utf8");
  n++;
}
console.log(`wrote ${n} sketches to public/samples/sketch/`);
