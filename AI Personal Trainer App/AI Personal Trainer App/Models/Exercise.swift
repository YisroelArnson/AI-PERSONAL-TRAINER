//
//  Exercise.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation

/// Exercise model using 4-type system: reps, hold, duration, intervals
struct Exercise: Codable, Identifiable {
    let id = UUID() // Generate unique ID for SwiftUI
    let name: String
    let exercise_type: String  // "reps", "hold", "duration", "intervals"
    let sets: Int
    let reps: [Int]
    let duration_min: Int
    let load_kg_each: [Double]
    let muscles_utilized: [MuscleUtilization]?
    let goals_addressed: [GoalUtilization]?
    let reasoning: String
    let exercise_description: String?
    let distance_km: Double?
    let rounds: Int?
    let rest_seconds: Int?
    let target_pace: String?
    let hold_duration_sec: [Int]?
    let equipment: [String]?
    
    // Full initializer for direct construction
    init(name: String, exercise_type: String, sets: Int, reps: [Int], duration_min: Int, load_kg_each: [Double], muscles_utilized: [MuscleUtilization]?, goals_addressed: [GoalUtilization]?, reasoning: String, exercise_description: String?, distance_km: Double?, rounds: Int?, rest_seconds: Int?, target_pace: String?, hold_duration_sec: [Int]?, equipment: [String]?) {
        self.name = name
        self.exercise_type = exercise_type
        self.sets = sets
        self.reps = reps
        self.duration_min = duration_min
        self.load_kg_each = load_kg_each
        self.muscles_utilized = muscles_utilized
        self.goals_addressed = goals_addressed
        self.reasoning = reasoning
        self.exercise_description = exercise_description
        self.distance_km = distance_km
        self.rounds = rounds
        self.rest_seconds = rest_seconds
        self.target_pace = target_pace
        self.hold_duration_sec = hold_duration_sec
        self.equipment = equipment
    }
    
    // Custom initializer for the new API format
    init(from recommendation: RecommendationExercise) {
        self.name = recommendation.exercise_name
        self.exercise_type = recommendation.exercise_type
        self.sets = recommendation.sets ?? 1
        self.reps = recommendation.reps ?? []
        self.duration_min = recommendation.duration_min ?? 0
        self.load_kg_each = recommendation.load_kg_each ?? []
        self.muscles_utilized = recommendation.muscles_utilized
        self.goals_addressed = recommendation.goals_addressed
        self.reasoning = recommendation.reasoning
        self.exercise_description = recommendation.exercise_description
        self.distance_km = recommendation.distance_km
        self.rounds = recommendation.rounds
        self.rest_seconds = recommendation.rest_seconds
        self.target_pace = recommendation.target_pace
        self.hold_duration_sec = recommendation.hold_duration_sec
        self.equipment = recommendation.equipment
    }
    
    // Custom initializer for streaming format
    // Uses the 4-type exercise system: reps, hold, duration, intervals
    init(from streamingExercise: StreamingExercise) {
        self.name = streamingExercise.exercise_name
        self.exercise_type = streamingExercise.exercise_type

        // Handle exercise types
        switch streamingExercise.exercise_type {
        case "reps":
            // Set/rep based exercises (strength, bodyweight)
            self.sets = streamingExercise.sets ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = streamingExercise.load_kg_each ?? []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = nil
            self.hold_duration_sec = nil

        case "hold":
            // Isometric holds (planks, wall sits, static stretches)
            self.sets = streamingExercise.sets ?? 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = nil
            self.hold_duration_sec = streamingExercise.hold_duration_sec

        case "duration":
            // Continuous effort (cardio, yoga flows)
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = streamingExercise.distance_km
            self.rounds = nil
            self.rest_seconds = nil
            self.target_pace = streamingExercise.target_pace
            self.hold_duration_sec = nil

        case "intervals":
            // Work/rest cycles (HIIT, tabata)
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.total_duration_min ?? 0
            self.distance_km = nil
            self.rounds = streamingExercise.rounds
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = nil
            self.hold_duration_sec = nil

        default:
            // Fallback for unknown types
            self.sets = streamingExercise.sets ?? streamingExercise.rounds ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = streamingExercise.load_kg_each ?? []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = streamingExercise.distance_km
            self.rounds = streamingExercise.rounds
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = streamingExercise.target_pace
            self.hold_duration_sec = streamingExercise.hold_duration_sec
        }

        self.muscles_utilized = streamingExercise.muscles_utilized
        self.goals_addressed = streamingExercise.goals_addressed
        self.reasoning = streamingExercise.reasoning
        self.exercise_description = streamingExercise.exercise_description
        self.equipment = streamingExercise.equipment
    }
    
    // Convert to format for logging API
    func toLoggingFormat() -> [String: Any] {
        var dict: [String: Any] = [
            "exercise_name": name,
            "exercise_type": exercise_type,
            "muscles_utilized": muscles_utilized?.map { ["muscle": $0.muscle, "share": $0.share] } ?? []
        ]

        if sets > 0 { dict["sets"] = sets }
        if !reps.isEmpty { dict["reps"] = reps }
        if !load_kg_each.isEmpty { dict["load_kg_each"] = load_kg_each }
        if duration_min > 0 { dict["duration_min"] = duration_min }
        if let distance_km = distance_km { dict["distance_km"] = distance_km }
        if let rounds = rounds { dict["rounds"] = rounds }
        if let rest_seconds = rest_seconds { dict["rest_seconds"] = rest_seconds }
        if let target_pace = target_pace { dict["target_pace"] = target_pace }
        if let hold_duration_sec = hold_duration_sec { dict["hold_duration_sec"] = hold_duration_sec }
        if let goals_addressed = goals_addressed {
            dict["goals_addressed"] = goals_addressed.map { ["goal": $0.goal, "share": $0.share] }
        }
        if !reasoning.isEmpty { dict["reasoning"] = reasoning }
        if let equipment = equipment { dict["equipment"] = equipment }
        if let exercise_description = exercise_description { dict["exercise_description"] = exercise_description }

        return dict
    }

    enum CodingKeys: String, CodingKey {
        case name, exercise_type, sets, reps, duration_min, load_kg_each, muscles_utilized, goals_addressed, reasoning, exercise_description, distance_km, rounds, rest_seconds, target_pace, hold_duration_sec, equipment
    }
}

struct MuscleUtilization: Codable, Equatable {
    let muscle: String
    let share: Double
}

struct GoalUtilization: Codable, Equatable {
    let goal: String
    let share: Double
}

