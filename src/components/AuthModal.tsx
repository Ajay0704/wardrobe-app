"use client";

import { useState } from "react";
import { DEFAULT_PROFILE, type UserProfile } from "@/lib/profile";
import {
  authErrorMessage,
  sendPasswordReset,
  signIn,
  signUp,
} from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/sync";
import { resolveImageSource } from "@/lib/supabase/storage";
import { useWardrobe } from "@/lib/store";
import { ProfileAvatarEditor } from "./ProfileAvatar";
import { ProfileFields } from "./ProfileFields";
import { Button, Field, Modal, inputClass } from "./ui";

export type AuthMode = "login" | "signup";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
    </p>
  );
}

export function AuthModal({
  mode: initialMode,
  onClose,
}: {
  mode: AuthMode;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [profile, setProfile] = useState<UserProfile>({ ...DEFAULT_PROFILE });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { theme, draft, updateProfile, setAuthUser, hydrateFromRemote } =
    useWardrobe();

  const patchProfile = (p: Partial<UserProfile>) =>
    setProfile((prev) => ({ ...prev, ...p }));

  const handleAvatarUpload = async (file: File) => {
    // No session yet during signup, so this compresses to a small data URL
    // (never a multi-MB blob); AuthProvider's heal moves it to Storage on login.
    patchProfile({ avatarUrl: await resolveImageSource(file, null) });
  };

  const submitLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { user, snapshot } = await signIn(email.trim(), password);
      setAuthUser(user);
      if (snapshot) {
        hydrateFromRemote({
          items: snapshot.items,
          outfits: snapshot.outfits,
          profile: { ...snapshot.profile, email: user.email },
          theme: snapshot.theme,
          draft: snapshot.draft,
        });
      } else {
        updateProfile({ email: user.email });
      }
      onClose();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async () => {
    setError("");
    if (!profile.displayName.trim()) {
      setError("Please enter your display name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const user = await signUp(
        email.trim(),
        password,
        profile,
        { items: [], outfits: [], trips: [], theme, draft },
      );
      setAuthUser(user);
      // New accounts start with an empty wardrobe (not the demo items). Clear
      // the local store to match the freshly-seeded empty cloud snapshot.
      hydrateFromRemote({
        items: [],
        outfits: [],
        trips: [],
        profile: { ...profile, email: user.email },
        theme,
        draft,
      });
      onClose();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <Modal title="Sign in unavailable" onClose={onClose}>
        <p className="text-sm text-muted">
          Cloud auth is not configured. Add Supabase environment variables to
          enable accounts.
        </p>
      </Modal>
    );
  }

  if (forgot) {
    return (
      <Modal title="Reset your password" onClose={onClose}>
        <ForgotPasswordForm
          email={email}
          onEmail={setEmail}
          onBack={() => {
            setForgot(false);
            setError("");
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal
      title={mode === "login" ? "Log in" : "Create your account"}
      onClose={onClose}
      wide={mode === "signup"}
    >
      <div className="mb-6 flex gap-6 border-b border-line pb-0">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
            mode === "login"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
          }}
          className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
            mode === "signup"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Sign up
        </button>
      </div>

      {mode === "login" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitLogin();
          }}
        >
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setForgot(true);
                setError("");
              }}
              className="text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              Forgot password?
            </button>
          </div>
          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submitSignup();
          }}
        >
          {/* Account — full width, no overlap */}
          <section className="space-y-4">
            <SectionLabel>Account</SectionLabel>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  patchProfile({ email: e.target.value });
                }}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                />
              </Field>
              <Field label="Confirm password">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  minLength={6}
                />
              </Field>
            </div>
          </section>

          {/* Profile photo — own block */}
          <section className="space-y-3 border-t border-line pt-6">
            <SectionLabel>Profile photo</SectionLabel>
            <ProfileAvatarEditor
              compact
              profile={profile}
              onUpload={handleAvatarUpload}
              onRemove={() => patchProfile({ avatarUrl: undefined })}
            />
          </section>

          {/* Profile details */}
          <section className="space-y-4 border-t border-line pt-6">
            <SectionLabel>Your profile</SectionLabel>
            <ProfileFields
              profile={profile}
              onChange={patchProfile}
              includeAccountExtras
              hideWebsite
            />
          </section>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function ForgotPasswordForm({
  email,
  onEmail,
  onBack,
}: {
  email: string;
  onEmail: (v: string) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          If an account exists for <span className="font-medium text-foreground">{email.trim()}</span>,
          we&apos;ve sent a link to reset your password. Open it on this device to
          choose a new password.
        </p>
        <Button variant="outline" onClick={onBack} className="w-full">
          Back to log in
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-muted">
        Enter your account email and we&apos;ll send you a link to reset your
        password.
      </p>
      <Field label="Email">
        <input
          className={inputClass}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />
      </Field>
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Sending…" : "Send reset link"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs font-medium text-muted transition-colors hover:text-foreground"
      >
        Back to log in
      </button>
    </form>
  );
}
