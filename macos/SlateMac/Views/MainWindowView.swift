import SwiftUI

struct MainWindowView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var networkMonitor: NetworkMonitor

    var body: some View {
        ZStack {
            WebViewContainer()
                .environmentObject(appState)
                .environmentObject(networkMonitor)

            if !networkMonitor.isOnline {
                offlineBanner
            }
        }
        .frame(minWidth: 800, minHeight: 600)
        .background(Color.black)
    }

    private var offlineBanner: some View {
        VStack {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .foregroundColor(.white.opacity(0.7))
                Text("Offline — using cached version")
                    .font(.custom("Manrope-Medium", size: 13))
                    .foregroundColor(.white.opacity(0.7))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(hex: "1a1a1a"))
            .cornerRadius(8)
            .padding(.top, 8)

            Spacer()
        }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
