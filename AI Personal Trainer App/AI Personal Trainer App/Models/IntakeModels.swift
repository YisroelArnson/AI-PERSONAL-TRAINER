import Foundation

struct IntakeSessionResponse: Codable {
    let success: Bool
    let session: IntakeSession
    let checklist: [IntakeChecklistItem]?
    let prompt: String?
}

struct IntakeSession: Codable, Identifiable {
    let id: String
    let userId: String
    let status: String
    let currentTopic: String?
    let createdAt: Date?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case status
        case currentTopic = "current_topic"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct IntakeChecklistItem: Codable, Identifiable {
    let id: String
    let label: String
    let topic: String
    let required: Bool
    let status: String
    let note: String?
}

struct IntakeProgress: Codable, Equatable {
    let requiredDone: Int
    let requiredTotal: Int
    let topics: [IntakeTopicProgress]

    enum CodingKeys: String, CodingKey {
        case requiredDone = "required_done"
        case requiredTotal = "required_total"
        case topics
    }
}

struct IntakeTopicProgress: Codable, Equatable {
    let topic: String
    let completed: Int
    let total: Int
}

struct IntakeSummaryResponse: Codable {
    let success: Bool
    let summary: IntakeSummary?
    let version: Int?
}

struct IntakeSummary: Codable, Equatable {
    let goals: IntakeGoalSummary
    let motivation: String?
    let history: IntakeHistorySummary
    let equipment: String?
    let injuries: String?
    let schedule: IntakeScheduleSummary
    let preferences: IntakePreferenceSummary
    let notes: String?
}

struct IntakeGoalSummary: Codable, Equatable {
    let primary: String?
    let secondary: String?
}

struct IntakeHistorySummary: Codable, Equatable {
    let training: String?
    let activityLevel: String?

    enum CodingKeys: String, CodingKey {
        case training
        case activityLevel = "activity_level"
    }
}

struct IntakeScheduleSummary: Codable, Equatable {
    let daysPerWeek: String?
    let minutesPerSession: String?
    let preferences: String?

    enum CodingKeys: String, CodingKey {
        case daysPerWeek = "days_per_week"
        case minutesPerSession = "minutes_per_session"
        case preferences
    }
}

struct IntakePreferenceSummary: Codable, Equatable {
    let likes: String?
    let dislikes: String?
    let coachingStyle: String?

    enum CodingKeys: String, CodingKey {
        case likes
        case dislikes
        case coachingStyle = "coaching_style"
    }
}

struct IntakeAnswerRequest: Encodable {
    let answerText: String

    enum CodingKeys: String, CodingKey {
        case answerText = "answer_text"
    }
}

struct IntakeEditRequest: Encodable {
    let changes: IntakeSummary
}

struct IntakeStreamEvent: Decodable {
    let type: String
    let data: IntakeStreamData?
}

struct IntakeStreamData: Decodable {
    let text: String?
    let presentation: IntakePresentation?
    let updates: [IntakeChecklistUpdate]?
    let items: [IntakeChecklistItem]?
    let progress: IntakeProgress?
    let complete: Bool?
}

struct IntakeChecklistUpdate: Decodable {
    let itemId: String
    let status: String
    let note: String?

    enum CodingKeys: String, CodingKey {
        case itemId = "item_id"
        case status
        case note
    }
}

struct IntakePresentation: Decodable {
    let style: String?
    let animate: String?
    let replaceCanvas: Bool?

    enum CodingKeys: String, CodingKey {
        case style
        case animate
        case replaceCanvas = "replace_canvas"
    }
}
