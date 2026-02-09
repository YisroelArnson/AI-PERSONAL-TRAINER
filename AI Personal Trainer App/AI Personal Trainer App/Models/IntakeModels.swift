import Foundation

// MARK: - Structured Intake Submission Response

struct IntakeSubmitResponse: Codable {
    let success: Bool
    let intakeId: String

    enum CodingKeys: String, CodingKey {
        case success
        case intakeId = "intake_id"
    }
}
