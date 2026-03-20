import Foundation

final class APIService: ObservableObject {
    static let shared = APIService()

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
        let request = try makeRequest(path: "/health")
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            return false
        }
        return httpResponse.statusCode == 200
    }

    func fetchCoachSurface(accessToken: String, sessionKey: String?) async throws -> CoachSurfaceResponse {
        let request = try makeRequest(
            path: "/v1/coach-surface",
            method: "GET",
            accessToken: accessToken,
            queryItems: sessionKey.map { [URLQueryItem(name: "sessionKey", value: $0)] } ?? []
        )

        let (data, response) = try await execute(request)
        return try decode(CoachSurfaceResponse.self, from: data, response: response)
    }

    func sendMessage(
        accessToken: String,
        requestBody: MessageIngressRequest,
        idempotencyKey: String
    ) async throws -> MessageAcceptedResponse {
        let request = try makeRequest(
            path: "/v1/messages",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(MessageAcceptedResponse.self, from: data, response: response)
    }

    private func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                throw mapHTTPError(statusCode: httpResponse.statusCode, data: data)
            }

            return (data, httpResponse)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data, response: HTTPURLResponse) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.serverError(message: "Failed to decode server response", statusCode: response.statusCode)
        }
    }

    private func makeRequest(
        path: String,
        method: String = "GET",
        accessToken: String? = nil,
        queryItems: [URLQueryItem] = [],
        additionalHeaders: [String: String] = [:]
    ) throws -> URLRequest {
        guard var components = URLComponents(string: "\(baseURL)\(path)") else {
            throw APIError.invalidURL
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        additionalHeaders.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }

        return request
    }

    private func makeRequest<Body: Encodable>(
        path: String,
        method: String,
        accessToken: String? = nil,
        queryItems: [URLQueryItem] = [],
        body: Body,
        additionalHeaders: [String: String] = [:]
    ) throws -> URLRequest {
        var request = try makeRequest(
            path: path,
            method: method,
            accessToken: accessToken,
            queryItems: queryItems,
            additionalHeaders: additionalHeaders
        )

        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func mapHTTPError(statusCode: Int, data: Data) -> APIError {
        let message = String(data: data, encoding: .utf8) ?? "Server error"

        switch statusCode {
        case 401:
            return .unauthorized
        case 403:
            return .forbidden
        default:
            return .serverError(message: message, statusCode: statusCode)
        }
    }
}
