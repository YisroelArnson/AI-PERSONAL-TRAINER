import SwiftUI

private enum CalendarViewMode {
    case grid
    case list
}

struct TrainerCalendarView: View {
    @Environment(\.dismiss) private var dismiss
    let showsSheetChrome: Bool
    @State private var events: [CalendarEvent] = []
    @State private var isLoadingEvents = false
    @State private var historyByCalendarEventId: [String: WorkoutHistorySessionItem] = [:]
    @State private var selectedDate = Calendar.current.startOfDay(for: Date())
    @State private var visibleMonth = Calendar.current.startOfMonth(for: Date())
    @State private var viewMode: CalendarViewMode = .grid
    @State private var detailEvent: CalendarEvent?
    @State private var errorMessage: String?

    private let apiService = APIService.shared
    private let dataRepository = AppDataRepository.shared

    init(showsSheetChrome: Bool = true) {
        self.showsSheetChrome = showsSheetChrome
    }

    var body: some View {
        ZStack {
            AppTheme.Gradients.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    HStack {
                        Text("Workouts")
                            .font(AppTheme.Typography.screenTitle)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Spacer()
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                viewMode = (viewMode == .grid) ? .list : .grid
                            }
                        } label: {
                            Image(systemName: viewMode == .grid ? "list.bullet" : "calendar")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .frame(width: 36, height: 36)
                                .background(
                                    Circle().fill(AppTheme.Colors.surface)
                                )
                        }
                        Button {
                            Task { await syncCalendar() }
                        } label: {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill(AppTheme.Colors.surface))
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.xs)

