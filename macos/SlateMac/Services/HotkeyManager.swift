import AppKit
import Carbon.HIToolbox

final class HotkeyManager {
    private var globalMonitor: Any?

    func registerGlobalHotkey() {
        // Cmd+Shift+Space → toggle quick capture
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            if flags == [.command, .shift] && event.keyCode == 49 { // 49 = Space
                Task { @MainActor in
                    AppState.shared.toggleQuickCapture()
                }
            }
        }

        // Check accessibility permissions
        if !AXIsProcessTrusted() {
            promptForAccessibility()
        }
    }

    private func promptForAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)
    }

    deinit {
        if let monitor = globalMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }
}
