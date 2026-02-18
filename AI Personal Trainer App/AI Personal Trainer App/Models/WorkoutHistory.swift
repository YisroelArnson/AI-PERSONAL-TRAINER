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
/// Both UIExercise (recommended exercises) and WorkoutHistoryItem (completed exercises) conform to this.
/// Uses the 4-type exercise system: reps, hold, duration, intervals
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
    var typeColor: Color {
        AppTheme.Colors.primaryText
    }
}

// MARK: - Workout History Item
/// Represents a single completed exercise from workout history
/// Uses 4-type exercise system: reps, hold, duration, intervals
struct WorkoutHistoryItem: Codable, Identifiable, Equatable {
    let id: UUID
    let user_id: UUID
    let exercise_name: String
    let exercise_type: String  // "reps", "hold", "duration", "intervals"
    let performed_at: Date

    // Exercise-specific fields (nullable based on type)
    let sets: Int?
    let reps: [Int]?
    let load_each: [Double]?
    let rest_seconds: Int?
    let distance_km: Double?
    let duration_min: Int?
    let target_pace: String?
    let rounds: Int?
    let total_duration_min: Int?
    let hold_duration_sec: [Int]?

    // Metadata
    let muscles_utilized: [MuscleUtilization]
    let goals_addressed: [GoalUtilization]?
    let reasoning: String?
    let equipment: [String]?
    let exercise_description: String?

    // User feedback
    let rpe: Int?
    let notes: String?

    // Timestamps
    let created_at: Date
    let updated_at: Date

    enum CodingKeys: String, CodingKey {
        case id, user_id, exercise_name, exercise_type, performed_at
        case sets, reps, load_each, rest_seconds, distance_km, duration_min
        case target_pace, rounds, total_duration_min, hold_duration_sec
        case muscles_utilized, goals_addressed, reasoning, equipment, exercise_description
        case rpe, notes, created_at, updated_at
    }

    // Regular initializer for programmatic creation
    init(id: UUID, user_id: UUID, exercise_name: String, exercise_type: String, performed_at: Date, sets: Int?, reps: [Int]?, load_each: [Double]?, rest_seconds: Int?, distance_km: Double?, duration_min: Int?, target_pace: String?, rounds: Int?, total_duration_min: Int?, hold_duration_sec: [Int]?, muscles_utilized: [MuscleUtilization], goals_addressed: [GoalUtilization]?, reasoning: String?, equipment: [String]?, exercise_description: String?, rpe: Int?, notes: String?, created_at: Date, updated_at: Date) {
        self.id = id
        self.user_id = user_id
        self.exercise_name = exercise_name
        self.exercise_type = exercise_type
        self.performed_at = performed_at
        self.sets = sets
        self.reps = reps
        self.load_each = load_each
        self.rest_seconds = rest_seconds
        self.distance_km = distance_km
        self.duration_min = duration_min
        self.target_pace = target_pace
        self.rounds = rounds
        self.total_duration_min = total_duration_min
        self.hold_duration_sec = hold_duration_sec
        self.muscles_utilized = muscles_utilized
        self.goals_addressed = goals_addressed
        self.reasoning = reasoning
        self.equipment = equipment
        self.exercise_description = exercise_description
        self.rpe = rpe
        self.notes = notes
        self.created_at = created_at
        self.updated_at = updated_at
    }

    // Custom date decoding
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(UUID.self, forKey: .id)
        user_id = try container.decode(UUID.self, forKey: .user_id)
        exercise_name = try container.decode(String.self, forKey: .exercise_name)
        exercise_type = try container.decode(String.self, forKey: .exercise_type)

        // Decode dates with ISO8601 format
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let performedAtString = try? container.decode(String.self, forKey: .performed_at) {
            performed_at = dateFormatter.date(from: performedAtString) ?? Date()
        } else {
            performed_at = Date()
        }

        if let createdAtString = try? container.decode(String.self, forKey: .created_at) {
            created_at = dateFormatter.date(from: createdAtString) ?? Date()
        } else {
            created_at = Date()
        }

        if let updatedAtString = try? container.decode(String.self, forKey: .updated_at) {
            updated_at = dateFormatter.date(from: updatedAtString) ?? Date()
        } else {
            updated_at = Date()
        }

