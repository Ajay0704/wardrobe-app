/**
 * AJA-305 — the 360° spin request, as a pure function, so the test checks the REAL body
 * the route sends (the `tryon-prompt.ts` pattern).
 *
 * Measured on the prototype (2026-10-24): this exact prompt with the front render as both
 * first and last frame produced one clean full turn on the first try — 6.0s, 144 frames,
 * 34,752 output tokens (~$0.61), 27.5s wall clock.
 */

export const SPIN_MODEL = "gemini-omni-1.1-flash";
/** Billing is per output second; always sent, because the API documents no default. */
export const SPIN_SECONDS = 6;

export const SPIN_PROMPT =
  "A full-length studio photograph of a person comes to life. The person slowly turns on the spot through ONE complete " +
  "360-degree rotation at a steady, even speed: first turning to show the camera their right side, then their back, then " +
  "their left side, and finally back to face the camera, ending exactly as in the last frame. The camera is locked off: no " +
  "camera movement, no zoom, no cuts. The same person, the same outfit, the same soft studio lighting and the same seamless " +
  "light-grey backdrop throughout. Arms stay relaxed at the sides, hands empty, feet stay in place — no walking, no posing, " +
  "no other motion. Photorealistic. No text, no music.";

type ImagePart = { type: "image"; data: string; mime_type: string };
type TextPart = { type: "text"; text: string };

export interface SpinRequestBody {
  model: typeof SPIN_MODEL;
  input: Array<ImagePart | TextPart>;
  response_format: Array<{ type: "video"; aspect_ratio: "9:16"; resolution: "720p"; duration: string }>;
  generation_config: { video_config: { task: "image_to_video" } };
}

export function buildSpinRequest(front: { data: string; mimeType: string }): SpinRequestBody {
  const frame: ImagePart = { type: "image", data: front.data, mime_type: front.mimeType };
  return {
    model: SPIN_MODEL,
    // Same image first and last: the clip ends where it starts, so the turntable loops.
    input: [frame, { ...frame }, { type: "text", text: SPIN_PROMPT }],
    response_format: [{ type: "video", aspect_ratio: "9:16", resolution: "720p", duration: `${SPIN_SECONDS}s` }],
    generation_config: { video_config: { task: "image_to_video" } },
  };
}
