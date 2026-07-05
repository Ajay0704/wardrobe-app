"use client";

import { profileInitials, type UserProfile } from "@/lib/profile";

/** Circular profile photo — used in header and settings. */
export function ProfileAvatar({
  profile,
  size = 36,
  onClick,
  active,
}: {
  profile: UserProfile;
  size?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const initials = profileInitials(profile);
  const inner = profile.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatarUrl}
      alt={profile.displayName || "Profile"}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="font-medium text-muted">{initials}</span>
  );

  const className = `relative shrink-0 overflow-hidden rounded-full border bg-surface-2 transition-all ${
    active ? "border-foreground ring-2 ring-foreground/20" : "border-line hover:border-foreground/40"
  } ${onClick ? "cursor-pointer" : ""}`;

  const style = { width: size, height: size, fontSize: size * 0.34 };

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Open settings"
        className={`inline-flex items-center justify-center ${className}`}
        style={style}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center ${className}`} style={style}>
      {inner}
    </div>
  );
}

/** Large editable avatar with upload — settings page or signup modal. */
export function ProfileAvatarEditor({
  profile,
  onUpload,
  onRemove,
  compact,
}: {
  profile: UserProfile;
  onUpload: (file: File) => void;
  onRemove: () => void;
  /** Vertical-friendly layout for modals. */
  compact?: boolean;
}) {
  const initials = profileInitials(profile);

  const avatar = (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-line bg-surface-2 sm:h-28 sm:w-28">
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatarUrl}
          alt="Profile"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl font-medium text-muted">
          {initials}
        </div>
      )}
    </div>
  );

  const actions = (
    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
      <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-2">
        Upload photo
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </label>
      {profile.avatarUrl && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
        >
          Remove
        </button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface-2/40 p-5 sm:flex-row sm:items-center sm:gap-6">
        {avatar}
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <p className="text-sm font-medium">Add a profile photo</p>
          <p className="text-xs text-muted">
            Optional — JPG, PNG or GIF. Square images look best.
          </p>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
      {avatar}
      <div className="space-y-2">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="max-w-xs text-xs text-muted">
          JPG, PNG or GIF. Square images look best.
        </p>
        {actions}
      </div>
    </div>
  );
}
