/**
 * AJA-305 — pacing. Run: npm run test:spin-pacing
 *
 * The model doesn't turn at an even speed (the test clip lingered ~1s on the back), so the
 * turntable maps a drag to ANGLE, estimated from how much each frame differs from the last.
 */
const { turnAngles, frameForAngle } = await import("@/lib/spin-pacing");

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

console.log("\n=== turnAngles ===");
const even = turnAngles([0, 1, 1, 1, 1]);
ok(even.length === 5, "one angle per frame");
ok(close(even[0], 0) && close(even[4], 360), "starts at 0, ends at 360", even.join(","));
ok(close(even[1], 90) && close(even[2], 180), "even differences turn evenly");

const linger = turnAngles([0, 10, 10, 0, 0, 0, 10, 10]);
ok(linger.every((a, i) => i === 0 || a > linger[i - 1]), "strictly increasing, even through a hold");
const holdStep = linger[4] - linger[3];
const moveStep = linger[2] - linger[1];
ok(holdStep > 0 && holdStep < moveStep / 10, "a held frame advances only by the floor", `${holdStep} vs ${moveStep}`);

ok(turnAngles([]).length === 0 && turnAngles([5]).join() === "0", "0 and 1 frames are safe");
ok(close(turnAngles([0, 0, 0, 0])[3], 360), "all-identical frames still spread to 360");
ok(turnAngles([0, NaN, 1, 1]).every(Number.isFinite), "a NaN difference can't poison the result");

console.log("\n=== frameForAngle ===");
const a = [0, 90, 180, 270, 360];
ok(frameForAngle(a, 0) === 0, "0° → first frame");
ok(frameForAngle(a, 80) === 1, "nearest frame below");
ok(frameForAngle(a, 100) === 1, "nearest frame above");
ok(frameForAngle(a, 360) === 0 && frameForAngle(a, 720 + 90) === 1, "wraps past 360");
ok(frameForAngle(a, -90) === 3, "wraps negative angles");
ok(frameForAngle(a, 350) === 4, "near a full turn picks the last frame (it IS the front)");
ok(frameForAngle([], 45) === 0, "no frames is safe");

console.log(fails === 0 ? "\nSPIN-PACING CHECKS PASSED" : `\n${fails} SPIN-PACING CHECK(S) FAILED`);
if (fails) process.exit(1);
