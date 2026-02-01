import SwiftUI

struct TrainerCalendarView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var events: [CalendarEvent] = []
    @State private var showRescheduleSheet = false
    @State private var selectedEvent: CalendarEvent?
    @State private var rescheduleDate = Date()
    @State private var errorMessage: String?

    private let apiService = APIService()

    var body: some View {
        ZStack {
            AppTheme.Gradients.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    HStack {
                        Text("Upcoming Sessions")
                            .font(AppTheme.Typography.screenTitle)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Spacer()
                        Button("Sync") {
                            Task { await syncCalendar() }
                        }
                        .buttonStyle(SecondaryCapsuleButton())
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.lg)

                    if events.isEmpty {
                        Text("No sessions scheduled yet.")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .padding(.horizontal, AppTheme.Spacing.xl)
                    } else {
                        ForEach(groupedEvents.keys.sorted(), id: \.self) { day in
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                                Text(dayLabel(for: day))
                                    .font(AppTheme.Typography.label)
                                    .foregroundColor(AppTheme.Colors.secondaryText)

                                ForEach((groupedEvents[day] ?? []).sorted { $0.startAt < $1.startAt }) { event in
                                    CalendarEventRow(
                                        event: event,
                                        onReschedule: {
                                            selectedEvent = event
                                            rescheduleDate = event.startAt
                                            showRescheduleSheet = true
                                        },
                                        onSkip: {
                                            Task { await skipEvent(event) }
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                        }
                    }
                }
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationTitle("Calendar")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .sheet(isPresented: $showRescheduleSheet) {
            NavigationView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    DatePicker("Reschedule", selection: $rescheduleDate, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                        .padding()

                    Button("Save") {
                        Task { await rescheduleSelected() }
                    }
                    .buttonStyle(PrimaryCapsuleButton())

                    Spacer()
                }
                .navigationTitle("Reschedule")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Cancel") { showRescheduleSheet = false }
                    }
                }
            }
        }
        .alert("Calendar Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .task { await loadEvents() }
    }

    private var groupedEvents: [Date: [CalendarEvent]] {
        Dictionary(grouping: events) { Calendar.current.startOfDay(for: $0.startAt) }
    }

    private func dayLabel(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }

    private func loadEvents() async {
        do {
            let start = Calendar.current.startOfDay(for: Date())
            let end = Calendar.current.date(byAdding: .day, value: 14, to: start) ?? start
            events = try await apiService.listCalendarEvents(start: start, end: end)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func syncCalendar() async {
        do {
            try await apiService.syncCalendar()
            await loadEvents()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func rescheduleSelected() async {
        guard let event = selectedEvent else { return }
        do {
            let updated = try await apiService.rescheduleCalendarEvent(eventId: event.id, startAt: rescheduleDate)
            if let index = events.firstIndex(where: { $0.id == updated.id }) {
                events[index] = updated
            }
            showRescheduleSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func skipEvent(_ event: CalendarEvent) async {
        do {
            let updated = try await apiService.skipCalendarEvent(eventId: event.id)
            if let index = events.firstIndex(where: { $0.id == updated.id }) {
                events[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CalendarEventRow: View {
    let event: CalendarEvent
    let onReschedule: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(eventTitle)
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
            Text(eventDetail)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)

            HStack(spacing: AppTheme.Spacing.sm) {
                Button("Move") { onReschedule() }
                    .buttonStyle(SecondaryCapsuleButton())
                Button("Skip") { onSkip() }
                    .buttonStyle(SecondaryCapsuleButton())
            }
            .padding(.top, AppTheme.Spacing.xs)
        }
        .padding(AppTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
        )
    }

    private var eventTitle: String {
        if let focus = plannedFocus {
            return focus
        }
        return event.title ?? "Workout"
    }

    private var eventDetail: String {
        let time = DateFormatter.localizedString(from: event.startAt, dateStyle: .none, timeStyle: .short)
        let status = event.status.capitalized
        return "\(time) • \(status)"
    }

    private var plannedFocus: String? {
        guard let intent = event.plannedSession?.intentJson else { return nil }
        if let focus = intent["focus"]?.stringValue {
            return focus
        }
        return nil
    }
}

struct MeasurementsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var measurements: [Measurement] = []
    @State private var selectedType: String = "weight"
    @State private var valueText: String = ""
    @State private var unit: String = "kg"
    @State private var errorMessage: String?
    @State private var showCorrectSheet = false
    @State private var measurementToCorrect: Measurement?
    @State private var correctedValue: String = ""

    private let apiService = APIService()

    var body: some View {
        ZStack {
            AppTheme.Gradients.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    measurementEntryCard
                    measurementList
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationTitle("Measurements")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .sheet(isPresented: $showCorrectSheet) {
            NavigationView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    Text("Correct Measurement")
                        .font(AppTheme.Typography.screenTitle)

                    TextField("Value", text: $correctedValue)
                        .padding(AppTheme.Spacing.md)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                .fill(AppTheme.Colors.surface)
                        )
                        .keyboardType(.decimalPad)
                        .padding(.horizontal, AppTheme.Spacing.xl)

                    Button("Save Correction") {
                        Task { await correctMeasurement() }
                    }
                    .buttonStyle(PrimaryCapsuleButton())

                    Spacer()
                }
                .navigationTitle("Correction")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Cancel") { showCorrectSheet = false }
                    }
                }
            }
        }
        .alert("Measurements Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .task { await loadMeasurements() }
    }

    private var measurementEntryCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Log a new measurement")
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)

            Picker("Type", selection: $selectedType) {
                Text("Weight").tag("weight")
                Text("Waist").tag("waist_circumference")
                Text("Height").tag("height")
            }
            .pickerStyle(.segmented)

            HStack(spacing: AppTheme.Spacing.sm) {
                TextField("Value", text: $valueText)
                    .padding(AppTheme.Spacing.md)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                            .fill(AppTheme.Colors.surface)
                    )
                    .keyboardType(.decimalPad)

                TextField("Unit", text: $unit)
                    .padding(AppTheme.Spacing.md)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                            .fill(AppTheme.Colors.surface)
                    )
                    .frame(width: 70)
            }

            Button("Log Measurement") {
                Task { await logMeasurement() }
            }
            .buttonStyle(PrimaryCapsuleButton())
        }
        .padding(AppTheme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }

    private var measurementList: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("History")
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)

            ForEach(measurements) { measurement in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(measurement.measurementType.replacingOccurrences(of: "_", with: " ").capitalized) • \(measurement.value, specifier: "%.1f") \(measurement.unit)")
                            .font(AppTheme.Typography.cardTitle)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Text(DateFormatter.localizedString(from: measurement.measuredAt, dateStyle: .medium, timeStyle: .none))
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                    Spacer()
                    Button("Correct") {
                        measurementToCorrect = measurement
                        correctedValue = String(format: "%.1f", measurement.value)
                        showCorrectSheet = true
                    }
                    .buttonStyle(SecondaryCapsuleButton())
                }
                .padding(AppTheme.Spacing.md)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .fill(AppTheme.Colors.surface)
                )
            }
        }
    }

    private func loadMeasurements() async {
        do {
            measurements = try await apiService.listMeasurements()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func logMeasurement() async {
        guard let value = Double(valueText) else { return }
        do {
            let response = try await apiService.logMeasurement(
                measurementType: selectedType,
                value: value,
                unit: unit,
                measuredAt: Date()
            )
            measurements.insert(response.measurement, at: 0)
            valueText = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func correctMeasurement() async {
        guard let measurement = measurementToCorrect, let value = Double(correctedValue) else { return }
        do {
            let response = try await apiService.correctMeasurement(
                id: measurement.id,
                measurementType: measurement.measurementType,
                value: value,
                unit: measurement.unit,
                measuredAt: measurement.measuredAt
            )
            measurements.insert(response.measurement, at: 0)
            showCorrectSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CoachMemoryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var memories: [MemoryItem] = []
    @State private var memoryType: String = "preference"
    @State private var key: String = ""
    @State private var value: String = ""
    @State private var errorMessage: String?

    private let apiService = APIService()

    var body: some View {
        ZStack {
            AppTheme.Gradients.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    memoryEntryCard

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Saved Memory")
                            .font(AppTheme.Typography.cardTitle)
                            .foregroundColor(AppTheme.Colors.primaryText)

                        ForEach(memories) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.key)
                                        .font(AppTheme.Typography.cardTitle)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    Text(item.valueJson.values.compactMap { $0.stringValue }.joined(separator: ", "))
                                        .font(AppTheme.Typography.label)
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                }
                                Spacer()
                                Button("Forget") {
                                    Task { await forgetMemory(item) }
                                }
                                .buttonStyle(SecondaryCapsuleButton())
                            }
                            .padding(AppTheme.Spacing.md)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                    .fill(AppTheme.Colors.surface)
                            )
                        }
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationTitle("Coach Memory")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .alert("Memory Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .task { await loadMemory() }
    }

    private var memoryEntryCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Add memory")
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)

            Picker("Type", selection: $memoryType) {
                Text("Preference").tag("preference")
                Text("Constraint").tag("constraint")
                Text("Capability").tag("capability")
                Text("Profile").tag("profile")
            }
            .pickerStyle(.segmented)

            TextField("Key (e.g. no_running)", text: $key)
                .padding(AppTheme.Spacing.md)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .fill(AppTheme.Colors.surface)
                )
            TextField("Value", text: $value)
                .padding(AppTheme.Spacing.md)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .fill(AppTheme.Colors.surface)
                )

            Button("Save Memory") {
                Task { await saveMemory() }
            }
            .buttonStyle(PrimaryCapsuleButton())
        }
        .padding(AppTheme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }

    private func loadMemory() async {
        do {
            memories = try await apiService.listMemory()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func saveMemory() async {
        guard !key.isEmpty, !value.isEmpty else { return }
        do {
            let memory = try await apiService.upsertMemory(type: memoryType, key: key, value: ["value": value])
            if let index = memories.firstIndex(where: { $0.id == memory.id }) {
                memories[index] = memory
            } else {
                memories.insert(memory, at: 0)
            }
            key = ""
            value = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func forgetMemory(_ item: MemoryItem) async {
        do {
            try await apiService.forgetMemory(key: item.key)
            memories.removeAll { $0.id == item.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct WeeklyReportsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reports: [WeeklyReport] = []
    @State private var errorMessage: String?

    private let apiService = APIService()

    var body: some View {
        ZStack {
            AppTheme.Gradients.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    Button("Generate Weekly Report") {
                        Task { await generateReport() }
                    }
                    .buttonStyle(PrimaryCapsuleButton())
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    ForEach(reports.indices, id: \.self) { index in
                        WeeklyReportCard(report: reports[index])
                            .padding(.horizontal, AppTheme.Spacing.xl)
                    }
                }
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationTitle("Weekly Reports")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .alert("Reports Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .task { await loadReports() }
    }

    private func loadReports() async {
        do {
            reports = try await apiService.listWeeklyReports()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func generateReport() async {
        do {
            let report = try await apiService.generateWeeklyReport()
            reports.insert(report, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct WeeklyReportCard: View {
    let report: WeeklyReport

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Week of \(report.weekStart)")
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
            Text("Sessions completed: \(report.sessionsCompleted)")
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
            if !report.wins.isEmpty {
                Text(report.wins.joined(separator: " • "))
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            Text(report.focus)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.primaryText)
        }
        .padding(AppTheme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }
}

struct CheckinView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var checkin: Checkin?
    @State private var energy: Int = 3
    @State private var soreness: Int = 3
    @State private var stress: Int = 3
    @State private var painYes: Bool = false
    @State private var painNote: String = ""
    @State private var scheduleNote: String = ""
    @State private var errorMessage: String?
    @State private var summary: [String: CodableValue]?

    private let apiService = APIService()

    var body: some View {
        ZStack {
            AppTheme.Gradients.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    Text("Weekly Check-in")
                        .font(AppTheme.Typography.screenTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, AppTheme.Spacing.xl)

                    checkinSlider(title: "Energy", value: $energy)
                    checkinSlider(title: "Soreness", value: $soreness)
                    checkinSlider(title: "Stress", value: $stress)

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Toggle(isOn: $painYes) {
                            Text("Any pain today?")
                                .font(AppTheme.Typography.cardTitle)
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                        .toggleStyle(SwitchToggleStyle(tint: AppTheme.Colors.accent))

                        if painYes {
                            TextField("Where/what kind?", text: $painNote)
                                .padding(AppTheme.Spacing.md)
                                .background(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .fill(AppTheme.Colors.surface)
                                )
                        }
                    }
                    .padding(AppTheme.Spacing.lg)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                            .fill(AppTheme.Colors.surface)
                    )
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Schedule changes")
                            .font(AppTheme.Typography.cardTitle)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        TextField("Anything changing this week?", text: $scheduleNote)
                            .padding(AppTheme.Spacing.md)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                    .fill(AppTheme.Colors.surface)
                            )
                    }
                    .padding(AppTheme.Spacing.lg)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                            .fill(AppTheme.Colors.surface)
                    )
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    Button("Submit Check-in") {
                        Task { await submitCheckin() }
                    }
                    .buttonStyle(PrimaryCapsuleButton())
                    .padding(.horizontal, AppTheme.Spacing.xl)

                    if let summary = summary {
                        CheckinSummaryCard(summary: summary)
                            .padding(.horizontal, AppTheme.Spacing.xl)
                    }
                }
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationTitle("Check-in")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .alert("Check-in Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .task { await loadCheckin() }
    }

    private func checkinSlider(title: String, value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text(title)
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
            Slider(value: Binding(
                get: { Double(value.wrappedValue) },
                set: { value.wrappedValue = Int($0) }
            ), in: 1...5, step: 1)
            Text("Level \(value.wrappedValue)")
                .font(AppTheme.Typography.label)
                .foregroundColor(AppTheme.Colors.secondaryText)
        }
        .padding(AppTheme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
        .padding(.horizontal, AppTheme.Spacing.xl)
    }

    private func loadCheckin() async {
        do {
            let response = try await apiService.createCheckin()
            checkin = response.checkin
            summary = response.checkin.summaryJson
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitCheckin() async {
        guard let checkin = checkin else { return }
        let responses: [String: CodableValue] = [
            "energy": .int(energy),
            "soreness": .int(soreness),
            "stress": .int(stress),
            "pain": .object([
                "value": .string(painYes ? "yes" : "no"),
                "note": .string(painNote)
            ]),
            "schedule": .string(scheduleNote)
        ]

        do {
            let response = try await apiService.submitCheckin(id: checkin.id, responses: responses)
            summary = response.checkin.summaryJson
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CheckinSummaryCard: View {
    let summary: [String: CodableValue]

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Coach Summary")
                .font(AppTheme.Typography.cardTitle)
            Text(summary["focus"]?.stringValue ?? "We'll adjust based on your check-in.")
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
        }
        .padding(AppTheme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }
}
