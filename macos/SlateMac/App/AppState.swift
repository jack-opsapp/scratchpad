import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published var isAuthenticated = false
    @Published var userId: String?
    @Published var accessToken: String?
    @Published var isQuickCaptureVisible = false
    @Published var isOnline = true

    private init() {}

    func updateAuth(userId: String?, token: String?) {
        self.userId = userId
        self.accessToken = token
        self.isAuthenticated = userId != nil && token != nil
    }

    func clearAuth() {
        userId = nil
        accessToken = nil
        isAuthenticated = false
    }

    func toggleQuickCapture() {
        isQuickCaptureVisible.toggle()
    }
}
