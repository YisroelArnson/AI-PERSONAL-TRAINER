import Foundation

struct JourneyStateResponse: Codable {
    let success: Bool
    let journey: JourneyState
}

struct JourneyState: Codable {
    let state: String
    let intakeStatus: String
    let assessmentStatus: String
    let goalsStatus: String
    let programStatus: String
    let monitoringStatus: String
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case state
        case intakeStatus = "intake_status"
        case assessmentStatus = "assessment_status"
        case goalsStatus = "goals_status"
        case programStatus = "program_status"
        case monitoringStatus = "monitoring_status"
        case updatedAt = "updated_at"
    }
}
