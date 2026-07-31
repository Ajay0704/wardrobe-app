import Foundation
import Capacitor
import Vision
import CoreImage

/// On-device background removal via Apple's Vision framework, as a drop-in replacement for the
/// `@imgly` WASM engine. Called from JS via `registerPlugin("AppleVision")` (see
/// `src/lib/native/apple-vision.ts`), which the `appleVisionEngine` in `src/lib/cutout.ts` wraps.
///
/// REGISTRATION IS NOT AUTOMATIC. This class is registered by hand in
/// `MobileBridgeViewController.capacitorDidLoad()`. Capacitor does not scan the binary for `@objc`
/// plugins — it only loads what `capacitor.config.json`'s `packageClassList` names, and `cap sync`
/// generates that list from npm packages, so an app-local plugin is never in it. Without that
/// explicit registration every call here is unreachable and `cutout()` silently uses imgly.
///
/// `VNGenerateForegroundInstanceMaskRequest` is the class-agnostic foreground segmentation behind
/// "lift subject from background" in Photos. It runs on the Neural Engine — dedicated silicon, so
/// unlike imgly it is not competing with the WebView for CPU. Measured on real garment crops at
/// ~144ms median per image (~22ms on small inputs, ~378ms cold start).
///
/// It removes BACKGROUND, not neighbours: on a crop taken out of a worn photo the mask keeps the
/// whole salient subject, so hands, hair and the adjacent garment often survive. That is the same
/// behaviour imgly has, and isolating the single garment is the redraw's job downstream — this is a
/// like-for-like swap, not an accuracy improvement.
@objc(AppleVisionPlugin)
public class AppleVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleVisionPlugin"
    public let jsName = "AppleVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeBackground", returnType: CAPPluginReturnPromise),
    ]

    /// One context, reused. Creating a CIContext per call is expensive enough to eat the win.
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    /// Vision segmentation is CPU/ANE work that must not block the WebView's thread.
    private let queue = DispatchQueue(label: "app.wardrobe.applevision", qos: .userInitiated)

    /// Whether this binary can actually do it. The app ships with
    /// `IPHONEOS_DEPLOYMENT_TARGET = 15.0` but this request is iOS 17+, so on an iOS 15 or 16
    /// device the plugin is present and answers `false` — JS then stays on imgly instead of
    /// failing every cutout. Reported separately from `removeBackground` so the caller can decide
    /// once rather than discovering it per image.
    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            call.resolve(["supported": true])
        } else {
            call.resolve(["supported": false, "reason": "Vision foreground masking needs iOS 17."])
        }
    }

    @objc func removeBackground(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("applevision-unavailable: needs iOS 17")
            return
        }
        guard let b64 = call.getString("imageBase64"), !b64.isEmpty else {
            call.reject("applevision-bad-input: imageBase64 is required")
            return
        }
        // Accept a whole data: URL too — the JS side hands over whatever the caller had, and
        // stripping the prefix here is cheaper than another pass over a multi-MB string in JS.
        let payload = b64.contains(",") ? String(b64[b64.range(of: ",")!.upperBound...]) : b64
        guard let data = Data(base64Encoded: payload, options: .ignoreUnknownCharacters) else {
            call.reject("applevision-bad-input: not valid base64")
            return
        }

        queue.async { [weak self] in
            guard let self else { return }
            let started = DispatchTime.now()
            do {
                let png = try self.mask(data)
                let ms = Double(DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1_000_000
                call.resolve([
                    "pngBase64": png.base64EncodedString(),
                    "ms": Int(ms.rounded()),
                ])
            } catch let e as MaskError {
                call.reject(e.message)
            } catch {
                call.reject("applevision-failed: \(error.localizedDescription)")
            }
        }
    }

    private struct MaskError: Error {
        let message: String
    }

    /// Segment the foreground and return a transparent PNG.
    ///
    /// Every failure path rejects rather than returning the original image. `cutout()` in
    /// `src/lib/cutout.ts` degrades to imgly whenever a non-imgly engine throws, so a throw here
    /// is the correct way to hand back control — silently returning an uncut image would store a
    /// garment with its background baked in and look like a success.
    @available(iOS 17.0, *)
    private func mask(_ data: Data) throws -> Data {
        let handler = VNImageRequestHandler(data: data, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([request])

        guard let result = request.results?.first, !result.allInstances.isEmpty else {
            // Roughly 2% of crops in testing had nothing Vision considered foreground — a flat-lay
            // already on white, for instance. imgly handles those, so hand it back.
            throw MaskError(message: "applevision-no-foreground")
        }

        // `croppedToInstancesExtent: false` keeps the original frame, because `finalize()` in
        // cutout.ts runs `trimAndCenter` on every cutout and expects to do the reframing itself.
        // Cropping here would make the garment's geometry depend on which engine produced it.
        let buffer = try result.generateMaskedImage(
            ofInstances: result.allInstances,
            from: handler,
            croppedToInstancesExtent: false
        )

        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else {
            throw MaskError(message: "applevision-failed: no sRGB color space")
        }
        // PNG (not JPEG) and .RGBA8: the alpha channel IS the product here.
        guard let png = ciContext.pngRepresentation(
            of: CIImage(cvPixelBuffer: buffer),
            format: .RGBA8,
            colorSpace: space
        ) else {
            throw MaskError(message: "applevision-failed: PNG encode failed")
        }
        return png
    }
}
