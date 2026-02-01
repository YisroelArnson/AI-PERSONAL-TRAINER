import SwiftUI

struct TrainerJourneyView: View {
    @State private var journeyState: JourneyState?
    @State private var showDataHub = false
    private let apiService = APIService()

    @State private var showIntake = false
    @State private var showAssessment = false
    @State private var showGoals = false
    @State private var showProgram = false
    @State private var showMonitoring = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        JourneyCard(
                            title: "Phase A — Intake",
                            subtitle: "Coach interview and summary",
                            status: statusLabel(journeyState?.intakeStatus),
                            actionTitle: "Start Intake"
                        ) {
                            showIntake = true
                        }

                        JourneyCard(
                            title: "Phase B — Assessment",
                            subtitle: "Guided baseline testing",
                            status: statusLabel(journeyState?.assessmentStatus),
                            actionTitle: "Start Assessment"
                        ) {
                            showAssessment = true
                        }

                        JourneyCard(
                            title: "Phase C — Goals",
                            subtitle: "Review and approve goal contract",
                            status: statusLabel(journeyState?.goalsStatus),
                            actionTitle: "Set Goals"
                        ) {
                            showGoals = true
                        }

                        JourneyCard(
                            title: "Phase D — Program",
                            subtitle: "Review and activate training program",
                            status: statusLabel(journeyState?.programStatus),
                            actionTitle: "Design Program"
                        ) {
                            showProgram = true
                        }

                        JourneyCard(
                            title: "Phase F — Monitoring",
                            subtitle: "Weekly report + adjustments",
                            status: statusLabel(journeyState?.monitoringStatus),
                            actionTitle: "View Monitoring"
                        ) {
                            showMonitoring = true
                        }

                        JourneyCard(
                            title: "Your Data Hub",
                            subtitle: "Calendar, measurements, memory, reports",
                            status: nil,
                            actionTitle: "Open Data"
                        ) {
                            showDataHub = true
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.xxxl)
                }
            }
        }
        .sheet(isPresented: $showIntake) {
            IntakeView()
        }
        .sheet(isPresented: $showAssessment) {
            AssessmentView()
        }
        .sheet(isPresented: $showGoals) {
            GoalsView()
        }
        .sheet(isPresented: $showProgram) {
            ProgramDesignView()
        }
        .sheet(isPresented: $showMonitoring) {
            MonitoringView()
        }
        .sheet(isPresented: $showDataHub) {
            TrainerDataHubView()
        }
        .task {
            await loadJourneyState()
        }
    }

    private func loadJourneyState() async {
        do {
            journeyState = try await apiService.fetchJourneyState()
        } catch {
            // ignore
        }
    }

    private func statusLabel(_ status: String?) -> String? {
        guard let status else { return nil }
        switch status {
        case "complete", "active":
            return "Complete"
        case "in_progress":
            return "In progress"
        case "deferred":
            return "Deferred"
        default:
            return nil
        }
    }

    // Header handled by global back bar in MainAppView.
}

struct JourneyCard: View {
    let title: String
    let subtitle: String
    let status: String?
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            if let status = status {
                Text(status)
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            Text(title)
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
            Text(subtitle)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)

