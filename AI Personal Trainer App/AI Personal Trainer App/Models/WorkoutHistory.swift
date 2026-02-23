//
//  WorkoutHistory.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/19/25.
//

import Foundation
import SwiftUI

// MARK: - ExerciseDisplayable Protocol
/// A protocol that defines common properties for displaying exercise information.
/// This now maps to session-based workout data rather than legacy exercise-row history records.
protocol ExerciseDisplayable {
    // Core identifiers
    var exercise_name: String { get }
    var exercise_type: String { get }

    // Exercise metrics - TYPE: reps
    var sets: Int? { get }
    var reps: [Int]? { get }
    var load_each: [Double]? { get }

    // Exercise metrics - TYPE: hold
    var hold_duration_sec: [Int]? { get }

    // Exercise metrics - TYPE: duration
    var duration_min: Int? { get }
    var distance_km: Double? { get }
    var target_pace: String? { get }

    // Exercise metrics - TYPE: intervals
    var rounds: Int? { get }
    var total_duration_min: Int? { get }

    // Shared timing
    var rest_seconds: Int? { get }

    // Metadata
    var displayMusclesUtilized: [MuscleUtilization] { get }
    var goals_addressed: [GoalUtilization]? { get }
    var reasoning: String? { get }
    var equipment: [String]? { get }
    var exercise_description: String? { get }

    // Optional history-specific fields (nil for upcoming exercises)
    var displayFormattedDate: String? { get }
    var displayRpe: Int? { get }
    var displayNotes: String? { get }

    // Computed helpers
    var typeColor: Color { get }
}

// MARK: - Default Protocol Implementation
extension ExerciseDisplayable {
    var typeColor: Color { AppTheme.Colors.primaryText }
}

// MARK: - Session-level adapter
/// Lightweight adapter for session-based workout history rows.
/// This keeps legacy exercise-detail UI components compilable while the history flow
/// migrates to trainer workout session data as the single source of truth.
struct WorkoutSessionHistoryDisplayItem: ExerciseDisplayable {
    let session: WorkoutHistorySessionItem

    var exercise_name: String { session.title }
    var exercise_type: String { session.workoutType ?? "session" }

    var sets: Int? { nil }
    var reps: [Int]? { nil }
    var load_each: [Double]? { nil }
    var hold_duration_sec: [Int]? { nil }
    var duration_min: Int? { session.actualDurationMin }
    var distance_km: Double? { nil }
    var target_pace: String? { nil }
    var rounds: Int? { nil }
    var total_duration_min: Int? { session.actualDurationMin }
    var rest_seconds: Int? { nil }

    var displayMusclesUtilized: [MuscleUtilization] { [] }
    var goals_addressed: [GoalUtilization]? { nil }
    var reasoning: String? { nil }
    var equipment: [String]? { nil }
    var exercise_description: String? {
        "Session with \(session.exerciseCount) exercises · \(session.completedExerciseCount) completed"
    }

    var displayFormattedDate: String? {
        guard let startedAt = session.startedAt else { return nil }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: startedAt)
    }

    var displayRpe: Int? { session.sessionRpe }
    var displayNotes: String? { nil }
}
