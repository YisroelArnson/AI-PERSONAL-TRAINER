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
    @Binding var isDrawerOpen: Bool
    @Binding var showingAssistant: Bool
    
    @StateObject private var apiService = APIService()
    @StateObject private var exerciseStore = ExerciseStore.shared
    
    @State private var isLoadingRecommendations = false
    @State private var isStreamingExercises = false
    @State private var showRefreshModal = false
    @State private var showCompletionFeedback = false
    @State private var showExerciseInfo = false
    @State private var errorMessage: String?
    
    // Interval timer states
    @StateObject private var intervalTimerViewModel = IntervalTimerViewModel()
    @State private var intervalDetailText: String?
    
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
    
    // Check if current exercise can be completed (has at least one set done for strength/bodyweight)
    private var canCompleteCurrentExercise: Bool {
        guard !exercises.isEmpty else { return false }
        let exercise = exercises[currentExerciseIndex]
        
        // For strength and bodyweight exercises, require at least one set to be completed
        if exercise.type == "strength" || exercise.type == "bodyweight" {
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
                    // Minimal top bar
                    topBar
                    
                    // Main content area
                    if isLoadingRecommendations {
                        Spacer()
                        loadingState
                        Spacer()
                    } else if exercises.isEmpty {
                        Spacer()
                        emptyState
                        Spacer()
                    } else {
                        // Exercise content with header at top, content centered
                        exerciseContent
                            .padding(.top, AppTheme.Spacing.md)
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
                
                // Interval detail banner at top center
                if !exercises.isEmpty && intervalDetailText != nil {
                    VStack {
                        IntervalDetailBanner(text: intervalDetailText)
                            .padding(.top, 60)
                            .animation(.easeInOut(duration: 0.2), value: intervalDetailText)
                        
                        Spacer()
                    }
                    .allowsHitTesting(false)
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
        .sheet(isPresented: $showRefreshModal) {
            RefreshModalView { feedback in
                await fetchRecommendations(feedback: feedback)
            }
        }
        .sheet(isPresented: $showExerciseInfo) {
            if !exercises.isEmpty {
                ExerciseDetailSheet(exercise: exercises[currentExerciseIndex])
            }
        }
        .onChange(of: appCoordinator.shouldFetchRecommendations) { _, shouldFetch in
            if shouldFetch {
                Task {
                    await loadRecommendationsIfNeeded()
                }
            }
        }
        .onChange(of: allExercisesCompleted) { _, isAllCompleted in
            if isAllCompleted && !isStreamingExercises {
                Task {
                    // Brief delay so user sees the last completion
                    try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds
                    // Double-check we're still not streaming after the delay
                    if !isStreamingExercises {
                        await fetchMoreRecommendations()
                    }
                }
            }
        }
        .onChange(of: exerciseStore.needsRefresh) { _, needsRefresh in
            if needsRefresh && !isStreamingExercises {
                Task {
                    await fetchRecommendations(feedback: nil)
                }
            }
        }
        .onChange(of: currentExerciseIndex) { _, newIndex in
            // Load interval data for new exercise
            if !exercises.isEmpty && newIndex < exercises.count {
                loadIntervalsForCurrentExercise()
            }
        }
        .onAppear {
            // Setup interval timer callbacks
            setupIntervalTimerCallbacks()
            
            // Load intervals for initial exercise if available
            if !exercises.isEmpty {
                loadIntervalsForCurrentExercise()
            }
        }
    }
    
    // MARK: - Interval Timer
    
    private func setupIntervalTimerCallbacks() {
        // Called when timer auto-completes a set
        intervalTimerViewModel.onSetCompleted = { setIndex in
            // The view model already updates ExerciseStore, but we can add visual feedback here if needed
            print("⏱️ HomeView: Set \(setIndex + 1) auto-completed via timer")
        }
        
        // Called when entire timer completes
        intervalTimerViewModel.onTimerComplete = {
            print("⏱️ HomeView: Timer complete for exercise")
            intervalDetailText = nil
        }
    }
    
    private func loadIntervalsForCurrentExercise() {
        guard !exercises.isEmpty && currentExerciseIndex < exercises.count else { return }
        
        let exercise = exercises[currentExerciseIndex]
        
        Task {
            await intervalTimerViewModel.loadIntervals(
                for: exercise,
                exerciseId: exercise.id
            )
        }
    }
    
    // MARK: - View Components
    
    private var topBar: some View {
        HStack {
            // Drawer toggle (ChatGPT-style icon)
            Button {
                withAnimation(AppTheme.Animation.gentle) {
                    isDrawerOpen = true
                }
            } label: {
                // Two horizontal lines icon (like ChatGPT)
                VStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(AppTheme.Colors.primaryText.opacity(0.7))
                        .frame(width: 18, height: 2)
                    RoundedRectangle(cornerRadius: 1)
                        .fill(AppTheme.Colors.primaryText.opacity(0.7))
                        .frame(width: 18, height: 2)
                }
                .frame(width: 44, height: 44)
            }
            
            // Exercise dot tracker in center
            if !exercises.isEmpty {
                Spacer()
                ExerciseDotTracker(
                    totalExercises: exercises.count,
                    currentIndex: currentExerciseIndex,
                    exerciseIds: exercises.map { $0.id },
                    completedExerciseIds: completedExerciseIds
                )
                Spacer()
            } else {
                Spacer()
            }
            
            // Three dots menu (minimal, no background)
            Menu {
                if !exercises.isEmpty {
                    Button(action: {
                        showExerciseInfo = true
                    }) {
                        Label("Exercise Info", systemImage: "info.circle")
                    }
                }
                
                Button(action: {
                    showRefreshModal = true
                }) {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .padding(.top, AppTheme.Spacing.xs)
    }
    
    private var loadingState: some View {
        VStack(spacing: AppTheme.Spacing.xxl) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.warmAccent))
                .scaleEffect(1.2)
            
            Text("Preparing your workout...")
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundColor(AppTheme.Colors.secondaryText)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }
    
    private var emptyState: some View {
        VStack(spacing: AppTheme.Spacing.xxl) {
            Image(systemName: "figure.run")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(AppTheme.Colors.warmAccent)
            
            VStack(spacing: AppTheme.Spacing.sm) {
                Text("Ready when you are")
                    .font(.system(size: 24, weight: .semibold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text("Tap refresh to get your personalized workout")
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AppTheme.Spacing.xxxxl)
            }
            
            Button(action: {
                showRefreshModal = true
            }) {
                Text("Get started")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, AppTheme.Spacing.xxxl)
                    .padding(.vertical, AppTheme.Spacing.md)
                    .background(
                        Capsule()
                            .fill(AppTheme.Colors.warmAccent)
                    )
            }
            .padding(.top, AppTheme.Spacing.md)
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
            
            // Timer in the center
            if intervalTimerViewModel.intervalData != nil {
                IntervalTimerOverlay(
                    viewModel: intervalTimerViewModel,
                    detailText: $intervalDetailText
                )
                .frame(width: 64) // Fixed width to maintain center alignment
            } else {
                // Placeholder to maintain spacing when timer not loaded
                Circle()
                    .fill(Color.clear)
                    .frame(width: 64, height: 64)
            }
            
            Spacer()
            
            // AI button on the right
            FloatingAIButton {
                showingAssistant = true
            }
            .padding(.trailing, AppTheme.Spacing.xl)
        }
        .padding(.bottom, AppTheme.Spacing.xxxl)
    }
    
    // MARK: - Helper Methods
    
    private func loadRecommendationsIfNeeded() async {
        // Check if we should fetch new recommendations based on user settings
        if exerciseStore.shouldFetchNewExercises {
            await fetchRecommendations(feedback: nil)
        } else {
            // Resume existing exercises - mark app as ready if we have exercises
            if !exercises.isEmpty {
                appCoordinator.markAsReady()
                print("📦 Resuming \(exercises.count) persisted exercises at index \(currentExerciseIndex)")
            }
        }
    }
    
    private func fetchMoreRecommendations() async {
        isLoadingRecommendations = true
        isStreamingExercises = true
        errorMessage = nil
        
        // Don't clear exercises or completedExerciseIds - append new ones
        let startingCount = exercises.count
        
        do {
            try await apiService.streamRecommendations(
                exerciseCount: nil,
                onExercise: { streamingExercise in
                    // Convert streaming exercise to UIExercise
                    let uiExercise = self.convertStreamingToUIExercise(streamingExercise)
                    
                    // Turn off loading as soon as first exercise arrives
                    if self.isLoadingRecommendations {
                        self.isLoadingRecommendations = false
                    }
                    
                    self.exerciseStore.addExercise(uiExercise)
                    print("📊 Exercise \(self.exercises.count) added: \(streamingExercise.exercise_name)")
                },
                onComplete: { totalCount in
                    print("✅ Loaded \(totalCount) more exercises (total: \(self.exercises.count))")
                    self.exerciseStore.saveState()
                    self.isLoadingRecommendations = false
                    self.isStreamingExercises = false
                    
                    // Auto-scroll to first new uncompleted exercise
                    if let firstNewIdx = self.exercises.indices.suffix(from: startingCount).first(where: {
                        !self.completedExerciseIds.contains(self.exercises[$0].id)
                    }) {
                        self.exerciseStore.setCurrentIndex(firstNewIdx)
                    }
                },
                onError: { error in
                    self.errorMessage = error
                    self.isLoadingRecommendations = false
                    self.isStreamingExercises = false
                    print("❌ Error loading exercises: \(error)")
                }
            )
        } catch {
            errorMessage = error.localizedDescription
            isLoadingRecommendations = false
            isStreamingExercises = false
            print("❌ Failed to fetch more recommendations: \(error)")
        }
    }
    
    private func fetchRecommendations(feedback: String?) async {
        isLoadingRecommendations = true
        isStreamingExercises = true
        errorMessage = nil
        
        // Clear existing exercises and completed state (manual refresh or auto-refresh)
        exerciseStore.clearExercises()
        exerciseStore.markFetchStarted()
        
        do {
            try await apiService.streamRecommendations(
                exerciseCount: nil,  // Let backend decide based on user context
                onExercise: { streamingExercise in
                    // Convert streaming exercise to UIExercise
                    let uiExercise = self.convertStreamingToUIExercise(streamingExercise)
                    
                    // Turn off loading and mark app as ready when first exercise arrives
                    if self.exercises.isEmpty {
                        self.isLoadingRecommendations = false
                        self.appCoordinator.markAsReady()
                    }
                    
                    self.exerciseStore.addExercise(uiExercise)
                    print("📊 Exercise \(self.exercises.count) added: \(streamingExercise.exercise_name)")
                },
                onComplete: { totalCount in
                    print("✅ Loaded \(totalCount) exercises")
                    self.exerciseStore.saveState()
                    self.isLoadingRecommendations = false
                    self.isStreamingExercises = false
                },
                onError: { error in
                    self.errorMessage = error
                    self.isLoadingRecommendations = false
                    self.isStreamingExercises = false
                    print("❌ Error loading exercises: \(error)")
                }
            )
        } catch {
            errorMessage = error.localizedDescription
            isLoadingRecommendations = false
            isStreamingExercises = false
            print("❌ Failed to fetch recommendations: \(error)")
        }
    }
    
    private func convertToUIExercise(_ exercise: Exercise) -> UIExercise {
        // Create UIExercise from Exercise model (this is used for logging)
        // Extract total_duration_min based on exercise type
        var totalDuration: Int? = nil
        if exercise.exercise_type == "hiit" || exercise.exercise_type == "yoga" {
            totalDuration = exercise.duration_min > 0 ? exercise.duration_min : nil
        }
        
        return UIExercise(
            exercise_name: exercise.name,
            type: exercise.exercise_type,
            aliases: exercise.aliases,
            duration_min: exercise.duration_min > 0 ? exercise.duration_min : nil,
            reps: !exercise.reps.isEmpty ? exercise.reps : nil,
            load_kg_each: !exercise.load_kg_each.isEmpty ? exercise.load_kg_each : nil,
            sets: exercise.sets > 0 ? exercise.sets : nil,
            distance_km: exercise.distance_km,
            intervals: exercise.intervals,
            rounds: exercise.rounds,
            muscles_utilized: exercise.muscles_utilized,
            rest_seconds: exercise.rest_seconds,
            target_pace: exercise.target_pace,
            target_intensity: nil,
            hold_duration_sec: exercise.hold_duration_sec,
            progression_level: nil,
            circuits: nil,
            exercises_in_circuit: nil,
            rest_between_circuits_sec: nil,
            holds: nil,
            repetitions: nil,
            sequence: nil,
            total_duration_min: totalDuration,
            sport: nil,
            drill_name: nil,
            skill_focus: nil,
            goals_addressed: exercise.goals_addressed,
            reasoning: exercise.reasoning,
            equipment: exercise.equipment,
            movement_pattern: exercise.movement_pattern,
            exercise_description: exercise.exercise_description,
            body_region: exercise.body_region
        )
    }
    
    private func convertStreamingToUIExercise(_ streamingExercise: StreamingExercise) -> UIExercise {
        // Direct conversion from StreamingExercise to UIExercise preserving all fields
        return UIExercise(
            exercise_name: streamingExercise.exercise_name,
            type: streamingExercise.exercise_type,
            aliases: streamingExercise.aliases,
            duration_min: streamingExercise.duration_min,
            reps: streamingExercise.reps,
            load_kg_each: streamingExercise.load_kg_each,
            sets: streamingExercise.sets,
            distance_km: streamingExercise.distance_km,
            intervals: streamingExercise.intervals,
            rounds: streamingExercise.rounds,
            muscles_utilized: streamingExercise.muscles_utilized,
            rest_seconds: streamingExercise.rest_seconds,
            target_pace: streamingExercise.target_pace,
            target_intensity: streamingExercise.target_intensity,
            hold_duration_sec: streamingExercise.hold_duration_sec,
            progression_level: streamingExercise.progression_level,
            circuits: streamingExercise.circuits,
            exercises_in_circuit: streamingExercise.exercises_in_circuit,
            rest_between_circuits_sec: streamingExercise.rest_between_circuits_sec,
            holds: streamingExercise.holds,
            repetitions: streamingExercise.repetitions,
            sequence: streamingExercise.sequence,
            total_duration_min: streamingExercise.total_duration_min,
            sport: streamingExercise.sport,
            drill_name: streamingExercise.drill_name,
            skill_focus: streamingExercise.skill_focus,
            goals_addressed: streamingExercise.goals_addressed,
            reasoning: streamingExercise.reasoning,
            equipment: streamingExercise.equipment,
            movement_pattern: streamingExercise.movement_pattern,
            exercise_description: streamingExercise.exercise_description,
            body_region: streamingExercise.body_region
        )
    }
    
    private func completeExercise(_ exercise: UIExercise) {
        Task {
            do {
                // For strength and bodyweight exercises, use adjusted values and only completed sets
                let exerciseModel: Exercise
                if exercise.type == "strength" || exercise.type == "bodyweight" {
                    exerciseModel = createAdjustedExercise(from: exercise)
                } else {
                    exerciseModel = exercise.toExercise()
                }
                
                // Log the exercise and get the database record ID
                let workoutHistoryId = try await apiService.logCompletedExercise(exercise: exerciseModel)
                
                // Update state on MainActor
                await updateStateAfterCompletion(
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
                await updateStateAfterUncompletion(
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
        
        // Handle weights only for strength exercises
        var completedWeights: [Double] = []
        if exercise.type == "strength" {
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
            intervals: exercise.intervals,
            distance_km: exercise.distance_km,
            rounds: exercise.rounds,
            rest_seconds: exercise.rest_seconds,
            target_pace: exercise.target_pace,
            hold_duration_sec: exercise.hold_duration_sec,
            equipment: exercise.equipment,
            movement_pattern: exercise.movement_pattern,
            body_region: exercise.body_region,
            aliases: exercise.aliases
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
    
    /// Ensures state arrays are initialized for a strength or bodyweight exercise
    private func initializeStrengthExerciseState(for exercise: UIExercise) {
        // Handle strength exercises
        if exercise.type == "strength",
           let reps = exercise.reps,
           let loads = exercise.load_kg_each {
            
            // Initialize completed sets if not present
            if exerciseStore.completedSetsPerExercise[exercise.id] == nil {
                exerciseStore.updateCompletedSets(exerciseId: exercise.id, sets: [])
            }
            
            // Initialize adjusted reps if not present
            if exerciseStore.adjustedRepsPerExercise[exercise.id] == nil {
                exerciseStore.updateAdjustedReps(exerciseId: exercise.id, reps: reps)
            }
            
            // Initialize adjusted weights if not present (convert kg to lbs)
            if exerciseStore.adjustedWeightsPerExercise[exercise.id] == nil {
                exerciseStore.updateAdjustedWeights(exerciseId: exercise.id, weights: loads.map { Int($0) })
            }
        }
        
        // Handle bodyweight exercises
        if exercise.type == "bodyweight",
           let reps = exercise.reps {
            
            // Initialize completed sets if not present
            if exerciseStore.completedSetsPerExercise[exercise.id] == nil {
                exerciseStore.updateCompletedSets(exerciseId: exercise.id, sets: [])
            }
            
            // Initialize adjusted reps if not present
            if exerciseStore.adjustedRepsPerExercise[exercise.id] == nil {
                exerciseStore.updateAdjustedReps(exerciseId: exercise.id, reps: reps)
            }
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
}

// MARK: - Data Models

struct UIExercise: Identifiable, Codable {
    let id: UUID
    let exercise_name: String
    let type: String // exercise type (strength, cardio_distance, etc.)
    let aliases: [String]?
    let duration_min: Int?
    
    // For rep-based exercises
    let reps: [Int]?
    let load_kg_each: [Double]?
    let sets: Int?
    
    // For distance-based cardio
    let distance_km: Double?
    
    // For interval exercises
    let intervals: [ExerciseInterval]?
    let rounds: Int?
    
    // Muscle utilization
    let muscles_utilized: [MuscleUtilization]?
    
    // Additional fields for different exercise types
    let rest_seconds: Int?
    let target_pace: String?
    let target_intensity: String?
    let hold_duration_sec: [Int]?
    let progression_level: String?
    
    // Circuit training fields
    let circuits: Int?
    let exercises_in_circuit: [CircuitExercise]?
    let rest_between_circuits_sec: Int?
    
    // Flexibility fields
    let holds: [FlexibilityHold]?
    let repetitions: Int?
    
    // Yoga fields
    let sequence: [YogaPose]?
    let total_duration_min: Int?
    
    // Sport-specific fields
    let sport: String?
    let drill_name: String?
    let skill_focus: String?
    
    // Metadata fields
    let goals_addressed: [GoalUtilization]?
    let reasoning: String?
    let equipment: [String]?
    let movement_pattern: [String]?
    let exercise_description: String?
    let body_region: String?
    
    // Custom initializer to generate UUID
    init(exercise_name: String, type: String, aliases: [String]? = nil, duration_min: Int? = nil, reps: [Int]? = nil, load_kg_each: [Double]? = nil, sets: Int? = nil, distance_km: Double? = nil, intervals: [ExerciseInterval]? = nil, rounds: Int? = nil, muscles_utilized: [MuscleUtilization]? = nil, rest_seconds: Int? = nil, target_pace: String? = nil, target_intensity: String? = nil, hold_duration_sec: [Int]? = nil, progression_level: String? = nil, circuits: Int? = nil, exercises_in_circuit: [CircuitExercise]? = nil, rest_between_circuits_sec: Int? = nil, holds: [FlexibilityHold]? = nil, repetitions: Int? = nil, sequence: [YogaPose]? = nil, total_duration_min: Int? = nil, sport: String? = nil, drill_name: String? = nil, skill_focus: String? = nil, goals_addressed: [GoalUtilization]? = nil, reasoning: String? = nil, equipment: [String]? = nil, movement_pattern: [String]? = nil, exercise_description: String? = nil, body_region: String? = nil) {
        self.id = UUID()
        self.exercise_name = exercise_name
        self.type = type
        self.aliases = aliases
        self.duration_min = duration_min
        self.reps = reps
        self.load_kg_each = load_kg_each
        self.sets = sets
        self.distance_km = distance_km
        self.intervals = intervals
        self.rounds = rounds
        self.muscles_utilized = muscles_utilized
        self.rest_seconds = rest_seconds
        self.target_pace = target_pace
        self.target_intensity = target_intensity
        self.hold_duration_sec = hold_duration_sec
        self.progression_level = progression_level
        self.circuits = circuits
        self.exercises_in_circuit = exercises_in_circuit
        self.rest_between_circuits_sec = rest_between_circuits_sec
        self.holds = holds
        self.repetitions = repetitions
        self.sequence = sequence
        self.total_duration_min = total_duration_min
        self.sport = sport
        self.drill_name = drill_name
        self.skill_focus = skill_focus
        self.goals_addressed = goals_addressed
        self.reasoning = reasoning
        self.equipment = equipment
        self.movement_pattern = movement_pattern
        self.exercise_description = exercise_description
        self.body_region = body_region
    }
    
    // Convert to Exercise model for logging
    func toExercise() -> Exercise {
        return Exercise(
            name: exercise_name,
            exercise_type: type,
            sets: sets ?? 0,
            reps: reps ?? [],
            duration_min: duration_min ?? 0,
            load_kg_each: load_kg_each ?? [],
            muscles_utilized: muscles_utilized,
            goals_addressed: goals_addressed,
            reasoning: reasoning ?? "",
            exercise_description: exercise_description,
            intervals: intervals,
            distance_km: distance_km,
            rounds: rounds,
            rest_seconds: rest_seconds,
            target_pace: target_pace,
            hold_duration_sec: hold_duration_sec,
            equipment: equipment,
            movement_pattern: movement_pattern,
            body_region: body_region,
            aliases: aliases
        )
    }
    
    enum CodingKeys: String, CodingKey {
        case id, exercise_name, type, aliases, duration_min, reps, load_kg_each, sets, distance_km, intervals, rounds, muscles_utilized, rest_seconds, target_pace, target_intensity, hold_duration_sec, progression_level, circuits, exercises_in_circuit, rest_between_circuits_sec, holds, repetitions, sequence, total_duration_min, sport, drill_name, skill_focus, goals_addressed, reasoning, equipment, movement_pattern, exercise_description, body_region
    }
    
    static var sampleExercises: [UIExercise] {
        let benchPress = UIExercise(
            exercise_name: "Barbell Bench Press",
            type: "strength",
            aliases: ["bb_bench_press"],
            duration_min: 0,
            reps: [8, 8, 6, 6],
            load_kg_each: [80, 80, 85, 85],
            sets: 4,
            distance_km: nil,
            intervals: nil,
            rounds: nil,
            muscles_utilized: [
                MuscleUtilization(muscle: "chest", share: 0.5),
                MuscleUtilization(muscle: "triceps", share: 0.3),
                MuscleUtilization(muscle: "shoulders", share: 0.2)
            ],
            rest_seconds: 90,
            target_pace: nil,
            target_intensity: nil,
            hold_duration_sec: nil,
            progression_level: nil
        )
        
        let run5k = UIExercise(
            exercise_name: "5K Run",
            type: "cardio_distance",
            aliases: ["running"],
            duration_min: 25,
            reps: nil,
            load_kg_each: nil,
            sets: nil,
            distance_km: 5.0,
            intervals: nil,
            rounds: nil,
            muscles_utilized: [
                MuscleUtilization(muscle: "legs", share: 0.7),
                MuscleUtilization(muscle: "core", share: 0.3)
            ],
            rest_seconds: nil,
            target_pace: "5:00/km",
            target_intensity: nil,
            hold_duration_sec: nil,
            progression_level: nil
        )
        
        let hiitCircuit = UIExercise(
            exercise_name: "HIIT Circuit",
            type: "hiit",
            aliases: ["high_intensity_intervals"],
            duration_min: 20,
            reps: nil,
            load_kg_each: nil,
            sets: nil,
            distance_km: nil,
            intervals: [
                ExerciseInterval(work_sec: 30, rest_sec: nil),
                ExerciseInterval(work_sec: nil, rest_sec: 60)
            ],
            rounds: 10,
            muscles_utilized: [
                MuscleUtilization(muscle: "full_body", share: 1.0)
            ],
            rest_seconds: nil,
            target_pace: nil,
            target_intensity: "High",
            hold_duration_sec: nil,
            progression_level: nil
        )
        
        return [benchPress, run5k, hiitCircuit]
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
    HomeView(isDrawerOpen: .constant(false), showingAssistant: .constant(false))
}
