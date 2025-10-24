//
//  APIModels.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation

// MARK: - API Response Models
struct APIResponse: Codable {
    let message: String
}

struct ExerciseRecommendations: Codable {
    let exercises: [Exercise]
}

// MARK: - Recommendation API Models
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
    let equipment: [String]?
    let movement_pattern: [String]?
    let exercise_description: String?
    let body_region: String?
}

struct RecommendationMetadata: Codable {
    let requestData: [String: AnyCodable]?
    let userDataFetched: Bool?
    let recommendationCount: Int?
}

// MARK: - Streaming Models
struct StreamingMessage: Codable {
    let type: String
    let data: StreamingExercise?
    let index: Int?
    let success: Bool?
    let userId: String?
    let timestamp: String?
    let metadata: RecommendationMetadata?
    let totalExercises: Int?
    let error: String?
    let details: String?
}

struct StreamingExercise: Codable {
    let exercise_type: String
    let exercise_name: String
    let aliases: [String]?
    let muscles_utilized: [MuscleUtilization]
    let goals_addressed: [String]
    let reasoning: String
    let equipment: [String]?
    let movement_pattern: [String]?
    let exercise_description: String?
    let body_region: String?
    
    // Type-specific fields
    let sets: Int?
    let reps: [Int]?
    let load_kg_each: [Double]?
    let rest_seconds: Int?
    let distance_km: Double?
    let duration_min: Int?
    let target_pace: String?
    let elevation_gain_m: Double?
    let target_intensity: String?
    let target_heart_rate_bpm: Int?
    let rounds: Int?
    let intervals: [ExerciseInterval]?
    let total_duration_min: Int?
    let circuits: Int?
    let exercises_in_circuit: [CircuitExercise]?
    let rest_between_circuits_sec: Int?
    let holds: [FlexibilityHold]?
    let repetitions: Int?
    let sequence: [YogaPose]?
    let progression_level: String?
    let hold_duration_sec: [Int]?
    let progression_notes: String?
    let jump_height_cm: Double?
    let landing_emphasis: String?
    let difficulty_level: String?
    let support_used: String?
    let sport: String?
    let drill_name: String?
    let skill_focus: String?
}

// MARK: - Agent Models
struct AgentRequest: Codable {
    let message: String
    let userId: String
    let options: RequestOptions?
    
    struct RequestOptions: Codable {
        let maxSteps: Int?
    }
    
    init(message: String, userId: String, maxSteps: Int? = nil) {
        self.message = message
        self.userId = userId
        self.options = maxSteps != nil ? RequestOptions(maxSteps: maxSteps) : nil
    }
}

struct AgentResponse: Codable {
    let success: Bool
    let response: String
    let toolResults: [ToolResult]?
    let ui_events: [UIEvent]?
    let usage: TokenUsage?
    let steps: Int?
    let userId: String?
    let timestamp: String
    let error: String?
}

struct StreamResponse: Codable {
    let type: String
    let data: AnyCodable?
    let message: String?
    let index: Int?
    let exerciseCount: Int?
    let timestamp: String?
    let success: Bool?
    let userId: String?
    let error: String?
}

struct UIEvent: Codable {
    let type: String
    let data: [String: AnyCodable]
}

struct ToolResult: Codable {
    let toolName: String
    let args: [String: AnyCodable]?
    let result: [String: AnyCodable]?
}

struct TokenUsage: Codable {
    let totalTokens: Int?
    let promptTokens: Int?
    let completionTokens: Int?
}

// MARK: - Helper for Dynamic JSON
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

// MARK: - Preference Models
struct ParsePreferenceRequest: Codable {
    let preferenceText: String
    let currentPreference: CurrentPreferenceContext?
}

struct CurrentPreferenceContext: Codable {
    let type: String?
    let description: String?
    let userTranscription: String?
    let recommendationsGuidance: String?
    let deleteAfterCall: Bool?
    let hasExpireTime: Bool?
    let expireTime: String?
}

struct ParsePreferenceResponse: Codable {
    let success: Bool
    let data: ParsedPreference?
    let timestamp: String
    let error: String?
    let details: String?
}

struct ParsedPreference: Codable {
    let type: String
    let description: String
    let recommendationsGuidance: String
    let expireTime: String?
    let deleteAfterCall: Bool
    let reasoning: String
}

// MARK: - Category Goal Parsing Models
struct ParseCategoryGoalsRequest: Codable {
    let goalsText: String
    let currentGoals: [CategoryGoalContext]?
}

struct CategoryGoalContext: Codable {
    let category: String
    let description: String
    let weight: Double
    let enabled: Bool
}

struct ParseCategoryGoalsResponse: Codable {
    let success: Bool
    let data: ParsedCategoryGoals?
    let timestamp: String
    let error: String?
}

struct ParsedCategoryGoals: Codable {
    let goals: [ParsedCategoryGoal]
    let reasoning: String
}

struct ParsedCategoryGoal: Codable {
    let category: String
    let description: String
    let weight: Double
}

// MARK: - Muscle Goal Parsing Models
struct ParseMuscleGoalsRequest: Codable {
    let goalsText: String
    let currentGoals: [String: Double]?
}

struct ParseMuscleGoalsResponse: Codable {
    let success: Bool
    let data: ParsedMuscleGoals?
    let timestamp: String
    let error: String?
}

struct ParsedMuscleGoals: Codable {
    let weights: [String: Double]
    let reasoning: String
}

// MARK: - Error Models
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

