/**
 * AJA-278 — gate for the try-on face crop.
 *
 * Run: npm run test:face
 *
 * Runs against the REAL modules. Everything here is pure, so the whole decision layer
 * is covered without a Gemini request or `sharp`: the coordinate convention
 * (`gemini-box`), the crop geometry, and the ambiguity rule that decides when NOT to
 * crop.
 *
 * The governing requirement is asymmetric, and the tests are weighted to match: a
 * missed crop costs a marginally worse likeness, while a WRONG crop hands the model a
 * stranger's face labelled "the authority on this person's identity" and makes the
 * render worse than doing nothing. So most of this file is about refusing.
 *
 * NON-VACUITY: every "rejects X" assertion would pass on a function that returned null
 * unconditionally. Section 2 establishes that a realistic box produces a real crop
 * FIRST, and section 4's area-fraction numbers pin the actual geometry, so the refusals
 * below them mean something.
 */
import { faceAreaFraction, faceCropBox, subjectHead } from "../src/lib/face-crop.ts";
import { toBox } from "../src/lib/gemini-box.ts";
import { buildTryOnPrompt } from "../src/lib/tryon-prompt.ts";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
console.log("\n=== 1. gemini-box: y comes FIRST ===");
// The trap this shared module exists for. [ymin, xmin, ymax, xmax], not [x,y,w,h].
const b = toBox([100, 200, 300, 500]);
ok(!!b, "a well-formed box parses");
ok(!!b && near(b.x, 0.2, 0.001), "xmin -> x", String(b?.x));
ok(!!b && near(b.y, 0.1, 0.001), "ymin -> y  (NOT swapped with x)", String(b?.y));
ok(!!b && near(b.w, 0.3, 0.001), "xmax-xmin -> w", String(b?.w));
ok(!!b && near(b.h, 0.2, 0.001), "ymax-ymin -> h", String(b?.h));
ok(toBox([300, 500, 100, 200])?.x === 0.2, "reversed coords are normalized, not rejected");
ok(toBox([100, 200, 100, 200]) === null, "a degenerate (zero-area) box is rejected");
ok(toBox([1, 2, 3]) === null, "wrong length rejected");
ok(toBox("nope") === null, "non-array rejected");
ok(toBox([NaN, 0, 10, 10]) === null, "NaN rejected");

// ---------------------------------------------------------------------------
console.log("\n=== 2. the real case: a head in a full-length photo ===");
// 736x1600 is exactly what toCompressedDataUrl emits for a portrait phone photo
// (maxDim 1600). Head near the top, ~24% of width.
const W = 736;
const H = 1600;
const head = { x: 0.38, y: 0.03, w: 0.24, h: 0.11 };
const crop = faceCropBox(head, W, H);
ok(!!crop, "a realistic head box PRODUCES a crop (anchor for every rejection below)");
ok(!!crop && crop.width === crop.height, "the crop is square", crop && `${crop.width}x${crop.height}`);
ok(
  !!crop && crop.left >= 0 && crop.top >= 0 && crop.left + crop.width <= W && crop.top + crop.height <= H,
  "the crop is inside the image",
  crop && `left=${crop.left} top=${crop.top} side=${crop.width}`,
);
// The head must actually be inside the crop — the entire point.
const headPx = { l: head.x * W, t: head.y * H, r: (head.x + head.w) * W, b: (head.y + head.h) * H };
ok(
  !!crop &&
    crop.left <= headPx.l &&
    crop.top <= headPx.t &&
    crop.left + crop.width >= headPx.r &&
    crop.top + crop.height >= headPx.b,
  "the crop CONTAINS the whole head box",
);

// ---------------------------------------------------------------------------
console.log("\n=== 3. edge clamping ===");
// A full-length shot puts the head at the very top, so the padded square would run off
// the frame. It must slide down, not shrink — shrinking would cut off hair.
const topEdge = faceCropBox({ x: 0.4, y: 0.0, w: 0.2, h: 0.09 }, W, H);
ok(!!topEdge && topEdge.top === 0, "a head at the top edge slides into frame (top=0)", String(topEdge?.top));
ok(!!topEdge && topEdge.width === topEdge.height, "…and it is still square");
const rightEdge = faceCropBox({ x: 0.82, y: 0.05, w: 0.17, h: 0.08 }, W, H);
ok(
  !!rightEdge && rightEdge.left + rightEdge.width <= W,
  "a head at the right edge stays in bounds",
  rightEdge && `left=${rightEdge.left}+${rightEdge.width} <= ${W}`,
);
const square = faceCropBox({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 }, 1000, 1000);
ok(!!square && square.width === square.height, "square image, centred head → square crop");

// ---------------------------------------------------------------------------
console.log("\n=== 4. the premise: does facial density actually move? ===");
// This is the metric that can DISPROVE the approach. If it doesn't move, pixel density
// isn't the limiter and the next suspect is prompt weighting.
const before = faceAreaFraction(head, null, W, H);
const after = faceAreaFraction(head, crop, W, H);
ok(before < 0.04, `face is a sliver of the full photo: ${(before * 100).toFixed(2)}%`);
ok(after > 0.2, `face dominates the crop: ${(after * 100).toFixed(1)}%`);
ok(after / before > 8, `density improved ${(after / before).toFixed(1)}x`);
ok(faceAreaFraction(head, null, 0, 0) === 0, "a zero-area frame reports 0 rather than Infinity");

