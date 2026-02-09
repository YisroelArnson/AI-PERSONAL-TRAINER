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

// MARK: - User Settings Models
struct UserSettingsAPIResponse: Codable {
    let success: Bool
    let data: UserSettingsData
}

struct UserSettingsData: Codable {
    let weight_unit: String
    let distance_unit: String
}

// MARK: - Error Models
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case unauthorized
    case forbidden
    case authenticationRequired
    case networkError
    
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
        case .networkError:
            return "Unable to connect to server. Please check your network connection."
        }
    }
}

