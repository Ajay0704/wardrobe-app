"use client";

import { useState } from "react";
import { Button } from "./ui";
import {
  STYLE_GOALS,
  STYLE_LEANS,
  STYLE_OCCASIONS,
  applyQuizToProfile,
  quizProfilePatch,
  clampOccasions,
  styleSnapshotBlurb,
  styleSnapshotTitle,
  type StyleGoal,
  type StyleLean,
  type StyleOccasion,
} from "@/lib/style-quiz";
import { isSampleItem } from "@/lib/demo-data";
import { useWardrobe } from "@/lib/store";
import { profileHandle, resolveStartView, validateHandle } from "@/lib/profile";
import { HandleField } from "./HandleField";
import FirstLookGame from "./onboarding/FirstLookGame";
import FirstOutfit from "./onboarding/FirstOutfit";
import FirstSixCapture from "./onboarding/FirstSixCapture";
import MorningAsk from "./onboarding/MorningAsk";

type QuizStep = "handle" | "gender" | "goal" | "occasions" | "lean" | "snapshot";
/**
 * After the quiz: the sample demo (AJA-279), then First Six (AJA-277) — capture, the payoff, and
 * the morning ask. The demo sits AFTER every question deliberately: it needs the department answer
 * to choose which six pieces to offer, and the order was confirmed against a prototype.
 */
type Step = QuizStep | "game" | "capture" | "outfit" | "morning";

/** The quiz proper. Drives the "N of N" label and the bar; the First Six steps are not part
 *  of it, so the progress indicator does not grow and then stall. */
const ALL_QUIZ_STEPS: QuizStep[] = [
  "handle",
  "gender",
  "goal",
  "occasions",
  "lean",
  "snapshot",
];

const isQuizStep = (s: Step): s is QuizStep => (ALL_QUIZ_STEPS as Step[]).includes(s);

/**
 * Ask for the @handle only if we don't already have one.
 *
 * The sign-up sheet collects a username (ProfileFields → HandleField), so asking again as the
 * first onboarding step made a new user pick a handle, submit, and immediately pick a handle —
 * the same question twice in a row, which reads as the app having lost their answer.
 *
 * It is NOT safe to just delete the step, which is why this is a condition rather than a
 * removal. Two live paths arrive here with no handle at all:
 *   - Google / Apple (AJA-194) never render the sign-up form, so nothing ever asked.
 *   - Email sign-up does not gate submit on handle validity, so the field can be left blank.
 * For both, this step is the only place a handle gets claimed, and `profileHandle()`'s
 * email-derived fallback is a DISPLAY default — it never persists a username, so skipping the
 * ask outright would leave those accounts unfindable by the friend search that needs it.
 */
function quizStepsFor(username: string | undefined): QuizStep[] {
  if (validateHandle(username ?? "").ok) {
    return ALL_QUIZ_STEPS.filter((s) => s !== "handle");
  }
  return ALL_QUIZ_STEPS;
}

const GENDERS: { id: "female" | "male" | "all"; label: string; hint: string }[] = [
  { id: "female", label: "Women's", hint: "Show women's styles" },
  { id: "male", label: "Men's", hint: "Show men's styles" },
  { id: "all", label: "Everything", hint: "Show it all" },
];

/**
 * Research-backed first-run quiz (ends at snapshot).
 * Activation lives on empty Today — not as another wizard step.
 */
