/**
 * Background photo-import queue (AJA-236). Detecting garments, cutting them out, and
 * uploading them is slow, so instead of blocking the add screen we enqueue the picked
 * photos here and drain them in the background: the user can close the picker and keep
 * using the app while items pop into the closet one by one, with a progress pill
 * (ImportProgress) reading `importStatus` from the store.
 *
 * The queue is IN-MEMORY only — photo data URLs are large, and persisting them would
 * reintroduce the localStorage-bloat / sync-failure this app already fought (AJA-233).
 * It survives leaving the add screen and switching tabs (module singleton), and resumes
 * when the app returns to the foreground; a full app quit drops any not-yet-started
 * photos (already-added items persist via the normal snapshot sync).
 */
import { App } from "@capacitor/app";
import { detectGarments } from "./detect-garments";
import { useWardrobe, type ImportStatus } from "./store";
import { CATEGORY_LABEL } from "./types";

interface ImportJob {
  id: string;
  dataUrl: string;
}

/** How many photos to detect at once (mirrors the app's existing 2-worker patterns). */
const CONCURRENCY = 2;
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

const emptyStatus = (): ImportStatus => ({
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

/** Re-kick the drain whenever the app returns to the foreground (JS is suspended while
 *  backgrounded, so a queued-but-unstarted photo would otherwise stall until the next add). */
function hookForeground() {
  if (foregroundHooked) return;
  foregroundHooked = true;
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void drain();
  });
}

/** Queue a batch of picked photos and start (or continue) draining in the background. */
export async function enqueueImport(files: File[]) {
  const list = files.slice(0, MAX_PER_BATCH);
  if (!list.length) return;
  cancelled = false;
  hookForeground();

  // Fresh run if idle; otherwise fold this batch into the run in progress.
  const cur = useWardrobe.getState().importStatus;
  const base = cur && cur.running ? cur : emptyStatus();
  useWardrobe.getState().setImportStatus({
    ...base,
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
  queue.length = 0;
  const s = useWardrobe.getState().importStatus;
  if (s) useWardrobe.getState().setImportStatus({ ...s, running: false });
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
    if (s && s.running) useWardrobe.getState().setImportStatus({ ...s, running: false });
  }
}

async function processJob(job: ImportJob) {
  if (cancelled) return;
  const { authUser, addItem } = useWardrobe.getState();
  let added = 0;
  try {
    const detected = await detectGarments(job.dataUrl, authUser?.id ?? null);
    if (cancelled) return; // don't add items for a job that finished after cancel
    for (const g of detected) {
      addItem({
        name: g.name || CATEGORY_LABEL[g.category],
        imageUrl: g.url,
        category: g.category,
        color: g.color,
        colorName: g.colorName,
        tags: g.tags,
        seasons: g.seasons,
        wishlist: false,
      });
      added++;
    }
  } catch {
    /* photo failed — counted as a failure below */
  }
  patchStatus((s) => ({
    ...s,
    done: s.done + 1,
    itemsAdded: s.itemsAdded + added,
    failed: added === 0 ? s.failed + 1 : s.failed,
  }));
}
