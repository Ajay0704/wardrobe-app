#!/usr/bin/env swift
// Phase 0 (AJA-77) benchmark: measure how far an Apple-Vision-only pipeline gets
// on a folder of real photos, for the "selfie -> find my clothes" wardrobe scan.
// Runs on macOS with the SAME Vision APIs the iOS app will use, so accuracy and
// thresholds transfer (device timing is confirmed later in Phase 1).
//
// Usage:
//   swift vision_bench.swift --photos <dir> [--selfie <img>] [--labels labels.json] [--out report.json]
//   swift vision_bench.swift --photos <dir> --init-labels labels.json   # write a labeling template
//
// Measures: face/person detection rate + timing; a "is this me?" score for each
// photo (feature-print distance from its face crops to the selfie); and garment
// dedup behaviour via a feature-print distance threshold sweep. With --labels it
// reports face-gate precision/recall and dedup cluster purity per threshold.

import Foundation
import Vision
import ImageIO
import CoreGraphics

// MARK: - args
func argValue(_ name: String) -> String? {
    let a = CommandLine.arguments
    guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
    return a[i + 1]
}
guard let photosDir = argValue("--photos") else {
    FileHandle.standardError.write(Data("error: --photos <dir> is required\n".utf8))
    exit(2)
}
let selfiePath = argValue("--selfie")
let labelsPath = argValue("--labels")
let initLabels = argValue("--init-labels")
let outPath = argValue("--out") ?? "vision_bench_report.json"
let IMG_EXT: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "tiff", "webp"]

// MARK: - image loading
func loadCGImage(_ url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func listImages(_ dir: String) -> [URL] {
    let base = URL(fileURLWithPath: dir)
    let items = (try? FileManager.default.contentsOfDirectory(
        at: base, includingPropertiesForKeys: nil)) ?? []
    return items
        .filter { IMG_EXT.contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
}

// Crop a CGImage to a Vision-normalized bounding box (origin bottom-left).
func crop(_ img: CGImage, _ bb: CGRect) -> CGImage? {
    let w = CGFloat(img.width), h = CGFloat(img.height)
    let rect = CGRect(x: bb.minX * w, y: (1 - bb.maxY) * h,
                      width: bb.width * w, height: bb.height * h).integral
    guard rect.width >= 8, rect.height >= 8 else { return nil }
    return img.cropping(to: rect)
}

// MARK: - Vision helpers
func detect(_ img: CGImage) -> (faces: [CGRect], persons: [CGRect]) {
    let handler = VNImageRequestHandler(cgImage: img, options: [:])
    let faceReq = VNDetectFaceRectanglesRequest()
    let humanReq = VNDetectHumanRectanglesRequest()
    try? handler.perform([faceReq, humanReq])
    let faces = (faceReq.results ?? []).map { $0.boundingBox }
    let persons = (humanReq.results ?? []).map { $0.boundingBox }
    return (faces, persons)
}

func featurePrint(_ img: CGImage) -> VNFeaturePrintObservation? {
    let handler = VNImageRequestHandler(cgImage: img, options: [:])
    let req = VNGenerateImageFeaturePrintRequest()
    try? handler.perform([req])
    return req.results?.first as? VNFeaturePrintObservation
}

func distance(_ a: VNFeaturePrintObservation, _ b: VNFeaturePrintObservation) -> Float? {
    var d: Float = 0
    do { try a.computeDistance(&d, to: b); return d } catch { return nil }
}

// MARK: - --init-labels
let images = listImages(photosDir)
if let initPath = initLabels {
    let stub = images.map { ["file": $0.lastPathComponent, "isMe": false, "garmentGroup": ""] as [String: Any] }
    let data = try JSONSerialization.data(withJSONObject: ["photos": stub], options: [.prettyPrinted])
    try data.write(to: URL(fileURLWithPath: initPath))
    print("Wrote labeling template with \(images.count) photos -> \(initPath)")
    print("Mark isMe=true for photos of you; give same-garment photos the same garmentGroup tag.")
    exit(0)
}

if images.isEmpty {
    FileHandle.standardError.write(Data("error: no images found in \(photosDir)\n".utf8))
    exit(1)
}
print("Benchmarking \(images.count) photos from \(photosDir)…")

// MARK: - selfie enrollment
var selfiePrint: VNFeaturePrintObservation?
if let sp = selfiePath, let simg = loadCGImage(URL(fileURLWithPath: sp)) {
    let (faces, _) = detect(simg)
    if let face = faces.first, let fc = crop(simg, face) {
        selfiePrint = featurePrint(fc)
        print("Selfie enrolled (face crop feature print).")
    } else {
        selfiePrint = featurePrint(simg)
        print("Selfie: no face detected, using whole-image feature print.")
    }
}

// MARK: - per-photo pass
struct Photo {
    let file: String
    var faceCount = 0
    var personCount = 0
    var meScore: Float?          // best (smallest) distance selfie<->face crop
    var personPrint: VNFeaturePrintObservation?
    var ms = 0.0
}
var photos: [Photo] = []
var timings: [Double] = []

for url in images {
    let t0 = Date()
    guard let img = loadCGImage(url) else { continue }
    var p = Photo(file: url.lastPathComponent)
    let (faces, persons) = detect(img)
    p.faceCount = faces.count
    p.personCount = persons.count

    if let sp = selfiePrint {
        var best: Float?
        for f in faces {
            if let fc = crop(img, f), let fp = featurePrint(fc), let d = distance(sp, fp) {
                best = min(best ?? .greatestFiniteMagnitude, d)
            }
        }
        p.meScore = best
    }
    // Person-region print for garment dedup (largest person box, else whole image).
    let region = persons.max { $0.width * $0.height < $1.width * $1.height }
    if let r = region, let pc = crop(img, r) { p.personPrint = featurePrint(pc) }
    else { p.personPrint = featurePrint(img) }

    p.ms = Date().timeIntervalSince(t0) * 1000
    timings.append(p.ms)
    photos.append(p)
}

func pct(_ xs: [Double], _ q: Double) -> Double {
    guard !xs.isEmpty else { return 0 }
    let s = xs.sorted(); return s[min(s.count - 1, Int(Double(s.count) * q))]
}

// MARK: - dedup threshold sweep (pairwise feature-print distance)
let prints = photos.compactMap { p in p.personPrint.map { (p.file, $0) } }
var pairDists: [Float] = []
for i in 0..<prints.count {
    for j in (i + 1)..<prints.count {
        if let d = distance(prints[i].1, prints[j].1) { pairDists.append(d) }
    }
}
// Greedy single-link clustering at a threshold -> #clusters (proxy for #unique items).
func clusterCount(_ threshold: Float) -> Int {
    var parent = Array(0..<prints.count)
    func find(_ x: Int) -> Int { var x = x; while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x] }; return x }
    for i in 0..<prints.count {
        for j in (i + 1)..<prints.count {
            if let d = distance(prints[i].1, prints[j].1), d <= threshold { parent[find(i)] = find(j) }
        }
    }
    return Set((0..<prints.count).map { find($0) }).count
}

