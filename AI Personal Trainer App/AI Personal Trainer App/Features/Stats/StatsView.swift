import Foundation
import SwiftUI


enum HistorySegment: String, CaseIterable, Identifiable {
    case overview = "Overview"
    case workouts = "Workouts"
    case exercises = "Exercises"

    var id: String { rawValue }
}

enum HistoryTimeRange: String, CaseIterable, Identifiable {
    case sevenDays = "7D"
    case fourWeeks = "4W"
    case threeMonths = "3M"
    case all = "All"

    var id: String { rawValue }

    func contains(_ date: Date, now: Date = Date()) -> Bool {
        let calendar = Calendar.current
        switch self {
        case .sevenDays:
            guard let start = calendar.date(byAdding: .day, value: -7, to: now) else { return true }
            return date >= start
        case .fourWeeks:
            guard let start = calendar.date(byAdding: .day, value: -28, to: now) else { return true }
            return date >= start
        case .threeMonths:
            guard let start = calendar.date(byAdding: .month, value: -3, to: now) else { return true }
            return date >= start
        case .all:
            return true
        }
    }
}

enum ExerciseSortOption: String, CaseIterable, Identifiable {
    case mostPerformed = "Most Performed"
    case highestVolume = "Highest Volume"
    case recent = "Most Recent"

    var id: String { rawValue }
}

enum ExerciseTrendDirection {
    case up
    case flat
    case down
}

struct ExerciseTrendPoint: Identifiable {
    let id = UUID()
    let date: Date
    let score: Double
    let summary: String
}

struct ExerciseHistoryAggregate: Identifiable {
    var id: String { name }
    let name: String
    var sessions: Int
    var totalVolume: Double
    var totalDurationMin: Double
    var lastPerformed: Date?
    var points: [ExerciseTrendPoint]
    var trend: ExerciseTrendDirection
}

struct HistoryOverviewMetrics {
    let workoutsCompleted: Int
    let avgDurationMin: Int
    let completionRatePercent: Int
    let volumeDeltaPercent: Int
    let rpeDelta: Double
    let insights: [String]
}

@MainActor
final class WorkoutHistoryViewModel: ObservableObject {
    @Published var selectedSegment: HistorySegment = .workouts
    @Published var selectedRange: HistoryTimeRange = .fourWeeks
    @Published var workoutSearchText = ""
    @Published var exerciseSearchText = ""
    @Published var exerciseSort: ExerciseSortOption = .mostPerformed

    @Published private(set) var workouts: [WorkoutHistorySessionItem] = []
    @Published private(set) var isInitialLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var nextCursor: String?

    @Published private(set) var workoutDetailsBySessionId: [String: WorkoutTrackingSessionResponse] = [:]
    @Published var selectedWorkoutDetail: WorkoutTrackingSessionResponse?
    @Published var selectedWorkoutItem: WorkoutHistorySessionItem?
    @Published var selectedWorkoutExerciseIndex: Int?
    @Published var selectedExerciseTrend: ExerciseHistoryAggregate?
    @Published private(set) var loadingDetailSessionId: String?
    @Published var detailErrorMessage: String?

    private let dataRepository = AppDataRepository.shared
    private var hasLoadedInitial = false

    var filteredWorkouts: [WorkoutHistorySessionItem] {
        workouts
            .filter { item in
                let date = item.completedAt ?? item.startedAt ?? .distantPast
                return selectedRange.contains(date)
            }
            .filter { item in
                guard !workoutSearchText.isEmpty else { return true }
                let query = workoutSearchText.lowercased()
                return item.title.lowercased().contains(query)
            }
    }

