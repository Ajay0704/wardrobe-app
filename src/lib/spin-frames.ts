/**
 * AJA-305 — turn a spin MP4 into frames the turntable can draw, on the device.
 *
 * WHY NOT SEEK THE VIDEO WHILE DRAGGING: the model's MP4 has ONE keyframe in 144 frames, so
 * every seek decodes from the start — it stutters, worst in WKWebView. Instead the clip is
 * played once (muted, 2×) and frames are captured as they're presented, which decodes it
 * front to back exactly once.
 *
 * WHY JPEG <img>s, NOT ImageBitmaps: 72 decoded 480×640 bitmaps hold ~88MB, a real risk in
 * WKWebView. ~15KB JPEGs are decoded on demand by the browser.
 *
 * WHY A BLOB URL: drawing a cross-origin <video> taints the canvas and `toBlob` throws
 * SecurityError. Fetching to a Blob first makes it same-origin, and gives download progress.
 *
 * `onload`, never `img.decode()` — decode() never settles in the desktop app's browser pane.
 */
import { turnAngles } from "./spin-pacing";

export const SPIN_FRAMES = 72;
const OUT_W = 480;
const OUT_H = 640;
const THUMB_W = 24;
const THUMB_H = 32;

export interface SpinFrames {
  images: HTMLImageElement[];
  /** One per image, 0 → 360, from `turnAngles`. */
  angles: number[];
  /** Revoke every blob URL. Call when the screen closes. */
  release(): void;
}

const FAIL = "Couldn't load the spin.";
const DOWNLOAD_TIMEOUT_MS = 30000;
const LOAD_TIMEOUT_MS = 10000;
const SEEK_TIMEOUT_MS = 3000;
const PLAY_SLACK_MS = 4000;
const PLAYBACK_RATE = 2;

async function download(url: string, onProgress: (f: number) => void): Promise<Blob> {
  // One timer covers the fetch AND the body reads: abort() makes both reject.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(FAIL);
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (total) onProgress(Math.min(1, got / total));
    }
    return new Blob(chunks as BlobPart[], { type: "video/mp4" });
  } catch {
    throw new Error(FAIL);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves on `event`, rejects on the element's `error` or after `ms`. Always removes
 *  its listeners and timer, so nothing is left to fire later. */
const waitFor = (el: HTMLElement, event: string, ms: number) =>
  new Promise<void>((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
      fn();
    };
    const onEvent = () => done(resolve);
    const onError = () => done(() => reject(new Error(FAIL)));
    const timer = setTimeout(() => done(() => reject(new Error(FAIL))), ms);
    el.addEventListener(event, onEvent);
    el.addEventListener("error", onError);
  });

/** Fit a 9:16 frame into 3:4 by stretching its outermost columns outward. Bars and a
 *  blurred fill both showed a seam in the prototype; a smear doesn't. */
function fit(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const w = Math.round((OUT_H * video.videoWidth) / video.videoHeight);
  const x0 = Math.round((OUT_W - w) / 2);
  ctx.drawImage(video, x0, 0, w, OUT_H);
  if (x0 > 0) {
    // Smoothing OFF for the smear: bilinear sampling blends in the column just outside the
    // 1px source rect (transparent black on frame 0, the previous frame's fill after that).
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ctx.canvas, x0, 0, 1, OUT_H, 0, 0, x0, OUT_H);
    ctx.drawImage(ctx.canvas, x0 + w - 1, 0, 1, OUT_H, x0 + w, 0, OUT_W - x0 - w, OUT_H);
    ctx.imageSmoothingEnabled = true;
  }
}

function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (a.length / 4);
}

/** Plain boolean, not a type guard: TS's DOM lib already declares rVFC, so an inline
 *  `in` check would narrow the seek fallback's `video` to `never`. */
const hasFrameCallback = (v: HTMLVideoElement): boolean => "requestVideoFrameCallback" in v;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(FAIL));
    img.src = src;
  });

