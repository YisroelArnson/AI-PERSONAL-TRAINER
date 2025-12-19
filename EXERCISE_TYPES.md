# Exercise Types Documentation

This document provides a comprehensive overview of all exercise types supported in the AI Personal Trainer application.

## Overview

The application supports **11 distinct exercise types**, each designed to accommodate different training modalities and tracking requirements. Each exercise type has specific parameters and characteristics that define how it is structured, tracked, and displayed.

---

## Exercise Types

### 1. Strength (`strength`)

**Description:** Traditional resistance training exercises using external weights (barbells, dumbbells, machines, etc.)

**Key Parameters:**
- `sets`: Number of sets (positive integer)
- `reps`: Array of repetitions per set (e.g., [8, 8, 6, 6])
- `load_kg_each`: Array of weights in kilograms for each set (e.g., [80, 80, 85, 85])
- `rest_seconds`: Rest time between sets (optional, positive integer)

**Examples:**
- Barbell Bench Press
- Squats
- Deadlifts
- Overhead Press

**Tracking:**
- Sets and reps are tracked individually
- Weight progression is monitored per set
- Rest periods between sets are included

---

### 2. Cardio Distance (`cardio_distance`)

**Description:** Distance-based cardiovascular exercises where the primary metric is distance covered

**Key Parameters:**
- `distance_km`: Target distance in kilometers (positive number)
- `duration_min`: Estimated or actual duration in minutes (optional, positive integer)
- `target_pace`: Target pace as a string (e.g., "5:30/km") (optional)

**Examples:**
- Running
- Cycling
- Rowing
- Swimming

**Tracking:**
- Distance covered is the primary metric
- Pace can be tracked and compared to target
- Duration is optional but can be used for pace calculation

---

### 3. Cardio Time (`cardio_time`)

**Description:** Time-based cardiovascular exercises focused on steady-state endurance

**Key Parameters:**
- `duration_min`: Duration in minutes (positive integer)

**Examples:**
- Steady-state running
- Elliptical training
- Stationary cycling
- Treadmill walking

**Tracking:**
- Duration is the primary metric
- No distance tracking required

---

### 4. HIIT (`hiit`)

**Description:** High-Intensity Interval Training with alternating work and rest periods

**Key Parameters:**
- `rounds`: Number of rounds/cycles (positive integer)
- `intervals`: Array of interval objects with:
  - `work_sec`: Work phase duration in seconds (positive integer)
  - `rest_sec`: Rest phase duration in seconds (positive integer)
- `total_duration_min`: Total workout duration in minutes (optional, positive integer)

**Examples:**
- Tabata workouts
- Sprint intervals
- Burpee circuits
- Battle rope intervals

**Tracking:**
- Rounds completed
- Work/rest intervals are timed
- Total duration can be tracked

---

### 5. Circuit (`circuit`)

**Description:** Circuit training with multiple exercises performed in sequence, repeated for multiple rounds

**Key Parameters:**
- `circuits`: Number of complete circuit rounds (positive integer)
- `exercises_in_circuit`: Array of exercise objects, each containing:
  - `name`: Exercise name (string)
  - `duration_sec`: Duration in seconds (optional, positive integer)
  - `reps`: Number of repetitions (optional, positive integer)
- `rest_between_circuits_sec`: Rest time between complete circuits (positive integer)

**Examples:**
- Full-body circuit
- Upper body circuit
- Lower body circuit
- Cardio-strength hybrid circuit

**Tracking:**
- Each exercise in the circuit can be tracked individually
- Circuit rounds are counted
- Rest periods between circuits are included

---

### 6. Flexibility (`flexibility`)

**Description:** Stretching and flexibility exercises based on hold positions

**Key Parameters:**
- `holds`: Array of hold objects, each containing:
  - `position`: Name/description of the stretch position (string)
  - `duration_sec`: Hold duration in seconds (positive integer)
- `repetitions`: Number of times to repeat the sequence (optional, positive integer)

**Examples:**
- Static stretching
- PNF stretching
- Dynamic stretching sequences
- Mobility work

**Tracking:**
- Each hold position is tracked with its duration
- Repetitions of the sequence can be counted
- Focus on hold duration and position quality

---

### 7. Yoga (`yoga`)

**Description:** Yoga flows and sequences with poses held for specific durations or breath counts

**Key Parameters:**
- `sequence`: Array of pose objects, each containing:
  - `pose`: Name of the yoga pose (string)
  - `duration_sec`: Duration in seconds (optional, positive integer)
  - `breaths`: Number of breaths to hold the pose (optional, positive integer)
