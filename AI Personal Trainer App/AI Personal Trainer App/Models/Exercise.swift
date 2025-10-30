//
//  Exercise.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation

struct Exercise: Codable, Identifiable {
    let id = UUID() // Generate unique ID for SwiftUI
    let name: String
    let exercise_type: String
    let sets: Int
    let reps: [Int]
    let duration_min: Int
    let load_kg_each: [Double]
    let muscles_utilized: [MuscleUtilization]?
    let goals_addressed: [String]?
    let reasoning: String
    let exercise_description: String?
    let intervals: [ExerciseInterval]?
    let distance_km: Double?
    let rounds: Int?
    let rest_seconds: Int?
    let target_pace: String?
    let hold_duration_sec: [Int]?
    let equipment: [String]?
    let movement_pattern: [String]?
    let body_region: String?
    let aliases: [String]?
    
    // Full initializer for direct construction
    init(name: String, exercise_type: String, sets: Int, reps: [Int], duration_min: Int, load_kg_each: [Double], muscles_utilized: [MuscleUtilization]?, goals_addressed: [String]?, reasoning: String, exercise_description: String?, intervals: [ExerciseInterval]?, distance_km: Double?, rounds: Int?, rest_seconds: Int?, target_pace: String?, hold_duration_sec: [Int]?, equipment: [String]?, movement_pattern: [String]?, body_region: String?, aliases: [String]?) {
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
        self.intervals = intervals
        self.distance_km = distance_km
        self.rounds = rounds
        self.rest_seconds = rest_seconds
        self.target_pace = target_pace
        self.hold_duration_sec = hold_duration_sec
        self.equipment = equipment
        self.movement_pattern = movement_pattern
        self.body_region = body_region
        self.aliases = aliases
    }
    
    // Custom initializer for the new API format
    init(from recommendation: RecommendationExercise) {
        self.name = recommendation.exercise_name
        self.exercise_type = "strength" // Default, should be provided by API
        self.sets = recommendation.rounds ?? 1
        self.reps = recommendation.reps ?? []
        self.duration_min = recommendation.duration_min ?? 0
        self.load_kg_each = recommendation.load_kg_each ?? []
        self.muscles_utilized = recommendation.muscles_utilized
        self.goals_addressed = recommendation.goals_addressed
        self.reasoning = recommendation.reasoning
        self.exercise_description = recommendation.exercise_description
        self.intervals = recommendation.intervals
        self.distance_km = recommendation.distance_km
        self.rounds = recommendation.rounds
        self.rest_seconds = nil
        self.target_pace = nil
        self.hold_duration_sec = nil
        self.equipment = recommendation.equipment
        self.movement_pattern = recommendation.movement_pattern
        self.body_region = recommendation.body_region
        self.aliases = recommendation.aliases
    }
    
    // Custom initializer for streaming format
    init(from streamingExercise: StreamingExercise) {
        self.name = streamingExercise.exercise_name
        self.exercise_type = streamingExercise.exercise_type
        
        // Handle different exercise types appropriately
        switch streamingExercise.exercise_type {
        case "strength":
            self.sets = streamingExercise.sets ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = streamingExercise.load_kg_each ?? []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "cardio_distance":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = streamingExercise.distance_km
            self.rounds = nil
            self.rest_seconds = nil
            self.target_pace = streamingExercise.target_pace
            self.hold_duration_sec = nil
            
        case "cardio_time":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = nil
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "hiit":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.total_duration_min ?? 0
            self.distance_km = nil
            self.rounds = streamingExercise.rounds
            self.rest_seconds = nil
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "circuit":
            self.sets = streamingExercise.circuits ?? 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = streamingExercise.rest_between_circuits_sec
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "flexibility":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = streamingExercise.repetitions
            self.rest_seconds = nil
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "yoga":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.total_duration_min ?? 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = nil
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "isometric":
            self.sets = streamingExercise.sets ?? 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = nil
            self.hold_duration_sec = streamingExercise.hold_duration_sec
            
        case "bodyweight":
            self.sets = streamingExercise.sets ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = streamingExercise.rest_seconds
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        case "balance":
            self.sets = streamingExercise.sets ?? 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            self.rest_seconds = nil
            self.target_pace = nil
            self.hold_duration_sec = streamingExercise.hold_duration_sec
            
        case "sport_specific":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = nil
            self.rounds = streamingExercise.repetitions
            self.rest_seconds = nil
            self.target_pace = nil
            self.hold_duration_sec = nil
            
        default:
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
        self.intervals = streamingExercise.intervals
        self.equipment = streamingExercise.equipment
        self.movement_pattern = streamingExercise.movement_pattern
        self.body_region = streamingExercise.body_region
        self.aliases = streamingExercise.aliases
    }
    
    // Convert to format for logging API
    func toLoggingFormat() -> [String: Any] {
        var dict: [String: Any] = [
            "exercise_name": name,
            "exercise_type": exercise_type,
            "muscles_utilized": muscles_utilized?.map { ["muscle": $0.muscle, "share": $0.share] } ?? []
        ]
        
        if let aliases = aliases { dict["aliases"] = aliases }
        if sets > 0 { dict["sets"] = sets }
        if !reps.isEmpty { dict["reps"] = reps }
        if !load_kg_each.isEmpty { dict["load_kg_each"] = load_kg_each }
        if duration_min > 0 { dict["duration_min"] = duration_min }
        if let distance_km = distance_km { dict["distance_km"] = distance_km }
        if let rounds = rounds { dict["rounds"] = rounds }
        if let rest_seconds = rest_seconds { dict["rest_seconds"] = rest_seconds }
        if let target_pace = target_pace { dict["target_pace"] = target_pace }
        if let hold_duration_sec = hold_duration_sec { dict["hold_duration_sec"] = hold_duration_sec }
        if let intervals = intervals {
            dict["intervals"] = intervals.map { interval -> [String: Any] in
                var intervalDict: [String: Any] = [:]
                if let work = interval.work_sec { intervalDict["work_sec"] = work }
                if let rest = interval.rest_sec { intervalDict["rest_sec"] = rest }
                return intervalDict
            }
        }
        if let goals_addressed = goals_addressed { dict["goals_addressed"] = goals_addressed }
        if !reasoning.isEmpty { dict["reasoning"] = reasoning }
        if let equipment = equipment { dict["equipment"] = equipment }
        if let movement_pattern = movement_pattern { dict["movement_pattern"] = movement_pattern }
        if let exercise_description = exercise_description { dict["exercise_description"] = exercise_description }
        if let body_region = body_region { dict["body_region"] = body_region }
        
        return dict
    }
    
    enum CodingKeys: String, CodingKey {
        case name, exercise_type, sets, reps, duration_min, load_kg_each, muscles_utilized, goals_addressed, reasoning, exercise_description, intervals, distance_km, rounds, rest_seconds, target_pace, hold_duration_sec, equipment, movement_pattern, body_region, aliases
    }
}

struct ExerciseInterval: Codable {
    let work_sec: Int?
    let rest_sec: Int?
}

struct MuscleUtilization: Codable {
    let muscle: String
    let share: Double
}

struct CircuitExercise: Codable {
    let name: String
    let duration_sec: Int?
    let reps: Int?
}

struct FlexibilityHold: Codable {
    let position: String
    let duration_sec: Int
}

struct YogaPose: Codable {
    let pose: String
    let duration_sec: Int?
    let breaths: Int?
}
