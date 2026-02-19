import Foundation

struct WorkoutTrackingSessionResponse: Codable {
    let success: Bool
    let session: WorkoutSession
    let workout: WorkoutTrackingWorkout?
    let exercises: [WorkoutTrackingExercise]
    let instance: WorkoutInstance?
    let instanceVersion: Int?

    enum CodingKeys: String, CodingKey {
        case success, session, workout, exercises, instance
        case instanceVersion = "instance_version"
    }
}

struct WorkoutTrackingSessionCreateRequest: Encodable {
    let intent: String?
    let requestText: String?
    let timeAvailableMin: Int?
    let equipment: [String]?
    let plannedSession: [String: CodableValue]?
    let plannedIntentOriginal: [String: CodableValue]?
    let plannedIntentEdited: [String: CodableValue]?
    let calendarEventId: String?
    let plannedSessionId: String?
    let coachMode: String?
    let metadata: [String: CodableValue]?

    enum CodingKeys: String, CodingKey {
        case intent
        case requestText = "request_text"
        case timeAvailableMin = "time_available_min"
        case equipment
        case plannedSession = "planned_session"
        case plannedIntentOriginal = "planned_intent_original"
        case plannedIntentEdited = "planned_intent_edited"
        case calendarEventId = "calendar_event_id"
        case plannedSessionId = "planned_session_id"
        case coachMode = "coach_mode"
        case metadata
    }
}

struct WorkoutTrackingWorkout: Codable {
    let id: String
    let sessionId: String
    let title: String
    let workoutType: String?
    let plannedDurationMin: Int?
    let actualDurationMin: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case title
        case workoutType = "workout_type"
        case plannedDurationMin = "planned_duration_min"
        case actualDurationMin = "actual_duration_min"
    }
}

struct WorkoutTrackingExercise: Codable, Identifiable {
    let id: String
    let workoutId: String
    let exerciseOrder: Int
    let exerciseType: String
    let status: String
    let payloadVersion: Int

    enum CodingKeys: String, CodingKey {
        case id
        case workoutId = "workout_id"
        case exerciseOrder = "exercise_order"
        case exerciseType = "exercise_type"
        case status
        case payloadVersion = "payload_version"
    }
}

enum WorkoutExerciseCommandType: String, Codable {
    case completeSet = "complete_set"
    case updateSetTarget = "update_set_target"
    case updateSetActual = "update_set_actual"
    case setExerciseRpe = "set_exercise_rpe"
    case setExerciseNote = "set_exercise_note"
    case skipExercise = "skip_exercise"
    case unskipExercise = "unskip_exercise"
    case completeExercise = "complete_exercise"
    case reopenExercise = "reopen_exercise"
    case adjustRestSeconds = "adjust_rest_seconds"
}

struct WorkoutExerciseCommand: Encodable, Codable {
    let type: WorkoutExerciseCommandType
    let setIndex: Int?
    let actualReps: Int?
    let actualLoad: Double?
    let loadUnit: String?
    let actualDurationSec: Int?
    let actualDistanceKm: Double?
    let targetReps: Int?
    let targetLoad: Double?
    let targetDurationSec: Int?
    let targetDistanceKm: Double?
    let rpe: Int?
    let notes: String?
    let reason: String?
    let restSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case type
        case setIndex = "set_index"
        case actualReps = "actual_reps"
        case actualLoad = "actual_load"
        case loadUnit = "load_unit"
        case actualDurationSec = "actual_duration_sec"
        case actualDistanceKm = "actual_distance_km"
        case targetReps = "target_reps"
        case targetLoad = "target_load"
        case targetDurationSec = "target_duration_sec"
        case targetDistanceKm = "target_distance_km"
        case rpe
        case notes
        case reason
        case restSeconds = "rest_seconds"
    }
}

struct WorkoutCommandClientMeta: Encodable, Codable {
    let sourceScreen: String?
    let appVersion: String?
    let deviceId: String?
    let correlationId: String?
    let clientTimestamp: String?

