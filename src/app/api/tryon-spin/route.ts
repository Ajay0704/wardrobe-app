import type { SupabaseClient } from "@supabase/supabase-js";
import { type ApiUser, requireUser } from "@/lib/auth-server";
import { checkLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { isOwnPrivatePath, RENDERS_BUCKET, spinPathFor } from "@/lib/supabase/private-storage";
import { buildSpinRequest, SPIN_MODEL } from "@/lib/tryon-spin-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The prototype's clip took 27.5s. Leave room to return a real error inside maxDuration. */
const RENDER_TIMEOUT_MS = 50_000;

const GOOGLE_HOST = "generativelanguage.googleapis.com";
const FILM_FAILED = "Couldn't film this look. Try again, or try a different photo.";
/** Held back from maxDuration when downloading a clip by uri: time to store it, retry once and reply. */
const DOWNLOAD_MARGIN_MS = 8_000;

/** Storage refused the upload because the object is already there (bucket has upsert off). */
const alreadyExists = (e: unknown) => {
  const err = e as { status?: number; statusCode?: string; message?: string } | null;
  return err?.status === 409 || err?.statusCode === "409" || /already exists|duplicate/i.test(err?.message ?? "");
};

const STILL_FILMING = "Still filming your spin — reopen 360° in a moment.";
/** A "filming" marker outlives any real make (maxDuration) plus slack. One older than this
 *  was left by a function that died, and is cleared rather than blocking the render forever. */
const CLAIM_TTL_MS = (maxDuration + 15) * 1000;

/**
 * AJA-308 — claim a render's first spin before spending on it, with an empty marker object
 * next to the clip's name. The bucket has upsert off, so only one request can write it:
 *  - "claimed": this request films; it removes the marker when it's done, however it ends.
 *  - "busy": another request is filming this render right now — a retry after the phone
 *    dropped the connection, a double tap, a second device. Without this it would pass the
 *    "already made?" check (nothing is stored until the first one finishes) and pay again.
 *  - "unguarded": storage wouldn't take the marker for some other reason. Film anyway: a
 *    flaky marker must not block a spin the customer asked for.
 */
async function claimFilming(admin: SupabaseClient, marker: string): Promise<"claimed" | "busy" | "unguarded"> {
  const bucket = admin.storage.from(RENDERS_BUCKET);
  const put = () =>
    bucket
      .upload(marker, Buffer.from("filming"), { contentType: "text/plain", upsert: false })
      .then((r) => r.error as unknown, (e: unknown) => e ?? new Error("upload failed"));
  const unguarded = (why: string) => {
    // Logged, because otherwise the guard could switch itself off unseen — e.g. if the bucket
    // were ever given allowed MIME types that refuse the text/plain marker.
    console.log(`[tryon-spin] filming without a claim: ${why}`);
    return "unguarded" as const;
  };
  const err = await put();
  if (!err) return "claimed";
  if (!alreadyExists(err)) return unguarded(`marker refused (${String((err as { message?: string }).message ?? err)})`);
  const info = await bucket.info(marker).then((r) => r.data, () => null);
  const born = Date.parse((info as { createdAt?: string } | null)?.createdAt ?? "");
  if (Number.isFinite(born) && Date.now() - born < CLAIM_TTL_MS) return "busy";
  if (Number.isFinite(born)) {
    // Stale: the request that wrote it is long gone. Clear it and claim afresh.
    await bucket.remove([marker]).then(() => {}, () => {});
  }
  // Stale and cleared, or its age unreadable (most often: the filming request removed it
  // between our upload and our info() — it just finished). Try once more. An age we can't
  // read must never mean "busy": that would block this render's spin for good.
  const retry = await put();
  if (!retry) return "claimed";
  return Number.isFinite(born) && alreadyExists(retry) ? "busy" : unguarded("marker age unreadable");
}

/**
 * AJA-305 — make a 360° spin video from the caller's OWN saved try-on render.
 *
 * Takes a PATH, not image bytes: the spin can only start from a render already in this
 * user's `renders-private` folder, so the route can't be used to animate arbitrary images.
 * Stores the MP4 itself and returns its path.
 *
 * AJA-308 — and stores a render's first spin under ONE name derived from it
 * (`spinPathFor`), so a client that died mid-flight — iOS backgrounding the app during the
 * ~30s make — can get it back: once that clip is stored, a repeat request is answered with
 * it, free, and the client looks for it there too; while it's still being filmed, a repeat
 * request is told so (409), also free. `fresh: true` ("Make a new spin") films again under a
 * random name instead.
 */
export async function POST(request: Request) {
  const routeStart = Date.now();
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Sign in to make a 360° spin." }, { status: 401 });

  // AJA-305 — the flag is the server's switch too, not only the client's: with it off, a
  // merged route must not be callable. Same 501 wording, so the client hides the switch.
  if (process.env.NEXT_PUBLIC_TRYON_SPIN !== "1") {
    return Response.json({ error: "360° isn't configured yet." }, { status: 501 });
  }

  const key = process.env.GEMINI_API_KEY;
  const admin = adminClient();
  if (!key || !admin) {
    // Same sentinel wording as /api/tryon, so the client stops offering a retry.
    return Response.json({ error: "360° isn't configured yet." }, { status: 501 });
  }

  let renderPath: unknown;
  let fresh = false;
  try {
    const body = (await request.json()) as { renderPath?: unknown; fresh?: unknown };
    renderPath = body.renderPath;
    fresh = body.fresh === true;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!isOwnPrivatePath(renderPath, user.id)) {
    return Response.json({ error: "That isn't one of your try-on photos." }, { status: 400 });
  }

  // AJA-308 — a repeat request for a render's first spin, once that spin is stored, gets the
  // clip that's already paid for. Before the download and the limit: answering it costs
  // nothing. A failed lookup just means "film it" (the claim below still guards that).
  const firstSpinPath = spinPathFor(renderPath)!; // non-null: isOwnPrivatePath implies a render path
  if (!fresh) {
    const found = await admin.storage
      .from(RENDERS_BUCKET)
      .exists(firstSpinPath)
      .then((r) => r.data === true, () => false);
    if (found) {
      console.log("[tryon-spin] returned the render's existing spin; nothing filmed");
      return Response.json({ path: firstSpinPath });
    }
  }

  // The download is a free, own-path-only read, so it comes BEFORE the limit: a missing
  // render, a storage hiccup or a non-image path must not burn one of the day's spins.
  const { data: file, error: dlError } = await admin.storage.from(RENDERS_BUCKET).download(renderPath);
  if (dlError || !file) {
    return Response.json({ error: "This look's photo is gone — make a new try-on first." }, { status: 404 });
  }
  // `isRenderPath` also admits the user's own .mp4 spins; only a photo can be filmed.
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "That isn't one of your try-on photos." }, { status: 400 });
  }

  // AJA-308 — a first spin claims its render before anything is spent, so a second request
  // while it's filming is turned away free instead of filming the same spin again.
  const marker = `${firstSpinPath.slice(0, -".mp4".length)}.pending`;
  const claim = fresh ? "unguarded" : await claimFilming(admin, marker);
  if (claim === "busy") {
    console.log("[tryon-spin] this render's spin is already being filmed; nothing filmed");
    return Response.json({ error: STILL_FILMING }, { status: 409 });
  }
  try {
    if (claim === "claimed") {
      // The request this one waited behind may have stored its clip and dropped its marker
      // during our download, after the "already made?" check above. Look once more before
      // paying; the finally still removes our marker.
      const landed = await admin.storage
        .from(RENDERS_BUCKET)
        .exists(firstSpinPath)
        .then((r) => r.data === true, () => false);
      if (landed) {
        console.log("[tryon-spin] the render's spin landed while claiming; nothing filmed");
        return Response.json({ path: firstSpinPath });
      }
    }
    return await filmAndStore({ user, key, admin, file, fresh, firstSpinPath, routeStart });
  } finally {
    if (claim === "claimed") await admin.storage.from(RENDERS_BUCKET).remove([marker]).then(() => {}, () => {});
  }
}

