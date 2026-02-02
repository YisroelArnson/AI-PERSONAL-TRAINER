//
//  HomeView.swift
//  AI Personal Trainer App
//
//  Home screen with text-first AI trainer greeting.
//  Features AI message with inline stat highlights and bottom workout pill.
//

import SwiftUI

struct HomeView: View {
    @EnvironmentObject var appCoordinator: AppStateCoordinator

    @StateObject private var apiService = APIService()
    @StateObject private var exerciseStore = ExerciseStore.shared
    @StateObject private var workoutSessionStore = WorkoutSessionStore.shared

    // Sheet states
    @State private var showQuickWorkoutSheet = false
    @State private var showReadinessSheet = false
    @State private var showReflectionSheet = false
    @State private var showSummarySheet = false
    @State private var showScheduleSheet = false
    @State private var showRunComingSoon = false

    // Data states
    @State private var upcomingEvents: [CalendarEvent] = []
    @State private var latestReport: WeeklyReport?
    @State private var userStats: HomeUserStats?
    @State private var selectedCoachMode: String = "quiet"

    // AI message state
    @State private var aiMessage: String = "Welcome back! Let's make today count."
    @State private var isLoadingAIMessage: Bool = true

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                AppTheme.Colors.background
                    .ignoresSafeArea()

