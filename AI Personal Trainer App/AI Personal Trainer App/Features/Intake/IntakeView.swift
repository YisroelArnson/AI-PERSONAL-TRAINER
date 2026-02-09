import SwiftUI
import Speech
import AVFoundation

// MARK: - Markdown Helper

extension String {
    /// Converts markdown bold (**text**) to AttributedString
    var markdownAttributed: AttributedString {
        do {
            return try AttributedString(markdown: self)
        } catch {
            return AttributedString(self)
        }
    }
}

// MARK: - Configuration

enum IntakeContext {
    case standalone
    case onboarding
}

struct IntakeViewConfiguration {
    let context: IntakeContext
    let onComplete: (() async -> Void)?
    let onAssessment: (() async -> Void)?
    let sessionIdCallback: ((String) -> Void)?

    static var standalone: IntakeViewConfiguration {
        IntakeViewConfiguration(
            context: .standalone,
            onComplete: nil,
            onAssessment: nil,
            sessionIdCallback: nil
        )
    }
}

// MARK: - Intake Q&A Model

struct IntakeQAPair: Identifiable, Equatable {
    let id = UUID()
    let question: String
    let answer: String
}

// MARK: - Conversational Intake View

struct IntakeView: View {
    let configuration: IntakeViewConfiguration

    @Environment(\.dismiss) private var dismiss
    @StateObject private var intakeStore = IntakeSessionStore.shared
    @StateObject private var speechManager = SpeechManager()

    @State private var answerText: String = ""
    @State private var showSummary = false
    @State private var qaPairs: [IntakeQAPair] = []
    @State private var isRecording = false
    @State private var pendingAnswer: String? = nil
    @State private var previousQuestion: String = ""
    @State private var showMicSettingsAlert = false
    @FocusState private var isTextFieldFocused: Bool

    private let totalQuestions = 8

    // Standalone convenience initializer
    init() {
        self.configuration = .standalone
    }

    init(configuration: IntakeViewConfiguration) {
        self.configuration = configuration
    }

    private var currentQuestionNumber: Int {
        qaPairs.count + 1
    }

    private var progressPercent: CGFloat {
        // Use actual backend progress, not conversation pair count
        let progress = intakeStore.progress
        let done = CGFloat(progress?.requiredDone ?? 0)
        let total = CGFloat(progress?.requiredTotal ?? 8)
        return total > 0 ? done / total : 0
    }

