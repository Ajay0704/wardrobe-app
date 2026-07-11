/**
 * User profile & account settings — persisted with wardrobe state.
 * Serializable for localStorage and Supabase sync.
 */

import type { StyleGoal, StyleLean, StyleOccasion } from "./style-quiz";

export interface UserProfile {
  /** Profile photo — direct URL or data: URL from upload. */
  avatarUrl?: string;
  displayName: string;
  email: string;
  phone?: string;
  bio?: string;
  location?: string;
  website?: string;
  /** ISO date string YYYY-MM-DD */
  birthDate?: string;
  /** Preferred currency code (e.g. "USD", "EUR"); drives all money formatting. */
  currency?: string;
  /**
   * Tags used by generateOutfit (derived from style quiz occasions + lean).
   * e.g. ["casual", "work"]
   */
  styleVibes?: string[];
  /** First-run goal — what success looks like for this user. */
  styleGoal?: StyleGoal;
  /** Where they dress most (quiz occasions). */
  styleOccasions?: StyleOccasion[];
  /** Trade-off lean from the quiz. */
  styleLean?: StyleLean;
  /** Human label from quiz snapshot (“Relaxed · Everyday”). */
  styleSnapshot?: string;
  /** True after first-run onboarding is finished or skipped. */
  onboardingComplete?: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: "",
  email: "",
};

/** Editable vibe chips in Settings (maps to matching tags). */
export const STYLE_QUIZ_VIBES = [
  "casual",
  "minimal",
  "work",
  "streetwear",
  "cozy",
  "formal",
  "athleisure",
  "party",
] as const;

/** Signed-in Supabase user (email/password auth). */
export interface AuthUser {
  id: string;
  email: string;
}

/** Initials for avatar fallback when no photo is set. */
export function profileInitials(profile: UserProfile): string {
  const name = profile.displayName.trim();
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Primary vibe for outfit generation (first quiz pick, or casual). */
export function primaryStyleVibe(profile: UserProfile): string {
  const first = profile.styleVibes?.find((v) => v.trim());
  return first || "casual";
}

export type SettingsSection =
  | "profile"
  | "account"
  | "preferences"
  | "notifications"
  | "data";

export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
}[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Photo, name, and public info",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Morning outfit nudges",
  },
  {
    id: "account",
    label: "Account",
    description: "Email, phone, and login details",
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Appearance and defaults",
  },
  {
    id: "data",
    label: "Data & privacy",
    description: "Export, sync, and reset",
  },
];