export function OnboardingModal() {
  const { profile, updateProfile, setView, authUser, items } = useWardrobe();
  /**
   * Frozen at mount. Recomputing would shrink the list the moment the handle step saves a
   * username, renumbering the steps underneath the user mid-flow.
   */
  const [quizSteps] = useState<QuizStep[]>(() => quizStepsFor(profile.username));
  const [step, setStep] = useState<Step>(() => quizSteps[0]!);
  const [handle, setHandle] = useState(() =>
    profileHandle({
      username: profile.username,
      email: profile.email,
      displayName: profile.displayName,
    }),
  );
  const [handleValid, setHandleValid] = useState(false);
  const [shopGender, setShopGender] = useState<"male" | "female" | "all" | undefined>(
    profile.shopGender,
  );
  const [goal, setGoal] = useState<StyleGoal | undefined>(profile.styleGoal);
  const [occasions, setOccasions] = useState<StyleOccasion[]>(
    profile.styleOccasions ?? [],
  );
  const [lean, setLean] = useState<StyleLean | undefined>(profile.styleLean);

  const quiz = isQuizStep(step);
  const stepIndex = quizSteps.indexOf(step as QuizStep);
  const progress = `${stepIndex + 1} of ${quizSteps.length}`;

  const snapshotTitle = styleSnapshotTitle(goal, occasions, lean);
  const snapshotBlurb = styleSnapshotBlurb(goal, occasions);

  /**
   * Where onboarding lets go of the user.
   *
   * It used to hand off to `resolveStartView`, which defaults to Explore — a shopping feed. So
   * someone who had just photographed six of their own garments and been shown an outfit made of
   * them landed on a browsing surface, with their new closet one unmentioned tab away. If they
   * own anything, we end where their clothes are.
   *
   * An EXPLICIT `startView` preference still wins: this only replaces the default, so a returning
   * user who chose a start screen in Settings is not overridden.
   */
  const landing = () => {
    if (profile.startView) return resolveStartView(profile);
    const ownsSomething = items.some((i) => !i.wishlist && !isSampleItem(i));
    return ownsSomething ? "wardrobe" : resolveStartView(profile);
  };

  const finish = () => {
    updateProfile(applyQuizToProfile({ goal, occasions, lean }));
    setView(landing());
  };

  const skip = () => {
    updateProfile({ onboardingComplete: true });
    setView(resolveStartView(profile));
  };

  const toggleOccasion = (id: StyleOccasion) => {
    setOccasions((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return clampOccasions([...prev, id]);
    });
  };

  const canContinue =
    (step === "handle" && handleValid) ||
    (step === "gender" && Boolean(shopGender)) ||
    (step === "goal" && Boolean(goal)) ||
    (step === "occasions" && occasions.length > 0) ||
    (step === "lean" && Boolean(lean)) ||
    step === "snapshot";

  const goNext = () => {
    if (step === "handle") updateProfile({ username: handle });
    // The quiz used to END here. It now hands over to First Six, which is the point at which
    // the user gets something back: their own six pieces and an outfit made of them. The quiz
    // answers are persisted before capture starts, so abandoning mid-capture still keeps them.
    if (step === "snapshot") {
      // quizProfilePatch, NOT applyQuizToProfile. The latter sets onboardingComplete, and
      // AppShell gates this entire modal on `!profile.onboardingComplete` — so writing it here
      // unmounted onboarding on the very next render and the demo never appeared. Answers are
      // still persisted, which was the point; finishing is `finish()`'s job alone.
      updateProfile(quizProfilePatch({ goal, occasions, lean }));
      // Hands over to the demo, which is where the user first sees what the app actually does.
      // Quiz answers are persisted before it, so abandoning later still keeps them.
      setStep("game");
      return;
    }
    const i = quizSteps.indexOf(step as QuizStep);
    if (i >= 0 && i < quizSteps.length - 1) setStep(quizSteps[i + 1]!);
  };

  const goBack = () => {
    const i = quizSteps.indexOf(step as QuizStep);
    if (i > 0) setStep(quizSteps[i - 1]!);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className={`native-modal-sheet animate-fade-up flex max-h-[92vh] w-full flex-col
          overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:max-w-md sm:rounded-3xl
          ${quiz ? "" : "h-[92vh] sm:h-[42rem]"}`}
      >
        {/* Quiz chrome only. The First Six screens are full-bleed and own their own CTAs —
            keeping the step counter over them would imply the quiz had grown by three. */}
        {quiz && (
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Style quiz · {progress}
            </p>
            <button
              type="button"
              onClick={skip}
              className="text-sm text-muted hover:text-foreground"
            >
              Skip
            </button>
          </div>
        )}

        {quiz && (
        <div
          className="h-1 w-full bg-surface-2"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={quizSteps.length}
        >
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((stepIndex + 1) / quizSteps.length) * 100}%` }}
          />
        </div>
        )}

        <div
          className={
            quiz
              ? "flex-1 overflow-y-auto px-5 py-6"
              : // First Six manages its own scrolling and needs a definite height for the
                // viewfinder to fill, so no overflow-auto and no vertical padding here.
                "flex min-h-0 flex-1 flex-col px-5"
          }
        >
          {step === "handle" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="heading text-2xl">
                Claim your @handle
              </h2>
              <p className="text-sm text-muted">
                This is how friends find and add you — pick something they&apos;ll
                recognize. You can change it later in Settings.
              </p>
              <HandleField
                value={handle}
                onChange={setHandle}
                onValidChange={setHandleValid}
                myId={authUser?.id ?? null}
              />
            </div>
          )}

          {step === "gender" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="heading text-2xl">
                What should we show you?
              </h2>
              <p className="text-sm text-muted">
                Sets the pieces you&apos;ll style in a moment, and your Explore feed. You can
                change it anytime.
              </p>
              <div className="space-y-2">
                {GENDERS.map((g) => (
                  <ChoiceCard
                    key={g.id}
                    active={shopGender === g.id}
                    title={g.label}
                    hint={g.hint}
                    onClick={() => {
                      setShopGender(g.id);
                      // Chooses which six pieces the demo offers a few steps later. It no longer
                      // seeds a closet — nothing fake is filed as the user's (AJA-279).
                      updateProfile({ shopGender: g.id });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {step === "goal" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="heading text-2xl">
                What do you want help with?
              </h2>
              <p className="text-sm text-muted">
                Pick one — we&apos;ll shape Today around this.
              </p>
              <div className="space-y-2">
                {STYLE_GOALS.map((g) => (
                  <ChoiceCard
                    key={g.id}
                    active={goal === g.id}
                    title={g.label}
                    hint={g.hint}
                    onClick={() => setGoal(g.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === "occasions" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="heading text-2xl">
                Where do you dress most?
              </h2>
              <p className="text-sm text-muted">
                Up to 3. Outfit suggestions will prefer these moments.
              </p>
              <div className="space-y-2">
                {STYLE_OCCASIONS.map((o) => (
                  <ChoiceCard
                    key={o.id}
                    active={occasions.includes(o.id)}
                    title={o.label}
                    onClick={() => toggleOccasion(o.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === "lean" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="heading text-2xl">
                Which feels more like you?
              </h2>
              <p className="text-sm text-muted">
                One pick — easier than naming your whole aesthetic.
              </p>
              <div className="space-y-2">
                {STYLE_LEANS.map((l) => (
                  <ChoiceCard
                    key={l.id}
                    active={lean === l.id}
                    title={l.label}
                    hint={l.hint}
                    onClick={() => setLean(l.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === "snapshot" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="heading text-2xl">
                We get you
              </h2>
              <div className="rounded-2xl border border-line bg-surface-2/60 px-4 py-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Your style snapshot
                </p>
                <p className="heading mt-2 text-xl">{snapshotTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {snapshotBlurb}
                </p>
              </div>
              <p className="text-sm text-muted">
                Before you photograph anything — here&apos;s what the app does with six pieces.
                Have a go with ours, then we&apos;ll do yours. Change your style anytime in
                Settings → Style &amp; taste.
              </p>
            </div>
          )}
          {/* ——— The demo (AJA-279) ——— */}
          {step === "game" && (
            <FirstLookGame
              shopGender={shopGender}
              onDone={() => setStep("capture")}
            />
          )}
          {/* ——— First Six (AJA-277) ——— */}
          {step === "capture" && (
            <FirstSixCapture
              onDone={() => setStep("outfit")}
              // "Finish later" still goes to the payoff: whatever they DID capture may already
              // make an outfit, and if it doesn't, FirstOutfit names the missing slot. Dropping
              // them straight into an empty app is the failure this whole flow exists to avoid.
              onSkip={() => setStep("outfit")}
            />
          )}
          {step === "outfit" && (
            <FirstOutfit
              onAccept={() => setStep("morning")}
              onAddMore={() => setStep("capture")}
              onSkip={finish}
            />
          )}
          {step === "morning" && <MorningAsk onDone={finish} />}
        </div>

        {quiz && (
          <div className="flex gap-2 border-t border-line px-5 py-4">
            {stepIndex > 0 && (
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
            )}
            <Button className="flex-1" disabled={!canContinue} onClick={goNext}>
              {step === "snapshot" ? "Show me how it works" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        active
          ? "border-accent bg-accent-soft text-foreground"
          : "border-line bg-surface hover:border-accent/40"
      }`}
    >
      <span className="block text-sm font-medium">{title}</span>
      {hint && (
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      )}
    </button>
  );
}
