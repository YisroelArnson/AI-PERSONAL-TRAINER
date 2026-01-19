//
//  WorkoutHistoryStore.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/20/25.
//

import Foundation
import SwiftUI
import Supabase

/// Centralized store for workout history with smart caching
/// Fetches data on app launch and provides in-memory access
@MainActor
class WorkoutHistoryStore: ObservableObject {
    // MARK: - Published Properties
    
    @Published var workoutHistory: [WorkoutHistoryItem] = []
    @Published var oldestFetchedDate: Date?
    @Published var isLoading: Bool = false
    @Published var error: Error?
    
    // MARK: - Singleton
    
    static let shared = WorkoutHistoryStore()
    
    private init() {}
    
    // MARK: - Initial Data Loading
    
    /// Load initial workout history (last 30 days) on app launch
    func loadInitialHistory() async {
        isLoading = true
        error = nil
        
        let calendar = Calendar.current
        let today = Date()
        let thirtyDaysAgo = calendar.date(byAdding: .day, value: -30, to: today) ?? today
        
        print("📥 WorkoutHistoryStore: Loading initial history (last 30 days)")
        
        do {
            let history = try await fetchWorkoutHistory(
                startDate: thirtyDaysAgo,
                endDate: today,
                limit: nil
            )
            
            await MainActor.run {
                self.workoutHistory = history.sorted { $0.performed_at > $1.performed_at }
                self.oldestFetchedDate = thirtyDaysAgo
                self.isLoading = false
                print("✅ WorkoutHistoryStore: Loaded \(history.count) exercises from last 30 days")
            }
        } catch {
            await MainActor.run {
                self.error = error
                self.isLoading = false
                print("❌ WorkoutHistoryStore: Error loading initial history: \(error)")
            }
        }
    }
    
    // MARK: - On-Demand Loading
    
    /// Load workout history for a specific date range
    /// Intelligently fetches only missing data and merges with existing cache
    func loadHistoryForDateRange(start: Date?, end: Date?) async {
        // If requesting all time and we haven't loaded all data yet
        if start == nil && end == nil {
            await loadAllTimeHistory()
            return
        }
        
        guard let startDate = start else {
            print("⚠️ WorkoutHistoryStore: No start date provided for date range fetch")
            return
        }
        
        // Check if we need to fetch older data
        if let oldestDate = oldestFetchedDate, startDate < oldestDate {
            await loadOlderHistory(from: startDate, to: oldestDate)
        } else {
            print("📦 WorkoutHistoryStore: Data already in cache for requested range")
        }
    }
    
    /// Load all historical workout data
    private func loadAllTimeHistory() async {
        // If we've already loaded all data, skip
        if oldestFetchedDate == nil && !workoutHistory.isEmpty {
            print("📦 WorkoutHistoryStore: All-time data already loaded")
            return
        }
        
        isLoading = true
        
        print("📥 WorkoutHistoryStore: Loading all-time history")
        
        do {
            let history = try await fetchWorkoutHistory(
                startDate: nil,
                endDate: nil,
                limit: 10000
            )
            
            await MainActor.run {
                self.workoutHistory = history.sorted { $0.performed_at > $1.performed_at }
                self.oldestFetchedDate = nil // nil means we have all data
                self.isLoading = false
                print("✅ WorkoutHistoryStore: Loaded \(history.count) total exercises (all-time)")
            }
        } catch {
            await MainActor.run {
                self.error = error
                self.isLoading = false
                print("❌ WorkoutHistoryStore: Error loading all-time history: \(error)")
            }
        }
    }
    
    /// Load older workout history to fill gap in cache
    private func loadOlderHistory(from startDate: Date, to endDate: Date) async {
        isLoading = true
        
        print("📥 WorkoutHistoryStore: Loading older history from \(startDate) to \(endDate)")
        
        do {
            let olderHistory = try await fetchWorkoutHistory(
                startDate: startDate,
                endDate: endDate,
                limit: nil
            )
            
            await MainActor.run {
                // Merge with existing data and remove duplicates
                let allHistory = (self.workoutHistory + olderHistory)
                let uniqueHistory = Dictionary(grouping: allHistory, by: { $0.id })
                    .compactMap { $0.value.first }
                
                self.workoutHistory = uniqueHistory.sorted { $0.performed_at > $1.performed_at }
                self.oldestFetchedDate = startDate
                self.isLoading = false
                print("✅ WorkoutHistoryStore: Merged \(olderHistory.count) older exercises, total now: \(self.workoutHistory.count)")
            }
        } catch {
            await MainActor.run {
                self.error = error
                self.isLoading = false
                print("❌ WorkoutHistoryStore: Error loading older history: \(error)")
            }
        }
    }
    
    // MARK: - Cache Updates
    
    /// Add a newly completed exercise to the cache
    /// Call this after successfully logging an exercise to keep cache up-to-date
    /// - Parameters:
    ///   - exercise: The exercise that was completed
    ///   - databaseId: The UUID string returned from the database after logging
    func addCompletedExercise(_ exercise: Exercise, databaseId: String) {
        // Convert Exercise to WorkoutHistoryItem with the database ID
        let historyItem = WorkoutHistoryItem.from(exercise: exercise, databaseId: databaseId)
        
        // Add to the beginning of the array (most recent)
        workoutHistory.insert(historyItem, at: 0)
        
        print("✅ WorkoutHistoryStore: Added new exercise '\(exercise.name)' with ID '\(databaseId)' to cache (total: \(workoutHistory.count))")
    }
    