            Button(action: action) {
                Text(actionTitle)
                    .font(AppTheme.Typography.button)
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)
                    .background(
                        Capsule().fill(AppTheme.Colors.accent)
                    )
                    .foregroundColor(AppTheme.Colors.background)
            }
            .padding(.top, AppTheme.Spacing.sm)
        }
        .padding(AppTheme.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
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
    @Environment(\.dismiss) private var dismiss
    @StateObject private var intakeStore = IntakeSessionStore.shared
    @StateObject private var speechRecognizer = SpeechRecognizer()

    @State private var answerText: String = ""
    @State private var showSummary = false
    @State private var qaPairs: [IntakeQAPair] = []
    @State private var isRecording = false
    @State private var pendingAnswer: String? = nil  // Track answer waiting for backend response
    @State private var previousQuestion: String = "" // Track previous question to detect changes
    @FocusState private var isTextFieldFocused: Bool

    // Total questions for progress (configurable)
    private let totalQuestions = 8

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
                // MARK: - Fixed Header
                IntakeHeaderView(
                    currentQuestion: currentQuestionNumber,
                    totalQuestions: totalQuestions,
                    onClose: { dismiss() }
                )

                // MARK: - Progress Bar
                IntakeProgressBarView(progress: progressPercent)
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                // MARK: - Fixed AI Orb
                AIOrb(size: 80)
                    .padding(.top, 20)
                    .padding(.bottom, 12)

                // MARK: - Scrollable Conversation Area
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            // Previous Q&A pairs (faded)
                            ForEach(qaPairs) { pair in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(pair.question)
                                        .font(.system(size: 22, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .lineSpacing(22 * 0.4)

                                    Text(pair.answer)
                                        .font(.system(size: 18, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                        .lineSpacing(18 * 0.5)
                                }
                                .opacity(0.5)
                            }

                            // Current question with pending answer (if any)
                            if !intakeStore.currentQuestion.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(intakeStore.currentQuestion)
                                        .font(.system(size: 24, weight: .regular))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .lineSpacing(24 * 0.4)

                                    // Show user's answer immediately after sending
                                    if let answer = pendingAnswer {
                                        Text(answer)
                                            .font(.system(size: 18, weight: .regular))
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                            .lineSpacing(18 * 0.5)
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
                    onMicTap: toggleRecording,
                    onSend: submitAnswer
                )
            }
        }
        .task {
            if intakeStore.session == nil {
                await intakeStore.startOrResume()
            }
        }
        .onChange(of: speechRecognizer.transcript) { _, newValue in
            if isRecording {
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
                showSummary = true
            }
        }
    }

    private func toggleRecording() {
        if isRecording {
            speechRecognizer.stopTranscribing()
            isRecording = false
        } else {
            answerText = ""
            speechRecognizer.startTranscribing()
            isRecording = true
        }
    }

    private func submitAnswer() {
        let trimmed = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Stop recording if active
        if isRecording {
            speechRecognizer.stopTranscribing()
            isRecording = false
        }

        // Store the pending answer - will be added to history when question changes
        pendingAnswer = trimmed

        // Clear input
        answerText = ""
        isTextFieldFocused = false

        // Submit to backend
        Task {
            await intakeStore.submitAnswer(trimmed)

            // Check if intake is complete
            if let progress = intakeStore.progress,
               progress.requiredDone >= progress.requiredTotal {
                await intakeStore.confirmIntake()
            }
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
    }
}

// MARK: - Intake Input Area
struct IntakeInputArea: View {
    @Binding var answerText: String
    @Binding var isRecording: Bool
    @FocusState.Binding var isTextFieldFocused: Bool
    let hasText: Bool
    let isLoading: Bool
    let onMicTap: () -> Void
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            // Microphone button
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

            // Text input
            TextField("Type your answer...", text: $answerText, axis: .vertical)
                .font(.system(size: 15, weight: .regular))
                .lineLimit(1...3)
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

// MARK: - Speech Recognizer
import Speech
import AVFoundation

@MainActor
class SpeechRecognizer: ObservableObject {
    @Published var transcript: String = ""
    @Published var isAvailable: Bool = false

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    init() {
        requestAuthorization()
    }

    private func requestAuthorization() {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                self?.isAvailable = status == .authorized
            }
        }
    }

    func startTranscribing() {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            return
        }

        transcript = ""

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return
        }

        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else { return }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else { return }

        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.taskHint = .dictation

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            recognitionRequest.append(buffer)
        }

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                DispatchQueue.main.async {
                    self.transcript = result.bestTranscription.formattedString
                }
            }

            if error != nil || result?.isFinal == true {
                self.stopTranscribing()
            }
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            stopTranscribing()
        }
    }

    func stopTranscribing() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()

        audioEngine = nil
        recognitionRequest = nil
        recognitionTask = nil

        try? AVAudioSession.sharedInstance().setActive(false)
    }
}

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

