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
    @State private var workoutStore = WorkoutStore.shared

    // Sheet states
    @State private var showScheduleSheet = false
    @State private var showRunComingSoon = false
    @State private var showDiscardConfirm = false
    @State private var pendingStartNewWorkoutFromPlus = false
    @State private var isWorkoutPresented = false

    // Data states
    @State private var upcomingEvents: [CalendarEvent] = []
    @State private var latestReport: WeeklyReport?
    @State private var userStats: HomeUserStats?

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
        .sheet(isPresented: $workoutStore.showPreWorkoutSheet) {
            PreWorkoutSheet()
                .presentationDetents([.large])
        }
        .fullScreenCover(isPresented: $isWorkoutPresented) {
            WorkoutFlowView()
        }
        .onChange(of: workoutStore.isWorkoutViewPresented) { _, newValue in
            isWorkoutPresented = newValue
        }
        .onChange(of: workoutStore.showPreWorkoutSheet) { _, isPresented in
            if !isPresented && workoutStore.sessionStatus == .preWorkout {
                workoutStore.reset()
            }
        }
        .onChange(of: isWorkoutPresented) { _, newValue in
            if !newValue && workoutStore.isWorkoutViewPresented {
                Task {
                    await workoutStore.suspendWorkout()
                }
            }
        }
        .alert("Something went wrong", isPresented: Binding(
            get: { workoutStore.errorMessage != nil },
            set: { _ in workoutStore.errorMessage = nil }
        )) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(workoutStore.errorMessage ?? "Please try again.")
        }
        .onReceive(NotificationCenter.default.publisher(for: .showQuickWorkoutSheet)) { _ in
            if workoutStore.hasActivePersistedWorkout {
                pendingStartNewWorkoutFromPlus = true
                showDiscardConfirm = true
            } else {
                workoutStore.startNewWorkout()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .showScheduleWorkoutSheet)) { _ in
            showScheduleSheet = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .showStartRunSheet)) { _ in
            showRunComingSoon = true
        }
        .alert("Coming Soon", isPresented: $showScheduleSheet) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Workout scheduling features are coming soon!")
        }
        .alert("Coming Soon", isPresented: $showRunComingSoon) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Running features are coming soon!")
        }
        .alert("Discard Workout?", isPresented: $showDiscardConfirm) {
            Button("Discard", role: .destructive) {
                workoutStore.reset()
                if pendingStartNewWorkoutFromPlus {
                    pendingStartNewWorkoutFromPlus = false
                    workoutStore.startNewWorkout()
                }
            }
            Button("Cancel", role: .cancel) {
                pendingStartNewWorkoutFromPlus = false
            }
        } message: {
            Text("This will discard your current workout. You can't undo this.")
        }
        .task {
            await loadHomeData()
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
            if workoutStore.hasActivePersistedWorkout {
                // Resume pill
                ResumePill(
                    completedCount: workoutStore.totalCompletedExercises,
                    totalCount: workoutStore.totalExercises,
                    onTap: {
                        workoutStore.resumeWorkout()
                    }
                )
            } else {
                if let event = todaysEvent {
                    WorkoutPill(
                        title: workoutButtonTitle,
                        onTap: {
                            workoutStore.startPlannedSession(calendarEvent: event)
                        }
                    )
                } else {
                    Text("Use + to generate workout")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .frame(height: 50)
                        .padding(.horizontal, 16)
                        .background(
                            Capsule()
                                .fill(AppTheme.Colors.surface)
                        )
                }
            }

            // Space for AI Orb (handled by AssistantOverlayView)
            Color.clear
                .frame(width: 50, height: 50)
        }
    }

    // MARK: - Computed Properties

    private var todaysEvent: CalendarEvent? {
        upcomingEvents.first { event in
            Calendar.current.isDateInToday(event.startAt) &&
            event.status != "completed" && event.status != "skipped"
        }
    }

    private var workoutButtonTitle: String {
        if let event = todaysEvent {
            if let focus = event.plannedSession?.intentJson["focus"]?.stringValue {
                return focus
            }
            if let title = event.title {
                return title
            }
            return "Today's Workout"
        }
        return "Today's Workout"
    }

    // MARK: - Data Loading

    private func loadHomeData() async {
        // Attempt to restore a persisted workout
        let _ = workoutStore.loadPersistedState()

        do {
            let start = Calendar.current.startOfDay(for: Date())
            let end = Calendar.current.date(byAdding: .day, value: 7, to: start) ?? start
            upcomingEvents = try await apiService.listCalendarEvents(start: start, end: end)
            latestReport = try await apiService.listWeeklyReports().first

            // Check if no planned/scheduled events — trigger catch-up review
            let hasPlannedEvents = upcomingEvents.contains { $0.status == "scheduled" || $0.status == "planned" }
            if !hasPlannedEvents {
                let newEvents = try await apiService.checkAndRegenerateCalendar()
                if !newEvents.isEmpty {
                    upcomingEvents = try await apiService.listCalendarEvents(start: start, end: end)
                }
            }
        } catch {
            print("Failed to load home data: \(error)")
        }

        buildAIMessage()

        try? await Task.sleep(nanoseconds: 400_000_000)

        withAnimation(AppTheme.Animation.slow) {
            isLoadingAIMessage = false
        }
    }

    private func buildAIMessage() {
        var messageParts: [String] = []

        let workoutCount = latestReport?.sessionsCompleted ?? 3
        messageParts.append("You've completed **\(workoutCount) workouts** this week.")
        messageParts.append("Your push strength is up **12%** from last month.")
        messageParts.append("Day **12** of your streak.")
        messageParts.append("Let's keep building.")

        aiMessage = messageParts.joined(separator: " ")
    }
}

// MARK: - Workout Flow Container

/// Manages the generating → active → completion flow as a fullScreenCover
struct WorkoutFlowView: View {
    @State var workoutStore = WorkoutStore.shared
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            AppTheme.Colors.background.ignoresSafeArea()

            switch workoutStore.sessionStatus {
            case .generating:
                generatingView
            case .active:
                ZStack {
                    WorkoutView()
                    AssistantOverlayView()
                }
                .onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { _ in
                    if workoutStore.sessionStatus == .active {
                        workoutStore.persist()
                    }
                }
            case .completing, .completed:
                WorkoutCompletionView()
            default:
                EmptyView()
            }
        }
        .onChange(of: workoutStore.sessionStatus) { _, newStatus in
            if newStatus == .idle {
                dismiss()
            }
        }
    }

    private var generatingView: some View {
        VStack(spacing: 16) {
            Spacer()

            // AI Orb placeholder (56px circle with gradient)
            Circle()
                .fill(AppTheme.Gradients.orb)
                .frame(width: 56, height: 56)
                .shadow(color: AppTheme.Shadow.orb, radius: AppTheme.Shadow.orbRadius)

            Text("Generating your workout...")
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundColor(AppTheme.Colors.secondaryText)

            // Progress bar
            ProgressView()
                .tint(AppTheme.Colors.primaryText)

            Spacer()
        }
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
