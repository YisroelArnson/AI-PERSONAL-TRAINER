//
//  APIService.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation
import Supabase

class APIService: ObservableObject {
    private let baseURL = "http://192.168.1.171:3000"
    
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
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
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
        onExercise: @escaping (Exercise) -> Void,
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
        
        let (asyncBytes, response) = try await URLSession.shared.bytes(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            } else if httpResponse.statusCode == 403 {
                throw APIError.forbidden
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        var exerciseCount = 0
        
        for try await line in asyncBytes.lines {
            guard !line.isEmpty else { continue }
            
            do {
                let messageData = line.data(using: .utf8) ?? Data()
                let message = try JSONDecoder().decode(StreamingMessage.self, from: messageData)
                
                switch message.type {
                case "metadata":
                    print("Streaming started for user: \(message.userId ?? "unknown")")
                    
                case "exercise":
                    if let exerciseData = message.data {
                        let exercise = Exercise(from: exerciseData)
                        await MainActor.run {
                            onExercise(exercise)
                        }
                        exerciseCount += 1
                    }
                    
                case "complete":
                    let totalExercises = message.totalExercises ?? exerciseCount
                    await MainActor.run {
                        onComplete(totalExercises)
                    }
                    return
                    
                case "error":
                    let errorMessage = message.error ?? "Unknown streaming error"
                    await MainActor.run {
                        onError(errorMessage)
                    }
                    return
                    
                default:
                    print("Unknown message type: \(message.type)")
                }
            } catch {
                print("Failed to decode streaming message: \(error)")
                await MainActor.run {
                    onError("Failed to decode streaming response")
                }
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
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
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
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
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
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
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
}

