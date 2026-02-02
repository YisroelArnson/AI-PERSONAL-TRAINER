import SwiftUI

struct GoalDraftView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var goalStore = GoalContractStore.shared

    @State private var showTypewriter = true
    @State private var typewriterComplete = false

    private var userName: String {
        onboardingStore.state.userName ?? "there"
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header with orb
                headerSection
                    .padding(.top, AppTheme.Spacing.xl)

                // Typewriter intro
                if showTypewriter {
                    typewriterSection
                        .padding(.top, AppTheme.Spacing.xxl)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                }

                // Goal card
                if typewriterComplete {
                    ScrollView {
                        goalCard
                            .padding(.top, AppTheme.Spacing.xl)
                            .padding(.horizontal, AppTheme.Spacing.xxl)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }

                Spacer()

                // Review button
                if typewriterComplete {
                    reviewButton
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.bottom, AppTheme.Spacing.xxxl)
                        .transition(.opacity)
                }
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
        .animation(.easeInOut(duration: 0.3), value: typewriterComplete)
    }

    // MARK: - Components

    private var headerSection: some View {
        HStack {
            smallOrb
            Spacer()
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
    }

    private var smallOrb: some View {
        let size: CGFloat = 50

        return ZStack {
            Circle()
                .fill(AppTheme.Gradients.orb)

            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbCloudWhite.opacity(0.9),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.3, y: 0.2),
                        startRadius: 0,
                        endRadius: size * 0.4
                    )
                )
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.2), radius: 8, x: 0, y: 3)
    }

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

    private var goalCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Title
            Text("Your Goals")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)

            if let contract = goalStore.contract?.contract {
                // Primary goal
                goalSection(title: "Primary Goal", value: contract.primaryGoal)

                // Secondary goal
                if !contract.secondaryGoal.isEmpty {
                    goalSection(title: "Secondary Goal", value: contract.secondaryGoal)
                }

                Divider()
                    .background(AppTheme.Colors.divider)

                // Timeline
                HStack {
                    Image(systemName: "calendar")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    Text("\(contract.timelineWeeks) week program")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }

                // Weekly commitment
                HStack {
                    Image(systemName: "figure.run")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    Text("\(contract.weeklyCommitment.sessionsPerWeek) sessions per week, ~\(contract.weeklyCommitment.minutesPerSession) min each")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }

                // Metrics
                if !contract.metrics.isEmpty {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Success Metrics")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)

                        ForEach(contract.metrics, id: \.self) { metric in
                            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                Text(metric)
                                    .font(.system(size: 14))
                                    .foregroundColor(AppTheme.Colors.primaryText)
                            }
                        }
                    }
                }
            } else {
                // Loading state
                HStack {
                    ProgressView()
                    Text("Loading goals...")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func goalSection(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            Text(value)
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.primaryText)
        }
    }

    private var reviewButton: some View {
        Button(action: reviewGoals) {
            Text("Review & Edit")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.large)
        }
    }

    // MARK: - Actions

    private func reviewGoals() {
        Task {
            await onboardingStore.completeGoalDraft()
        }
    }
}

#Preview {
    NavigationStack {
        GoalDraftView()
    }
}
