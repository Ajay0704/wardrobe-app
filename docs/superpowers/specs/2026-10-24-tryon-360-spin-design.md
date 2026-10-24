# 360° try-on spin — design

**Linear:** AJA-305 · **Status:** draft for review · **Prototype:** `/tryon-360-preview` (`src/components/proto/TryOn360Preview.tsx`)

## Summary

On the "See it on you" screen (`TryOnView`), a saved look that already has a try-on render gets a **Photo / 360°** switch. In 360°, one tap makes a short video of the person in that render turning a full circle on the spot. The customer then drags the picture to turn the look, flicks it to spin, or taps Front / ¾ / Side / Back. The spin is saved to the look, so opening it again is free.

## What the prototype established

| Finding | Evidence |
|---|---|
| A turntable of separate photo renders can't feel smooth. | 4, then 7 unique angles (12 stops with mirroring). Every tuning of the crossfade read as a flipbook or as a double exposure. Measured: no dropped frames and no unloaded images, so it was the approach, not performance. |
| One image-to-video call does a clean full turn. | `gemini-omni-1.1-flash`, front render as both first and last frame. The clip completed front → side → back → other side → front, with outfit, scale, feet, light and backdrop consistent, on the first try. |
| Cost and time are acceptable. | 6 s, 720p, 9:16, 144 frames at 24 fps. 34,752 output tokens × $17.50/M = **$0.608**, plus ~$0.005 for input and thinking. **27.5 s** wall clock. |
| The turn isn't evenly paced. | The test clip eases out of the front, lingers about 1 s on the back, then hurries round the other side. Mapping a drag to time makes the same swipe turn different amounts. |
| The MP4 is a poor scrubbing source. | It has one keyframe in 144 frames, so seeking means decoding from the start every time. Frames have to be pulled out once and drawn from memory. |
| A 9:16 clip in the 3:4 canvas must not be letterboxed or cropped. | The figure uses the full height, so cropping cuts feet or head. Smearing the edge column outward is invisible; flat bars or a blurred fill both showed a seam. |

## Scope

**In:**
- making, saving, loading and turning a spin for a saved look with a saved front render;
- cost controls;
- error states;
- replacing and deleting a spin.

**Out (non-goals for this version):**
- spins for unsaved Explore suggestions (no `outfitId` to save to);
- scenes other than Studio;
- sharing or exporting the spin;
- an offline cache of extracted frames;
- Android.

## User flow (inside `TryOnView`)

The Photo / 360° switch appears only when the screen has an `outfitId` **and** the look has a saved `tryOnRenderPath`, behind the `NEXT_PUBLIC_TRYON_SPIN` flag. The spin starts from that saved render, so it is the same image the customer already approved. A fresh render that hasn't been saved with "Save to this look" doesn't show the switch: the route needs a stored render to start from. Saving is one existing tap.

| State | Canvas | Below the canvas |
|---|---|---|
| **No spin yet** | The saved front render, captioned "Front only — make the spin to turn it". Dragging gives way with resistance and springs back; after a drag the caption becomes "Tap Make it 360° first — then drag to turn". | **Make it 360°** · "One 6-second spin of this look — about 30 seconds." |
| **Making** | Front render with "Filming the turn" and an accent hairline driven by the same asymptotic clock as `useTryOnProgress` (typical 28 s, never shows 100 before it lands). | Button disabled: "Making your spin…". The Photo/360° switch is disabled. |
| **Loading** | "Loading the spin". The hairline shows real progress: download bytes, then frames extracted. | Same. |
| **Ready** | Turntable: drag, flick-to-coast, arrow keys ±15°. Angle pill (Front, ¾, Side, ¾ back, Back). "Drag to turn" hint until the first drag. | Four tiles (Front ¾ Side Back) at real frames; tap eases there. "Saved to this look" (non-interactive). |
| **Existing spin** | Goes straight to Loading → Ready. No cost. | "Make a new spin" text action. |
| **Error** | Front render plus the message (see Error handling). | Button re-enabled unless the error is permanent. |

