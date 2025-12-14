//
//  IntervalService.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 12/7/25.
//

import Foundation
import Supabase

/// Service for fetching interval timer data from the backend
@MainActor
class IntervalService: ObservableObject {
    // MARK: - Singleton
    
    static let shared = IntervalService()
    
    // MARK: - Published Properties
    
    @Published var isLoading = false
    @Published var error: String?
    
    // MARK: - Cache
    
    /// In-memory cache of interval data keyed by exercise name
    private var cache: [String: IntervalTimerData] = [:]
    
    // MARK: - API Configuration
    
    private var baseURL: String {
        // Check for manual override first
        if let overrideURL = UserDefaults.standard.string(forKey: "APIBaseURL"), !overrideURL.isEmpty {
            return overrideURL
        }
        
        #if targetEnvironment(simulator)
        return "http://localhost:3000"
        #else
        // Physical device fallback IPs
        let fallbackIPs = [
            "http://192.168.1.171:3000",
            "http://192.168.1.2:3000",
            "http://192.168.1.4:3000"
        ]
        return fallbackIPs[0]
        #endif
    }
    
    // MARK: - Initialization
    
    private init() {}
    
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
        request.timeoutInterval = 30
        return request
    }
    
    // MARK: - Public API
    
    /// Fetch interval data for a single exercise
    /// - Parameter exercise: The exercise to generate intervals for
    /// - Returns: IntervalTimerData if successful
    func fetchIntervals(for exercise: UIExercise) async throws -> IntervalTimerData {
        // Check cache first
        if let cached = cache[exercise.exercise_name] {
            print("⏱️ IntervalService: Using cached intervals for \(exercise.exercise_name)")
            return cached
        }
        
        isLoading = true
        error = nil
        
        defer { isLoading = false }
        
        guard let url = URL(string: "\(baseURL)/intervals/exercise") else {
            throw IntervalServiceError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        // Build exercise payload
        let exercisePayload = buildExercisePayload(from: exercise)
        let body: [String: Any] = ["exercise": exercisePayload]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        print("⏱️ IntervalService: Fetching intervals for \(exercise.exercise_name)")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw IntervalServiceError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw IntervalServiceError.unauthorized
            }
            throw IntervalServiceError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let intervalResponse = try JSONDecoder().decode(IntervalResponse.self, from: data)
        
        guard intervalResponse.success, let intervalData = intervalResponse.data else {
            let errorMessage = intervalResponse.error ?? intervalResponse.details ?? "Unknown error"
            self.error = errorMessage
            throw IntervalServiceError.serverError(errorMessage)
        }
        
        // Cache the result
        cache[exercise.exercise_name] = intervalData
        
        print("✅ IntervalService: Generated \(intervalData.phases.count) phases for \(exercise.exercise_name)")
        
        return intervalData
    }
    
    /// Fetch interval data for multiple exercises in parallel
    /// - Parameter exercises: Array of exercises to generate intervals for
    /// - Returns: Dictionary mapping exercise names to their interval data
    func fetchBatchIntervals(for exercises: [UIExercise]) async throws -> [String: IntervalTimerData] {
        isLoading = true
        error = nil
        
        defer { isLoading = false }
        
        // Filter out exercises that are already cached
        let uncachedExercises = exercises.filter { cache[$0.exercise_name] == nil }
        
        // If all are cached, return from cache
        if uncachedExercises.isEmpty {
            print("⏱️ IntervalService: All \(exercises.count) exercises cached")
            var result: [String: IntervalTimerData] = [:]
            for exercise in exercises {
                if let cached = cache[exercise.exercise_name] {
                    result[exercise.exercise_name] = cached
                }
            }
            return result
        }
        
        guard let url = URL(string: "\(baseURL)/intervals/batch") else {
            throw IntervalServiceError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        // Build exercises payload
        let exercisePayloads = uncachedExercises.map { buildExercisePayload(from: $0) }
        let body: [String: Any] = ["exercises": exercisePayloads]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        print("⏱️ IntervalService: Fetching batch intervals for \(uncachedExercises.count) exercises")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw IntervalServiceError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw IntervalServiceError.unauthorized
            }
            throw IntervalServiceError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let batchResponse = try JSONDecoder().decode(BatchIntervalResponse.self, from: data)
        
        guard batchResponse.success, let batchData = batchResponse.data else {
            let errorMessage = batchResponse.error ?? "Unknown error"
            self.error = errorMessage
            throw IntervalServiceError.serverError(errorMessage)
        }
        
        // Cache all results
        for intervalData in batchData.intervals {
            cache[intervalData.exercise_name] = intervalData
        }
        
        // Log any failures
        if let failed = batchData.failed, !failed.isEmpty {
            print("⚠️ IntervalService: \(failed.count) exercises failed:")
            for failure in failed {
                print("   - \(failure.exercise_name): \(failure.error)")
            }
        }
        
        // Build result including cached items
        var result: [String: IntervalTimerData] = [:]
        for exercise in exercises {
            if let cached = cache[exercise.exercise_name] {
                result[exercise.exercise_name] = cached
            }
        }
        
        print("✅ IntervalService: Batch complete - \(result.count) intervals available")
        
        return result
    }
    
    /// Get cached interval data for an exercise (doesn't fetch if not cached)
    /// - Parameter exerciseName: Name of the exercise
    /// - Returns: Cached IntervalTimerData or nil
    func getCachedIntervals(for exerciseName: String) -> IntervalTimerData? {
        return cache[exerciseName]
    }
    
    /// Clear all cached interval data
    func clearCache() {
        cache.removeAll()
        print("🗑️ IntervalService: Cache cleared")
    }
    
    /// Clear cached interval data for a specific exercise
    func clearCache(for exerciseName: String) {
        cache.removeValue(forKey: exerciseName)
    }
    
    // MARK: - Helper Methods
    
    /// Build the exercise payload dictionary for the API request
    private func buildExercisePayload(from exercise: UIExercise) -> [String: Any] {
        var payload: [String: Any] = [
            "exercise_name": exercise.exercise_name,
            "exercise_type": exercise.type
        ]
        
        // Add type-specific fields
        switch exercise.type {
        case "strength", "bodyweight":
            if let sets = exercise.sets {
                payload["sets"] = sets
            }
            if let reps = exercise.reps {
                payload["reps"] = reps
            }
            if let weights = exercise.load_kg_each {
                payload["load_kg_each"] = weights
            }
            if let rest = exercise.rest_seconds {
                payload["rest_seconds"] = rest
            }
            
        case "cardio_distance":
            if let distance = exercise.distance_km {
                payload["distance_km"] = distance
            }
            if let duration = exercise.duration_min {
                payload["duration_min"] = duration
            }
            if let pace = exercise.target_pace {
                payload["target_pace"] = pace
            }
            
        case "cardio_time":
            if let duration = exercise.duration_min {
                payload["duration_min"] = duration
            }
            if let intensity = exercise.target_intensity {
                payload["target_intensity"] = intensity
            }
            
        case "hiit":
            if let rounds = exercise.rounds {
                payload["rounds"] = rounds
            }
            if let intervals = exercise.intervals {
                payload["intervals"] = intervals.map { ["work_sec": $0.work_sec, "rest_sec": $0.rest_sec] }
            }
            if let totalDuration = exercise.total_duration_min {
                payload["total_duration_min"] = totalDuration
            }
            
        case "circuit":
            if let circuits = exercise.circuits {
                payload["circuits"] = circuits
            }
            if let exercises = exercise.exercises_in_circuit {
                payload["exercises_in_circuit"] = exercises.map {
                    var dict: [String: Any] = ["name": $0.name]
                    if let duration = $0.duration_sec { dict["duration_sec"] = duration }
                    if let reps = $0.reps { dict["reps"] = reps }
                    return dict
                }
            }
            if let rest = exercise.rest_between_circuits_sec {
                payload["rest_between_circuits_sec"] = rest
            }
            
        case "flexibility":
            if let holds = exercise.holds {
                payload["holds"] = holds.map { ["position": $0.position, "duration_sec": $0.duration_sec] }
            }
            if let reps = exercise.repetitions {
                payload["repetitions"] = reps
            }
            
        case "yoga":
            if let sequence = exercise.sequence {
                payload["sequence"] = sequence.map {
                    var dict: [String: Any] = ["pose": $0.pose]
                    if let duration = $0.duration_sec { dict["duration_sec"] = duration }
                    if let breaths = $0.breaths { dict["breaths"] = breaths }
                    return dict
                }
            }
            if let totalDuration = exercise.total_duration_min {
                payload["total_duration_min"] = totalDuration
            }
            
        case "isometric", "balance":
            if let sets = exercise.sets {
                payload["sets"] = sets
            }
            if let holdDuration = exercise.hold_duration_sec {
                payload["hold_duration_sec"] = holdDuration
            }
            if let rest = exercise.rest_seconds {
                payload["rest_seconds"] = rest
            }
            
        case "sport_specific":
            if let sport = exercise.sport {
                payload["sport"] = sport
            }
            if let drill = exercise.drill_name {
                payload["drill_name"] = drill
            }
            if let duration = exercise.duration_min {
                payload["duration_min"] = duration
            }
            if let reps = exercise.repetitions {
                payload["repetitions"] = reps
            }
            
        default:
            break
        }
        
        return payload
    }
}

// MARK: - Error Types

enum IntervalServiceError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case httpError(statusCode: Int)
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Authentication required"
        case .httpError(let statusCode):
            return "HTTP error: \(statusCode)"
        case .serverError(let message):
            return message
        }
    }
}


