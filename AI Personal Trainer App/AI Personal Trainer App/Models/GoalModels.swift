import Foundation

struct GoalContractResponse: Codable {
    let success: Bool
    let goal: GoalContract
}

struct GoalContract: Codable, Identifiable {
    let id: String
    let status: String
    let version: Int
    let contract: GoalContractDetail

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case version
        case contract = "contract_json"
    }
}

struct GoalContractDetail: Codable {
    let primaryGoal: String
    let secondaryGoal: String
    let timelineWeeks: Int
    let metrics: [String]
    let weeklyCommitment: WeeklyCommitment
    let constraints: [String]
    let tradeoffs: [String]
    let assumptions: [String]

    enum CodingKeys: String, CodingKey {
        case primaryGoal = "primary_goal"
        case secondaryGoal = "secondary_goal"
        case timelineWeeks = "timeline_weeks"
        case metrics
        case weeklyCommitment = "weekly_commitment"
        case constraints
        case tradeoffs
        case assumptions
    }
}

struct WeeklyCommitment: Codable {
    let sessionsPerWeek: Int
    let minutesPerSession: Int

    enum CodingKeys: String, CodingKey {
        case sessionsPerWeek = "sessions_per_week"
        case minutesPerSession = "minutes_per_session"
    }
}

struct GoalEditRequest: Encodable {
    let instruction: String
}