    var overviewMetrics: HistoryOverviewMetrics {
        let items = filteredWorkouts
        let completedCount = items.filter { $0.status == "completed" }.count
        let durationValues = items.compactMap { $0.actualDurationMin }
        let avgDuration = durationValues.isEmpty ? 0 : Int(durationValues.reduce(0, +) / durationValues.count)

        let totalExercises = items.reduce(0) { $0 + $1.exerciseCount }
        let doneExercises = items.reduce(0) { $0 + $1.completedExerciseCount }
        let completionRate = totalExercises > 0 ? Int((Double(doneExercises) / Double(totalExercises)) * 100.0) : 0

        let split = max(1, items.count / 2)
        let recent = Array(items.prefix(split))
        let prior = Array(items.dropFirst(split))

        let recentVolume = recent.reduce(0) { $0 + $1.totalVolume }
        let priorVolume = prior.reduce(0) { $0 + $1.totalVolume }
        let volumeDeltaPercent: Int = {
            guard priorVolume > 0 else { return recentVolume > 0 ? 100 : 0 }
            let delta = Double(recentVolume - priorVolume) / Double(priorVolume) * 100.0
            return Int(delta.rounded())
        }()

        let recentRpeValues = recent.compactMap { $0.sessionRpe }
        let priorRpeValues = prior.compactMap { $0.sessionRpe }
        let recentRpe = recentRpeValues.isEmpty ? 0 : Double(recentRpeValues.reduce(0, +)) / Double(recentRpeValues.count)
        let priorRpe = priorRpeValues.isEmpty ? 0 : Double(priorRpeValues.reduce(0, +)) / Double(priorRpeValues.count)
        let rpeDelta = recentRpe - priorRpe

        var insights: [String] = []
        if completedCount == 0 {
            insights.append("No completed workouts yet in this range.")
        } else {
            insights.append("Completed \(completedCount) workouts in this range.")
        }
        if volumeDeltaPercent > 5 {
            insights.append("Total volume is trending up (\(volumeDeltaPercent)% vs previous period).")
        } else if volumeDeltaPercent < -5 {
            insights.append("Total volume is trending down (\(volumeDeltaPercent)% vs previous period).")
        } else {
            insights.append("Total volume is stable versus the previous period.")
        }
        if abs(rpeDelta) >= 0.3 {
            let formatted = String(format: "%.1f", abs(rpeDelta))
            insights.append("Average session RPE is \(rpeDelta > 0 ? "higher" : "lower") by \(formatted).")
        } else {
            insights.append("Average session RPE is stable.")
        }

        return HistoryOverviewMetrics(
            workoutsCompleted: completedCount,
            avgDurationMin: avgDuration,
            completionRatePercent: completionRate,
            volumeDeltaPercent: volumeDeltaPercent,
            rpeDelta: rpeDelta,
            insights: Array(insights.prefix(3))
        )
    }

    var exerciseAggregates: [ExerciseHistoryAggregate] {
        let allowedSessionIds = Set(filteredWorkouts.map { $0.sessionId })
        var map: [String: ExerciseHistoryAggregate] = [:]

        for (sessionId, detail) in workoutDetailsBySessionId where allowedSessionIds.contains(sessionId) {
            let sessionDate = detail.session.completedAt ?? detail.session.startedAt
            for exercise in detail.instance?.exercises ?? [] {
                let key = exercise.exercise_name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !key.isEmpty else { continue }

                var agg = map[key] ?? ExerciseHistoryAggregate(
                    name: key,
                    sessions: 0,
                    totalVolume: 0,
                    totalDurationMin: 0,
                    lastPerformed: nil,
                    points: [],
                    trend: .flat
                )

                agg.sessions += 1
                if let date = sessionDate, agg.lastPerformed == nil || date > (agg.lastPerformed ?? .distantPast) {
                    agg.lastPerformed = date
                }

                let score = exerciseScore(exercise)
                let summary = exerciseSummary(exercise)
                agg.points.append(ExerciseTrendPoint(date: sessionDate ?? .distantPast, score: score, summary: summary))

                if exercise.type == "reps" || exercise.type == "hold" {
                    agg.totalVolume += score
                } else {
                    agg.totalDurationMin += score
                }

                map[key] = agg
            }
        }

        var aggregates = Array(map.values)
            .map { item in
                var next = item
                next.points.sort { $0.date > $1.date }
                next.trend = trendDirection(for: next.points)
                return next
            }
            .filter { aggregate in
                guard !exerciseSearchText.isEmpty else { return true }
                return aggregate.name.lowercased().contains(exerciseSearchText.lowercased())
            }

        switch exerciseSort {
        case .mostPerformed:
            aggregates.sort { $0.sessions > $1.sessions }
        case .highestVolume:
            aggregates.sort { $0.totalVolume > $1.totalVolume }
        case .recent:
            aggregates.sort { ($0.lastPerformed ?? .distantPast) > ($1.lastPerformed ?? .distantPast) }
        }

        return aggregates
    }

