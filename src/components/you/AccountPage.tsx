"use client";

import { useState } from "react";
import { useWardrobe } from "@/lib/store";
import { authErrorMessage, updatePassword } from "@/lib/supabase/auth";
import { Button, Field, inputClass } from "../ui";
import { Note, PageShell } from "./settings-ui";

/** Account (AJA-202) — login details: email, phone, date of birth, password. */
export function AccountPage() {
  const profile = useWardrobe((s) => s.profile);
  const updateProfile = useWardrobe((s) => s.updateProfile);
  const authUser = useWardrobe((s) => s.authUser);

  return (
    <PageShell>
      <Field label="Email">
        <input
          className={`${inputClass} ${authUser ? "opacity-70" : ""}`}
          type="email"
          value={profile.email}
          onChange={(e) => updateProfile({ email: e.target.value })}
          placeholder="you@example.com"
          readOnly={Boolean(authUser)}
        />
      </Field>
      {authUser && <Note>Email is managed by your login account.</Note>}

      <Field label="Phone (optional)">
        <input
          className={inputClass}
          type="tel"
          value={profile.phone ?? ""}
          onChange={(e) => updateProfile({ phone: e.target.value || undefined })}
          placeholder="+1 (555) 000-0000"
        />
      </Field>

      <Field label="Date of birth (optional)" hint="Used for style recommendations only — never shared.">
        <input
          className={inputClass}
          type="date"
          value={profile.birthDate ?? ""}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => updateProfile({ birthDate: e.target.value || undefined })}
        />
      </Field>

      {authUser && <ChangePassword />}
    </PageShell>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    setDone(false);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setPassword("");
      setConfirm("");
      setOpen(false);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="space-y-2 pt-1">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Change password
        </Button>
        {done && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Password updated.</p>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-line bg-surface-2/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
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
        />
      </Field>
      <Field label="Confirm new password">
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
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Save password"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError("");
            setPassword("");
            setConfirm("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
