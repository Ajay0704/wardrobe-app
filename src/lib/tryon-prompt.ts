/**
 * AJA-274 — the try-on prompt, as a pure function.
 *
 * Split out of the route so it can be exercised directly by a test/eval harness
 * against the REAL string the API sends, rather than a copy that can drift. The
 * route does nothing to this text; it only supplies the flags.
 *
 * Every block here is the result of a measurement, recorded so it isn't "improved"
 * back to the old behaviour:
 *  - Identity goes FIRST and names images by index. The old prompt buried it
 *    mid-paragraph and tried to fix drift with "don't copy the model's face", which
 *    did not hold — the model had no way to know which of 4+ images was authoritative.
 *  - The SCENE block replaced "plain light-grey studio background, soft even
 *    lighting". That wording was specifying the AI-catalogue look, and removing it was
 *    the single largest perceptual improvement measured.
 *  - COLOUR_RULE exists because a garment label overrode a garment photo: the olive
 *    ringer tee is tagged colorName "dark yellow", and 3 of 4 test renders produced a
 *    mustard shirt.
 */
import type { TryOnScene } from "./tryon";

const ID_WITH_FACE =
  "IDENTITY — the single most important requirement here. IMAGE 1 is a CLOSE-UP of this person's " +
  "face; it is the authority on their identity. IMAGE 2 is that SAME person, full body; it is the " +
  "authority on their build, proportions and posture. The output must be a photograph of THAT SAME " +
  "REAL PERSON. Maintain the exact same facial features as IMAGE 1 — same eyes, nose shape, jawline " +
  "contour, and skin texture. Keep the same hairline, hair colour and hair style, the same facial " +
  "hair, skin tone and eye colour. Reproduce the build in IMAGE 2 as it actually is: do not slim " +
  "them, lengthen their legs, broaden their shoulders or add muscle. Do not idealise, smooth, " +
  "lighten, age or beautify the face — a slightly imperfect likeness of the real person is CORRECT, " +
  "and a better-looking stranger is WRONG. Some clothing photos may show other models; ignore their " +
  "faces, bodies, hair and skin entirely.";

const ID_PHOTO_ONLY =
  "IDENTITY — the single most important requirement here. IMAGE 1 is a photo of a real person. The " +
  "output must be a photograph of THAT SAME REAL PERSON. Maintain the exact same facial features as " +
  "the reference — same eyes, nose shape, jawline contour, and skin texture. Keep the same hairline, " +
  "hair colour and hair style, the same facial hair, skin tone and eye colour. The face may be small " +
  "in that photo: enlarge and render it faithfully rather than substituting a generic face. Do not " +
  "idealise, slim, smooth, lighten, age or beautify the face — a slightly imperfect likeness of the " +
  "real person is CORRECT, and a better-looking stranger is WRONG. Some clothing photos may show " +
  "other models; ignore their faces, bodies, hair and skin entirely.";

const ID_MODEL = "Produce a realistic full-body studio photograph of a model.";

const OUTFIT =
  "OUTFIT — the person wears ALL the garment images together as one coordinated, well-fitted " +
  "outfit: tops on the torso, bottoms on the legs, shoes on the feet, outerwear layered over tops, " +
  "and bags or jewellery worn naturally. Reproduce every item faithfully — the same colour, pattern, " +
  "print, material and garment type as its photo. Some garments carry printed text, sponsor " +
  "wordmarks, club crests or brand logos: reproduce every letter and mark EXACTLY as it appears in " +
  "that garment's photo — same spelling, same letterforms, same placement and scale. If a mark is " +
  "not legible, reproduce its shape and colour rather than inventing letters; never substitute " +
  "misspelled text. Add no garment, prop, phone, bag, hat, jewellery or accessory that is not among " +
  "the provided images, and remove none. Keep both hands empty — no phone, cup or bag.";
// Note: "hands empty" belongs here (it is about not inventing props) but the POSE of
// the hands belongs to FRAMES — the original prompt put "relaxed at the sides" here,
// which contradicted any candid framing that wants a hand in a pocket.

const COLOUR_RULE =
  "COLOUR AND PATTERN COME FROM THE IMAGES, NOT FROM THESE WORDS. The garment names below are rough " +
  "type hints only and may be inaccurate. For every garment, take its colour, pattern, print and " +
  "material ONLY from its photograph. If a name disagrees with its photo, the photo is correct.";

/**
 * How the shot is framed and posed.
 *
 * "full" is the original: a front-facing, arms-at-sides, head-to-shoes specification.
 * That is a catalogue pose, and it has a second-order cost — full-length framing puts
 * the face at roughly 6% of the output height, so even a good likeness has too few
 * pixels to read as *you*. Competitors that look markedly better use candid posture
 * and tighter crops, which is what the other two options are for.
 *
 * MEASURED: "candid" works — hand in pocket, weight on one leg, shoulders turned, on
 * all three test looks. "portrait" does NOT: asking for a mid-thigh crop was ignored
 * every time and the model still returned full-length with the feet in frame. So face
 * prominence cannot be bought with prompt wording — crop the OUTPUT client-side
 * instead, which is free and deterministic. "portrait" is kept only to document that.
 */
