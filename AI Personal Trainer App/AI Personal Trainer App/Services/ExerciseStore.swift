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
    @Published var workoutHistoryIds: [UUID: String] = [:] // Maps exercise UUID → database record ID
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
            workoutHistoryIds: workoutHistoryIds,
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
            workoutHistoryIds = state.workoutHistoryIds
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
        workoutHistoryIds = [:]
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
    
    /// Complete an exercise and track its database ID
    func markExerciseCompleted(exerciseId: UUID, workoutHistoryId: String) {
        completedExerciseIds.insert(exerciseId)
        workoutHistoryIds[exerciseId] = workoutHistoryId
        saveState()
    }
    
    /// Uncomplete an exercise
    func markExerciseUncompleted(exerciseId: UUID) {
        completedExerciseIds.remove(exerciseId)
        workoutHistoryIds.removeValue(forKey: exerciseId)
        saveState()
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
}

// MARK: - Persisted State Model

struct PersistedWorkoutState: Codable {
    let exercises: [UIExercise]
    let completedExerciseIds: [UUID]
    let workoutHistoryIds: [UUID: String]
    let completedSetsPerExercise: [UUID: [Int]]
    let adjustedRepsPerExercise: [UUID: [Int]]
    let adjustedWeightsPerExercise: [UUID: [Int]]
    let currentExerciseIndex: Int
    let fetchedAt: Date
}