        // Exercise-specific fields
        sets = try container.decodeIfPresent(Int.self, forKey: .sets)
        reps = try container.decodeIfPresent([Int].self, forKey: .reps)
        load_each = try container.decodeIfPresent([Double].self, forKey: .load_each)
        rest_seconds = try container.decodeIfPresent(Int.self, forKey: .rest_seconds)
        distance_km = try container.decodeIfPresent(Double.self, forKey: .distance_km)
        duration_min = try container.decodeIfPresent(Int.self, forKey: .duration_min)
        target_pace = try container.decodeIfPresent(String.self, forKey: .target_pace)
        rounds = try container.decodeIfPresent(Int.self, forKey: .rounds)
        total_duration_min = try container.decodeIfPresent(Int.self, forKey: .total_duration_min)
        hold_duration_sec = try container.decodeIfPresent([Int].self, forKey: .hold_duration_sec)

        // Metadata
        muscles_utilized = try container.decode([MuscleUtilization].self, forKey: .muscles_utilized)
        goals_addressed = try container.decodeIfPresent([GoalUtilization].self, forKey: .goals_addressed)
        reasoning = try container.decodeIfPresent(String.self, forKey: .reasoning)
        equipment = try container.decodeIfPresent([String].self, forKey: .equipment)
        exercise_description = try container.decodeIfPresent(String.self, forKey: .exercise_description)

        // User feedback
        rpe = try container.decodeIfPresent(Int.self, forKey: .rpe)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
    }
    
    // Helper to get formatted date
    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: performed_at)
    }
    
    // Helper to get relative date (e.g., "2 hours ago")
    var relativeDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: performed_at, relativeTo: Date())
    }
    
    // Helper to get the exercise type color
    var typeColor: Color {
        AppTheme.Colors.primaryText
    }
    
    // Helper to get formatted metrics
    @MainActor
    var primaryMetric: String {
        let weightUnit = UserSettings.shared.weightUnitLabel
        let distanceUnit = UserSettings.shared.distanceUnitLabel

        switch exercise_type {
        case "reps":
            // Reps exercise - handles both weighted and bodyweight
            if let sets = sets, let reps = reps, !reps.isEmpty {
                let repsStr = reps.map { String($0) }.joined(separator: ", ")
                if let weights = load_each, !weights.isEmpty {
                    let weightsStr = weights.map { weight in
                        weight.truncatingRemainder(dividingBy: 1) == 0
                            ? String(format: "%.0f", weight)
                            : String(format: "%.1f", weight)
                    }.joined(separator: ", ")
                    return "\(sets) sets × [\(repsStr)] reps @ [\(weightsStr)] \(weightUnit)"
                }
                return "\(sets) sets × [\(repsStr)] reps"
            }
            return "Reps"

        case "hold":
            // Hold exercise - isometric holds
            if let sets = sets, let holds = hold_duration_sec, !holds.isEmpty {
                let holdsStr = holds.map { "\($0)s" }.joined(separator: ", ")
                return "\(sets) sets × [\(holdsStr)] hold"
            }
            return "Hold"

        case "duration":
            // Duration exercise - cardio, yoga flows
            var parts: [String] = []
            if let distance = distance_km {
                let formattedDistance = distance.truncatingRemainder(dividingBy: 1) == 0
                    ? String(format: "%.0f", distance)
                    : String(format: "%.2f", distance)
                parts.append("\(formattedDistance) \(distanceUnit)")
            }
            if let duration = duration_min {
                parts.append("\(duration) min")
            }
            if let pace = target_pace {
                parts.append(pace)
            }
            return parts.isEmpty ? "Duration" : parts.joined(separator: " · ")

        case "intervals":
            // Intervals exercise - HIIT, tabata
            var parts: [String] = []
            if let rounds = rounds {
                parts.append("\(rounds) rounds")
            }
            if let duration = total_duration_min ?? duration_min {
                parts.append("\(duration) min total")
            }
            return parts.isEmpty ? "Intervals" : parts.joined(separator: " · ")

        default:
            if let duration = duration_min {
                return "\(duration) minutes"
            }
            return exercise_type.capitalized
        }
    }
    
    // Helper to get muscle groups summary
    var musclesSummary: String {
        let topMuscles = muscles_utilized
            .sorted { $0.share > $1.share }
            .prefix(3)
            .map { $0.muscle.capitalized }
        return topMuscles.joined(separator: ", ")
    }
}

// MARK: - WorkoutHistoryItem ExerciseDisplayable Conformance
extension WorkoutHistoryItem: ExerciseDisplayable {
    var displayMusclesUtilized: [MuscleUtilization] {
        return muscles_utilized
    }
    
    var displayFormattedDate: String? {
        return formattedDate
    }
    
    var displayRpe: Int? {
        return rpe
    }
    
    var displayNotes: String? {
        return notes
    }
}

