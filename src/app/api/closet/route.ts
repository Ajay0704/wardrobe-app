import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** "I own this" — persists the grabbed garment (with its embedding) + logs an own event. */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in to save to your closet." }, { status: 401 });
  }
  const { detectionId } = await request.json().catch(() => ({}));
  if (!detectionId) return Response.json({ error: "detectionId required." }, { status: 400 });

  const admin = adminClient();
  if (!admin) return Response.json({ error: "Not configured." }, { status: 500 });

  const { data: det, error } = await admin
    .from("detections")
    .select("source_ref,name,category,attributes,crop_path,embedding")
    .eq("id", detectionId)
    .single();
  if (error || !det) return Response.json({ error: "detection not found" }, { status: 404 });

  const garmentId = crypto.randomUUID();
  const { error: ge } = await admin.from("garments").insert({
    id: garmentId,
    user_id: user.id,
    source_ref: det.source_ref,
    name: det.name,
    category: det.category,
    attributes: det.attributes ?? {},
    image_path: det.crop_path,
    embedding: det.embedding,
  });
  if (ge) return Response.json({ error: ge.message }, { status: 500 });

  await admin.from("events").insert({
    user_id: user.id,
    type: "own",
    garment_id: garmentId,
    post_ref: det.source_ref,
    payload: { category: det.category },
  });

  return Response.json({ garmentId, name: det.name, category: det.category, imageUrl: det.crop_path });
}