// MARK: - optional ground-truth metrics
var faceGate: [String: Any] = [:]
var dedupEval: [String: Any] = [:]
if let lp = labelsPath,
   let ld = try? Data(contentsOf: URL(fileURLWithPath: lp)),
   let lj = try? JSONSerialization.jsonObject(with: ld) as? [String: Any],
   let rows = lj["photos"] as? [[String: Any]] {
    var isMe: [String: Bool] = [:]
    var group: [String: String] = [:]
    for r in rows {
        guard let f = r["file"] as? String else { continue }
        isMe[f] = (r["isMe"] as? Bool) ?? false
        if let g = r["garmentGroup"] as? String, !g.isEmpty { group[f] = g }
    }
    // Face-gate precision/recall over "meScore <= threshold" for a distance sweep.
    if selfiePrint != nil {
        var sweep: [[String: Any]] = []
        for thr in stride(from: Float(0.4), through: 1.6, by: 0.1) {
            var tp = 0, fp = 0, fn = 0
            for p in photos {
                let truth = isMe[p.file] ?? false
                let pred = (p.meScore ?? .greatestFiniteMagnitude) <= thr
                if pred && truth { tp += 1 } else if pred && !truth { fp += 1 } else if !pred && truth { fn += 1 }
            }
            let prec = tp + fp > 0 ? Double(tp) / Double(tp + fp) : 0
            let rec = tp + fn > 0 ? Double(tp) / Double(tp + fn) : 0
            sweep.append(["threshold": Double(thr), "precision": prec, "recall": rec, "tp": tp, "fp": fp, "fn": fn])
        }
        faceGate = ["distanceSweep": sweep, "labeledMe": isMe.values.filter { $0 }.count]
    }
    dedupEval = ["labeledGarmentGroups": Set(group.values).count,
                 "photosWithGroup": group.count,
                 "note": "Compare labeledGarmentGroups to clusterCount() at each threshold below to pick eps."]
}

// MARK: - report
let sweep = stride(from: Float(0.2), through: 1.2, by: 0.1).map {
    ["threshold": Double($0), "clusters": clusterCount($0)] as [String: Any]
}
let meScores: [Float] = photos.compactMap { $0.meScore }.sorted()
let meScoreStats: [String: Any] = selfiePrint != nil
    ? ["scored": meScores.count,
       "min": meScores.first.map { Double($0) } ?? 0,
       "median": meScores.isEmpty ? 0 : Double(meScores[meScores.count / 2])]
    : ["note": "no --selfie provided"]
let timingStats: [String: Any] = ["p50": pct(timings, 0.5), "p95": pct(timings, 0.95),
                                   "total": timings.reduce(0, +)]
let perPhoto: [[String: Any]] = photos.map {
    ["file": $0.file, "faces": $0.faceCount, "persons": $0.personCount,
     "meScore": $0.meScore.map { Double($0) } as Any, "ms": $0.ms]
}
var report: [String: Any] = [:]
report["photos"] = photos.count
report["withFace"] = photos.filter { $0.faceCount > 0 }.count
report["withPerson"] = photos.filter { $0.personCount > 0 }.count
report["timingMsPerPhoto"] = timingStats
report["meScoreStats"] = meScoreStats
report["dedupClusterSweep"] = sweep
report["faceGate"] = faceGate.isEmpty ? ["note": "no --labels provided"] : faceGate
report["dedupEval"] = dedupEval.isEmpty ? ["note": "no --labels provided"] : dedupEval
report["perPhoto"] = perPhoto
let out = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try out.write(to: URL(fileURLWithPath: outPath))

// MARK: - console summary
print("""

── Vision-only benchmark summary ──
Photos:        \(report["photos"]!)
With a face:   \(photos.filter { $0.faceCount > 0 }.count)
With a person: \(photos.filter { $0.personCount > 0 }.count)
Time/photo:    p50 \(String(format: "%.0f", pct(timings, 0.5)))ms  p95 \(String(format: "%.0f", pct(timings, 0.95)))ms  total \(String(format: "%.1f", timings.reduce(0, +) / 1000))s
Dedup clusters vs threshold (proxy for # unique garments):
""")
for s in sweep { print("   dist \(s["threshold"]!) -> \(s["clusters"]!) clusters") }
if !faceGate.isEmpty { print("Face-gate precision/recall sweep written to report (labels provided).") }
print("Full report -> \(outPath)")
