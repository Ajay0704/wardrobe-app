import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { embedImageBytes, toVectorLiteral } from "@/lib/embed";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "wardrobe-images";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Coarse stub classifier — box position → garment category. Replaced by a real
 * segmentation/detection model in Slice 2; the box + crop + embedding it feeds
 * downstream do not change, so callers are unaffected by the swap.
 */
function classify(box: Box): { category: string; name: string } {
  const cy = box.y + box.h / 2;
  if (box.h >= 0.55 && box.w >= 0.4) return { category: "dress", name: "Dress" };
  if (cy < 0.4) return { category: "top", name: "Top" };
  if (cy < 0.72) return { category: "bottom", name: "Bottom" };
  return { category: "shoes", name: "Shoes" };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  let body: { imageUrl?: string; postId?: string; box?: Box };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { imageUrl, postId } = body;
  if (!imageUrl) return Response.json({ error: "imageUrl required." }, { status: 400 });
  if (!body.box) return Response.json({ error: "box required." }, { status: 400 });

  // Normalize the box; a quick tap (tiny box) expands to a ~30% region around the point.
  let box: Box = {
    x: clamp01(body.box.x),
    y: clamp01(body.box.y),
    w: clamp01(body.box.w),
    h: clamp01(body.box.h),
  };
  if (box.w < 0.02 && box.h < 0.02) {
    const cx = box.x, cy = box.y;
    box = {
      x: clamp01(cx - 0.15),
      y: clamp01(cy - 0.15),
      w: 0.3,
      h: 0.3,
    };
    box.w = Math.min(box.w, 1 - box.x);
    box.h = Math.min(box.h, 1 - box.y);
  }

  // Fetch the source image and crop the box out server-side.
  let cropBuf: Buffer;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return Response.json({ error: "Could not load image." }, { status: 502 });
    const src = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(src).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    if (!W || !H) return Response.json({ error: "Unreadable image." }, { status: 502 });
    const left = Math.round(box.x * W);
    const top = Math.round(box.y * H);
    const width = Math.max(1, Math.min(W - left, Math.round(box.w * W)));
    const height = Math.max(1, Math.min(H - top, Math.round(box.h * H)));
    cropBuf = await sharp(src).extract({ left, top, width, height }).jpeg({ quality: 80 }).toBuffer();
  } catch (e) {
    return Response.json({ error: `Crop failed: ${(e as Error).message}` }, { status: 500 });
  }

  const embedding = await embedImageBytes(cropBuf);
  const { category, name } = classify(box);
  const attributes: Record<string, unknown> = {};
  const detectionId = crypto.randomUUID();
  const uid = user.id === "local-dev" ? null : user.id;

  // Store the crop + persist the detection (embedding stays server-side).
  const admin = adminClient();
  let cropUrl = imageUrl;
  if (admin) {
    const path = `crops/${uid ?? "anon"}/${detectionId}.jpg`;
    const up = await admin.storage.from(BUCKET).upload(path, cropBuf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (!up.error) {
      cropUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const { error } = await admin.from("detections").insert({
      id: detectionId,
      user_id: uid,
      source_ref: postId ?? null,
      image_url: imageUrl,
      box,
      name,
      category,
      attributes,
      crop_path: cropUrl,
      embedding: toVectorLiteral(embedding),
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    return Response.json(
      { error: "Detect is not configured (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  return Response.json({ detectionId, name, category, attributes, cropUrl });
}
