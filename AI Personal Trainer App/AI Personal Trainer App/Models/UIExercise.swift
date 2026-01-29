import Foundation

/// UI exercise model using the 4-type system: reps, hold, duration, intervals
struct UIExercise: Identifiable, Codable {
    let id: UUID
    let exercise_name: String
    let type: String // exercise type: "reps", "hold", "duration", "intervals"

    // === METADATA ===
    let muscles_utilized: [MuscleUtilization]?
    let goals_addressed: [GoalUtilization]?
    let reasoning: String?
    let exercise_description: String?
    let equipment: [String]?

    // === TYPE: reps - Count repetitions across sets ===
    let sets: Int?
    let reps: [Int]?
    let load_kg_each: [Double]?  // Weight per set
    let load_unit: String?       // "lbs" or "kg"

    // === TYPE: hold - Hold positions for time ===
    let hold_duration_sec: [Int]? // Hold duration per set in seconds

    // === TYPE: duration - Continuous effort ===
    let duration_min: Int?
    let distance_km: Double?
    let distance_unit: String?   // "km" or "mi"
    let target_pace: String?

    // === TYPE: intervals - Work/rest cycles ===
    let rounds: Int?
    let work_sec: Int?           // Work interval in seconds
    let total_duration_min: Int? // Total workout duration

    // === SHARED TIMING ===
    let rest_seconds: Int?       // Rest between sets/intervals in seconds

    // === GROUPING (optional) ===
    let group: ExerciseGroup?