export type TryOnFraming = "full" | "candid" | "portrait";

const FRAMES: Record<TryOnFraming, string> = {
  full:
    "FRAMING — one standing person, front-facing, full body from the top of the head to the shoes, " +
    "feet fully visible, the whole face unobstructed and in frame, with clear margin above the head " +
    "and below the shoes. Both hands relaxed at the sides.",
  candid:
    "FRAMING — a candid full-length photograph of one person. The whole outfit is visible from the " +
    "top of the head to the shoes, with the feet fully in frame. They stand naturally with their " +
    "weight on one leg, shoulders turned slightly away from the camera, one hand relaxed at the side " +
    "and the other loose or lightly in a pocket. Natural relaxed expression — a slight smile, eyes " +
    "on the camera or just past it. This is someone photographed mid-moment on the street, NOT a " +
    "model posing for a catalogue: avoid a symmetrical, squared-up, arms-pinned stance.",
  portrait:
    "FRAMING — a candid three-quarter-length photograph, framed from mid-thigh upward so the face is " +
    "large and clearly readable and the upper half of the outfit fills the frame. One person, " +
    "standing or walking naturally, shoulders turned slightly away from the camera, natural relaxed " +
    "expression, eyes on the camera or just past it. This is someone photographed mid-moment, NOT a " +
    "model posing for a catalogue.",
};

/** Kept bright and uncluttered: a dim or busy scene hides the garment, which defeats
 *  the point of the screen. "studio" stays for inspecting the clothes. */
const SCENES: Record<TryOnScene, string> = {
  street:
    "Setting: standing on a clean city sidewalk beside a brick building on a bright overcast late " +
    "afternoon. Warm directional daylight from the front left, gentle modelling on the face, soft " +
    "natural shadows on the ground. Background softly out of focus.",
  window:
    "Setting: standing indoors beside a large window in a bright, plainly furnished room. Soft " +
    "directional daylight from the side, natural falloff across the body, warm neutral walls. " +
    "Background softly out of focus.",
  park:
    "Setting: standing on a path in a green park in soft late-afternoon sun. Warm directional " +
    "backlight with gentle fill on the face, foliage softly out of focus behind.",
  studio:
    "Setting: a photography studio against a plain light-grey seamless backdrop, with soft even " +
    "lighting. A clean product-photography look.",
};

const CAMERA =
  "This must look like a real photograph taken on a real camera, not a rendering and not a " +
  "catalogue product shot. Shot on a full-frame camera with an 85mm lens at f/2.8 — shallow depth " +
  "of field, natural skin texture with visible pores and fine detail, subtle film grain, slightly " +
  "asymmetric natural posture. Photorealistic. Do NOT produce flat even lighting, plastic or " +
  "airbrushed skin, or a mannequin look.";

export interface PromptOptions {
  /** A face close-up is IMAGE 1 (implies a full-body photo is IMAGE 2). */
  hasFace: boolean;
  /** A full-body photo was supplied. False renders a generic model. */
  hasPerson: boolean;
  /** Garments in the order they appear in `image_input`, after the person images. */
  garments: Array<{ label?: string }>;
  scene?: TryOnScene;
  /** Defaults to "candid" — measured to beat "full" on all three test looks (n=1 each). */
  framing?: TryOnFraming;
}

/**
 * Replicate's `image_input` is a flat array with nowhere to attach per-image labels,
 * so image ORDER is load-bearing and the prompt has to describe it. The manifest
 * offset is derived from what was actually supplied — with no person photo, garments
 * start at IMAGE 1 — so this can never mislabel the array.
 */
export function buildTryOnPrompt(opts: PromptOptions): string {
  const { hasFace, hasPerson, garments } = opts;
  const identity = hasFace && hasPerson ? ID_WITH_FACE : hasPerson ? ID_PHOTO_ONLY : ID_MODEL;
  const scene = SCENES[opts.scene ?? "street"] ?? SCENES.street;
  const frame = FRAMES[opts.framing ?? "candid"] ?? FRAMES.candid;

  const name = (g: { label?: string }) => g.label?.trim() || "clothing item";
  const offset = (hasPerson ? 1 : 0) + (hasFace && hasPerson ? 1 : 0);
  const heading =
    hasFace && hasPerson
      ? "IMAGE 1 — face close-up\nIMAGE 2 — full body\n"
      : hasPerson
        ? "IMAGE 1 — the person\n"
        : "";

  return [
    identity,
    `${OUTFIT}\n\n${COLOUR_RULE}\n\nGarment images follow${
      offset ? " the person image(s)" : ""
    }, in this order: ${garments.map((g, i) => `${i + 1}) ${name(g)}`).join(", ")}.`,
    `${frame}\n${scene}\n${CAMERA}`,
    `Image manifest:\n${heading}${garments
      .map((g, i) => `IMAGE ${i + 1 + offset} — ${name(g)}`)
      .join("\n")}`,
  ].join("\n\n");
}
