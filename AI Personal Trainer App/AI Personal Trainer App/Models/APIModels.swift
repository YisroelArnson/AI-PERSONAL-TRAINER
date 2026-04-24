// Defines app models used by api models.
//
// This file is primarily composed of types, constants, or configuration rather than standalone functions.

import Foundation

enum CoachTriggerType: String, Codable {
    case userMessage = "user.message"
    case appOpened = "app.opened"
    case startWorkout = "ui.action.start_workout"
    case completeSet = "ui.action.complete_set"
    case skipExercise = "ui.action.skip_exercise"
    case pauseWorkout = "ui.action.pause_workout"
    case resumeWorkout = "ui.action.resume_workout"
    case finishWorkout = "ui.action.finish_workout"
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

struct LLMSelection: Codable, Equatable {
    let provider: String
    let model: String?

    init(provider: String, model: String? = nil) {
        self.provider = provider
        self.model = model
    }
}

struct MessageIngressRequest: Codable {
    let message: String
    let sessionKey: String?
    let triggerType: CoachTriggerType
    let metadata: MessageMetadata?
    let llm: LLMSelection?

    init(
        message: String,
        sessionKey: String? = nil,
        triggerType: CoachTriggerType,
        metadata: MessageMetadata? = nil,
        llm: LLMSelection? = nil
    ) {
        self.message = message
        self.sessionKey = sessionKey
        self.triggerType = triggerType
        self.metadata = metadata
        self.llm = llm
    }
}

struct SessionResetRequest: Codable {
    let sessionKey: String?
}

struct WorkoutCommandOrigin: Codable {
    let actor: String
    let deviceId: String?
    let runId: String?
    let occurredAt: String?
}

struct WorkoutFinishSummary: Codable {
    let coachSummary: String?
    let agentSummary: String?
    let adaptationSummary: String?
}

struct WorkoutCommandPayload: Codable {
    let workoutExerciseId: String?
    let setIndex: Int?
    let workoutSetId: String?
    let actual: WorkoutSetActual?
    let userNote: String?
    let finalStatus: String?
    let summary: WorkoutFinishSummary?

    init(
        workoutExerciseId: String? = nil,
        setIndex: Int? = nil,
        workoutSetId: String? = nil,
        actual: WorkoutSetActual? = nil,
        userNote: String? = nil,
        finalStatus: String? = nil,
        summary: WorkoutFinishSummary? = nil
    ) {
        self.workoutExerciseId = workoutExerciseId
        self.setIndex = setIndex
        self.workoutSetId = workoutSetId
        self.actual = actual
        self.userNote = userNote
        self.finalStatus = finalStatus
        self.summary = summary
    }
}

struct WorkoutCommandRequest: Codable {
    let commandId: String
    let sessionKey: String?
    let workoutSessionId: String
    let commandType: String
    let origin: WorkoutCommandOrigin
    let baseStateVersion: Int?
    let clientSequence: Int?
    let payload: WorkoutCommandPayload
    let llm: LLMSelection?
}

struct LLMSettingsResponse: Codable {
    let userDefaultLlm: LLMSelection?
    let effectiveDefaultLlm: LLMSelection
}

struct UpdateLLMSettingsRequest: Codable {
    let userDefaultLlm: LLMSelection?

    init(userDefaultLlm: LLMSelection?) {
        self.userDefaultLlm = userDefaultLlm
    }
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

struct WorkoutCommandFollowUp: Codable {
    let status: String
    let deliveryMode: String?
    let runId: String?
    let streamUrl: String?
    let jobId: String?
}

struct WorkoutCommandConflict: Codable {
    let code: String
    let message: String
    let winner: String?
    let latestStateVersion: Int?
    let latestServerSequence: Int?
}

struct WorkoutCommandResult: Codable {
    let commandId: String
    let commandType: String
    let actor: String
    let clientSequence: Int?
    let serverSequence: Int
    let status: String
    let resolution: String
    let appliedStateVersion: Int?
    let conflict: WorkoutCommandConflict?
    let isUndoable: Bool
}

struct WorkoutCommandResponse: Codable {
    let status: String
    let command: WorkoutCommandResult
    let workout: WorkoutSessionState
    let appliedStateVersion: Int
    let agentFollowUp: WorkoutCommandFollowUp
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
    let toolUseId: String?
    let delivery: String?
    let skipped: Bool?
    let skipReason: String?
    let terminal: Bool?
    let status: String?
    let resultStatus: String?
    let provider: String?
    let model: String?
    let errorCode: String?
    let message: String?
    let appliedStateVersion: Int?
    let workout: WorkoutSessionState?
    let command: WorkoutCommandResult?
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
    var workoutSessionId: String
    var sessionKey: String
    var stateVersion: Int
    var status: String
    var currentPhase: String
    var title: String?
    var currentExerciseIndex: Int?
    var currentSetIndex: Int?
    var currentExerciseId: String?
    var progress: WorkoutProgress
    var exercises: [WorkoutExerciseState]
}

struct WorkoutProgress: Codable {
    var completedExercises: Int
    var totalExercises: Int
    var completedSets: Int
    var totalSets: Int
    var remainingExercises: Int
}

struct WorkoutExerciseState: Codable {
    var workoutExerciseId: String
    var orderIndex: Int
    var exerciseName: String
    var displayName: String
    var status: String
    var prescription: WorkoutExercisePrescription
    var coachMessage: String?
    var sets: [WorkoutSetState]
}

struct WorkoutExercisePrescription: Codable {
    var restSec: Int?
    var intensityCue: String?
    var coachingCues: [String]?
}

struct WorkoutSetState: Codable {
    var workoutSetId: String
    var setIndex: Int
    var status: String
    var target: WorkoutSetTarget
}

struct WorkoutSetActual: Codable {
    var reps: Int?
    var load: WorkoutLoad?
    var durationSec: Int?
    var distanceM: Int?
    var rpe: Double?
    var side: String?
}

struct WorkoutSetTarget: Codable {
    var reps: Int?
    var durationSec: Int?
    var distanceM: Int?
    var rpe: Double?
    var restSec: Int?
    var load: WorkoutLoad?
}

struct WorkoutLoad: Codable {
    var value: Double
    var unit: String?
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
