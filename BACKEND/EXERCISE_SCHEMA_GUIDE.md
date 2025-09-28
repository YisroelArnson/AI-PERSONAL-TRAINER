# Exercise Schema Guide

## Overview

This document explains the new typed exercise schema system designed to handle different exercise formats with proper validation and LLM guidance.

## Problem Solved

The previous schema used optional fields for all exercise types, which created confusion for the LLM about which fields to use for which exercises. This led to:
- Inconsistent data structures
- Missing required fields for specific exercise types
- Poor validation
- Unclear API responses

## Solution: Discriminated Union Schema

We now use a discriminated union based on `exercise_type` field, where each exercise type has its own specific required and optional fields.

## Exercise Types and Structures

### 1. Strength Training (`"strength"`)
For weighted exercises with sets and reps.
```json
{
  "exercise_type": "strength",
  "exercise_name": "Barbell Bench Press",
  "sets": 4,
  "reps": [8, 8, 6, 6],
  "load_kg_each": [80, 80, 85, 85],
  "rest_seconds": 120,
  "muscles_utilized": [
    {"muscle": "chest", "share": 0.6},
    {"muscle": "triceps", "share": 0.3},
    {"muscle": "shoulders", "share": 0.1}
  ],
  "goals_addressed": ["strength", "upper_body"],
  "reasoning": "Progressive overload from last session"
}
```

### 2. Distance-Based Cardio (`"cardio_distance"`)
For running, cycling, swimming with distance focus.
```json
{
  "exercise_type": "cardio_distance",
  "exercise_name": "Morning Run",
  "distance_km": 5.0,
  "duration_min": 25,
  "target_pace": "5:00/km",
  "elevation_gain_m": 50,
  "muscles_utilized": [
    {"muscle": "legs", "share": 0.7},
    {"muscle": "core", "share": 0.3}
  ],
  "goals_addressed": ["cardio", "endurance"],
  "reasoning": "Building aerobic base with moderate intensity"
}
```

### 3. Time-Based Cardio (`"cardio_time"`)
For steady-state cardio with time focus.
```json
{
  "exercise_type": "cardio_time",
  "exercise_name": "Stationary Bike",
  "duration_min": 30,
  "target_intensity": "moderate",
  "target_heart_rate_bpm": 140,
  "muscles_utilized": [
    {"muscle": "legs", "share": 0.8},
    {"muscle": "core", "share": 0.2}
  ],
  "goals_addressed": ["cardio"],
  "reasoning": "Maintaining steady heart rate for fat burning"
}
```

### 4. HIIT Training (`"hiit"`)
For high-intensity interval training.
```json
{
  "exercise_type": "hiit",
  "exercise_name": "Tabata Burpees",
  "rounds": 8,
  "intervals": [
    {"work_sec": 20, "rest_sec": 10}
  ],
  "total_duration_min": 4,
  "muscles_utilized": [
    {"muscle": "full_body", "share": 1.0}
  ],
  "goals_addressed": ["cardio", "strength"],
  "reasoning": "Maximum intensity for metabolic conditioning"
}
```

### 5. Circuit Training (`"circuit"`)
For multiple exercises performed in sequence.
```json
{
  "exercise_type": "circuit",
  "exercise_name": "Upper Body Circuit",
  "circuits": 3,
  "exercises_in_circuit": [
    {"name": "Push-ups", "reps": 15},
    {"name": "Pull-ups", "reps": 8},
    {"name": "Dips", "reps": 12},
    {"name": "Plank", "duration_sec": 30}
  ],
  "rest_between_circuits_sec": 90,
  "muscles_utilized": [
    {"muscle": "chest", "share": 0.3},
    {"muscle": "back", "share": 0.3},
    {"muscle": "triceps", "share": 0.2},
    {"muscle": "core", "share": 0.2}
  ],
  "goals_addressed": ["strength", "endurance"],
  "reasoning": "Compound movements for time efficiency"
}
```

### 6. Flexibility Training (`"flexibility"`)
For stretching and mobility work.
```json
{
  "exercise_type": "flexibility",
  "exercise_name": "Hip Flexor Stretch",
  "holds": [
    {"position": "lunge_left", "duration_sec": 30},
    {"position": "lunge_right", "duration_sec": 30}
  ],
  "repetitions": 2,
  "muscles_utilized": [
    {"muscle": "hip_flexors", "share": 1.0}
  ],
  "goals_addressed": ["flexibility", "mobility"],
  "reasoning": "Addressing tight hip flexors from desk work"
}
```

### 7. Yoga (`"yoga"`)
For yoga flows and sequences.
```json
{
  "exercise_type": "yoga",
  "exercise_name": "Sun Salutation A",
  "sequence": [
    {"pose": "mountain_pose", "breaths": 3},
    {"pose": "forward_fold", "breaths": 3},
    {"pose": "chaturanga", "breaths": 1},
    {"pose": "upward_dog", "breaths": 1},
    {"pose": "downward_dog", "breaths": 5}
  ],
  "total_duration_min": 10,
  "muscles_utilized": [
    {"muscle": "core", "share": 0.4},
    {"muscle": "arms", "share": 0.3},
    {"muscle": "legs", "share": 0.3}
  ],
  "goals_addressed": ["flexibility", "mindfulness"],
  "reasoning": "Morning flow for mobility and focus"
}
```