                    contentView
                }
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationTitle("Calendar")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if showsSheetChrome {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .alert("Calendar Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .sheet(item: $detailEvent) { event in
            NavigationView {
                CalendarEventDetailSheet(
                    event: event,
                    historySummary: historyByCalendarEventId[event.id],
                    onStartWorkout: {
                        WorkoutStore.shared.startPlannedSession(calendarEvent: event)
                    }
                )
            }
        }
        .task {
            await loadEvents()
            await loadCompletedHistory()
        }
    }

    @ViewBuilder
    private var contentView: some View {
        if isLoadingEvents {
            CalendarLoadingSkeleton()
                .padding(.horizontal, AppTheme.Spacing.xl)
        } else if events.isEmpty {
            Text("No sessions scheduled yet.")
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
                .padding(.horizontal, AppTheme.Spacing.xl)
        } else if viewMode == .grid {
            gridView
                .padding(.horizontal, AppTheme.Spacing.xl)
        } else {
            timelineView
                .padding(.horizontal, AppTheme.Spacing.xl)
        }
    }

    private var groupedEvents: [Date: [CalendarEvent]] {
        Dictionary(grouping: events) { Calendar.current.startOfDay(for: $0.startAt) }
    }

    private var gridView: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack {
                Button {
                    visibleMonth = Calendar.current.date(byAdding: .month, value: -1, to: visibleMonth) ?? visibleMonth
                } label: {
                    Image(systemName: "chevron.left")
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 30, height: 30)
                }
                Spacer()
                Text(monthTitle(for: visibleMonth))
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                Spacer()
                Button {
                    visibleMonth = Calendar.current.date(byAdding: .month, value: 1, to: visibleMonth) ?? visibleMonth
                } label: {
                    Image(systemName: "chevron.right")
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 30, height: 30)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 8) {
                ForEach(Calendar.current.veryShortWeekdaySymbols, id: \.self) { symbol in
                    Text(symbol.uppercased())
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .frame(maxWidth: .infinity)
                }

                ForEach(monthCells(for: visibleMonth).indices, id: \.self) { index in
                    let cellDate = monthCells(for: visibleMonth)[index]
                    MonthDayCell(
                        date: cellDate,
                        isSelected: cellDate.map { Calendar.current.isDate($0, inSameDayAs: selectedDate) } ?? false,
                        hasWorkout: cellDate.map { hasWorkout(on: $0) } ?? false,
                        onTap: {
                            guard let cellDate else { return }
                            selectedDate = Calendar.current.startOfDay(for: cellDate)
                        }
                    )
                }
            }
            .padding(.vertical, 4)
            .gesture(
                DragGesture(minimumDistance: 20)
                    .onEnded { value in
                        if value.translation.width < -50 {
                            visibleMonth = Calendar.current.date(byAdding: .month, value: 1, to: visibleMonth) ?? visibleMonth
                        } else if value.translation.width > 50 {
                            visibleMonth = Calendar.current.date(byAdding: .month, value: -1, to: visibleMonth) ?? visibleMonth
                        }
                    }
            )

            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(dayLabel(for: selectedDate))
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)

                if eventsOnSelectedDate.isEmpty {
                    Text("No workouts for this day.")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .padding(.vertical, AppTheme.Spacing.sm)
                } else {
                    ForEach(eventsOnSelectedDate) { event in
                        CalendarEventRow(event: event, onTap: { detailEvent = event })
                    }
                }
            }
        }
    }

    private var timelineView: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            if upcomingEvents.isEmpty && pastEvents.isEmpty {
                Text("No workouts in this timeline.")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            if !upcomingEvents.isEmpty {
                Text("Today + Upcoming")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                ForEach(upcomingEvents) { event in
                    CalendarEventRow(event: event, onTap: { detailEvent = event })
                }
            }

            if !pastEvents.isEmpty {
                Text("Past")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .padding(.top, AppTheme.Spacing.md)
                ForEach(pastEvents) { event in
                    CalendarEventRow(event: event, onTap: { detailEvent = event })
                }
            }
        }
    }

    private var eventsOnSelectedDate: [CalendarEvent] {
        (groupedEvents[Calendar.current.startOfDay(for: selectedDate)] ?? [])
            .sorted(by: { $0.startAt < $1.startAt })
    }

    private var upcomingEvents: [CalendarEvent] {
        let today = Calendar.current.startOfDay(for: Date())
        return events
            .filter { Calendar.current.startOfDay(for: $0.startAt) >= today }
            .sorted(by: { $0.startAt < $1.startAt })
    }

    private var pastEvents: [CalendarEvent] {
        let today = Calendar.current.startOfDay(for: Date())
        return events
            .filter { Calendar.current.startOfDay(for: $0.startAt) < today }
            .sorted(by: { $0.startAt > $1.startAt })
    }

    private func monthCells(for monthDate: Date) -> [Date?] {
        let calendar = Calendar.current
        guard
            let monthInterval = calendar.dateInterval(of: .month, for: monthDate),
            let daysRange = calendar.range(of: .day, in: .month, for: monthDate)
        else { return [] }

        let firstDay = monthInterval.start
        let firstWeekday = calendar.component(.weekday, from: firstDay)
        let leadingBlanks = (firstWeekday - calendar.firstWeekday + 7) % 7

        var cells: [Date?] = Array(repeating: nil, count: leadingBlanks)
        for day in daysRange {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: firstDay) {
                cells.append(date)
            }
        }
        return cells
    }

    private func hasWorkout(on date: Date) -> Bool {
        let day = Calendar.current.startOfDay(for: date)
        return !(groupedEvents[day] ?? []).isEmpty
    }

    private func monthTitle(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: date)
    }

    private func dayLabel(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter.string(from: date)
    }

    private func loadEvents(showSkeleton: Bool = true) async {
        if showSkeleton {
            isLoadingEvents = true
        }
        defer {
            if showSkeleton {
                isLoadingEvents = false
            }
        }
        do {
            let start = Calendar.current.date(byAdding: .month, value: -6, to: Calendar.current.startOfDay(for: Date())) ?? Date()
            let end = Calendar.current.date(byAdding: .month, value: 12, to: Calendar.current.startOfDay(for: Date())) ?? Date()
            events = try await dataRepository.loadCalendarEvents(start: start, end: end)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadCompletedHistory() async {
        do {
            historyByCalendarEventId = try await dataRepository.loadCalendarHistoryIndex()
        } catch {
            // History enrichment is best effort; keep calendar usable if this fails.
        }
    }

    private func syncCalendar() async {
        isLoadingEvents = true
        defer { isLoadingEvents = false }
        do {
            try await apiService.syncCalendar()
            await dataRepository.invalidateCalendar()
            await loadEvents(showSkeleton: false)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

}

private struct CalendarLoadingSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
                .frame(height: 24)
                .shimmer()

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
                .frame(height: 38)
                .shimmer(delay: 0.08)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 8) {
                ForEach(0..<7, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 6)
                        .fill(AppTheme.Colors.surface)
                        .frame(height: 14)
                        .shimmer(delay: 0.1)
                }
                ForEach(0..<35, id: \.self) { idx in
                    RoundedRectangle(cornerRadius: 8)
                        .fill(AppTheme.Colors.surface)
                        .frame(height: 34)
                        .shimmer(delay: Double(idx % 7) * 0.02)
                }
            }

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
                .frame(height: 20)
                .shimmer(delay: 0.15)

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
                .frame(height: 72)
                .shimmer(delay: 0.2)
        }
        .padding(.top, AppTheme.Spacing.sm)
    }
}

