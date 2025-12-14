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
protocol ExerciseDisplayable {
    // Core identifiers
    var exercise_name: String { get }
    var exercise_type: String { get }
    var aliases: [String]? { get }
    
    // Exercise metrics
    var sets: Int? { get }
    var reps: [Int]? { get }
    var load_kg_each: [Double]? { get }
    var rest_seconds: Int? { get }
    var distance_km: Double? { get }
    var duration_min: Int? { get }
    var target_pace: String? { get }
    var rounds: Int? { get }
    var intervals: [ExerciseInterval]? { get }
    var total_duration_min: Int? { get }
    var hold_duration_sec: [Int]? { get }
    
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
        switch exercise_type {
        case "strength":
            return AppTheme.Colors.strength
        case "cardio_distance", "cardio_time":
            return AppTheme.Colors.cardio
        case "hiit":
            return AppTheme.Colors.hiit
        case "bodyweight":
            return AppTheme.Colors.bodyweight
        case "isometric":
            return AppTheme.Colors.isometric
        case "flexibility":
            return AppTheme.Colors.flexibility
        case "yoga":
            return AppTheme.Colors.yoga
        default:
            return .gray
        }
    }
}

// MARK: - Workout History Item
/// Represents a single completed exercise from workout history
struct WorkoutHistoryItem: Codable, Identifiable, Equatable {
    let id: UUID
    let user_id: UUID
    let exercise_name: String
    let exercise_type: String
    let aliases: [String]?
    let performed_at: Date
    
    // Exercise-specific fields (nullable based on type)
    let sets: Int?
    let reps: [Int]?
    let load_kg_each: [Double]?
    let rest_seconds: Int?
    let distance_km: Double?
    let duration_min: Int?
    let target_pace: String?
    let rounds: Int?
    let intervals: [ExerciseInterval]?
    let total_duration_min: Int?
    let hold_duration_sec: [Int]?
    
    // Metadata
    let muscles_utilized: [MuscleUtilization]
    let goals_addressed: [GoalUtilization]?
    let reasoning: String?
    let equipment: [String]?
    let movement_pattern: [String]?
    let exercise_description: String?
    let body_region: String?
    
    // User feedback
    let rpe: Int?
    let notes: String?
    
    // Timestamps
    let created_at: Date
    let updated_at: Date
    
    enum CodingKeys: String, CodingKey {
        case id, user_id, exercise_name, exercise_type, aliases, performed_at
        case sets, reps, load_kg_each, rest_seconds, distance_km, duration_min
        case target_pace, rounds, intervals, total_duration_min, hold_duration_sec
        case muscles_utilized, goals_addressed, reasoning, equipment
        case movement_pattern, exercise_description, body_region
        case rpe, notes, created_at, updated_at
    }
    
