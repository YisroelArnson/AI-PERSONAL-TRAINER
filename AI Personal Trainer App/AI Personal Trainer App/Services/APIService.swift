//
//  APIService.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation
import Supabase

class APIService: ObservableObject {
    // MARK: - API Base URL Configuration
    // Automatically detects simulator vs device and uses appropriate endpoint
    // Can be overridden via UserDefaults with key "APIBaseURL"
    
    // List of fallback IPs to try for physical devices
    private let fallbackIPs = [
        "http://192.168.1.171:3000",
        "http://192.168.1.2:3000",
        "http://192.168.1.4:3000"
    ]
    
    // Track which IP is currently working
    @Published private var workingBaseURL: String?
    
    private var baseURL: String {
        // Check for manual override first
        if let overrideURL = UserDefaults.standard.string(forKey: "APIBaseURL"), !overrideURL.isEmpty {
            return overrideURL
        }
        
        // If we have a working URL from a previous successful request, use it
        if let workingURL = workingBaseURL {
            return workingURL
        }
        
        // Detect simulator vs device
        #if targetEnvironment(simulator)
        // Simulator: use localhost (same machine as backend)
        return "http://localhost:3000"
        #else
        // Physical device: return first fallback IP (will try others if this fails)
        return fallbackIPs[0]
        #endif
    }
    
    // Helper method to get all URLs to try in order
    private func getURLsToTry() -> [String] {
        // Check for manual override first
        if let overrideURL = UserDefaults.standard.string(forKey: "APIBaseURL"), !overrideURL.isEmpty {
            return [overrideURL]
        }
        
        #if targetEnvironment(simulator)
        return ["http://localhost:3000"]
        #else
        // On device, try the working URL first if we have one, otherwise try all fallbacks
        if let workingURL = workingBaseURL {
            return [workingURL] + fallbackIPs.filter { $0 != workingURL }
        } else {
            return fallbackIPs
        }
        #endif
    }
    
