/**
 * First-run style quiz — high-signal questions (goal, occasions, lean)
 * that map to matching tags. Inspired by Stitch Fix / Wantable patterns:
 * life context + tradeoffs, then a short “we get you” snapshot, then a
 * tiny catalog activation (not a full-closet ask).
 */

export type StyleGoal =
  | "dressed_faster"
  | "use_what_i_own"
  | "plan_week"
  | "shop_smarter";

export type StyleOccasion =
  | "everyday"
  | "work"
  | "nights_out"
  | "active"
  | "formal";

export type StyleLean = "relaxed" | "polished" | "bold" | "classic";

export const STYLE_GOALS: {
  id: StyleGoal;
  label: string;
  hint: string;
}[] = [
  {
    id: "dressed_faster",
    label: "Get dressed faster",
    hint: "Fewer decisions in the morning",
  },
  {
    id: "use_what_i_own",
    label: "Wear more of what I own",
    hint: "Stop forgetting pieces in the closet",
  },
  {
    id: "plan_week",
    label: "Plan the week",
    hint: "Looks ready before the day starts",
  },
  {
    id: "shop_smarter",
    label: "Shop smarter",
    hint: "Buy less, fill real gaps",
  },
];

export const STYLE_OCCASIONS: {
  id: StyleOccasion;
  label: string;
  /** Maps into SUGGESTED_TAGS / matching vibe */
  vibe: string;
}[] = [
  { id: "everyday", label: "Everyday / casual", vibe: "casual" },
  { id: "work", label: "Work / meetings", vibe: "work" },
  { id: "nights_out", label: "Nights out / dates", vibe: "party" },
  { id: "active", label: "Workouts / errands", vibe: "athleisure" },
  { id: "formal", label: "Events / dressy", vibe: "formal" },
];

/** Visual trade-off style — pick one lean (Stitch Fix–style signal). */
export const STYLE_LEANS: {
  id: StyleLean;
  label: string;
  hint: string;
  vibes: string[];
}[] = [
  {
    id: "relaxed",
    label: "Relaxed & easy",
    hint: "Soft layers, comfort first",
    vibes: ["casual", "cozy"],
  },
  {
    id: "polished",
    label: "Polished & put-together",
    hint: "Clean lines, intentional",
    vibes: ["minimal", "work"],
  },
  {
    id: "bold",
    label: "Bold & expressive",
    hint: "Statement pieces, energy",
    vibes: ["streetwear", "party"],
  },
  {
    id: "classic",
    label: "Classic & timeless",
    hint: "Quiet staples that last",
    vibes: ["minimal", "formal"],
  },
];

const MAX_OCCASIONS = 3;

export function clampOccasions(ids: StyleOccasion[]): StyleOccasion[] {
  return ids.slice(0, MAX_OCCASIONS);
}

/** Derive matching tags from quiz answers. */
export function vibesFromQuiz(
  occasions: StyleOccasion[],
  lean: StyleLean | undefined,
): string[] {
  const fromOccasions = occasions
    .map((id) => STYLE_OCCASIONS.find((o) => o.id === id)?.vibe)
    .filter(Boolean) as string[];
  const fromLean = lean
    ? (STYLE_LEANS.find((l) => l.id === lean)?.vibes ?? [])
    : [];
  const merged = [...fromOccasions, ...fromLean];
  return [...new Set(merged)].slice(0, 4);
}

/** Short StyleFile-style label shown after the quiz. */
export function styleSnapshotTitle(
  goal: StyleGoal | undefined,
  occasions: StyleOccasion[],
  lean: StyleLean | undefined,
): string {
  const leanLabel = STYLE_LEANS.find((l) => l.id === lean)?.label;
  const topOccasion = STYLE_OCCASIONS.find((o) => o.id === occasions[0])?.label;
  if (leanLabel && topOccasion) {
    return `${leanLabel.split(" & ")[0]} · ${topOccasion.split(" / ")[0]}`;
  }
  if (leanLabel) return leanLabel;
  if (topOccasion) return topOccasion;
  const goalLabel = STYLE_GOALS.find((g) => g.id === goal)?.label;
  return goalLabel ?? "Your style";
}

export function styleSnapshotBlurb(
  goal: StyleGoal | undefined,
  occasions: StyleOccasion[],
): string {
  const goalHint = STYLE_GOALS.find((g) => g.id === goal)?.hint;
  const occLabels = occasions
    .map((id) => STYLE_OCCASIONS.find((o) => o.id === id)?.label)
    .filter(Boolean);
  const occ =
    occLabels.length > 0
      ? `We'll lean toward looks for ${occLabels.join(", ").toLowerCase()}.`
      : "We'll suggest looks from what you add.";
  return [goalHint ? `${goalHint}.` : null, occ].filter(Boolean).join(" ");
}

export function applyQuizToProfile(input: {
  goal?: StyleGoal;
  occasions: StyleOccasion[];
  lean?: StyleLean;
}): {
  styleGoal?: StyleGoal;
  styleOccasions?: StyleOccasion[];
  styleLean?: StyleLean;
  styleVibes?: string[];
  styleSnapshot?: string;
  onboardingComplete: true;
} {
  const styleVibes = vibesFromQuiz(input.occasions, input.lean);
  return {
    styleGoal: input.goal,
    styleOccasions: input.occasions.length ? input.occasions : undefined,
    styleLean: input.lean,
    styleVibes: styleVibes.length ? styleVibes : undefined,
    styleSnapshot: styleSnapshotTitle(
      input.goal,
      input.occasions,
      input.lean,
    ),
    onboardingComplete: true,
  };
}
