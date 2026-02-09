import SwiftUI

struct ProgramReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var programStore = TrainingProgramStore.shared
    @StateObject private var speechManager = SpeechManager()

    @State private var showTypewriter = true
    @State private var typewriterComplete = false
    @State private var editInstruction = ""
    @State private var isEditing = false
    @State private var isActivating = false
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

                // Program content (after typewriter completes)
                if typewriterComplete {
                    programContent
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()
            }

            // Bottom activate button
            if typewriterComplete && programStore.program != nil {
                VStack {
                    Spacer()
                    bottomButtons
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: typewriterComplete)
        .onAppear {
            draftProgram()
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
                text: "Now let me build your personalized training program, \(userName)...",
                font: .system(size: 20, weight: .medium),
                wordDelay: 0.06
            ) {
                withAnimation {
                    typewriterComplete = true
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

    private var programContent: some View {
        Group {
            if let program = programStore.program?.program {
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        programDetailSections(program)
                        editInputSection
                    }
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                    .padding(.top, AppTheme.Spacing.xl)
                    .padding(.bottom, 120)
                }
            } else if let errorMessage = programStore.errorMessage {
                VStack(spacing: AppTheme.Spacing.xl) {
                    Spacer()
                    OnboardingErrorCard(
                        title: "Couldn't load your program",
                        message: errorMessage,
                        primaryActionTitle: "Retry"
                    ) {
                        draftProgram()
                    }
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                    Spacer()
                }
            } else {
                loadingSection
            }
        }
    }

    // MARK: - Program Detail Sections

    private func programDetailSections(_ program: TrainingProgramDetail) -> some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            weeklyTemplateCard(program.weeklyTemplate)
            sessionsCard(program.sessions)
            progressionCard(program.progression)
            exerciseRulesCard(program.exerciseRules)
            guardrailsCard(program.guardrails)

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

    // MARK: - Helper Views

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

            if programStore.program != nil,
               let errorMessage = programStore.errorMessage,
               !programStore.isLoading {
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

    private func draftProgram() {
        guard programStore.program == nil else { return }

        Task {
            await programStore.draft()

            // Save program ID
            if let programId = programStore.program?.id {
                onboardingStore.setProgramId(programId)
            }
        }
    }

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
        ProgramReviewView()
    }
}
