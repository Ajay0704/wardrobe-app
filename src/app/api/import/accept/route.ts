/**
 * Accept or dismiss staged import candidates (AJA-114). The ONLY path that writes
 * imported items into the closet — always user-initiated (the confirm-and-review
 * gate). Membership-gated to the trusted cohort.
 */

import { requireUser } from "@/lib/auth-server";
import { addItemsToSnapshot, adminClient, guessCategory } from "@/lib/import-item";
import type { Category, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CandidateRow {
  id: string;
  name: string | null;
  brand: string | null;
  price: number | null;
  product_url: string | null;
  image_url: string | null;
  category: string | null;
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Not configured." }, { status: 503 });

  // Feature-flag gate: must be an allowlisted, non-disabled member.
  const { data: allow } = await admin
    .from("import_allow")
    .select("disabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!allow || allow.disabled) {
    return Response.json({ error: "Import not enabled." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "accept" | "dismiss";
    ids?: string[];
  };
  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === "string") : [];
  if (!ids.length) return Response.json({ error: "No candidates." }, { status: 400 });

  if (body.action === "dismiss") {
    await admin
      .from("import_candidates")
      .update({ status: "dismissed" })
      .eq("user_id", user.id)
      .in("id", ids);
    return Response.json({ ok: true, dismissed: ids.length });
  }

  // Accept: only the caller's own PENDING rows (held items can't be accepted).
  const { data: rows } = await admin
    .from("import_candidates")
    .select("id,name,brand,price,product_url,image_url,category")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .in("id", ids);

  const candidates = (rows ?? []) as CandidateRow[];
  const items: WardrobeItem[] = candidates.map((c) => {
    const name = c.name?.trim() || "Imported item";
    return {
      id: crypto.randomUUID(),
      name,
      imageUrl: c.image_url || "",
      productUrl: c.product_url || undefined,
      category: (c.category as Category) || guessCategory(name),
      color: "#a8a29e",
      tags: [],
      seasons: [],
      brand: c.brand || undefined,
      price: c.price ?? undefined,
      wishlist: false,
      createdAt: Date.now(),
    } satisfies WardrobeItem;
  });

  const added = await addItemsToSnapshot(admin, user.id, items);

  // Mark accepted (all requested pending rows — dedupe may drop some from the closet
  // but the candidate is still resolved).
  const acceptedIds = candidates.map((c) => c.id);
  if (acceptedIds.length) {
    await admin
      .from("import_candidates")
      .update({ status: "accepted" })
      .eq("user_id", user.id)
      .in("id", acceptedIds);
  }

  return Response.json({
    ok: true,
    added: added.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl })),
    resolved: acceptedIds.length,
  });
}
