/**
 * Background photo-import queue (AJA-236/237). Detecting garments, cutting them out, and
 * uploading them is slow, so we never block the add screen. Two background phases, both
 * surfaced by the ImportProgress pill via the store's `importStatus`:
 *
 *   1. EXTRACT — `enqueueImport(files)`: detect garments in each picked photo and drop each
 *      cutout into the `pendingImports` review buffer (NOT straight into the closet).
 *   2. COMMIT  — `commitPending(picks)`: after the user reviews (ImportReviewSheet), add the
 *      selected cutouts to the closet, beautifying the ones they flagged (slow → backgrounded).
 *
 * The queue is IN-MEMORY only — photo data URLs are large, and persisting them would
 * reintroduce the localStorage-bloat / sync-failure this app already fought (AJA-233). It
 * survives leaving the add screen and switching tabs (module singleton) and resumes when the
 * app returns to the foreground; a full app quit drops any not-yet-processed work.
 */
import { App } from "@capacitor/app";
import { AUTO_BEAUTIFY_CATEGORIES, beautify } from "./beautify";
import { detectGarments } from "./detect-garments";
import { useWardrobe, type ImportStatus, type PendingImport } from "./store";
import { readAnalyzedAttrs, type AnalyzedAttrs } from "./analyze-attrs";
import { backfillPatch, bestAnalyzeSource, needsBackfill } from "./backfill-attrs";
import { authHeaders } from "./supabase/client";
import { CATEGORY_LABEL } from "./types";

interface ImportJob {
  id: string;
  dataUrl: string;
}

/** Process ONE photo at a time in the background so the on-device cutout (imgly WASM) doesn't
 *  starve the phone's cores and jank the UI while the user keeps using the app (AJA-237). */
const CONCURRENCY = 1;
/** Safety cap per enqueue call (the pickers already limit selection). */
const MAX_PER_BATCH = 30;

const queue: ImportJob[] = [];
let active = 0;
let cancelled = false;
let foregroundHooked = false;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read-failed"));
    r.readAsDataURL(file);
  });

const emptyStatus = (phase: ImportStatus["phase"]): ImportStatus => ({
  phase,
  total: 0,
  done: 0,
  failed: 0,
  itemsAdded: 0,
  running: true,
});

function patchStatus(fn: (s: ImportStatus) => ImportStatus) {
  const s = useWardrobe.getState().importStatus;
  if (!s) return;
  useWardrobe.getState().setImportStatus(fn(s));
}

/** Append a detected garment to the review buffer (read-fresh so concurrent workers don't clobber). */
function addPending(item: PendingImport) {
  const s = useWardrobe.getState();
  s.setPendingImports([...s.pendingImports, item]);
}

/** Re-kick the drain whenever the app returns to the foreground (JS is suspended while
 *  backgrounded, so a queued-but-unstarted photo would otherwise stall until the next add). */
function hookForeground() {
  if (foregroundHooked) return;
  foregroundHooked = true;
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void drain();
  });
}

/** EXTRACT phase — queue picked photos and detect their garments into the review buffer. */
export async function enqueueImport(files: File[]) {
  const list = files.slice(0, MAX_PER_BATCH);
  if (!list.length) return;
  cancelled = false;
  hookForeground();

  // Fresh run if idle; otherwise fold this batch into the extract run in progress.
  const cur = useWardrobe.getState().importStatus;
  const base = cur && cur.running && cur.phase === "extract" ? cur : emptyStatus("extract");
  useWardrobe.getState().setImportStatus({
    ...base,
    phase: "extract",
    total: base.total + list.length,
    running: true,
  });

  for (const file of list) {
    try {
      const dataUrl = await fileToDataUrl(file);
      queue.push({ id: uid(), dataUrl });
      void drain();
    } catch {
      // Couldn't even read the file → count it as a finished failure.
      patchStatus((s) => ({ ...s, done: s.done + 1, failed: s.failed + 1 }));
    }
  }
  void drain();
}

/** Stop the queue: clear anything not yet started (in-flight detections can't be aborted). */
export function cancelImports() {
  cancelled = true;
  backfillCancelled = true;
  queue.length = 0;
  const s = useWardrobe.getState().importStatus;
  if (s) useWardrobe.getState().setImportStatus({ ...s, running: false });
}

/**
 * Re-read the photos of items that predate auto-fill and write the attributes they're
 * missing (AJA-247). Gap-fill only, and the gaps are recomputed at WRITE time rather than
 * when the run starts, so a value typed while the pass is in flight is never clobbered.
 *
 * Reads the item list fresh each iteration for the same reason. Network-bound rather than
 * CPU-bound (no cutout, no WASM), so it can run wider than the photo import's CONCURRENCY 1.
 */
const BACKFILL_CONCURRENCY = 3;
let backfillCancelled = false;