                // Main content
                VStack(spacing: 0) {
                    // Spacer to push content below ThinTopBar
                    Spacer()
                        .frame(height: 60)

                    // AI Message Area (Flex: 1)
                    aiMessageArea
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                    Spacer()

                    // Bottom Action Bar
                    bottomActionBar
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                        .padding(.top, 16)
                }

            }
        }
        .sheet(isPresented: $showQuickWorkoutSheet) {
            QuickWorkoutSheet { input in
                Task {
                    await workoutSessionStore.startSession(
                        intent: "quick_request",
                        requestText: input.requestText,
                        timeAvailableMin: input.timeAvailableMin,
                        readiness: input.readiness,
                        equipment: input.equipmentOverride,
                        coachMode: selectedCoachMode
                    )
                }
            }
        }
        .sheet(isPresented: $showReadinessSheet) {
            ReadinessCheckSheet { input in
                Task {
                    await workoutSessionStore.startSession(
                        intent: "planned",
                        requestText: nil,
                        timeAvailableMin: input.timeAvailableMin,
                        readiness: input.readiness,
                        equipment: input.equipmentOverride,
                        coachMode: selectedCoachMode
                    )
                }
            }
        }
        .sheet(isPresented: $showReflectionSheet) {
            WorkoutReflectionSheet { reflection in
                Task {
                    let exercises = exerciseStore.exercises
                    let completedSetsPerExercise = exerciseStore.completedSetsPerExercise
                    let log = WorkoutLogPayload(
                        exercisesCompleted: exercises.count,
                        setsCompleted: completedSetsPerExercise.values.reduce(0) { $0 + $1.count },
                        totalDurationMin: nil
                    )
                    await workoutSessionStore.completeSession(reflection: reflection, logPayload: log)
                    showSummarySheet = workoutSessionStore.summary != nil
                }
            }
        }
        .sheet(isPresented: $showSummarySheet) {
            if let summary = workoutSessionStore.summary {
                WorkoutSummarySheet(summary: summary)
            }
        }
        .alert("Something went wrong", isPresented: Binding(
            get: { workoutSessionStore.errorMessage != nil },
            set: { _ in workoutSessionStore.errorMessage = nil }
        )) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(workoutSessionStore.errorMessage ?? "Please try again.")
        }
        .onReceive(NotificationCenter.default.publisher(for: .showQuickWorkoutSheet)) { _ in
            showQuickWorkoutSheet = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .showScheduleWorkoutSheet)) { _ in
            showScheduleSheet = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .showStartRunSheet)) { _ in
            showRunComingSoon = true
        }
        .alert("Coming Soon", isPresented: $showRunComingSoon) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Running features are coming soon!")
        }
        .task {
            await loadHomeData()
        }
        .onChange(of: appCoordinator.shouldFetchRecommendations) { _, shouldFetch in
            if shouldFetch {
                Task {
                    workoutSessionStore.restoreSessionIfNeeded()
                    if !exerciseStore.exercises.isEmpty {
                        appCoordinator.markAsReady()
                    }
                }
            }
        }
        .onChange(of: exerciseStore.allExercisesCompleted) { _, isAllCompleted in
            if isAllCompleted && !exerciseStore.exercises.isEmpty {
                showReflectionSheet = true
            }
        }
        .onChange(of: workoutSessionStore.workoutInstance) { _, instance in
            if instance != nil {
                appCoordinator.markAsReady()
            }
        }
        .onChange(of: exerciseStore.needsRefresh) { _, needsRefresh in
            if needsRefresh {
                showReadinessSheet = true
            }
        }
    }

    // MARK: - AI Message Area

    private var aiMessageArea: some View {
        VStack(alignment: .leading, spacing: 0) {
            if isLoadingAIMessage {
                AIMessageSkeleton()
                    .transition(.opacity)
            } else {
                AIMessageView(aiMessage)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(AppTheme.Animation.slow, value: isLoadingAIMessage)
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            // Workout Pill (takes most space)
            WorkoutPill(
                workoutName: currentScheduledWorkout?.name ?? "Upper Body Workout",
                duration: currentScheduledWorkout?.duration ?? 45,
                onTap: {
                    showReadinessSheet = true
                }
            )

            // Space for AI Orb (handled by AssistantOverlayView)
            Color.clear
                .frame(width: 50, height: 50)
        }
    }

    // MARK: - Computed Properties

    private var currentScheduledWorkout: (name: String, duration: Int)? {
        // Check for today's scheduled workout from calendar events
        let today = Calendar.current.startOfDay(for: Date())
        if let todayEvent = upcomingEvents.first(where: { Calendar.current.isDate($0.startAt, inSameDayAs: today) }) {
            let name = todayEvent.plannedSession?.intentJson["focus"]?.stringValue ?? todayEvent.title ?? "Today's Workout"
            let duration = todayEvent.plannedSession?.intentJson["duration_min"]?.intValue ?? 45
            return (name: name, duration: duration)
        }
        return nil
    }

    private var todayIntentLine: String? {
        let today = Calendar.current.startOfDay(for: Date())
        let todayEvent = upcomingEvents.first { Calendar.current.isDate($0.startAt, inSameDayAs: today) }
        if let focus = todayEvent?.plannedSession?.intentJson["focus"]?.stringValue {
            return focus
        }
        if let title = todayEvent?.title {
            return title
        }
        return nil
    }

    private var estimatedRemainingTime: Int {
        // Estimate remaining time based on exercises left
        let totalExercises = exerciseStore.exercises.count
        let completedCount = exerciseStore.completedExerciseIds.count
        let remaining = max(0, totalExercises - completedCount)
        return remaining * 5 // Rough estimate: 5 min per exercise
    }

    // MARK: - Data Loading

    private func loadHomeData() async {
        // Load calendar events and reports
        do {
            let start = Calendar.current.startOfDay(for: Date())
            let end = Calendar.current.date(byAdding: .day, value: 7, to: start) ?? start
            upcomingEvents = try await apiService.listCalendarEvents(start: start, end: end)
            latestReport = try await apiService.listWeeklyReports().first
        } catch {
            print("Failed to load home data: \(error)")
        }

        // Build AI message based on loaded data
        buildAIMessage()

        // Minimum display time for skeleton (prevents flash on fast loads)
        try? await Task.sleep(nanoseconds: 400_000_000)

        // Animate transition to loaded content
        withAnimation(AppTheme.Animation.slow) {
            isLoadingAIMessage = false
        }

        // Restore session if needed
        workoutSessionStore.restoreSessionIfNeeded()
        if !exerciseStore.exercises.isEmpty {
            appCoordinator.markAsReady()
        }
    }

    private func buildAIMessage() {
        var messageParts: [String] = []

        // Weekly progress (real data when available, fallback to mock)
        let workoutCount = latestReport?.sessionsCompleted ?? 3
        messageParts.append("You've completed **\(workoutCount) workouts** this week.")

        // Strength improvement (mock data for now - will be replaced with API data)
        messageParts.append("Your push strength is up **12%** from last month.")

        // Streak days (mock data for now - will be replaced with API data)
        messageParts.append("Day **12** of your streak.")

        // Motivational closer
        messageParts.append("Let's keep building.")

        aiMessage = messageParts.joined(separator: " ")
    }
}

// MARK: - Supporting Types

struct HomeUserStats {
    let weeklyWorkouts: Int
    let strengthChange: Int? // percentage
    let streakDays: Int
}

// MARK: - Preview

#Preview {
    HomeView()
        .environmentObject(AppStateCoordinator())
}