    enum CodingKeys: String, CodingKey {
        case sourceScreen = "source_screen"
        case appVersion = "app_version"
        case deviceId = "device_id"
        case correlationId = "correlation_id"
        case clientTimestamp = "client_timestamp"
    }
}

struct WorkoutExerciseCommandRequest: Encodable, Codable {
    let commandId: String
    let expectedVersion: Int
    let command: WorkoutExerciseCommand
    let clientMeta: WorkoutCommandClientMeta?

    enum CodingKeys: String, CodingKey {
        case commandId = "command_id"
        case expectedVersion = "expected_version"
        case command
        case clientMeta = "client_meta"
    }
}

struct WorkoutExerciseCommandResponse: Codable {
    let success: Bool
    let exerciseId: String?
    let payloadVersion: Int?
    let status: String?
    let payloadJson: [String: CodableValue]?
    let currentPayloadVersion: Int?

    enum CodingKeys: String, CodingKey {
        case success, status
        case exerciseId = "exercise_id"
        case payloadVersion = "payload_version"
        case payloadJson = "payload_json"
        case currentPayloadVersion = "current_payload_version"
    }
}

struct WorkoutHistoryResponse: Codable {
    let success: Bool
    let items: [WorkoutHistorySessionItem]
    let nextCursor: String?

    enum CodingKeys: String, CodingKey {
        case success, items
        case nextCursor = "next_cursor"
    }
}

struct WorkoutHistorySessionItem: Codable, Identifiable {
    let sessionId: String
    let status: String
    let startedAt: Date?
    let completedAt: Date?
    let title: String
    let workoutType: String?
    let plannedDurationMin: Int?
    let actualDurationMin: Int?
    let exerciseCount: Int
    let completedExerciseCount: Int
    let skippedExerciseCount: Int
    let totalVolume: Int
    let sessionRpe: Int?

    var id: String { sessionId }

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case status
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case title
        case workoutType = "workout_type"
        case plannedDurationMin = "planned_duration_min"
        case actualDurationMin = "actual_duration_min"
        case exerciseCount = "exercise_count"
        case completedExerciseCount = "completed_exercise_count"
        case skippedExerciseCount = "skipped_exercise_count"
        case totalVolume = "total_volume"
        case sessionRpe = "session_rpe"
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

struct IntentPlanResponse: Codable {
    let success: Bool
    let plan: IntentPlan
}

struct IntentPlan: Codable {
    let focus: String
    let notes: String
    let durationMin: Int

    enum CodingKeys: String, CodingKey {
        case focus
        case notes
        case durationMin = "duration_min"
    }
}

struct WorkoutReflection: Encodable {
    let rpe: Int?
    let rir: Int?
    let enjoyment: String?
    let pain: String?
    let notes: String?
}

struct ExerciseRPEEntry: Encodable {
    let exerciseIndex: Int
    let exerciseName: String
    let rpe: Int

    enum CodingKeys: String, CodingKey {
        case exerciseIndex = "exercise_index"
        case exerciseName = "exercise_name"
        case rpe
    }
}

struct WorkoutLogPayload: Encodable {
    let exercisesCompleted: Int?
    let setsCompleted: Int?
    let totalDurationMin: Int?
    let exerciseRpe: [ExerciseRPEEntry]?

    enum CodingKeys: String, CodingKey {
        case exercisesCompleted = "exercisesCompleted"
        case setsCompleted = "setsCompleted"
        case totalDurationMin = "totalDurationMin"
        case exerciseRpe = "exerciseRpe"
    }
}

struct WorkoutCompletionRequest: Encodable {
    let reflection: WorkoutReflection
    let log: WorkoutLogPayload
}

struct WorkoutStopRequest: Encodable {
    let reason: String
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
    case null
    case stringArray([String])
    case array([CodableValue])
    case object([String: CodableValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode([String: CodableValue].self) {
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
        case .null:
            try container.encodeNil()
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
        case .null:
            return NSNull()
        case .stringArray(let value):
            return value
        case .array(let value):
            return value.map { $0.asAny() }
        case .object(let value):
            return value.mapValues { $0.asAny() }
        }
    }
}
