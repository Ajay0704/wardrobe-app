import UIKit
import Capacitor
import WebKit

/// Forces mobile Safari layout/UA behavior so the remote Next.js app
/// uses phone breakpoints instead of a zoomed-out desktop layout.
class MobileBridgeViewController: CAPBridgeViewController {
  override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
    let configuration = super.webViewConfiguration(for: instanceConfiguration)
    configuration.defaultWebpagePreferences.preferredContentMode = .mobile
    return configuration
  }

  override open func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    webView?.scrollView.contentInsetAdjustmentBehavior = .never
    if let preferences = webView?.configuration.defaultWebpagePreferences {
      preferences.preferredContentMode = .mobile
    }
  }
}
