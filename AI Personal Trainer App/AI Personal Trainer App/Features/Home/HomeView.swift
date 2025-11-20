//
//  HomeView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/21/25.
//

import SwiftUI

struct HomeView: View {
    @EnvironmentObject var appCoordinator: AppStateCoordinator
    @StateObject private var apiService = APIService()
    @State private var currentExerciseIndex = 0
    @State private var exercises: [UIExercise] = []
    @State private var completedExerciseIds: Set<UUID> = []
    @State private var isLoadingRecommendations = false
    @State private var lastFetchedDate: Date?
    @State private var showRefreshModal = false
    @State private var showCompletionFeedback = false
    @State private var errorMessage: String?
    
    // Swipe and animation states
    @State private var dragOffset: CGFloat = 0
    @State private var showContent: Bool = true
    @State private var isTransitioning: Bool = false
    
    private let cacheExpirationHours: TimeInterval = 4 * 60 * 60 // 4 hours in seconds
    private let swipeThreshold: CGFloat = 50
    
    // Check if all exercises are completed
    private var allExercisesCompleted: Bool {
        !exercises.isEmpty && exercises.allSatisfy { completedExerciseIds.contains($0.id) }
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background layer - Light gray #f5f6f7
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                // Main content layer
                VStack(spacing: 0) {
                    // Header with complete and refresh buttons
                    HStack {
                        // Complete button (left side)
                        if !exercises.isEmpty {
                            Button {
                                let currentExercise = exercises[currentExerciseIndex]
                                if !completedExerciseIds.contains(currentExercise.id) {
                                    completeExercise(currentExercise)
                                }
                            } label: {
                                ZStack {
                                    Circle()
                                        .stroke(Color.white, lineWidth: 2)
                                        .frame(width: 44, height: 44)
                                        .background(
                                            Circle()
                                                .fill(completedExerciseIds.contains(exercises[currentExerciseIndex].id) 
                                                      ? Color.green.opacity(0.3) 
                                                      : Color.clear)
                                        )
                                    
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 20, weight: .medium))
                                        .foregroundColor(.white)
                                }
                                .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                            }
                            .disabled(completedExerciseIds.contains(exercises[currentExerciseIndex].id))
                        }
                        
                        Spacer()
                        
                        // Refresh button (right side)
                        Button {
                            showRefreshModal = true
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 20, weight: .medium))
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .padding(12)
                                .background(AppTheme.Colors.cardBackground)
                                .clipShape(Circle())
                                .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 60) // Safe area top padding
                    
                    Spacer()
                    
                    if isLoadingRecommendations {
                        // Loading state
                        VStack(spacing: 16) {
                            ProgressView()
                                .scaleEffect(1.5)
                            Text("Loading recommendations...")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                    } else if exercises.isEmpty {
                        // Empty state
                        VStack(spacing: 16) {
                            Image(systemName: "figure.strengthtraining.traditional")
                                .font(.system(size: 60))
                                .foregroundColor(.gray)
                            Text("No exercises yet")
                                .font(.title2)
                                .fontWeight(.semibold)
                            Text("Tap refresh to get personalized recommendations")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }
                    } else {
                        // Full-Screen Exercise Display
                        fullScreenExerciseView(for: exercises[currentExerciseIndex])
                    }
                    
                    Spacer()
                    
                    // Dot tracker at bottom
                    if !exercises.isEmpty {
                        ExerciseDotTracker(
                            totalExercises: exercises.count,
                            currentIndex: currentExerciseIndex
                        )
                        .padding(.bottom, 100) // Above nav bar
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
        .onChange(of: appCoordinator.shouldFetchRecommendations) { _, shouldFetch in
            if shouldFetch && exercises.isEmpty {
                Task {
                    await loadRecommendationsIfNeeded()
                }
            }
        }
        .onChange(of: allExercisesCompleted) { _, isAllCompleted in
            if isAllCompleted {
                Task {
                    // Brief delay so user sees the last completion
                    try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds
                    await fetchMoreRecommendations()
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func loadRecommendationsIfNeeded() async {
        // Check if we need to fetch new recommendations
        if let lastFetched = lastFetchedDate {
            let timeElapsed = Date().timeIntervalSince(lastFetched)
            if timeElapsed < cacheExpirationHours && !exercises.isEmpty {
                print("Using cached recommendations")
                return
            }
        }
        
        await fetchRecommendations(feedback: nil)
    }
    
    private func fetchMoreRecommendations() async {
        isLoadingRecommendations = true
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
                    
                    self.exercises.append(uiExercise)
                    print("📊 Exercise \(self.exercises.count) added: \(streamingExercise.exercise_name)")
                },
                onComplete: { totalCount in
                    print("✅ Loaded \(totalCount) more exercises (total: \(self.exercises.count))")
                    self.lastFetchedDate = Date()
                    self.isLoadingRecommendations = false
                    
                    // Auto-scroll to first new uncompleted exercise
                    if let firstNewIdx = self.exercises.indices.suffix(from: startingCount).first(where: {
                        !self.completedExerciseIds.contains(self.exercises[$0].id)
                    }) {
                        self.currentExerciseIndex = firstNewIdx
                    }
                },
                onError: { error in
                    self.errorMessage = error
                    self.isLoadingRecommendations = false
                    print("❌ Error loading exercises: \(error)")
                }
            )
        } catch {
            errorMessage = error.localizedDescription
            isLoadingRecommendations = false
            print("❌ Failed to fetch more recommendations: \(error)")
        }
    }
    
    private func fetchRecommendations(feedback: String?) async {
        isLoadingRecommendations = true
        errorMessage = nil
        
        // Clear existing exercises and completed state (manual refresh)
        exercises = []
        completedExerciseIds = []
        currentExerciseIndex = 0
        
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
                    
                    self.exercises.append(uiExercise)
                    print("📊 Exercise \(self.exercises.count) added: \(streamingExercise.exercise_name)")
                },
                onComplete: { totalCount in
                    print("✅ Loaded \(totalCount) exercises")
                    self.lastFetchedDate = Date()
                    self.isLoadingRecommendations = false
                },
                onError: { error in
                    self.errorMessage = error
                    self.isLoadingRecommendations = false
                    print("❌ Error loading exercises: \(error)")
                }
            )
        } catch {
            errorMessage = error.localizedDescription
            isLoadingRecommendations = false
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
                let exerciseModel = exercise.toExercise()
                
                // Log the exercise
                try await apiService.logCompletedExercise(exercise: exerciseModel)
                
                await MainActor.run {
                    // Add to workout history cache immediately
                    WorkoutHistoryStore.shared.addCompletedExercise(exerciseModel)
                    
                    // Mark as completed
                    completedExerciseIds.insert(exercise.id)
                    
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
                            currentExerciseIndex = nextIdx
                        }
                    }
                }
                
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
        withAnimation(.easeOut(duration: 0.1)) {
            showContent = false
        }
        
        // Wait for fade out, then change index and fade in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            currentExerciseIndex = newIndex
            dragOffset = 0
            
            // Fade in new content
            withAnimation(.easeIn(duration: 0.1)) {
                showContent = true
            }
            
            // Reset transition state
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isTransitioning = false
            }
        }
    }
    
    // MARK: - Exercise View Builder
    
    @ViewBuilder
    private func fullScreenExerciseView(for exercise: UIExercise) -> some View {
        VStack(alignment: .leading, spacing: 40) {
            // Exercise name (title group)
                Text(exercise.exercise_name)
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(.primary)
                .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 32)
                .padding(.top, 20)
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.15), value: showContent)
            
            // Type-specific metrics (metrics group)
            switch exercise.type {
            case "strength":
                StrengthExerciseView(exercise: exercise, showContent: showContent)
            case "cardio_time":
                CardioTimeExerciseView(exercise: exercise, showContent: showContent)
            default:
                // Fallback for unsupported types
                Text("Exercise type: \(exercise.type)")
                            .font(.caption)
                            .foregroundColor(.gray)
                    .padding(.horizontal, 32)
                    .opacity(showContent ? 1 : 0)
                    .offset(y: showContent ? 0 : 20)
                    .animation(.easeOut(duration: 0.4).delay(0.1), value: showContent)
                                }
                                
                                Spacer()
                            }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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


#Preview {
    HomeView()
}