    // Custom initializer to generate UUID
    init(
        id: UUID = UUID(),
        exercise_name: String,
        type: String,
        duration_min: Int? = nil,
        reps: [Int]? = nil,
        load_kg_each: [Double]? = nil,
        load_unit: String? = nil,
        sets: Int? = nil,
        distance_km: Double? = nil,
        distance_unit: String? = nil,
        rounds: Int? = nil,
        work_sec: Int? = nil,
        total_duration_min: Int? = nil,
        muscles_utilized: [MuscleUtilization]? = nil,
        rest_seconds: Int? = nil,
        target_pace: String? = nil,
        hold_duration_sec: [Int]? = nil,
        goals_addressed: [GoalUtilization]? = nil,
        reasoning: String? = nil,
        equipment: [String]? = nil,
        exercise_description: String? = nil,
        group: ExerciseGroup? = nil
    ) {
        self.id = id
        self.exercise_name = exercise_name
        self.type = type
        self.duration_min = duration_min
        self.reps = reps
        self.load_kg_each = load_kg_each
        self.load_unit = load_unit
        self.sets = sets
        self.distance_km = distance_km
        self.distance_unit = distance_unit
        self.rounds = rounds
        self.work_sec = work_sec
        self.total_duration_min = total_duration_min
        self.muscles_utilized = muscles_utilized
        self.rest_seconds = rest_seconds
        self.target_pace = target_pace
        self.hold_duration_sec = hold_duration_sec
        self.goals_addressed = goals_addressed
        self.reasoning = reasoning
        self.equipment = equipment
        self.exercise_description = exercise_description
        self.group = group
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
            distance_km: distance_km,
            rounds: rounds,
            rest_seconds: rest_seconds,
            target_pace: target_pace,
            hold_duration_sec: hold_duration_sec,
            equipment: equipment
        )
    }

    enum CodingKeys: String, CodingKey {
        case id, exercise_name, type
        case duration_min, reps, sets, rounds
        case load_kg_each, load_unit
        case distance_km, distance_unit
        case work_sec, total_duration_min
        case muscles_utilized, rest_seconds, target_pace
        case hold_duration_sec
        case goals_addressed, reasoning, equipment
        case exercise_description
        case group
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? container.decode(UUID.self, forKey: .id)) ?? UUID()
        exercise_name = try container.decode(String.self, forKey: .exercise_name)
        type = try container.decode(String.self, forKey: .type)
        duration_min = try container.decodeIfPresent(Int.self, forKey: .duration_min)
        reps = try container.decodeIfPresent([Int].self, forKey: .reps)
        load_kg_each = try container.decodeIfPresent([Double].self, forKey: .load_kg_each)
        load_unit = try container.decodeIfPresent(String.self, forKey: .load_unit)
        sets = try container.decodeIfPresent(Int.self, forKey: .sets)
        distance_km = try container.decodeIfPresent(Double.self, forKey: .distance_km)
        distance_unit = try container.decodeIfPresent(String.self, forKey: .distance_unit)
        rounds = try container.decodeIfPresent(Int.self, forKey: .rounds)
        work_sec = try container.decodeIfPresent(Int.self, forKey: .work_sec)
        total_duration_min = try container.decodeIfPresent(Int.self, forKey: .total_duration_min)
        muscles_utilized = try container.decodeIfPresent([MuscleUtilization].self, forKey: .muscles_utilized)
        rest_seconds = try container.decodeIfPresent(Int.self, forKey: .rest_seconds)
        target_pace = try container.decodeIfPresent(String.self, forKey: .target_pace)
        hold_duration_sec = try container.decodeIfPresent([Int].self, forKey: .hold_duration_sec)
        goals_addressed = try container.decodeIfPresent([GoalUtilization].self, forKey: .goals_addressed)
        reasoning = try container.decodeIfPresent(String.self, forKey: .reasoning)
        equipment = try container.decodeIfPresent([String].self, forKey: .equipment)
        exercise_description = try container.decodeIfPresent(String.self, forKey: .exercise_description)
        group = try container.decodeIfPresent(ExerciseGroup.self, forKey: .group)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(exercise_name, forKey: .exercise_name)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(duration_min, forKey: .duration_min)
        try container.encodeIfPresent(reps, forKey: .reps)
        try container.encodeIfPresent(load_kg_each, forKey: .load_kg_each)
        try container.encodeIfPresent(load_unit, forKey: .load_unit)
        try container.encodeIfPresent(sets, forKey: .sets)
        try container.encodeIfPresent(distance_km, forKey: .distance_km)
        try container.encodeIfPresent(distance_unit, forKey: .distance_unit)
        try container.encodeIfPresent(rounds, forKey: .rounds)
        try container.encodeIfPresent(work_sec, forKey: .work_sec)
        try container.encodeIfPresent(total_duration_min, forKey: .total_duration_min)
        try container.encodeIfPresent(muscles_utilized, forKey: .muscles_utilized)
        try container.encodeIfPresent(rest_seconds, forKey: .rest_seconds)
        try container.encodeIfPresent(target_pace, forKey: .target_pace)
        try container.encodeIfPresent(hold_duration_sec, forKey: .hold_duration_sec)
        try container.encodeIfPresent(goals_addressed, forKey: .goals_addressed)
        try container.encodeIfPresent(reasoning, forKey: .reasoning)
        try container.encodeIfPresent(equipment, forKey: .equipment)
        try container.encodeIfPresent(exercise_description, forKey: .exercise_description)
        try container.encodeIfPresent(group, forKey: .group)
    }

    static var sampleExercises: [UIExercise] {
        let benchPress = UIExercise(
            exercise_name: "Barbell Bench Press",
            type: "reps",
            reps: [10, 10, 8],
            load_kg_each: [40, 40, 45],
            load_unit: "kg",
            sets: 3,
            muscles_utilized: [
                MuscleUtilization(muscle: "Chest", share: 0.5),
                MuscleUtilization(muscle: "Triceps", share: 0.3),
                MuscleUtilization(muscle: "Shoulders", share: 0.2)
            ],
            rest_seconds: 90,
            goals_addressed: [
                GoalUtilization(goal: "strength", share: 0.8),
                GoalUtilization(goal: "hypertrophy", share: 0.2)
            ],
            reasoning: "Compound pushing movement to build chest strength",
            equipment: ["barbell", "bench"]
        )

        let plank = UIExercise(
            exercise_name: "Plank",
            type: "hold",
            sets: 3,
            muscles_utilized: [
                MuscleUtilization(muscle: "Abs", share: 0.6),
                MuscleUtilization(muscle: "Lower Back", share: 0.4)
            ],
            rest_seconds: 30,
            hold_duration_sec: [45, 45, 60],
            goals_addressed: [
                GoalUtilization(goal: "stability", share: 1.0)
            ],
            reasoning: "Core stability exercise"
        )

        let run5k = UIExercise(
            exercise_name: "5K Run",
            type: "duration",
            duration_min: 30,
            distance_km: 5.0,
            distance_unit: "km",
            muscles_utilized: [
                MuscleUtilization(muscle: "Quadriceps", share: 0.3),
                MuscleUtilization(muscle: "Hamstrings", share: 0.25),
                MuscleUtilization(muscle: "Calves", share: 0.25),
                MuscleUtilization(muscle: "Glutes", share: 0.2)
            ],
            target_pace: "6:00/km",
            goals_addressed: [
                GoalUtilization(goal: "endurance", share: 0.7),
                GoalUtilization(goal: "cardio", share: 0.3)
            ],
            reasoning: "Zone 2 cardio for aerobic base"
        )

        let tabata = UIExercise(
            exercise_name: "Tabata Burpees",
            type: "intervals",
            rounds: 8,
            work_sec: 20,
            muscles_utilized: [
                MuscleUtilization(muscle: "Quadriceps", share: 0.25),
                MuscleUtilization(muscle: "Chest", share: 0.25),
                MuscleUtilization(muscle: "Shoulders", share: 0.25),
                MuscleUtilization(muscle: "Abs", share: 0.25)
            ],
            rest_seconds: 10,
            goals_addressed: [
                GoalUtilization(goal: "vo2max", share: 0.6),
                GoalUtilization(goal: "conditioning", share: 0.4)
            ],
            reasoning: "High intensity intervals for metabolic conditioning"
        )

        return [benchPress, plank, run5k, tabata]
    }
}
