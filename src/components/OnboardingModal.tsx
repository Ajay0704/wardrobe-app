"use client";

import { useState } from "react";
import { Button } from "./ui";
import {
  STYLE_GOALS,
  STYLE_LEANS,
  STYLE_OCCASIONS,
  applyQuizToProfile,
  clampOccasions,
  styleSnapshotBlurb,
  styleSnapshotTitle,
  type StyleGoal,
  type StyleLean,
  type StyleOccasion,
} from "@/lib/style-quiz";
import { useWardrobe } from "@/lib/store";

type Step = "goal" | "occasions" | "lean" | "snapshot";

const STEPS: Step[] = ["goal", "occasions", "lean", "snapshot"];

/**
 * Research-backed first-run quiz (ends at snapshot).
 * Activation lives on empty Today — not as another wizard step.
 */
export function OnboardingModal() {
  const { profile, updateProfile, setView } = useWardrobe();
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<StyleGoal | undefined>(profile.styleGoal);
  const [occasions, setOccasions] = useState<StyleOccasion[]>(
    profile.styleOccasions ?? [],
  );
  const [lean, setLean] = useState<StyleLean | undefined>(profile.styleLean);

  const stepIndex = STEPS.indexOf(step);
  const progress = `${stepIndex + 1} of ${STEPS.length}`;

  const snapshotTitle = styleSnapshotTitle(goal, occasions, lean);
  const snapshotBlurb = styleSnapshotBlurb(goal, occasions);

  const finish = () => {
    updateProfile(applyQuizToProfile({ goal, occasions, lean }));
    setView("today");
  };

  const skip = () => {
    updateProfile({ onboardingComplete: true });
    setView("today");
  };

  const toggleOccasion = (id: StyleOccasion) => {
    setOccasions((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return clampOccasions([...prev, id]);
    });
  };

  const canContinue =
    (step === "goal" && Boolean(goal)) ||
    (step === "occasions" && occasions.length > 0) ||
    (step === "lean" && Boolean(lean)) ||
    step === "snapshot";

  const goNext = () => {
    if (step === "snapshot") {
      finish();
      return;
    }
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]!);
  };

  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]!);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="native-modal-sheet animate-fade-up flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:max-w-md sm:rounded-3xl">
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

        <div
          className="h-1 w-full bg-surface-2"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        >
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
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
                Next: add what you&apos;d wear this week on Today — two pieces
                unlocks your first look. Change this anytime in Settings →
                Preferences.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          {stepIndex > 0 && (
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          )}
          <Button className="flex-1" disabled={!canContinue} onClick={goNext}>
            {step === "snapshot" ? "Enter Wardrobe" : "Next"}
          </Button>
        </div>
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
