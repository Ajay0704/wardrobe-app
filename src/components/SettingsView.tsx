"use client";

import { useState, type ReactNode } from "react";
import { ProfileAvatarEditor } from "./ProfileAvatar";
import { ProfileFields } from "./ProfileFields";
import { Button, Field, inputClass } from "./ui";
import { useWardrobe, type ThemeMode } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";
import {
  authErrorMessage,
  signOut,
  updatePassword,
} from "@/lib/supabase/auth";
import {
  pushConfigured,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";
import { SETTINGS_SECTIONS } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/sync";
import { useIsNativeApp } from "./NativeAppClass";

export function SettingsView() {
  const {
    profile,
    updateProfile,
    theme,
    setTheme,
    items,
    outfits,
    authUser,
    setAuthUser,
    setSyncStatus,
    settingsSection: section,
    setSettingsSection: setSection,
  } = useWardrobe();

  // Web push doesn't work inside the Capacitor WebView (needs native APNs), so
  // hide the Notifications section in the native app to avoid a dead-end.
  const native = useIsNativeApp();
  const sections = native
    ? SETTINGS_SECTIONS.filter((s) => s.id !== "notifications")
    : SETTINGS_SECTIONS;

  const handleAvatarUpload = async (file: File) => {
    try {
      updateProfile({
        avatarUrl: await resolveImageSource(file, authUser?.id ?? null),
      });
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Couldn't upload that photo.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 border-b border-line pb-6">
        <h1 className="heading text-2xl sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your profile, account, and preferences.
        </p>
      </header>

      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        {/* Sidebar — like Medium / LinkedIn settings nav */}
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible"
          aria-label="Settings sections"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`shrink-0 rounded-lg px-3 py-2.5 text-left transition-colors md:w-full ${
                section === s.id
                  ? "bg-surface-2 font-medium text-foreground"
                  : "text-muted hover:bg-surface-2/60 hover:text-foreground"
              }`}
            >
              <span className="block text-sm">{s.label}</span>
              <span className="hidden text-xs text-muted md:block">
                {s.description}
              </span>
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="min-w-0 flex-1">
          {section === "profile" && (
            <SettingsPanel title="Public profile">
              <ProfileAvatarEditor
                profile={profile}
                onUpload={handleAvatarUpload}
                onRemove={() => updateProfile({ avatarUrl: undefined })}
              />
              <ProfileFields profile={profile} onChange={updateProfile} />
            </SettingsPanel>
          )}

          {section === "account" && (
            <SettingsPanel title="Account details">
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
              {authUser && (
                <p className="text-xs text-muted">
                  Email is managed by your login account.
                </p>
              )}
              <Field label="Phone (optional)">
                <input
                  className={inputClass}
                  type="tel"
                  value={profile.phone ?? ""}
                  onChange={(e) =>
                    updateProfile({ phone: e.target.value || undefined })
                  }
                  placeholder="+1 (555) 000-0000"
                />
              </Field>
              <Field label="Date of birth (optional)" hint="Used for style recommendations only — never shared.">
                <input
                  className={inputClass}
                  type="date"
                  value={profile.birthDate ?? ""}
                  onChange={(e) =>
                    updateProfile({ birthDate: e.target.value || undefined })
                  }
                />
              </Field>
              {authUser && (
                <>
                  <ChangePassword />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAuthUser(null);
                      setSyncStatus("offline");
                      void signOut();
                    }}
                  >
                    Log out
                  </Button>
                </>
              )}
            </SettingsPanel>
          )}

          {section === "preferences" && (
            <SettingsPanel title="Preferences">
              <Field label="Appearance">
                <div className="flex gap-2">
                  {(["light", "dark"] as ThemeMode[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium capitalize transition-colors ${
                        theme === t
                          ? "border-foreground bg-surface-2 text-foreground"
                          : "border-line text-muted hover:border-foreground/30"
                      }`}
                    >
                      {t} mode
                    </button>
                  ))}
                </div>
              </Field>
              <p className="text-xs text-muted">
                Changes save automatically to this browser
                {isSupabaseConfigured() ? " and sync to the cloud." : "."}
              </p>
            </SettingsPanel>
          )}

          {section === "notifications" && !native && <NotificationsPanel />}

          {section === "data" && (
            <SettingsPanel title="Data & privacy">
              <div className="space-y-4 rounded-xl border border-line bg-surface-2/40 p-4">
                <div>
                  <p className="text-sm font-medium">Export wardrobe</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Download all items, outfits, and profile as JSON.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => exportData({ profile, items, outfits })}
                  >
                    Export JSON
                  </Button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-red-200/60 bg-red-500/5 p-4 dark:border-red-900/40">
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Danger zone
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Permanently delete all wardrobe items, outfits, and profile
                    data from this browser.
                  </p>
                  <ClearDataButton />
                </div>
              </div>
            </SettingsPanel>
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = pushConfigured();

  const enable = async () => {
    setBusy(true);
    setStatus(null);
    const result = await subscribeToPush();
    setBusy(false);
    setStatus(result.ok ? "Enabled — you'll get morning outfit nudges." : result.error);
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setStatus("Push disabled on this device.");
  };

  return (
    <SettingsPanel title="Notifications">
      <p className="text-sm text-muted">
        Opt in for a ~7am &quot;here&apos;s today&apos;s outfit&quot; nudge and a
        Sunday &quot;plan your week&quot; reminder. Requires installing the PWA
        (or keeping the tab) and allowing notifications.
      </p>
      {!ready && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Server keys not set yet. Add{" "}
          <code className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,{" "}
          <code className="font-mono">VAPID_PRIVATE_KEY</code>,{" "}
          <code className="font-mono">VAPID_SUBJECT</code>,{" "}
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>, and{" "}
          <code className="font-mono">CRON_SECRET</code> — then run the{" "}
          <code className="font-mono">push_subscriptions</code> SQL in{" "}
          <code className="font-mono">supabase/schema.sql</code>.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !ready} onClick={() => void enable()}>
          Enable morning push
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void disable()}
        >
          Disable on this device
        </Button>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}
    </SettingsPanel>
  );
}

function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="animate-fade-up space-y-6">
      <h2 className="heading text-lg">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function exportData(data: object) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wardrobe-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
      <div className="space-y-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Change password
        </Button>
        {done && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Password updated.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-surface-2/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
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

function ClearDataButton() {
  const [confirm, setConfirm] = useState(false);
  const resetAll = useWardrobe((s) => s.resetAll);

  return (
    <Button
      variant="danger"
      className="mt-3"
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          return;
        }
        resetAll();
        setConfirm(false);
      }}
    >
      {confirm ? "Click again to confirm" : "Clear all data"}
    </Button>
  );
}
