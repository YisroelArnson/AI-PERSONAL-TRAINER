import SwiftUI

struct ProgramDraftView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var programStore = TrainingProgramStore.shared

    @State private var showTypewriter = true
    @State private var typewriterComplete = false
    @State private var isLoading = false

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

                // Loading state
                if isLoading {
                    loadingSection
                }

                // Program card
                if typewriterComplete && !isLoading {
                    ScrollView {
                        programCard
                            .padding(.top, AppTheme.Spacing.xl)
                            .padding(.horizontal, AppTheme.Spacing.xxl)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }

                Spacer()

                // Review button
                if typewriterComplete && !isLoading {
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
        .animation(.easeInOut(duration: 0.3), value: isLoading)
        .onAppear {
            draftProgram()
        }
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
                text: "Now let me build your personalized training program, \(userName)...",
                font: .system(size: 20, weight: .medium),
                wordDelay: 0.06
            ) {
                withAnimation {
                    typewriterComplete = true
                    if programStore.program == nil {
                        isLoading = true
                    }
                }
            }
        }
    }

    private var loadingSection: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)

            Text("Crafting your program...")
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.secondaryText)

            Spacer()
        }
    }

    private var programCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Title
            Text("Your Training Program")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)

            if let program = programStore.program?.program {
                // Weekly overview
                weeklyOverview(program.weeklyTemplate)

                Divider()
                    .background(AppTheme.Colors.divider)

                // Sessions
                sessionsSection(program.sessions)

                Divider()
                    .background(AppTheme.Colors.divider)

                // Progression
                progressionSection(program.progression)
            } else {
                // Loading state
                HStack {
                    ProgressView()
                    Text("Loading program...")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func weeklyOverview(_ template: WeeklyTemplate) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Weekly Schedule")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            HStack {
                Image(systemName: "calendar")
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Text("\(template.daysPerWeek) days per week")
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

            // Preferred days
            if !template.preferredDays.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        ForEach(template.preferredDays, id: \.self) { day in
                            Text(day)
                                .font(.system(size: 12, weight: .medium))
                                .padding(.horizontal, AppTheme.Spacing.md)
                                .padding(.vertical, AppTheme.Spacing.xs)
                                .background(AppTheme.Colors.surface)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                        .stroke(AppTheme.Colors.divider, lineWidth: 1)
                                )
                                .cornerRadius(AppTheme.CornerRadius.small)
                        }
                    }
                }
            }

            // Session types
            if !template.sessionTypes.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("Session Types")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.tertiaryText)

                    ForEach(template.sessionTypes, id: \.self) { type in
                        HStack(spacing: AppTheme.Spacing.sm) {
                            Image(systemName: "circle.fill")
                                .font(.system(size: 4))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                            Text(type)
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                    }
                }
            }
        }
    }

    private func sessionsSection(_ sessions: [ProgramSession]) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Sessions Overview")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            ForEach(Array(sessions.enumerated()), id: \.offset) { index, session in
                sessionRow(session, index: index)
            }
        }
    }

    private func sessionRow(_ session: ProgramSession, index: Int) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text("Day \(index + 1): \(session.focus)")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Spacer()

                Text("~\(session.durationMin) min")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            if !session.notes.isEmpty {
                Text(session.notes)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
        }
        .padding(.vertical, AppTheme.Spacing.sm)
    }

    private func progressionSection(_ progression: ProgramProgression) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Progression Strategy")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            Text(progression.strategy)
                .font(.system(size: 15))
                .foregroundColor(AppTheme.Colors.primaryText)

            HStack {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Text("Deload: \(progression.deloadTrigger)")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
        }
    }

    private var reviewButton: some View {
        Button(action: reviewProgram) {
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

    private func draftProgram() {
        guard programStore.program == nil else {
            isLoading = false
            return
        }

        Task {
            await programStore.draft()

            // Save program ID
            if let programId = programStore.program?.id {
                onboardingStore.setProgramId(programId)
            }

            isLoading = false
        }
    }

    private func reviewProgram() {
        Task {
            await onboardingStore.completeProgramDraft()
        }
    }
}

#Preview {
    NavigationStack {
        ProgramDraftView()
    }
}