struct SummarySection: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(title)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.Colors.secondaryText)
            Text(value.isEmpty ? "—" : value)
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
        }
        .padding(AppTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
        )
    }
}

struct PrimaryCapsuleButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.button)
            .foregroundColor(AppTheme.Colors.background)
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(
                Capsule().fill(AppTheme.Colors.accent)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct SecondaryCapsuleButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.button)
            .foregroundColor(AppTheme.Colors.primaryText)
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(
                Capsule().fill(AppTheme.Colors.surface)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct AssessmentView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var assessmentStore = AssessmentSessionStore.shared
    @State private var responseText: String = ""

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()

                VStack(spacing: AppTheme.Spacing.lg) {
                    if let step = assessmentStore.currentStep {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Text(step.title)
                                .font(.system(size: 18, weight: .semibold, design: .rounded))
                                .foregroundColor(AppTheme.Colors.primaryText)
                            Text(step.prompt)
                                .font(.system(size: 15, weight: .regular, design: .rounded))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, AppTheme.Spacing.xl)

                        if let options = step.options, !options.isEmpty {
                            ForEach(options, id: \.self) { option in
                                Button(option) {
                                    Task {
                                        await assessmentStore.submit(result: ["answer": .string(option)])
                                    }
                                }
                                .buttonStyle(PrimaryCapsuleButton())
                                .padding(.horizontal, AppTheme.Spacing.xl)
                            }
                        } else if step.type == "complete" {
                            Button("Generate Baseline") {
                                Task { await assessmentStore.complete() }
                            }
                            .buttonStyle(PrimaryCapsuleButton())
                            .padding(.horizontal, AppTheme.Spacing.xl)
                        } else {
                            TextField("Your response", text: $responseText)
                                .padding(AppTheme.Spacing.md)
                                .background(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .fill(AppTheme.Colors.surface)
                                )
                                .padding(.horizontal, AppTheme.Spacing.xl)
                            Button("Next") {
                                let trimmed = responseText.trimmingCharacters(in: .whitespacesAndNewlines)
                                guard !trimmed.isEmpty else { return }
                                Task {
                                    await assessmentStore.submit(result: ["response": .string(trimmed)])
                                    responseText = ""
                                }
                            }
                            .buttonStyle(PrimaryCapsuleButton())
                            .padding(.horizontal, AppTheme.Spacing.xl)
                        }

                        Spacer()

                        HStack(spacing: AppTheme.Spacing.md) {
                            Button("Skip") {
                                Task { await assessmentStore.skip(reason: "Skipped") }
                            }
                            .buttonStyle(SecondaryCapsuleButton())

                            Button("Exit") { dismiss() }
                                .buttonStyle(SecondaryCapsuleButton())
                        }
                        .padding(.bottom, AppTheme.Spacing.lg)
                    } else {
                        Text("Loading assessment...")
                            .font(.system(size: 16, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                }
            }
            .navigationTitle("Assessment")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if assessmentStore.session == nil {
                    await assessmentStore.startOrResume()
                }
            }
            .sheet(isPresented: Binding(get: { assessmentStore.baseline != nil }, set: { _ in })) {
                if let baseline = assessmentStore.baseline {
                    AssessmentBaselineView(baseline: baseline)
                }
            }
        }
    }
}

