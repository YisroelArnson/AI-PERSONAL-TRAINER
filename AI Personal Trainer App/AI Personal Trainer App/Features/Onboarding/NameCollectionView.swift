import SwiftUI

struct NameCollectionView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared

    @State private var name = ""
    @State private var hasStartedGoalGeneration = false

    private var canContinue: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !onboardingStore.isGoalLoading
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Thinking orb
                thinkingOrb

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Content
                VStack(spacing: AppTheme.Spacing.xl) {
                    // Loading state text
                    Text("While I'm putting together your personalized goals...")
                        .font(.system(size: 17))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, AppTheme.Spacing.lg)

                    // Name prompt
                    Text("What should I call you?")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    // Name input
                    TextField("Your first name", text: $name)
                        .font(.system(size: 18))
                        .multilineTextAlignment(.center)
                        .padding()
                        .background(AppTheme.Colors.surface)
                        .cornerRadius(AppTheme.CornerRadius.medium)
                        .padding(.horizontal, AppTheme.Spacing.xxxl)

                    // Loading indicator
                    if onboardingStore.isGoalLoading {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Creating your goal plan...")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }
                        .padding(.top, AppTheme.Spacing.md)
                    } else if !name.isEmpty {
                        Text("Almost ready...")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                            .padding(.top, AppTheme.Spacing.md)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)

                Spacer()

                // Continue button
                continueButton
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
        .onAppear {
            startGoalGeneration()
        }
    }

    // MARK: - Components

    private var thinkingOrb: some View {
        let size: CGFloat = 100

        return ZStack {
            // Pulsing outer glow
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbSkyMid.opacity(0.3),
                            AppTheme.Colors.orbSkyDeep.opacity(0.1),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 1.2
                    )
                )
                .frame(width: size * 1.8, height: size * 1.8)
                .pulsingAnimation()

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

                // Thinking indicator
                if onboardingStore.isGoalLoading {
                    ProgressView()
                        .scaleEffect(1.2)
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.orbSkyDeep.opacity(0.6)))
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.4), radius: 20, x: 0, y: 8)
        }
    }

    private var continueButton: some View {
        Button(action: continueToGoals) {
            Text("Continue")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
                .background(canContinue ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText)
                .cornerRadius(AppTheme.CornerRadius.large)
        }
        .disabled(!canContinue)
    }

    // MARK: - Actions

    private func startGoalGeneration() {
        guard !hasStartedGoalGeneration else { return }
        hasStartedGoalGeneration = true

        Task {
            await onboardingStore.startGoalGeneration()

            // Draft goals
            await goalStore.draft()

            // Save goal contract ID
            if let goalId = goalStore.contract?.id {
                onboardingStore.setGoalContractId(goalId)
            }

            onboardingStore.finishGoalGeneration()
        }
    }

    private func continueToGoals() {
        guard canContinue else { return }

        Task {
            await onboardingStore.setUserName(name.trimmingCharacters(in: .whitespaces))
            await onboardingStore.advanceToNextPhase()
        }
    }
}

#Preview {
    NavigationStack {
        NameCollectionView()
    }
}
