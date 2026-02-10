import SwiftUI

struct GoalReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared

    @State private var selectedOption: GoalOption?
    @State private var isSelecting = false
    @State private var contentVisible = false
    @State private var editText = ""
    @State private var isRefining = false
    @FocusState private var isEditFocused: Bool

    /// The user's raw goal text from intake
    private var userGoalText: String? {
        onboardingStore.state.intakeData.goals
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                if goalStore.isLoading && goalStore.goalOptions.isEmpty {
                    loadingState
                } else if let error = goalStore.errorMessage, goalStore.goalOptions.isEmpty {
                    errorState(error)
                } else {
                    optionsContent
                }
            }

            // Bottom confirm button
            if selectedOption != nil && !isSelecting && !isRefining {
                VStack {
                    Spacer()
                    confirmButton
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: contentVisible)
        .animation(.easeInOut(duration: 0.25), value: selectedOption?.id)
        .task {
            if goalStore.goalOptions.isEmpty && !goalStore.isLoading {
                await goalStore.fetchGoalOptions()
            }
            withAnimation(.easeOut(duration: 0.4).delay(0.2)) {
                contentVisible = true
            }
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()
            ProgressView()
                .scaleEffect(1.2)
            Text(isRefining ? "Refining your goals..." : "Crafting your goal options...")
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.secondaryText)
            Spacer()
        }
    }

    // MARK: - Error State

    private func errorState(_ message: String) -> some View {
        VStack {
            Spacer()
            OnboardingErrorCard(
                title: "Couldn't load goal options",
                message: message,
                primaryActionTitle: "Retry"
            ) {
                Task { await goalStore.fetchGoalOptions() }
            }
            .padding(.horizontal, AppTheme.Spacing.xxl)
            Spacer()
        }
    }

    // MARK: - Options Content

    private var optionsContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header
                Text("Choose Your Path")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .opacity(contentVisible ? 1 : 0)

                // User's goal text from intake
                if let goalText = userGoalText, !goalText.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("You said:")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                            .textCase(.uppercase)
                            .tracking(0.5)

                        Text("\"\(goalText)\"")
                            .font(.system(size: 16))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .italic()
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(AppTheme.Colors.surface)
                    .cornerRadius(AppTheme.CornerRadius.medium)
                    .padding(.horizontal, 24)
                    .padding(.top, 16)
                    .opacity(contentVisible ? 1 : 0)

                    // Arrow indicating refinement
                    Image(systemName: "arrow.down")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .padding(.vertical, 12)
                        .opacity(contentVisible ? 1 : 0)
                }

                // Subtitle
                Text("Pick the goal that resonates most, or suggest changes below.")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
                    .opacity(contentVisible ? 1 : 0)

                // Goal option cards
                VStack(spacing: 12) {
                    ForEach(Array(goalStore.goalOptions.enumerated()), id: \.element.id) { index, option in
                        GoalOptionCard(
                            option: option,
                            isSelected: selectedOption?.id == option.id,
                            onTap: { selectedOption = option }
                        )
                        .opacity(contentVisible ? 1 : 0)
                        .offset(y: contentVisible ? 0 : 20)
                        .animation(.easeOut(duration: 0.4).delay(0.1 * Double(index + 1)), value: contentVisible)
                    }
                }
                .padding(.horizontal, 24)

                // Edit / refine section
                editSection
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, selectedOption != nil ? 120 : 40)
                    .opacity(contentVisible ? 1 : 0)
            }
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.height > 30 {
                        isEditFocused = false
                    }
                }
        )
    }

    // MARK: - Edit Section

    private var editSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Want something different?")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)

            HStack(spacing: 10) {
                TextField("e.g., I'd rather focus on mobility...", text: $editText)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(AppTheme.Colors.surface)
                    .cornerRadius(AppTheme.CornerRadius.medium)
                    .focused($isEditFocused)
                    .submitLabel(.send)
                    .onSubmit { refineGoals() }

                if !editText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(action: refineGoals) {
                        if isRefining {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                                .frame(width: 20, height: 20)
                        } else {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 28))
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                    }
                    .disabled(isRefining)
                }
            }
        }
    }

    // MARK: - Confirm Button

    private var confirmButton: some View {
        VStack(spacing: 0) {
            Button(action: confirmSelection) {
                if isSelecting {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                } else {
                    Text("Continue with this goal")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
            }
            .background(AppTheme.Colors.primaryText)
            .cornerRadius(AppTheme.CornerRadius.large)
            .disabled(isSelecting)
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
        .padding(.bottom, 40)
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

    private func confirmSelection() {
        guard let option = selectedOption else { return }
        isSelecting = true
        Task {
            await goalStore.selectOption(option)
            if goalStore.contract != nil {
                onboardingStore.setGoalContractId(goalStore.contract!.id)
                await onboardingStore.approveGoals()
            }
            isSelecting = false
        }
    }

    private func refineGoals() {
        let instruction = editText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !instruction.isEmpty else { return }
        isEditFocused = false
        isRefining = true
        selectedOption = nil
        Task {
            await goalStore.refineOptions(instruction: instruction)
            editText = ""
            isRefining = false
        }
    }
}

// MARK: - Goal Option Card

struct GoalOptionCard: View {
    let option: GoalOption
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                // Title row
                HStack {
                    Text(option.title)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Spacer()

                    // Selection indicator
                    ZStack {
                        Circle()
                            .stroke(isSelected ? AppTheme.Colors.orbSkyDeep : AppTheme.Colors.tertiaryText, lineWidth: 2)
                            .frame(width: 24, height: 24)

                        if isSelected {
                            Circle()
                                .fill(AppTheme.Colors.orbSkyDeep)
                                .frame(width: 14, height: 14)
                        }
                    }
                }

                // Description
                Text(option.description)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                // Details row
                HStack(spacing: AppTheme.Spacing.lg) {
                    detailPill(icon: "calendar", text: "\(option.timelineWeeks)w")
                    detailPill(icon: "figure.run", text: "\(option.sessionsPerWeek)x/wk")
                    detailPill(icon: "clock", text: "\(option.minutesPerSession)min")
                }

                // Focus areas
                if !option.focusAreas.isEmpty {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        ForEach(option.focusAreas.prefix(3), id: \.self) { area in
                            Text(area)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(isSelected ? AppTheme.Colors.orbSkyDeep : AppTheme.Colors.secondaryText)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(
                                    (isSelected ? AppTheme.Colors.orbSkyDeep : AppTheme.Colors.tertiaryText)
                                        .opacity(0.12)
                                )
                                .cornerRadius(AppTheme.CornerRadius.small)
                        }
                    }
                }
            }
            .padding(AppTheme.Spacing.xl)
            .background(AppTheme.Colors.surface)
            .cornerRadius(AppTheme.CornerRadius.large)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                    .stroke(isSelected ? AppTheme.Colors.orbSkyDeep : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }

    private func detailPill(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11))
            Text(text)
                .font(.system(size: 13, weight: .medium))
        }
        .foregroundColor(AppTheme.Colors.secondaryText)
    }
}
