import WebKit

/// Handles messages from JS (window.slateMacBridge.postMessage) → Swift
final class BridgeMessageHandler: NSObject, WKScriptMessageHandler {
    private let appState: AppState

    init(appState: AppState) {
        self.appState = appState
    }

    /// JavaScript injected at document start to expose the bridge
    static let injectionScript = """
    window.slateMacBridge = {
        postMessage: function(action, payload) {
            window.webkit.messageHandlers.slateMacBridge.postMessage({
                action: action,
                payload: payload || {}
            });
        },
        isAvailable: true,
        platform: 'macos'
    };
    """

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        let payload = body["payload"] as? [String: Any] ?? [:]

        Task { @MainActor in
            handleAction(action, payload: payload)
        }
    }

    @MainActor
    private func handleAction(_ action: String, payload: [String: Any]) {
        switch action {
        case "scheduleNotification":
            let title = payload["title"] as? String ?? "Slate"
            let body = payload["body"] as? String ?? ""
            NotificationService.scheduleNotification(title: title, body: body)

        case "setBadgeCount":
            let count = payload["count"] as? Int ?? 0
            NotificationService.setBadgeCount(count)

        case "authStateChanged":
            if let userId = payload["userId"] as? String,
               let token = payload["accessToken"] as? String {
                appState.updateAuth(userId: userId, token: token)
                KeychainHelper.save(token: token, forKey: "slate_access_token")
                KeychainHelper.save(token: userId, forKey: "slate_user_id")
            } else {
                appState.clearAuth()
                KeychainHelper.clearAll()
            }

        default:
            break
        }
    }
}
