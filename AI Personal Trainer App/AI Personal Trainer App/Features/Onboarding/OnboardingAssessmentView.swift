import SwiftUI

struct OnboardingAssessmentView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var assessmentStore = AssessmentSessionStore.shared

    @State private var hasStarted = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Step progress
                if !assessmentStore.steps.isEmpty {
                    stepProgress
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.top, AppTheme.Spacing.md)
                }

                // Content
                if let errorMessage = assessmentStore.errorMessage {
                    errorView(message: errorMessage)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.top, AppTheme.Spacing.xxxl)
                } else if assessmentStore.baseline != nil {
                    completionView
                } else if let currentStep = assessmentStore.currentStep {
                    stepView(currentStep)
                } else if assessmentStore.isLoading {
                    finishingOrLoadingView
                } else {
                    errorView(message: "Something went wrong. Please try again.")
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.top, AppTheme.Spacing.xxxl)
                }
            }
        }
        .onAppear {
            startAssessment()
        }
        .onChange(of: assessmentStore.baseline) { _, baseline in
            if baseline != nil {
                // Assessment complete - move to name collection
                Task {
                    try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5s delay for completion animation
                    await onboardingStore.setPhase(.goalReview)
                }
            }
        }
    }

    // MARK: - Components

    private var stepProgress: some View {
        let steps = assessmentStore.steps
        let currentIndex: Int = {
            if let currentId = assessmentStore.currentStep?.id,
               let idx = steps.firstIndex(where: { $0.id == currentId }) {
                return idx
            }
            if assessmentStore.baseline != nil {
                return max(steps.count - 1, 0)
            }
            if assessmentStore.currentStep == nil && !steps.isEmpty {
                // Finishing assessment (next_step is nil, baseline not yet returned)
                return max(steps.count - 1, 0)
            }
            return 0
        }()
        let progress = steps.isEmpty ? 0 : Double(currentIndex + 1) / Double(steps.count)

        return VStack(spacing: AppTheme.Spacing.sm) {
            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(AppTheme.Colors.surface)
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(AppTheme.Colors.primaryText)
                        .frame(width: geo.size.width * progress, height: 4)
                        .animation(.easeInOut(duration: 0.3), value: progress)
                }
            }
            .frame(height: 4)

            // Step indicator
            HStack {
                Text("Step \(currentIndex + 1) of \(steps.count)")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.Colors.secondaryText)

                Spacer()

                if let step = assessmentStore.currentStep {
                    Text(step.title)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
        }
    }

    private var finishingOrLoadingView: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)

            Text(assessmentStore.steps.isEmpty ? "Preparing your assessment..." : "Finishing your assessment...")
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.secondaryText)

            Spacer()
        }
    }

    private func stepView(_ step: AssessmentStep) -> some View {
        VStack(spacing: 0) {
            Spacer()
                .frame(height: AppTheme.Spacing.xxxl)

            // Step content
            VStack(spacing: AppTheme.Spacing.xl) {
                // Title
                Text(step.title)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                // Prompt
                Text(step.prompt)
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AppTheme.Spacing.lg)

                // Options (if available)
                if let options = step.options {
                    optionsView(options, step: step)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xxl)

            Spacer()

            // Skip button
            Button(action: { skipStep(step) }) {
                Text("Skip this step")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            .padding(.bottom, AppTheme.Spacing.xxxl)
        }
    }

    private func optionsView(_ options: [String], step: AssessmentStep) -> some View {
        VStack(spacing: AppTheme.Spacing.md) {
            ForEach(options, id: \.self) { option in
                Button(action: { selectOption(option, step: step) }) {
                    Text(option)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.lg)
                        .background(AppTheme.Colors.surface)
                        .cornerRadius(AppTheme.CornerRadius.medium)
                }
            }
        }
        .padding(.top, AppTheme.Spacing.lg)
    }

    private var completionView: some View {
        VStack(spacing: AppTheme.Spacing.xxxl) {
            Spacer()

            VStack(spacing: AppTheme.Spacing.md) {
                Text("Assessment Complete!")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("I now have a better understanding of your fitness level.")
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, AppTheme.Spacing.xxxl)

            Spacer()
        }
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()

            OnboardingErrorCard(
                title: "Assessment Error",
                message: message,
                primaryActionTitle: "Retry"
            ) {
                Task {
                    hasStarted = false
                    await assessmentStore.startOrResume()
                    hasStarted = true
                }
            }

            Spacer()
        }
    }

    // MARK: - Actions

    private func startAssessment() {
        guard !hasStarted else { return }

        Task {
            await assessmentStore.startOrResume()

            // Save session ID
            if let sessionId = assessmentStore.session?.id {
                // Assessment session ID no longer tracked in onboarding state
            }

            hasStarted = true
        }
    }

    private func selectOption(_ option: String, step: AssessmentStep) {
        Task {
            await assessmentStore.submit(result: ["answer": .string(option)])
        }
    }

    private func skipStep(_ step: AssessmentStep) {
        Task {
            await assessmentStore.skip(reason: "User skipped during onboarding")
        }
    }
}

#Preview {
    NavigationStack {
        OnboardingAssessmentView()
    }
}
