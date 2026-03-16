import Foundation

final class APIService: ObservableObject {
    static let shared = APIService()

    enum ResetStateError: LocalizedError {
        case unavailable

        var errorDescription: String? {
            "APIService was reset and will be rebuilt with the new coach surface."
        }
    }

    @Published private(set) var baseURL: String = {
        if let overrideURL = UserDefaults.standard.string(forKey: "APIBaseURL"), !overrideURL.isEmpty {
            return overrideURL
        }

        #if targetEnvironment(simulator)
        return "http://localhost:3000"
        #else
        return "http://192.168.1.3:3000"
        #endif
    }()

    func setBaseURL(_ url: String) {
        baseURL = url
        UserDefaults.standard.set(url, forKey: "APIBaseURL")
    }

    func healthCheck() async throws -> Bool {
        guard let url = URL(string: "\(baseURL)/health") else {
            throw ResetStateError.unavailable
        }

        let (_, response) = try await URLSession.shared.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse else {
            return false
        }
        return httpResponse.statusCode == 200
    }
}
