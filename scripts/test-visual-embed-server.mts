/**
 * AJA-301 — gate for src/lib/visual-embed-server.ts (Gemini Embedding 2 calls).
 *
 * Run: npm run test:visual-embed-server
 *
 * CI has no Gemini key, so `fetch` is stubbed and every check is about OUR side of the
 * contract: the request we send, how answers map back to images, and that nothing a
 * flaky network or a surprising response does can throw into the route. The request
 * shape was confirmed against the live API once (2026-10-21): `outputDimensionality`
 * at the top of each request gives 768 dims; omitting it gives 3072.
 *
 * `prepImage` runs the real sharp on a repo sample — that part needs no network.
 */
import fs from "node:fs";
import path from "node:path";

const g = globalThis as unknown as Record<string, unknown>;
type Call = { url: string; init: { headers: Record<string, string>; body: string; signal?: AbortSignal } };
let calls: Call[] = [];
let respond: (call: Call) => Promise<unknown> = async () => ({ ok: true, json: async () => ({}) });
g.fetch = (url: string, init: Call["init"]) => {
  const call = { url, init };
  calls.push(call);
  return respond(call);
};

const { embedImages, loadImageBytes, parseEmbedItems, prepImage } = await import("@/lib/visual-embed-server");
const sharp = (await import("sharp")).default;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const vec = (seed: number, dim = 768) => Array.from({ length: dim }, (_, i) => Math.sin(seed * 13 + i));
const answer = (vectors: number[][], status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ embeddings: vectors.map((values) => ({ values })) }),
});
const reset = (fn: typeof respond) => {
  calls = [];
  respond = fn;
};
const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

// ---------------------------------------------------------------------------
console.log("\n=== 1. The request we send ===");
reset(answer([vec(1), vec(2)]));
await embedImages(["AAAA", "BBBB"], "test-key");
const body = calls[0] ? JSON.parse(calls[0].init.body) : null;
ok(calls.length === 1, "one batch call for the whole set", `${calls.length} calls`);
ok(!!calls[0]?.url.endsWith("/models/gemini-embedding-2:batchEmbedContents"), "batchEmbedContents on gemini-embedding-2", calls[0]?.url);
ok(calls[0]?.init.headers["x-goog-api-key"] === "test-key", "key goes in the header, never the URL");
ok(body?.requests?.length === 2, "one sub-request per image (several parts in one request would merge into ONE vector)");
const r0 = body?.requests?.[0];
ok(r0?.model === "models/gemini-embedding-2", "each sub-request names the model (the API requires it)");
ok(r0?.outputDimensionality === 768, "each sub-request asks for 768 dims (omit it and the API answers 3072)");
ok(r0?.content?.parts?.[0]?.inline_data?.mime_type === "image/jpeg" && r0?.content?.parts?.[0]?.inline_data?.data === "AAAA",
  "the image travels as inline JPEG");
ok(calls[0]?.init.signal instanceof AbortSignal, "the call carries a timeout signal");

// ---------------------------------------------------------------------------
console.log("\n=== 2. Answers map back to the right images ===");
reset(answer([vec(1), vec(2)]));
const mapped = await embedImages(["AAAA", null, "BBBB"], "test-key");
ok(mapped.length === 3, "one result per input, in order");
ok(mapped[1] === null, "an image that failed prep stays null…");
ok(JSON.parse(calls[0].init.body).requests.length === 2, "…and is never sent");
ok(!!mapped[0] && !!mapped[2] && Math.abs(mapped[0][5] - mapped[2][5]) > 1e-6,
  "the vector after a skipped image lands on the right image, not shifted by one");
ok(!!mapped[0] && Math.abs(norm(mapped[0]) - 1) < 1e-9, "vectors come back unit-length");

reset(answer([vec(1), vec(2, 3072)]));
const sized = await embedImages(["AAAA", "BBBB"], "test-key");
ok(!!sized[0] && sized[1] === null, "a 3072-dim answer is dropped for that image only");

reset(answer([vec(1)]));
const short = await embedImages(["AAAA", "BBBB"], "test-key");
ok(short.every((x) => x === null), "fewer answers than images → nothing is trusted (no guessing which one is missing)");

reset(answer([vec(1).map((x, i) => (i === 3 ? NaN : x))]));
ok((await embedImages(["AAAA"], "test-key"))[0] === null, "a non-finite value voids that vector");

