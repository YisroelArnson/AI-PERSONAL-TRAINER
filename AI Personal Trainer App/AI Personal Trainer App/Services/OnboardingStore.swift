import Foundation
import SwiftUI

@MainActor
final class OnboardingStore: ObservableObject {
    static let shared = OnboardingStore()

    @Published var state: OnboardingState
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var isGoalLoading: Bool = false

    enum NavigationDirection { case forward, backward }
    @Published var navigationDirection: NavigationDirection = .forward

    private let userDefaultsKey = "onboarding_state"
    private let apiService = APIService()

    private init() {
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let savedState = try? JSONDecoder().decode(OnboardingState.self, from: data) {
            if savedState.currentPhase == .complete {
                // Onboarding was completed — restore state
                self.state = savedState
            } else if savedState.stateVersion < OnboardingState.currentStateVersion {
                // Old state version — start fresh
                self.state = OnboardingState.initial
            } else {
                // Restore in-progress state
                self.state = savedState
            }
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

    var currentScreen: OnboardingScreen {
        let screens = OnboardingScreens.all
        let step = max(0, min(state.currentStep, screens.count - 1))
        return screens[step]
    }

    var isInIntro: Bool {
        state.currentStep < OnboardingScreens.introCount
    }

    var isInIntake: Bool {
        state.currentPhase == .intake
    }

    var totalSteps: Int {
        OnboardingScreens.all.count
    }

    var shouldShowNotificationReminder: Bool {
        guard state.notificationsEnabled == nil || state.notificationsEnabled == false,
              let skippedAt = state.notificationsSkippedAt else { return false }
        let daysSinceSkip = Calendar.current.dateComponents([.day], from: skippedAt, to: Date()).day ?? 0
        return daysSinceSkip >= 3
    }

    // MARK: - Step Navigation (Intro + Intake)

    func goToNextStep() async {
        navigationDirection = .forward
        let nextStep = state.currentStep + 1

        guard nextStep < OnboardingScreens.all.count else { return }

        let nextScreen = OnboardingScreens.all[nextStep]
        state.currentStep = nextStep

        switch nextScreen.type {
        case .introHero, .introNarration, .introCTA:
            state.currentPhase = .intro
        case .complete:
            state.currentPhase = .intakeComplete
        default:
            state.currentPhase = .intake
        }

        await saveAndSync()
    }

    func goToPreviousStep() async {
        navigationDirection = .backward
        guard state.currentStep > 0 else { return }

        let prevStep = state.currentStep - 1
        let prevScreen = OnboardingScreens.all[prevStep]
        state.currentStep = prevStep

        switch prevScreen.type {
        case .introHero, .introNarration, .introCTA:
            state.currentPhase = .intro
        case .complete:
            state.currentPhase = .intakeComplete
        default:
            state.currentPhase = .intake
        }

        await saveAndSync()
    }

    // MARK: - Phase Navigation (Post-Intake)

    func goToPreviousPhase() async {
        navigationDirection = .backward
        guard let previousPhase = state.currentPhase.previousPhase else { return }
        state.currentPhase = previousPhase
        await saveAndSync()
    }

    func setPhase(_ phase: OnboardingPhase) async {
        state.currentPhase = phase
        await saveAndSync()
    }

    // MARK: - Intake Data

    func setIntakeStringField(_ field: String, value: String?) {
        state.intakeData.setStringValue(value, for: field)
        saveLocally()
    }

    func setIntakeBirthday(_ date: Date) {
        state.intakeData.birthday = date
        saveLocally()
    }

    func setIntakeHeight(_ inches: Int) {
        state.intakeData.heightInches = inches
        saveLocally()
    }

    func setIntakeWeight(_ lbs: Double) {
        state.intakeData.weightLbs = lbs
        saveLocally()
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
        navigationDirection = .forward

        // Sync local intake data to backend
        await syncIntakeToBackend()

        // Start goal options generation in background
        Task { await GoalContractStore.shared.fetchGoalOptions() }

        state.currentPhase = .goalReview
        await saveAndSync()
    }

    // MARK: - Intake Sync

    func syncIntakeToBackend() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.submitStructuredIntake(state.intakeData)
            state.intakeId = response.intakeId
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Intake Complete → Auth

    func completeIntake() async {
        navigationDirection = .forward
        state.currentPhase = .auth
        await saveAndSync()
    }

    // MARK: - Permissions

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

    // MARK: - Goals

    func startGoalGeneration() async {
        isGoalLoading = true
    }

    func finishGoalGeneration() {
        isGoalLoading = false
    }

    func approveGoals() async {
        navigationDirection = .forward
        state.currentPhase = .programReview
        await saveAndSync()
    }

    // MARK: - Program

    func activateProgram() async {
        navigationDirection = .forward
        state.currentPhase = .notificationPermission
        await saveAndSync()
    }

    // MARK: - Session IDs

    func setGoalContractId(_ id: String) {
        state.goalContractId = id
        saveLocally()
    }

    func setProgramId(_ id: String) {
        state.programId = id
        saveLocally()
    }

    // MARK: - Success

    func completeOnboarding() async {
        navigationDirection = .forward
        state.currentPhase = .complete
        await saveAndSync()
    }

    // MARK: - Reset (for testing)

    func resetOnboarding() {
        state = OnboardingState.initial
        saveLocally()
    }
}
