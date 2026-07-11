# Phase 0 — Vision-only benchmark (AJA-77)

Measures how far an **Apple-Vision-only** pipeline gets on *your real photos* for the
"selfie → find my clothes" wardrobe scan (epic **AJA-76**). It runs on your Mac with
the **same Vision APIs the iOS app will use**, so accuracy and thresholds transfer.
(Device *timing* is confirmed later in Phase 1 — the Mac runs faster than the phone.)

It answers the two Go/No-Go questions for the lean Vision-first MVP:

1. **Face gate** — can we reliably tell which photos are *you* from an enrolled selfie,
   using Vision face detection + feature-print distance? (Vision has no true face
   embedding, so this measures whether feature-prints are "good enough" or whether we
   need to add a Core ML ArcFace model.)
2. **Garment dedup** — do Vision feature-prints cluster the *same* outfit/garment across
   photos at a usable threshold?

## Requirements
- macOS with Xcode command-line tools (`swift --version`). No Xcode project, no device.

## Steps

1. **Export a sample.** Put ~200 real photos in a folder (`~/wardrobe-bench/photos`),
   including many of **yourself in different outfits**, plus some photos of *other*
   people and non-people shots (screenshots, receipts) so we can measure false
   positives. Also export 3–5 clear **selfies**; pick one as the enrollment selfie.

2. **Create the labeling template:**
   ```bash
   swift vision_bench.swift --photos ~/wardrobe-bench/photos --init-labels labels.json
   ```
   Open `labels.json` and for each photo set:
   - `isMe`: `true` if the photo is of you.
   - `garmentGroup`: give the **same tag** to photos showing the **same garment/outfit**
     (e.g. `"navy-blazer"`), leave `""` if not applicable. This is the dedup ground truth.

3. **Run the benchmark:**
   ```bash
   swift vision_bench.swift \
     --photos ~/wardrobe-bench/photos \
     --selfie ~/wardrobe-bench/me.jpg \
     --labels labels.json \
     --out report.json
   ```

## Reading the report

- **`timingMsPerPhoto`** — p50 / p95 per photo (Mac; phone will be slower).
- **`withFace` / `withPerson`** — how often Vision found a face / person.
- **`faceGate.distanceSweep`** — precision & recall of "is this me?" at each distance
  threshold. **Pick the threshold with high precision (few strangers let in) and
  acceptable recall.** If precision stays low at every threshold → feature-prints are
  not enough and we add a Core ML ArcFace embedding (upgrade path).
- **`dedupClusterSweep`** — number of clusters at each distance. Compare to
  `dedupEval.labeledGarmentGroups` (your ground-truth count of distinct garments) to
  pick the dedup `eps`. Clusters ≫ groups = under-merging; clusters ≪ groups = over-merging.

## Go / No-Go

- **GO (Vision-first)** if face-gate precision ≥ ~0.9 at a recall we can live with, and a
  dedup threshold lands cluster count within ~±20% of the labeled garment count.
- **UPGRADE** (add Core ML ArcFace and/or SegFormer+DINOv2) if either metric is poor —
  the plan in AJA-76 already scopes this as the fallback.

Paste `report.json` (or the summary) back and we'll set the thresholds together.
