/**
 * User profile & account settings — persisted with wardrobe state.
 * Serializable for localStorage and Supabase sync.
 */

export interface UserProfile {
  /** Profile photo — direct URL or data: URL from upload. */
  avatarUrl?: string;
  displayName: string;
  /** Public handle, e.g. @ajay */
  username: string;
  email: string;
  phone?: string;
  bio?: string;
  location?: string;
  website?: string;
  /** ISO date string YYYY-MM-DD */
  birthDate?: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: "",
  username: "",
  email: "",
};

/** Signed-in Supabase user (email/password auth). */
export interface AuthUser {
  id: string;
  email: string;
}

/** Login handles: letters and numbers only, 3–20 characters. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

/** Strip anything that isn't a letter or number (for input sanitizing). */
export function sanitizeUsername(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, USERNAME_MAX);
}

/** Returns an error message if the username is invalid, else null. */
export function validateUsername(name: string): string | null {
  if (name.length < USERNAME_MIN)
    return `Username must be at least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX)
    return `Username must be at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_REGEX.test(name))
    return "Username can only contain letters and numbers.";
  return null;
}

/** Initials for avatar fallback when no photo is set. */
export function profileInitials(profile: UserProfile): string {
  const name = profile.displayName.trim();
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type SettingsSection = "profile" | "account" | "preferences" | "data";

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
