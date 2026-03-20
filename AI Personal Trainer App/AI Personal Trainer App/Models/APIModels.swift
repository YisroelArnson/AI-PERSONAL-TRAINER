import Foundation

enum CoachTriggerType: String, Codable {
    case userMessage = "user.message"
    case appOpened = "app.opened"
    case startWorkout = "ui.action.start_workout"
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

struct CoachSurfaceResponse: Codable {
    let generatedAt: String
    let sessionKey: String
    let header: CoachSurfaceHeader
    let activeRun: CoachRunSummary?
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
    let id: String
    let kind: String
    let title: String
    let subtitle: String?
    let body: String?
}

struct CoachFeedItem: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let role: String
    let text: String
    let eventType: String
    let runId: String?
    let seqNum: Int?
    let occurredAt: String?
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
