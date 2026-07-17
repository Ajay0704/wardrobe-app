/**
 * Partner capsules (AJA-163, Phase 3) — sponsored "Recreate" capsules.
 *
 * Concrete feed for the partnerFeed seam. Returns nothing until a real brand
 * partnership / content source is connected — wire it to an API or a Supabase
 * table here. Rendered in the For-you feed only when EXPLORE_FEATURES.partnerCapsules
 * is on AND this returns items, so nothing half-built shows in the meantime.
 */
import type { PartnerCapsule } from "@/lib/explore/foundation";

export async function fetchPartnerCapsules(): Promise<PartnerCapsule[]> {
  // No partners yet. When a deal exists, return capsules here, e.g.:
  //   return [{ id, brand: "Everlane", title: "The workday capsule",
  //             productIds: [...], sponsored: true }];
  return [];
}
