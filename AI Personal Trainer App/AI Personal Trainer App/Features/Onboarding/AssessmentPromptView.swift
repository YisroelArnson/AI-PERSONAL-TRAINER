import SwiftUI

struct AssessmentPromptView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Orb
                assessmentOrb

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Content
                VStack(spacing: AppTheme.Spacing.lg) {
                    Text("Quick Assessment?")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    VStack(spacing: AppTheme.Spacing.md) {
                        Text("I'd like to understand your current fitness level better.")
                            .font(.system(size: 17))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .multilineTextAlignment(.center)

                        Text("This takes about 5-10 minutes and helps me build a more personalized program.")
                            .font(.system(size: 15))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                            .multilineTextAlignment(.center)
                    }

                    // Benefits list
                    benefitsList
                        .padding(.top, AppTheme.Spacing.md)
                }
                .padding(.horizontal, AppTheme.Spacing.xxxl)

                Spacer()

                // Buttons
                VStack(spacing: AppTheme.Spacing.md) {
                    startAssessmentButton
                    skipButton
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                OnboardingBackButton {
                    Task {
                        await onboardingStore.goToPreviousPhase()
                    }
                }
            }
        }
    }

    // MARK: - Components

    private var assessmentOrb: some View {
        let size: CGFloat = 100

        return ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbSkyMid.opacity(0.2),
                            AppTheme.Colors.orbSkyDeep.opacity(0.05),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 1.0
                    )
                )
                .frame(width: size * 1.6, height: size * 1.6)

            // Main orb
            ZStack {
                Circle()
                    .fill(AppTheme.Gradients.orb)

                Circle()
                    .fill(
                        RadialGradient(
                            gradient: Gradient(colors: [
                                AppTheme.Colors.orbCloudWhite.opacity(0.9),
                                AppTheme.Colors.orbCloudWhite.opacity(0.4),
                                Color.clear
                            ]),
                            center: UnitPoint(x: 0.25, y: 0.2),
                            startRadius: 0,
                            endRadius: size * 0.4
                        )
                    )

                Circle()
                    .fill(
                        RadialGradient(
                            gradient: Gradient(colors: [
                                AppTheme.Colors.orbCloudWhite.opacity(0.7),
                                AppTheme.Colors.orbCloudWhite.opacity(0.2),
                                Color.clear
                            ]),
                            center: UnitPoint(x: 0.7, y: 0.25),
                            startRadius: 0,
                            endRadius: size * 0.35
                        )
                    )

                // Clipboard icon
                Image(systemName: "clipboard.fill")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundColor(AppTheme.Colors.orbSkyDeep.opacity(0.6))
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.3), radius: 16, x: 0, y: 6)
        }
    }

    private var benefitsList: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            benefitRow(icon: "figure.run", text: "Better starting point for your workouts")
            benefitRow(icon: "chart.line.uptrend.xyaxis", text: "Track progress more accurately")
            benefitRow(icon: "shield.checkered", text: "Avoid injury with appropriate intensity")
        }
        .padding()
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func benefitRow(icon: String, text: String) -> some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 24)

            Text(text)
                .font(.system(size: 14))
                .foregroundColor(AppTheme.Colors.secondaryText)

            Spacer()
        }
    }

    private var startAssessmentButton: some View {
        Button(action: startAssessment) {
            Text("Let's Do It")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.large)
        }
    }

    private var skipButton: some View {
        Button(action: skipAssessment) {
            Text("Skip for Now")
                .font(.system(size: 17, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
        }
    }

    // MARK: - Actions

    private func startAssessment() {
        Task {
            await onboardingStore.advanceToNextPhase()
        }
    }

    private func skipAssessment() {
        Task {
            await onboardingStore.skipAssessment()
        }
    }
}

#Preview {
    NavigationStack {
        AssessmentPromptView()
    }
}
