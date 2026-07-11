import { NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import path from "path";

async function ingest(body: Record<string, unknown>, reqUrl: string) {
  const line = JSON.stringify({
    ...body,
    receivedAt: Date.now(),
    via: "api/debug-log",
    reqUrl,
  });
  // Use error so it surfaces in Vercel runtime error/log UIs
  console.error("[debug-258aca]", line);

  if (!process.env.VERCEL) {
    try {
      const dir = path.join(process.cwd(), ".cursor");
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, "debug-258aca.log"), `${line}\n`);
    } catch (err) {
      console.warn("[debug-258aca] file write failed", err);
    }
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = { parseError: true };
  }
  const url = new URL(req.url);
  body.queryH = url.searchParams.get("h");
  body.queryM = url.searchParams.get("m");
  body.queryD = url.searchParams.get("d");
  body.queryLoc = url.searchParams.get("loc");
  await ingest(body, req.url);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  await ingest(
    {
      method: "GET",
      h: url.searchParams.get("h"),
      m: url.searchParams.get("m"),
      d: url.searchParams.get("d"),
      loc: url.searchParams.get("loc"),
    },
    req.url,
  );
  return NextResponse.json({ ok: true });
}
