import Foundation

enum CoachTriggerType: String, Codable {
    case userMessage = "user.message"
    case appOpened = "app.opened"
    case startWorkout = "ui.action.start_workout"
    case completeSet = "ui.action.complete_set"
}

extension CoachTriggerType {
    init(apiValue: String?) {
        self = CoachTriggerType(rawValue: apiValue ?? "") ?? .userMessage
    }
}

struct MessageMetadata: Codable {
    let hiddenInFeed: Bool?
    let source: String?
    let actionId: String?

    init(hiddenInFeed: Bool? = nil, source: String? = nil, actionId: String? = nil) {
        self.hiddenInFeed = hiddenInFeed
        self.source = source
        self.actionId = actionId
    }
}

struct MessageIngressRequest: Codable {
    let message: String
    let sessionKey: String?
    let triggerType: CoachTriggerType
    let metadata: MessageMetadata?
}

struct SessionResetRequest: Codable {
    let sessionKey: String?
}

struct CompleteCurrentSetRequest: Codable {
    let sessionKey: String?
    let workoutSessionId: String?
    let actual: WorkoutSetActual?
    let userNote: String?
}

struct MessageAcceptedResponse: Codable {
    let status: String
    let sessionKey: String
    let sessionId: String
    let sessionVersion: Int
    let eventId: String
    let runId: String
    let replayed: Bool
    let jobId: String?
    let streamUrl: String?
}

struct WorkoutActionFollowUp: Codable {
    let status: String
    let runId: String?
    let streamUrl: String?
    let jobId: String?
}

struct CompleteCurrentSetResponse: Codable {
    let status: String
    let workout: WorkoutSessionState
    let surface: CoachSurfaceResponse
    let agentFollowUp: WorkoutActionFollowUp
}

struct CoachRunStreamEvent: Codable {
    let runId: String
    var eventId: Int?
    let seqNum: Int?
    let createdAt: String?
    let type: String
    let iteration: Int?
    let text: String?
    let phase: String?
    let toolName: String?
    let status: String?
    let resultStatus: String?
    let provider: String?
    let model: String?
    let errorCode: String?
    let message: String?
}

struct SessionResetResponse: Codable {
    let status: String
    let sessionKey: String
    let sessionId: String
    let sessionVersion: Int
    let replayed: Bool
    let rotated: Bool
    let rotationReason: String?
    let previousSessionId: String?
}

struct CoachSurfaceResponse: Codable {
    let generatedAt: String
    let sessionKey: String
    let sessionId: String?
    let header: CoachSurfaceHeader
    let activeRun: CoachRunSummary?
    let workout: WorkoutSessionState?
    let pinnedCard: CoachPinnedCard?
    let feed: [CoachFeedItem]
    let composer: CoachComposerContract
    let quickActions: [CoachQuickAction]
}

struct CoachSurfaceHeader: Codable {
    let title: String
    let subtitle: String
}

struct CoachRunSummary: Codable {
    let runId: String
    let status: String
    let triggerType: String
    let createdAt: String?
    let startedAt: String?
    let finishedAt: String?
    let provider: String?
    let model: String?
}

struct CoachPinnedCard: Codable {
    let feedItemId: String
    let reason: String
    let placement: String
}

struct CoachFeedItem: Codable, Identifiable {
    let id: String
    let kind: String
    let role: String
    let text: String
    let eventType: String
    let runId: String?
    let seqNum: Int?
    let occurredAt: String?
    let card: CoachCardPayload?
}

struct CoachCardPayload: Codable {
    let type: String
    let workoutSessionId: String?
    let title: String
    let subtitle: String?
    let phase: String?
    let progressLabel: String?
    let currentExerciseName: String?
    let currentSetLabel: String?
    let coachCue: String?
    let highlights: [String]?
    let body: String?
    let metrics: [CoachMetricChip]
    let actions: [CoachCardAction]
}

struct CoachMetricChip: Codable, Identifiable {
    let id: String
    let label: String
    let value: String
    let tone: String
}

struct CoachCardAction: Codable, Identifiable {
    let id: String
    let label: String
    let icon: String?
    let actionType: String
    let semanticAction: String?
    let triggerType: String?
    let message: String?
    let style: String
    let metadata: [String: String]
}

struct CoachComposerContract: Codable {
    let placeholder: String
    let supportsText: Bool
    let supportsVoice: Bool
}

struct CoachQuickAction: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let icon: String
    let triggerType: CoachTriggerType
    let message: String
}

struct WorkoutSessionState: Codable {
    let workoutSessionId: String
    let sessionKey: String
    let status: String
    let currentPhase: String
    let title: String?
    let currentExerciseIndex: Int?
    let currentSetIndex: Int?
    let currentExerciseId: String?
    let progress: WorkoutProgress
    let exercises: [WorkoutExerciseState]
}

struct WorkoutProgress: Codable {
    let completedExercises: Int
    let totalExercises: Int
    let completedSets: Int
    let totalSets: Int
    let remainingExercises: Int
}

struct WorkoutExerciseState: Codable {
    let workoutExerciseId: String
    let orderIndex: Int
    let exerciseName: String
    let displayName: String
    let status: String
    let prescription: WorkoutExercisePrescription
    let coachMessage: String?
    let sets: [WorkoutSetState]
}

struct WorkoutExercisePrescription: Codable {
    let restSec: Int?
    let intensityCue: String?
    let coachingCues: [String]?
}

struct WorkoutSetState: Codable {
    let workoutSetId: String
    let setIndex: Int
    let status: String
    let target: WorkoutSetTarget
}

struct WorkoutSetActual: Codable {
    let reps: Int?
    let load: WorkoutLoad?
    let durationSec: Int?
    let distanceM: Int?
    let rpe: Double?
    let side: String?
}

struct WorkoutSetTarget: Codable {
    let reps: Int?
    let durationSec: Int?
    let distanceM: Int?
    let rpe: Double?
    let restSec: Int?
    let load: WorkoutLoad?
}

struct WorkoutLoad: Codable {
    let value: Double
    let unit: String?
}

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case serverError(message: String, statusCode: Int?)
    case unauthorized
    case forbidden
    case authenticationRequired
    case networkError

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode):
            return "HTTP error: \(statusCode)"
        case .serverError(let message, let statusCode):
            if let statusCode {
                return "\(message) (HTTP \(statusCode))"
            }
            return message
        case .unauthorized:
            return "Your session expired. Please sign in again."
        case .forbidden:
            return "Access denied."
        case .authenticationRequired:
            return "Please sign in to continue."
        case .networkError:
            return "Unable to connect to the backend."
        }
    }
}