export async function loadSpinFrames(
  url: string,
  onProgress: (fraction: number) => void,
): Promise<SpinFrames> {
  const blob = await download(url, (f) => onProgress(f * 0.5));
  const videoUrl = URL.createObjectURL(blob);
  const frameUrls: string[] = [];
  const release = () => {
    URL.revokeObjectURL(videoUrl);
    frameUrls.forEach((u) => URL.revokeObjectURL(u));
  };

  // Attached (hidden): iOS may not load, or deliver rVFC to, a detached video.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  const disposeVideo = () => {
    video.pause();
    video.removeAttribute("src");
    video.load(); // frees the decoder
    video.remove();
  };

  try {
    document.body.appendChild(video);
    // `loadedmetadata`, NOT `loadeddata`. Measured in iOS WebKit (simulator Safari, the
    // WKWebView engine): a preload=auto video stops at metadata (readyState 1) and suspends;
    // `loadeddata` only fires once play() is called. Waiting for it here — before the play()
    // below — hung every extraction until the 10s timeout. Duration and size, all this
    // needs, are known at metadata; the frames arrive with play().
    const loaded = waitFor(video, "loadedmetadata", LOAD_TIMEOUT_MS);
    video.src = videoUrl;
    await loaded;
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw new Error(FAIL);

    const out = document.createElement("canvas");
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext("2d")!;
    const thumb = document.createElement("canvas");
    thumb.width = THUMB_W;
    thumb.height = THUMB_H;
    const tctx = thumb.getContext("2d", { willReadFrequently: true })!;

    const targets = Array.from({ length: SPIN_FRAMES }, (_, i) => (i / SPIN_FRAMES) * video.duration);
    const blobs: Promise<Blob | null>[] = [];
    const diffs: number[] = [];
    let prev: Uint8ClampedArray | null = null;
    let next = 0; // targets captured so far; shared so the seek fallback resumes, not restarts

    // Synchronous on purpose: `toBlob` snapshots the canvas when it's CALLED, so the next
    // frame can be drawn before this one has finished encoding.
    const capture = () => {
      fit(ctx, video);
      tctx.drawImage(out, 0, 0, THUMB_W, THUMB_H);
      const px = tctx.getImageData(0, 0, THUMB_W, THUMB_H).data;
      diffs.push(prev ? meanAbsDiff(prev, px) : 0);
      prev = px;
      blobs.push(new Promise((r) => out.toBlob(r, "image/jpeg", 0.82)));
      next += 1;
      onProgress(0.5 + 0.45 * (blobs.length / SPIN_FRAMES));
    };

    /** One play-through. true = every target captured; false = gave up (watchdog or
     *  play() rejected) so the caller should seek the rest; rejects on a video error or
     *  a throw inside the callbacks. */
    const playThrough = () =>
      new Promise<boolean>((resolve, reject) => {
        let settled = false;
        let handle = 0;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          video.removeEventListener("ended", onEnded);
          video.removeEventListener("error", onError);
          video.cancelVideoFrameCallback?.(handle);
          fn();
        };
        const onFrame = (_now: number, meta: { mediaTime: number }) => {
          if (settled) return;
          try {
            while (next < targets.length && meta.mediaTime + 1 / 48 >= targets[next]) capture();
            if (next >= targets.length) finish(() => resolve(true));
            else handle = video.requestVideoFrameCallback(onFrame);
          } catch (e) {
            finish(() => reject(e));
          }
        };
        const onEnded = () => {
          try {
            while (next < targets.length) capture();
            finish(() => resolve(true));
          } catch (e) {
            finish(() => reject(e));
          }
        };
        const onError = () => finish(() => reject(new Error(FAIL)));
        const timer = setTimeout(
          () => finish(() => resolve(false)),
          (video.duration / PLAYBACK_RATE) * 1000 + PLAY_SLACK_MS,
        );
        video.addEventListener("ended", onEnded);
        video.addEventListener("error", onError);
        handle = video.requestVideoFrameCallback(onFrame);
        video.playbackRate = PLAYBACK_RATE;
        video.play().catch(() => finish(() => resolve(false)));
      });

    if (hasFrameCallback(video)) {
      await playThrough();
      video.pause();
    }
    // Seek whatever is left: all of it when rVFC is absent, the tail if the pass gave up.
    while (next < targets.length) {
      const seeked = waitFor(video, "seeked", SEEK_TIMEOUT_MS);
      video.currentTime = targets[next];
      await seeked;
      capture();
    }

    const jpegs = await Promise.all(blobs);
    const images = await Promise.all(
      jpegs.map((b) => {
        if (!b) throw new Error(FAIL);
        const u = URL.createObjectURL(b);
        frameUrls.push(u);
        return loadImage(u);
      }),
    );
    onProgress(1);
    URL.revokeObjectURL(videoUrl); // the frames don't need the video any more
    return { images, angles: turnAngles(diffs), release };
  } catch (e) {
    release();
    throw e;
  } finally {
    disposeVideo();
  }
}