- `total_duration_min`: Total sequence duration in minutes (positive integer)

**Examples:**
- Vinyasa flow
- Hatha yoga sequence
- Yin yoga holds
- Power yoga

**Tracking:**
- Each pose in the sequence is tracked
- Duration or breath count per pose
- Total flow duration

---

### 8. Bodyweight (`bodyweight`)

**Description:** Repetition-based exercises using only body weight, no external load

**Key Parameters:**
- `sets`: Number of sets (positive integer)
- `reps`: Array of repetitions per set (e.g., [15, 15, 12])
- `rest_seconds`: Rest time between sets (optional, positive integer)

**Examples:**
- Push-ups
- Pull-ups
- Bodyweight squats
- Burpees
- Dips

**Tracking:**
- Sets and reps are tracked (similar to strength)
- No weight tracking
- Typically higher rep ranges than weighted exercises

---

### 9. Isometric (`isometric`)

**Description:** Static hold exercises where muscles are contracted without movement

**Key Parameters:**
- `sets`: Number of sets (positive integer)
- `hold_duration_sec`: Array of hold durations in seconds for each set (e.g., [30, 30, 45])
- `rest_seconds`: Rest time between holds (optional, positive integer)

**Examples:**
- Plank holds
- Wall sits
- Isometric squats
- L-sits
- Hollow body holds

**Tracking:**
- Hold duration per set is the primary metric
- Sets are counted
- Rest periods between holds are included

---

### 10. Balance (`balance`)

**Description:** Balance and stability exercises focused on maintaining positions

**Key Parameters:**
- `sets`: Number of sets (positive integer)
- `hold_duration_sec`: Array of hold durations in seconds for each set (e.g., [30, 30, 30])

**Examples:**
- Single-leg stands
- Tree pose
- Bosu ball exercises
- Stability ball exercises
- Proprioception drills

**Tracking:**
- Hold duration per set
- Sets are counted
- Focus on stability and balance maintenance

---

### 11. Sport Specific (`sport_specific`)

**Description:** Sport-specific drills and skill practice exercises

**Key Parameters:**
- `sport`: Name of the sport (string)
- `drill_name`: Name of the specific drill (string)
- `duration_min`: Duration of the drill in minutes (positive integer)
- `repetitions`: Number of drill repetitions (optional, positive integer)
- `skill_focus`: Focus area (e.g., "accuracy", "speed", "technique") (string)

**Examples:**
- Basketball shooting drills
- Soccer passing drills
- Tennis serve practice
- Golf swing practice
- Martial arts forms

**Tracking:**
- Duration of the drill
- Repetitions can be counted
- Skill focus area is noted

---

## Common Parameters Across All Exercise Types

All exercise types share these common parameters:

- `exercise_name`: Name of the exercise (string)
- `aliases`: Alternative names for the exercise (optional array of strings)
- `muscles_utilized`: Array of muscle groups with utilization share (optional)
- `goals_addressed`: Array of fitness goals with contribution share (optional)
- `reasoning`: Explanation for why this exercise was recommended (string)
- `exercise_description`: Detailed description of the exercise (optional string)
- `equipment`: List of required equipment (optional array of strings)
- `movement_pattern`: Movement patterns involved (optional array of strings)
- `body_region`: Primary body region targeted (optional string)

---

## Movement Patterns

The application recognizes the following movement patterns:

- `squat`: Knee-dominant lower body movements
- `hinge`: Hip-dominant lower body movements
- `push`: Horizontal and vertical pushing movements
- `pull`: Horizontal and vertical pulling movements
- `carry`: Loaded carries and farmer walks
- `rotation_core`: Rotation, anti-rotation, and core stability
- `isolation`: Single-joint accessory movements
- `conditioning`: Steady-state cardio and intervals

---

## Exercise Type Selection Guidelines

When creating exercises, the type should be selected based on:

1. **Primary training modality**: What is the main focus?
2. **Tracking requirements**: What metrics need to be captured?
3. **Equipment needs**: Is external weight required?
4. **Movement characteristics**: Is it dynamic, static, or interval-based?

---

## Notes

- Exercise types are mutually exclusive - each exercise has exactly one type
- The type determines which parameters are required and how the exercise is displayed in the UI
- Interval timers and tracking mechanisms adapt based on the exercise type
- The backend validation ensures that only appropriate parameters are included for each exercise type

---

*Last Updated: Based on codebase analysis of Exercise.swift, recommend.service.js, and interval.service.js*

