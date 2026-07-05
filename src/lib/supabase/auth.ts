/**
 * Email/password authentication via Supabase Auth.
 * No OAuth or email verification in this version.
 */

import type { UserProfile, AuthUser } from "../profile";
import type { ThemeMode } from "../store";
import type { Outfit, SlotKey, WardrobeItem } from "../types";
import { getSupabase } from "./client";
import { pullSnapshot, pushSnapshot } from "./sync";

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: string }).message);
  }
  return "Something went wrong. Please try again.";
}

/** Postgres unique-violation error code (duplicate username). */
const PG_UNIQUE_VIOLATION = "23505";

/** True when the handle is free to claim (case-sensitive exact match). */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { data, error } = await supabase.rpc("username_available", {
    name: username,
  });
  if (error) throw error;
  return Boolean(data);
}

/** Resolve a username to its account email, or null if no such handle. */
async function resolveEmailForUsername(username: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { data, error } = await supabase.rpc("email_for_username", {
    name: username,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
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
    theme: ThemeMode;
    draft: Record<SlotKey, string[]>;
  },
): Promise<AuthUser> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");

  const username = profile.username.trim();
  if (!username) throw new Error("Please choose a username.");

  // Best-effort pre-check so we usually fail before creating an account.
  // The primary-key constraint below is the real (race-proof) guarantee.
  if (!(await isUsernameAvailable(username))) {
    throw new Error("That username is already taken.");
  }

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

  // Claim the handle. A unique violation means someone won the race — the
  // account exists, so the user can pick another handle in Settings.
  const claim = await supabase
    .from("usernames")
    .insert({ username, user_id: user.id, email: user.email });
  if (claim.error) {
    if (claim.error.code === PG_UNIQUE_VIOLATION) {
      throw new Error(
        "That username was just taken. You're signed in — pick another in Settings.",
      );
    }
    throw claim.error;
  }

  const fullProfile: UserProfile = { ...profile, username, email };
  const ok = await pushSnapshot(user.id, {
    ...wardrobe,
    profile: fullProfile,
  });
  if (!ok) throw new Error("Account created but wardrobe save failed.");

  return { id: user.id, email: user.email };
}

export async function signIn(username: string, password: string): Promise<{
  user: AuthUser;
  snapshot: Awaited<ReturnType<typeof pullSnapshot>>;
}> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");

  // Sign-in is by username; resolve it to the account email first.
  const email = await resolveEmailForUsername(username.trim());
  if (!email) throw new Error("No account found for that username.");

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

/**
 * Set or change the signed-in user's handle. Upserts their row in the
 * usernames table; a unique violation means the handle is taken.
 */
export async function changeUsername(
  userId: string,
  email: string,
  username: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { error } = await supabase
    .from("usernames")
    .upsert(
      { username, user_id: userId, email },
      { onConflict: "user_id" },
    );
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw new Error("That username is already taken.");
    }
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
