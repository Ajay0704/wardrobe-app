/**
 * Decision loop (AJA-190). Closing the buy/skip loop is the copilot wedge's core
 * artifact — a bank of avoided regret. A decision is logged as a `decision` event
 * in the existing events sink (the moat + the go/kill funnel number), and the
 * savings bank is aggregated server-side by /api/decisions/summary. No store or
 * snapshot changes — one source of truth.
 */
import { authHeaders } from "./supabase/client";
import type { WardrobeItem } from "./types";

export type DecisionOutcome = "bought" | "skipped" | "wait";

/** Record the outcome of a Smart Buy verdict. Fire-and-forget — never breaks UX. */
export async function logDecision(
  item: Pick<WardrobeItem, "id" | "name" | "price">,
  verdict: string,
  outcome: DecisionOutcome,
): Promise<void> {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        type: "decision",
        payload: {
          outcome,
          verdict,
          price: typeof item.price === "number" ? item.price : null,
          itemName: item.name,
          itemRef: item.id,
        },
      }),
      keepalive: true,
    });
  } catch {
    /* telemetry never breaks UX */
  }
}

export interface DecisionSummary {
  savedTotal: number; // money kept on skips
  skippedCount: number;
  boughtCount: number;
  waitCount: number;
  recent: {
    itemName: string;
    outcome: DecisionOutcome;
    price: number | null;
    createdAt: string;
  }[];
}

const EMPTY: DecisionSummary = {
  savedTotal: 0,
  skippedCount: 0,
  boughtCount: 0,
  waitCount: 0,
  recent: [],
};

export async function fetchDecisionSummary(): Promise<DecisionSummary> {
  try {
    const res = await fetch("/api/decisions/summary", {
      headers: { ...(await authHeaders()) },
    });
    if (!res.ok) return EMPTY;
    return (await res.json()) as DecisionSummary;
  } catch {
    return EMPTY;
  }
}
