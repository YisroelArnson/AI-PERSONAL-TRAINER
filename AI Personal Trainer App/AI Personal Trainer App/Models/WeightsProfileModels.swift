import Foundation

struct WeightsProfileResponse: Codable {
    let success: Bool
    let profile: WeightsProfile?
}

struct WeightsProfileHistoryResponse: Codable {
    let success: Bool
    let history: [WeightsProfile]
}

struct WeightsProfile: Codable, Identifiable {
    let id: String
    let version: Int
    let profileJson: [WeightsEntry]
    let createdAt: String
    let triggerType: String
    let triggerSessionId: String?

    enum CodingKeys: String, CodingKey {
        case id, version
        case profileJson = "profile_json"
        case createdAt = "created_at"
        case triggerType = "trigger_type"
        case triggerSessionId = "trigger_session_id"
    }
}

struct WeightsEntry: Codable {
    let equipment: String?
    let movement: String
    let load: Double
    let loadUnit: String
    let confidence: String

    enum CodingKeys: String, CodingKey {
        case equipment, movement, load, confidence
        case loadUnit = "load_unit"
    }
}
