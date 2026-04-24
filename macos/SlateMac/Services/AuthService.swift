import AuthenticationServices
import Foundation

@MainActor
final class AuthService: NSObject, ObservableObject {
    static let shared = AuthService()

    private let supabaseURL = "https://lepksnpkrnkokiwxfcsj.supabase.co"
    private let callbackScheme = "slate-mac"

    private override init() {
        super.init()
    }

    /// Start OAuth flow for menu bar quick-capture (when webview isn't open)
    func signInForQuickCapture() {
        let authURL = "\(supabaseURL)/auth/v1/authorize?provider=google&redirect_to=\(callbackScheme)://auth/callback"

        guard let url = URL(string: authURL) else { return }

        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: callbackScheme
        ) { [weak self] callbackURL, error in
            guard let self, let callbackURL, error == nil else { return }
            Task { @MainActor in
                self.handleCallback(url: callbackURL)
            }
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        session.start()
    }

    /// Handle OAuth callback URL
    func handleCallback(url: URL) {
        // Parse fragment: #access_token=...&refresh_token=...&...
        guard let fragment = url.fragment else { return }

        var params: [String: String] = [:]
        for pair in fragment.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1)
            if kv.count == 2 {
                params[String(kv[0])] = String(kv[1]).removingPercentEncoding ?? String(kv[1])
            }
        }

        guard let accessToken = params["access_token"],
              let refreshToken = params["refresh_token"] else { return }

        // Store tokens
        KeychainHelper.save(token: accessToken, forKey: "slate_access_token")
        KeychainHelper.save(token: refreshToken, forKey: "slate_refresh_token")

        // Decode JWT to get user ID
        if let userId = decodeJWTUserId(accessToken) {
            KeychainHelper.save(token: userId, forKey: "slate_user_id")
            AppState.shared.updateAuth(userId: userId, token: accessToken)
        }
    }

    /// Decode the user ID from a Supabase JWT
    private func decodeJWTUserId(_ jwt: String) -> String? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return nil }

        var base64 = String(parts[1])
        // Pad to multiple of 4
        while base64.count % 4 != 0 {
            base64.append("=")
        }

        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = json["sub"] as? String else { return nil }

        return sub
    }

    /// Restore session from Keychain on app launch
    func restoreSession() {
        if let token = KeychainHelper.load(forKey: "slate_access_token"),
           let userId = KeychainHelper.load(forKey: "slate_user_id") {
            AppState.shared.updateAuth(userId: userId, token: token)
        }
    }

    func signOut() {
        KeychainHelper.clearAll()
        AppState.shared.clearAuth()
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? ASPresentationAnchor()
    }
}