**Saving is automatic, unlike photo renders.** The route stores the clip and the client attaches it to the look the moment it returns. A $0.61 result that vanishes when the customer leaves the screen would repeat the AJA-275 bug ("renders vanish"), at five times the price. The prototype's "Save 360° to this look" button becomes a status line.

**A spin belongs to one front render.** Replacing or removing the look's render (`setOutfitRender` with a different path) clears `spinPath`, and the caller deletes the old clip. A spin of the old render on top of a new one would show two different outfits.

Scene chips: in 360° only Studio is enabled, with the line "360° is filmed in the studio so every angle matches." The disclaimer adds: "The back is partly inferred, since your photos only show the front."

## Architecture

Six units. Each one can be understood and tested on its own.

### 1. Request builder — `src/lib/tryon-spin-prompt.ts`

A pure function, so a test can check the exact body the route sends (the pattern from `tryon-prompt.ts`).

```ts
export const SPIN_MODEL = "gemini-omni-1.1-flash";
export const SPIN_SECONDS = 6;
export function buildSpinRequest(front: { data: string; mimeType: string }): SpinRequestBody;
```

The body:
- `input` is the front image twice (first and last frame, so the clip loops), then the prompt text from the test.
- `response_format: [{ type: "video", aspect_ratio: "9:16", resolution: "720p", duration: "6s" }]`.
- `generation_config: { video_config: { task: "image_to_video" } }`.

The duration is always explicit. Billing is per output second and the Gemini API docs give no default, so a missing field could bill 10 s.

### 2. Route — `src/app/api/tryon-spin/route.ts`

`POST { renderPath }` → `{ path }`. Steps in order:

1. **Auth and configuration:**
   - `requireUser`, else 401.
   - `GEMINI_API_KEY` or the service-role client unset → 501. The same sentinel as `/api/tryon`, so the client stops offering a retry.
2. **Ownership, then the limit:**
   - `isOwnPrivatePath(renderPath, user.id)`, else 400. The spin can only start from the caller's own stored render. That stops the route from being used as a free video generator for arbitrary images.
   - Only then `checkLimit(user, "spin")`, else 429 with the spin message. An invalid request never uses up a spin.
3. **Fetch the front render:** download it from `renders-private` with `adminClient()`. Failure → 404 "That render is no longer in storage." No call is made, so nothing is charged.
4. **Generate:** POST `https://generativelanguage.googleapis.com/v1beta/interactions` with `x-goog-api-key` and `AbortSignal.timeout(50_000)`, under `maxDuration = 60`. Read the first `steps[].content[]` item with `type === "video"`, either `data` or `uri`.
5. **Store:** upload the MP4 with `adminClient()` to `renders-private` at `<userId>/<uuid>.mp4`. Return `{ path }`.
6. **Log:** `usage.total_output_tokens` and the elapsed time, so real cost and latency can be checked against $0.61 / 28 s.

The route stores the clip itself, rather than returning ~3.4 MB of base64 for the client to re-upload. That halves the transfer and means a client that closes mid-flight still leaves a stored clip, not a paid one that was thrown away.

### 3. Client seam — `src/lib/tryon-spin.ts`

```ts
export async function makeSpin(renderPath: string): Promise<string>; // returns the stored path
```

Mirrors `tryOnOutfit`: `authHeaders()`, and it throws with the route's `error` text. The 501 message contains "isn't configured" so `TryOnView`'s existing `unavailable` check applies.

### 4. Data — `Outfit.spinPath`

- **Type:** `spinPath?: string` on `Outfit` in `src/lib/types.ts`. A bucket path, same invariant as `tryOnRenderPath`: never a URL, never inline data. `isRenderPath` already accepts `<uid>/<uuid>.mp4`.
- **Whitelisting:** add it to `normalizeOutfit` with `isRenderPath`, or it's stripped on every reload (AJA-223/239/245).
- **Scrubbing:** add it to `scrubSnapshotImages`. `sanitizeSnapshotForPush` calls that, so it's the gate to Postgres too. Outfits sync as `jsonb`, so no SQL migration is needed.
- **Store actions:**
  - New `setOutfitSpin(id, path | null)`, validated with `isRenderPath`.
  - `setOutfitRender` clears `spinPath` when the new path differs from the old.
  - `duplicateOutfit` sets `spinPath: undefined`, for the same blob-aliasing reason as the render.