    // Regular initializer for programmatic creation
    init(id: UUID, user_id: UUID, exercise_name: String, exercise_type: String, aliases: [String]?, performed_at: Date, sets: Int?, reps: [Int]?, load_kg_each: [Double]?, rest_seconds: Int?, distance_km: Double?, duration_min: Int?, target_pace: String?, rounds: Int?, intervals: [ExerciseInterval]?, total_duration_min: Int?, hold_duration_sec: [Int]?, muscles_utilized: [MuscleUtilization], goals_addressed: [GoalUtilization]?, reasoning: String?, equipment: [String]?, movement_pattern: [String]?, exercise_description: String?, body_region: String?, rpe: Int?, notes: String?, created_at: Date, updated_at: Date) {
        self.id = id
        self.user_id = user_id
        self.exercise_name = exercise_name
        self.exercise_type = exercise_type
        self.aliases = aliases
        self.performed_at = performed_at
        self.sets = sets
        self.reps = reps
        self.load_kg_each = load_kg_each
        self.rest_seconds = rest_seconds
        self.distance_km = distance_km
        self.duration_min = duration_min
        self.target_pace = target_pace
        self.rounds = rounds
        self.intervals = intervals
        self.total_duration_min = total_duration_min
        self.hold_duration_sec = hold_duration_sec
        self.muscles_utilized = muscles_utilized
        self.goals_addressed = goals_addressed
        self.reasoning = reasoning
        self.equipment = equipment
        self.movement_pattern = movement_pattern
        self.exercise_description = exercise_description
        self.body_region = body_region
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
        aliases = try container.decodeIfPresent([String].self, forKey: .aliases)
        
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
        load_kg_each = try container.decodeIfPresent([Double].self, forKey: .load_kg_each)
        rest_seconds = try container.decodeIfPresent(Int.self, forKey: .rest_seconds)
        distance_km = try container.decodeIfPresent(Double.self, forKey: .distance_km)
        duration_min = try container.decodeIfPresent(Int.self, forKey: .duration_min)
        target_pace = try container.decodeIfPresent(String.self, forKey: .target_pace)
        rounds = try container.decodeIfPresent(Int.self, forKey: .rounds)
        intervals = try container.decodeIfPresent([ExerciseInterval].self, forKey: .intervals)
        total_duration_min = try container.decodeIfPresent(Int.self, forKey: .total_duration_min)
        hold_duration_sec = try container.decodeIfPresent([Int].self, forKey: .hold_duration_sec)
        
        // Metadata
        muscles_utilized = try container.decode([MuscleUtilization].self, forKey: .muscles_utilized)
        goals_addressed = try container.decodeIfPresent([GoalUtilization].self, forKey: .goals_addressed)
        reasoning = try container.decodeIfPresent(String.self, forKey: .reasoning)
        equipment = try container.decodeIfPresent([String].self, forKey: .equipment)
        movement_pattern = try container.decodeIfPresent([String].self, forKey: .movement_pattern)
        exercise_description = try container.decodeIfPresent(String.self, forKey: .exercise_description)
        body_region = try container.decodeIfPresent(String.self, forKey: .body_region)
        
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
        switch exercise_type {
        case "strength":
            return AppTheme.Colors.strength
        case "cardio_distance", "cardio_time":
            return AppTheme.Colors.cardio
        case "hiit":
            return AppTheme.Colors.hiit
        case "bodyweight":
            return AppTheme.Colors.bodyweight
        case "isometric":
            return AppTheme.Colors.isometric
        case "flexibility":
            return AppTheme.Colors.flexibility
        case "yoga":
            return AppTheme.Colors.yoga
        default:
            return .gray
        }
    }
    
    // Helper to get formatted metrics
    @MainActor
    var primaryMetric: String {
        let weightUnit = UserSettings.shared.weightUnitLabel
        let distanceUnit = UserSettings.shared.distanceUnitLabel
        
        switch exercise_type {
        case "strength":
            if let sets = sets, let reps = reps, !reps.isEmpty {
                let repsStr = reps.map { String($0) }.joined(separator: ", ")
                if let weights = load_kg_each, !weights.isEmpty {
                    let weightsStr = weights.map { weight in
                        weight.truncatingRemainder(dividingBy: 1) == 0
                            ? String(format: "%.0f", weight)
                            : String(format: "%.1f", weight)
                    }.joined(separator: ", ")
                    return "\(sets) sets × [\(repsStr)] reps @ [\(weightsStr)] \(weightUnit)"
                }
                return "\(sets) sets × [\(repsStr)] reps"
            }
            return "Strength"
            
        case "cardio_distance":
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
            return parts.isEmpty ? "Cardio" : parts.joined(separator: " · ")
            
        case "cardio_time":
            if let duration = duration_min {
                return "\(duration) minutes"
            }
            return "Cardio"
            
        case "hiit":
            var parts: [String] = []
            if let rounds = rounds {
                parts.append("\(rounds) rounds")
            }
            if let duration = total_duration_min ?? duration_min {
                parts.append("\(duration) min total")
            }
            return parts.isEmpty ? "HIIT" : parts.joined(separator: " · ")
            
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


