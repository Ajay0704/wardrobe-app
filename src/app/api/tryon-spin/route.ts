import { requireUser } from "@/lib/auth-server";
import { checkLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { isOwnPrivatePath, RENDERS_BUCKET } from "@/lib/supabase/private-storage";
import { buildSpinRequest, SPIN_MODEL } from "@/lib/tryon-spin-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The prototype's clip took 27.5s. Leave room to return a real error inside maxDuration. */
const RENDER_TIMEOUT_MS = 50_000;

const GOOGLE_HOST = "generativelanguage.googleapis.com";
const FILM_FAILED = "Couldn't film this look. Try again, or try a different photo.";
/** Held back from maxDuration when downloading a clip by uri: time to store it, retry once and reply. */
const DOWNLOAD_MARGIN_MS = 8_000;

/**
 * AJA-305 — make a 360° spin video from the caller's OWN saved try-on render.
 *
 * Takes a PATH, not image bytes: the spin can only start from a render already in this
 * user's `renders-private` folder, so the route can't be used to animate arbitrary images.
 * Stores the MP4 itself and returns its path, so a client that closes mid-flight still
 * leaves a saved clip rather than a paid one that was thrown away.
 */
export async function POST(request: Request) {
  const routeStart = Date.now();
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Sign in to make a 360° spin." }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  const admin = adminClient();
  if (!key || !admin) {
    // Same sentinel wording as /api/tryon, so the client stops offering a retry.
    return Response.json({ error: "360° isn't configured yet." }, { status: 501 });
  }

  let renderPath: unknown;
  try {
    renderPath = ((await request.json()) as { renderPath?: unknown }).renderPath;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!isOwnPrivatePath(renderPath, user.id)) {
    return Response.json({ error: "That isn't one of your try-on photos." }, { status: 400 });
  }

  // Spend the budget only for a request that can actually be made.
  const rl = await checkLimit(user, "spin");
  if (!rl.ok) {
    return Response.json(
      { error: "That's today's 5 spins — try again tomorrow." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { data: file, error: dlError } = await admin.storage.from(RENDERS_BUCKET).download(renderPath);
  if (dlError || !file) {
    return Response.json({ error: "This look's photo is gone — make a new try-on first." }, { status: 404 });
  }
  const front = {
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mimeType: file.type || "image/jpeg",
  };

  const started = Date.now();
  let resp: Response;
  try {
    resp = await fetch(`https://${GOOGLE_HOST}/v1beta/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(buildSpinRequest(front)),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    // Aborting our side may not cancel Google's billing — log every one.
    console.log(`[tryon-spin] ${timedOut ? "timeout" : "network error"} after ${Date.now() - started}ms`);
    return timedOut
      ? Response.json({ error: "That took too long. Try again." }, { status: 504 })
      : Response.json({ error: "Couldn't reach the video service." }, { status: 502 });
  }

  // The 50s signal stays live while the body streams, so reading it can time out or break too.
  // Same mapping as the fetch above: timeout → 504, anything else → 502, both logged.
  const bodyFailure = (e: unknown, what: string) => {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    console.log(`[tryon-spin] ${timedOut ? "timeout" : "error"} ${what} after ${Date.now() - started}ms: ${String(e)}`);
    return timedOut
      ? Response.json({ error: "That took too long. Try again." }, { status: 504 })
      : Response.json({ error: FILM_FAILED }, { status: 502 });
  };

  if (!resp.ok) {
    let detail: string;
    try {
      detail = (await resp.text()).slice(0, 400);
    } catch (e) {
      return bodyFailure(e, "reading error body");
    }
    return Response.json({ error: FILM_FAILED, detail }, { status: 502 });
  }

  let json: {
    usage?: { total_output_tokens?: number };
    steps?: Array<{ content?: Array<{ type?: string; data?: string; uri?: string }> }>;
  };
  try {
    json = await resp.json();
  } catch (e) {
    return bodyFailure(e, "reading response body");
  }
  console.log(
    `[tryon-spin] ${SPIN_MODEL} ${Date.now() - started}ms, ${json.usage?.total_output_tokens ?? "?"} output tokens`,
  );

  const video = json.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === "video");
  let bytes: Buffer | null = null;
  if (video?.data) bytes = Buffer.from(video.data, "base64");
  else if (video?.uri) {
    // The key is attached only to Google's own host, never to whatever URL a response names.
    let uri: URL | null = null;
    try {
      uri = new URL(video.uri);
    } catch {
      uri = null;
    }
    if (!uri || uri.protocol !== "https:" || uri.hostname !== GOOGLE_HOST) {
      console.log(`[tryon-spin] refused video uri host ${uri?.hostname ?? "(unparseable)"}`);
      return Response.json({ error: FILM_FAILED }, { status: 502 });
    }
    // What's left of maxDuration, measured from the route's start, less room to store the clip.
    const remaining = maxDuration * 1000 - (Date.now() - routeStart) - DOWNLOAD_MARGIN_MS;
    if (remaining < 1_000) {
      console.log(`[tryon-spin] no time left to download the clip (${remaining}ms)`);
      return Response.json({ error: "That took too long. Try again." }, { status: 504 });
    }
    try {
      const v = await fetch(uri, {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(remaining),
      });
      if (v.ok) bytes = Buffer.from(await v.arrayBuffer());
      else console.log(`[tryon-spin] video download failed: ${v.status}`);
    } catch (e) {
      return bodyFailure(e, "downloading video");
    }
  }
  if (!bytes) {
    return Response.json({ error: FILM_FAILED }, { status: 502 });
  }

  // Flat `<userId>/<uuid>.mp4`: `isRenderPath` allows exactly one slash. The bucket has no
  // update policy and upsert is off, so a retry must use a NEW path. The clip is already paid
  // for, so try twice before giving it up, and say so in the log.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const path = `${user.id}/${crypto.randomUUID()}.mp4`;
    let upError: unknown = null;
    try {
      ({ error: upError } = await admin.storage
        .from(RENDERS_BUCKET)
        .upload(path, bytes, { contentType: "video/mp4", upsert: false }));
    } catch (e) {
      upError = e;
    }
    if (!upError) return Response.json({ path });
    console.log(`[tryon-spin] upload attempt ${attempt} failed (${bytes.length} bytes): ${upError instanceof Error ? upError.message : JSON.stringify(upError)}`);
  }
  return Response.json({ error: "Made the spin but couldn't save it. Try again." }, { status: 502 });
}
