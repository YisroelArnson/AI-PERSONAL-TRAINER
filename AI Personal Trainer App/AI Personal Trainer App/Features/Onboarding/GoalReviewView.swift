import SwiftUI

struct GoalReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared
    @StateObject private var speechManager = SpeechManager()

    @State private var showTypewriter = true
    @State private var typewriterComplete = false
    @State private var editInstruction = ""
    @State private var isEditing = false
    @State private var showVoiceInput = false
    @State private var showMicSettingsAlert = false

    private var userName: String {
        onboardingStore.state.userName ?? "there"
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top spacing for shared orb (rendered by coordinator)
                Color.clear
                    .frame(height: 50)
                    .padding(.top, AppTheme.Spacing.xl)

                // Typewriter intro
                if showTypewriter && !typewriterComplete {
                    typewriterSection
                        .padding(.top, AppTheme.Spacing.xxl)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                }

                // Goal card + edit section (after typewriter completes)
                if typewriterComplete {
                    ScrollView {
                        VStack(spacing: AppTheme.Spacing.lg) {
                            goalsContent

                            // Edit input
                            editInputSection
                        }
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.top, AppTheme.Spacing.xl)
                        .padding(.bottom, 120)
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()
            }

            // Bottom approve button
            if typewriterComplete && goalStore.contract != nil {
                VStack {
                    Spacer()
                    bottomButtons
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: typewriterComplete)
        .task {
            if goalStore.contract == nil && !goalStore.isLoading {
                await goalStore.draft()
            }
        }
        .onChange(of: speechManager.needsSettingsForMic) { _, needsSettings in
            if needsSettings {
                showMicSettingsAlert = true
                speechManager.needsSettingsForMic = false
            }
        }
        .alert("Microphone Access", isPresented: $showMicSettingsAlert) {
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Enable microphone access in Settings to use voice input.")
        }
    }

    // MARK: - Components

    private var typewriterSection: some View {
        VStack(alignment: .leading) {
            TypewriterTextView(
                text: "Based on what you've told me, here's what I'm thinking, \(userName)...",
                font: .system(size: 20, weight: .medium),
                wordDelay: 0.06
            ) {
                withAnimation {
                    typewriterComplete = true
                }
            }
        }
    }

    private var goalsContent: some View {
        Group {
            if let contract = goalStore.contract?.contract {
                goalDetailCard(contract)
            } else if let errorMessage = goalStore.errorMessage {
                OnboardingErrorCard(
                    title: "Couldn't load your goals",
                    message: errorMessage,
                    primaryActionTitle: "Retry"
                ) {
                    Task { await goalStore.draft() }
                }
            } else {
                VStack(spacing: AppTheme.Spacing.xl) {
                    Spacer()
                    ProgressView()
                        .scaleEffect(1.2)
                    Text("Loading goals...")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    Spacer()
                }
                .frame(minHeight: 200)
            }
        }
    }

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
                // Voice button (always visible, lazy permission)
                Button(action: { toggleVoiceInput() }) {
                    Image(systemName: speechManager.microphoneDenied ? "mic.slash.fill" : (showVoiceInput ? "mic.fill" : "mic"))
                        .font(.system(size: 18))
                        .foregroundColor(speechManager.microphoneDenied ? AppTheme.Colors.tertiaryText : (showVoiceInput ? AppTheme.Colors.orbSkyMid : AppTheme.Colors.secondaryText))
                        .frame(width: 44, height: 44)
                        .background(AppTheme.Colors.surface)
                        .clipShape(Circle())
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

            if goalStore.contract != nil,
               let errorMessage = goalStore.errorMessage,
               !goalStore.isLoading {
                Text(errorMessage)
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.Colors.danger)
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

    private func toggleVoiceInput() {
        if showVoiceInput {
            speechManager.stopListening()
            showVoiceInput = false
        } else {
            Task {
                await speechManager.startListening()
                if !speechManager.microphoneDenied {
                    showVoiceInput = true
                }
            }
        }
    }

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
        GoalReviewView()
    }
}