    func loadInitialIfNeeded() async {
        guard !hasLoadedInitial else { return }
        await refresh(forceRefresh: false)
        hasLoadedInitial = true
    }

    func refresh(forceRefresh: Bool = true) async {
        isInitialLoading = true
        errorMessage = nil
        do {
            let response = try await dataRepository.loadWorkoutHistoryPage(limit: 20, cursor: nil, forceRefresh: forceRefresh)
            workouts = response.items
            nextCursor = response.nextCursor
            await primeExerciseDetails(for: Array(response.items.prefix(8)))
        } catch {
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
        isInitialLoading = false
    }

    func loadMoreIfNeeded(currentItem: WorkoutHistorySessionItem) async {
        guard let nextCursor else { return }
        guard !isLoadingMore else { return }
        guard currentItem.id == filteredWorkouts.last?.id else { return }

        isLoadingMore = true
        do {
            let response = try await dataRepository.loadWorkoutHistoryPage(limit: 20, cursor: nextCursor)
            workouts.append(contentsOf: response.items)
            self.nextCursor = response.nextCursor
            await primeExerciseDetails(for: Array(response.items.prefix(5)))
        } catch {
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
        isLoadingMore = false
    }

    func openWorkout(_ item: WorkoutHistorySessionItem) async {
        detailErrorMessage = nil
        selectedWorkoutItem = item

        if let cached = workoutDetailsBySessionId[item.sessionId] {
            selectedWorkoutDetail = cached
            selectedWorkoutExerciseIndex = nil
            selectedExerciseTrend = nil
            return
        }

        loadingDetailSessionId = item.sessionId
        do {
            let detail = try await dataRepository.loadWorkoutSessionDetail(sessionId: item.sessionId)
            workoutDetailsBySessionId[item.sessionId] = detail
            selectedWorkoutDetail = detail
            selectedWorkoutExerciseIndex = nil
            selectedExerciseTrend = nil
        } catch {
            detailErrorMessage = error.localizedDescription
        }
        loadingDetailSessionId = nil
    }

    func openExerciseDetail(index: Int) {
        selectedWorkoutExerciseIndex = index
    }

    func openExerciseTrend(_ aggregate: ExerciseHistoryAggregate) {
        selectedExerciseTrend = aggregate
        selectedWorkoutDetail = nil
        selectedWorkoutExerciseIndex = nil
    }

    func backFromExerciseDetail() {
        selectedWorkoutExerciseIndex = nil
    }

    func backFromWorkoutDetail() {
        selectedWorkoutDetail = nil
        selectedWorkoutItem = nil
        selectedWorkoutExerciseIndex = nil
    }

    func backFromExerciseTrend() {
        selectedExerciseTrend = nil
    }

    private func primeExerciseDetails(for items: [WorkoutHistorySessionItem]) async {
        for item in items where workoutDetailsBySessionId[item.sessionId] == nil {
            do {
                let detail = try await dataRepository.loadWorkoutSessionDetail(sessionId: item.sessionId)
                workoutDetailsBySessionId[item.sessionId] = detail
            } catch {
                continue
            }
        }
    }

    private func exerciseScore(_ exercise: UIExercise) -> Double {
        switch exercise.type {
        case "reps":
            let reps = exercise.reps ?? []
            let loads = exercise.load_each ?? []
            var volume = 0.0
            for idx in 0..<max(reps.count, loads.count) {
                let r = idx < reps.count ? Double(reps[idx]) : 0
                let l = idx < loads.count ? loads[idx] : (loads.first ?? 0)
                volume += r * max(0, l)
            }
            return volume
        case "hold":
            return Double((exercise.hold_duration_sec ?? []).reduce(0, +)) / 60.0
        case "duration":
            return Double(exercise.duration_min ?? 0)
        case "intervals":
            guard let rounds = exercise.rounds, let workSec = exercise.work_sec else {
                return Double(exercise.total_duration_min ?? 0)
            }
            return Double(rounds * workSec) / 60.0
        default:
            return 0
        }
    }

    private func exerciseSummary(_ exercise: UIExercise) -> String {
        switch exercise.type {
        case "reps":
            let repsText = (exercise.reps ?? []).map(String.init).joined(separator: "/")
            let unit = exercise.load_unit ?? "lb"
            let topLoad = Int((exercise.load_each ?? []).max() ?? 0)
            return repsText.isEmpty ? "Strength sets" : "\(repsText) @ \(topLoad) \(unit)"
        case "hold":
            let secs = (exercise.hold_duration_sec ?? []).reduce(0, +)
            return "Hold \(secs)s total"
        case "duration":
            let duration = exercise.duration_min ?? 0
            return "\(duration) min"
        case "intervals":
            let rounds = exercise.rounds ?? 0
            let work = exercise.work_sec ?? 0
            return "\(rounds) rounds x \(work)s"
        default:
            return "Session entry"
        }
    }

    private func trendDirection(for points: [ExerciseTrendPoint]) -> ExerciseTrendDirection {
        guard points.count >= 2 else { return .flat }
        let split = max(1, points.count / 2)
        let recent = points.prefix(split).map(\.score)
        let prior = points.dropFirst(split).map(\.score)

        let recentAvg = recent.isEmpty ? 0 : recent.reduce(0, +) / Double(recent.count)
        let priorAvg = prior.isEmpty ? 0 : prior.reduce(0, +) / Double(prior.count)
        if priorAvg == 0 {
            return recentAvg > 0 ? .up : .flat
        }
        let delta = (recentAvg - priorAvg) / priorAvg
        if delta > 0.05 { return .up }
        if delta < -0.05 { return .down }
        return .flat
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }
        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
    }
}

struct StatsView: View {
    var body: some View {
        StatsContentView()
    }
}

struct StatsContentView: View {
    @StateObject private var viewModel = WorkoutHistoryViewModel()

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            if let aggregate = viewModel.selectedExerciseTrend {
                ExerciseTrendDetailView(
                    aggregate: aggregate,
                    onBack: { viewModel.backFromExerciseTrend() }
                )
            } else if let detail = viewModel.selectedWorkoutDetail, let item = viewModel.selectedWorkoutItem {
                if let index = viewModel.selectedWorkoutExerciseIndex {
                    WorkoutExerciseDetailView(
                        detail: detail,
                        exerciseIndex: index,
                        onBack: { viewModel.backFromExerciseDetail() }
                    )
                } else {
                    WorkoutHistoryDetailView(
                        item: item,
                        detail: detail,
                        isLoading: viewModel.loadingDetailSessionId == item.sessionId,
                        onBack: { viewModel.backFromWorkoutDetail() },
                        onOpenExercise: { index in viewModel.openExerciseDetail(index: index) }
                    )
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if !viewModel.isInitialLoading && viewModel.errorMessage == nil && viewModel.overviewMetrics.workoutsCompleted > 0 {
                            AIMessageView(historyAISummary)
                                .padding(.horizontal, AppTheme.Spacing.xl)
                                .padding(.top, AppTheme.Spacing.xs)
                                .padding(.bottom, AppTheme.Spacing.xxl)
                        }

                        Group {
                            if viewModel.isInitialLoading {
                                HistoryLoadingStateView()
                            } else if let message = viewModel.errorMessage {
                                HistoryErrorStateView(message: message) {
                                    Task { await viewModel.refresh() }
                                }
                            } else if viewModel.filteredWorkouts.isEmpty {
                                HistoryEmptyStateView(
                                    icon: "calendar.badge.clock",
                                    title: "No workouts yet",
                                    subtitle: "Complete your first workout to see history."
                                )
                            } else {
                                LazyVStack(spacing: AppTheme.Spacing.sm) {
                                    ForEach(viewModel.filteredWorkouts) { item in
                                        Button {
                                            Task { await viewModel.openWorkout(item) }
                                        } label: {
                                            WorkoutSessionCard(item: item)
                                        }
                                        .buttonStyle(.plain)
                                        .task {
                                            await viewModel.loadMoreIfNeeded(currentItem: item)
                                        }
                                    }
                                    if viewModel.isLoadingMore {
                                        ProgressView()
                                            .frame(maxWidth: .infinity, alignment: .center)
                                            .padding(.top, AppTheme.Spacing.sm)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.xl)
                    }
                    .padding(.bottom, AppTheme.Spacing.xxxl)
                }
                .refreshable {
                    await viewModel.refresh()
                }
            }
        }
        .task {
            await viewModel.loadInitialIfNeeded()
        }
        .alert("History Error", isPresented: Binding(
            get: { viewModel.detailErrorMessage != nil },
            set: { _ in viewModel.detailErrorMessage = nil }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.detailErrorMessage ?? "Something went wrong.")
        }
    }

