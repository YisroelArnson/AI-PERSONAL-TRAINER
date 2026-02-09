//
//  ExerciseStore.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/30/25.
//

import Foundation
import SwiftUI

/// Centralized store for exercise persistence with smart auto-refresh
/// Persists exercises to UserDefaults and respects user-configurable refresh settings
@MainActor
class ExerciseStore: ObservableObject {
    // MARK: - Singleton
    
    static let shared = ExerciseStore()
    
    // MARK: - Published Properties
    
    @Published var exercises: [UIExercise] = []
    @Published var completedExerciseIds: Set<UUID> = []
    @Published var currentExerciseIndex: Int = 0
    
    // Per-exercise set tracking (keyed by exercise UUID)
    @Published var completedSetsPerExercise: [UUID: Set<Int>] = [:]
    @Published var adjustedRepsPerExercise: [UUID: [Int]] = [:]
    @Published var adjustedWeightsPerExercise: [UUID: [Int]] = [:]
    
    // Timestamp of when exercises were last fetched
    @Published var fetchedAt: Date?
    
    // Flag to signal that exercises need refresh (e.g., unit settings changed)
    @Published var needsRefresh: Bool = false
    
    // MARK: - Private Properties
    
    private let userDefaultsKey = "persistedWorkoutState"
    
    // MARK: - Initialization
    
    private init() {
        loadState()
    }
    
    // MARK: - Computed Properties
    
    /// Determines if new exercises should be fetched based on user settings
    var shouldFetchNewExercises: Bool {
        // If no exercises exist, definitely need to fetch
        guard !exercises.isEmpty else {
            print("📦 ExerciseStore: No exercises - should fetch new")
            return true
        }
        
        // If auto-refresh is disabled, never auto-fetch (user resumes where they left off)
        guard UserSettings.shared.isAutoRefreshExercisesEnabled else {
            print("📦 ExerciseStore: Auto-refresh disabled - resuming existing exercises")
            return false
        }
        
        // Check if the specified hours have passed since last fetch
        guard let fetchedAt = fetchedAt else {
            print("📦 ExerciseStore: No fetch timestamp - should fetch new")
            return true
        }
        
        let hoursSinceFetch = Date().timeIntervalSince(fetchedAt) / 3600
        let refreshThreshold = Double(UserSettings.shared.autoRefreshExercisesHours)
        
        if hoursSinceFetch >= refreshThreshold {
            print("📦 ExerciseStore: \(String(format: "%.1f", hoursSinceFetch)) hours since fetch (threshold: \(refreshThreshold)h) - should fetch new")
            return true
        } else {
            print("📦 ExerciseStore: \(String(format: "%.1f", hoursSinceFetch)) hours since fetch (threshold: \(refreshThreshold)h) - resuming existing")
            return false
        }
    }
    
    /// Check if all exercises are completed
    var allExercisesCompleted: Bool {
        !exercises.isEmpty && exercises.allSatisfy { completedExerciseIds.contains($0.id) }
    }
    
    // MARK: - State Persistence
    
    /// Save the current workout state to UserDefaults
    func saveState() {
        let state = PersistedWorkoutState(
            exercises: exercises,
            completedExerciseIds: Array(completedExerciseIds),
            completedSetsPerExercise: completedSetsPerExercise.mapValues { Array($0) },
            adjustedRepsPerExercise: adjustedRepsPerExercise,
            adjustedWeightsPerExercise: adjustedWeightsPerExercise,
            currentExerciseIndex: currentExerciseIndex,
            fetchedAt: fetchedAt ?? Date()
        )
        
        do {
            let data = try JSONEncoder().encode(state)
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
            print("💾 ExerciseStore: Saved \(exercises.count) exercises to UserDefaults")
        } catch {
            print("❌ ExerciseStore: Failed to save state: \(error)")
        }
    }
    
    /// Load the workout state from UserDefaults
    func loadState() {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey) else {
            print("📦 ExerciseStore: No persisted state found")
            return
        }
        
