import { requireUser } from "@/lib/auth-server";
import { checkLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { isOwnPrivatePath, RENDERS_BUCKET } from "@/lib/supabase/private-storage";
import { buildSpinRequest, SPIN_MODEL } from "@/lib/tryon-spin-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The prototype's clip took 27.5s. Leave room to return a real error inside maxDuration. */
const RENDER_TIMEOUT_MS = 50_000;

/**
 * AJA-305 — make a 360° spin video from the caller's OWN saved try-on render.
 *
 * Takes a PATH, not image bytes: the spin can only start from a render already in this
 * user's `renders-private` folder, so the route can't be used to animate arbitrary images.
 * Stores the MP4 itself and returns its path, so a client that closes mid-flight still
 * leaves a saved clip rather than a paid one that was thrown away.
 */
export async function POST(request: Request) {
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
    resp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
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

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 400);
    return Response.json(
      { error: "Couldn't film this look. Try again, or try a different photo.", detail },
      { status: 502 },
    );
  }

  const json = (await resp.json()) as {
    usage?: { total_output_tokens?: number };
    steps?: Array<{ content?: Array<{ type?: string; data?: string; uri?: string }> }>;
  };
  console.log(
    `[tryon-spin] ${SPIN_MODEL} ${Date.now() - started}ms, ${json.usage?.total_output_tokens ?? "?"} output tokens`,
  );

  const video = json.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === "video");
  let bytes: Buffer | null = null;
  if (video?.data) bytes = Buffer.from(video.data, "base64");
  else if (video?.uri) {
    const v = await fetch(video.uri, { headers: { "x-goog-api-key": key } });
    if (v.ok) bytes = Buffer.from(await v.arrayBuffer());
  }
  if (!bytes) {
    return Response.json(
      { error: "Couldn't film this look. Try again, or try a different photo." },
      { status: 502 },
    );
  }

  // Flat `<userId>/<uuid>.mp4`: `isRenderPath` allows exactly one slash.
  const path = `${user.id}/${crypto.randomUUID()}.mp4`;
  const { error: upError } = await admin.storage
    .from(RENDERS_BUCKET)
    .upload(path, bytes, { contentType: "video/mp4", upsert: false });
  if (upError) {
    return Response.json({ error: "Made the spin but couldn't save it. Try again." }, { status: 502 });
  }
  return Response.json({ path });
}