struct AssessmentBaselineView: View {
    let baseline: AssessmentBaseline

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    SummarySection(title: "Readiness", value: baseline.readiness)
                    SummarySection(title: "Strength", value: baseline.strength)
                    SummarySection(title: "Mobility", value: baseline.mobility)
                    SummarySection(title: "Conditioning", value: baseline.conditioning)
                    SummarySection(title: "Pain flags", value: baseline.painFlags)
                    SummarySection(title: "Confidence", value: baseline.confidence)
                    SummarySection(title: "Notes", value: baseline.notes)
                }
                .padding(AppTheme.Spacing.xl)
            }
            .navigationTitle("Baseline")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct GoalsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var goalStore = GoalContractStore.shared
    @State private var editText: String = ""

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()

                VStack(spacing: AppTheme.Spacing.lg) {
                    if let contract = goalStore.contract {
                        GoalContractCard(contract: contract.contract)

                        VStack(spacing: AppTheme.Spacing.sm) {
                            TextField("Edit request (e.g., shorter timeline)", text: $editText)
                                .padding(AppTheme.Spacing.md)
                                .background(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .fill(AppTheme.Colors.surface)
                                )
                                .padding(.horizontal, AppTheme.Spacing.xl)

                            HStack(spacing: AppTheme.Spacing.md) {
                                Button("Apply Edit") {
                                    let trimmed = editText.trimmingCharacters(in: .whitespacesAndNewlines)
                                    guard !trimmed.isEmpty else { return }
                                    Task {
                                        await goalStore.edit(instruction: trimmed)
                                        editText = ""
                                    }
                                }
                                .buttonStyle(PrimaryCapsuleButton())

                                Button("Approve") {
                                    Task { await goalStore.approve() }
                                }
                                .buttonStyle(SecondaryCapsuleButton())
                            }
                        }
                    } else {
                        Button("Generate Goal Draft") {
                            Task { await goalStore.draft() }
                        }
                        .buttonStyle(PrimaryCapsuleButton())
                    }

                    Spacer()
                }
            }
            .navigationTitle("Goals")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

struct GoalContractCard: View {
    let contract: GoalContractDetail

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            SummarySection(title: "Primary Goal", value: contract.primaryGoal)
            SummarySection(title: "Secondary Goal", value: contract.secondaryGoal)
            SummarySection(title: "Timeline", value: "\(contract.timelineWeeks) weeks")
            SummarySection(title: "Metrics", value: contract.metrics.joined(separator: ", "))
            SummarySection(title: "Commitment", value: "\(contract.weeklyCommitment.sessionsPerWeek) sessions · \(contract.weeklyCommitment.minutesPerSession) min")
            SummarySection(title: "Constraints", value: contract.constraints.joined(separator: ", "))
            SummarySection(title: "Tradeoffs", value: contract.tradeoffs.joined(separator: ", "))
            SummarySection(title: "Assumptions", value: contract.assumptions.joined(separator: ", "))
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
    }
}

struct ProgramDesignView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var programStore = TrainingProgramStore.shared
    @State private var editText: String = ""

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()

                VStack(spacing: AppTheme.Spacing.lg) {
                    if let program = programStore.program {
                        ProgramCard(program: program.program)

                        VStack(spacing: AppTheme.Spacing.sm) {
                            TextField("Edit request (e.g., less time per session)", text: $editText)
                                .textFieldStyle(.roundedBorder)
                                .padding(.horizontal, AppTheme.Spacing.xl)

                            HStack(spacing: AppTheme.Spacing.md) {
                                Button("Apply Edit") {
                                    let trimmed = editText.trimmingCharacters(in: .whitespacesAndNewlines)
                                    guard !trimmed.isEmpty else { return }
                                    Task {
                                        await programStore.edit(instruction: trimmed)
                                        editText = ""
                                    }
                                }
                                .buttonStyle(PrimaryCapsuleButton())

                                Button("Approve") {
                                    Task { await programStore.approve() }
                                }
                                .buttonStyle(SecondaryCapsuleButton())

                                Button("Activate") {
                                    Task { await programStore.activate() }
                                }
                                .buttonStyle(SecondaryCapsuleButton())
                            }
                        }
                    } else {
                        Button("Generate Program Draft") {
                            Task { await programStore.draft() }
                        }
                        .buttonStyle(PrimaryCapsuleButton())
                    }

                    Spacer()
                }
            }
            .navigationTitle("Program")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

struct ProgramCard: View {
    let program: TrainingProgramDetail

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            SummarySection(title: "Primary Goal", value: program.goals.primary)
            SummarySection(title: "Secondary Goal", value: program.goals.secondary)
            SummarySection(title: "Weekly Template", value: "\(program.weeklyTemplate.daysPerWeek) days · \(program.weeklyTemplate.sessionTypes.joined(separator: ", "))")
            SummarySection(title: "Sessions", value: program.sessions.map { $0.focus }.joined(separator: ", "))
            SummarySection(title: "Progression", value: program.progression.strategy)
            SummarySection(title: "Guardrails", value: program.guardrails.painScale)
            SummarySection(title: "Coach Cues", value: program.coachCues.joined(separator: ", "))
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
    }
}

