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
            AnimatedGradientBackground()
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

struct IntakeView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var intakeStore = IntakeSessionStore.shared
    @State private var answerText: String = ""
    @State private var showSummary = false

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()

                VStack(spacing: AppTheme.Spacing.lg) {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Trainer Setup · Intake")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.secondaryText)

                        Text(intakeStore.currentQuestion.isEmpty ? "Let’s get to know you." : intakeStore.currentQuestion)
                            .font(.system(size: 20, weight: .regular, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                            .multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.xl)

                    if let progress = intakeStore.progress {
                        IntakeProgressView(progress: progress)
                            .padding(.horizontal, AppTheme.Spacing.xl)
                    }

                    ScrollView {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            ForEach(intakeStore.transcript, id: \.self) { line in
                                Text(line)
                                    .font(.system(size: 13, weight: .regular, design: .rounded))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, AppTheme.Spacing.xl)
                    }

                    VStack(spacing: AppTheme.Spacing.sm) {
                        TextField("Answer here...", text: $answerText, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(AppTheme.Spacing.md)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                    .fill(AppTheme.Colors.surface)
                            )
                            .padding(.horizontal, AppTheme.Spacing.xl)

                        HStack(spacing: AppTheme.Spacing.md) {
                            Button("Send") {
                                let trimmed = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
                                guard !trimmed.isEmpty else { return }
                                Task {
                                    await intakeStore.submitAnswer(trimmed)
                                    answerText = ""
                                }
                            }
                            .buttonStyle(PrimaryCapsuleButton())

                            Button("Confirm") {
                                Task {
                                    await intakeStore.confirmIntake()
                                    showSummary = true
                                }
                            }
                            .buttonStyle(SecondaryCapsuleButton())
                        }
                        .padding(.bottom, AppTheme.Spacing.lg)
                    }
                }
            }
            .navigationTitle("Intake")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .task {
                if intakeStore.session == nil {
                    await intakeStore.startOrResume()
                }
            }
            .sheet(isPresented: $showSummary) {
                if let summary = intakeStore.summary {
                    IntakeSummaryView(summary: summary)
                }
            }
        }
    }
}

struct IntakeProgressView: View {
    let progress: IntakeProgress

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text("Required: \(progress.requiredDone)/\(progress.requiredTotal)")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.Colors.secondaryText)
            ForEach(progress.topics, id: \.topic) { topic in
                HStack {
                    Text(topic.topic)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                    Spacer()
                    Text("\(topic.completed)/\(topic.total)")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
        )
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
