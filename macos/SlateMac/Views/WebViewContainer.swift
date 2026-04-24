import SwiftUI
import WebKit

struct WebViewContainer: NSViewRepresentable {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var networkMonitor: NetworkMonitor

    static let liveURL = URL(string: "https://slate.opsapp.co")!

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Enable localStorage and sessionStorage
        config.websiteDataStore = .default()

        // Allow inline media playback
        config.preferences.isElementFullscreenEnabled = true

        // Register JS→Swift bridge handler
        let handler = BridgeMessageHandler(appState: appState)
        config.userContentController.add(handler, name: "slateMacBridge")

        // Inject bridge script at document start
        let bridgeScript = WKUserScript(
            source: BridgeMessageHandler.injectionScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.setValue(false, forKey: "drawsBackground") // Transparent background

        // Custom user agent
        webView.customUserAgent = "SlateMac/1.0 " + (webView.value(forKey: "userAgent") as? String ?? "")

        // Load the web app
        loadAppropriateURL(webView: webView)

        context.coordinator.webView = webView
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        // Respond to online/offline changes
        context.coordinator.updateOnlineStatus(isOnline: networkMonitor.isOnline, webView: webView)
    }

    func makeCoordinator() -> WebViewCoordinator {
        WebViewCoordinator(appState: appState)
    }

    private func loadAppropriateURL(webView: WKWebView) {
        if networkMonitor.isOnline {
            webView.load(URLRequest(url: Self.liveURL))
        } else if let bundledURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "BundledWeb") {
            webView.loadFileURL(bundledURL, allowingReadAccessTo: bundledURL.deletingLastPathComponent())
        } else {
            webView.load(URLRequest(url: Self.liveURL))
        }
    }
}