    // Helper to perform data request with automatic fallback
    private func dataWithFallback(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var lastError: Error?
        let urlsToTry = getURLsToTry()
        
        for baseURLToTry in urlsToTry {
            do {
                // Reconstruct the request with the new base URL
                guard let originalURL = request.url,
                      let endpoint = extractEndpoint(from: originalURL) else {
                    throw APIError.invalidURL
                }
                
                guard let newURL = URL(string: "\(baseURLToTry)\(endpoint)") else {
                    throw APIError.invalidURL
                }
                
                var newRequest = request
                newRequest.url = newURL
                newRequest.timeoutInterval = 5 // Quick timeout for faster fallback
                
                print("🔄 Trying API request to: \(baseURLToTry)")
                
                let (data, response) = try await URLSession.shared.data(for: newRequest)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw APIError.invalidResponse
                }
                
                // Connection successful - update working URL
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    await MainActor.run {
                        self.workingBaseURL = baseURLToTry
                    }
                    print("✅ Successfully connected to: \(baseURLToTry)")
                }
                
                return (data, httpResponse)
                
            } catch let error as URLError where error.code == .timedOut || error.code == .cannotConnectToHost || error.code == .networkConnectionLost {
                print("❌ Failed to connect to \(baseURLToTry): \(error.localizedDescription)")
                lastError = error
                continue // Try next URL
            } catch {
                // For other errors (like auth errors), don't retry
                throw error
            }
        }
        
        // All URLs failed
        throw lastError ?? APIError.networkError
    }
    
    // Helper to perform bytes request with automatic fallback (for streaming)
    private func bytesWithFallback(for request: URLRequest) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        var lastError: Error?
        let urlsToTry = getURLsToTry()
        
        for baseURLToTry in urlsToTry {
            do {
                // Reconstruct the request with the new base URL
                guard let originalURL = request.url,
                      let endpoint = extractEndpoint(from: originalURL) else {
                    throw APIError.invalidURL
                }
                
                guard let newURL = URL(string: "\(baseURLToTry)\(endpoint)") else {
                    throw APIError.invalidURL
                }
                
                var newRequest = request
                newRequest.url = newURL
                newRequest.timeoutInterval = 60 // Longer timeout for streaming (exercises can take time to generate)
                
                print("🔄 Trying streaming API request to: \(baseURLToTry)")
                
                let (asyncBytes, response) = try await URLSession.shared.bytes(for: newRequest)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw APIError.invalidResponse
                }
                
                // Connection successful - update working URL
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    await MainActor.run {
                        self.workingBaseURL = baseURLToTry
                    }
                    print("✅ Successfully connected to: \(baseURLToTry)")
                }
                
                return (asyncBytes, httpResponse)
                
            } catch let error as URLError where error.code == .timedOut || error.code == .cannotConnectToHost || error.code == .networkConnectionLost {
                print("❌ Failed to connect to \(baseURLToTry): \(error.localizedDescription)")
                lastError = error
                continue // Try next URL
            } catch {
                // For other errors (like auth errors), don't retry
                throw error
            }
        }
        
        // All URLs failed
        throw lastError ?? APIError.networkError
    }
    
    // Extract endpoint path from full URL
    private func extractEndpoint(from url: URL) -> String? {
        let path = url.path
        let query = url.query.map { "?\($0)" } ?? ""
        return path + query
    }
    
    // MARK: - API URL Management
    
    /// Get the current API base URL being used
    var currentBaseURL: String {
        return baseURL
    }
    
    /// Set a custom API base URL (for testing on different networks)
    /// Pass nil to reset to default (simulator uses localhost, device uses configured IP)
    /// Example: setAPIBaseURL("http://192.168.1.100:3000")
    func setAPIBaseURL(_ url: String?) {
        if let url = url, !url.isEmpty {
            UserDefaults.standard.set(url, forKey: "APIBaseURL")
        } else {
            UserDefaults.standard.removeObject(forKey: "APIBaseURL")
        }
    }
    
    // MARK: - Authentication Helpers
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
    
    // MARK: - API Endpoints
    func fetchMessage() async throws -> String {
        guard let url = URL(string: "\(baseURL)/") else {
            throw APIError.invalidURL
        }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(APIResponse.self, from: data)
        return apiResponse.message
    }
    
    func fetchRecommendations(exerciseCount: Int? = 8) async throws -> ExerciseRecommendations {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/recommend/exercises/\(userId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        var requestBody: [String: Any] = [:]
        if let exerciseCount = exerciseCount {
            requestBody["exerciseCount"] = exerciseCount
        }
        let jsonData = try JSONSerialization.data(withJSONObject: requestBody)
        request.httpBody = jsonData
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(RecommendAPIResponse.self, from: data)
        let exercises = apiResponse.data.recommendations.map { rec in
            Exercise(from: rec)
        }
        
        return ExerciseRecommendations(exercises: exercises)
    }
    
    func streamRecommendations(
        exerciseCount: Int? = 8,
        onExercise: @escaping (StreamingExercise) -> Void,
        onComplete: @escaping (Int) -> Void,
        onError: @escaping (String) -> Void
    ) async throws {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/recommend/stream/\(userId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        var requestBody: [String: Any] = [:]
        if let exerciseCount = exerciseCount {
            requestBody["exerciseCount"] = exerciseCount
        }
        let jsonData = try JSONSerialization.data(withJSONObject: requestBody)
        request.httpBody = jsonData
        
        let (asyncBytes, httpResponse) = try await bytesWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        var exerciseCount = 0
        var hasCompleted = false
        
        for try await line in asyncBytes.lines {
            guard !line.isEmpty else { continue }
            
            print("📥 Received streaming line: \(line)")
            
            do {
                let messageData = line.data(using: .utf8) ?? Data()
                let message = try JSONDecoder().decode(StreamingMessage.self, from: messageData)
                
                print("📨 Decoded message type: \(message.type)")
                
                switch message.type {
                case "metadata":
                    print("Streaming started for user: \(message.userId ?? "unknown")")
                    
                case "exercise":
                    if let exerciseData = message.data {
                        exerciseCount += 1
                        let currentCount = exerciseCount
                        await MainActor.run {
                            onExercise(exerciseData)
                        }
                        print("✅ Processed exercise \(currentCount)")
                    }
                    
                case "complete":
                    let totalExercises = message.totalExercises ?? exerciseCount
                    print("🏁 Streaming complete! Total exercises: \(totalExercises)")
                    hasCompleted = true
                    await MainActor.run {
                        onComplete(totalExercises)
                    }
                    return
                    
                case "error":
                    let errorMessage = message.error ?? "Unknown streaming error"
                    print("❌ Streaming error: \(errorMessage)")
                    await MainActor.run {
                        onError(errorMessage)
                    }
                    return
                    
                default:
                    print("⚠️ Unknown message type: \(message.type)")
                }
            } catch {
                print("❌ Failed to decode streaming message: \(error)")
                print("   Raw line: \(line)")
                // Don't call onError for every decode failure, just log it
                // The stream might have ended naturally
            }
        }
        
        // If we reach here and haven't completed, call onComplete with what we have
        if !hasCompleted {
            let finalCount = exerciseCount
            print("⚠️ Stream ended without complete message. Completing with \(finalCount) exercises")
            await MainActor.run {
                onComplete(finalCount)
            }
        }
    }
    
    func parsePreference(preferenceText: String, currentPreference: CurrentPreferenceContext? = nil) async throws -> ParsedPreference {
        guard let url = URL(string: "\(baseURL)/preferences/parse") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let requestBody = ParsePreferenceRequest(
            preferenceText: preferenceText,
            currentPreference: currentPreference
        )
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(requestBody)
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(ParsePreferenceResponse.self, from: data)
        
        guard apiResponse.success, let parsedPreference = apiResponse.data else {
            throw APIError.invalidResponse
        }
        
        return parsedPreference
    }
    
    func parseCategoryGoals(goalsText: String, currentGoals: [CategoryGoalItem]? = nil) async throws -> ParsedCategoryGoals {
        guard let url = URL(string: "\(baseURL)/category-goals/parse") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let currentGoalsContext = currentGoals?.map { goal in
            CategoryGoalContext(
                category: goal.category,
                description: goal.description,
                weight: goal.weight,
                enabled: goal.enabled
            )
        }
        
        let requestBody = ParseCategoryGoalsRequest(
            goalsText: goalsText,
            currentGoals: currentGoalsContext
        )
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(requestBody)
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(ParseCategoryGoalsResponse.self, from: data)
        
        guard apiResponse.success, let parsedGoals = apiResponse.data else {
            throw APIError.invalidResponse
        }
        
        return parsedGoals
    }
    
    func parseMuscleGoals(goalsText: String, currentGoals: [String: Double]? = nil) async throws -> ParsedMuscleGoals {
        guard let url = URL(string: "\(baseURL)/muscle-goals/parse") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let requestBody = ParseMuscleGoalsRequest(
            goalsText: goalsText,
            currentGoals: currentGoals
        )
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(requestBody)
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(ParseMuscleGoalsResponse.self, from: data)
        
        guard apiResponse.success, let parsedGoals = apiResponse.data else {
            throw APIError.invalidResponse
        }
        
        return parsedGoals
    }
    
    // MARK: - Exercise Logging
    
    /// Log a completed exercise and return the database record ID
    /// - Parameter exercise: The exercise to log
    /// - Returns: The UUID string of the created workout history record
    func logCompletedExercise(exercise: Exercise) async throws -> String {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/exercises/log/\(userId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let exerciseData = exercise.toLoggingFormat()
        let jsonData = try JSONSerialization.data(withJSONObject: exerciseData)
        request.httpBody = jsonData
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 201 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        // Parse the response to get the database record ID
        let response = try JSONDecoder().decode(LogExerciseResponse.self, from: data)
        
        print("✅ Successfully logged exercise: \(exercise.name) with ID: \(response.data.id)")
        return response.data.id
    }
    
    /// Delete a completed exercise (undo completion)
    /// - Parameter workoutHistoryId: The UUID string of the workout history record to delete
    func deleteCompletedExercise(workoutHistoryId: String) async throws {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/exercises/log/\(userId)/\(workoutHistoryId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "DELETE"
        
        let (_, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        print("✅ Successfully deleted exercise with ID: \(workoutHistoryId)")
    }
    
    // MARK: - Workout History
    
    func fetchWorkoutHistory(startDate: Date? = nil, endDate: Date? = nil, limit: Int? = nil) async throws -> [WorkoutHistoryItem] {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        var urlComponents = URLComponents(string: "\(baseURL)/exercises/history/\(userId)")
        var queryItems: [URLQueryItem] = []
        
        if let startDate = startDate {
            let formatter = ISO8601DateFormatter()
            queryItems.append(URLQueryItem(name: "startDate", value: formatter.string(from: startDate)))
        }
        
        if let endDate = endDate {
            let formatter = ISO8601DateFormatter()
            queryItems.append(URLQueryItem(name: "endDate", value: formatter.string(from: endDate)))
        }
        
        if let limit = limit {
            queryItems.append(URLQueryItem(name: "limit", value: String(limit)))
        }
        
        if !queryItems.isEmpty {
            urlComponents?.queryItems = queryItems
        }
        
        guard let url = urlComponents?.url else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "GET"
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(WorkoutHistoryAPIResponse.self, from: data)
        return apiResponse.data
    }
    

    // MARK: - Exercise Distribution Tracking
    
    func resetDistributionTracking() async throws {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/exercises/distribution/reset/\(userId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let (_, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        print("✅ Successfully reset distribution tracking")
    }
    
    func fetchDistributionMetrics() async throws -> DistributionMetrics {
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/exercises/distribution/\(userId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "GET"
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(DistributionAPIResponse.self, from: data)
        return apiResponse.data
    }
    
    // MARK: - User Settings
    
    func fetchUserSettings() async throws -> UserSettingsData {
        guard let url = URL(string: "\(baseURL)/user-settings") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "GET"
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(UserSettingsAPIResponse.self, from: data)
        return apiResponse.data
    }
    
    func updateUserSettings(weightUnit: String?, distanceUnit: String?) async throws -> UserSettingsData {
        guard let url = URL(string: "\(baseURL)/user-settings") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "PUT"
        
        var body: [String: String] = [:]
        if let weightUnit = weightUnit {
            body["weight_unit"] = weightUnit
        }
        if let distanceUnit = distanceUnit {
            body["distance_unit"] = distanceUnit
        }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, httpResponse) = try await dataWithFallback(for: request)
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let apiResponse = try JSONDecoder().decode(UserSettingsAPIResponse.self, from: data)
        return apiResponse.data
    }
}

