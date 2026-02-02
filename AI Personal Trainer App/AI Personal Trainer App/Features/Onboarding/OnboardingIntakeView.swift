import SwiftUI

struct OnboardingIntakeView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var intakeStore = IntakeSessionStore.shared

    @State private var inputText = ""
    @State private var showBackConfirmation = false
    @State private var hasStarted = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress indicator
                if let progress = intakeStore.progress {
                    progressBar(done: progress.requiredDone, total: progress.requiredTotal)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.top, AppTheme.Spacing.md)
                }

                // Topic chips
                topicChips
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.top, AppTheme.Spacing.md)

                // Chat area
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: AppTheme.Spacing.md) {
                            // Greeting message
                            if !hasStarted {
                                trainerGreeting
                                    .padding(.top, AppTheme.Spacing.xl)
                            }

                            // Conversation transcript
                            ForEach(Array(intakeStore.transcript.enumerated()), id: \.offset) { index, message in
                                messageBubble(message, isTrainer: message.hasPrefix("Coach:"))
                                    .id(index)
                            }

                            // Current question
                            if !intakeStore.currentQuestion.isEmpty && hasStarted {
                                messageBubble("Coach: \(intakeStore.currentQuestion)", isTrainer: true)
                                    .id("current")
                            }

                            // Loading indicator
                            if intakeStore.isLoading {
                                HStack {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                    Spacer()
                                }
                                .padding(.horizontal, AppTheme.Spacing.xxl)
                            }
                        }
                        .padding(.bottom, AppTheme.Spacing.xl)
                    }
                    .onChange(of: intakeStore.transcript.count) { _, _ in
                        withAnimation {
                            proxy.scrollTo("current", anchor: .bottom)
                        }
                    }
                }

                Spacer()

                // Input bar
                inputBar
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.bottom, AppTheme.Spacing.md)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                OnboardingBackButton(
                    requiresConfirmation: true,
                    confirmationTitle: "Leave Intake?",
                    confirmationMessage: "Your conversation progress will be saved, but you'll need to continue from where you left off."
                ) {
                    Task {
                        await onboardingStore.goToPreviousPhase()
                    }
                }
            }
        }
        .onAppear {
            startIntake()
        }
        .onChange(of: intakeStore.summary) { _, summary in
            if summary != nil {
                // Intake complete - move to assessment prompt
                Task {
                    await onboardingStore.completeIntake()
                }
            }
        }
    }

    // MARK: - Components

    private func progressBar(done: Int, total: Int) -> some View {
        let progress = total > 0 ? Double(done) / Double(total) : 0

        return VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
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
        }
    }

    private var topicChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AppTheme.Spacing.sm) {
                ForEach(intakeStore.checklist, id: \.id) { item in
                    topicChip(item)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.sm)
        }
    }

    private func topicChip(_ item: IntakeChecklistItem) -> some View {
        let isComplete = item.status == "done"
        let isCurrent = item.status == "active"

        return HStack(spacing: AppTheme.Spacing.xs) {
            if isComplete {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
            }
            Text(item.label)
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundColor(isComplete ? AppTheme.Colors.background : (isCurrent ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText))
        .padding(.horizontal, AppTheme.Spacing.md)
        .padding(.vertical, AppTheme.Spacing.sm)
        .background(
            isComplete ? AppTheme.Colors.primaryText :
            (isCurrent ? AppTheme.Colors.surface : Color.clear)
        )
        .cornerRadius(AppTheme.CornerRadius.pill)
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.pill)
                .stroke(
                    isCurrent ? AppTheme.Colors.primaryText : AppTheme.Colors.divider,
                    lineWidth: 1
                )
        )
    }

    private var trainerGreeting: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            // Small orb
            smallOrb

            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text("Great! Let's get to know you...")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("I'll ask you some questions to understand your goals, schedule, and preferences.")
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            Spacer()
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
    }

    private var smallOrb: some View {
        let size: CGFloat = 40

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
        .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.2), radius: 6, x: 0, y: 2)
    }

    private func messageBubble(_ text: String, isTrainer: Bool) -> some View {
        let displayText = text
            .replacingOccurrences(of: "Coach: ", with: "")
            .replacingOccurrences(of: "You: ", with: "")

        return HStack {
            if !isTrainer { Spacer() }

            VStack(alignment: isTrainer ? .leading : .trailing) {
                Text(displayText)
                    .font(.system(size: 15))
                    .foregroundColor(isTrainer ? AppTheme.Colors.primaryText : AppTheme.Colors.background)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, AppTheme.Spacing.md)
                    .background(isTrainer ? AppTheme.Colors.surface : AppTheme.Colors.primaryText)
                    .cornerRadius(AppTheme.CornerRadius.large)
            }

            if isTrainer { Spacer() }
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
    }

    private var inputBar: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            // Voice button (if enabled)
            if onboardingStore.state.microphoneEnabled == true {
                Button(action: { /* Voice input */ }) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 18))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .frame(width: 44, height: 44)
                        .background(AppTheme.Colors.surface)
                        .clipShape(Circle())
                }
            }

            // Text input
            TextField("Type your response...", text: $inputText)
                .font(AppTheme.Typography.input)
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.large)

            // Send button
            Button(action: sendMessage) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.background)
                    .frame(width: 36, height: 36)
                    .background(inputText.isEmpty ? AppTheme.Colors.secondaryText : AppTheme.Colors.primaryText)
                    .clipShape(Circle())
            }
            .disabled(inputText.isEmpty || intakeStore.isLoading)
        }
    }

    // MARK: - Actions

    private func startIntake() {
        guard !hasStarted else { return }

        Task {
            await intakeStore.startOrResume()

            // Save session ID
            if let sessionId = intakeStore.session?.id {
                onboardingStore.setIntakeSessionId(sessionId)
            }

            hasStarted = true
        }
    }

    private func sendMessage() {
        guard !inputText.isEmpty else { return }

        let message = inputText
        inputText = ""

        Task {
            await intakeStore.submitAnswer(message)
        }
    }
}

#Preview {
    NavigationStack {
        OnboardingIntakeView()
    }
}
