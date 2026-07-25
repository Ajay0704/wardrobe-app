import Foundation
import Capacitor

/// Reads an image the Share Extension stashed in the App Group (`group.app.wardrobe.personal`)
/// and hands it to the WebView as base64, then clears it so it's consumed once. Called from JS
/// via `registerPlugin("SharedInbox")` (see `src/lib/native/shared-inbox.ts`).
@objc(SharedInboxPlugin)
public class SharedInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedInboxPlugin"
    public let jsName = "SharedInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "consumePending", returnType: CAPPluginReturnPromise),
    ]

    private let appGroup = "group.app.wardrobe.personal"
    private let pathKey = "pendingSharedImagePath"
    private let mimeKey = "pendingSharedImageMime"

    @objc func consumePending(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let path = defaults.string(forKey: pathKey),
              let data = FileManager.default.contents(atPath: path)
        else {
            call.resolve([:])
            return
        }
        let mime = defaults.string(forKey: mimeKey) ?? "image/jpeg"
        // Consume once: clear the marker and delete the shared file.
        defaults.removeObject(forKey: pathKey)
        defaults.removeObject(forKey: mimeKey)
        try? FileManager.default.removeItem(atPath: path)
        call.resolve([
            "type": "image",
            "imageBase64": data.base64EncodedString(),
            "mime": mime,
        ])
    }
}
