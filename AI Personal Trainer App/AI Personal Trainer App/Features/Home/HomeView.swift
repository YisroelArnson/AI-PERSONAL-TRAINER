//
//  HomeView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/21/25.
//
//  Redesigned with Aurora-inspired aesthetics: warm gradients,
//  frosted glass cards, and calm, minimal UI.
//

import SwiftUI

struct HomeView: View {
    @EnvironmentObject var appCoordinator: AppStateCoordinator
    
    @StateObject private var apiService = APIService()
    @StateObject private var exerciseStore = ExerciseStore.shared
    @StateObject private var workoutSessionStore = WorkoutSessionStore.shared
    
    @State private var showCompletionFeedback = false
    @State private var showExerciseInfo = false
    @State private var errorMessage: String?

    @State private var showReadinessSheet = false
    @State private var showQuickWorkoutSheet = false
    @State private var showReflectionSheet = false
    @State private var showSummarySheet = false
    @State private var showTimeScaleDialog = false
    @State private var showPainDialog = false
    @State private var selectedCoachMode: String = "quiet"
    @State private var upcomingEvents: [CalendarEvent] = []
    @State private var latestReport: WeeklyReport?
    @State private var showCalendarSheet = false
    
    // Swipe and animation states
    @State private var dragOffset: CGFloat = 0
    @State private var showContent: Bool = true
    @State private var isTransitioning: Bool = false
    
    private let swipeThreshold: CGFloat = 50
    
    // Convenience accessors for exerciseStore
    private var exercises: [UIExercise] { exerciseStore.exercises }
    private var completedExerciseIds: Set<UUID> { exerciseStore.completedExerciseIds }
    private var workoutHistoryIds: [UUID: String] { exerciseStore.workoutHistoryIds }
    private var currentExerciseIndex: Int { exerciseStore.currentExerciseIndex }
    private var completedSetsPerExercise: [UUID: Set<Int>] { exerciseStore.completedSetsPerExercise }
    private var adjustedRepsPerExercise: [UUID: [Int]] { exerciseStore.adjustedRepsPerExercise }
    private var adjustedWeightsPerExercise: [UUID: [Int]] { exerciseStore.adjustedWeightsPerExercise }
    
    // Check if all exercises are completed
    private var allExercisesCompleted: Bool {
        exerciseStore.allExercisesCompleted
    }
    