    private var historyAISummary: String {
        let metrics = viewModel.overviewMetrics
        let count = metrics.workoutsCompleted
        let avg = metrics.avgDurationMin
        let delta = metrics.volumeDeltaPercent

        var text = "You've completed **\(count) workout\(count == 1 ? "" : "s")** recently, averaging **\(avg) min** per session."
        if abs(delta) > 5 {
            let direction = delta > 0 ? "↑" : "↓"
            text += " Your volume is **\(direction) \(abs(delta))%** from the previous period."
        } else {
            text += " Your consistency is **stable** from last period."
        }
        return text
    }
}

private struct HistoryOverviewSegmentView: View {
    @ObservedObject var viewModel: WorkoutHistoryViewModel

    var body: some View {
        let metrics = viewModel.overviewMetrics
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            HStack(spacing: AppTheme.Spacing.sm) {
                KPIChip(title: "Workouts", value: "\(metrics.workoutsCompleted)")
                KPIChip(title: "Avg Duration", value: "\(metrics.avgDurationMin)m")
                KPIChip(title: "Completion", value: "\(metrics.completionRatePercent)%")
            }

            HStack(spacing: AppTheme.Spacing.sm) {
                TrendCard(
                    title: "Volume",
                    value: metrics.volumeDeltaPercent == 0 ? "Stable" : "\(metrics.volumeDeltaPercent > 0 ? "+" : "")\(metrics.volumeDeltaPercent)%",
                    subtitle: "vs previous period"
                )
                TrendCard(
                    title: "Avg RPE",
                    value: String(format: "%@%.1f", metrics.rpeDelta > 0 ? "+" : "", metrics.rpeDelta),
                    subtitle: "vs previous period"
                )
            }

            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                Text("Insights".uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .tracking(0.4)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    ForEach(metrics.insights, id: \.self) { insight in
                        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                            Image(systemName: "circle.fill")
                                .font(.system(size: 4))
                                .foregroundColor(AppTheme.Colors.tertiaryText)
                                .padding(.top, 5)
                            Text(insight)
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .padding(AppTheme.Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                    .fill(AppTheme.Colors.surface)
            )
        }
    }
}

private struct HistoryWorkoutsSegmentView: View {
    @ObservedObject var viewModel: WorkoutHistoryViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            SearchField(
                text: $viewModel.workoutSearchText,
                placeholder: "Search workouts..."
            )

