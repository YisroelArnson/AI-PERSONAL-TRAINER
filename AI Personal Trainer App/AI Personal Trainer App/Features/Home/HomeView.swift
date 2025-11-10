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
    
    private let cacheExpirationHours: TimeInterval = 4 * 60 * 60 // 4 hours in seconds
    
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
                    // Header with refresh button
                    HStack {
                        Spacer()
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
                            Text("Pull down to refresh and get personalized recommendations")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }
                    } else {
                        // Exercise Carousel
                        ExerciseCarouselView(
                            exercises: exercises,
                            currentIndex: $currentExerciseIndex,
                            completedExerciseIds: completedExerciseIds,
                            onComplete: { exercise in
                                completeExercise(exercise)
                            }
                        )
                    }
                    
                    Spacer()
                }
                
                // Completion feedback overlay - floating on top
                if showCompletionFeedback {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Exercise completed!")
                                .fontWeight(.medium)
                        }
                        .padding()
                        .background(.ultraThinMaterial)
                        .cornerRadius(12)
                        .shadow(color: Color.black.opacity(0.2), radius: 8, x: 0, y: 4)
                        .padding(.bottom, 120) // Position above the floating nav bar
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                
                // Loading state overlay - shows during app initialization
                if !appCoordinator.isReady {
                    LoadingStateView(state: appCoordinator.loadingState)
                        .transition(.opacity)
                }
            }
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
                // Log the exercise
                try await apiService.logCompletedExercise(exercise: exercise.toExercise())
                
                await MainActor.run {
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
    
}

// MARK: - Supporting Views

struct TrainerOrbView: View {
    @State private var isAnimating = false
    
    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(
                    gradient: Gradient(colors: [Color.blue.opacity(0.3), Color.purple.opacity(0.3)]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 50, height: 50)
                .scaleEffect(isAnimating ? 1.2 : 1.0)
                .opacity(isAnimating ? 0.7 : 1.0)
            
            Circle()
                .fill(LinearGradient(
                    gradient: Gradient(colors: [Color.blue, Color.purple]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 40, height: 40)
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
            
            Circle()
                .fill(LinearGradient(
                    gradient: Gradient(colors: [Color.white.opacity(0.6), Color.clear]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 20, height: 20)
                .offset(x: -5, y: -5)
        }
        .onAppear {
            withAnimation(Animation.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isAnimating = true
            }
        }
    }
}

struct ExerciseCarouselView: View {
    let exercises: [UIExercise]
    @Binding var currentIndex: Int
    let completedExerciseIds: Set<UUID>
    var onComplete: ((UIExercise) -> Void)?
    
    @State private var scrollTimer: Timer?
    @State private var isUserScrolling = false
    
    private let cardHeight: CGFloat = 280
    private let cardSpacing: CGFloat = 8
    
    var body: some View {
        GeometryReader { geometry in
            let centerY = geometry.size.height / 2
            
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: cardSpacing) {
                        ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                            GeometryReader { cardGeometry in
                                let cardCenterY = cardGeometry.frame(in: .named("scroll")).midY
                                let distanceFromCenter = abs(cardCenterY - centerY)
                                let normalizedDistance = min(distanceFromCenter / (cardHeight + cardSpacing), 1.0)
                                
                                let scale = 1.0 - (normalizedDistance * 0.15) // Scale from 1.0 to 0.85
                                let opacity = 1.0 - (normalizedDistance * 0.3) // Opacity from 1.0 to 0.7
                                
                                ExerciseCardView(
                                    exercise: exercise,
                                    isCurrent: index == currentIndex,
                                    isCompleted: completedExerciseIds.contains(exercise.id),
                                    onComplete: onComplete
                                )
                                .scaleEffect(scale)
                                .opacity(opacity)
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                                        currentIndex = index
                                        proxy.scrollTo(exercise.id, anchor: .center)
                                    }
                                }
                                .onChange(of: cardCenterY) { _, _ in
                                    // Detect user scrolling and start snap timer
                                    isUserScrolling = true
                                    scrollTimer?.invalidate()
                                    
                                    // Update current index to the card closest to center
                                    if distanceFromCenter < (cardHeight + cardSpacing) / 2 {
                                        if currentIndex != index {
                                            currentIndex = index
                                        }
                                    }
                                    
                                    // Set timer to snap to nearest card when scrolling stops
                                    scrollTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: false) { _ in
                                        isUserScrolling = false
                                        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                                            proxy.scrollTo(exercises[currentIndex].id, anchor: .center)
                                        }
                                    }
                                }
                                .onChange(of: currentIndex) { _, newIndex in
                                    if !isUserScrolling && newIndex == index {
                                        withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                                            proxy.scrollTo(exercise.id, anchor: .center)
                                        }
                                    }
                                }
                            }
                            .frame(height: cardHeight)
                            .id(exercise.id)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, geometry.size.height / 2 - cardHeight / 2) // Center the content
                }
                .coordinateSpace(name: "scroll")
                .onAppear {
                    // Scroll to current index on appear
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        if currentIndex < exercises.count {
                            proxy.scrollTo(exercises[currentIndex].id, anchor: .center)
                        }
                    }
                }
            }
        }
        .frame(height: 450) // Set a fixed height for the carousel
        .clipped()
    }
}