struct CalendarEventRow: View {
    let event: CalendarEvent
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(statusColor)
                    .frame(width: 3)
                    .frame(maxHeight: .infinity)
                VStack(alignment: .leading, spacing: 3) {
                    Text(eventTitle)
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .lineLimit(1)
                    Text(eventDetail)
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.vertical, AppTheme.Spacing.md)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .padding(.trailing, AppTheme.Spacing.md)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .fill(AppTheme.Colors.surface)
            )
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
        }
        .buttonStyle(.plain)
    }

    private var eventTitle: String {
        if let focus = plannedFocus {
            return focus
        }
        return event.title ?? "Workout"
    }

    private var eventDetail: String {
        let dateText = DateFormatter.localizedString(from: event.startAt, dateStyle: .medium, timeStyle: .none)
        let time = DateFormatter.localizedString(from: event.startAt, dateStyle: .none, timeStyle: .short)
        let status = event.status.capitalized
        return "\(dateText) at \(time) • \(status)"
    }

    private var plannedFocus: String? {
        guard let intent = event.plannedSession?.intentJson else { return nil }
        if let focus = intent["focus"]?.stringValue {
            return focus
        }
        return nil
    }

    private var statusColor: Color {
        switch event.status.lowercased() {
        case "completed":
            return .green
        case "skipped", "canceled":
            return .orange
        default:
            return AppTheme.Colors.accent
        }
    }
}

private struct MonthDayCell: View {
    let date: Date?
    let isSelected: Bool
    let hasWorkout: Bool
    let onTap: () -> Void

    private var isToday: Bool {
        guard let date else { return false }
        return Calendar.current.isDateInToday(date)
    }

