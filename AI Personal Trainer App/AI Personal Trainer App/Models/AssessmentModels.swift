import Foundation

struct AssessmentSessionResponse: Codable {
    let success: Bool
    let session: AssessmentSession
}

struct AssessmentSession: Codable, Identifiable {
    let id: String
    let userId: String
    let status: String
    let currentStepId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case status
        case currentStepId = "current_step_id"
    }
}

struct AssessmentStepsResponse: Codable {
    let success: Bool
    let steps: [AssessmentStep]
}

struct AssessmentStep: Codable, Identifiable {
    let id: String
    let title: String
    let type: String
    let prompt: String
    let options: [String]?
}

struct AssessmentStepSubmitRequest: Encodable {
    let result: [String: CodableValue]
}

struct AssessmentStepSkipRequest: Encodable {
    let reason: String
}

struct AssessmentStepSubmitResponse: Codable {
    let success: Bool
    let nextStep: AssessmentStep?

    enum CodingKeys: String, CodingKey {
        case success
        case nextStep = "next_step"
    }
}

struct AssessmentBaselineResponse: Codable {
    let success: Bool
    let baseline: AssessmentBaseline
    let version: Int
}

struct AssessmentBaseline: Codable, Equatable {
    let readiness: String
    let strength: String
    let mobility: String
    let conditioning: String
    let painFlags: String
    let confidence: String
    let notes: String

    enum CodingKeys: String, CodingKey {
        case readiness, strength, mobility, conditioning, confidence, notes
        case painFlags = "pain_flags"
    }
}
