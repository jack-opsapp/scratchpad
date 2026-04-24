import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState
    @State private var messageText = ""
    @State private var isLoading = false
    @State private var agentResponse: String?
    @State private var conversationHistory: [[String: String]] = []

    private let accentColor = Color(hex: "948b72")
    private let bgColor = Color(hex: "0a0a0a")

    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Text("Quick Capture")
                    .font(.custom("Manrope-SemiBold", size: 14))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    NSApp.activate(ignoringOtherApps: true)
                    if let window = NSApp.windows.first(where: { $0.title != "Item-0" && !$0.title.isEmpty }) {
                        window.makeKeyAndOrderFront(nil)
                    }
                } label: {
                    Text("Open Slate")
                        .font(.custom("Manrope-Medium", size: 11))
                        .foregroundColor(accentColor)
                }
                .buttonStyle(.plain)
            }

            // Agent response
            if let response = agentResponse {
                ScrollView {
                    Text(response)
                        .font(.custom("Manrope-Regular", size: 13))
                        .foregroundColor(.white.opacity(0.85))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 120)
            }

            // Input
            HStack(spacing: 8) {
                TextField("Type a note or message...", text: $messageText)
                    .textFieldStyle(.plain)
                    .font(.custom("Manrope-Regular", size: 13))
                    .foregroundColor(.white)
                    .onSubmit { sendMessage() }

                if isLoading {
                    ProgressView()
                        .scaleEffect(0.7)
                        .frame(width: 24, height: 24)
                } else {
                    Button(action: sendMessage) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(messageText.isEmpty ? .gray : accentColor)
                    }
                    .buttonStyle(.plain)
                    .disabled(messageText.isEmpty)
                }
            }
            .padding(10)
            .background(Color.white.opacity(0.08))
            .cornerRadius(10)

            // Auth state
            if !appState.isAuthenticated {
                Button("Sign in to use Quick Capture") {
                    AuthService.shared.signInForQuickCapture()
                }
                .font(.custom("Manrope-Medium", size: 12))
                .foregroundColor(accentColor)
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(width: 320)
        .background(bgColor)
    }

    private func sendMessage() {
        guard !messageText.isEmpty, appState.isAuthenticated,
              let userId = appState.userId else { return }

        let text = messageText
        messageText = ""
        isLoading = true

        conversationHistory.append(["role": "user", "content": text])

        Task {
            do {
                let response = try await SupabaseClient.shared.sendToAgent(
                    message: text,
                    userId: userId,
                    history: conversationHistory
                )
                await MainActor.run {
                    agentResponse = response.message ?? "Done."
                    conversationHistory.append(["role": "assistant", "content": response.message ?? ""])
                    // Keep last 10 messages
                    if conversationHistory.count > 10 {
                        conversationHistory = Array(conversationHistory.suffix(10))
                    }
                    isLoading = false
                }

                // Notify the webview to refresh data
                if let coordinator = NSApp.windows.compactMap({ $0.contentView?.subviews.first }).first {
                    // Post notification that quick-capture created content
                    NotificationCenter.default.post(name: .slateExternalChange, object: nil)
                }
            } catch {
                await MainActor.run {
                    agentResponse = "Error: \(error.localizedDescription)"
                    isLoading = false
                }
            }
        }
    }
}

extension Notification.Name {
    static let slateExternalChange = Notification.Name("slateExternalChange")
}
