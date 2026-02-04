import SwiftUI

struct OnboardingAssessmentView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var assessmentStore = AssessmentSessionStore.shared

    @State private var hasStarted = false
    @State private var showBackConfirmation = false

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
                if assessmentStore.isLoading && assessmentStore.currentStep == nil {
                    loadingView
                } else if let currentStep = assessmentStore.currentStep {
                    stepView(currentStep)
                } else if assessmentStore.baseline != nil {
                    completionView
                } else {
                    loadingView
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                OnboardingBackButton(
                    action: {
                        Task {
                            await onboardingStore.goToPreviousPhase()
                        }
                    },
                    requiresConfirmation: true,
                    confirmationTitle: "Leave Assessment?",
                    confirmationMessage: "Your progress will be lost and you'll need to start over."
                )
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
                    await onboardingStore.completeAssessment()
                }
            }
        }
    }

    // MARK: - Components

    private var stepProgress: some View {
        let steps = assessmentStore.steps
        let currentIndex = steps.firstIndex(where: { $0.id == assessmentStore.currentStep?.id }) ?? 0
        let progress = steps.isEmpty ? 0 : Double(currentIndex) / Double(steps.count)

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

    private var loadingView: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)

            Text("Preparing your assessment...")
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

            // Success orb
            ZStack {
                Circle()
                    .fill(AppTheme.Gradients.orb)
                    .frame(width: 100, height: 100)

                Image(systemName: "checkmark")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundColor(.white)
            }
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.3), radius: 16, x: 0, y: 6)

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

    // MARK: - Actions

    private func startAssessment() {
        guard !hasStarted else { return }

        Task {
            await assessmentStore.startOrResume()

            // Save session ID
            if let sessionId = assessmentStore.session?.id {
                onboardingStore.setAssessmentSessionId(sessionId)
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
