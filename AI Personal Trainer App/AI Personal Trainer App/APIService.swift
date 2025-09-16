import Foundation
import Supabase

class APIService: ObservableObject {
    private let baseURL = "http://192.168.1.4:3000"
    
    // Helper function to get auth token
    private func getAuthToken() async throws -> String {
        let session = try await supabase.auth.session
        return session.accessToken
    }
    
    // Helper function to create authenticated request
    private func createAuthenticatedRequest(url: URL) async throws -> URLRequest {
        var request = URLRequest(url: url)
        let token = try await getAuthToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }
    
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
    
    // Exercise recommendations endpoint
    func fetchRecommendations(exerciseCount: Int? = 8) async throws -> ExerciseRecommendations {
        // Get current user ID
        let session = try await supabase.auth.session
        let userId = session.user.id.uuidString
        
        guard let url = URL(string: "\(baseURL)/recommend/exercises/\(userId)") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        // Send request body with exercise count (only if specified)
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
        
        // Parse the new API response format
        let apiResponse = try JSONDecoder().decode(RecommendAPIResponse.self, from: data)
        
        // Convert to the existing ExerciseRecommendations format for compatibility
        let exercises = apiResponse.data.recommendations.map { rec in
            Exercise(from: rec)
        }
        
        return ExerciseRecommendations(exercises: exercises)
    }
    
    // Agent chat endpoint
    func sendAgentMessage(_ message: String, useTools: Bool = true) async throws -> AgentResponse {
        guard let url = URL(string: "\(baseURL)/agent/chat") else {
            throw APIError.invalidURL
        }
        
        var request = try await createAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        
        let requestBody = AgentRequest(message: message, useTools: useTools)
        let jsonData = try JSONEncoder().encode(requestBody)
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
        
        let agentResponse = try JSONDecoder().decode(AgentResponse.self, from: data)
        return agentResponse
    }
    
    // Agent health check
    func checkAgentHealth() async throws -> AgentHealthResponse {
        guard let url = URL(string: "\(baseURL)/agent/health") else {
            throw APIError.invalidURL
        }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let healthResponse = try JSONDecoder().decode(AgentHealthResponse.self, from: data)
        return healthResponse
    }
}

// Response models
struct APIResponse: Codable {
    let message: String
}

struct ExerciseRecommendations: Codable {
    let exercises: [Exercise]
}

// New API response models
struct RecommendAPIResponse: Codable {
    let success: Bool
    let data: RecommendationData
    let metadata: RecommendationMetadata?
    let timestamp: String
}

struct RecommendationData: Codable {
    let recommendations: [RecommendationExercise]
}

struct RecommendationExercise: Codable {
    let exercise_name: String
    let aliases: [String]?
    let duration_min: Int?
    let reps: [Int]?
    let load_kg_each: [Double]?
    let distance_km: Double?
    let intervals: [ExerciseInterval]?
    let rounds: Int?
    let muscles_utilized: [MuscleUtilization]
    let goals_addressed: [String]
    let reasoning: String
    let equiptment: [String]?
    let movement_pattern: [String]?
    let exercise_description: String?
    let body_region: String?
}

struct ExerciseInterval: Codable {
    let work_sec: Int?
    let rest_sec: Int?
}

struct MuscleUtilization: Codable {
    let muscle: String
    let share: Double
}

struct RecommendationMetadata: Codable {
    let requestData: [String: AnyCodable]?
    let userDataFetched: Bool?
    let recommendationCount: Int?
}

// Agent models
struct AgentRequest: Codable {
    let message: String
    let useTools: Bool
}

struct AgentResponse: Codable {
    let success: Bool
    let response: String
    let toolCalls: [ToolCall]?
    let toolResults: [ToolResult]?
    let usage: TokenUsage?
    let timestamp: String
    let error: String?
    let details: String?
}

struct ToolCall: Codable {
    let toolName: String
    let args: [String: AnyCodable]?
}

struct ToolResult: Codable {
    let toolName: String?
    let result: [String: AnyCodable]?
    let error: String?
}

struct TokenUsage: Codable {
    let totalTokens: Int?
    let promptTokens: Int?
    let completionTokens: Int?
}

struct AgentHealthResponse: Codable {
    let success: Bool
    let message: String
    let timestamp: String
    let version: String
}

// Helper for handling dynamic JSON values
struct AnyCodable: Codable {
    let value: Any
    
    init<T>(_ value: T?) {
        self.value = value ?? ()
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if container.decodeNil() {
            self.value = ()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map(\.value)
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            self.value = dictionary.mapValues(\.value)
        } else {
            self.value = ()
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        switch value {
        case is Void:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map(AnyCodable.init))
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues(AnyCodable.init))
        default:
            try container.encodeNil()
        }
    }
}

struct Exercise: Codable, Identifiable {
    let id = UUID() // Generate unique ID for SwiftUI
    let name: String
    let sets: Int
    let reps: [Int]
    let duration_min: Int
    let load_kg_each: [Double]
    let muscles_utilized: [MuscleUtilization]?
    let goals_addressed: [String]?
    let reasoning: String
    let exercise_description: String?
    let intervals: [ExerciseInterval]?
    let distance_km: Double?
    let rounds: Int?
    
    // Custom initializer for the new API format
    init(from recommendation: RecommendationExercise) {
        self.name = recommendation.exercise_name
        self.sets = recommendation.rounds ?? 1 // Use rounds as sets, default to 1
        self.reps = recommendation.reps ?? []
        self.duration_min = recommendation.duration_min ?? 0
        self.load_kg_each = recommendation.load_kg_each ?? []
        self.muscles_utilized = recommendation.muscles_utilized
        self.goals_addressed = recommendation.goals_addressed
        self.reasoning = recommendation.reasoning
        self.exercise_description = recommendation.exercise_description
        self.intervals = recommendation.intervals
        self.distance_km = recommendation.distance_km
        self.rounds = recommendation.rounds
    }
    
    enum CodingKeys: String, CodingKey {
        case name, sets, reps, duration_min, load_kg_each, muscles_utilized, goals_addressed, reasoning, exercise_description, intervals, distance_km, rounds
    }
}

// Error handling
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case unauthorized
    case forbidden
    case authenticationRequired
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response"
        case .httpError(let statusCode):
            return "HTTP error: \(statusCode)"
        case .unauthorized:
            return "Authentication token is invalid or expired"
        case .forbidden:
            return "Access denied - insufficient permissions"
        case .authenticationRequired:
            return "Please sign in to access this feature"
        }
    }
}
