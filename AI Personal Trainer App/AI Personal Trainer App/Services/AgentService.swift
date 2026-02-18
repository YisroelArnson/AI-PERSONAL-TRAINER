//
//  AgentService.swift
//  AI Personal Trainer App
//
//  Service for communicating with the AI Agent backend API.
//  Handles both regular and streaming chat requests.
//

import Foundation
import Supabase

/// Errors specific to agent service operations
enum AgentServiceError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case unauthorized
    case forbidden
    case networkError
    case decodingError(String)
    case streamingError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode):
            return "Server error (status: \(statusCode))"
        case .unauthorized:
            return "Please sign in to continue"
        case .forbidden:
            return "Access denied"
        case .networkError:
            return "Unable to connect to server"
        case .decodingError(let message):
            return "Failed to parse response: \(message)"
        case .streamingError(let message):
            return "Streaming error: \(message)"
        }
    }
}

/// Event types emitted during streaming
enum AgentStreamEventType {
    case action(tool: String, status: ActionStatus, formatted: String?)
    case status(message: String, tool: String, phase: StatusPhase)  // New: for flickering status updates
    case message(String)
    case messageWithArtifact(message: String, artifact: Artifact)  // Message with attached artifact
    case question(text: String, options: [String]?)
    case done(sessionId: String)
    case error(String)
}

/// Phase of a status update
enum StatusPhase: String {
    case start   // Tool is beginning (show with spinner/dots)
    case done    // Tool completed (show with checkmark)
    case error   // Tool failed (show with X)
}

/// Service for agent API communication
class AgentService: ObservableObject {
    // MARK: - Singleton
    static let shared = AgentService()
    
    // MARK: - URL Configuration
    
    private let fallbackIPs = [
        "http://192.168.1.3:3000",
        "http://10.0.0.105:3000",
        "http://192.168.1.171:3000",
        "http://192.168.1.2:3000",
        "http://192.168.1.4:3000"
    ]
    
    @Published private var workingBaseURL: String?
    private var isDiscovering = false
    
    private var baseURL: String {
        if let overrideURL = UserDefaults.standard.string(forKey: "APIBaseURL"), !overrideURL.isEmpty {
            return overrideURL
        }
        
        if let workingURL = workingBaseURL {
            return workingURL
        }
        
        // Check for cached working URL from previous app session
        if let cachedURL = UserDefaults.standard.string(forKey: "CachedWorkingAPIURL"), !cachedURL.isEmpty {
            return cachedURL
        }
        
        #if targetEnvironment(simulator)
        return "http://localhost:3000"
        #else
        return fallbackIPs[0]
        #endif
    }
    
    private func getURLsToTry() -> [String] {
        if let overrideURL = UserDefaults.standard.string(forKey: "APIBaseURL"), !overrideURL.isEmpty {
            return [overrideURL]
        }
        
        #if targetEnvironment(simulator)
        return ["http://localhost:3000"]
        #else
        // Prioritize cached/working URL, then try all fallbacks
        var urlsToTry: [String] = []
        
        if let workingURL = workingBaseURL {
            urlsToTry.append(workingURL)
        } else if let cachedURL = UserDefaults.standard.string(forKey: "CachedWorkingAPIURL"), !cachedURL.isEmpty {
            urlsToTry.append(cachedURL)
        }
        
        for ip in fallbackIPs {
            if !urlsToTry.contains(ip) {
                urlsToTry.append(ip)
            }
        }
        
        return urlsToTry
        #endif
    }
    
    // MARK: - Fast URL Discovery
    
    /// Quickly test all URLs in parallel to find the working one
    private func discoverWorkingURL() async -> String? {
        let urlsToTest: [String]
        
        #if targetEnvironment(simulator)
        urlsToTest = ["http://localhost:3000"]
        #else
        urlsToTest = fallbackIPs
        #endif
        
        print("🤖 Agent: Starting parallel URL discovery for \(urlsToTest.count) URLs...")
        
        return await withTaskGroup(of: (String, Bool).self) { group in
            for baseURL in urlsToTest {
                group.addTask {
                    let isWorking = await self.testURL(baseURL)
                    return (baseURL, isWorking)
                }
            }
            
            for await (url, isWorking) in group {
                if isWorking {
                    print("✅ Agent: Found working URL: \(url)")
                    group.cancelAll()
                    return url
                }
            }
            
            return nil
        }
    }
    
