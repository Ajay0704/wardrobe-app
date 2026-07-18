/**
 * Rec telemetry for the closet-aware-recs experiment (AJA-174, Phase 1). Emits the
 * funnel — impression → tap → outbound → save — to the existing /api/events sink,
 * tagged with which ranker produced the item and its position, so an interleaving
 * analysis can tell whether the closet-aware ranker wins clicks at matched slots.
 * Fire-and-forget: telemetry must never break the UX.
 */
import { authHeaders } from "./supabase/client";

export type RecStage = "impression" | "tap" | "outbound" | "save";

export interface RecCtx {
  ranker?: "closet" | "generic";
  position?: number;
  query?: string;
  /** Compact closet-signal snapshot, e.g. "similar:6" (owned status : pairCount). */
  closetMatch?: string;
}

// Map each funnel stage onto an accepted /api/events type; the experiment detail
// (stage, ranker, position…) rides in `payload` under surface="shop_rec".
const STAGE_TYPE: Record<RecStage, string> = {
  impression: "view",
  tap: "shop_click",
  outbound: "shop_click",
  save: "wishlist",
};

export async function trackShopRec(
  stage: RecStage,
  productId: string,
  ctx: RecCtx = {},
): Promise<void> {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        type: STAGE_TYPE[stage],
        productId,
        payload: { surface: "shop_rec", stage, ...ctx },
      }),
      keepalive: true, // survive the app backgrounding when opening a store link
    });
  } catch {
    /* swallow — telemetry never breaks UX */
  }
}
