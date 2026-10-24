/**
 * AJA-305 — the exact body /api/tryon-spin sends. Run: npm run test:spin-request
 *
 * Billing is per output SECOND and the Gemini API documents no default duration, so the
 * one assert that protects money is `duration: "6s"`. The rest pins what the paid test
 * proved: the front render as BOTH first and last frame (so the clip loops), 9:16, 720p.
 */
const { buildSpinRequest, SPIN_MODEL, SPIN_SECONDS, SPIN_PROMPT } = await import("@/lib/tryon-spin-prompt");

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const body = buildSpinRequest({ data: "QUJD", mimeType: "image/jpeg" });
ok(body.model === "gemini-omni-1.1-flash" && SPIN_MODEL === body.model, "model is pinned");
const images = body.input.filter((p) => p.type === "image");
ok(images.length === 2, "two images: first and last frame", String(images.length));
ok(images.every((p) => p.type === "image" && p.data === "QUJD" && p.mime_type === "image/jpeg"), "both are the front render");
ok(body.input[body.input.length - 1].type === "text", "the prompt comes last");
const fmt = body.response_format[0];
ok(fmt.duration === "6s" && SPIN_SECONDS === 6, "duration is explicit: 6s", fmt.duration);
ok(fmt.aspect_ratio === "9:16" && fmt.resolution === "720p" && fmt.type === "video", "9:16, 720p video");
ok(body.generation_config.video_config.task === "image_to_video", "task is image_to_video");
ok(/360-degree/.test(SPIN_PROMPT) && /locked off/.test(SPIN_PROMPT), "prompt asks for one full turn, camera locked");
ok(/feet stay in place/.test(SPIN_PROMPT), "prompt forbids walking");
// AJA-308 — the first and last frames ARE the saved render, whatever its scene (Street by
// default). A backdrop named in the prompt contradicts that picture on a paid call.
ok(!/studio|light-grey|backdrop/i.test(SPIN_PROMPT), "prompt names no backdrop of its own");
ok(/same setting, background and lighting as the first frame/.test(SPIN_PROMPT), "prompt keeps the first frame's background");

console.log(fails === 0 ? "\nSPIN-REQUEST CHECKS PASSED" : `\n${fails} SPIN-REQUEST CHECK(S) FAILED`);
if (fails) process.exit(1);
