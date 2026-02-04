import Foundation
import SwiftUI

@MainActor
final class FeatureTourManager: ObservableObject {
    static let shared = FeatureTourManager()

    @Published var state: FeatureTourState
    @Published var isShowingTour = false
    @Published var currentStepIndex = 0

    private let userDefaultsKey = "feature_tour_state"

    // Define the tour steps
    let tourSteps: [TourStepDefinition] = [
        TourStepDefinition(
            id: "start_workout",
            title: "Start your workout here",
            description: "Tap to begin your personalized workout session",
            highlightKey: "workout_button"
        ),
        TourStepDefinition(
            id: "track_progress",
            title: "Track your progress",
            description: "View your stats and see how far you've come",
            highlightKey: "stats_area"
        ),
        TourStepDefinition(
            id: "chat_trainer",
            title: "Chat with me anytime",
            description: "Ask questions or get guidance whenever you need",
            highlightKey: "chat_button"
        ),
        TourStepDefinition(
            id: "adjust_program",
            title: "Adjust your program",
            description: "Modify your goals and training preferences",
            highlightKey: "menu_button"
        )
    ]

    private init() {
        // Load from UserDefaults
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let savedState = try? JSONDecoder().decode(FeatureTourState.self, from: data) {
            self.state = savedState
        } else {
            self.state = FeatureTourState.initial
        }
    }

    // MARK: - Persistence

    private func saveState() {
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
    }

    // MARK: - Tour Control

    var shouldShowTour: Bool {
        !state.hasCompletedTour
    }

    var currentStep: TourStepDefinition? {
        guard currentStepIndex < tourSteps.count else { return nil }
        return tourSteps[currentStepIndex]
    }

    var isLastStep: Bool {
        currentStepIndex >= tourSteps.count - 1
    }

    func startTour() {
        guard !state.hasCompletedTour else { return }
        currentStepIndex = 0
        isShowingTour = true
    }

    func nextStep() {
        if currentStepIndex < tourSteps.count - 1 {
            currentStepIndex += 1
            state.currentStepIndex = currentStepIndex
            saveState()
        } else {
            completeTour()
        }
    }

    func skipTour() {
        completeTour()
    }

    func completeTour() {
        state.hasCompletedTour = true
        state.completedAt = Date()
        isShowingTour = false
        saveState()
    }

    func resetTour() {
        state = FeatureTourState.initial
        currentStepIndex = 0
        isShowingTour = false
        saveState()
    }
}

// MARK: - Tour Step Definition

struct TourStepDefinition: Identifiable {
    let id: String
    let title: String
    let description: String
    let highlightKey: String
}

// MARK: - Highlight Preference Key

struct HighlightBoundsPreferenceKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] = [:]

    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

// MARK: - View Extensions

extension View {
    func tourHighlight(_ key: String) -> some View {
        self.anchorPreference(key: HighlightBoundsPreferenceKey.self, value: .bounds) { anchor in
            [key: anchor]
        }
    }
}