- **Deleting looks:** like `tryOnRenderPath` today, deleting a look leaves its clip to the account-deletion sweep. Out of scope here; AJA-283/284 track orphan cleanup.

### 5. Frames — `src/lib/spin-frames.ts`

```ts
export const SPIN_FRAMES = 72;
export async function loadSpinFrames(
  url: string,
  onProgress: (fraction: number) => void,
): Promise<SpinFrames>;
export interface SpinFrames { images: HTMLImageElement[]; angles: number[]; release(): void }
export function turnAngles(diffs: number[]): number[];   // pure
export function frameForAngle(angles: number[], deg: number): number; // pure
```

- **Download:** fetch the signed URL to a `Blob` with progress, then `URL.createObjectURL`. A same-origin blob URL means the canvas is never CORS-tainted, so `toBlob` can't throw `SecurityError`.
- **Extract:** play the clip muted, `playsInline`, at `playbackRate = 2`, and capture frames with `requestVideoFrameCallback`. That decodes the clip once, front to back. Seeking 72 times into a one-keyframe MP4 would decode from the start every time. Fallback when `requestVideoFrameCallback` is missing: seek with `seeked` events. Keep the frame nearest each of 72 evenly spaced media times.
- **Fit:** draw each frame into a 480×640 canvas. The 9:16 frame is scaled to 360×640 and centred; the 60 px either side is filled by stretching the frame's outermost column. Then `toBlob("image/jpeg", 0.82)` → blob URL → `Image`.
- **Why JPEG images, not `ImageBitmap`s:** 72 decoded 480×640 bitmaps hold ~88 MB, which is a real risk in WKWebView. JPEG `Image`s are ~15 KB each and decoded on demand by the browser.
- **Pacing:** while extracting, store the mean absolute difference between each frame and the previous one on a 24×32 greyscale thumbnail. `turnAngles` turns those differences into cumulative angles scaled to 0–360. Each step is at least 5% of the mean difference, so a held frame still advances a little and the result is strictly increasing. Consecutive-frame difference tracks turning speed, so a drag turns evenly whichever way this particular clip was paced. This replaces the prototype's hand-measured `TURN` table, which only fits the one test clip.
- **Cleanup:** `release()` revokes every blob URL when the screen closes.

### 6. UI — `src/components/explore/SpinTurntable.tsx` + `TryOnView`

`SpinTurntable` is lifted from the prototype's ready state. It is presentation only:

```ts
export function SpinTurntable(props: { frames: SpinFrames }): JSX.Element;
```

It owns the canvas (drawn imperatively, never by swapping `<img>` src), drag with `DRAG_DEG_PER_PX = -0.6`, coast (`FRICTION 0.92`, `MAX_VEL 0.9`), the arrow keys, the angle pill, the hint and the four tiles. It takes the short way round and respects `prefers-reduced-motion`.

`TryOnView` gets the Photo / 360° switch. The 360° states live in `Spin360Panel` (`src/components/explore/Spin360Panel.tsx`), and the logic lives in a hook (`useSpin(outfitId)`), so the 486-line view doesn't grow its own state machine. The hook:
- loads an existing `spinPath`;
- runs `makeSpin`, then `setOutfitSpin`, then loads the frames;
- deletes the old clip when it's replaced;
- exposes `{ status, progress, frames, error, make }`.

## Storage and privacy

