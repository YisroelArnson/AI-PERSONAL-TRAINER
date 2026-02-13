import Foundation

// MARK: - Onboarding Phase

enum OnboardingPhase: String, Codable, CaseIterable {
    case intro = "intro"
    case intake = "intake"
    case intakeComplete = "intake_complete"
    case auth = "auth"
    case authVerification = "auth_verification"
    case processOverview = "process_overview"
    case goalReview = "goal_review"
    case programReview = "program_review"
    case notificationPermission = "notification_permission"
    case success = "success"
    case complete = "complete"

    /// Display title for progress indicators
    var displayTitle: String {
        switch self {
        case .intro: return "Welcome"
        case .intake: return "Get to Know You"
        case .intakeComplete: return "Ready"
        case .auth: return "Sign In"
        case .authVerification: return "Verify Email"
        case .processOverview: return "Getting Started"
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
        case .intro:
            return nil
        case .intake:
            // Back from first intake screen goes to intro (handled by step navigation)
            return nil
        case .intakeComplete:
            return nil // Back handled by step navigation within intake
        case .auth:
            return .intakeComplete
        case .authVerification:
            return .auth
        case .processOverview:
            return nil // Can't go back past auth
        case .goalReview:
            return .processOverview
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

    /// Phases that should not have a back button
    var hideBackButton: Bool {
        switch self {
        case .intro, .intake, .intakeComplete, .processOverview, .notificationPermission, .success, .complete:
            return true
        default:
            return false
        }
    }

    /// Orb configuration for each phase
    var orbConfig: OrbConfig {
        switch self {
        case .intro:
            // Intro screens manage their own orbs
            return OrbConfig(size: 0, icon: nil, alignment: .hidden)
        case .intake, .intakeComplete:
            // Intake screens don't show the persistent orb
            return OrbConfig(size: 0, icon: nil, alignment: .hidden)
        case .auth, .authVerification:
            return OrbConfig(size: 60, icon: nil, alignment: .topCenter)
        case .processOverview:
            return OrbConfig(size: 80, icon: nil, alignment: .hidden)
        case .goalReview:
            return OrbConfig(size: 0, icon: nil, alignment: .hidden)
        case .programReview:
            return OrbConfig(size: 0, icon: nil, alignment: .hidden)
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
        // Migration from old phase values — reset to intro
        case "welcome", "assessment", "name_collection", "microphone_permission",
             "assessment_prompt", "goal_draft", "program_draft":
            self = .intro
        default:
            guard let phase = OnboardingPhase(rawValue: rawValue) else {
                // Unknown phase — start fresh
                self = .intro
                return
            }
            self = phase
        }
    }
}

// MARK: - Onboarding State

struct OnboardingState: Codable {
    var stateVersion: Int
    var currentPhase: OnboardingPhase
    var hasStartedOnboarding: Bool

    // Step navigation within intro/intake
    var currentStep: Int

    // Intake data (local-first, synced to backend after auth)
    var intakeData: LocalIntakeData

    // Auth
    var pendingEmail: String?
    var agreedToTermsAt: Date?

    // Permissions
    var microphoneEnabled: Bool?
    var notificationsEnabled: Bool?
    var notificationsSkippedAt: Date?

    // Edit intake flow
    var isEditingIntake: Bool

    // Session IDs
    var intakeId: String?
    var goalContractId: String?
    var programId: String?

    var updatedAt: Date

    static let currentStateVersion = 2

    static var initial: OnboardingState {
        OnboardingState(
            stateVersion: currentStateVersion,
            currentPhase: .intro,
            hasStartedOnboarding: false,
            currentStep: 0,
            intakeData: LocalIntakeData(),
            pendingEmail: nil,
            agreedToTermsAt: nil,
            microphoneEnabled: nil,
            notificationsEnabled: nil,
            notificationsSkippedAt: nil,
            isEditingIntake: false,
            intakeId: nil,
            goalContractId: nil,
            programId: nil,
            updatedAt: Date()
        )
    }

    /// User's name from intake data (convenience accessor)
    var userName: String? {
        intakeData.name
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