### 8. Bodyweight Training (`"bodyweight"`)
For rep-based exercises using body weight without external load.
```json
{
  "exercise_type": "bodyweight",
  "exercise_name": "Push-ups",
  "sets": 3,
  "reps": [15, 12, 10],
  "rest_seconds": 60,
  "progression_level": "intermediate",
  "muscles_utilized": [
    {"muscle": "chest", "share": 0.5},
    {"muscle": "triceps", "share": 0.3},
    {"muscle": "core", "share": 0.2}
  ],
  "goals_addressed": ["strength", "endurance"],
  "reasoning": "Building upper body strength without equipment"
}
```

### 9. Isometric Training (`"isometric"`)
For hold-based exercises like planks and wall sits.
```json
{
  "exercise_type": "isometric",
  "exercise_name": "Plank",
  "sets": 3,
  "hold_duration_sec": [30, 45, 60],
  "rest_seconds": 60,
  "progression_level": "intermediate",
  "progression_notes": "Increase hold time by 10 seconds each week",
  "muscles_utilized": [
    {"muscle": "core", "share": 0.7},
    {"muscle": "shoulders", "share": 0.2},
    {"muscle": "glutes", "share": 0.1}
  ],
  "goals_addressed": ["core_strength", "stability"],
  "reasoning": "Building core stability through sustained contraction"
}
```

### 10. Plyometric Training (`"plyometric"`)
For explosive, jump-based movements.
```json
{
  "exercise_type": "plyometric",
  "exercise_name": "Box Jumps",
  "sets": 4,
  "reps": [8, 8, 6, 6],
  "rest_seconds": 120,
  "jump_height_cm": 60,
  "landing_emphasis": "soft_landing_control",
  "muscles_utilized": [
    {"muscle": "legs", "share": 0.8},
    {"muscle": "core", "share": 0.2}
  ],
  "goals_addressed": ["power", "explosiveness"],
  "reasoning": "Developing lower body power and athleticism"
}
```

### 11. Balance Training (`"balance"`)
For stability and proprioception work.
```json
{
  "exercise_type": "balance",
  "exercise_name": "Single Leg Stand",
  "sets": 3,
  "hold_duration_sec": [30, 45, 60],
  "difficulty_level": "intermediate",
  "support_used": "none",
  "muscles_utilized": [
    {"muscle": "legs", "share": 0.6},
    {"muscle": "core", "share": 0.4}
  ],
  "goals_addressed": ["stability", "injury_prevention"],
  "reasoning": "Improving proprioception and ankle stability"
}
```

### 12. Sport-Specific Training (`"sport_specific"`)
For sport-specific skill development.
```json
{
  "exercise_type": "sport_specific",
  "exercise_name": "Basketball Shooting Drill",
  "sport": "basketball",
  "drill_name": "Free Throw Practice",
  "duration_min": 15,
  "repetitions": 50,
  "skill_focus": "accuracy",
  "muscles_utilized": [
    {"muscle": "arms", "share": 0.4},
    {"muscle": "core", "share": 0.3},
    {"muscle": "legs", "share": 0.3}
  ],
  "goals_addressed": ["sport_performance"],
  "reasoning": "Improving free throw percentage through repetition"
}
```

## Implementation Benefits

### 1. Clear Type Safety
- Each exercise type has specific required fields
- Validation prevents missing or incorrect data
- API responses are predictable and consistent

### 2. LLM Guidance
- Clear instructions on which format to use for each exercise
- Reduces hallucination and format confusion
- Improved recommendation accuracy

### 3. Extensibility
- Easy to add new exercise types
- Maintains backward compatibility
- Flexible base schema for common properties

### 4. Better User Experience
- Consistent data structure for frontend
- Proper validation prevents errors
- Clear exercise categorization

## Usage Guidelines

### For Developers
1. Always specify `exercise_type` first when creating exercises
2. Include only the required fields for that exercise type
3. Use the base schema fields (muscles_utilized, goals_addressed, etc.) for all types
4. Validate responses using the TypedExerciseRecommendationSchema

### For LLM Prompts
1. Analyze the exercise to determine the correct type
2. Use the type-specific format guidelines
3. Include clear reasoning for exercise selection
4. Ensure muscle shares sum to 1.0

## Migration from Old Schema

The old `AlternateExerciseRecommendationSchema` with optional fields has been replaced. To migrate:

1. Determine the exercise type for each existing exercise
2. Map fields to the new type-specific structure
3. Remove unused optional fields
4. Add required type-specific fields

## Validation

The schema includes comprehensive validation:
- Required fields per exercise type
- Proper data types (integers, positive numbers, etc.)
- Muscle share validation (must sum to 1.0)
- Enum validation for categorical fields

This ensures data integrity and prevents common errors in exercise recommendations.
