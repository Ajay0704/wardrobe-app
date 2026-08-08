/**
 * The onboarding flow must survive its own state writes.
 *
 * Run: npm run test:onboarding
 *
 * The bug this exists for: tapping "Show me how it works" persisted the quiz answers with
 * `applyQuizToProfile`, which hard-codes `onboardingComplete: true`. AppShell gates the whole
 * modal on `!profile.onboardingComplete`, so the write unmounted onboarding on the next render.
 * FirstLookGame, FirstSixCapture, FirstOutfit and MorningAsk — the entire payoff of AJA-277 and
 * AJA-279 — were unreachable in production. Found by walking the flow on the simulator; no unit
 * test caught it, because every existing test checked the look-count maths rather than whether
 * the screen still existed.
 *
 * So this file models THE GATE, not the data. A patch is judged by what it does to
 * `showOnboarding`, which is the only thing that decides whether the user sees the next step.
 */
import {
  applyQuizToProfile,
  quizProfilePatch,
  type QuizInput,
} from "@/lib/style-quiz";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

/** AppShell.tsx: `showOnboarding = Boolean(authUser && !profile.onboardingComplete)`. */
const stillOnboarding = (profile: Record<string, unknown>) =>
  Boolean("user" && !profile.onboardingComplete);

const ANSWERS: QuizInput = {
  goal: "faster",
  occasions: ["everyday"],
  lean: "polished",
};

console.log("\n=== the mid-flow patch must NOT end onboarding ===");
const mid = quizProfilePatch(ANSWERS);
ok(
  !("onboardingComplete" in mid),
  "quizProfilePatch does not carry onboardingComplete at all",
  Object.keys(mid).join(", "),
);
ok(
  stillOnboarding({ ...{}, ...mid }) === true,
  "after saving answers mid-flow, showOnboarding is still TRUE (the demo can render)",
);

console.log("\n=== but the answers are genuinely saved (POSITIVE CONTROL) ===");
// Without these, a patch that returned {} would pass every assertion above.
ok(mid.styleGoal === "faster", "styleGoal saved", String(mid.styleGoal));
ok(mid.styleLean === "polished", "styleLean saved", String(mid.styleLean));
ok(
  Array.isArray(mid.styleOccasions) && mid.styleOccasions.includes("everyday"),
  "styleOccasions saved",
  JSON.stringify(mid.styleOccasions),
);
ok(
  Array.isArray(mid.styleVibes) && mid.styleVibes.length > 0,
  "styleVibes derived",
  JSON.stringify(mid.styleVibes),
);
ok(typeof mid.styleSnapshot === "string" && mid.styleSnapshot.length > 0,
  "styleSnapshot derived", String(mid.styleSnapshot));

console.log("\n=== the finishing patch MUST end onboarding ===");
const done = applyQuizToProfile(ANSWERS);
ok(done.onboardingComplete === true, "applyQuizToProfile sets onboardingComplete");
ok(
  stillOnboarding({ ...{}, ...done }) === false,
  "after finishing, showOnboarding is FALSE (the modal closes)",
);

console.log("\n=== the two differ ONLY by the flag ===");
// Guards the split itself: if someone re-merges them, or quizProfilePatch silently drops a
// field, this catches it without re-asserting every key by hand.
const { onboardingComplete, ...doneRest } = done;
void onboardingComplete;
ok(
  JSON.stringify(doneRest) === JSON.stringify(mid),
  "applyQuizToProfile === quizProfilePatch + the flag, nothing else",
);

console.log("\n=== empty answers still behave ===");
const empty = quizProfilePatch({ occasions: [] });
ok(!("onboardingComplete" in empty), "an empty quiz still cannot end onboarding");
ok(stillOnboarding({ ...empty }) === true, "…and showOnboarding stays true");

// ---------------------------------------------------------------------------
// The call site. Everything above passes even if OnboardingModal goes back to calling
// applyQuizToProfile mid-flow — which is exactly what the bug WAS. The split only helps if
// the right function is used in the right place, so assert that against the real source.
// ---------------------------------------------------------------------------
console.log("\n=== the mid-flow CALL SITE uses the non-terminal patch ===");
const { readFileSync } = await import("node:fs");
const src = readFileSync(
  new URL("../src/components/OnboardingModal.tsx", import.meta.url),
  "utf8",
);

// The `step === "snapshot"` branch of goNext: from that test to its closing `return;`.
const start = src.indexOf('if (step === "snapshot")');
const end = src.indexOf("return;", start);
const branch = start >= 0 && end > start ? src.slice(start, end) : "";

ok(branch.length > 0, "found the snapshot branch in OnboardingModal", `${branch.length} chars`);
ok(
  branch.includes("quizProfilePatch("),
  "it saves answers with quizProfilePatch",
);
// THE regression guard. This is the single assertion that fails on the original bug.
ok(
  !branch.includes("applyQuizToProfile("),
  "it does NOT call applyQuizToProfile (which would unmount the modal mid-flow)",
);
ok(
  src.includes("const finish = ()") && /finish = \(\) => \{[\s\S]{0,200}applyQuizToProfile\(/.test(src),
  "POSITIVE CONTROL: finish() still DOES call applyQuizToProfile",
);

console.log(`\n${fails === 0 ? "ALL ONBOARDING-FLOW CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
