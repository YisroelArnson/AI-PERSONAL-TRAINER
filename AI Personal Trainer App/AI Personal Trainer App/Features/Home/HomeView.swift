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
    
    @StateObject private var apiService = APIService()
    @StateObject private var exerciseStore = ExerciseStore.shared
    
    @State private var isLoadingRecommendations = false
    @State private var isStreamingExercises = false
    @State private var showRefreshModal = false
    @State private var showCompletionFeedback = false
    @State private var showExerciseInfo = false
    @State private var errorMessage: String?
    
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
            
            // Space reserved for global AI button overlay (positioned in AssistantOverlayView)
            Color.clear
                .frame(width: 56, height: 56)
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
}

// MARK: - Data Models

/// UI exercise model using the 4-type system: reps, hold, duration, intervals
struct UIExercise: Identifiable, Codable {
    let id: UUID
    let exercise_name: String
    let type: String // exercise type: "reps", "hold", "duration", "intervals"

    // === METADATA ===
    let muscles_utilized: [MuscleUtilization]?
    let goals_addressed: [GoalUtilization]?
    let reasoning: String?
    let exercise_description: String?
    let equipment: [String]?

    // === TYPE: reps - Count repetitions across sets ===
    let sets: Int?
    let reps: [Int]?
    let load_kg_each: [Double]?  // Weight per set
    let load_unit: String?       // "lbs" or "kg"

    // === TYPE: hold - Hold positions for time ===
    let hold_duration_sec: [Int]? // Hold duration per set in seconds

    // === TYPE: duration - Continuous effort ===
    let duration_min: Int?
    let distance_km: Double?
    let distance_unit: String?   // "km" or "mi"
    let target_pace: String?

    // === TYPE: intervals - Work/rest cycles ===
    let rounds: Int?
    let work_sec: Int?           // Work interval in seconds
    let total_duration_min: Int? // Total workout duration

    // === SHARED TIMING ===
    let rest_seconds: Int?       // Rest between sets/intervals in seconds

    // === GROUPING (optional) ===
    let group: ExerciseGroup?

    // Custom initializer to generate UUID
    init(
        exercise_name: String,
        type: String,
        duration_min: Int? = nil,
        reps: [Int]? = nil,
        load_kg_each: [Double]? = nil,
        load_unit: String? = nil,
        sets: Int? = nil,
        distance_km: Double? = nil,
        distance_unit: String? = nil,
        rounds: Int? = nil,
        work_sec: Int? = nil,
        total_duration_min: Int? = nil,
        muscles_utilized: [MuscleUtilization]? = nil,
        rest_seconds: Int? = nil,
        target_pace: String? = nil,
        hold_duration_sec: [Int]? = nil,
        goals_addressed: [GoalUtilization]? = nil,
        reasoning: String? = nil,
        equipment: [String]? = nil,
        exercise_description: String? = nil,
        group: ExerciseGroup? = nil
    ) {
        self.id = UUID()
        self.exercise_name = exercise_name
        self.type = type
        self.duration_min = duration_min
        self.reps = reps
        self.load_kg_each = load_kg_each
        self.load_unit = load_unit
        self.sets = sets
        self.distance_km = distance_km
        self.distance_unit = distance_unit
        self.rounds = rounds
        self.work_sec = work_sec
        self.total_duration_min = total_duration_min
        self.muscles_utilized = muscles_utilized
        self.rest_seconds = rest_seconds
        self.target_pace = target_pace
        self.hold_duration_sec = hold_duration_sec
        self.goals_addressed = goals_addressed
        self.reasoning = reasoning
        self.equipment = equipment
        self.exercise_description = exercise_description
        self.group = group
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
            distance_km: distance_km,
            rounds: rounds,
            rest_seconds: rest_seconds,
            target_pace: target_pace,
            hold_duration_sec: hold_duration_sec,
            equipment: equipment
        )
    }

    enum CodingKeys: String, CodingKey {
        case id, exercise_name, type
        case duration_min, reps, sets, rounds
        case load_kg_each, load_unit
        case distance_km, distance_unit
        case work_sec, total_duration_min
        case muscles_utilized, rest_seconds, target_pace
        case hold_duration_sec
        case goals_addressed, reasoning, equipment
        case exercise_description
        case group
    }

    static var sampleExercises: [UIExercise] {
        // Sample using new 4-type system
        let benchPress = UIExercise(
            exercise_name: "Barbell Bench Press",
            type: "reps",
            reps: [10, 10, 8],
            load_kg_each: [40, 40, 45],
            load_unit: "kg",
            sets: 3,
            muscles_utilized: [
                MuscleUtilization(muscle: "Chest", share: 0.5),
                MuscleUtilization(muscle: "Triceps", share: 0.3),
                MuscleUtilization(muscle: "Shoulders", share: 0.2)
            ],
            rest_seconds: 90,
            goals_addressed: [
                GoalUtilization(goal: "strength", share: 0.8),
                GoalUtilization(goal: "hypertrophy", share: 0.2)
            ],
            reasoning: "Compound pushing movement to build chest strength",
            equipment: ["barbell", "bench"]
        )

        let plank = UIExercise(
            exercise_name: "Plank",
            type: "hold",
            sets: 3,
            muscles_utilized: [
                MuscleUtilization(muscle: "Abs", share: 0.6),
                MuscleUtilization(muscle: "Lower Back", share: 0.4)
            ],
            rest_seconds: 30,
            hold_duration_sec: [45, 45, 60],
            goals_addressed: [
                GoalUtilization(goal: "stability", share: 1.0)
            ],
            reasoning: "Core stability exercise"
        )

        let run5k = UIExercise(
            exercise_name: "5K Run",
            type: "duration",
            duration_min: 30,
            distance_km: 5.0,
            distance_unit: "km",
            muscles_utilized: [
                MuscleUtilization(muscle: "Quadriceps", share: 0.3),
                MuscleUtilization(muscle: "Hamstrings", share: 0.25),
                MuscleUtilization(muscle: "Calves", share: 0.25),
                MuscleUtilization(muscle: "Glutes", share: 0.2)
            ],
            target_pace: "6:00/km",
            goals_addressed: [
                GoalUtilization(goal: "endurance", share: 0.7),
                GoalUtilization(goal: "cardio", share: 0.3)
            ],
            reasoning: "Zone 2 cardio for aerobic base"
        )

        let tabata = UIExercise(
            exercise_name: "Tabata Burpees",
            type: "intervals",
            rounds: 8,
            work_sec: 20,
            muscles_utilized: [
                MuscleUtilization(muscle: "Quadriceps", share: 0.25),
                MuscleUtilization(muscle: "Chest", share: 0.25),
                MuscleUtilization(muscle: "Shoulders", share: 0.25),
                MuscleUtilization(muscle: "Abs", share: 0.25)
            ],
            rest_seconds: 10,
            goals_addressed: [
                GoalUtilization(goal: "vo2max", share: 0.6),
                GoalUtilization(goal: "conditioning", share: 0.4)
            ],
            reasoning: "High intensity intervals for metabolic conditioning"
        )

        return [benchPress, plank, run5k, tabata]
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
    HomeView(isDrawerOpen: .constant(false))
}
