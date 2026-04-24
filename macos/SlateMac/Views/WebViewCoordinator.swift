import WebKit

@MainActor
final class WebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    var webView: WKWebView?
    private let appState: AppState
    private var wasOffline = false

    private var menuCommandObserver: NSObjectProtocol?
    private var externalChangeObserver: NSObjectProtocol?

    init(appState: AppState) {
        self.appState = appState
        super.init()

        // Listen for native menu commands
        menuCommandObserver = NotificationCenter.default.addObserver(
            forName: .slateMenuCommand, object: nil, queue: .main
        ) { [weak self] notification in
            if let key = notification.userInfo?["key"] as? String {
                self?.dispatchKeyboardEvent(key: key)
            }
        }

        // Listen for external changes (e.g. quick-capture created a note)
        externalChangeObserver = NotificationCenter.default.addObserver(
            forName: .slateExternalChange, object: nil, queue: .main
        ) { [weak self] _ in
            self?.notifyExternalChange()
        }
    }

    deinit {
        if let obs = menuCommandObserver { NotificationCenter.default.removeObserver(obs) }
        if let obs = externalChangeObserver { NotificationCenter.default.removeObserver(obs) }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .allow }

        // Handle external links (open in default browser)
        if let host = url.host,
           host != "slate.opsapp.co" && host != "accounts.google.com" && host != "appleid.apple.com" {
            if navigationAction.navigationType == .linkActivated {
                NSWorkspace.shared.open(url)
                return .cancel
            }
        }

        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Extract auth state from localStorage after page loads
        extractAuthState(from: webView)
    }

    // MARK: - WKUIDelegate

    // Handle window.open (Google OAuth popup) — load in same webview
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // Load popup URLs in the same webview instead of opening a new window
        if navigationAction.targetFrame == nil || !(navigationAction.targetFrame?.isMainFrame ?? false) {
            webView.load(navigationAction.request)
        }
        return nil
    }

    // Handle JavaScript alerts
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    // Handle JavaScript confirms
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let result = alert.runModal()
        completionHandler(result == .alertFirstButtonReturn)
    }

    // Handle JavaScript prompts
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input
        let result = alert.runModal()
        completionHandler(result == .alertFirstButtonReturn ? input.stringValue : nil)
    }

    // MARK: - Auth Extraction

    private func extractAuthState(from webView: WKWebView) {
        let js = """
        (function() {
            try {
                var keys = Object.keys(localStorage);
                for (var i = 0; i < keys.length; i++) {
                    if (keys[i].indexOf('sb-') === 0 && keys[i].indexOf('-auth-token') !== -1) {
                        return localStorage.getItem(keys[i]);
                    }
                }
            } catch(e) {}
            return null;
        })();
        """

        webView.evaluateJavaScript(js) { [weak self] result, error in
            guard let self, let jsonString = result as? String,
                  let data = jsonString.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }

            if let user = json["user"] as? [String: Any],
               let userId = user["id"] as? String,
               let accessToken = json["access_token"] as? String {
                Task { @MainActor in
                    self.appState.updateAuth(userId: userId, token: accessToken)
                    KeychainHelper.save(token: accessToken, forKey: "slate_access_token")
                    KeychainHelper.save(token: userId, forKey: "slate_user_id")
                    if let refreshToken = json["refresh_token"] as? String {
                        KeychainHelper.save(token: refreshToken, forKey: "slate_refresh_token")
                    }
                }
            }
        }
    }

    // MARK: - Online/Offline

    func updateOnlineStatus(isOnline: Bool, webView: WKWebView) {
        if isOnline && wasOffline {
            // Reconnect: reload the live URL
            webView.load(URLRequest(url: WebViewContainer.liveURL))
        }
        wasOffline = !isOnline
    }

    // MARK: - Dispatch Keyboard Event to Web

    func dispatchKeyboardEvent(key: String, metaKey: Bool = true) {
        let js = """
        (function() {
            var event = new KeyboardEvent('keydown', {
                key: '\(key)',
                code: 'Key' + '\(key.uppercased())',
                metaKey: \(metaKey),
                ctrlKey: false,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
        })();
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - Notify Web of External Change

    func notifyExternalChange() {
        let js = """
        window.dispatchEvent(new CustomEvent('slateExternalChange'));
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
