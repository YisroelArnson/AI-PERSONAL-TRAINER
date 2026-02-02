import Foundation

// MARK: - Onboarding Phase

enum OnboardingPhase: String, Codable, CaseIterable {
    case welcome = "welcome"
    case auth = "auth"
    case authVerification = "auth_verification"
    case microphonePermission = "microphone_permission"
    case intake = "intake"
    case assessmentPrompt = "assessment_prompt"
    case assessment = "assessment"
    case nameCollection = "name_collection"
    case goalDraft = "goal_draft"
    case goalReview = "goal_review"
    case programDraft = "program_draft"
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
        case .microphonePermission: return "Voice Setup"
        case .intake: return "Get to Know You"
        case .assessmentPrompt: return "Assessment"
        case .assessment: return "Assessment"
        case .nameCollection: return "Your Goals"
        case .goalDraft: return "Goal Review"
        case .goalReview: return "Goal Review"
        case .programDraft: return "Your Program"
        case .programReview: return "Program Review"
        case .notificationPermission: return "Notifications"
        case .success: return "All Set"
        case .complete: return "Complete"
        }
    }

    /// Returns the previous phase for back navigation
    var previousPhase: OnboardingPhase? {
        let allPhases = OnboardingPhase.allCases
        guard let currentIndex = allPhases.firstIndex(of: self), currentIndex > 0 else {
            return nil
        }

        var targetIndex = currentIndex - 1
        let targetPhase = allPhases[targetIndex]

        // Skip authVerification when going back (go directly to auth)
        if targetPhase == .authVerification {
            targetIndex -= 1
            if targetIndex >= 0 {
                return allPhases[targetIndex]
            }
            return nil
        }

        return targetPhase
    }

    /// Phases that require confirmation before navigating away
    var requiresBackConfirmation: Bool {
        switch self {
        case .intake, .assessment, .goalReview, .programReview:
            return true
        default:
            return false
        }
    }

    /// Phases that should not have a back button
    var hideBackButton: Bool {
        switch self {
        case .welcome, .notificationPermission, .success, .complete:
            return true
        default:
            return false
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
