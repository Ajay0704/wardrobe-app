"use client";

import { useWardrobe } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";
import { ProfileAvatarEditor } from "./ProfileAvatar";
import { ProfileFields } from "./ProfileFields";

/**
 * Profile editor — the public-facing identity only (photo + name, @handle, bio,
 * links). Fit/sizes, style, and account details now live in their own Settings
 * sub-pages (AJA-202), so this stays short and focused.
 */
export function ProfileView() {
  const { profile, updateProfile, authUser } = useWardrobe();

  const handleAvatarUpload = async (file: File) => {
    try {
      updateProfile({
        avatarUrl: await resolveImageSource(file, authUser?.id ?? null),
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't upload that photo.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-4">
      <ProfileAvatarEditor
        centered
        profile={profile}
        onUpload={handleAvatarUpload}
        onRemove={() => updateProfile({ avatarUrl: undefined })}
      />
      <ProfileFields profile={profile} onChange={updateProfile} />
    </div>
  );
}
