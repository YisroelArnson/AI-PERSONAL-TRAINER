import Foundation

struct CheckinResponse: Codable {
    let success: Bool
    let checkin: Checkin
    let questions: [CheckinQuestion]?
}

struct CheckinListResponse: Codable {
    let success: Bool
    let checkins: [Checkin]
}

struct CheckinQuestion: Codable, Identifiable {
    let id: String
    let label: String
    let type: String
}

struct Checkin: Codable, Identifiable {
    let id: String
    let checkinType: String
    let status: String
    let responsesJson: [String: CodableValue]?
    let summaryJson: [String: CodableValue]?
    let createdAt: Date
    let updatedAt: Date
    let completedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case checkinType = "checkin_type"
        case status
        case responsesJson = "responses_json"
        case summaryJson = "summary_json"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case completedAt = "completed_at"
    }
}
