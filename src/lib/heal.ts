import { useWardrobe } from "./store";
import { dataUrlToFile, resolveImageSource } from "./supabase/storage";

/**
 * One-time self-heal: any images still stored as base64 `data:` URLs inside the
 * snapshot (item photos or the avatar, from before the Storage bucket existed or
 * from the old signup avatar path) are uploaded to Storage and rewritten as
 * small URLs. This shrinks the cloud snapshot so the sync push stops failing —
 * no manual re-uploading, no data loss. Returns how many images it converted.
 */
export async function healBase64Snapshot(userId: string): Promise<number> {
  const { items, profile, updateItem, updateProfile } = useWardrobe.getState();
  let healed = 0;

  for (const item of items) {
    if (typeof item.imageUrl === "string" && item.imageUrl.startsWith("data:")) {
      try {
        const url = await resolveImageSource(
          dataUrlToFile(item.imageUrl, item.name || "item"),
          userId,
        );
        // Only count it as fixed if it actually became a Storage URL.
        if (!url.startsWith("data:")) {
          updateItem(item.id, { imageUrl: url });
          healed++;
        }
      } catch {
        // Leave this one as-is; try the rest.
      }
    }
  }

  if (typeof profile.avatarUrl === "string" && profile.avatarUrl.startsWith("data:")) {
    try {
      const url = await resolveImageSource(
        dataUrlToFile(profile.avatarUrl, "avatar"),
        userId,
      );
      if (!url.startsWith("data:")) {
        updateProfile({ avatarUrl: url });
        healed++;
      }
    } catch {
      // ignore
    }
  }

  return healed;
}