    var body: some View {
        Group {
            if let date {
                Button(action: onTap) {
                    VStack(spacing: 3) {
                        Text("\(Calendar.current.component(.day, from: date))")
                            .font(.system(size: 14, weight: isSelected || isToday ? .semibold : .regular))
                            .foregroundColor(isSelected ? AppTheme.Colors.background : AppTheme.Colors.primaryText)
                            .frame(width: 32, height: 32)
                            .background(
                                ZStack {
                                    if isSelected {
                                        Circle().fill(AppTheme.Colors.primaryText)
                                    } else if isToday {
                                        Circle().strokeBorder(AppTheme.Colors.primaryText.opacity(0.5), lineWidth: 1.5)
                                    }
                                }
                            )
                        Circle()
                            .fill(hasWorkout && !isSelected ? AppTheme.Colors.secondaryText.opacity(0.4) : .clear)
                            .frame(width: 4, height: 4)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
            } else {
                Color.clear
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }
}

private struct CalendarEventDetailSheet: View {
    @Environment(\.dismiss) private var dismiss

    let event: CalendarEvent
    let historySummary: WorkoutHistorySessionItem?
    let onStartWorkout: () -> Void

    @StateObject private var apiService = APIService()
    @State private var detail: WorkoutTrackingSessionResponse?
    @State private var isLoadingDetail = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    statusBadge
                    Text(eventTitle)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Text(eventMeta)
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.top, AppTheme.Spacing.xxl)
                .padding(.bottom, AppTheme.Spacing.lg)

                Rectangle()
                    .fill(AppTheme.Colors.divider)
                    .frame(height: 1)
                    .padding(.horizontal, AppTheme.Spacing.xl)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    if isCompletedEvent {
                        completedContent
                    } else {
                        plannedContent
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .background(AppTheme.Gradients.background.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
        .alert("Session Error", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
    }

    private var statusBadge: some View {
        let color = badgeColor
        return Text(event.status.capitalized)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private var badgeColor: Color {
        switch event.status.lowercased() {
        case "completed": return .green
        case "skipped", "canceled": return .orange
        default: return AppTheme.Colors.primaryText
        }
    }

    private var plannedContent: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            intentSection("Focus", value: plannedFocus ?? "Not set")
            intentSection("Notes", value: plannedNotes ?? "No notes")
            intentSection("Duration", value: plannedDurationText ?? "Not set")
            Button("Start Workout") {
                onStartWorkout()
                dismiss()
            }
            .buttonStyle(PrimaryCapsuleButton())
            .padding(.top, AppTheme.Spacing.sm)
        }
    }

    private var completedContent: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            if let historySummary {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AppTheme.Spacing.sm) {
                    statCell("Duration", value: "\(historySummary.actualDurationMin ?? 0) min")
                    statCell("Exercises", value: "\(historySummary.completedExerciseCount)/\(historySummary.exerciseCount)")
                    statCell("Volume", value: "\(historySummary.totalVolume) lbs")
                    statCell("RPE", value: historySummary.sessionRpe.map { "\($0)/10" } ?? "—")
                }

                Button(isLoadingDetail ? "Loading..." : "View Exercise Breakdown") {
                    Task { await loadDetail() }
                }
                .buttonStyle(SecondaryCapsuleButton())
                .disabled(isLoadingDetail)
            } else {
                Text("No completed session data found.")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            if let detail {
                VStack(alignment: .leading, spacing: 0) {
                    Text("EXERCISES")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .tracking(0.5)
                        .padding(.bottom, AppTheme.Spacing.sm)
                    ForEach(detail.instance?.exercises ?? []) { exercise in
                        VStack(spacing: 0) {
                            HStack {
                                Text(exercise.exercise_name)
                                    .font(AppTheme.Typography.cardTitle)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                Spacer()
                                Text(exerciseSummary(exercise))
                                    .font(AppTheme.Typography.label)
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                            }
                            .padding(.vertical, AppTheme.Spacing.sm)
                            Rectangle()
                                .fill(AppTheme.Colors.divider)
                                .frame(height: 1)
                        }
                    }
                }
            }
        }
    }

    private func statCell(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
            Text(label)
                .font(AppTheme.Typography.label)
                .foregroundColor(AppTheme.Colors.secondaryText)
        }
        .padding(AppTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
        )
    }

    private func loadDetail() async {
        guard let historySummary else { return }
        isLoadingDetail = true
        defer { isLoadingDetail = false }
        do {
            detail = try await apiService.fetchWorkoutTrackingSession(sessionId: historySummary.sessionId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func intentSection(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .tracking(0.5)
            Text(value)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.primaryText)
        }
    }

    private var isCompletedEvent: Bool {
        ["completed", "stopped", "canceled"].contains(event.status.lowercased())
    }

    private var eventTitle: String {
        if let plannedFocus, !plannedFocus.isEmpty {
            return plannedFocus
        }
        return event.title ?? "Workout"
    }

    private var eventMeta: String {
        let dateText = DateFormatter.localizedString(from: event.startAt, dateStyle: .full, timeStyle: .short)
        return "\(dateText) • \(event.status.capitalized)"
    }

    private var plannedFocus: String? {
        event.plannedSession?.intentJson["focus"]?.stringValue
    }

    private var plannedNotes: String? {
        event.plannedSession?.intentJson["notes"]?.stringValue
    }

    private var plannedDurationText: String? {
        guard let duration = event.plannedSession?.intentJson["duration_min"]?.intValue else { return nil }
        return "\(duration) min"
    }

    private func exerciseSummary(_ exercise: UIExercise) -> String {
        switch exercise.type.lowercased() {
        case "hold":
            if let hold = exercise.hold_duration_sec?.first {
                return "\(exercise.sets ?? 1) sets • \(hold)s hold"
            }
        case "duration":
            if let duration = exercise.duration_min {
                return "\(duration) min"
            }
        case "intervals":
            if let rounds = exercise.rounds, let total = exercise.total_duration_min {
                return "\(rounds) rounds • \(total) min"
            }
        default:
            if let sets = exercise.sets, let reps = exercise.reps?.first {
                return "\(sets) sets x \(reps) reps"
            }
        }
        return "Workout block"
    }
}

private extension Calendar {
    func startOfMonth(for date: Date) -> Date {
        let components = dateComponents([.year, .month], from: date)
        return self.date(from: components) ?? date
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
