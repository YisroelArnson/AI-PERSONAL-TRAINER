import Foundation
import Supabase

class APIService: ObservableObject {
    private let baseURL = "http://192.168.1.171:3000"
    
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
    func fetchRecommendations(exerciseCount: Int = 8) async throws -> ExerciseRecommendations {
        var urlComponents = URLComponents(string: "\(baseURL)/recommendations")!
        urlComponents.queryItems = [
            URLQueryItem(name: "exerciseCount", value: String(exerciseCount))
        ]
        
        guard let url = urlComponents.url else {
            throw APIError.invalidURL
        }
        
        let request = try await createAuthenticatedRequest(url: url)
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
        
        // Parse the exercises JSON response
        let exerciseResponse = try JSONDecoder().decode(ExerciseRecommendations.self, from: data)
        return exerciseResponse
    }
}

// Response models
struct APIResponse: Codable {
    let message: String
}

struct ExerciseRecommendations: Codable {
    let exercises: [Exercise]
}

struct Exercise: Codable, Identifiable {
    let id = UUID() // Generate unique ID for SwiftUI
    let name: String
    let sets: Int
    let reps: [Int]
    let duration_min: Int
    let load_kg_each: [Double]
    let reasoning: String
    
    enum CodingKeys: String, CodingKey {
        case name, sets, reps, duration_min, load_kg_each, reasoning
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
