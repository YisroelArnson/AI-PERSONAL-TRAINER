import SwiftUI

struct GoalReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared

    @State private var selectedOption: GoalOption?
    @State private var isSelecting = false
    @State private var contentVisible = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top spacing for shared orb
                Color.clear
                    .frame(height: 50)
                    .padding(.top, AppTheme.Spacing.xl)

                if goalStore.isLoading && goalStore.goalOptions.isEmpty {
                    loadingState
                } else if let error = goalStore.errorMessage, goalStore.goalOptions.isEmpty {
                    errorState(error)
                } else {
                    optionsContent
                }
            }

            // Bottom confirm button
            if selectedOption != nil && !isSelecting {
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
            Text("Crafting your goal options...")
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
            VStack(spacing: AppTheme.Spacing.xl) {
                // Header
                VStack(spacing: AppTheme.Spacing.sm) {
                    Text("Choose Your Path")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("Pick the goal that resonates most. You can always adjust later.")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)
                .opacity(contentVisible ? 1 : 0)
                .offset(y: contentVisible ? 0 : 10)

                // Goal option cards
                ForEach(Array(goalStore.goalOptions.enumerated()), id: \.element.id) { index, option in
                    GoalOptionCard(
                        option: option,
                        isSelected: selectedOption?.id == option.id,
                        onTap: { selectedOption = option }
                    )
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                    .opacity(contentVisible ? 1 : 0)
                    .offset(y: contentVisible ? 0 : 20)
                    .animation(.easeOut(duration: 0.4).delay(0.1 * Double(index + 1)), value: contentVisible)
                }
            }
            .padding(.top, AppTheme.Spacing.lg)
            .padding(.bottom, 120)
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