// MARK: - Type-Specific Metric Display Components

struct StrengthMetricsDisplay: View {
    let sets: Int
    let reps: [Int]
    let loads: [Double]
    let restSeconds: Int?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Sets display
            HStack(spacing: 6) {
                ForEach(0..<min(sets, reps.count, loads.count), id: \.self) { index in
                    VStack(spacing: 2) {
                        Text("Set \(index + 1)")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        HStack(spacing: 3) {
                            Text("\(reps[index])")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(AppTheme.Colors.primaryText)
                            Text("×")
                                .font(.caption)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                            Text("\(Int(loads[index]))kg")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(AppTheme.Colors.primaryText.opacity(0.05))
                    .cornerRadius(8)
                }
            }
            
            if let rest = restSeconds {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("Rest: \(rest)s between sets")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                }
            }
        }
    }
}

struct CardioDistanceMetricsDisplay: View {
    let distance: Double
    let duration: Int?
    let targetPace: String?
    
    var body: some View {
        HStack(spacing: 12) {
            // Distance
            VStack(alignment: .leading, spacing: 2) {
                Text("DISTANCE")
                    .font(.caption2)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                Text(String(format: "%.1f km", distance))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
            
            if let duration = duration {
                Divider()
                    .frame(height: 30)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("TIME")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(duration) min")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            
            if let pace = targetPace {
                Divider()
                    .frame(height: 30)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("PACE")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text(pace)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct CardioTimeMetricsDisplay: View {
    let duration: Int
    let targetIntensity: String?
    
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("DURATION")
                    .font(.caption2)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                Text("\(duration) min")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
            
            if let intensity = targetIntensity {
                Divider()
                    .frame(height: 30)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("INTENSITY")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text(intensity.capitalized)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct HIITMetricsDisplay: View {
    let rounds: Int
    let intervals: [ExerciseInterval]
    let totalDuration: Int?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ROUNDS")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(rounds)")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                
                if let total = totalDuration {
                    Divider()
                        .frame(height: 30)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("TOTAL")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        Text("\(total) min")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }
            
            if !intervals.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "timer")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    if let work = intervals.first?.work_sec, let rest = intervals.first?.rest_sec {
                        Text("\(work)s work / \(rest)s rest")
                            .font(.caption)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                    }
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct CircuitMetricsDisplay: View {
    let circuits: Int
    let exercisesInCircuit: [CircuitExercise]
    let restBetweenCircuits: Int
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("CIRCUITS")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(circuits)")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                
                Divider()
                    .frame(height: 30)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("REST")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(restBetweenCircuits)s")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            
            VStack(alignment: .leading, spacing: 3) {
                Text("Circuit:")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                ForEach(exercisesInCircuit.indices, id: \.self) { index in
                    HStack(spacing: 4) {
                        Text("•")
                        Text(exercisesInCircuit[index].name)
                            .font(.caption)
                        if let reps = exercisesInCircuit[index].reps {
                            Text("(\(reps) reps)")
                                .font(.caption2)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        } else if let duration = exercisesInCircuit[index].duration_sec {
                            Text("(\(duration)s)")
                                .font(.caption2)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        }
                    }
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct FlexibilityMetricsDisplay: View {
    let holds: [FlexibilityHold]
    let repetitions: Int?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let reps = repetitions {
                HStack(spacing: 4) {
                    Text("REPETITIONS:")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(reps)")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                ForEach(holds.indices, id: \.self) { index in
                    HStack(spacing: 8) {
                        Text(holds[index].position)
                            .font(.caption)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Spacer()
                        Text("\(holds[index].duration_sec)s")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(AppTheme.Colors.primaryText.opacity(0.05))
                    .cornerRadius(6)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct YogaMetricsDisplay: View {
    let sequence: [YogaPose]
    let totalDuration: Int
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("TOTAL:")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                Text("\(totalDuration) min")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text("Flow:")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                ForEach(sequence.indices.prefix(3), id: \.self) { index in
                    HStack(spacing: 4) {
                        Text("•")
                        Text(sequence[index].pose)
                            .font(.caption)
                        if let breaths = sequence[index].breaths {
                            Text("(\(breaths) breaths)")
                                .font(.caption2)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        } else if let duration = sequence[index].duration_sec {
                            Text("(\(duration)s)")
                                .font(.caption2)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        }
                    }
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
                }
                if sequence.count > 3 {
                    Text("+ \(sequence.count - 3) more poses")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct BodyweightMetricsDisplay: View {
    let sets: Int
    let reps: [Int]
    let restSeconds: Int?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(0..<min(sets, reps.count), id: \.self) { index in
                    VStack(spacing: 2) {
                        Text("Set \(index + 1)")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        Text("\(reps[index])")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Text("reps")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(AppTheme.Colors.primaryText.opacity(0.05))
                    .cornerRadius(8)
                }
            }
            
            if let rest = restSeconds {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("Rest: \(rest)s between sets")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                }
            }
        }
    }
}

struct IsometricMetricsDisplay: View {
    let sets: Int
    let holdDurations: [Int]
    let restSeconds: Int?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(0..<min(sets, holdDurations.count), id: \.self) { index in
                    VStack(spacing: 2) {
                        Text("Set \(index + 1)")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        Text("\(holdDurations[index])s")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Text("hold")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(AppTheme.Colors.primaryText.opacity(0.05))
                    .cornerRadius(8)
                }
            }
            
            if let rest = restSeconds {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("Rest: \(rest)s between sets")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                }
            }
        }
    }
}

struct BalanceMetricsDisplay: View {
    let sets: Int
    let holdDurations: [Int]
    
    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<min(sets, holdDurations.count), id: \.self) { index in
                VStack(spacing: 2) {
                    Text("Set \(index + 1)")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(holdDurations[index])s")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Text("hold")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(AppTheme.Colors.primaryText.opacity(0.05))
                .cornerRadius(8)
            }
        }
        .padding(.vertical, 6)
    }
}

struct SportSpecificMetricsDisplay: View {
    let sport: String
    let drillName: String
    let duration: Int
    let repetitions: Int?
    let skillFocus: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(sport.uppercased())
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text(drillName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("DURATION")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                    Text("\(duration) min")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            
            HStack(spacing: 12) {
                if let reps = repetitions {
                    HStack(spacing: 4) {
                        Image(systemName: "repeat")
                            .font(.caption2)
                        Text("\(reps) reps")
                            .font(.caption)
                    }
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                }
                
                HStack(spacing: 4) {
                    Image(systemName: "target")
                        .font(.caption2)
                    Text("Focus: \(skillFocus)")
                        .font(.caption)
                }
                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
            }
        }
        .padding(.vertical, 6)
    }
}

struct ExerciseCardView: View {
    let exercise: UIExercise
    let isCurrent: Bool
    let isCompleted: Bool
    var onComplete: ((UIExercise) -> Void)?
    
    @State private var isCompleting = false
    @State private var showReasoning = false
    
    // Function to get color for exercise type
    private func colorForExerciseType(_ type: String) -> Color {
        switch type {
        case "strength":
            return Color.orange
        case "cardio_distance", "cardio_time":
            return Color.blue
        case "hiit":
            return Color.red
        case "circuit":
            return Color.red.opacity(0.8)
        case "bodyweight":
            return Color.green
        case "isometric":
            return Color.purple
        case "flexibility", "stretching":
            return Color.pink
        case "yoga", "pilates":
            return Color.mint
        case "balance":
            return Color.indigo
        case "sport_specific":
            return Color.teal
        default:
            return Color.blue
        }
    }
    
    @ViewBuilder
    private var metricsDisplay: some View {
        switch exercise.type {
        case "strength":
            if let sets = exercise.sets, let reps = exercise.reps, let loads = exercise.load_kg_each {
                StrengthMetricsDisplay(sets: sets, reps: reps, loads: loads, restSeconds: exercise.rest_seconds)
            }
            
        case "cardio_distance":
            if let distance = exercise.distance_km {
                CardioDistanceMetricsDisplay(distance: distance, duration: exercise.duration_min, targetPace: exercise.target_pace)
            }
            
        case "cardio_time":
            if let duration = exercise.duration_min {
                CardioTimeMetricsDisplay(duration: duration, targetIntensity: exercise.target_intensity)
            }
            
        case "hiit":
            if let rounds = exercise.rounds, let intervals = exercise.intervals {
                HIITMetricsDisplay(rounds: rounds, intervals: intervals, totalDuration: exercise.total_duration_min)
            }
            
        case "circuit":
            if let circuits = exercise.circuits, let exercisesInCircuit = exercise.exercises_in_circuit, let restBetweenCircuits = exercise.rest_between_circuits_sec {
                CircuitMetricsDisplay(circuits: circuits, exercisesInCircuit: exercisesInCircuit, restBetweenCircuits: restBetweenCircuits)
            }
            
        case "flexibility":
            if let holds = exercise.holds {
                FlexibilityMetricsDisplay(holds: holds, repetitions: exercise.repetitions)
            }
            
        case "yoga":
            if let sequence = exercise.sequence, let totalDuration = exercise.total_duration_min {
                YogaMetricsDisplay(sequence: sequence, totalDuration: totalDuration)
            }
            
        case "bodyweight":
            if let sets = exercise.sets, let reps = exercise.reps {
                BodyweightMetricsDisplay(sets: sets, reps: reps, restSeconds: exercise.rest_seconds)
            }
            
        case "isometric":
            if let sets = exercise.sets, let holdDurations = exercise.hold_duration_sec {
                IsometricMetricsDisplay(sets: sets, holdDurations: holdDurations, restSeconds: exercise.rest_seconds)
            }
            
        case "balance":
            if let sets = exercise.sets, let holdDurations = exercise.hold_duration_sec {
                BalanceMetricsDisplay(sets: sets, holdDurations: holdDurations)
            }
            
        case "sport_specific":
            if let sport = exercise.sport, let drillName = exercise.drill_name, let duration = exercise.duration_min, let skillFocus = exercise.skill_focus {
                SportSpecificMetricsDisplay(sport: sport, drillName: drillName, duration: duration, repetitions: exercise.repetitions, skillFocus: skillFocus)
            }
            
        default:
            Text("Workout details unavailable")
                .font(.caption)
                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
        }
    }
    
    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 12) {
                // Exercise type badge or completed badge
                HStack {
                    if isCompleted {
                        // Completed badge
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption2)
                            Text("COMPLETED")
                        }
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.green)
                        .cornerRadius(8)
                    } else {
                        // Exercise type badge
                        Text(exercise.type.replacingOccurrences(of: "_", with: " ").uppercased())
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(colorForExerciseType(exercise.type))
                            .cornerRadius(8)
                    }
                    
                    Spacer()
                    
                    // Body region badge
                    if let bodyRegion = exercise.body_region {
                        Text(bodyRegion.capitalized)
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(AppTheme.Colors.primaryText.opacity(0.08))
                            .cornerRadius(6)
                    }
                }
                
                // Exercise name - most prominent
                Text(exercise.exercise_name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                
                // Type-specific metrics display
                metricsDisplay
                
                // Equipment badges
                if let equipment = exercise.equipment, !equipment.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            Image(systemName: "figure.strengthtraining.traditional")
                                .font(.caption2)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                            ForEach(equipment, id: \.self) { item in
                                Text(item)
                                    .font(.caption)
                                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(AppTheme.Colors.primaryText.opacity(0.05))
                                    .cornerRadius(6)
                            }
                        }
                    }
                }
                
                // Primary muscles
                if let muscles = exercise.muscles_utilized?.sorted(by: { $0.share > $1.share }).prefix(3) {
                    HStack(spacing: 6) {
                        Image(systemName: "figure.arms.open")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                        ForEach(Array(muscles), id: \.muscle) { muscle in
                            HStack(spacing: 3) {
                                Text(muscle.muscle.capitalized)
                                    .font(.caption)
                                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                                Text("\(Int(muscle.share * 100))%")
                                    .font(.caption2)
                                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.4))
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(colorForExerciseType(exercise.type).opacity(0.1))
                            .cornerRadius(6)
                        }
                    }
                }
                
                // Goals addressed
                if let goals = exercise.goals_addressed, !goals.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            Image(systemName: "target")
                                .font(.caption2)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                            ForEach(goals.prefix(2), id: \.self) { goal in
                                Text(goal)
                                    .font(.caption)
                                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(AppTheme.Colors.primaryText.opacity(0.05))
                                    .cornerRadius(6)
                            }
                        }
                    }
                }
                
                // Expandable reasoning section
                if let reasoning = exercise.reasoning, !reasoning.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Button(action: {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                showReasoning.toggle()
                            }
                        }) {
                            HStack(spacing: 4) {
                                Text("Why this exercise?")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                                Image(systemName: showReasoning ? "chevron.up" : "chevron.down")
                                    .font(.caption2)
                                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                            }
                        }
                        
                        if showReasoning {
                            Text(reasoning)
                                .font(.caption)
                                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
                                .fixedSize(horizontal: false, vertical: true)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(16)
            .padding(.trailing, isCompleted ? 16 : 50) // Less padding if completed (no button)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(20)
            .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 5)
            .opacity(isCompleted ? 0.6 : 1.0) // Dim completed exercises
            
            // Completion button (only show if current and not completed)
            if isCurrent && !isCompleted {
                Button {
                    if !isCompleting {
                        isCompleting = true
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                            onComplete?(exercise)
                        }
                    }
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color.green.opacity(isCompleting ? 0.2 : 1.0))
                            .frame(width: 44, height: 44)
                        
                        if isCompleting {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .green))
                        } else {
                            Image(systemName: "checkmark")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                }
                .disabled(isCompleting)
                .padding(16)
            }
        }
    }
}

