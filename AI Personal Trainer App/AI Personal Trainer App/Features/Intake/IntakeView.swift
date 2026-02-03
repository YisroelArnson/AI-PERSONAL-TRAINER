import SwiftUI
import Speech
import AVFoundation

// MARK: - Configuration

enum IntakeContext {
    case standalone
    case onboarding
}

struct IntakeViewConfiguration {
    let context: IntakeContext
    let onComplete: (() async -> Void)?
    let isMicrophoneEnabled: Bool
    let sessionIdCallback: ((String) -> Void)?

    static var standalone: IntakeViewConfiguration {
        IntakeViewConfiguration(
            context: .standalone,
            onComplete: nil,
            isMicrophoneEnabled: true,
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
        CGFloat(qaPairs.count) / CGFloat(totalQuestions)
    }

    private var hasText: Bool {
        !answerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

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

                // MARK: - Fixed AI Orb
                AIOrb(size: 80, isLoading: intakeStore.isLoading)
                    .padding(.top, 20)
                    .padding(.bottom, 12)

                // MARK: - Scrollable Conversation Area
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 40) {
                            // Previous Q&A pairs (faded)
                            ForEach(qaPairs) { pair in
                                VStack(alignment: .leading, spacing: 20) {
                                    Text(pair.question)
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
                                    Text(intakeStore.currentQuestion)
                                        .font(.system(size: 24, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .lineSpacing(24 * 0.4)

                                    // Show user's answer immediately after sending
                                    if let answer = pendingAnswer {
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

                // MARK: - Input Area
                IntakeInputArea(
                    answerText: $answerText,
                    isRecording: $isRecording,
                    isTextFieldFocused: $isTextFieldFocused,
                    hasText: hasText,
                    isLoading: intakeStore.isLoading,
                    showMicrophone: configuration.isMicrophoneEnabled,
                    onMicTap: toggleRecording,
                    onSend: submitAnswer
                )
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
        .onChange(of: intakeStore.summary) { _, newSummary in
            if newSummary != nil {
                switch configuration.context {
                case .standalone:
                    showSummary = true
                case .onboarding:
                    if let onComplete = configuration.onComplete {
                        Task {
                            await onComplete()
                        }
                    }
                }
            }
        }
        .onChange(of: intakeStore.progress) { _, newProgress in
            // Check for completion when progress updates
            if let progress = newProgress,
               progress.requiredDone >= progress.requiredTotal,
               intakeStore.summary == nil,
               !intakeStore.isConfirming {
                Task {
                    await intakeStore.confirmIntake()
                }
            }
        }
        .onDisappear {
            if speechManager.isListening {
                speechManager.stopListening()
            }
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

// MARK: - AI Orb Component

struct AIOrb: View {
    let size: CGFloat
    var isLoading: Bool = false

    @State private var isPulsing = false

    // Cloud-like sky colors
    private let skyBlueLight = Color(red: 0.7, green: 0.85, blue: 0.95)
    private let skyBlueMid = Color(red: 0.4, green: 0.7, blue: 0.9)
    private let skyBlueDeep = Color(red: 0.2, green: 0.5, blue: 0.85)
    private let cloudWhite = Color(red: 0.95, green: 0.97, blue: 1.0)

    var body: some View {
        ZStack {
            // Base gradient - sky blue bottom to light top
            Circle()
                .fill(
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: cloudWhite.opacity(0.95), location: 0),
                            .init(color: skyBlueLight, location: 0.3),
                            .init(color: skyBlueMid, location: 0.6),
                            .init(color: skyBlueDeep, location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: size, height: size)

            // Cloud layer 1 - top left wisp
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            cloudWhite.opacity(0.9),
                            cloudWhite.opacity(0.4),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.25, y: 0.2),
                        startRadius: 0,
                        endRadius: size * 0.4
                    )
                )
                .frame(width: size, height: size)

            // Cloud layer 2 - top right highlight
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            cloudWhite.opacity(0.7),
                            cloudWhite.opacity(0.2),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.7, y: 0.25),
                        startRadius: 0,
                        endRadius: size * 0.35
                    )
                )
                .frame(width: size, height: size)

            // Cloud layer 3 - middle soft cloud
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            cloudWhite.opacity(0.5),
                            skyBlueLight.opacity(0.3),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.5, y: 0.4),
                        startRadius: 0,
                        endRadius: size * 0.45
                    )
                )
                .frame(width: size, height: size)

            // Subtle inner shadow for depth
            Circle()
                .stroke(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.3),
                            Color.clear,
                            skyBlueDeep.opacity(0.2)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1
                )
                .frame(width: size - 1, height: size - 1)
        }
        .clipShape(Circle())
        .scaleEffect(isPulsing ? 1.08 : 1.0)
        .opacity(isPulsing ? 0.85 : 1.0)
        .onChange(of: isLoading) { _, loading in
            if loading {
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                    isPulsing = true
                }
            } else {
                withAnimation(.easeOut(duration: 0.3)) {
                    isPulsing = false
                }
            }
        }
    }
}

// MARK: - Intake Input Area

struct IntakeInputArea: View {
    @Binding var answerText: String
    @Binding var isRecording: Bool
    @FocusState.Binding var isTextFieldFocused: Bool
    let hasText: Bool
    let isLoading: Bool
    let showMicrophone: Bool
    let onMicTap: () -> Void
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            // Microphone button (conditional)
            if showMicrophone {
                Button(action: onMicTap) {
                    ZStack {
                        Circle()
                            .fill(isRecording ? Color.red.opacity(0.2) : AppTheme.Colors.surface)
                            .frame(width: 50, height: 50)

                        Image(systemName: "mic.fill")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundColor(isRecording ? Color(hex: "FF3B30") : AppTheme.Colors.primaryText)
                    }
                }
                .disabled(isLoading)
            }

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