    // Check if current exercise can be completed (has at least one set done for reps type)
    private var canCompleteCurrentExercise: Bool {
        guard !exercises.isEmpty else { return false }
        let exercise = exercises[currentExerciseIndex]

        // For reps exercises (with sets), require at least one set to be completed
        if exercise.type == "reps" && exercise.sets != nil {
            let completedSets = completedSetsPerExercise[exercise.id] ?? []
            return !completedSets.isEmpty
        }

        // For other exercise types, always allow completion
        return true
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Animated gradient background
                AnimatedGradientBackground()
                
                // Main content layer
                VStack(spacing: 0) {
                    // Main content area
                    if workoutSessionStore.isGenerating {
                        Spacer()
                        loadingState
                        Spacer()
                    } else if exercises.isEmpty {
                        Spacer()
                        workoutHome
                        Spacer()
                    } else {
                        // Exercise content with header at top, content centered
                        exerciseContent
                            .padding(.top, AppTheme.Spacing.md)
                        workoutQuickActions
                    }
                    
                    // Bottom controls (orb button + dots)
                    if !exercises.isEmpty {
                        bottomControls
                    }
                }
                
                // Loading state overlay - shows during app initialization
                if !appCoordinator.isReady {
                    LoadingStateView(state: appCoordinator.loadingState)
                        .transition(.opacity)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture()
                    .onEnded { value in
                        if !exercises.isEmpty {
                            handleSwipeGesture(value: value)
                        }
                    }
            )
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
        .sheet(isPresented: $showReflectionSheet) {
            WorkoutReflectionSheet { reflection in
                Task {
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
        .sheet(isPresented: $showCalendarSheet) {
            NavigationView {
                TrainerCalendarView()
            }
        }
        .sheet(isPresented: $showExerciseInfo) {
            if !exercises.isEmpty {
                ExerciseDetailSheet(exercise: exercises[currentExerciseIndex])
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
        .onChange(of: appCoordinator.shouldFetchRecommendations) { _, shouldFetch in
            if shouldFetch {
                Task {
                    await loadRecommendationsIfNeeded()
                }
            }
        }
        .task {
            await loadRecommendationsIfNeeded()
            await loadTrainerOverview()
        }
        .onChange(of: allExercisesCompleted) { _, isAllCompleted in
            if isAllCompleted && !exercises.isEmpty {
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
    
    // MARK: - View Components
    
    private var loadingState: some View {
        VStack(spacing: AppTheme.Spacing.xxl) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.primaryText))
                .scaleEffect(1.2)
            
            Text("Preparing your workout...")
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundColor(AppTheme.Colors.secondaryText)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }
    
    private var workoutHome: some View {
        VStack(spacing: AppTheme.Spacing.xxl) {
            Image(systemName: "figure.walk")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(AppTheme.Colors.primaryText)

            VStack(spacing: AppTheme.Spacing.sm) {
                Text("Today’s session")
                    .font(AppTheme.Typography.aiMessageLarge)
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("Start a guided workout or request something quick.")
                    .font(AppTheme.Typography.aiMessageMedium)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AppTheme.Spacing.xxxxl)

                if let todayIntent = todayIntentLine {
                    Text(todayIntent)
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.top, AppTheme.Spacing.sm)
                }
            }

            HStack(spacing: AppTheme.Spacing.md) {
                Button(action: {
                    showReadinessSheet = true
                }) {
                    Text("Start")
                        .font(AppTheme.Typography.button)
                        .foregroundColor(AppTheme.Colors.background)
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        .padding(.vertical, AppTheme.Spacing.md)
                        .background(
                            Capsule()
                                .fill(AppTheme.Colors.accent)
                        )
                }

                Button(action: {
                    showQuickWorkoutSheet = true
                }) {
                    Text("Quick workout")
                        .font(AppTheme.Typography.button)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        .padding(.vertical, AppTheme.Spacing.md)
                        .background(
                            Capsule()
                                .fill(AppTheme.Colors.surface)
                        )
                }
            }

            if workoutSessionStore.activeSession != nil {
                Button(action: {
                    workoutSessionStore.restoreSessionIfNeeded()
                }) {
                    Text("Resume session")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }

            Toggle(isOn: Binding(
                get: { selectedCoachMode == "ringer" },
                set: { selectedCoachMode = $0 ? "ringer" : "quiet" }
            )) {
                Text("Coach mode: \(selectedCoachMode == "ringer" ? "Ringer" : "Quiet")")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            .toggleStyle(SwitchToggleStyle(tint: AppTheme.Colors.accent))
            .padding(.horizontal, AppTheme.Spacing.xl)

            if let report = latestReport {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Weekly update")
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Text("This week: \(report.sessionsCompleted) sessions")
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    Text(report.focus)
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                        .fill(AppTheme.Colors.surface)
                )
                .padding(.horizontal, AppTheme.Spacing.xl)
            }

            if !upcomingEvents.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Upcoming sessions")
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    ForEach(upcomingEvents.prefix(3)) { event in
                        Text(upcomingLabel(for: event))
                            .font(AppTheme.Typography.caption)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                    Button("View calendar") {
                        showCalendarSheet = true
                    }
                    .buttonStyle(SecondaryCapsuleButton())
                    .padding(.top, AppTheme.Spacing.sm)
                }
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                        .fill(AppTheme.Colors.surface)
                )
                .padding(.horizontal, AppTheme.Spacing.xl)
            }
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }
    
    private var exerciseContent: some View {
        VStack(spacing: 0) {
            // Header (equipment, title, description) - stays at top
            ExerciseHeaderView(
                exercise: exercises[currentExerciseIndex],
                showContent: showContent
            )
            
            // Flexible space to push content toward center
            Spacer()
            
            // Exercise-specific content (sets, metrics) - centered
            ExerciseContentView(
                exercise: exercises[currentExerciseIndex],
                showContent: showContent,
                completedSetIndices: completedSetsBinding(for: exercises[currentExerciseIndex].id),
                adjustedReps: adjustedRepsBinding(for: exercises[currentExerciseIndex].id),
                adjustedWeights: adjustedWeightsBinding(for: exercises[currentExerciseIndex].id),
                onInitializeState: {
                    initializeStrengthExerciseState(for: exercises[currentExerciseIndex])
                }
            )
            
            // Flexible space below content
            Spacer()
        }
    }

    private var workoutQuickActions: some View {
        guard workoutSessionStore.activeSession != nil else {
            return AnyView(EmptyView())
        }

        return AnyView(
            ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AppTheme.Spacing.sm) {
            Button("Swap") {
                Task {
                    await workoutSessionStore.applyAction(
                        actionType: "swap_exercise",
                        payload: ["index": .int(currentExerciseIndex)]
                    )
                }
            }
            .buttonStyle(QuickActionButtonStyle())

            Button("Easier") {
                Task {
                    await workoutSessionStore.applyAction(
                        actionType: "adjust_prescription",
                        payload: [
                            "index": .int(currentExerciseIndex),
                            "direction": .string("easier")
                        ]
                    )
                }
            }
            .buttonStyle(QuickActionButtonStyle())

            Button("Harder") {
                Task {
                    await workoutSessionStore.applyAction(
                        actionType: "adjust_prescription",
                        payload: [
                            "index": .int(currentExerciseIndex),
                            "direction": .string("harder")
                        ]
                    )
                }
            }
            .buttonStyle(QuickActionButtonStyle())

            Button("Short on time") {
                showTimeScaleDialog = true
            }
            .buttonStyle(QuickActionButtonStyle())

            Button("Pain") {
                showPainDialog = true
            }
            .buttonStyle(QuickActionButtonStyle())
        }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.sm)
        .confirmationDialog("Short on time", isPresented: $showTimeScaleDialog) {
            Button("15 min") {
                Task { await timeScaleTo(15) }
            }
            Button("25 min") {
                Task { await timeScaleTo(25) }
            }
            Button("35 min") {
                Task { await timeScaleTo(35) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Pain or discomfort", isPresented: $showPainDialog) {
            Button("Mild") {
                Task { await flagPain(severity: "mild") }
            }
            Button("Moderate") {
                Task { await flagPain(severity: "moderate") }
            }
            Button("Severe") {
                Task { await flagPain(severity: "severe") }
            }
            Button("Cancel", role: .cancel) {}
        }
        )
    }
    
    private var bottomControls: some View {
        HStack(spacing: 0) {
            // Complete button on the left
            let currentExercise = exercises[currentExerciseIndex]
            let isExerciseCompleted = completedExerciseIds.contains(currentExercise.id)
            
            GlowingOrbButton(
                isCompleted: isExerciseCompleted,
                isEnabled: canCompleteCurrentExercise || isExerciseCompleted, // Enable when can complete OR when completed (for undo)
                action: {
                    if isExerciseCompleted {
                        // Undo the completion
                        uncompleteExercise(currentExercise)
                    } else {
                        // Complete the exercise
                        completeExercise(currentExercise)
                    }
                }
            )
            .padding(.leading, AppTheme.Spacing.xl)
            
            Spacer()
            
            // Space reserved for global AI button overlay (positioned in AssistantOverlayView)
            Color.clear
                .frame(width: 56, height: 56)
                .padding(.trailing, AppTheme.Spacing.xl)
        }
        .padding(.bottom, AppTheme.Spacing.xxxl)
    }
    
    // MARK: - Helper Methods
    
    private func loadRecommendationsIfNeeded() async {
        workoutSessionStore.restoreSessionIfNeeded()
        if !exercises.isEmpty {
            appCoordinator.markAsReady()
            print("📦 Resuming \(exercises.count) persisted exercises at index \(currentExerciseIndex)")
        }
    }

    private func loadTrainerOverview() async {
        do {
            let start = Calendar.current.startOfDay(for: Date())
            let end = Calendar.current.date(byAdding: .day, value: 7, to: start) ?? start
            upcomingEvents = try await apiService.listCalendarEvents(start: start, end: end)
            latestReport = try await apiService.listWeeklyReports().first
        } catch {
            // ignore
        }
    }

    private var todayIntentLine: String? {
        let today = Calendar.current.startOfDay(for: Date())
        let todayEvent = upcomingEvents.first { Calendar.current.isDate($0.startAt, inSameDayAs: today) }
        if let focus = todayEvent?.plannedSession?.intentJson["focus"]?.stringValue {
            return "Today's focus: \(focus)"
        }
        if let title = todayEvent?.title {
            return "Today's focus: \(title)"
        }
        return nil
    }

    private func upcomingLabel(for event: CalendarEvent) -> String {
        let day = DateFormatter.localizedString(from: event.startAt, dateStyle: .short, timeStyle: .none)
        let title = event.plannedSession?.intentJson["focus"]?.stringValue ?? event.title ?? "Workout"
        return "\(day) • \(title)"
    }
    
    private func convertToUIExercise(_ exercise: Exercise) -> UIExercise {
        // Create UIExercise from Exercise model (this is used for logging)
        // Extract total_duration_min for intervals type
        var totalDuration: Int? = nil
        if exercise.exercise_type == "intervals" {
            totalDuration = exercise.duration_min > 0 ? exercise.duration_min : nil
        }
        
        return UIExercise(
            exercise_name: exercise.name,
            type: exercise.exercise_type,
            duration_min: exercise.duration_min > 0 ? exercise.duration_min : nil,
            reps: !exercise.reps.isEmpty ? exercise.reps : nil,
            load_kg_each: !exercise.load_kg_each.isEmpty ? exercise.load_kg_each : nil,
            sets: exercise.sets > 0 ? exercise.sets : nil,
            distance_km: exercise.distance_km,
            rounds: exercise.rounds,
            total_duration_min: totalDuration,
            muscles_utilized: exercise.muscles_utilized,
            rest_seconds: exercise.rest_seconds,
            target_pace: exercise.target_pace,
            hold_duration_sec: exercise.hold_duration_sec,
            goals_addressed: exercise.goals_addressed,
            reasoning: exercise.reasoning,
            equipment: exercise.equipment,
            exercise_description: exercise.exercise_description
        )
    }

    private func convertStreamingToUIExercise(_ streamingExercise: StreamingExercise) -> UIExercise {
        // Direct conversion from StreamingExercise to UIExercise
        return UIExercise(
            exercise_name: streamingExercise.exercise_name,
            type: streamingExercise.exercise_type,
            duration_min: streamingExercise.duration_min,
            reps: streamingExercise.reps,
            load_kg_each: streamingExercise.load_kg_each,
            sets: streamingExercise.sets,
            distance_km: streamingExercise.distance_km,
            rounds: streamingExercise.rounds,
            total_duration_min: streamingExercise.total_duration_min,
            muscles_utilized: streamingExercise.muscles_utilized,
            rest_seconds: streamingExercise.rest_seconds,
            target_pace: streamingExercise.target_pace,
            hold_duration_sec: streamingExercise.hold_duration_sec,
            goals_addressed: streamingExercise.goals_addressed,
            reasoning: streamingExercise.reasoning,
            equipment: streamingExercise.equipment,
            exercise_description: streamingExercise.exercise_description
        )
    }
    
    private func completeExercise(_ exercise: UIExercise) {
        Task {
            do {
                // For reps exercises (with sets), use adjusted values and only completed sets
                let exerciseModel: Exercise
                if exercise.type == "reps" && exercise.sets != nil {
                    exerciseModel = createAdjustedExercise(from: exercise)
                } else {
                    exerciseModel = exercise.toExercise()
                }
                
                // Log the exercise and get the database record ID
                let workoutHistoryId = try await apiService.logCompletedExercise(exercise: exerciseModel)
                
                // Update state on MainActor
                updateStateAfterCompletion(
                    exercise: exercise,
                    workoutHistoryId: workoutHistoryId,
                    exerciseModel: exerciseModel
                )
                
                // Hide feedback after delay
                try await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds
                
                await MainActor.run {
                    withAnimation {
                        showCompletionFeedback = false
                    }
                }
            } catch {
                print("❌ Failed to log exercise: \(error)")
                errorMessage = "Failed to complete exercise"
            }
        }
    }
    
    @MainActor
    private func updateStateAfterCompletion(exercise: UIExercise, workoutHistoryId: String, exerciseModel: Exercise) {
        // Mark as completed in ExerciseStore
        exerciseStore.markExerciseCompleted(exerciseId: exercise.id, workoutHistoryId: workoutHistoryId)
        
        // Add to workout history cache immediately (with database ID for proper sync)
        WorkoutHistoryStore.shared.addCompletedExercise(exerciseModel, databaseId: workoutHistoryId)
        
        // Show completion feedback
        withAnimation {
            showCompletionFeedback = true
        }
        
        // Log completion to workout session tracking
        if let currentIdx = exercises.firstIndex(where: { $0.id == exercise.id }) {
            let completedSets = completedSetsPerExercise[exercise.id]?.count ?? (exercise.sets ?? 1)
            Task {
                await workoutSessionStore.logExerciseCompletion(index: currentIdx, exercise: exercise, completedSets: completedSets)
            }
        }

        // Scroll to next uncompleted exercise
        if let currentIdx = exercises.firstIndex(where: { $0.id == exercise.id }) {
            // Find next uncompleted exercise
            let nextUncompletedIdx = exercises.indices
                .dropFirst(currentIdx + 1)
                .first { !completedExerciseIds.contains(exercises[$0].id) }
            
            if let nextIdx = nextUncompletedIdx {
                exerciseStore.setCurrentIndex(nextIdx)
            }
        }
    }
    
    private func uncompleteExercise(_ exercise: UIExercise) {
        // Capture the workout history ID before entering async context
        guard let workoutHistoryId = workoutHistoryIds[exercise.id] else {
            print("❌ No workout history ID found for exercise: \(exercise.exercise_name)")
            return
        }
        
        Task {
            do {
                // Delete from database
                try await apiService.deleteCompletedExercise(workoutHistoryId: workoutHistoryId)
                
                // Update state on MainActor
                updateStateAfterUncompletion(
                    exercise: exercise,
                    workoutHistoryId: workoutHistoryId
                )
            } catch {
                print("❌ Failed to uncomplete exercise: \(error)")
                await MainActor.run {
                    self.errorMessage = "Failed to undo exercise completion"
                }
            }
        }
    }
    
    @MainActor
    private func updateStateAfterUncompletion(exercise: UIExercise, workoutHistoryId: String) {
        // Remove from ExerciseStore completed state
        exerciseStore.markExerciseUncompleted(exerciseId: exercise.id)
        
        // Remove from workout history cache
        WorkoutHistoryStore.shared.removeCompletedExercise(id: workoutHistoryId)
        
        print("✅ Successfully uncompleted exercise: \(exercise.exercise_name)")
    }
    
    /// Creates an Exercise model with only completed sets and adjusted values
    private func createAdjustedExercise(from exercise: UIExercise) -> Exercise {
        let completedSets = completedSetsPerExercise[exercise.id] ?? []
        let adjustedReps = adjustedRepsPerExercise[exercise.id] ?? exercise.reps ?? []

        // Filter to only completed sets and get their values
        let sortedCompletedIndices = completedSets.sorted()
        let completedReps = sortedCompletedIndices.compactMap { index in
            adjustedReps.indices.contains(index) ? adjustedReps[index] : nil
        }

        // Handle weights for reps exercises with load
        var completedWeights: [Double] = []
        if exercise.type == "reps" && exercise.load_kg_each != nil {
            let adjustedWeights = adjustedWeightsPerExercise[exercise.id] ?? exercise.load_kg_each?.map { Int($0) } ?? []
            completedWeights = sortedCompletedIndices.compactMap { index in
                adjustedWeights.indices.contains(index) ? Double(adjustedWeights[index]) : nil
            }
        }

        return Exercise(
            name: exercise.exercise_name,
            exercise_type: exercise.type,
            sets: completedSets.count,
            reps: completedReps,
            duration_min: exercise.duration_min ?? 0,
            load_kg_each: completedWeights,
            muscles_utilized: exercise.muscles_utilized,
            goals_addressed: exercise.goals_addressed,
            reasoning: exercise.reasoning ?? "",
            exercise_description: exercise.exercise_description,
            distance_km: exercise.distance_km,
            rounds: exercise.rounds,
            rest_seconds: exercise.rest_seconds,
            target_pace: exercise.target_pace,
            hold_duration_sec: exercise.hold_duration_sec,
            equipment: exercise.equipment
        )
    }
    
    // MARK: - Swipe Gesture Handling
    
    private func handleSwipeGesture(value: DragGesture.Value) {
        guard !isTransitioning else { return }
        
        let horizontalDistance = value.translation.width
        
        // Swipe right (go to previous exercise)
        if horizontalDistance > swipeThreshold && currentExerciseIndex > 0 {
            transitionToExercise(newIndex: currentExerciseIndex - 1)
        }
        // Swipe left (go to next exercise)
        else if horizontalDistance < -swipeThreshold && currentExerciseIndex < exercises.count - 1 {
            transitionToExercise(newIndex: currentExerciseIndex + 1)
        }
    }
    
    private func transitionToExercise(newIndex: Int) {
        isTransitioning = true
        
        // Fade out current content
        withAnimation(.easeOut(duration: 0.15)) {
            showContent = false
        }
        
        // Wait for fade out, then change index and fade in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            self.exerciseStore.setCurrentIndex(newIndex)
            self.dragOffset = 0
            
            // Fade in new content
            withAnimation(.easeIn(duration: 0.2)) {
                self.showContent = true
            }
            
            // Reset transition state
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self.isTransitioning = false
            }
        }
    }
    
    // MARK: - Exercise State Helpers
    
    /// Ensures state arrays are initialized for reps exercises
    private func initializeStrengthExerciseState(for exercise: UIExercise) {
        // Handle reps exercises (with or without load)
        guard exercise.type == "reps", let reps = exercise.reps else { return }

        // Initialize completed sets if not present
        if exerciseStore.completedSetsPerExercise[exercise.id] == nil {
            exerciseStore.updateCompletedSets(exerciseId: exercise.id, sets: [])
        }

        // Initialize adjusted reps if not present
        if exerciseStore.adjustedRepsPerExercise[exercise.id] == nil {
            exerciseStore.updateAdjustedReps(exerciseId: exercise.id, reps: reps)
        }

        // Initialize adjusted weights if not present (for weighted exercises)
        if let loads = exercise.load_kg_each,
           exerciseStore.adjustedWeightsPerExercise[exercise.id] == nil {
            exerciseStore.updateAdjustedWeights(exerciseId: exercise.id, weights: loads.map { Int($0) })
        }
    }
    
    /// Binding for completed sets of a specific exercise
    private func completedSetsBinding(for exerciseId: UUID) -> Binding<Set<Int>> {
        Binding(
            get: { self.exerciseStore.completedSetsPerExercise[exerciseId] ?? [] },
            set: { self.exerciseStore.updateCompletedSets(exerciseId: exerciseId, sets: $0) }
        )
    }
    
    /// Binding for adjusted reps of a specific exercise
    private func adjustedRepsBinding(for exerciseId: UUID) -> Binding<[Int]> {
        Binding(
            get: { self.exerciseStore.adjustedRepsPerExercise[exerciseId] ?? [] },
            set: { self.exerciseStore.updateAdjustedReps(exerciseId: exerciseId, reps: $0) }
        )
    }
    
    /// Binding for adjusted weights of a specific exercise
    private func adjustedWeightsBinding(for exerciseId: UUID) -> Binding<[Int]> {
        Binding(
            get: { self.exerciseStore.adjustedWeightsPerExercise[exerciseId] ?? [] },
            set: { self.exerciseStore.updateAdjustedWeights(exerciseId: exerciseId, weights: $0) }
        )
    }

    private func timeScaleTo(_ minutes: Int) async {
        await workoutSessionStore.applyAction(
            actionType: "time_scale",
            payload: ["target_minutes": .int(minutes)]
        )
    }

    private func flagPain(severity: String) async {
        await workoutSessionStore.applyAction(
            actionType: "flag_pain",
            payload: ["severity": .string(severity)]
        )
    }
}

struct LocationInfo {
    let name: String
    let temperature: String?
    let weatherCondition: String?
    
    static let sample = LocationInfo(
        name: "San Francisco, CA",
        temperature: "72°F",
        weatherCondition: "Sunny"
    )
}

struct QuickActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.suggestedPrompt)
            .foregroundColor(AppTheme.Colors.primaryText)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(configuration.isPressed ? AppTheme.Colors.surfaceHover : AppTheme.Colors.surface)
            )
    }
}

// MARK: - UIExercise ExerciseDisplayable Conformance
extension UIExercise: ExerciseDisplayable {
    // Map 'type' to 'exercise_type' for protocol
    var exercise_type: String {
        return type
    }
    
    var displayMusclesUtilized: [MuscleUtilization] {
        return muscles_utilized ?? []
    }
    
    // UIExercise doesn't have history-specific fields
    var displayFormattedDate: String? {
        return nil
    }
    
    var displayRpe: Int? {
        return nil
    }
    
    var displayNotes: String? {
        return nil
    }
}

#Preview {
    HomeView()
}
