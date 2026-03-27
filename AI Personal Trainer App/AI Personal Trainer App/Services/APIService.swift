import Foundation

final class APIService: ObservableObject {
    static let shared = APIService()

    private static let baseURLDefaultsKey = "APIBaseURL"
    private static let baseURLInfoPlistKey = "APIBaseURL"

    @Published private(set) var baseURL: String

    private let session: URLSession

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 120

        session = URLSession(configuration: configuration)
        baseURL = Self.loadBaseURL()
    }

    func setBaseURL(_ url: String) {
        guard let normalizedURL = Self.normalizedBaseURL(url) else { return }
        baseURL = normalizedURL
        UserDefaults.standard.set(normalizedURL, forKey: Self.baseURLDefaultsKey)
    }

    func resetBaseURL() {
        UserDefaults.standard.removeObject(forKey: Self.baseURLDefaultsKey)
        baseURL = Self.loadBaseURL()
    }

    func healthCheck() async throws -> Bool {
        let request = try makeRequest(path: "/health")
        let (_, response) = try await session.data(for: request)
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

    func resetSession(
        accessToken: String,
        requestBody: SessionResetRequest,
        idempotencyKey: String
    ) async throws -> SessionResetResponse {
        let request = try makeRequest(
            path: "/v1/sessions/reset",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(SessionResetResponse.self, from: data, response: response)
    }

    func completeCurrentSet(
        accessToken: String,
        requestBody: CompleteCurrentSetRequest,
        idempotencyKey: String
    ) async throws -> WorkoutExecutionActionResponse {
        let request = try makeRequest(
            path: "/v1/workout-actions/complete-current-set",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(WorkoutExecutionActionResponse.self, from: data, response: response)
    }

    func startWorkout(
        accessToken: String,
        requestBody: WorkoutSessionControlRequest,
        idempotencyKey: String
    ) async throws -> WorkoutExecutionActionResponse {
        let request = try makeRequest(
            path: "/v1/workout-actions/start-workout",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(WorkoutExecutionActionResponse.self, from: data, response: response)
    }

    func skipCurrentExercise(
        accessToken: String,
        requestBody: SkipCurrentExerciseRequest,
        idempotencyKey: String
    ) async throws -> WorkoutExecutionActionResponse {
        let request = try makeRequest(
            path: "/v1/workout-actions/skip-current-exercise",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(WorkoutExecutionActionResponse.self, from: data, response: response)
    }

    func pauseWorkout(
        accessToken: String,
        requestBody: WorkoutSessionControlRequest,
        idempotencyKey: String
    ) async throws -> WorkoutExecutionActionResponse {
        let request = try makeRequest(
            path: "/v1/workout-actions/pause-workout",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(WorkoutExecutionActionResponse.self, from: data, response: response)
    }

    func resumeWorkout(
        accessToken: String,
        requestBody: WorkoutSessionControlRequest,
        idempotencyKey: String
    ) async throws -> WorkoutExecutionActionResponse {
        let request = try makeRequest(
            path: "/v1/workout-actions/resume-workout",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(WorkoutExecutionActionResponse.self, from: data, response: response)
    }

    func finishWorkout(
        accessToken: String,
        requestBody: WorkoutSessionControlRequest,
        idempotencyKey: String
    ) async throws -> WorkoutExecutionActionResponse {
        let request = try makeRequest(
            path: "/v1/workout-actions/finish-workout",
            method: "POST",
            accessToken: accessToken,
            body: requestBody,
            additionalHeaders: [
                "Idempotency-Key": idempotencyKey
            ]
        )

        let (data, response) = try await execute(request)
        return try decode(WorkoutExecutionActionResponse.self, from: data, response: response)
    }

    func streamRun(
        accessToken: String,
        streamPath: String,
        lastEventId: String? = nil
    ) -> AsyncThrowingStream<CoachRunStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try makeRequest(
                        path: streamPath,
                        method: "GET",
                        accessToken: accessToken,
                        additionalHeaders: [
                            "Accept": "text/event-stream"
                        ]
                    )

                    if let lastEventId, !lastEventId.isEmpty {
                        request.setValue(lastEventId, forHTTPHeaderField: "Last-Event-ID")
                    }

                    let (bytes, response) = try await session.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        throw APIError.invalidResponse
                    }

                    guard (200...299).contains(httpResponse.statusCode) else {
                        throw APIError.serverError(
                            message: "Unable to open run stream",
                            statusCode: httpResponse.statusCode
                        )
                    }

                    var parser = ServerSentEventParser()

                    for try await line in bytes.lines {
                        if Task.isCancelled {
                            break
                        }

                        if let event = try parser.consume(line) {
                            continuation.yield(event)
                        }
                    }

                    if let event = try parser.flushAtEOF() {
                        continuation.yield(event)
                    }

                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch let error as APIError {
                    continuation.finish(throwing: error)
                } catch {
                    continuation.finish(throwing: APIError.networkError)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
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

    private static func loadBaseURL() -> String {
        if let overrideURL = normalizedBaseURL(UserDefaults.standard.string(forKey: baseURLDefaultsKey)) {
            return overrideURL
        }

        if let configuredURL = normalizedBaseURL(
            Bundle.main.object(forInfoDictionaryKey: baseURLInfoPlistKey) as? String
        ) {
            return configuredURL
        }

        #if targetEnvironment(simulator)
        return "http://127.0.0.1:3000"
        #else
        return "http://localhost:3000"
        #endif
    }

    private static func normalizedBaseURL(_ value: String?) -> String? {
        guard var candidate = value?.trimmingCharacters(in: .whitespacesAndNewlines), !candidate.isEmpty else {
            return nil
        }

        if !candidate.contains("://") {
            candidate = "http://\(candidate)"
        }

        while candidate.hasSuffix("/") {
            candidate.removeLast()
        }

        guard let url = URL(string: candidate), let host = url.host, !host.isEmpty else {
            return nil
        }

        #if targetEnvironment(simulator)
        if host.caseInsensitiveCompare("localhost") == .orderedSame || host == "::1" {
            guard var components = URLComponents(string: candidate) else {
                return nil
            }

            components.host = "127.0.0.1"
            return components.string
        }
        #endif

        return candidate
    }
}

private struct ServerSentEventParser {
    private var currentEventID: String?
    private var currentDataLines: [String] = []

    mutating func consume(_ line: String) throws -> CoachRunStreamEvent? {
        if line.isEmpty {
            return try flush()
        }

        if line.hasPrefix(":") {
            return nil
        }

        if line.hasPrefix("id:") {
            if !currentDataLines.isEmpty {
                let event = try flush()
                currentEventID = value(after: "id:", in: line)
                return event
            }

            currentEventID = value(after: "id:", in: line)
            return nil
        }

        if line.hasPrefix("event:") {
            if !currentDataLines.isEmpty {
                return try flush()
            }

            return nil
        }

        if line.hasPrefix("data:") {
            currentDataLines.append(value(after: "data:", in: line))
        }

        return nil
    }

    mutating func flushAtEOF() throws -> CoachRunStreamEvent? {
        try flush()
    }

    private mutating func flush() throws -> CoachRunStreamEvent? {
        defer {
            currentEventID = nil
            currentDataLines.removeAll(keepingCapacity: true)
        }

        guard !currentDataLines.isEmpty else {
            return nil
        }

        let payload = currentDataLines.joined(separator: "\n")
        var event = try JSONDecoder().decode(CoachRunStreamEvent.self, from: Data(payload.utf8))

        if event.eventId == nil, let currentEventID, let parsedID = Int(currentEventID) {
            event.eventId = parsedID
        }

        return event
    }

    private func value(after prefix: String, in line: String) -> String {
        var value = String(line.dropFirst(prefix.count))
        if value.first == " " {
            value.removeFirst()
        }
        return value
    }
}
