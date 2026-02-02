import SwiftUI

struct ProgramFullReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var programStore = TrainingProgramStore.shared

    @State private var editInstruction = ""
    @State private var isEditing = false
    @State private var isActivating = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Title
                Text("Review Your Program")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.top, AppTheme.Spacing.xl)

                // Instructions
                Text("Review and make any changes before activating")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .padding(.top, AppTheme.Spacing.sm)

                // Program details
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        if let program = programStore.program?.program {
                            programDetailSections(program)
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

    private func programDetailSections(_ program: TrainingProgramDetail) -> some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            // Weekly template section
            weeklyTemplateCard(program.weeklyTemplate)

            // Sessions section
            sessionsCard(program.sessions)

            // Progression section
            progressionCard(program.progression)

            // Exercise rules
            exerciseRulesCard(program.exerciseRules)

            // Guardrails
            guardrailsCard(program.guardrails)

            // Coach cues
            if !program.coachCues.isEmpty {
                coachCuesCard(program.coachCues)
            }
        }
    }

    private func weeklyTemplateCard(_ template: WeeklyTemplate) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionTitle("Weekly Schedule")

            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                detailRow(icon: "calendar", label: "Days per week", value: "\(template.daysPerWeek)")

                if !template.preferredDays.isEmpty {
                    detailRow(icon: "calendar.badge.clock", label: "Preferred days", value: template.preferredDays.joined(separator: ", "))
                }

                if !template.sessionTypes.isEmpty {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        HStack {
                            Image(systemName: "list.bullet")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .frame(width: 20)
                            Text("Session types")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }

                        ForEach(template.sessionTypes, id: \.self) { type in
                            Text("• \(type)")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .padding(.leading, 28)
                        }
                    }
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func sessionsCard(_ sessions: [ProgramSession]) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionTitle("Sessions")

            ForEach(Array(sessions.enumerated()), id: \.offset) { index, session in
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    HStack {
                        Text("Day \(index + 1)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .textCase(.uppercase)

                        Spacer()

                        Text("~\(session.durationMin) min")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }

                    Text(session.focus)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    if !session.notes.isEmpty {
                        Text(session.notes)
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }

                    if !session.equipment.isEmpty {
                        HStack {
                            Image(systemName: "dumbbell")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.Colors.tertiaryText)
                            Text(session.equipment.joined(separator: ", "))
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.Colors.tertiaryText)
                        }
                    }
                }
                .padding(.vertical, AppTheme.Spacing.sm)

                if index < sessions.count - 1 {
                    Divider()
                        .background(AppTheme.Colors.divider)
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func progressionCard(_ progression: ProgramProgression) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionTitle("Progression")

            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(progression.strategy)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.primaryText)

                detailRow(icon: "arrow.triangle.2.circlepath", label: "Deload trigger", value: progression.deloadTrigger)

                if !progression.timeScaling.isEmpty {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("Time scaling")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.Colors.tertiaryText)

                        ForEach(progression.timeScaling, id: \.self) { scale in
                            Text("• \(scale)")
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

    private func exerciseRulesCard(_ rules: ProgramExerciseRules) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionTitle("Exercise Rules")

            if !rules.prefer.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    HStack {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Text("Preferred")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }

                    ForEach(rules.prefer, id: \.self) { exercise in
                        Text("• \(exercise)")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .padding(.leading, 22)
                    }
                }
            }

            if !rules.avoid.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    HStack {
                        Image(systemName: "xmark.circle")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                        Text("Avoid")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }

                    ForEach(rules.avoid, id: \.self) { exercise in
                        Text("• \(exercise)")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                            .padding(.leading, 22)
                    }
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func guardrailsCard(_ guardrails: ProgramGuardrails) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionTitle("Safety Guardrails")

            detailRow(icon: "exclamationmark.triangle", label: "Pain scale", value: guardrails.painScale)

            if !guardrails.redFlags.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("Red flags")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.tertiaryText)

                    ForEach(guardrails.redFlags, id: \.self) { flag in
                        HStack(alignment: .top, spacing: AppTheme.Spacing.xs) {
                            Image(systemName: "flag.fill")
                                .font(.system(size: 10))
                                .foregroundColor(AppTheme.Colors.danger)
                            Text(flag)
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

    private func coachCuesCard(_ cues: [String]) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionTitle("Coach Notes")

            ForEach(cues, id: \.self) { cue in
                HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                    Image(systemName: "quote.opening")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    Text(cue)
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .italic()
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(AppTheme.Colors.primaryText)
            .textCase(.uppercase)
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                Text(value)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

            Spacer()
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
                    Button(action: { /* Voice input */ }) {
                        Image(systemName: "mic")
                            .font(.system(size: 18))
                            .foregroundColor(AppTheme.Colors.secondaryText)
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
            Button(action: activateProgram) {
                HStack {
                    if isActivating {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                            .scaleEffect(0.8)
                    } else {
                        Text("Activate Program")
                    }
                }
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.large)
            }
            .disabled(isActivating)
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
            await programStore.edit(instruction: editInstruction)
            editInstruction = ""
            isEditing = false
        }
    }

    private func activateProgram() {
        isActivating = true

        Task {
            await programStore.approve()
            await programStore.activate()
            await onboardingStore.activateProgram()
            isActivating = false
        }
    }
}

#Preview {
    NavigationStack {
        ProgramFullReviewView()
    }
}
