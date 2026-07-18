/**
 * User profile & account settings — persisted with wardrobe state.
 * Serializable for localStorage and Supabase sync.
 */

import type { StyleGoal, StyleLean, StyleOccasion } from "./style-quiz";

export interface UserProfile {
  /** Profile photo — direct URL or data: URL from upload. */
  avatarUrl?: string;
  displayName: string;
  /** Public @handle shown on the social profile. Falls back to email/name. */
  username?: string;
  /** Who to show in the Explore feed. "all" shows everything. */
  shopGender?: "male" | "female" | "all";
  /** Social graph counts (community feature). Default 0. */
  followers?: number;
  following?: number;
  email: string;
  phone?: string;
  bio?: string;
  location?: string;
  website?: string;
  /** ISO date string YYYY-MM-DD */
  birthDate?: string;
  /** Preferred currency code (e.g. "USD", "EUR"); drives all money formatting. */
  currency?: string;
  /** Custom brands the user added — surfaced as suggestions when adding items. */
  customBrands?: string[];
  /** Usual sizes per category, for shop fit hints. A fit-data API refines these
   *  into a true-to-fit confidence later (see the fitProvider seam). */
  sizes?: { top?: string; bottom?: string; shoes?: string; dress?: string };
  /** Temperature unit for weather display. Defaults to Celsius. */
  temperatureUnit?: "C" | "F";
  /** Country label (display + weather geocoding hint). */
  country?: string;
  /** Language label. UI translation (i18n) is a follow-up; this persists choice. */
  language?: string;
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
  /**
   * Screen the app opens to on launch (FITS-style “App starts in”).
   * Defaults to Today when unset.
   */
  startView?: StartScreen;
}

/** Views allowed as the default launch screen. */
export type StartScreen =
  | "explore"
  | "today"
  | "wardrobe"
  | "outfits"
  | "calendar"
  | "wishlist"
  | "travel"
  | "insights"
  | "you";

export const START_SCREEN_OPTIONS: {
  id: StartScreen;
  label: string;
  hint?: string;
}[] = [
  { id: "explore", label: "Explore", hint: "Fashion feed" },
  { id: "wardrobe", label: "Closet", hint: "Your pieces" },
  { id: "outfits", label: "Outfits", hint: "Saved looks" },
  { id: "calendar", label: "Calendar" },
  { id: "wishlist", label: "Wishlist" },
  { id: "travel", label: "Packing" },
  { id: "insights", label: "Insights" },
  { id: "you", label: "You", hint: "Profile hub (app)" },
];

const START_SCREEN_IDS = new Set<string>(
  START_SCREEN_OPTIONS.map((o) => o.id),
);

export function resolveStartView(
  profile: Pick<UserProfile, "startView"> | null | undefined,
): StartScreen {
  const v = profile?.startView;
  // Home ("today") is retired in the app shell — its daily look now lives in
  // Explore, so any saved "today" preference opens Explore instead.
  if (v === "today") return "explore";
  if (v && START_SCREEN_IDS.has(v)) return v;
  return "explore";
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

/** Strip a handle to allowed characters (a–z, 0–9, dot, underscore). */
export function sanitizeHandle(raw: string): string {
  return raw.replace(/[^a-z0-9._]/gi, "").toLowerCase();
}

/** Public @handle: an explicit username if set, else derived from email/name. */
export function profileHandle(
  profile: Pick<UserProfile, "username" | "email" | "displayName">,
): string {
  const explicit = sanitizeHandle(profile.username?.trim() ?? "");
  if (explicit) return explicit;
  const base = profile.email?.split("@")[0] || profile.displayName || "you";
  return sanitizeHandle(base) || "you";
}

/** Initials for avatar fallback when no photo is set. */
export function profileInitials(profile: Pick<UserProfile, "displayName">): string {
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
  | "support"
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
    id: "support",
    label: "Support",
    description: "Rate, share, and feedback",
  },
  {
    id: "data",
    label: "Data & privacy",
    description: "Export, sync, and reset",
  },
];
