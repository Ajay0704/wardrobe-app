/**
 * Email/password authentication via Supabase Auth.
 * No OAuth or email verification in this version.
 */

import type { UserProfile, AuthUser } from "../profile";
import type { ThemeMode } from "../store";
import type { CalendarEntry, Outfit, SlotKey, WardrobeItem } from "../types";
import { getSupabase } from "./client";
import { pullSnapshot, pushSnapshot } from "./sync";

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: string }).message);
  }
  return "Something went wrong. Please try again.";
}

/** Current signed-in user id, or null if logged out. */
export async function getSessionUser(): Promise<AuthUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

export async function signUp(
  email: string,
  password: string,
  profile: Omit<UserProfile, "email">,
  wardrobe: {
    items: WardrobeItem[];
    outfits: Outfit[];
    calendar?: CalendarEntry[];
    theme: ThemeMode;
    draft: Record<SlotKey, string[]>;
  },
): Promise<AuthUser> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  let user = data.user;
  let session = data.session;

  // When email confirmation is disabled, session may be returned immediately.
  // Otherwise sign in right after signup.
  if (!session) {
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    user = signIn.data.user;
    session = signIn.data.session;
  }

  if (!user?.email) throw new Error("Account created but no user returned.");

  const fullProfile: UserProfile = { ...profile, email };
  // Never push inline data-URL avatars into the snapshot — they blow past
  // sync size limits (especially HEIC from iPhone). Upload happens after signup.
  const { avatarUrl, ...safeProfileFields } = fullProfile;
  const profileForSync: UserProfile = isDataUrl(avatarUrl)
    ? { ...safeProfileFields, email }
    : fullProfile;

  const ok = await pushSnapshot(user.id, {
    items: wardrobe.items,
    outfits: wardrobe.outfits,
    calendar: wardrobe.calendar ?? [],
    theme: wardrobe.theme,
    draft: wardrobe.draft,
    profile: profileForSync,
  });
  if (!ok.ok) throw new Error(ok.error || "Account created but wardrobe save failed.");

  return { id: user.id, email: user.email };
}

function isDataUrl(v: unknown): v is string {
  return typeof v === "string" && /^data:/i.test(v);
}

export async function signIn(email: string, password: string): Promise<{
  user: AuthUser;
  snapshot: Awaited<ReturnType<typeof pullSnapshot>>;
}> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.user?.email) throw new Error("Login failed.");

  const user = { id: data.user.id, email: data.user.email };
  const snapshot = await pullSnapshot(user.id);
  return { user, snapshot };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  // Local scope clears the stored session immediately without a network
  // round-trip, so logout never hangs on a slow connection.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Ignore — callers clear local auth state regardless.
  }
}

/**
 * Send a password-reset email. The link returns the user to the app with a
 * recovery session, which fires a PASSWORD_RECOVERY auth event.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== "undefined" ? window.location.origin : undefined,
  });
  if (error) throw error;
}

/** Set a new password for the currently authenticated (or recovering) user. */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
