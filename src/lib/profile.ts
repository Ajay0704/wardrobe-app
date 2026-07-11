/**
 * User profile & account settings — persisted with wardrobe state.
 * Serializable for localStorage and Supabase sync.
 */

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
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: "",
  email: "",
};

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
    id: "notifications",
    label: "Notifications",
    description: "Morning outfit push nudges",
  },
  {
    id: "data",
    label: "Data & privacy",
    description: "Export, sync, and reset",
  },
];