// ---------------------------------------------------------------------------
console.log("\n=== 3. Nothing throws into the route ===");
reset(answer([], 429));
ok((await embedImages(["AAAA"], "test-key")).every((x) => x === null), "429 → all null");
reset(answer([], 500));
ok((await embedImages(["AAAA"], "test-key")).every((x) => x === null), "500 → all null");
reset(async () => { throw new Error("network down"); });
ok((await embedImages(["AAAA"], "test-key")).every((x) => x === null), "network error → all null");
reset(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }));
ok((await embedImages(["AAAA"], "test-key")).every((x) => x === null), "unparseable body → all null");
reset((call) => new Promise((_, reject) => call.init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
// AbortSignal.timeout's timer is unref'd and this stub holds no socket, so without a
// live handle Node would exit mid-await. A real fetch keeps the loop alive itself.
const keepAlive = setTimeout(() => {}, 5000);
const t0 = Date.now();
const hung = await embedImages(["AAAA"], "test-key", { timeoutMs: 60 });
clearTimeout(keepAlive);
ok(hung.every((x) => x === null) && Date.now() - t0 < 2000, "a hung upstream times out to all null", `${Date.now() - t0}ms`);
reset(answer([vec(1)]));
ok((await embedImages([null, null], "test-key")).every((x) => x === null) && calls.length === 0,
  "nothing preparable → no call at all");
ok((await embedImages(["AAAA"], "")).every((x) => x === null) && calls.length === 0, "no key → no call");

// ---------------------------------------------------------------------------
console.log("\n=== 4. prepImage (real sharp, no network) ===");
const sticker = fs.readFileSync(path.join(process.cwd(), "public/samples/men/grey-tee-sticker.png"));
const srcMeta = await sharp(sticker).metadata();
ok(!!srcMeta.hasAlpha, "precondition: the sample sticker really has transparency", `${srcMeta.width}x${srcMeta.height}`);
const prepped = await prepImage(sticker);
const out = prepped ? await sharp(Buffer.from(prepped, "base64")).metadata() : null;
ok(out?.format === "jpeg", "a transparent cut-out becomes a JPEG", out?.format);
ok(!!out && !out.hasAlpha, "with the transparency flattened (cut-outs and white product shots then compare like for like)");
ok(!!out && Math.max(out.width ?? 0, out.height ?? 0) <= 512, "and at most 512px on its long side", `${out?.width}x${out?.height}`);
ok((await prepImage(Buffer.from("definitely not an image"))) === null, "undecodable bytes → null, not a throw");
const huge = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#fff" } }).png().toBuffer();
ok((await prepImage(huge)) === null, "a decompression bomb (81 MP) is refused before it's decoded");

// ---------------------------------------------------------------------------
console.log("\n=== 5. What the route accepts (untrusted input) ===");
const goodBody = { items: [{ id: "a", src: "https://x.test/a.jpg" }, { id: "b", src: "data:image/png;base64,AAAA" }] };
ok(parseEmbedItems(goodBody)?.length === 2, "positive control: a well-formed batch parses");
ok(parseEmbedItems({ items: Array.from({ length: 17 }, (_, i) => ({ id: `i${i}`, src: "https://x.test/a.jpg" })) }) === null,
  "more than 16 images in one call is refused (one rate-limit unit must stay bounded)");
ok(parseEmbedItems({ items: [] }) === null, "an empty batch is refused");
ok(parseEmbedItems(null) === null && parseEmbedItems("x") === null && parseEmbedItems({}) === null, "non-objects are refused");
ok(parseEmbedItems({ items: [{ id: 1, src: "https://x.test/a.jpg" }] }) === null, "a non-string id is refused");
ok(parseEmbedItems({ items: [{ id: "a".repeat(200), src: "https://x.test/a.jpg" }] }) === null, "an absurd id is refused");
for (const src of ["http://x.test/a.jpg", "file:///etc/passwd", "blob:https://x.test/1", "/samples/a.png", ""]) {
  ok(parseEmbedItems({ items: [{ id: "a", src }] }) === null, `a non-https, non-data source is refused: ${JSON.stringify(src)}`);
}
ok(parseEmbedItems({ items: [{ id: "a", src: "data:image/png;base64," + "A".repeat(600_000) }] }) === null,
  "an oversized inline image is refused before anything is decoded");

console.log("\n=== 6. Loading the image bytes ===");
const tinyPng = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#123456" } }).png().toBuffer();
const asData = `data:image/png;base64,${tinyPng.toString("base64")}`;
const loaded = await loadImageBytes(asData);
ok(!!loaded && Buffer.from(loaded).equals(tinyPng), "a data: image decodes to its exact bytes");
ok((await loadImageBytes("data:text/html;base64,PGgxPmhpPC9oMT4=")) === null, "a data: URL that isn't an image is refused");
ok((await loadImageBytes("data:image/png;base64,")) === null, "an empty data: image is refused");
ok((await loadImageBytes("https://localhost/a.png")) === null, "a private host is refused (safeFetch's SSRF guard), as null not a throw");
ok((await loadImageBytes("https://127.0.0.1/a.png")) === null, "a loopback address is refused");

console.log(`\n${fails === 0 ? "VISUAL EMBED SERVER CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