// ---------------------------------------------------------------------------
console.log("\n=== 5. refusing to crop — the expensive mistakes ===");
ok(
  faceCropBox({ x: 0.15, y: 0.1, w: 0.7, h: 0.7 }, 1000, 1000) === null,
  "already a close-up (49% of frame) → null, not a near-duplicate reference",
);
ok(
  faceCropBox({ x: 0.1, y: 0.4, w: 0.8, h: 0.12 }, 1000, 1000) === null,
  "a wide, short box (a torso, or two faces merged) → null",
);
ok(
  faceCropBox({ x: 0.45, y: 0.1, w: 0.06, h: 0.5 }, 1000, 1000) === null,
  "a tall, narrow box (a limb) → null",
);
ok(
  faceCropBox({ x: 0.45, y: 0.45, w: 0.02, h: 0.02 }, 200, 200) === null,
  "a crop below the useful minimum → null (adds a competing reference for nothing)",
);
ok(faceCropBox({ x: 0.4, y: 0.4, w: 0.1, h: 0.1 }, 0, 0) === null, "bogus image dimensions → null");
ok(faceCropBox({ x: 0.4, y: 0.4, w: 0, h: 0.1 }, W, H) === null, "zero width → null");
ok(faceCropBox({ x: -0.1, y: 0.4, w: 0.2, h: 0.2 }, W, H) === null, "box starting outside the frame → null");
ok(faceCropBox({ x: 0.9, y: 0.4, w: 0.3, h: 0.2 }, W, H) === null, "box extending past the frame → null");
ok(
  faceCropBox({ x: 0.4, y: 0.4, w: Number.NaN, h: 0.1 }, W, H) === null,
  "NaN in the box → null",
);

// ---------------------------------------------------------------------------
console.log("\n=== 6. whose face? the ambiguity rule ===");
const big = { x: 0.4, y: 0.05, w: 0.2, h: 0.1 };
const small = { x: 0.1, y: 0.06, w: 0.08, h: 0.04 };
const alsoBig = { x: 0.1, y: 0.05, w: 0.19, h: 0.1 };
ok(subjectHead([big]) === big, "one head → that head (anchor: the rule can say yes)");
ok(subjectHead([]) === null, "no heads → null");
ok(subjectHead([big, small]) === big, "one clearly dominant head (>=2x area) → the subject");
ok(
  subjectHead([big, alsoBig]) === null,
  "TWO comparable heads → null; guessing risks cropping a bystander as the identity source",
);
ok(subjectHead([small, big]) === big, "order doesn't matter — largest wins, not first");

// ---------------------------------------------------------------------------
console.log("\n=== 7. the prompt actually switches, and the indices shift ===");
// The crop is only half the wiring. ID_WITH_FACE was dead code for three commits
// because nothing ever set hasFace, so assert the flag really reroutes the prompt AND
// renumbers the manifest — an off-by-one here would tell the model a garment photo is
// the identity authority, which is the worst possible failure of this feature.
const g2 = [{ label: "tshirt" }, { label: "jeans" }];
const withFace = buildTryOnPrompt({ hasFace: true, hasPerson: true, garments: g2 });
const photoOnly = buildTryOnPrompt({ hasFace: false, hasPerson: true, garments: g2 });
const modelOnly = buildTryOnPrompt({ hasFace: false, hasPerson: false, garments: g2 });

ok(withFace.includes("IMAGE 1 is a CLOSE-UP"), "hasFace -> ID_WITH_FACE is used");
ok(!photoOnly.includes("IMAGE 1 is a CLOSE-UP"), "…and it is NOT used without a face");
ok(photoOnly.includes("IMAGE 1 is a photo of a real person"), "no face -> ID_PHOTO_ONLY (unchanged)");
ok(withFace.includes("IMAGE 1 — face close-up"), "manifest names IMAGE 1 as the face");
ok(withFace.includes("IMAGE 2 — full body"), "manifest names IMAGE 2 as the body");
ok(withFace.includes("IMAGE 3 — tshirt") && withFace.includes("IMAGE 4 — jeans"), "garments shift to 3 and 4");
ok(
  photoOnly.includes("IMAGE 2 — tshirt") && !photoOnly.includes("IMAGE 3 — tshirt"),
  "without a face the same garment is IMAGE 2 — the offset really is derived",
);
ok(
  modelOnly.includes("IMAGE 1 — tshirt"),
  "with no person at all, garments start at IMAGE 1 (generic model path intact)",
);
// hasFace without a person must not renumber anything — the route also guards this, but
// the prompt is the thing that would lie to the model.
const faceNoPerson = buildTryOnPrompt({ hasFace: true, hasPerson: false, garments: g2 });
ok(
  faceNoPerson.includes("IMAGE 1 — tshirt") && !faceNoPerson.includes("face close-up"),
  "hasFace WITHOUT hasPerson is ignored rather than shifting indices",
);

console.log(fails === 0 ? "\nFACE-CROP CHECKS PASSED" : `\n${fails} FACE-CROP CHECK(S) FAILED`);
if (fails) process.exit(1);