    /// Test if a URL is reachable with a fast health check
    private func testURL(_ baseURL: String) async -> Bool {
        guard let url = URL(string: "\(baseURL)/") else {
            return false
        }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 2 // Fast 2-second timeout
        request.httpMethod = "GET"
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                return httpResponse.statusCode >= 200 && httpResponse.statusCode < 300
            }
            return false
        } catch {
            return false
        }
    }
    
    /// Ensure we have a working URL, discovering it if necessary
    private func ensureWorkingURL() async {
        if workingBaseURL != nil || UserDefaults.standard.string(forKey: "APIBaseURL") != nil {
            return
        }
        
        guard !isDiscovering else { return }
        
        isDiscovering = true
        defer { isDiscovering = false }
        
        if let discoveredURL = await discoverWorkingURL() {
            await MainActor.run {
                self.workingBaseURL = discoveredURL
            }
            UserDefaults.standard.set(discoveredURL, forKey: "CachedWorkingAPIURL")
            print("💾 Agent: Cached working URL: \(discoveredURL)")
        }
    }
    
    // MARK: - Authentication
    
    private func getAuthToken() async throws -> String {
        let session = try await supabase.auth.session
        return session.accessToken
    }
    
    private func createAuthenticatedRequest(url: URL) async throws -> URLRequest {
        var request = URLRequest(url: url)
        let token = try await getAuthToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }
    
    // MARK: - Network Helpers
    
    private func extractEndpoint(from url: URL) -> String? {
        let path = url.path
        let query = url.query.map { "?\($0)" } ?? ""
        return path + query
    }
    
    private func dataWithFallback(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        // If we don't have a working URL yet, try to discover it quickly
        if workingBaseURL == nil && UserDefaults.standard.string(forKey: "APIBaseURL") == nil {
            await ensureWorkingURL()
        }
        
        var lastError: Error?
        let urlsToTry = getURLsToTry()
        
        for baseURLToTry in urlsToTry {
            do {
                guard let originalURL = request.url,
                      let endpoint = extractEndpoint(from: originalURL) else {
                    throw AgentServiceError.invalidURL
                }
                
                guard let newURL = URL(string: "\(baseURLToTry)\(endpoint)") else {
                    throw AgentServiceError.invalidURL
                }
                
                var newRequest = request
                newRequest.url = newURL
                newRequest.timeoutInterval = 30
                
                print("🤖 Agent API request to: \(baseURLToTry)\(endpoint)")
                
                let (data, response) = try await URLSession.shared.data(for: newRequest)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw AgentServiceError.invalidResponse
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    await MainActor.run {
                        self.workingBaseURL = baseURLToTry
                    }
                    UserDefaults.standard.set(baseURLToTry, forKey: "CachedWorkingAPIURL")
                    print("✅ Agent API connected to: \(baseURLToTry)")
                }
                
                return (data, httpResponse)
                
            } catch let error as URLError where error.code == .timedOut || error.code == .cannotConnectToHost || error.code == .networkConnectionLost {
                print("❌ Agent API failed to connect to \(baseURLToTry): \(error.localizedDescription)")
                lastError = error
                continue
            } catch {
                throw error
            }
        }
        
        throw lastError ?? AgentServiceError.networkError
    }
    
    private func bytesWithFallback(for request: URLRequest) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        // If we don't have a working URL yet, try to discover it quickly
        if workingBaseURL == nil && UserDefaults.standard.string(forKey: "APIBaseURL") == nil {
            await ensureWorkingURL()
        }
        
        var lastError: Error?
        let urlsToTry = getURLsToTry()
        
        for baseURLToTry in urlsToTry {
            do {
                guard let originalURL = request.url,
                      let endpoint = extractEndpoint(from: originalURL) else {
                    throw AgentServiceError.invalidURL
                }
                
                guard let newURL = URL(string: "\(baseURLToTry)\(endpoint)") else {
                    throw AgentServiceError.invalidURL
                }
                
                var newRequest = request
                newRequest.url = newURL
                newRequest.timeoutInterval = 120 // Longer timeout for agent processing
                
                print("🤖 Agent streaming request to: \(baseURLToTry)\(endpoint)")
                
                let (asyncBytes, response) = try await URLSession.shared.bytes(for: newRequest)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw AgentServiceError.invalidResponse
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    await MainActor.run {
                        self.workingBaseURL = baseURLToTry
                    }
                    UserDefaults.standard.set(baseURLToTry, forKey: "CachedWorkingAPIURL")
                    print("✅ Agent streaming connected to: \(baseURLToTry)")
                }
                
                return (asyncBytes, httpResponse)
                
            } catch let error as URLError where error.code == .timedOut || error.code == .cannotConnectToHost || error.code == .networkConnectionLost {
                print("❌ Agent streaming failed to connect to \(baseURLToTry): \(error.localizedDescription)")
                lastError = error
                continue
            } catch {
                throw error
            }
        }
        
        throw lastError ?? AgentServiceError.networkError
    }
    
    // MARK: - URL Management
    
    /// Clear the cached working URL to force re-discovery
    func clearCachedURL() {
        workingBaseURL = nil
        UserDefaults.standard.removeObject(forKey: "CachedWorkingAPIURL")
        print("🔄 Agent: Cleared cached API URL - will rediscover on next request")
    }
    
    /// Manually trigger URL discovery (useful for testing or when switching networks)
    func discoverURL() async {
        await ensureWorkingURL()
    }
    
    // MARK: - API Methods
    
    /// Send a chat message to the agent (non-streaming)
    /// - Parameters:
    ///   - message: The user's message
    ///   - sessionId: Optional existing session ID
    ///   - includeWorkoutContext: Whether to include the current workout state (default: true)
    /// - Returns: The agent's response
    func sendMessage(_ message: String, sessionId: String? = nil, includeWorkoutContext: Bool = true) async throws -> AgentChatResponse {
        guard let url = URL(string: "\(baseURL)/agent/chat") else {
            throw AgentServiceError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        // Get current workout state if requested
        let currentWorkout: CurrentWorkoutPayload?
        if includeWorkoutContext {
            currentWorkout = await WorkoutStore.shared.getCurrentWorkoutPayload()
        } else {
            currentWorkout = nil
        }
        
        let body = AgentChatRequest(message: message, sessionId: sessionId, currentWorkout: currentWorkout)
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw AgentServiceError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw AgentServiceError.forbidden
            }
            throw AgentServiceError.httpError(statusCode: httpResponse.statusCode)
        }
        
        do {
            let response = try JSONDecoder().decode(AgentChatResponse.self, from: data)
            return response
        } catch {
            print("❌ Failed to decode agent response: \(error)")
            throw AgentServiceError.decodingError(error.localizedDescription)
        }
    }
    
    /// Stream a chat message to the agent
    /// - Parameters:
    ///   - message: The user's message
    ///   - sessionId: Optional existing session ID
    ///   - includeWorkoutContext: Whether to include the current workout state (default: true)
    ///   - onEvent: Callback for each streaming event
    func streamMessage(
        _ message: String,
        sessionId: String? = nil,
        includeWorkoutContext: Bool = true,
        onEvent: @escaping (AgentStreamEventType) -> Void
    ) async throws {
        guard let url = URL(string: "\(baseURL)/agent/stream") else {
            throw AgentServiceError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        // Get current workout state if requested
        let currentWorkout: CurrentWorkoutPayload?
        if includeWorkoutContext {
            currentWorkout = await WorkoutStore.shared.getCurrentWorkoutPayload()
        } else {
            currentWorkout = nil
        }
        
        let body = AgentChatRequest(message: message, sessionId: sessionId, currentWorkout: currentWorkout)
        request.httpBody = try JSONEncoder().encode(body)
        
        let (asyncBytes, httpResponse) = try await bytesWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw AgentServiceError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw AgentServiceError.forbidden
            }
            throw AgentServiceError.httpError(statusCode: httpResponse.statusCode)
        }
        
        for try await line in asyncBytes.lines {
            guard !line.isEmpty else { continue }
            
            // SSE format: "data: {...}"
            let jsonString: String
            if line.hasPrefix("data: ") {
                jsonString = String(line.dropFirst(6))
            } else {
                jsonString = line
            }
            
            guard let jsonData = jsonString.data(using: .utf8) else { continue }
            
            do {
                let event = try JSONDecoder().decode(AgentStreamEvent.self, from: jsonData)

                // Debug: Log message_notify_user events with raw JSON
                if event.type == "message_notify_user" {
                    print("🔍 Raw message_notify_user JSON: \(jsonString.prefix(500))...")
                }

                let eventType = parseStreamEvent(event)

                await MainActor.run {
                    onEvent(eventType)
                }

                // Stop on done or error
                if case .done = eventType { return }
                if case .error = eventType { return }

            } catch {
                print("⚠️ Failed to decode streaming event: \(error)")
                print("   Raw line: \(jsonString)")
            }
        }
    }
    
    /// Parse a raw stream event into a typed event
    private func parseStreamEvent(_ event: AgentStreamEvent) -> AgentStreamEventType {
        switch event.type {
        case "done":
            return .done(sessionId: event.sessionId ?? "")
            
        case "error":
            return .error(event.message ?? "Unknown error")
            
        case "status":
            // New: status updates for flickering text UI
            let message = event.data?.statusMessage ?? event.data?.message ?? "Working..."
            let tool = event.data?.tool ?? ""
            let phaseStr = event.data?.phase ?? "start"
            let phase: StatusPhase = {
                switch phaseStr {
                case "done": return .done
                case "error": return .error
                default: return .start
                }
            }()
            return .status(message: message, tool: tool, phase: phase)
            
        case "message_notify_user":
            let message = event.data?.message ?? ""
            // Check if artifact is attached (either at top level or in data)
            print("📦 message_notify_user received - message: \"\(message.prefix(50))...\"")
            print("   event.artifact: \(event.artifact != nil ? "present" : "nil")")
            print("   event.data?.artifact: \(event.data?.artifact != nil ? "present" : "nil")")
            if let artifact = event.artifact ?? event.data?.artifact {
                print("   ✅ Artifact found! ID: \(artifact.artifactId), title: \(artifact.title)")
                return .messageWithArtifact(message: message, artifact: artifact)
            }
            return .message(message)
            
        case "message_ask_user":
            if let question = event.data?.question {
                return .question(text: question, options: event.data?.options)
            }
            return .question(text: "", options: nil)
            
        case "knowledge":
            // Knowledge/context events from initializer agent
            // Treat as a completed action step
            let source = event.data?.source ?? "context"
            return .action(tool: source, status: .done, formatted: nil)

        default:
            // Tool execution events
            let status: ActionStatus
            if let statusStr = event.data?.status {
                status = statusStr == "done" ? .done : (statusStr == "failed" ? .failed : .running)
            } else {
                status = .running
            }
            // Extract formatted result from either top-level or data field
            let formatted = event.formatted ?? event.data?.formatted
            return .action(tool: event.type, status: status, formatted: formatted)
        }
    }
    
    // MARK: - Session Management
    
    /// Get user's chat sessions
    /// - Parameter limit: Maximum number of sessions to return
    /// - Returns: Array of chat sessions
    func getSessions(limit: Int = 10) async throws -> [AgentSession] {
        guard let url = URL(string: "\(baseURL)/agent/sessions?limit=\(limit)") else {
            throw AgentServiceError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "GET"
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw AgentServiceError.unauthorized
            }
            throw AgentServiceError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let response = try JSONDecoder().decode(AgentSessionsResponse.self, from: data)
        return response.sessions
    }
    
    /// Create a new chat session
    /// - Returns: The newly created session
    func createSession() async throws -> AgentSession {
        guard let url = URL(string: "\(baseURL)/agent/sessions") else {
            throw AgentServiceError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw AgentServiceError.unauthorized
            }
            throw AgentServiceError.httpError(statusCode: httpResponse.statusCode)
        }
        
        struct SessionResponse: Decodable {
            let session: AgentSession
        }
        
        let response = try JSONDecoder().decode(SessionResponse.self, from: data)
        return response.session
    }
}
