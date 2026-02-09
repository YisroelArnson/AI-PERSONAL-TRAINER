import SwiftUI

struct NameCollectionView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared

    @State private var name = ""
    @State private var hasStartedGoalGeneration = false

    private var canContinue: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
        && goalStore.contract != nil
        && !onboardingStore.isGoalLoading
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Space for the shared orb (rendered by coordinator)
                Color.clear
                    .frame(width: 100, height: 100)

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
                    } else if let errorMessage = goalStore.errorMessage {
                        OnboardingErrorCard(
                            title: "Couldn't create your goals",
                            message: errorMessage,
                            primaryActionTitle: "Retry"
                        ) {
                            hasStartedGoalGeneration = false
                            startGoalGeneration()
                        }
                        .padding(.top, AppTheme.Spacing.lg)
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
        .onAppear {
            startGoalGeneration()
        }
    }

    // MARK: - Components

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
            defer { onboardingStore.finishGoalGeneration() }

            // Draft goals
            await goalStore.draft()

            // Save goal contract ID
            if let goalId = goalStore.contract?.id {
                onboardingStore.setGoalContractId(goalId)
            }
        }
    }

    private func continueToGoals() {
        guard canContinue else { return }

        Task {
            onboardingStore.setIntakeStringField("name", value: name.trimmingCharacters(in: .whitespaces))
            await onboardingStore.setPhase(.goalReview)
        }
    }
}

#Preview {
    NavigationStack {
        NameCollectionView()
    }
}