struct StatPillView: View {
    let label: String
    let value: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.gray)
            Text(value)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.gray.opacity(0.3))
        .cornerRadius(0)
    }
}

// MARK: - Full Exercise Details

struct FullExerciseDetailsView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch exercise.type {
            case "strength":
                if let loads = exercise.load_kg_each, !loads.isEmpty {
                    DetailRowView(
                        label: "Weight (kg)",
                        value: loads.map { "\(Int($0))" }.joined(separator: ", "),
                        icon: "dumbbell"
                    )
                }
                
                if let rest = exercise.rest_seconds {
                    DetailRowView(
                        label: "Rest",
                        value: "\(rest) seconds",
                        icon: "clock"
                    )
                }
                
            case "cardio_distance":
                if let pace = exercise.target_pace {
                    DetailRowView(
                        label: "Target Pace",
                        value: pace,
                        icon: "speedometer"
                    )
                }
                
            case "cardio_time":
                // Additional details already shown in stats pills
                EmptyView()
                
            case "hiit":
                if let intervals = exercise.intervals, !intervals.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Intervals")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.gray)
                        
                        ForEach(intervals.indices, id: \.self) { index in
                            let interval = intervals[index]
                            HStack {
                                Text("Round \(index + 1):")
                                    .font(.caption2)
                                    .foregroundColor(.gray)
                                
                                if let work = interval.work_sec {
                                    Text("Work \(work)s")
                                        .font(.caption2)
                                        .fontWeight(.medium)
                                }
                                
                                if let rest = interval.rest_sec {
                                    Text("Rest \(rest)s")
                                        .font(.caption2)
                                        .fontWeight(.medium)
                                }
                                
                                Spacer()
                            }
                        }
                    }
                }
                
            case "bodyweight", "isometric":
                if let holds = exercise.hold_duration_sec, !holds.isEmpty {
                    DetailRowView(
                        label: "Hold Duration",
                        value: holds.map { "\($0)s" }.joined(separator: ", "),
                        icon: "timer"
                    )
                }
                
                if let level = exercise.progression_level {
                    DetailRowView(
                        label: "Level",
                        value: level,
                        icon: "chart.line.uptrend.xyaxis"
                    )
                }
                
            default:
                EmptyView()
            }
        }
    }
}

