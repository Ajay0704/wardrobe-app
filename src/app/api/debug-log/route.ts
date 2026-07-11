import { NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Debug-mode ingest for Capacitor/iPhone (same-origin HTTPS).
 * Locally also appends NDJSON to the Cursor debug log file.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = { parseError: true };
  }

  const line = JSON.stringify({
    ...body,
    receivedAt: Date.now(),
    via: "api/debug-log",
  });

  console.log("[debug-258aca]", line);

  // Local next only — Vercel has no workspace log file.
  if (!process.env.VERCEL) {
    try {
      const dir = path.join(process.cwd(), ".cursor");
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, "debug-258aca.log"), `${line}\n`);
    } catch (err) {
      console.warn("[debug-258aca] file write failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
