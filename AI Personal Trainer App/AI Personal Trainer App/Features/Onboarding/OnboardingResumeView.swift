import SwiftUI

/// Shown when a user returns to the app mid-onboarding.
/// Offers "Pick up where I left off" or "Start over".
struct OnboardingResumeView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var contentVisible = false
    @State private var buttonVisible = false

    private var userName: String? {
        let name = onboardingStore.state.intakeData.name
        return (name ?? "").isEmpty ? nil : name
    }

    private var sectionLabel: String? {
        let screen = onboardingStore.currentScreen
        return screen.label?.rawValue
    }

    /// How many intake questions have been answered (approximate via step position)
    private var questionsAnswered: Int {
        max(0, onboardingStore.state.currentStep - OnboardingScreens.introCount)
    }

    private var totalQuestions: Int {
        OnboardingScreens.all.count - OnboardingScreens.introCount - 1 // exclude complete screen
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Orb
                OnboardingOrbView(size: 80)
                    .opacity(contentVisible ? 1 : 0)
                    .scaleEffect(contentVisible ? 1 : 0.9)

                Spacer()
                    .frame(height: 32)

                // Greeting
                VStack(spacing: AppTheme.Spacing.md) {
                    if let name = userName {
                        Text("Welcome back, \(name).")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    } else {
                        Text("Welcome back.")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }

                    Text("You were \(questionsAnswered) of \(totalQuestions) questions in.")
                        .font(.system(size: 16))
                        .foregroundColor(AppTheme.Colors.secondaryText)

                    if let section = sectionLabel {
                        Text("Section: \(section)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                            .textCase(.uppercase)
                            .tracking(0.5)
                    }
                }
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .opacity(contentVisible ? 1 : 0)
                .offset(y: contentVisible ? 0 : 12)

                Spacer()

                // Buttons
                VStack(spacing: AppTheme.Spacing.md) {
                    // Resume button (primary)
                    Button(action: resumeOnboarding) {
                        Text("Pick up where I left off")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(AppTheme.Colors.background)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(AppTheme.Colors.primaryText)
                            .cornerRadius(AppTheme.CornerRadius.large)
                    }

                    // Start over button (secondary)
                    Button(action: startOver) {
                        Text("Start over")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)
                .padding(.bottom, 40)
                .opacity(buttonVisible ? 1 : 0)
                .offset(y: buttonVisible ? 0 : 10)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.4).delay(0.1)) {
                contentVisible = true
            }
            withAnimation(.easeOut(duration: 0.3).delay(0.4)) {
                buttonVisible = true
            }
        }
    }

    // MARK: - Actions

    private func resumeOnboarding() {
        Haptic.medium()
        onboardingStore.dismissResumeGate()
    }

    private func startOver() {
        Haptic.light()
        onboardingStore.startOverFromResumeGate()
    }
}

#Preview {
    OnboardingResumeView()
}