async function analyzeAttrs(url: string): Promise<AnalyzedAttrs | null> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: url }),
    });
    if (!res.ok) return null;
    return readAnalyzedAttrs((await res.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function runAttributeBackfill(): Promise<void> {
  if (useWardrobe.getState().importStatus?.running) return; // one background job at a time
  backfillCancelled = false;
  const ids = useWardrobe.getState().items.filter(needsBackfill).map((it) => it.id);
  if (!ids.length) return;

  useWardrobe.getState().setImportStatus({ ...emptyStatus("backfill"), total: ids.length });

  let i = 0;
  const worker = async () => {
    while (!backfillCancelled && i < ids.length) {
      const id = ids[i++];
      // Fresh read: the item may have been edited or deleted since the run began.
      const item = useWardrobe.getState().items.find((x) => x.id === id);
      const source = item ? bestAnalyzeSource(item) : null;
      let filled = false;
      if (item && source) {
        const attrs = await analyzeAttrs(source.url);
        if (attrs && !backfillCancelled) {
          const live = useWardrobe.getState().items.find((x) => x.id === id);
          if (live) {
            const patch = backfillPatch(live, attrs, source.trustBrand);
            if (Object.keys(patch).length) {
              useWardrobe.getState().updateItem(id, patch);
              filled = true;
            }
          }
        }
      }
      patchStatus((s) => ({
        ...s,
        done: s.done + 1,
        failed: filled ? s.failed : s.failed + 1,
        itemsAdded: filled ? s.itemsAdded + 1 : s.itemsAdded,
      }));
    }
  };
  await Promise.all(Array.from({ length: BACKFILL_CONCURRENCY }, () => worker()));

  const s = useWardrobe.getState().importStatus;
  if (s && s.running) useWardrobe.getState().setImportStatus({ ...s, running: false });
}

/** Drop the whole review buffer without adding anything (Discard / dismiss). */
export function discardPending() {
  useWardrobe.getState().setPendingImports([]);
  useWardrobe.getState().setImportReviewOpen(false);
  useWardrobe.getState().setImportStatus(null);
}

async function drain() {
  while (!cancelled && active < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    active++;
    void processJob(job).finally(() => {
      active--;
      void drain();
    });
  }
  if (!queue.length && active === 0) {
    const s = useWardrobe.getState().importStatus;
    if (s && s.running && s.phase === "extract") {
      useWardrobe.getState().setImportStatus({ ...s, running: false });
    }
  }
}

async function processJob(job: ImportJob) {
  if (cancelled) return;
  const userId = useWardrobe.getState().authUser?.id ?? null;
  let found = 0;
  try {
    const detected = await detectGarments(job.dataUrl, userId, 1); // 1 cutout at a time → smoother UI
    if (cancelled) return; // don't buffer items for a job that finished after cancel
    for (const g of detected) {
      addPending({
        // Spread first so the explicit fields below always win. `g` carries the attribute
        // set (brand, material, pattern, ...) that used to stop here (AJA-246).
        ...readAnalyzedAttrs(g as unknown as Record<string, unknown>),
        id: uid(),
        cutoutUrl: g.url,
        name: g.name || CATEGORY_LABEL[g.category],
        category: g.category,
        color: g.color,
        colorName: g.colorName,
        tags: g.tags,
        seasons: g.seasons,
      });
      found++;
    }
  } catch {
    /* photo failed — counted as a failure below */
  }
  patchStatus((s) => ({
    ...s,
    done: s.done + 1,
    failed: found === 0 ? s.failed + 1 : s.failed,
  }));
}

/**
 * COMMIT phase — add the reviewed picks to the closet, beautifying the flagged ones. Runs in the
 * background (beautify is a slow generative pipeline) so the user can walk away; items pop into the
 * closet as each finishes. Deselected candidates are discarded with the buffer.
 */
export async function commitPending(picks: { id: string; beautify: boolean }[]) {
  const buffer = useWardrobe.getState().pendingImports;
  const byId = new Map(buffer.map((p) => [p.id, p] as const));
  const jobs = picks
    .map((pk) => ({ item: byId.get(pk.id), beautify: pk.beautify }))
    .filter((j): j is { item: PendingImport; beautify: boolean } => !!j.item);

  // Selected items leave the review buffer; deselected ones are discarded with it.
  useWardrobe.getState().setPendingImports([]);
  useWardrobe.getState().setImportReviewOpen(false);

  if (!jobs.length) {
    useWardrobe.getState().setImportStatus(null);
    return;
  }

  cancelled = false;
  hookForeground();
  useWardrobe.getState().setImportStatus({
    phase: "commit",
    total: jobs.length,
    done: 0,
    failed: 0,
    itemsAdded: 0,
    running: true,
  });

  let ci = 0;
  const worker = async () => {
    while (!cancelled && ci < jobs.length) {
      const job = jobs[ci++];
      await commitOne(job.item, job.beautify);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const s = useWardrobe.getState().importStatus;
  if (s && s.running) useWardrobe.getState().setImportStatus({ ...s, running: false });
}

async function commitOne(p: PendingImport, wantBeautify: boolean) {
  const { authUser, addItem } = useWardrobe.getState();
  const base = {
    ...readAnalyzedAttrs(p as unknown as Record<string, unknown>),
    name: p.name || CATEGORY_LABEL[p.category],
    category: p.category,
    color: p.color,
    colorName: p.colorName,
    tags: p.tags,
    seasons: p.seasons,
    wishlist: false,
  };
  try {
    if (wantBeautify && AUTO_BEAUTIFY_CATEGORIES.has(p.category)) {
      try {
        const res = await beautify(p.cutoutUrl, authUser?.id ?? null, p.category);
        addItem({
          ...base,
          imageUrl: res.url,
          cutoutImageUrl: p.cutoutUrl, // keep the pre-beautify cutout for a later regenerate
          beautifiedImageUrl: res.url,
          beautifyWhiteUrl: res.whiteUrl,
          beautifyModel: res.model,
        });
      } catch {
        addItem({ ...base, imageUrl: p.cutoutUrl }); // beautify failed → keep the plain cutout
      }
    } else {
      addItem({ ...base, imageUrl: p.cutoutUrl });
    }
  } finally {
    patchStatus((s) => ({ ...s, done: s.done + 1, itemsAdded: s.itemsAdded + 1 }));
  }
}
