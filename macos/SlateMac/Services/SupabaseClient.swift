import Foundation

/// Lightweight REST client for Supabase PostgREST + agent API.
/// Used by menu bar quick-capture (bypasses webview).
actor SupabaseClient {
    static let shared = SupabaseClient()

    private let supabaseURL = "https://lepksnpkrnkokiwxfcsj.supabase.co"
    private let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcGtzbnBrcm5rb2tpd3hmY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzIwMzgzNTgsImV4cCI6MjA0NzYxNDM1OH0.WPOxMBPMJerv_VibfDtuEz7JXZPmbnT8X1JO9sFhL3A"
    private let agentURL = "https://slate.opsapp.co/api/agent"

    private init() {}

    // MARK: - Agent API

    struct AgentRequest: Encodable {
        let message: String
        let userId: String
        let conversationHistory: [[String: String]]
        let source: String
    }

    struct AgentResponse: Decodable {
        let type: String
        let message: String?
    }

    func sendToAgent(message: String, userId: String, history: [[String: String]] = []) async throws -> AgentResponse {
        guard let token = await MainActor.run(body: { KeychainHelper.load(forKey: "slate_access_token") }) else {
            throw SupabaseError.notAuthenticated
        }

        var request = URLRequest(url: URL(string: agentURL)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body = AgentRequest(
            message: message,
            userId: userId,
            conversationHistory: history,
            source: "desktop"
        )
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw SupabaseError.apiError("Agent request failed")
        }

        return try JSONDecoder().decode(AgentResponse.self, from: data)
    }

    // MARK: - PostgREST

    func fetch<T: Decodable>(
        table: String,
        query: String = "",
        as type: T.Type
    ) async throws -> T {
        guard let token = await MainActor.run(body: { KeychainHelper.load(forKey: "slate_access_token") }) else {
            throw SupabaseError.notAuthenticated
        }

        let urlString = "\(supabaseURL)/rest/v1/\(table)\(query.isEmpty ? "" : "?\(query)")"
        guard let url = URL(string: urlString) else {
            throw SupabaseError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw SupabaseError.apiError("Request failed for \(table)")
        }

        return try JSONDecoder().decode(type, from: data)
    }

    enum SupabaseError: Error, LocalizedError {
        case notAuthenticated
        case invalidURL
        case apiError(String)

        var errorDescription: String? {
            switch self {
            case .notAuthenticated: return "Not authenticated"
            case .invalidURL: return "Invalid URL"
            case .apiError(let msg): return msg
            }
        }
    }
}