struct MonitoringView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reports: [WeeklyReport] = []
    @State private var events: [CalendarEvent] = []
    @State private var memories: [MemoryItem] = []
    @State private var measurements: [Measurement] = []
    @State private var newWeight: String = ""
    @State private var isLoading: Bool = false
    @State private var showCalendar = false
    @State private var showMeasurements = false
    @State private var showMemory = false
    @State private var showReports = false
    @State private var showCheckin = false
    private let apiService = APIService()

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Button("Weekly Report") { showReports = true }
                            .buttonStyle(PrimaryCapsuleButton())
                        Button("Check-in") { showCheckin = true }
                            .buttonStyle(SecondaryCapsuleButton())
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    HStack(spacing: AppTheme.Spacing.sm) {
                        Button("Calendar") { showCalendar = true }
                            .buttonStyle(SecondaryCapsuleButton())
                        Button("Measurements") { showMeasurements = true }
                            .buttonStyle(SecondaryCapsuleButton())
                        Button("Coach Memory") { showMemory = true }
                            .buttonStyle(SecondaryCapsuleButton())
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    SummarySection(title: "Weekly Reports", value: reports.first?.focus ?? "Generate your first report to see insights.")

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Upcoming Week")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                        ForEach(events) { event in
                            Text("\(event.title ?? "Workout") · \(event.status)")
                                .font(.system(size: 13, weight: .regular, design: .rounded))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Coach Memory")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                        ForEach(memories) { item in
                            Text("\(item.key): \(item.valueJson.values.compactMap { $0.stringValue }.joined(separator: ", "))")
                                .font(.system(size: 13, weight: .regular, design: .rounded))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Measurements")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                        ForEach(measurements) { measurement in
                            Text("\(measurement.measurementType): \(measurement.value) \(measurement.unit)")
                                .font(.system(size: 13, weight: .regular, design: .rounded))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }

                        HStack(spacing: AppTheme.Spacing.sm) {
                            TextField("Weight", text: $newWeight)
                                .textFieldStyle(.roundedBorder)
                            Button("Log") {
                                Task { await logWeight() }
                            }
                            .buttonStyle(PrimaryCapsuleButton())
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                }
                .padding(.top, AppTheme.Spacing.lg)
            }
            .navigationTitle("Monitoring")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await loadMonitoring() }
            .sheet(isPresented: $showCalendar) {
                NavigationView {
                    TrainerCalendarView()
                }
            }
            .sheet(isPresented: $showMeasurements) {
                NavigationView {
                    MeasurementsView()
                }
            }
            .sheet(isPresented: $showMemory) {
                NavigationView {
                    CoachMemoryView()
                }
            }
            .sheet(isPresented: $showReports) {
                NavigationView {
                    WeeklyReportsView()
                }
            }
            .sheet(isPresented: $showCheckin) {
                NavigationView {
                    CheckinView()
                }
            }
        }
    }

    private func loadMonitoring() async {
        isLoading = true
        do {
            reports = try await apiService.listWeeklyReports()
            let start = Date()
            let end = Calendar.current.date(byAdding: .day, value: 7, to: start) ?? start
            events = try await apiService.listCalendarEvents(start: start, end: end)
            memories = try await apiService.listMemory()
            measurements = try await apiService.listMeasurements()
        } catch {
            // ignore
        }
        isLoading = false
    }

    private func logWeight() async {
        guard let value = Double(newWeight) else { return }
        do {
            let response = try await apiService.logMeasurement(measurementType: "weight", value: value, unit: "kg", measuredAt: Date())
            measurements.insert(response.measurement, at: 0)
            newWeight = ""
        } catch {
            // ignore
        }
    }
}
