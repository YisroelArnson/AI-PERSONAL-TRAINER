import Foundation

struct WorkoutSessionResponse: Codable {
    let success: Bool
    let session: WorkoutSession
}

struct WorkoutSessionDetailResponse: Codable {
    let success: Bool
    let session: WorkoutSession
    let instance: WorkoutInstance?
    let instanceVersion: Int?

    enum CodingKeys: String, CodingKey {
        case success, session, instance
        case instanceVersion = "instance_version"
    }
}

struct WorkoutInstanceResponse: Codable {
    let success: Bool
    let instance: WorkoutInstance
    let version: Int
}

struct WorkoutActionResponse: Codable {
    let success: Bool
    let action: String
    let instance: WorkoutInstance?
    let instanceVersion: Int?
    let instanceUpdated: Bool

    enum CodingKeys: String, CodingKey {
        case success, action, instance
        case instanceVersion = "instance_version"
        case instanceUpdated = "instance_updated"
    }
}

struct WorkoutCompletionResponse: Codable {
    let success: Bool
    let summary: WorkoutSessionSummary
}

struct WorkoutSession: Codable, Identifiable {
    let id: String
    let userId: String
    let status: String
    let coachMode: String
    let startedAt: Date?
    let completedAt: Date?
    let metadata: [String: CodableValue]?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case status
        case coachMode = "coach_mode"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case metadata
    }
}

struct WorkoutInstance: Codable, Equatable {
    let title: String
    let estimatedDurationMin: Int?
    let focus: [String]?
    let exercises: [UIExercise]
    let metadata: WorkoutInstanceMetadata?

    enum CodingKeys: String, CodingKey {
        case title
        case estimatedDurationMin = "estimated_duration_min"
        case focus
        case exercises
        case metadata
    }
}

struct WorkoutInstanceMetadata: Codable, Equatable {
    let intent: String?
    let requestText: String?
    let generatedAt: String?

    enum CodingKeys: String, CodingKey {
        case intent
        case requestText = "request_text"
        case generatedAt = "generated_at"
    }
}

struct WorkoutGenerateRequest: Encodable {
    let intent: String
    let requestText: String?
    let timeAvailableMin: Int?
    let equipment: [String]?
    let readiness: WorkoutReadiness?
    let coachMode: String?

    enum CodingKeys: String, CodingKey {
        case intent
        case requestText = "request_text"
        case timeAvailableMin = "time_available_min"
        case equipment
        case readiness
        case coachMode = "coach_mode"
    }
}

struct WorkoutReadiness: Codable {
    let energy: String?
    let soreness: String?
    let pain: String?
}

struct WorkoutActionRequest: Encodable {
    let actionType: String
    let payload: [String: CodableValue]?

    enum CodingKeys: String, CodingKey {
        case actionType = "action_type"
        case payload
    }
}

struct WorkoutReflection: Encodable {
    let rpe: Int?
    let rir: Int?
    let enjoyment: String?
    let pain: String?
    let notes: String?
}

struct WorkoutLogPayload: Encodable {
    let exercisesCompleted: Int?
    let setsCompleted: Int?
    let totalDurationMin: Int?

    enum CodingKeys: String, CodingKey {
        case exercisesCompleted = "exercisesCompleted"
        case setsCompleted = "setsCompleted"
        case totalDurationMin = "totalDurationMin"
    }
}

struct WorkoutCompletionRequest: Encodable {
    let reflection: WorkoutReflection
    let log: WorkoutLogPayload
}

struct WorkoutSessionSummary: Codable {
    let title: String
    let completion: WorkoutCompletion
    let overallRpe: Int?
    let painNotes: String?
    let wins: [String]
    let nextSessionFocus: String

    enum CodingKeys: String, CodingKey {
        case title, completion, wins
        case overallRpe = "overall_rpe"
        case painNotes = "pain_notes"
        case nextSessionFocus = "next_session_focus"
    }
}

struct WorkoutCompletion: Codable {
    let exercises: Int
    let totalSets: Int

    enum CodingKeys: String, CodingKey {
        case exercises
        case totalSets = "total_sets"
    }
}

// MARK: - CodableValue helper

enum CodableValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case stringArray([String])
    case array([CodableValue])
    case object([String: CodableValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode([String: CodableValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([CodableValue].self) {
            self = .array(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode([String].self) {
            self = .stringArray(value)
        } else {
            throw DecodingError.typeMismatch(CodableValue.self, DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported value"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .stringArray(let value):
            try container.encode(value)
        }
    }

    func asAny() -> Any {
        switch self {
        case .string(let value):
            return value
        case .int(let value):
            return value
        case .double(let value):
            return value
        case .bool(let value):
            return value
        case .stringArray(let value):
            return value
        case .array(let value):
            return value.map { $0.asAny() }
        case .object(let value):
            return value.mapValues { $0.asAny() }
        }
    }
}
