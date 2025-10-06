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
    
    // Custom initializer for the new API format
    init(from recommendation: RecommendationExercise) {
        self.name = recommendation.exercise_name
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
    }
    
    // Custom initializer for streaming format
    init(from streamingExercise: StreamingExercise) {
        self.name = streamingExercise.exercise_name
        
        // Handle different exercise types appropriately
        switch streamingExercise.exercise_type {
        case "strength":
            self.sets = streamingExercise.sets ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = streamingExercise.load_kg_each ?? []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            
        case "cardio_distance":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = streamingExercise.distance_km
            self.rounds = nil
            
        case "cardio_time":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = nil
            self.rounds = nil
            
        case "hiit":
            self.sets = 1
            self.reps = []
            self.load_kg_each = []
            self.duration_min = streamingExercise.total_duration_min ?? 0
            self.distance_km = nil
            self.rounds = streamingExercise.rounds
            
        case "isometric":
            self.sets = streamingExercise.sets ?? 1
            self.reps = streamingExercise.hold_duration_sec ?? []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            
        case "bodyweight":
            self.sets = streamingExercise.sets ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = []
            self.duration_min = 0
            self.distance_km = nil
            self.rounds = nil
            
        default:
            self.sets = streamingExercise.sets ?? streamingExercise.rounds ?? 1
            self.reps = streamingExercise.reps ?? []
            self.load_kg_each = streamingExercise.load_kg_each ?? []
            self.duration_min = streamingExercise.duration_min ?? 0
            self.distance_km = streamingExercise.distance_km
            self.rounds = streamingExercise.rounds
        }
        
        self.muscles_utilized = streamingExercise.muscles_utilized
        self.goals_addressed = streamingExercise.goals_addressed
        self.reasoning = streamingExercise.reasoning
        self.exercise_description = streamingExercise.exercise_description
        self.intervals = streamingExercise.intervals
    }
    
    enum CodingKeys: String, CodingKey {
        case name, sets, reps, duration_min, load_kg_each, muscles_utilized, goals_addressed, reasoning, exercise_description, intervals, distance_km, rounds
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