- **Bucket:** the same `renders-private` bucket and policies (own folder only), and the same short-lived signing (`signedPrivateUrl`, 600 s).
- **Account deletion:** already recursive over the bucket.
- **Who sees it:** a spin is a moving image of the customer's body, the same sensitivity class as the render. It is never put in the public `wardrobe-images` bucket and never shared.
- **Provider rules:** Gemini Omni refuses some uploads of recognisable people and, in the EEA, UK and Switzerland, images of minors. Its safety refusal comes back as an error; see below.
- **Watermark:** every clip carries an invisible SynthID watermark. Nothing in the UI depends on it.

## Cost controls

- **Only on tap.** Nothing is generated on screen open, on scene change or on garment change. This is the existing `TryOnView` rule.
- **Reused when it exists.** An existing `spinPath` loads for free.
- **New rate-limit tier:** `spin: { ns: "spin", windowMs: 24 * 60 * 60_000, anon: 0, user: 5 }` in `TIERS`. Guests can't make spins; an account gets 5 a day, at most ~$3.05.
- **Fixed length:** the duration is always sent explicitly (6 s).

Per new look, the customer's normal front render (~$0.13) plus the spin (~$0.61) is about **$0.74**. Turning, reopening and showing a saved spin cost nothing.

## Error handling

| Case | Detected by | Shown | Retry |
|---|---|---|---|
| Provider not configured | route 501 | "360° isn't available yet." | No; the switch hides for the session |
| Daily limit | route 429 | "That's today's 5 spins — try again tomorrow." | No |
| Render missing from storage | route 404 | "This look's photo is gone — make a new try-on first." | No |
| Safety refusal / no video in the response | route 502 with the provider's message | "Couldn't film this look. Try again, or try a different photo." | Yes |
| Timeout (> 50 s) | route 504 | "That took too long. Try again." | Yes. Aborting our request may not cancel Google's billing for it, so the route logs every timeout and the limit counts it. |
| Download or extraction failed | `loadSpinFrames` rejects | "Couldn't load the spin." The saved `spinPath` is kept. | Yes, reload only, no new generation |
| Sign-in lost | route 401 | "Sign in to make a 360° spin." | No |

## Testing

New scripts following the existing `scripts/test-*.mts` pattern (real modules through `reshook.mjs`, PASS/FAIL lines, `process.exit(1)` on failure), added to `package.json` and the CI workflow:

- **`test:spin-request`**:
  - the body has the model, two identical images, `duration: "6s"`, 9:16, 720p and `task: image_to_video`;
  - the prompt asks for one full turn with the camera locked off.
- **`test:spin-pacing`**:
  - `turnAngles` is monotonic, starts at 0 and ends at 360;
  - even differences give a linear result, and a run of near-zero differences (the back linger) advances only by the floor;
  - `frameForAngle` wraps negative angles and angles of 360 and above, and picks the nearest frame.
- **`test:outfit-spin`** (modelled on `test-outfit-render.mts`, with its non-vacuity rule):
  - round trip through the real store and `merge`;
  - signed URLs and data URLs rejected by the setter, `normalizeOutfit` and `scrubSnapshotImages`;
  - `duplicateOutfit` drops it;
  - `setOutfitRender` with a new path clears it, and with the same path keeps it.

Manual checks:
- **Prototype route:** `/tryon-360-preview` stays as the design reference until this ships.
- **Device test on a TestFlight build:** `requestVideoFrameCallback` and blob-URL video in WKWebView, extraction time, memory, and the drag feel with a real finger. A desktop browser can't stand in for this.
- **One paid smoke test against production keys (~$0.61):** check that real usage matches the estimate.

## Rollout

`NEXT_PUBLIC_TRYON_SPIN=1` shows the switch; it defaults off. Turn it on in Vercel preview first, then production after the device test.

## Open questions for Ajay

1. **Daily limit:** is 5 spins per account per day right? Should guests get 0, or 1 to try it?
2. **Saving:** is saving automatically (no Save button) acceptable? It's a change from the prototype.
3. **Clip length:** stay at 6 s ($0.61) or test 4 s (~$0.41)? A faster turn may blur. Either way the device keeps 72 frames.
4. **Premium:** should 360° be a premium feature once billing exists?
