"use client";

import { Field, inputClass } from "./ui";
import type { UserProfile } from "@/lib/profile";

/** Shared profile fields — used in Settings and Sign up. */
export function ProfileFields({
  profile,
  onChange,
  includeAccountExtras,
  hideWebsite,
}: {
  profile: UserProfile;
  onChange: (patch: Partial<UserProfile>) => void;
  /** Phone + birth date (signup & account settings). */
  includeAccountExtras?: boolean;
  /** Hide the website field (used on the create-profile / signup form). */
  hideWebsite?: boolean;
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
      <div className={hideWebsite ? "" : "grid gap-5 sm:grid-cols-2"}>
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
        {!hideWebsite && (
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
        )}
      </div>
      {includeAccountExtras && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Phone (optional)">
            <input
              className={inputClass}
              type="tel"
              value={profile.phone ?? ""}
              onChange={(e) =>
                onChange({ phone: e.target.value || undefined })
              }
              placeholder="+1 (555) 000-0000"
            />
          </Field>
          <Field label="Date of birth (optional)">
            <input
              className={inputClass}
              type="date"
              value={profile.birthDate ?? ""}
              onChange={(e) =>
                onChange({ birthDate: e.target.value || undefined })
              }
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
        </div>
      )}
    </>
  );
}
