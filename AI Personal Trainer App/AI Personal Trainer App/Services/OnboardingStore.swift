import Foundation
import SwiftUI

@MainActor
final class OnboardingStore: ObservableObject {
    static let shared = OnboardingStore()

    @Published var state: OnboardingState
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var isGoalLoading: Bool = false

    private let userDefaultsKey = "onboarding_state"
    private let apiService = APIService()

    private init() {
        // Load from UserDefaults on init
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let savedState = try? JSONDecoder().decode(OnboardingState.self, from: data) {
            self.state = savedState
        } else {
            self.state = OnboardingState.initial
        }
    }

    // MARK: - Persistence

    func saveLocally() {
        state.updatedAt = Date()
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
    }

    func syncWithBackend() async {
        // Sync with backend if authenticated
        // For now, just save locally
        saveLocally()
    }

    private func saveAndSync() async {
        saveLocally()
        await syncWithBackend()
    }

    // MARK: - Computed Properties

    var isOnboardingComplete: Bool {
        state.currentPhase == .complete
    }

    var shouldShowAssessmentReminder: Bool {
        guard state.assessmentSkipped,
              let skippedAt = state.assessmentSkippedAt else { return false }
        let daysSinceSkip = Calendar.current.dateComponents([.day], from: skippedAt, to: Date()).day ?? 0
        return daysSinceSkip >= 7
    }

    var shouldShowNotificationReminder: Bool {
        guard state.notificationsEnabled == nil || state.notificationsEnabled == false,
              let skippedAt = state.notificationsSkippedAt else { return false }
        let daysSinceSkip = Calendar.current.dateComponents([.day], from: skippedAt, to: Date()).day ?? 0
        return daysSinceSkip >= 3
    }

    var canProceedFromNameCollection: Bool {
        state.userName != nil && !state.userName!.isEmpty && !isGoalLoading
    }

    // MARK: - Navigation

    func startOnboarding() async {
        state.hasStartedOnboarding = true
        state.currentPhase = .auth
        await saveAndSync()
    }

    func advanceToNextPhase() async {
        let phases = OnboardingPhase.allCases
        guard let currentIndex = phases.firstIndex(of: state.currentPhase),
              currentIndex < phases.count - 1 else { return }

        let nextPhase = phases[currentIndex + 1]

        // Skip assessment if user chose to skip
        if nextPhase == .assessment && state.assessmentSkipped {
            state.currentPhase = .nameCollection
        } else {
            state.currentPhase = nextPhase
        }

        await saveAndSync()
    }

    func goToPreviousPhase() async {
        guard let previousPhase = state.currentPhase.previousPhase else { return }
        state.currentPhase = previousPhase
        await saveAndSync()
    }

    func setPhase(_ phase: OnboardingPhase) async {
        state.currentPhase = phase
        await saveAndSync()
    }

    // MARK: - Auth

    func setPendingEmail(_ email: String) {
        state.pendingEmail = email
        saveLocally()
    }

    func acceptTerms() {
        state.agreedToTermsAt = Date()
        saveLocally()
    }

    func clearPendingEmail() {
        state.pendingEmail = nil
        saveLocally()
    }

    func completeAuth() async {
        state.currentPhase = .microphonePermission
        await saveAndSync()
    }

    // MARK: - User Info

    func setUserName(_ name: String) async {
        state.userName = name
        await saveAndSync()
    }

    func setBodyMetrics(weightKg: Double?, heightCm: Double?, bodyFatPercentage: Double?, bodyType: String?) {
        state.weightKg = weightKg
        state.heightCm = heightCm
        state.bodyFatPercentage = bodyFatPercentage
        state.bodyType = bodyType
        saveLocally()
    }

    // MARK: - Permissions

    func setMicrophonePermission(_ granted: Bool) async {
        state.microphoneEnabled = granted
        await saveAndSync()
    }

    func setNotificationPermission(_ granted: Bool) async {
        state.notificationsEnabled = granted
        if !granted {
            state.notificationsSkippedAt = Date()
        }
        await saveAndSync()
    }

    func skipNotifications() async {
        state.notificationsEnabled = false
        state.notificationsSkippedAt = Date()
        await saveAndSync()
    }

    // MARK: - Assessment

    func skipAssessment() async {
        state.assessmentSkipped = true
        state.assessmentSkippedAt = Date()
        state.currentPhase = .nameCollection
        await saveAndSync()
    }

    func completeAssessment() async {
        state.currentPhase = .nameCollection
        await saveAndSync()
    }

    // MARK: - Session IDs

    func setIntakeSessionId(_ id: String) {
        state.intakeSessionId = id
        saveLocally()
    }

    func setAssessmentSessionId(_ id: String) {
        state.assessmentSessionId = id
        saveLocally()
    }

    func setGoalContractId(_ id: String) {
        state.goalContractId = id
        saveLocally()
    }

    func setProgramId(_ id: String) {
        state.programId = id
        saveLocally()
    }

    // MARK: - Goal Loading Coordination

    func startGoalGeneration() async {
        isGoalLoading = true
        // The actual goal generation will be handled by GoalContractStore
        // This just tracks the loading state for the UI
    }

    func finishGoalGeneration() {
        isGoalLoading = false
    }

    // MARK: - Intake Completion

    func completeIntake() async {
        state.currentPhase = .assessmentPrompt
        await saveAndSync()
    }

    // MARK: - Goals

    func completeGoalDraft() async {
        state.currentPhase = .goalReview
        await saveAndSync()
    }

    func approveGoals() async {
        state.currentPhase = .programDraft
        await saveAndSync()
    }

    // MARK: - Program

    func completeProgramDraft() async {
        state.currentPhase = .programReview
        await saveAndSync()
    }

    func activateProgram() async {
        state.currentPhase = .notificationPermission
        await saveAndSync()
    }

    // MARK: - Success

    func completeOnboarding() async {
        state.currentPhase = .complete
        await saveAndSync()
    }

    // MARK: - Reset (for testing)

    func resetOnboarding() {
        state = OnboardingState.initial
        saveLocally()
    }
}
