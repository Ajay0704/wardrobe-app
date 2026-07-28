/**
 * The `/api/analyze` cataloguing prompt and its vocabularies.
 *
 * Lifted out of the route (AJA-246 phase 2) so it can be exercised against the real
 * model in a test. A prompt is the one part of this pipeline that unit tests can't
 * reason about — the only way to know whether "fit" comes back as a usable value is to
 * send the actual text to Gemini and look. Copying the prompt into a test would prove
 * the copy works, which is worth nothing.
 */
import { CATEGORIES, FIT_VALUES, SEASONS } from "./types";

/** The category words the model is offered — the app's own vocab, so they can't drift. */
const CATEGORY_WORDS = CATEGORIES.map((c) => c.value);

export const ANALYZE_FORMALITY = ["casual", "smart-casual", "formal", "statement"];
export const ANALYZE_TONE = [
  "neutral", "warm", "cool", "black", "white", "bright", "pastel", "earth",
];

/**
 * How the request is made, not just what it says. Exported alongside the prompt because a
 * test that mirrors the wording but not the config isn't testing the same call — a
 * `thinkingBudget: 0` stand-in truncated the JSON on longer answers and looked like a
 * model failure.
 */
export const ANALYZE_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  temperature: 0.2,
  // Cataloguing is a simple vision→JSON task; keep thinking minimal for speed, cost,
  // and to avoid empty/thought-only responses.
  thinkingConfig: { thinkingLevel: "minimal" },
} as const;

export function buildAnalyzePrompt(): string {
  return (
    `You are a fashion cataloguing assistant. The photo shows one wardrobe item to catalogue — it may be a garment (top, bottom, dress, outerwear) OR an accessory that is worn or held: shoes, a bag, or an accessory such as a watch, sunglasses, jewellery, a belt, a hat or a scarf. First decide what the photo is actually OF — the single item that is the clear main subject or close-up — and describe ONLY that item.\n` +
    `If the main subject is an accessory/bag/shoes being worn or held (a watch on a wrist, sunglasses on a face, a bag in a hand, shoes on feet), catalogue THAT item with the matching category — never the clothing, wrist, hand, skin or background behind it. If instead several garments are visible (e.g. a mirror selfie), pick the SINGLE most prominent garment that fills the most of the frame and ignore smaller or partially-visible ones (like trousers at the bottom of a sweater selfie). Always ignore the person and the background. Respond with JSON of this exact shape:\n` +
    `{"name": a short descriptive name like "Cream Cable-Knit Sweater",\n` +
    ` "category": exactly one of [${CATEGORY_WORDS.join(", ")}],\n` +
    ` "type": the specific garment type in 1-3 words, e.g. "polo shirt", "bomber jacket", "chelsea boots", "tote bag", "quarter-zip",\n` +
    ` "color": the dominant colour as a #rrggbb hex string,\n` +
    ` "colorName": a common colour name like "navy" or "cream",\n` +
    ` "seasons": an array with any of [${SEASONS.join(", ")}] when it is typically worn,\n` +
    ` "brand": the visible brand name, or null if none is visible,\n` +
    ` "tags": 2-5 lowercase style tags like "casual", "work", "minimal",\n` +
    ` "formality": exactly one of [${ANALYZE_FORMALITY.join(", ")}],\n` +
    ` "fit": how the garment sits on the body — exactly one of [${FIT_VALUES.join(", ")}]. Judge the cut, not the size. Use null for bags and accessories, which have no fit,\n` +
    ` "material": a short fabric guess like "cotton", "linen", "wool", "denim", "leather", or null,\n` +
    ` "pattern": "solid", "stripe", "check", "print", or null,\n` +
    ` "tone": the colour family, exactly one of [${ANALYZE_TONE.join(", ")}],\n` +
    ` "styleCaption": one short phrase for styling, e.g. "smart-casual navy knit for cool weather"}\n` +
    `Output only the JSON object.`
  );
}