            if viewModel.filteredWorkouts.isEmpty {
                HistoryEmptyStateView(
                    icon: "calendar.badge.clock",
                    title: "No workouts in this range",
                    subtitle: "Complete a workout to populate your history."
                )
            } else {
                LazyVStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(viewModel.filteredWorkouts) { item in
                        Button {
                            Task { await viewModel.openWorkout(item) }
                        } label: {
                            WorkoutSessionCard(item: item)
                        }
                        .buttonStyle(.plain)
                        .task {
                            await viewModel.loadMoreIfNeeded(currentItem: item)
                        }
                    }

                    if viewModel.isLoadingMore {
                        ProgressView("Loading more...")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, AppTheme.Spacing.sm)
                    }
                }
            }
        }
    }
}

private struct HistoryExercisesSegmentView: View {
    @ObservedObject var viewModel: WorkoutHistoryViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            SearchField(
                text: $viewModel.exerciseSearchText,
                placeholder: "Search exercises..."
            )

            Menu {
                ForEach(ExerciseSortOption.allCases) { option in
                    Button(option.rawValue) {
                        viewModel.exerciseSort = option
                    }
                }
            } label: {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Text("Sort: \(viewModel.exerciseSort.rawValue)")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                        .fill(AppTheme.Colors.surface)
                )
            }

            if viewModel.exerciseAggregates.isEmpty {
                HistoryEmptyStateView(
                    icon: "figure.strengthtraining.traditional",
                    title: "No exercise analytics yet",
                    subtitle: "Open workouts are still loading or there is no data in this range."
                )
            } else {
                LazyVStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(viewModel.exerciseAggregates) { aggregate in
                        Button {
                            viewModel.openExerciseTrend(aggregate)
                        } label: {
                            ExerciseAggregateCard(aggregate: aggregate)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct WorkoutSessionCard: View {
    let item: WorkoutHistorySessionItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(relativeDateLabel.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .tracking(0.4)
                Spacer()
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .opacity(item.status == "completed" ? 1 : 0)
            }

            Text(item.title)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .lineLimit(2)

            Text(metaText)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
                .lineLimit(1)
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }

    private var relativeDateLabel: String {
        guard let date = item.startedAt ?? item.completedAt else { return "Unknown date" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: date)
    }

    private var metaText: String {
        let duration = item.actualDurationMin ?? item.plannedDurationMin ?? 0
        let exercises = item.exerciseCount
        if exercises > 0 {
            return "\(duration) min · \(exercises) exercise\(exercises == 1 ? "" : "s")"
        }
        return "\(duration) min"
    }
}

private struct WorkoutHistoryDetailView: View {
    let item: WorkoutHistorySessionItem
    let detail: WorkoutTrackingSessionResponse
    let isLoading: Bool
    let onBack: () -> Void
    let onOpenExercise: (Int) -> Void

    private var trackingRows: [WorkoutTrackingExercise] {
        detail.exercises.sorted { $0.exerciseOrder < $1.exerciseOrder }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                backHeader(title: item.title, onBack: onBack)
                detailDate
                summaryRow

                if isLoading {
                    ProgressView("Loading workout details...")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("EXERCISES")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .tracking(0.4)

                    ForEach(Array((detail.instance?.exercises ?? []).enumerated()), id: \.offset) { index, exercise in
                        Button {
                            onOpenExercise(index)
                        } label: {
                            HStack(alignment: .center, spacing: AppTheme.Spacing.md) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(exercise.exercise_name)
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(AppTheme.Colors.primaryText)

                                    Text(exercisePreview(exercise))
                                        .font(AppTheme.Typography.cardSubtitle)
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                            }
                            .padding(AppTheme.Spacing.lg)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                                    .fill(AppTheme.Colors.surface)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xxxl)
        }
    }

    private var detailDate: some View {
        Text(formattedDate(item.completedAt ?? item.startedAt).uppercased())
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(AppTheme.Colors.tertiaryText)
            .tracking(0.4)
    }

    private var summaryRow: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            KPIChip(title: "Duration", value: "\(item.actualDurationMin ?? item.plannedDurationMin ?? 0)m")
            KPIChip(title: "Exercises", value: "\(item.exerciseCount)")
            KPIChip(title: "Volume", value: "\(item.totalVolume.formatted())")
        }
    }

    private func formattedDate(_ date: Date?) -> String {
        guard let date else { return "Unknown date" }
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func statusLabel(at index: Int) -> String {
        guard index < trackingRows.count else { return "Pending" }
        return trackingRows[index].status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func exercisePreview(_ exercise: UIExercise) -> String {
        switch exercise.type {
        case "reps":
            let sets = exercise.sets ?? exercise.reps?.count ?? 0
            let reps = (exercise.reps ?? []).map(String.init).joined(separator: ", ")
            if reps.isEmpty { return "\(sets) sets" }
            return "\(sets) sets · \(reps) reps"
        case "hold":
            let values = (exercise.hold_duration_sec ?? []).map { "\($0)s" }.joined(separator: ", ")
            return values.isEmpty ? "Hold intervals" : values
        case "duration":
            let min = exercise.duration_min ?? 0
            return "\(min) min"
        case "intervals":
            let rounds = exercise.rounds ?? 0
            let work = exercise.work_sec ?? 0
            return "\(rounds) rounds · \(work)s work"
        default:
            return "Exercise"
        }
    }
}

private struct WorkoutExerciseDetailView: View {
    let detail: WorkoutTrackingSessionResponse
    let exerciseIndex: Int
    let onBack: () -> Void

    private var exercise: UIExercise? {
        guard let exercises = detail.instance?.exercises, exerciseIndex >= 0, exerciseIndex < exercises.count else {
            return nil
        }
        return exercises[exerciseIndex]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                backHeader(title: exercise?.exercise_name ?? "Exercise", onBack: onBack)

                if let exercise {
                    setsSection(for: exercise)
                    chipSection(title: "Muscles Targeted", values: exercise.muscles_utilized?.map(\.muscle) ?? [])
                    chipSection(title: "Goals Addressed", values: exercise.goals_addressed?.map(\.goal) ?? [])
                    textSection(title: "Why This Exercise", body: exercise.reasoning ?? "No reasoning recorded.")
                } else {
                    HistoryEmptyStateView(
                        icon: "exclamationmark.triangle",
                        title: "Exercise unavailable",
                        subtitle: "This exercise could not be loaded."
                    )
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xxxl)
        }
    }

    @ViewBuilder
    private func setsSection(for exercise: UIExercise) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("SETS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .tracking(0.4)

            VStack(spacing: AppTheme.Spacing.sm) {
                ForEach(Array(setRows(for: exercise).enumerated()), id: \.offset) { index, line in
                    HStack(spacing: AppTheme.Spacing.md) {
                        ZStack {
                            Circle()
                                .fill(AppTheme.Colors.highlight)
                                .frame(width: 30, height: 30)
                            Text("\(index + 1)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                        Text(line)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Spacer()
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                            .fill(AppTheme.Colors.surface)
                    )
                }
            }
        }
    }

    private func setRows(for exercise: UIExercise) -> [String] {
        switch exercise.type {
        case "reps":
            let reps = exercise.reps ?? []
            let loads = exercise.load_each ?? []
            let unit = exercise.load_unit ?? "lb"
            let count = max(reps.count, exercise.sets ?? 0)
            return (0..<max(1, count)).map { index in
                let rep = index < reps.count ? reps[index] : 0
                let load = index < loads.count ? loads[index] : (loads.first ?? 0)
                if load > 0 {
                    return "\(rep) reps • \(Int(load)) \(unit)"
                }
                return "\(rep) reps"
            }
        case "hold":
            let values = exercise.hold_duration_sec ?? []
            return values.isEmpty ? ["Hold duration not provided"] : values.map { "\($0) sec hold" }
        case "duration":
            let duration = exercise.duration_min ?? 0
            let distance = exercise.distance_km.map { String(format: " • %.1f km", $0) } ?? ""
            return ["\(duration) min\(distance)"]
        case "intervals":
            let rounds = exercise.rounds ?? 0
            let work = exercise.work_sec ?? 0
            return ["\(rounds) rounds • \(work)s work"]
        default:
            return ["No set data"]
        }
    }

    @ViewBuilder
    private func chipSection(title: String, values: [String]) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .tracking(0.4)

            if values.isEmpty {
                Text("No data")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            } else {
                OutlineChipWrap(values: values)
            }
        }
    }

    @ViewBuilder
    private func textSection(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Circle()
                    .fill(AppTheme.Gradients.orb)
                    .frame(width: 20, height: 20)
                    .shadow(color: AppTheme.Shadow.orb, radius: 4)
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .tracking(0.4)
            }
            Text(body)
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundColor(AppTheme.Colors.primaryText)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct ExerciseTrendDetailView: View {
    let aggregate: ExerciseHistoryAggregate
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                backHeader(title: aggregate.name, onBack: onBack)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Summary")
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("Sessions: \(aggregate.sessions)")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)

                    if aggregate.totalVolume > 0 {
                        Text("Total volume: \(Int(aggregate.totalVolume).formatted())")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }

                    if aggregate.totalDurationMin > 0 {
                        Text("Total duration: \(Int(aggregate.totalDurationMin)) min")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }

                    Text("Trend: \(trendLabel(aggregate.trend))")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .padding(AppTheme.Spacing.lg)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                        .fill(AppTheme.Colors.surface)
                )

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Recent Sessions")
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)

                    ForEach(aggregate.points.prefix(8)) { point in
                        HStack {
                            Text(formatDate(point.date))
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                            Spacer()
                            Text(point.summary)
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, AppTheme.Spacing.md)
                        .padding(.vertical, AppTheme.Spacing.sm)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                .fill(AppTheme.Colors.surface)
                        )
                    }
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xxxl)
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }

    private func trendLabel(_ trend: ExerciseTrendDirection) -> String {
        switch trend {
        case .up: return "Up"
        case .flat: return "Flat"
        case .down: return "Down"
        }
    }
}

