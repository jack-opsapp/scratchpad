import Network
import SwiftUI

@MainActor
final class NetworkMonitor: ObservableObject {
    @Published var isOnline = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "co.opsapp.slate.mac.networkmonitor")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isOnline = path.status == .satisfied
                AppState.shared.isOnline = path.status == .satisfied
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