        do {
            let state = try JSONDecoder().decode(PersistedWorkoutState.self, from: data)
            
            exercises = state.exercises
            completedExerciseIds = Set(state.completedExerciseIds)
            completedSetsPerExercise = state.completedSetsPerExercise.mapValues { Set($0) }
            adjustedRepsPerExercise = state.adjustedRepsPerExercise
            adjustedWeightsPerExercise = state.adjustedWeightsPerExercise
            currentExerciseIndex = min(state.currentExerciseIndex, max(0, exercises.count - 1))
            fetchedAt = state.fetchedAt
            
            print("📦 ExerciseStore: Loaded \(exercises.count) exercises from UserDefaults (fetched: \(state.fetchedAt))")
        } catch {
            print("❌ ExerciseStore: Failed to load state: \(error)")
            // Clear corrupted data
            clearExercises()
        }
    }
    
    /// Clear all exercises and related state
    func clearExercises() {
        exercises = []
        completedExerciseIds = []
        currentExerciseIndex = 0
        completedSetsPerExercise = [:]
        adjustedRepsPerExercise = [:]
        adjustedWeightsPerExercise = [:]
        fetchedAt = nil
        
        // Remove from UserDefaults
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
        
        print("🗑️ ExerciseStore: Cleared all exercises")
    }
    
    // MARK: - Exercise Management
    
    /// Add a new exercise (typically from streaming)
    func addExercise(_ exercise: UIExercise) {
        exercises.append(exercise)
        saveState()
    }
    
    /// Mark the fetch timestamp (call when starting to fetch new exercises)
    func markFetchStarted() {
        fetchedAt = Date()
        needsRefresh = false // Clear the refresh flag when fetch starts
    }
    
    /// Signal that exercises need to be refreshed (e.g., unit settings changed)
    func triggerRefresh() {
        clearExercises()
        needsRefresh = true
        print("🔄 ExerciseStore: Refresh triggered")
    }
    
    /// Update the current exercise index
    func setCurrentIndex(_ index: Int) {
        currentExerciseIndex = max(0, min(index, exercises.count - 1))
        saveState()
    }
    
    /// Update completed sets for an exercise
    func updateCompletedSets(exerciseId: UUID, sets: Set<Int>) {
        completedSetsPerExercise[exerciseId] = sets
        saveState()
    }
    
    /// Update adjusted reps for an exercise
    func updateAdjustedReps(exerciseId: UUID, reps: [Int]) {
        adjustedRepsPerExercise[exerciseId] = reps
        saveState()
    }
    
    /// Update adjusted weights for an exercise
    func updateAdjustedWeights(exerciseId: UUID, weights: [Int]) {
        adjustedWeightsPerExercise[exerciseId] = weights
        saveState()
    }
    
    // MARK: - Agent Context

    /// Creates a payload representing the current workout session for the agent API
    /// Uses the 4-type exercise system: reps, hold, duration, intervals
    /// Returns nil if there are no exercises
    func getCurrentWorkoutPayload() -> CurrentWorkoutPayload? {
        guard !exercises.isEmpty else { return nil }

        let exercisePayloads = exercises.map { exercise -> WorkoutExercisePayload in
            let isCompleted = completedExerciseIds.contains(exercise.id)

            // Convert Int? to Double? for duration_min
            let durationMinDouble: Double? = exercise.duration_min != nil ? Double(exercise.duration_min!) : nil

            return WorkoutExercisePayload(
                name: exercise.exercise_name,
                type: exercise.type,
                completed: isCompleted,
                sets: exercise.sets,
                reps: exercise.reps,
                loadEach: exercise.load_kg_each,
                loadUnit: exercise.load_unit,
                holdSec: exercise.hold_duration_sec,
                durationMin: durationMinDouble,
                distance: exercise.distance_km,
                distanceUnit: exercise.distance_unit,
                rounds: exercise.rounds,
                workSec: exercise.work_sec,
                restSec: exercise.rest_seconds
            )
        }

        let totalCompleted = completedExerciseIds.count

        return CurrentWorkoutPayload(
            exercises: exercisePayloads,
            currentIndex: currentExerciseIndex,
            totalCompleted: totalCompleted
        )
    }

    // MARK: - Artifact Loading

    /// Load exercises from an artifact, replacing the current workout
    /// - Parameter artifact: The artifact containing exercise data
    func loadFromArtifact(_ artifact: Artifact) {
        guard let artifactExercises = artifact.payload.exercises else {
            print("⚠️ ExerciseStore: Artifact has no exercises")
            return
        }

        // Clear current state and load new exercises
        clearExercises()

        // Convert ArtifactExercise to UIExercise
        exercises = artifactExercises.map { convertToUIExercise($0) }
        fetchedAt = Date()
        currentExerciseIndex = 0

        saveState()
        print("📦 ExerciseStore: Loaded \(exercises.count) exercises from artifact \(artifact.artifactId)")
    }

    /// Add exercises from an artifact to the current workout
    /// - Parameter artifact: The artifact containing exercise data
    func addFromArtifact(_ artifact: Artifact) {
        guard let artifactExercises = artifact.payload.exercises else {
            print("⚠️ ExerciseStore: Artifact has no exercises")
            return
        }

        // Convert and append exercises
        let newExercises = artifactExercises.map { convertToUIExercise($0) }
        exercises.append(contentsOf: newExercises)

        saveState()
        print("📦 ExerciseStore: Added \(newExercises.count) exercises from artifact \(artifact.artifactId)")
    }

    /// Convert an ArtifactExercise to UIExercise
    /// Uses the 4-type exercise system: reps, hold, duration, intervals
    private func convertToUIExercise(_ artifact: ArtifactExercise) -> UIExercise {
        // Convert duration_min from Double? to Int?
        let durationMinInt: Int? = artifact.durationMin != nil ? Int(artifact.durationMin!) : nil

        return UIExercise(
            exercise_name: artifact.exerciseName,
            type: artifact.exerciseType,
            duration_min: durationMinInt,
            reps: artifact.reps,
            load_kg_each: artifact.loadEach,    // load_each -> load_kg_each
            load_unit: artifact.loadUnit,
            sets: artifact.sets,
            distance_km: artifact.distance,      // distance -> distance_km
            distance_unit: artifact.distanceUnit,
            rounds: artifact.rounds,
            work_sec: artifact.workSec,
            muscles_utilized: artifact.musclesUtilized,
            rest_seconds: artifact.restSec,      // rest_sec -> rest_seconds
            target_pace: artifact.targetPace,
            hold_duration_sec: artifact.holdSec, // hold_sec -> hold_duration_sec
            goals_addressed: artifact.goalsAddressed,
            reasoning: artifact.reasoning,
            equipment: artifact.equipment,
            exercise_description: artifact.exerciseDescription,
            group: artifact.group
        )
    }
}

// MARK: - Persisted State Model

struct PersistedWorkoutState: Codable {
    let exercises: [UIExercise]
    let completedExerciseIds: [UUID]
    let completedSetsPerExercise: [UUID: [Int]]
    let adjustedRepsPerExercise: [UUID: [Int]]
    let adjustedWeightsPerExercise: [UUID: [Int]]
    let currentExerciseIndex: Int
    let fetchedAt: Date
}