private struct KPIChip: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(AppTheme.Typography.statNumber)
                .foregroundColor(AppTheme.Colors.primaryText)
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .tracking(0.4)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct TrendCard: View {
    let title: String
    let value: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .tracking(0.4)
            Text(value)
                .font(AppTheme.Typography.statNumber)
                .foregroundColor(AppTheme.Colors.primaryText)
            Text(subtitle)
                .font(.system(size: 11, weight: .regular))
                .foregroundColor(AppTheme.Colors.tertiaryText)
        }
        .padding(AppTheme.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct ExerciseAggregateCard: View {
    let aggregate: ExerciseHistoryAggregate

    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text(aggregate.name)
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                Text("Sessions: \(aggregate.sessions)")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)

                if aggregate.totalVolume > 0 {
                    Text("Total volume: \(Int(aggregate.totalVolume).formatted())")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                } else {
                    Text("Total duration: \(Int(aggregate.totalDurationMin)) min")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }

                HStack(spacing: 4) {
                    Image(systemName: trendIcon)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    Text(trendLabel)
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .padding(.top, 4)
        }
        .padding(AppTheme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }

    private var trendLabel: String {
        switch aggregate.trend {
        case .up: return "Up"
        case .flat: return "Flat"
        case .down: return "Down"
        }
    }

    private var trendIcon: String {
        switch aggregate.trend {
        case .up: return "arrow.up"
        case .flat: return "arrow.right"
        case .down: return "arrow.down"
        }
    }
}

