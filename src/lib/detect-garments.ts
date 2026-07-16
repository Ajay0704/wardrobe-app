/**
 * Client side of the whole-outfit detector. Sends one photo to /api/detect-garments
 * (Gemini returns every garment + a bounding box + attributes), then crops each box
 * out of the ORIGINAL data URL locally and runs cutout() per crop for a clean sticker.
 *
 * Cropping is done on the local data URL (not a re-hosted https URL) so the canvas is
 * never tainted by cross-origin pixels. Returns fully-attributed garments; on any
 * failure returns [] so callers can fall back to SegFormer (cutoutMulti) or single-add.
 */

import { cutout } from "./cutout";
import { authHeaders } from "./supabase/client";
import type { Category, Season } from "./types";

export interface DetectedGarment {
  category: Category;
  name: string;
  color: string;
  colorName?: string;
  seasons: Season[];
  tags: string[];
  /** Re-hosted transparent PNG (cutout), or the crop data URL if cutout failed. */
  url: string;
}

interface ApiGarment {
  category: Category;
  box: { x: number; y: number; w: number; h: number };
  name?: string;
  color?: string;
  colorName?: string;
  seasons: Season[];
  tags: string[];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}

/** Crop a normalized box (with a little padding) out of an image to a JPEG data URL. */
function cropBox(img: HTMLImageElement, box: ApiGarment["box"], pad = 0.06): string | null {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  const x0 = Math.max(0, (box.x - box.w * pad) * W);
  const y0 = Math.max(0, (box.y - box.h * pad) * H);
  const x1 = Math.min(W, (box.x + box.w * (1 + pad)) * W);
  const y1 = Math.min(H, (box.y + box.h * (1 + pad)) * H);
  const cw = Math.round(x1 - x0);
  const ch = Math.round(y1 - y0);
  if (cw < 8 || ch < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, Math.round(x0), Math.round(y0), cw, ch, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Detect every garment in one photo and return them as cut-out, attributed items.
 * `dataUrl` MUST be a local data: URL (from the picked/captured file).
 */
export async function detectGarments(
  dataUrl: string,
  userId: string | null,
): Promise<DetectedGarment[]> {
  let garments: ApiGarment[];
  try {
    const res = await fetch("/api/detect-garments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { garments?: ApiGarment[] };
    garments = data.garments ?? [];
  } catch {
    return [];
  }
  if (!garments.length) return [];

  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return [];
  }

  const out: DetectedGarment[] = [];
  // Limited concurrency so on-device cutout doesn't stall the UI.
  let i = 0;
  const worker = async () => {
    while (i < garments.length) {
      const g = garments[i++];
      const crop = cropBox(img, g.box);
      if (!crop) continue;
      let url = crop;
      try {
        url = (await cutout(crop, userId, { category: g.category })).url;
      } catch {
        /* keep the raw crop if cutout fails */
      }
      out.push({
        category: g.category,
        name: g.name?.trim() || "",
        color: g.color || "#a8a29e",
        colorName: g.colorName,
        seasons: g.seasons ?? [],
        tags: g.tags ?? [],
        url,
      });
    }
  };
  await Promise.all([worker(), worker()]);
  return out;
}