/** The limit, the paid call and the upload: everything that spends, behind the claim above. */
async function filmAndStore({
  user,
  key,
  admin,
  file,
  fresh,
  firstSpinPath,
  routeStart,
}: {
  user: ApiUser;
  key: string;
  admin: SupabaseClient;
  file: Blob;
  fresh: boolean;
  firstSpinPath: string;
  routeStart: number;
}): Promise<Response> {
  // Spend the budget only for a request that can actually be made.
  const rl = await checkLimit(user, "spin");
  if (!rl.ok) {
    return Response.json(
      { error: "That's today's 5 spins — try again tomorrow." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const front = {
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mimeType: file.type,
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

  // Flat paths only: `isRenderPath` allows exactly one slash. A first spin goes to the
  // render's own name (AJA-308) so it can be found again — on BOTH attempts: if attempt 1
  // timed out after the object was actually written, a random name on attempt 2 would leave
  // the findable clip orphaned and attach a copy; retrying the name turns that into
  // "already exists", which is success. A fresh spin goes to a random `<userId>/<uuid>.mp4`,
  // new on each attempt (no update policy, upsert off). The clip is already paid for, so try
  // twice before giving it up, and say so in the log.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const named = !fresh;
    const path = named ? firstSpinPath : `${user.id}/${crypto.randomUUID()}.mp4`;
    let upError: unknown = null;
    try {
      ({ error: upError } = await admin.storage
        .from(RENDERS_BUCKET)
        .upload(path, bytes, { contentType: "video/mp4", upsert: false }));
    } catch (e) {
      upError = e;
    }
    if (!upError) return Response.json({ path });
    // The render's clip is already there — this request's own attempt 1 landed after all, or
    // (if the claim was "unguarded") another request stored it first. Either way it's a spin
    // of this very render, so it's the answer.
    if (named && alreadyExists(upError)) {
      console.log("[tryon-spin] the render's spin is already stored; returning it");
      return Response.json({ path: firstSpinPath });
    }
    console.log(`[tryon-spin] upload attempt ${attempt} failed (${bytes.length} bytes): ${upError instanceof Error ? upError.message : JSON.stringify(upError)}`);
  }
  return Response.json({ error: "Made the spin but couldn't save it. Try again." }, { status: 502 });
}
