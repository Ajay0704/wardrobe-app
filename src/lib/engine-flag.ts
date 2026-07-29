/**
 * AJA-248 — read the outfit-engine toggle from outside React.
 *
 * Prefer passing `engine` down explicitly (every component call site does, so the
 * flag lands in the useMemo dependency list and the screen actually re-renders
 * when you flip it). This exists for the one place that can't: the stylist tool
 * dispatch chain, which is called from deep inside an async handler rather than
 * from render. Same client-guarded global-state pattern `readTaste()` already
 * uses there.
 */
import { useWardrobe } from "./store";

export type EngineOption = { engine?: "v2" };

/** `{ engine: "v2" }` when the toggle is on, otherwise `{}` (i.e. v1). */
export function engineOption(): EngineOption {
  if (typeof window === "undefined") return {};
  try {
    return useWardrobe.getState().engineV2 ? { engine: "v2" } : {};
  } catch {
    return {};
  }
}
