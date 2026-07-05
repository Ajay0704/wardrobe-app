"use client";

import { useState, type ReactNode } from "react";
import { ProfileAvatarEditor } from "./ProfileAvatar";
import { Button, Field, inputClass } from "./ui";
import { useWardrobe, type ThemeMode } from "@/lib/store";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
  type UserProfile,
} from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/sync";

export function SettingsView() {
  const [section, setSection] = useState<SettingsSection>("profile");
  const { profile, updateProfile, theme, setTheme, items, outfits } =
    useWardrobe();

  const handleAvatarUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () =>
      updateProfile({ avatarUrl: reader.result as string });
    reader.readAsDataURL(file);
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
          {SETTINGS_SECTIONS.map((s) => (
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
                  className={inputClass}
                  type="email"
                  value={profile.email}
                  onChange={(e) => updateProfile({ email: e.target.value })}
                  placeholder="you@example.com"
                />
              </Field>
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

function ProfileFields({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (patch: Partial<UserProfile>) => void;
}) {
  return (
    <>
      <Field label="Display name">
        <input
          className={inputClass}
          value={profile.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder="Ajay"
        />
      </Field>
      <Field label="Username">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
            @
          </span>
          <input
            className={`${inputClass} !pl-8`}
            value={profile.username}
            onChange={(e) =>
              onChange({
                username: e.target.value.replace(/^@/, "").replace(/\s/g, ""),
              })
            }
            placeholder="username"
          />
        </div>
      </Field>
      <Field label="Bio">
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          value={profile.bio ?? ""}
          onChange={(e) => onChange({ bio: e.target.value || undefined })}
          placeholder="A few words about your style…"
          maxLength={160}
        />
        <span className="mt-1 block text-right text-xs text-muted">
          {(profile.bio ?? "").length}/160
        </span>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Location (optional)">
          <input
            className={inputClass}
            value={profile.location ?? ""}
            onChange={(e) =>
              onChange({ location: e.target.value || undefined })
            }
            placeholder="New York, NY"
          />
        </Field>
        <Field label="Website (optional)">
          <input
            className={inputClass}
            type="url"
            value={profile.website ?? ""}
            onChange={(e) =>
              onChange({ website: e.target.value || undefined })
            }
            placeholder="https://yoursite.com"
          />
        </Field>
      </div>
    </>
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
