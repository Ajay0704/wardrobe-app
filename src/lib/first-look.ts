/**
 * Whether the visitor already played the first-look board on the signed-out landing (AJA-290).
 *
 * The board is the app's first payoff, and it now runs BEFORE the account gate — so by the time
 * onboarding starts, most people have already made an outfit. Replaying it there would spend the
 * one screen we have on something they just did, so onboarding reads this and skips its own copy.
 *
 * localStorage rather than the profile, because this is written while signed out: there is no
 * profile row yet, and the whole point is that nothing is asked for first. It is deliberately
 * advisory — losing it (private window, cleared storage, a different device) just means the game
 * shows once more inside onboarding, which is the old behaviour and harmless.
 */

const KEY = "wardrobe:firstLook";

export type FirstLook = {
  played: boolean;
  /** What they chose on the landing, so the quiz's department step can arrive pre-answered. */
  gender?: "male" | "female";
};

export function readFirstLook(): FirstLook {
  if (typeof window === "undefined") return { played: false };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { played: false };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { played: false };
    const { played, gender } = parsed as Partial<FirstLook>;
    return {
      played: played === true,
      gender: gender === "male" || gender === "female" ? gender : undefined,
    };
  } catch {
    // Malformed or blocked storage must never stop the landing from rendering.
    return { played: false };
  }
}

export function markFirstLookPlayed(gender: "male" | "female") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ played: true, gender }));
  } catch {
    /* ignore — Safari private mode and friends */
  }
}
