import SwiftUI

/// Manages navigation through intro screens, intake questions, and the intake complete screen.
/// This is a stub that will be fully implemented in Phase 5.
struct IntakeCoordinatorView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // Show current screen info (placeholder)
                Text(onboardingStore.currentScreen.question ?? onboardingStore.currentScreen.headline ?? onboardingStore.currentScreen.id)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                if let sub = onboardingStore.currentScreen.sub {
                    Text(sub)
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Text("Screen \(onboardingStore.state.currentStep + 1) of \(onboardingStore.totalSteps)")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.tertiaryText)

                Spacer()

                // Navigation buttons
                HStack(spacing: 16) {
                    if onboardingStore.state.currentStep > 0 {
                        Button("Back") {
                            Task { await onboardingStore.goToPreviousStep() }
                        }
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    }

                    Spacer()

                    if onboardingStore.currentScreen.type == .complete {
                        Button("Create my program") {
                            Task { await onboardingStore.completeIntake() }
                        }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.pill)
                    } else {
                        Button("Next") {
                            Task { await onboardingStore.goToNextStep() }
                        }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.pill)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
    }
}
