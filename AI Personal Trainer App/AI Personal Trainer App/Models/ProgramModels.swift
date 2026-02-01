import Foundation

struct ProgramResponse: Codable {
    let success: Bool
    let program: TrainingProgram
}

struct TrainingProgram: Codable, Identifiable {
    let id: String
    let status: String
    let version: Int
    let program: TrainingProgramDetail

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case version
        case program = "program_json"
    }
}

struct TrainingProgramDetail: Codable {
    let identity: ProgramIdentity
    let goals: ProgramGoals
    let weeklyTemplate: WeeklyTemplate
    let sessions: [ProgramSession]
    let progression: ProgramProgression
    let exerciseRules: ProgramExerciseRules
    let guardrails: ProgramGuardrails
    let coachCues: [String]

    enum CodingKeys: String, CodingKey {
        case identity
        case goals
        case weeklyTemplate = "weekly_template"
        case sessions
        case progression
        case exerciseRules = "exercise_rules"
        case guardrails
        case coachCues = "coach_cues"
    }
}

struct ProgramIdentity: Codable {
    let programId: String
    let version: Int
    let createdAt: String
    let assumptions: [String]

    enum CodingKeys: String, CodingKey {
        case programId = "program_id"
        case version
        case createdAt = "created_at"
        case assumptions
    }
}

struct ProgramGoals: Codable {
    let primary: String
    let secondary: String
    let timelineWeeks: Int
    let metrics: [String]

    enum CodingKeys: String, CodingKey {
        case primary
        case secondary
        case timelineWeeks = "timeline_weeks"
        case metrics
    }
}

struct WeeklyTemplate: Codable {
    let daysPerWeek: Int
    let sessionTypes: [String]
    let preferredDays: [String]

    enum CodingKeys: String, CodingKey {
        case daysPerWeek = "days_per_week"
        case sessionTypes = "session_types"
        case preferredDays = "preferred_days"
    }
}

struct ProgramSession: Codable {
    let focus: String
    let durationMin: Int
    let equipment: [String]
    let notes: String

    enum CodingKeys: String, CodingKey {
        case focus
        case durationMin = "duration_min"
        case equipment
        case notes
    }
}

struct ProgramProgression: Codable {
    let strategy: String
    let deloadTrigger: String
    let timeScaling: [String]

    enum CodingKeys: String, CodingKey {
        case strategy
        case deloadTrigger = "deload_trigger"
        case timeScaling = "time_scaling"
    }
}

struct ProgramExerciseRules: Codable {
    let avoid: [String]
    let prefer: [String]
}

struct ProgramGuardrails: Codable {
    let painScale: String
    let redFlags: [String]

    enum CodingKeys: String, CodingKey {
        case painScale = "pain_scale"
        case redFlags = "red_flags"
    }
}

struct ProgramEditRequest: Encodable {
    let instruction: String
}
