import UIKit
import UniformTypeIdentifiers

/// Wardrobe Share Extension.
///
/// Captures a shared URL (or the first link found in shared text/web page) and hands it to
/// the main app via its custom URL scheme `app.wardrobe.personal://share?url=<encoded>`.
/// The app's `NativeAppClass` `appUrlOpen` handler then quick-saves it to the wishlist through
/// the existing `/api/clip` pipeline. No UI is shown — we open the app and finish immediately.
///
/// Links only for now. Image sharing needs an App Group shared container + a native bridge to
/// hand the bytes to the WebView — see `docs/Share Extension.md` (Part B).
final class ShareViewController: UIViewController {
    private let hostScheme = "app.wardrobe.personal"

    override func viewDidLoad() {
        super.viewDidLoad()
        extractSharedURL { [weak self] shared in
            self?.finish(with: shared)
        }
    }

    /// Pull a URL from the extension's input items: prefer a real `public.url`, then fall back
    /// to the first http(s) link inside shared plain text (many apps share the link as text).
    private func extractSharedURL(_ completion: @escaping (String?) -> Void) {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            return completion(nil)
        }
        let urlType = UTType.url.identifier
        let textType = UTType.plainText.identifier
        let providers = items.flatMap { $0.attachments ?? [] }

        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            p.loadItem(forTypeIdentifier: urlType, options: nil) { data, _ in
                let url = (data as? URL)?.absoluteString ?? (data as? String)
                completion(url)
            }
            return
        }
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            p.loadItem(forTypeIdentifier: textType, options: nil) { data, _ in
                completion((data as? String).flatMap(Self.firstURL(in:)))
            }
            return
        }
        completion(nil)
    }

    private static func firstURL(in text: String) -> String? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..., in: text)
        return detector?.firstMatch(in: text, options: [], range: range)?.url?.absoluteString
    }

    private func finish(with sharedURL: String?) {
        if let sharedURL, let deepLink = deepLink(for: sharedURL) {
            openHostApp(deepLink)
        }
        DispatchQueue.main.async { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    private func deepLink(for sharedURL: String) -> URL? {
        // Encode everything but the RFC-3986 unreserved set so the value is a safe query arg.
        let unreserved = CharacterSet(charactersIn:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        guard let encoded = sharedURL.addingPercentEncoding(withAllowedCharacters: unreserved) else {
            return nil
        }
        return URL(string: "\(hostScheme)://share?url=\(encoded)")
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
