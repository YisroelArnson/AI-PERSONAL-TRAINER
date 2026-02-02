import SwiftUI

struct GoalFullReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared

    @State private var editInstruction = ""
    @State private var isEditing = false
    @State private var showVoiceInput = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Title
                Text("Review Your Goals")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.top, AppTheme.Spacing.xl)

                // Instructions
                Text("Review and make any changes before we continue")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .padding(.top, AppTheme.Spacing.sm)

                // Goal details
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        if let contract = goalStore.contract?.contract {
                            goalDetailCard(contract)
                        }

                        // Edit input
                        editInputSection
                    }
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                    .padding(.top, AppTheme.Spacing.xxl)
                    .padding(.bottom, 120)
                }

                Spacer()
            }

            // Bottom buttons
            VStack {
                Spacer()
                bottomButtons
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

    private func goalDetailCard(_ contract: GoalContractDetail) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Primary goal
            editableField(
                label: "Primary Goal",
                value: contract.primaryGoal,
                icon: "target"
            )

            // Secondary goal
            if !contract.secondaryGoal.isEmpty {
                editableField(
                    label: "Secondary Goal",
                    value: contract.secondaryGoal,
                    icon: "star"
                )
            }

            Divider()
                .background(AppTheme.Colors.divider)

            // Timeline
            editableField(
                label: "Timeline",
                value: "\(contract.timelineWeeks) weeks",
                icon: "calendar"
            )

            // Weekly commitment
            editableField(
                label: "Weekly Commitment",
                value: "\(contract.weeklyCommitment.sessionsPerWeek) sessions, \(contract.weeklyCommitment.minutesPerSession) min each",
                icon: "figure.run"
            )

            Divider()
                .background(AppTheme.Colors.divider)

            // Metrics
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text("Success Metrics")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .textCase(.uppercase)

                ForEach(contract.metrics, id: \.self) { metric in
                    HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Text(metric)
                            .font(.system(size: 15))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }

            // Constraints
            if !contract.constraints.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Constraints")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .textCase(.uppercase)

                    ForEach(contract.constraints, id: \.self) { constraint in
                        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                            Text(constraint)
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }
                    }
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func editableField(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .frame(width: 20)

                Text(value)
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Spacer()
            }
        }
    }

    private var editInputSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Want to make changes?")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)

            HStack(spacing: AppTheme.Spacing.sm) {
                // Voice button (if enabled)
                if onboardingStore.state.microphoneEnabled == true {
                    Button(action: { showVoiceInput.toggle() }) {
                        Image(systemName: showVoiceInput ? "mic.fill" : "mic")
                            .font(.system(size: 18))
                            .foregroundColor(showVoiceInput ? AppTheme.Colors.orbSkyMid : AppTheme.Colors.secondaryText)
                            .frame(width: 44, height: 44)
                            .background(AppTheme.Colors.surface)
                            .clipShape(Circle())
                    }
                }

                // Text input
                TextField("Describe your changes...", text: $editInstruction)
                    .font(AppTheme.Typography.input)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, AppTheme.Spacing.md)
                    .background(AppTheme.Colors.surface)
                    .cornerRadius(AppTheme.CornerRadius.medium)

                // Apply button
                if !editInstruction.isEmpty {
                    Button(action: applyEdit) {
                        if isEditing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                                .scaleEffect(0.8)
                        } else {
                            Text("Apply")
                                .font(.system(size: 14, weight: .semibold))
                        }
                    }
                    .foregroundColor(AppTheme.Colors.background)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, AppTheme.Spacing.md)
                    .background(AppTheme.Colors.primaryText)
                    .cornerRadius(AppTheme.CornerRadius.medium)
                    .disabled(isEditing)
                }
            }
        }
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.surface.opacity(0.5))
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private var bottomButtons: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            Button(action: approveGoals) {
                Text("Approve Goals")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.background)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, AppTheme.Spacing.lg)
                    .background(AppTheme.Colors.primaryText)
                    .cornerRadius(AppTheme.CornerRadius.large)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
        .padding(.bottom, AppTheme.Spacing.xxxl)
        .background(
            LinearGradient(
                colors: [AppTheme.Colors.background.opacity(0), AppTheme.Colors.background],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 100)
            .offset(y: -40)
        )
    }

    // MARK: - Actions

    private func applyEdit() {
        guard !editInstruction.isEmpty else { return }

        isEditing = true

        Task {
            await goalStore.edit(instruction: editInstruction)
            editInstruction = ""
            isEditing = false
        }
    }

    private func approveGoals() {
        Task {
            await goalStore.approve()
            await onboardingStore.approveGoals()
        }
    }
}

#Preview {
    NavigationStack {
        GoalFullReviewView()
    }
}