    /// Remove a completed exercise from the cache (undo completion)
    /// Call this after successfully deleting an exercise from the database
    func removeCompletedExercise(id: String) {
        // Find and remove the exercise with matching ID
        if let index = workoutHistory.firstIndex(where: { $0.id.uuidString == id }) {
            let removed = workoutHistory.remove(at: index)
            print("✅ WorkoutHistoryStore: Removed exercise '\(removed.exercise_name)' from cache (total: \(workoutHistory.count))")
        } else {
            // If not found by exact ID, try to find the most recent exercise (for locally-added items)
            // This handles the case where the local cache has a different ID than the database
            print("⚠️ WorkoutHistoryStore: Exercise with ID '\(id)' not found in cache")
        }
    }
    
    /// Manually refresh the cache (useful for pull-to-refresh)
    func refreshCache() async {
        print("🔄 WorkoutHistoryStore: Manually refreshing cache")
        
        // Reset and reload initial history
        workoutHistory = []
        oldestFetchedDate = nil
        
        await loadInitialHistory()
    }
    
    // MARK: - Database Fetching
    
    /// Fetch workout history directly from Supabase
    private func fetchWorkoutHistory(startDate: Date?, endDate: Date?, limit: Int?) async throws -> [WorkoutHistoryItem] {
        // Get current user
        let session = try await supabase.auth.session
        let userId = session.user.id
        
        let formatter = ISO8601DateFormatter()
        
        // Build the base query with all filters at once
        let response: [WorkoutHistoryItem]
        
        if let startDate = startDate, let endDate = endDate, let limit = limit {
            // All filters present
            let startDateString = formatter.string(from: startDate)
            let endDateString = formatter.string(from: endDate)
            response = try await supabase
                .from("workout_history")
                .select()
                .eq("user_id", value: userId.uuidString)
                .gte("performed_at", value: startDateString)
                .lte("performed_at", value: endDateString)
                .order("performed_at", ascending: false)
                .limit(limit)
                .execute()
                .value
        } else if let startDate = startDate, let endDate = endDate {
            // Date filters only
            let startDateString = formatter.string(from: startDate)
            let endDateString = formatter.string(from: endDate)
            response = try await supabase
                .from("workout_history")
                .select()
                .eq("user_id", value: userId.uuidString)
                .gte("performed_at", value: startDateString)
                .lte("performed_at", value: endDateString)
                .order("performed_at", ascending: false)
                .execute()
                .value
        } else if let limit = limit {
            // Limit only
            response = try await supabase
                .from("workout_history")
                .select()
                .eq("user_id", value: userId.uuidString)
                .order("performed_at", ascending: false)
                .limit(limit)
                .execute()
                .value
        } else {
            // No filters
            response = try await supabase
                .from("workout_history")
                .select()
                .eq("user_id", value: userId.uuidString)
                .order("performed_at", ascending: false)
                .execute()
                .value
        }
        
        return response
    }
    
    // MARK: - Filtering Helpers
    
    /// Get filtered workout history for a specific date range from cache
    func filteredHistory(start: Date?, end: Date?) -> [WorkoutHistoryItem] {
        // If no filters, return all
        guard start != nil || end != nil else {
            return workoutHistory
        }
        
        return workoutHistory.filter { workout in
            var matchesStart = true
            var matchesEnd = true
            
            if let startDate = start {
                matchesStart = workout.performed_at >= startDate
            }
            
            if let endDate = end {
                matchesEnd = workout.performed_at <= endDate
            }
            
            return matchesStart && matchesEnd
        }
    }
}

// MARK: - WorkoutHistoryItem Extension

extension WorkoutHistoryItem {
    /// Convert an Exercise to a WorkoutHistoryItem for cache updates
    /// - Parameters:
    ///   - exercise: The exercise to convert
    ///   - databaseId: The UUID string from the database (used for cache sync)
    static func from(exercise: Exercise, databaseId: String) -> WorkoutHistoryItem {
        // Use the database ID if valid, otherwise generate a new one
        let id = UUID(uuidString: databaseId) ?? UUID()
        let userId = UUID() // Will be set by backend
        let performedAt = Date()
        let createdAt = Date()
        let updatedAt = Date()
        
        return WorkoutHistoryItem(
            id: id,
            user_id: userId,
            exercise_name: exercise.name,
            exercise_type: exercise.exercise_type,
            performed_at: performedAt,
            sets: exercise.sets == 0 ? nil : exercise.sets,
            reps: exercise.reps.isEmpty ? nil : exercise.reps,
            load_kg_each: exercise.load_kg_each.isEmpty ? nil : exercise.load_kg_each,
            rest_seconds: exercise.rest_seconds,
            distance_km: exercise.distance_km,
            duration_min: exercise.duration_min == 0 ? nil : exercise.duration_min,
            target_pace: exercise.target_pace,
            rounds: exercise.rounds,
            total_duration_min: nil,
            hold_duration_sec: exercise.hold_duration_sec,
            muscles_utilized: exercise.muscles_utilized ?? [],
            goals_addressed: exercise.goals_addressed,
            reasoning: exercise.reasoning,
            equipment: exercise.equipment,
            exercise_description: exercise.exercise_description,
            rpe: nil,
            notes: nil,
            created_at: createdAt,
            updated_at: updatedAt
        )
    }
}

