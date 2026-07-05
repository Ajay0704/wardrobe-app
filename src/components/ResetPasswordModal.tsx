"use client";

import { useState } from "react";
import { authErrorMessage, updatePassword } from "@/lib/supabase/auth";
import { useWardrobe } from "@/lib/store";
import { Button, Field, Modal, inputClass } from "./ui";

/**
 * Shown when a password-recovery link is active. Lets the user choose a new
 * password, then reloads to a clean URL so the session re-initializes as a
 * normal signed-in session (snapshot pull + sync re-enabled).
 */
export function ResetPasswordModal() {
  const { authUser, setPasswordRecovery } = useWardrobe();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
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
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    setPasswordRecovery(false);
    // Reload to a clean URL so AuthProvider re-inits the signed-in session.
    window.location.assign(window.location.origin + window.location.pathname);
  };

  if (done) {
    return (
      <Modal title="Password updated" onClose={finish}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Your password has been changed. You&apos;re signed in
            {authUser ? ` as ${authUser.email}` : ""}.
          </p>
          <Button onClick={finish} className="w-full">
            Continue to your wardrobe
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Choose a new password" onClose={finish}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-muted">
          Enter a new password for your account
          {authUser ? ` (${authUser.email})` : ""}.
        </p>
        <Field label="New password">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            required
            minLength={6}
            autoFocus
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
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : "Update password"}
        </Button>
      </form>
    </Modal>
  );
}
