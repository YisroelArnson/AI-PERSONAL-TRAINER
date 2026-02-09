import Foundation

// MARK: - Onboarding Phase

enum OnboardingPhase: String, Codable, CaseIterable {
    case welcome = "welcome"
    case auth = "auth"
    case authVerification = "auth_verification"
    case intake = "intake"
    case assessment = "assessment"
    case nameCollection = "name_collection"
    case goalReview = "goal_review"
    case programReview = "program_review"
    case notificationPermission = "notification_permission"
    case success = "success"
    case complete = "complete"

    /// Display title for progress indicators
    var displayTitle: String {
        switch self {
        case .welcome: return "Welcome"
        case .auth: return "Sign In"
        case .authVerification: return "Verify Email"
        case .intake: return "Get to Know You"
        case .assessment: return "Assessment"
        case .nameCollection: return "Your Goals"
        case .goalReview: return "Goal Review"
        case .programReview: return "Program Review"
        case .notificationPermission: return "Notifications"
        case .success: return "All Set"
        case .complete: return "Complete"
        }
    }

    /// Returns the previous phase for back navigation
    var previousPhase: OnboardingPhase? {
        switch self {
        case .welcome, .auth:
            return nil
        case .authVerification:
            return .auth
        case .intake:
            // No back from intake — user is authenticated, going back makes no sense
            return nil
        case .assessment:
            return .intake
        case .nameCollection:
            // Assessment may be skipped, so go back to intake
            return .intake
        case .goalReview:
            return .nameCollection
        case .programReview:
            return .goalReview
        case .notificationPermission:
            return .programReview
        case .success:
            return nil
        case .complete:
            return nil
        }
    }

    /// Phases that require confirmation before navigating away
    var requiresBackConfirmation: Bool {
        switch self {
        case .intake, .assessment:
            return true
        default:
            return false
        }
    }

    /// Phases that should not have a back button
    var hideBackButton: Bool {
        switch self {
        case .welcome, .intake, .notificationPermission, .success, .complete:
            return true
        default:
            return false
        }
    }

    /// Progress percentage for the global progress bar
    var progressPercent: CGFloat {
        switch self {
        case .welcome: return 0.0
        case .auth: return 0.05
        case .authVerification: return 0.10
        case .intake: return 0.20
        case .assessment: return 0.40
        case .nameCollection: return 0.50
        case .goalReview: return 0.60
        case .programReview: return 0.75
        case .notificationPermission: return 0.90
        case .success: return 1.0
        case .complete: return 1.0
        }
    }

    /// Orb configuration for each phase
    var orbConfig: OrbConfig {
        switch self {
        case .welcome:
            return OrbConfig(size: 120, icon: nil, alignment: .center)
        case .auth, .authVerification:
            return OrbConfig(size: 60, icon: nil, alignment: .topCenter)
        case .intake:
            return OrbConfig(size: 80, icon: nil, alignment: .topCenter)
        case .assessment:
            return OrbConfig(size: 100, icon: "clipboard.fill", alignment: .center)
        case .nameCollection:
            return OrbConfig(size: 100, icon: nil, alignment: .center)
        case .goalReview, .programReview:
            return OrbConfig(size: 50, icon: nil, alignment: .topLeading)
        case .notificationPermission:
            return OrbConfig(size: 100, icon: "bell.fill", alignment: .center)
        case .success:
            return OrbConfig(size: 120, icon: "checkmark", alignment: .center)
        case .complete:
            return OrbConfig(size: 0, icon: nil, alignment: .hidden)
        }
    }

    /// Custom decoding to handle migration from old phase values
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)

        switch rawValue {
        case "microphone_permission": self = .intake
        case "assessment_prompt": self = .nameCollection
        case "goal_draft": self = .goalReview
        case "program_draft": self = .programReview
        default:
            guard let phase = OnboardingPhase(rawValue: rawValue) else {
                throw DecodingError.dataCorrupted(.init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Unknown phase: \(rawValue)"
                ))
            }
            self = phase
        }
    }
}

// MARK: - Onboarding State

struct OnboardingState: Codable {
    var currentPhase: OnboardingPhase
    var hasStartedOnboarding: Bool

    // Auth
    var pendingEmail: String?
    var agreedToTermsAt: Date?

    // User info
    var userName: String?

    // Body metrics (collected during intake)
    var weightKg: Double?
    var heightCm: Double?
    var bodyFatPercentage: Double?
    var bodyType: String?

    // Permissions
    var microphoneEnabled: Bool?
    var notificationsEnabled: Bool?
    var notificationsSkippedAt: Date?

    // Assessment
    var assessmentSkipped: Bool
    var assessmentSkippedAt: Date?

    // Session IDs
    var intakeSessionId: String?
    var assessmentSessionId: String?
    var goalContractId: String?
    var programId: String?

    var updatedAt: Date

    static var initial: OnboardingState {
        OnboardingState(
            currentPhase: .welcome,
            hasStartedOnboarding: false,
            pendingEmail: nil,
            agreedToTermsAt: nil,
            userName: nil,
            weightKg: nil,
            heightCm: nil,
            bodyFatPercentage: nil,
            bodyType: nil,
            microphoneEnabled: nil,
            notificationsEnabled: nil,
            notificationsSkippedAt: nil,
            assessmentSkipped: false,
            assessmentSkippedAt: nil,
            intakeSessionId: nil,
            assessmentSessionId: nil,
            goalContractId: nil,
            programId: nil,
            updatedAt: Date()
        )
    }
}

// MARK: - Intake Topics

enum IntakeTopic: String, CaseIterable {
    case goals = "goals"
    case schedule = "schedule"
    case equipment = "equipment"
    case bodyMetrics = "body_metrics"
    case injuries = "injuries"
    case preferences = "preferences"

    var displayTitle: String {
        switch self {
        case .goals: return "Goals"
        case .schedule: return "Schedule"
        case .equipment: return "Equipment"
        case .bodyMetrics: return "Body Metrics"
        case .injuries: return "Injuries"
        case .preferences: return "Preferences"
        }
    }

    var displayIcon: String {
        switch self {
        case .goals: return "target"
        case .schedule: return "calendar"
        case .equipment: return "dumbbell"
        case .bodyMetrics: return "figure"
        case .injuries: return "cross.case"
        case .preferences: return "heart"
        }
    }
}

// MARK: - Feature Tour

struct FeatureTourStep: Identifiable, Equatable {
    let id: String
    let title: String
    let description: String
    let highlightRect: CGRect
    let arrowDirection: ArrowDirection

    enum ArrowDirection {
        case up
        case down
        case left
        case right
    }
}

struct FeatureTourState: Codable {
    var hasCompletedTour: Bool
    var currentStepIndex: Int
    var completedAt: Date?

    static var initial: FeatureTourState {
        FeatureTourState(
            hasCompletedTour: false,
            currentStepIndex: 0,
            completedAt: nil
        )
    }
}
