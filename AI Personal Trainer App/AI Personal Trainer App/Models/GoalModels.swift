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

// MARK: - Goal Options (New Onboarding Flow)

struct GoalOption: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String
    let primaryGoal: String
    let secondaryGoal: String
    let timelineWeeks: Int
    let sessionsPerWeek: Int
    let minutesPerSession: Int
    let focusAreas: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case primaryGoal = "primary_goal"
        case secondaryGoal = "secondary_goal"
        case timelineWeeks = "timeline_weeks"
        case sessionsPerWeek = "sessions_per_week"
        case minutesPerSession = "minutes_per_session"
        case focusAreas = "focus_areas"
    }
}

struct GoalOptionsResponse: Codable {
    let success: Bool
    let options: [GoalOption]
}

struct GoalOptionSelectRequest: Encodable {
    let option: GoalOption
}
