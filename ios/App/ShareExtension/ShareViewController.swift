//
//  ShareViewController.swift
//  ShareExtension
//
//  Wardrobe "Share → Wardrobe" extension.
//

import UIKit
import UniformTypeIdentifiers

/// Captures what the user shared and hands it to the main app:
///   • a URL (or the first link in shared text/web page) → `app.wardrobe.personal://share?url=…`
///     → the app quick-saves it to the wishlist (`ClipLinkLoader` → `/api/clip`).
///   • an image → written to the App Group container, then `app.wardrobe.personal://share?type=image`
///     → the app reads it via the `SharedInbox` plugin and opens the add form pre-loaded.
/// No compose UI — we open the app and finish immediately.
final class ShareViewController: UIViewController {
    private let hostScheme = "app.wardrobe.personal"
    private let appGroup = "group.app.wardrobe.personal"

    override func viewDidLoad() {
        super.viewDidLoad()
        process()
    }

    private func process() {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []
        let urlType = UTType.url.identifier
        let imageType = UTType.image.identifier
        let textType = UTType.plainText.identifier

        // Prefer a real URL (a shared web page also carries a preview image — we want the link).
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            p.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] item, _ in
                self?.openLink((item as? URL)?.absoluteString ?? (item as? String))
            }
        } else if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(imageType) }) {
            p.loadItem(forTypeIdentifier: imageType, options: nil) { [weak self] item, _ in
                self?.openImage(item)
            }
        } else if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            p.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] item, _ in
                self?.openLink((item as? String).flatMap(Self.firstURL(in:)))
            }
        } else {
            complete()
        }
    }

    // MARK: - Links

    private func openLink(_ shared: String?) {
        if let shared, let deepLink = deepLink("share?url=\(percentEncode(shared))") {
            openHostApp(deepLink)
        }
        complete()
    }

    private static func firstURL(in text: String) -> String? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..., in: text)
        return detector?.firstMatch(in: text, options: [], range: range)?.url?.absoluteString
    }

    // MARK: - Images

    private func openImage(_ item: NSSecureCoding?) {
        var data: Data?
        var mime = "image/jpeg"
        if let url = item as? URL, let d = try? Data(contentsOf: url) {
            data = d
            mime = url.pathExtension.lowercased() == "png" ? "image/png" : "image/jpeg"
        } else if let image = item as? UIImage {
            data = image.jpegData(compressionQuality: 0.9)
        } else if let d = item as? Data {
            data = d
        }
        if let data, stashImage(data, mime: mime) {
            if let deepLink = deepLink("share?type=image") {
                openHostApp(deepLink)
            }
        }
        complete()
    }

    /// Write the image to the App Group container and record a marker the app reads once.
    private func stashImage(_ data: Data, mime: String) -> Bool {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup),
            let defaults = UserDefaults(suiteName: appGroup)
        else { return false }
        let dir = container.appendingPathComponent("shared/inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let ext = mime == "image/png" ? "png" : "jpg"
        let fileURL = dir.appendingPathComponent("\(UUID().uuidString).\(ext)")
        guard (try? data.write(to: fileURL)) != nil else { return false }
        defaults.set(fileURL.path, forKey: "pendingSharedImagePath")
        defaults.set(mime, forKey: "pendingSharedImageMime")
        return true
    }

    // MARK: - Helpers

    private func percentEncode(_ s: String) -> String {
        let unreserved = CharacterSet(charactersIn:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return s.addingPercentEncoding(withAllowedCharacters: unreserved) ?? ""
    }

    private func deepLink(_ query: String) -> URL? {
        URL(string: "\(hostScheme)://\(query)")
    }

    private func complete() {
        DispatchQueue.main.async { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    /// App extensions can't call `UIApplication.shared.open`; walk the responder chain to find a
    /// UIApplication that responds to `openURL:` and invoke it. Standard Share-Extension workaround.
    private func openHostApp(_ url: URL) {
        let selector = sel_registerName("openURL:")
        var responder: UIResponder? = self
        while let current = responder {
            if current.responds(to: selector) {
                _ = current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }
}