private struct SearchField: View {
    @Binding var text: String
    let placeholder: String

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.Colors.tertiaryText)
            TextField(placeholder, text: $text)
                .font(AppTheme.Typography.input)
                .foregroundColor(AppTheme.Colors.primaryText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct HistoryLoadingStateView: View {
    var body: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                    .fill(AppTheme.Colors.surface)
                    .frame(height: 88)
                    .shimmer()
            }
        }
    }
}

private struct HistoryErrorStateView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "exclamationmark.circle")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Text("Couldn’t load history")
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
            Text(message)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
            Button("Retry", action: onRetry)
                .font(AppTheme.Typography.button)
                .foregroundColor(AppTheme.Colors.background)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .fill(AppTheme.Colors.primaryText)
                )
                .buttonStyle(.plain)
        }
        .padding(AppTheme.Spacing.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct HistoryEmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 32, weight: .light))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .padding(.bottom, 2)
            Text(title)
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
            Text(subtitle)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, AppTheme.Spacing.xxxl)
        .padding(.vertical, 40)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct FlexibleChipWrap: View {
    let values: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            ForEach(chunked(values, chunkSize: 3), id: \.self) { row in
                HStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(row, id: \.self) { value in
                        Text(value)
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.primaryText)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                    .fill(AppTheme.Colors.highlight)
                            )
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private func chunked(_ values: [String], chunkSize: Int) -> [[String]] {
        guard chunkSize > 0 else { return [] }
        var result: [[String]] = []
        var index = 0
        while index < values.count {
            result.append(Array(values[index..<min(index + chunkSize, values.count)]))
            index += chunkSize
        }
        return result
    }
}

private struct OutlineChipWrap: View {
    let values: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            ForEach(chunked(values, chunkSize: 3), id: \.self) { row in
                HStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(row, id: \.self) { value in
                        Text(value)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundColor(AppTheme.Colors.primaryText)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .strokeBorder(AppTheme.Colors.primaryText.opacity(0.18), lineWidth: 1)
                            )
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private func chunked(_ values: [String], chunkSize: Int) -> [[String]] {
        guard chunkSize > 0 else { return [] }
        var result: [[String]] = []
        var index = 0
        while index < values.count {
            result.append(Array(values[index..<min(index + chunkSize, values.count)]))
            index += chunkSize
        }
        return result
    }
}

private func backHeader(title: String, onBack: @escaping () -> Void) -> some View {
    HStack(spacing: AppTheme.Spacing.md) {
        Button(action: onBack) {
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .fill(AppTheme.Colors.surface)
                )
        }
        .buttonStyle(.plain)

        Text(title)
            .font(AppTheme.Typography.screenTitle)
            .foregroundColor(AppTheme.Colors.primaryText)
            .lineLimit(2)

        Spacer()
    }
}

#Preview {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()
        StatsContentView()
    }
}
