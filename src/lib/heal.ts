import { useWardrobe } from "./store";
import type { UserProfile } from "./profile";
import type { Outfit, WardrobeItem } from "./types";
import { dataUrlToFile, resolveImageSource } from "./supabase/storage";
import { isRenderPath } from "./supabase/private-storage";

const DATA_URL_RE = /^data:/i;
/** Inline images larger than this (or HEIC) poison sync — drop them. */
const MAX_INLINE_CHARS = 200_000;

function isBadInline(url: string): boolean {
  if (!DATA_URL_RE.test(url)) return false;
  if (/image\/hei[cf]/i.test(url)) return true;
  return url.length > MAX_INLINE_CHARS;
}

/**
 * Drop HEIC / oversized data-URLs from the in-memory store so a poisoned
 * localStorage can't keep re-breaking sync. Returns how many images were cleared.
 */
export function scrubBloatedInlineImages(): number {
  const { items, profile, updateItem, updateProfile } = useWardrobe.getState();
  let cleared = 0;

  for (const item of items) {
    if (typeof item.imageUrl === "string" && isBadInline(item.imageUrl)) {
      updateItem(item.id, { imageUrl: "" });
      cleared++;
    }
  }

  if (
    typeof profile.avatarUrl === "string" &&
    isBadInline(profile.avatarUrl)
  ) {
    updateProfile({ avatarUrl: undefined });
    cleared++;
  }

  return cleared;
}

/** Pure scrub for persist merge / partialize (no store writes). */
export function scrubSnapshotImages<
  T extends { items?: WardrobeItem[]; profile?: UserProfile; outfits?: Outfit[] },
>(data: T): T {
  const items = Array.isArray(data.items)
    ? data.items.map((it) =>
        typeof it.imageUrl === "string" && isBadInline(it.imageUrl)
          ? { ...it, imageUrl: "" }
          : it,
      )
    : data.items;

  let profile = data.profile;
  if (
    profile &&
    typeof profile.avatarUrl === "string" &&
    isBadInline(profile.avatarUrl)
  ) {
    const next = { ...profile };
    delete next.avatarUrl;
    profile = next;
  }

  /**
   * AJA-276 — `profile.tryOnPhotoPath` gets the outfit treatment below, for the
   * same reason: it must be a bucket path, never a URL or inline data.
   *
   * NOTE THE CHAINING. This reads the `profile` local, not `data.profile`, so it
   * composes with the avatarUrl branch above. Written as an independent `if` over
   * `data.profile` it would silently discard that fix whenever both were dirty.
   *
   * This is also the only validation `tryOnPhotoPath` gets on the way back in:
   * `profile` has no normalizer, and `merge` spreads it wholesale.
   */
  if (
    profile &&
    profile.tryOnPhotoPath !== undefined &&
    !isRenderPath(profile.tryOnPhotoPath)
  ) {
    const next = { ...profile };
    delete next.tryOnPhotoPath;
    profile = next;
  }

  /**
   * AJA-275 — `tryOnRenderPath` must be a bucket path, never a URL or inline data.
   *
   * `isBadInline` is the wrong test here and would let the dangerous case through:
   * it only rejects `data:` URLs over 200k chars, so a SIGNED url (~200 chars of
   * `https:`) sails past it, syncs to every device, and expires an hour later
   * leaving a look whose thumbnail silently stops loading. `isRenderPath` inverts
   * the check — accept only a bare path — which also covers oversized data URLs.
   */
  const outfits = Array.isArray(data.outfits)
    ? data.outfits.map((o) => {
        if (o.tryOnRenderPath === undefined || isRenderPath(o.tryOnRenderPath)) return o;
        const next = { ...o };
        delete next.tryOnRenderPath;
        return next;
      })
    : data.outfits;

  return { ...data, items, profile, outfits };
}

/**
 * Drop HEIC / oversized data-URLs from an in-memory snapshot (e.g. after pull)
 * without writing the Zustand store item-by-item (that would spam sync).
 */
export function scrubPulledSnapshot<
  T extends {
    items: WardrobeItem[];
    profile: UserProfile;
  },
>(snapshot: T): T {
  return scrubSnapshotImages(snapshot);
}

/**
 * Convert remaining (small, non-HEIC) data: URLs into Storage URLs.
 * Oversized/HEIC must already be scrubbed — those cannot be healed in-browser.
 */
export async function healBase64Snapshot(userId: string): Promise<number> {
  scrubBloatedInlineImages();

  const { items, profile, updateItem, updateProfile } = useWardrobe.getState();
  let healed = 0;

  for (const item of items) {
    if (typeof item.imageUrl === "string" && item.imageUrl.startsWith("data:")) {
      try {
        const url = await resolveImageSource(
          dataUrlToFile(item.imageUrl, item.name || "item"),
          userId,
        );
        if (!url.startsWith("data:")) {
          updateItem(item.id, { imageUrl: url });
          healed++;
        }
      } catch {
        // Leave convertible failures as-is; sync sanitize will strip if too big.
      }
    }
  }

  if (
    typeof profile.avatarUrl === "string" &&
    profile.avatarUrl.startsWith("data:")
  ) {
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
