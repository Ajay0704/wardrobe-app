"use client";

import { useWardrobe } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";
import { ProfileAvatarEditor } from "./ProfileAvatar";
import { ProfileFields } from "./ProfileFields";

/**
 * Profile-only editor opened from "My Profile" on My page. Deliberately shows
 * just the profile (photo + fields) — no settings sidebar or other sections.
 */
export function ProfileView() {
  const { profile, updateProfile, authUser } = useWardrobe();

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
    <div className="mx-auto max-w-2xl space-y-6">
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
