import SwiftUI

/// Native menu bar commands that dispatch keyboard events to the web app
struct SlateMenuCommands: Commands {
    var body: some Commands {
        // Replace default "New" menu items
        CommandGroup(replacing: .newItem) {
            Button("New Page") {
                dispatchToWebView(key: "p")
            }
            .keyboardShortcut("p", modifiers: .command)

            Button("New Section") {
                dispatchToWebView(key: "s")
            }
            .keyboardShortcut("s", modifiers: .command)
        }

        CommandGroup(after: .newItem) {
            Divider()

            Button("Search") {
                dispatchToWebView(key: "k")
            }
            .keyboardShortcut("k", modifiers: .command)

            Button("Focus Input") {
                dispatchToWebView(key: "/")
            }
            .keyboardShortcut("/", modifiers: .command)

            Divider()

            Button("Quick Capture") {
                Task { @MainActor in
                    AppState.shared.toggleQuickCapture()
                }
            }
            .keyboardShortcut(" ", modifiers: [.command, .shift])

            Button("Keyboard Shortcuts") {
                dispatchToWebView(key: "?")
            }
            .keyboardShortcut("?", modifiers: .command)
        }
    }

    private func dispatchToWebView(key: String) {
        // Find the WKWebView coordinator and dispatch the key event
        guard let window = NSApp.keyWindow,
              let contentView = window.contentView else { return }

        // Walk the view hierarchy to find WKWebView
        func findWebView(in view: NSView) -> NSView? {
            if NSStringFromClass(type(of: view)).contains("WKWebView") {
                return view
            }
            for subview in view.subviews {
                if let found = findWebView(in: subview) {
                    return found
                }
            }
            return nil
        }

        // Post a notification that the coordinator listens to
        NotificationCenter.default.post(
            name: .slateMenuCommand,
            object: nil,
            userInfo: ["key": key]
        )
    }
}

extension Notification.Name {
    static let slateMenuCommand = Notification.Name("slateMenuCommand")
}