    private var hasText: Bool {
        !answerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var inputDisabled: Bool {
        intakeStore.isLoading || intakeStore.isConfirming || intakeStore.isComplete
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()
                .onTapGesture {
                    isTextFieldFocused = false
                }

            VStack(spacing: 0) {
                // MARK: - Fixed Header (only for standalone)
                if configuration.context == .standalone {
                    IntakeHeaderView(
                        currentQuestion: currentQuestionNumber,
                        totalQuestions: totalQuestions,
                        onClose: { dismiss() }
                    )
                }

                // MARK: - Progress Bar
                IntakeProgressBarView(progress: progressPercent)
                    .padding(.horizontal, 20)
                    .padding(.top, configuration.context == .standalone ? 8 : 16)

                // Space for the shared orb (rendered by coordinator)
                Color.clear
                    .frame(height: 80)
                    .padding(.top, 20)
                    .padding(.bottom, 4)

                // MARK: - Scrollable Conversation Area
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 40) {
                            // Previous Q&A pairs (faded)
                            ForEach(qaPairs) { pair in
                                VStack(alignment: .leading, spacing: 20) {
                                    Text(pair.question.markdownAttributed)
                                        .font(.system(size: 22, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .lineSpacing(22 * 0.4)

                                    Text(pair.answer)
                                        .font(.system(size: 17, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                        .lineSpacing(17 * 0.5)
                                        .padding(.top, 4)
                                }
                                .opacity(0.5)
                            }

                            // Current question with pending answer (if any)
                            if !intakeStore.currentQuestion.isEmpty {
                                VStack(alignment: .leading, spacing: 20) {
                                    Text(intakeStore.currentQuestion.markdownAttributed)
                                        .font(.system(size: 24, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .lineSpacing(24 * 0.4)

                                    // Show "Finishing up" when confirming
                                    if intakeStore.isConfirming {
                                        Text("Finishing up...")
                                            .font(.system(size: 17, weight: .regular))
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                            .padding(.top, 4)
                                    }

                                    // Show user's answer immediately after sending
                                    if let answer = pendingAnswer, !intakeStore.isConfirming {
                                        Text(answer)
                                            .font(.system(size: 17, weight: .regular))
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                            .lineSpacing(17 * 0.5)
                                            .padding(.top, 4)
                                    }
                                }
                                .id("currentQuestion")
                            }

                            // Spacer to keep content at top
                            Color.clear
                                .frame(height: 50)
                                .id("bottom")
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onTapGesture {
                        isTextFieldFocused = false
                    }
                    .mask(
                        VStack(spacing: 0) {
                            // Top fade
                            LinearGradient(
                                colors: [.clear, .black],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(height: 30)

                            Rectangle().fill(.black)

                            // Bottom fade
                            LinearGradient(
                                colors: [.black, .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(height: 50)
                        }
                    )
                    .onChange(of: qaPairs.count) { _, _ in
                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo("currentQuestion", anchor: .top)
                        }
                    }
                    .onChange(of: intakeStore.currentQuestion) { oldQuestion, newQuestion in
                        // When question changes and we have a pending answer, add the Q&A pair to history
                        if let answer = pendingAnswer, !oldQuestion.isEmpty, newQuestion != oldQuestion {
                            qaPairs.append(IntakeQAPair(question: oldQuestion, answer: answer))
                            pendingAnswer = nil
                        }

                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo("currentQuestion", anchor: .top)
                        }
                    }
                }

                // MARK: - Input Area or Completion View
                if intakeStore.isComplete {
                    IntakeCompletionView(
                        onAssessment: {
                            if let onAssessment = configuration.onAssessment {
                                Task { @MainActor in await onAssessment() }
                            }
                        },
                        onSkip: {
                            if let onComplete = configuration.onComplete {
                                Task { @MainActor in await onComplete() }
                            } else if configuration.context == .standalone {
                                showSummary = true
                            }
                        },
                        isOnboarding: configuration.context == .onboarding
                    )
                } else {
                    IntakeInputArea(
                        answerText: $answerText,
                        isRecording: $isRecording,
                        isTextFieldFocused: $isTextFieldFocused,
                        hasText: hasText,
                        isLoading: inputDisabled,
                        micDenied: speechManager.microphoneDenied,
                        onMicTap: toggleRecording,
                        onSend: submitAnswer
                    )
                }
            }
        }
        .task {
            if intakeStore.session == nil {
                await intakeStore.startOrResume()

                // Notify caller of session ID
                if let sessionId = intakeStore.session?.id {
                    configuration.sessionIdCallback?(sessionId)
                }
            }
        }
        .onChange(of: speechManager.partialTranscript) { _, newValue in
            if speechManager.isListening {
                answerText = newValue
            }
        }
        .sheet(isPresented: $showSummary) {
            if let summary = intakeStore.summary {
                IntakeSummaryView(summary: summary)
            }
        }
        // For standalone: show summary sheet when it arrives
        .onChange(of: intakeStore.summary) { _, newSummary in
            if newSummary != nil && configuration.context == .standalone {
                showSummary = true
            }
        }
        .onDisappear {
            if speechManager.isListening {
                speechManager.stopListening()
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

    private func toggleRecording() {
        if isRecording {
            speechManager.stopListening()
            isRecording = false
        } else {
            answerText = ""
            Task {
                await speechManager.startListening()
            }
            isRecording = true
        }
    }

    private func submitAnswer() {
        let trimmed = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Stop recording if active
        if isRecording {
            speechManager.stopListening()
            isRecording = false
        }

        // Store the pending answer - will be added to history when question changes
        pendingAnswer = trimmed

        // Clear input immediately
        answerText = ""
        isTextFieldFocused = false

        // Submit to backend (completion is handled by onChange of progress)
        Task {
            await intakeStore.submitAnswer(trimmed)
        }
    }
}

// MARK: - Intake Header View

struct IntakeHeaderView: View {
    let currentQuestion: Int
    let totalQuestions: Int
    let onClose: () -> Void

    var body: some View {
        HStack {
            // Close button
            Button(action: onClose) {
                ZStack {
                    Circle()
                        .fill(AppTheme.Colors.surface)
                        .frame(width: 44, height: 44)

                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }

            Spacer()

            // Progress indicator
            Text("\(currentQuestion) of \(totalQuestions)")
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(AppTheme.Colors.secondaryText)

            Spacer()

            // Spacer for balance
            Color.clear
                .frame(width: 44, height: 44)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }
}

// MARK: - Intake Progress Bar View

struct IntakeProgressBarView: View {
    let progress: CGFloat

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Background
                RoundedRectangle(cornerRadius: 2)
                    .fill(AppTheme.Colors.surface)
                    .frame(height: 3)

                // Fill
                RoundedRectangle(cornerRadius: 2)
                    .fill(AppTheme.Colors.primaryText)
                    .frame(width: geometry.size.width * min(progress, 1.0), height: 3)
                    .animation(.easeOut(duration: 0.3), value: progress)
            }
        }
        .frame(height: 3)
    }
}

// MARK: - Intake Input Area

struct IntakeInputArea: View {
    @Binding var answerText: String
    @Binding var isRecording: Bool
    @FocusState.Binding var isTextFieldFocused: Bool
    let hasText: Bool
    let isLoading: Bool
    let micDenied: Bool
    let onMicTap: () -> Void
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            // Microphone button (always visible, shows slash when denied)
            Button(action: onMicTap) {
                ZStack {
                    Circle()
                        .fill(isRecording ? Color.red.opacity(0.2) : AppTheme.Colors.surface)
                        .frame(width: 50, height: 50)

                    Image(systemName: micDenied ? "mic.slash.fill" : "mic.fill")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(isRecording ? Color(hex: "FF3B30") : (micDenied ? AppTheme.Colors.tertiaryText : AppTheme.Colors.primaryText))
                }
            }
            .disabled(isLoading)

            // Text input
            TextField("Type your answer...", text: $answerText)
                .font(.system(size: 15, weight: .regular))
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
                .background(
                    Capsule()
                        .fill(AppTheme.Colors.surface)
                )
                .focused($isTextFieldFocused)
                .disabled(isLoading)
                .onSubmit {
                    onSend()
                }

            // Send button
            Button(action: onSend) {
                ZStack {
                    Circle()
                        .fill(hasText ? AppTheme.Colors.accent : AppTheme.Colors.surface)
                        .frame(width: 50, height: 50)

                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(hasText ? AppTheme.Colors.background : AppTheme.Colors.tertiaryText)
                }
            }
            .disabled(!hasText || isLoading)
            .animation(.easeInOut(duration: 0.2), value: hasText)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 24)
    }
}

// MARK: - Intake Completion View

struct IntakeCompletionView: View {
    let onAssessment: () -> Void
    let onSkip: () -> Void
    let isOnboarding: Bool

    var body: some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            if isOnboarding {
                // Assessment decision card
                VStack(spacing: AppTheme.Spacing.md) {
                    Text("Quick Assessment?")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("A 5-10 minute assessment helps me build a more personalized program.")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)

                    HStack(spacing: AppTheme.Spacing.md) {
                        Button(action: onSkip) {
                            Text("Skip")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                        }

                        Button(action: onAssessment) {
                            Text("Let's Do It")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.background)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.primaryText)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                    }
                }
                .padding(AppTheme.Spacing.xl)
                .background(AppTheme.Colors.surface.opacity(0.5))
                .cornerRadius(AppTheme.CornerRadius.large)
            } else {
                // Standalone: simple continue
                Button(action: onSkip) {
                    HStack {
                        Text("Continue")
                            .font(.system(size: 17, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(AppTheme.Colors.background)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(AppTheme.Colors.accent)
                    .cornerRadius(12)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }
}

// MARK: - Intake Summary View

struct IntakeSummaryView: View {
    let summary: IntakeSummary

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    SummarySection(title: "Goals", value: "Primary: \(summary.goals.primary ?? "")\nSecondary: \(summary.goals.secondary ?? "")")
                    SummarySection(title: "Motivation", value: summary.motivation ?? "")
                    SummarySection(title: "History", value: "Training: \(summary.history.training ?? "")\nActivity: \(summary.history.activityLevel ?? "")")
                    SummarySection(title: "Equipment", value: summary.equipment ?? "")
                    SummarySection(title: "Injuries", value: summary.injuries ?? "")
                    SummarySection(title: "Schedule", value: "Days: \(summary.schedule.daysPerWeek ?? "")\nMinutes: \(summary.schedule.minutesPerSession ?? "")\nPrefs: \(summary.schedule.preferences ?? "")")
                    SummarySection(title: "Preferences", value: "Likes: \(summary.preferences.likes ?? "")\nDislikes: \(summary.preferences.dislikes ?? "")\nStyle: \(summary.preferences.coachingStyle ?? "")")
                    SummarySection(title: "Notes", value: summary.notes ?? "")
                }
                .padding(AppTheme.Spacing.xl)
            }
            .navigationTitle("Intake Summary")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        IntakeView()
    }
}