struct DetailRowView: View {
    let label: String
    let value: String
    let icon: String
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(.gray)
                .frame(width: 12)
            
            Text(label)
                .font(.caption)
                .foregroundColor(.gray)
            
            Spacer()
            
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.white)
        }
    }
}

// MARK: - Exercise Type Views

struct StrengthExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sets = exercise.sets {
                Text("\(sets) sets")
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            
            if let reps = exercise.reps, let loads = exercise.load_kg_each {
                HStack {
                    Text("Reps:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(reps.map { "\($0)" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
                
                HStack {
                    Text("Weight:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(loads.map { "\(Int($0))kg" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let rest = exercise.rest_seconds {
                HStack {
                    Text("Rest:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(rest)s")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct CardioDistanceView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let distance = exercise.distance_km {
                HStack {
                    Text("Distance:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(String(format: "%.1f", distance) + "km")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            
            if let duration = exercise.duration_min, duration > 0 {
                HStack {
                    Text("Duration:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let pace = exercise.target_pace {
                HStack {
                    Text("Target Pace:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(pace)
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct CardioTimeView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let duration = exercise.duration_min {
                HStack {
                    Text("Duration:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            
            if let intensity = exercise.target_intensity {
                HStack {
                    Text("Intensity:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(intensity)
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct HIITExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let rounds = exercise.rounds {
                HStack {
                    Text("Rounds:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(rounds)")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            
            if let intervals = exercise.intervals {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Intervals:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    
                    ForEach(intervals.indices, id: \.self) { index in
                        let interval = intervals[index]
                        HStack {
                            if let work = interval.work_sec {
                                Text("Work: \(work)s")
                                    .font(.caption)
                                    .fontWeight(.medium)
                            }
                            if let rest = interval.rest_sec {
                                Text("Rest: \(rest)s")
                                    .font(.caption)
                                    .fontWeight(.medium)
                            }
                        }
                    }
                }
            }
            
            if let duration = exercise.duration_min {
                HStack {
                    Text("Total:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct BodyweightExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sets = exercise.sets {
                Text("\(sets) sets")
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            
            if let reps = exercise.reps {
                HStack {
                    Text("Reps:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(reps.map { "\($0)" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let holds = exercise.hold_duration_sec {
                HStack {
                    Text("Hold:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(holds.map { "\($0)s" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let level = exercise.progression_level {
                HStack {
                    Text("Level:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(level)
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct GeneralExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let duration = exercise.duration_min, duration > 0 {
                HStack {
                    Text("Duration:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct MuscleUtilizationView: View {
    let muscles: [MuscleUtilization]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Muscles:")
                .font(.caption)
                .foregroundColor(.gray)
            
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 4) {
                ForEach(muscles.sorted(by: { $0.share > $1.share }), id: \.muscle) { muscle in
                    HStack(spacing: 4) {
                        Text(muscle.muscle.capitalized)
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                        Text("\(Int(muscle.share * 100))%")
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.gray.opacity(0.3))
                    .cornerRadius(0)
                }
            }
        }
    }
}

struct LocationView: View {
    let location: LocationInfo
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Location Settings")
                    .font(.title)
                Text(location.name)
                    .font(.headline)
                Spacer()
            }
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
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
    let goals_addressed: [String]?
    let reasoning: String?
    let equipment: [String]?
    let movement_pattern: [String]?
    let exercise_description: String?
    let body_region: String?
    
    // Custom initializer to generate UUID
    init(exercise_name: String, type: String, aliases: [String]? = nil, duration_min: Int? = nil, reps: [Int]? = nil, load_kg_each: [Double]? = nil, sets: Int? = nil, distance_km: Double? = nil, intervals: [ExerciseInterval]? = nil, rounds: Int? = nil, muscles_utilized: [MuscleUtilization]? = nil, rest_seconds: Int? = nil, target_pace: String? = nil, target_intensity: String? = nil, hold_duration_sec: [Int]? = nil, progression_level: String? = nil, circuits: Int? = nil, exercises_in_circuit: [CircuitExercise]? = nil, rest_between_circuits_sec: Int? = nil, holds: [FlexibilityHold]? = nil, repetitions: Int? = nil, sequence: [YogaPose]? = nil, total_duration_min: Int? = nil, sport: String? = nil, drill_name: String? = nil, skill_focus: String? = nil, goals_addressed: [String]? = nil, reasoning: String? = nil, equipment: [String]? = nil, movement_pattern: [String]? = nil, exercise_description: String? = nil, body_region: String? = nil) {
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
