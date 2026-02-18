# Exercise Difficulty Adjustment — Implementation Plan

## Overview

Add two complementary features for adjusting exercise difficulty during a workout: (1) tappable chip editing with a stepper overlay for precise per-set edits, and (2) smart increase/decrease buttons that replace the single "Adjust Difficulty" row with type-aware logic.

See: `docs/specs/2026-02-17-exercise-difficulty-adjustment.md`

## Current State Analysis

- **WorkoutModeView.swift** renders exercises as flowing `AttributedString` paragraphs. Value chips are styled text via a `chip()` helper but are not interactive.
- **MidWorkoutActionSheet.swift** has a single "Adjust Difficulty" row calling `workoutStore.adjustDifficulty()` which sends `adjust_prescription` without a `direction` field (backend defaults to `"easier"`).
- **WorkoutStore.swift** is an `@Observable` singleton. Exercises are accessed via `currentInstance?.exercises` — `UIExercise` is a `let`-based struct, so values can't be mutated in place. No overrides dictionary exists.
- **Backend `adjustExerciseIntensity()`** (line 479) uses a flat 1.15/0.85 multiplier across all parameter types indiscriminately. No `user_override` action type exists in `applyAction()`.
- **ActiveWorkoutState** persists session, instance, completedSets, skipped/pain-flagged exercises, but has no field for exercise overrides.
- Existing tests cover the flat-multiplier behavior with fixtures for all 4 exercise types.

### Key Discoveries:
- `adjustExerciseIntensity()` at `trainerWorkouts.service.js:479` already accepts `direction` but applies the same multiplier to *every* numeric field — the spec wants type-aware primary/fallback logic instead.
- `applyAction()` at `trainerWorkouts.service.js:579` logs all actions as events before checking if the instance was updated — `user_override` can reuse this path and just skip instance modification.
- `WorkoutModeView.swift` builds paragraphs per exercise type with separate computed properties (`repsParagraph`, `holdParagraph`, etc.) — each calls `chip()` for editable values. We need to replace the `Text(exerciseAttributedString)` approach with a `FlowLayout` of tappable views since `AttributedString` doesn't support per-range tap gestures.
- `ActiveWorkoutState` is a `Codable` struct at `WorkoutStore.swift:30` — adding `exerciseOverrides` requires updating both the struct and the persist/load methods.

## Desired End State

1. Tapping any value chip in the exercise paragraph opens a stepper overlay anchored near it; adjustments apply per-set and are saved locally with a fire-and-forget `user_override` event.
2. The action sheet has two side-by-side buttons ("Decrease" / "Increase") instead of one "Adjust Difficulty" row.
3. The backend `adjustExerciseIntensity()` uses type-aware primary/fallback logic per the spec table.
4. The `user_override` action type is handled by `applyAction()` (log-only, no instance change).
5. Exercise overrides survive app backgrounding via `ActiveWorkoutState` persistence.

### Verification:
- All existing backend tests pass with updated assertions for the new logic.
- New backend tests cover the type-aware logic, boundary/fallback cases, and `user_override` action.
- iOS builds and runs; stepper overlay works for all 4 exercise types; overrides persist through suspend/resume.

## What We're NOT Doing

- No undo mechanism for edits.
- No whole-workout difficulty scaling from these buttons.
- No guard rails or caps on adjustment range.
- No visual diff of "prescribed vs. actual" during the workout.
- No exercise swap changes — that's a separate action.

## Implementation Approach

Four phases, each scoped to ≤3 files:

1. **Backend first** — Replace the flat multiplier with smart logic and add `user_override` handling. This is self-contained and testable.
2. **WorkoutStore overrides** — Add the `exerciseOverrides` infrastructure, methods to read/write overrides, fire-and-forget event logging, and persistence.
3. **Tappable chip stepper** — Refactor `WorkoutModeView` from `AttributedString` to tappable chip views with a stepper overlay.
4. **Smart difficulty buttons** — Replace the single action sheet row with two side-by-side buttons passing `direction`.

---

## Phase 1: Backend — Smart Difficulty Logic + User Override

### Overview
Replace the flat-multiplier `adjustExerciseIntensity()` with type-aware primary/fallback logic. Add `user_override` as a log-only action type.

### Changes Required:

#### 1. Smart difficulty logic
**File**: `BACKEND/services/trainerWorkouts.service.js`
**What changes**: Replace `adjustExerciseIntensity()` (lines 479-501) entirely.

```javascript
function adjustExerciseIntensity(exercise, direction) {
  const type = exercise.exercise_type || exercise.type;
  const sign = direction === 'harder' ? 1 : -1;

  switch (type) {
    case 'reps': {
      // Primary: adjust weight per set
      const hasLoad = Array.isArray(exercise.load_each) &&
                      exercise.load_each.some(l => l > 0);
      if (hasLoad) {
        const unit = exercise.load_unit || 'lbs';
        const step = unit === 'kg' ? 2.5 : 5;
        const adjusted = exercise.load_each.map(l =>
          Math.max(0, l + sign * step)
        );
        // If all loads would be 0 on decrease, fall back to reps
        if (direction === 'easier' && adjusted.every(l => l <= 0)) {
          return {
            ...exercise,
            reps: adjustArray(exercise.reps, sign, 1)
          };
        }
        return { ...exercise, load_each: adjusted };
      }
      // Fallback (bodyweight / no load): adjust reps
      return {
        ...exercise,
        reps: adjustArray(exercise.reps, sign, 1)
      };
    }
    case 'hold': {
      // Primary: adjust hold duration per set (+/- 5s)
      const adjusted = adjustArray(exercise.hold_duration_sec, sign * 5, 5);
      // Fallback: if already at minimum (all <= 5s on decrease), adjust sets
      if (direction === 'easier' &&
          Array.isArray(exercise.hold_duration_sec) &&
          exercise.hold_duration_sec.every(d => d <= 5)) {
        return {
          ...exercise,
          sets: Math.max(1, (exercise.sets || 1) + sign)
        };
      }
      return { ...exercise, hold_duration_sec: adjusted };
    }
    case 'duration': {
      // Primary: pace adjustment (not numeric — skip if no target_pace)
      // Fallback: adjust duration_min +/- 5
      const dur = exercise.duration_min || 10;
      return {
        ...exercise,
        duration_min: Math.max(5, dur + sign * 5)
      };
    }
    case 'intervals': {
      // Primary: adjust rounds +/- 1
      const rounds = exercise.rounds || 1;
      if (direction === 'easier' && rounds <= 1) {
        // Fallback: adjust work_sec +/- 5
        return {
          ...exercise,
          work_sec: Math.max(5, (exercise.work_sec || 20) + sign * 5)
        };
      }
      return {
        ...exercise,
        rounds: Math.max(1, rounds + sign)
      };
    }
    default:
      return exercise;
  }
}

// Helper: adjust each element of an array by `step`, floored at `min`
function adjustArray(arr, step, min) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(v => Math.max(min, v + step));
}
```

#### 2. User override action
**File**: `BACKEND/services/trainerWorkouts.service.js`
**What changes**: Add a `user_override` case inside the `switch` block in `applyAction()` (after line 655, before `default`). It's a no-op for instance mutation — the event is logged by the existing code after the switch.

```javascript
    case 'user_override':
      // Log-only — event is recorded by the logEvent() call below the switch.
      // No instance modification needed.
      break;
```

#### 3. Update tests
**File**: `BACKEND/__tests__/trainerWorkouts.test.js`
**What changes**: Replace the existing `adjustExerciseIntensity` describe block with tests for the new type-aware logic. Add a test for the `user_override` action type.

New test cases for `adjustExerciseIntensity`:
- **Reps + load**: harder increases load_each by step; easier decreases load_each
- **Reps bodyweight (no load)**: harder increases reps; easier decreases reps
- **Reps at zero load boundary**: easier falls back to decreasing reps
- **Hold**: harder increases hold_duration_sec by 5; easier decreases
- **Hold at minimum boundary (5s)**: easier falls back to decreasing sets
- **Duration**: harder increases duration_min by 5; easier decreases, floor at 5
- **Intervals**: harder increases rounds; easier decreases rounds
- **Intervals at 1 round boundary**: easier falls back to decreasing work_sec

New test case for `applyAction`:
- **user_override**: logs event, returns `instanceUpdated: false`, instance unchanged

#### 4. Add bodyweight fixture
**File**: `BACKEND/__tests__/fixtures/exercises.js`
**What changes**: Add a `bodyweightRepsExercise` fixture (e.g., Push-ups: reps type, no load_each) for testing the bodyweight fallback path.

```javascript
const bodyweightRepsExercise = {
  exercise_name: 'Push-ups',
  exercise_type: 'reps',
  muscles_utilized: [{ muscle: 'chest', share: 0.6 }, { muscle: 'triceps', share: 0.4 }],
  goals_addressed: [{ goal: 'upper body endurance', share: 1.0 }],
  reasoning: 'Bodyweight pressing movement',
  exercise_description: 'Standard push-up from the floor.',
  equipment: [],
  sets: 3,
  reps: [15, 15, 12],
  load_each: null,
  load_unit: null,
  hold_duration_sec: null,
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: 60
};
```

### Success Criteria:

#### Automated Verification:
- [ ] All existing tests pass: `cd BACKEND && npm test`
- [ ] New `adjustExerciseIntensity` tests pass for all 4 types + boundary cases
- [ ] New `user_override` applyAction test passes
- [ ] No regressions in other test suites

#### Manual Verification:
- [ ] N/A — backend-only changes, verified by tests

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: iOS — WorkoutStore Overrides Infrastructure

### Overview
Add the `exerciseOverrides` dictionary to WorkoutStore so the UI can mutate individual exercise fields per-set without modifying the immutable `UIExercise` structs. Include persistence and fire-and-forget event logging.

### Changes Required:

#### 1. ExerciseOverrides type + WorkoutStore state
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**What changes**:

Add types before the `WorkoutStore` class:

```swift
// MARK: - Exercise Overrides

/// Per-set field overrides for an exercise. Keys are field names, values are per-set overrides.
/// Example: ["load_each": [0: 35.0, 1: 35.0]] means sets 0 and 1 have load overridden to 35.
struct ExerciseOverrides: Codable, Equatable {
    var fields: [String: [Int: Double]]  // fieldName -> [setIndex: newValue]

    init() { fields = [:] }

    mutating func set(field: String, setIndex: Int, value: Double) {
        fields[field, default: [:]][setIndex] = value
    }

    func value(for field: String, setIndex: Int) -> Double? {
        fields[field]?[setIndex]
    }
}
```

Add to `WorkoutStore` properties (after `painFlaggedExercises`):

```swift
var exerciseOverrides: [UUID: ExerciseOverrides] = [:]
```

Add override-aware accessors:

```swift
/// Get the effective value for a field/set, checking overrides first
func effectiveValue(exerciseId: UUID, field: String, setIndex: Int, fallback: Double) -> Double {
    exerciseOverrides[exerciseId]?.value(for: field, setIndex: setIndex) ?? fallback
}

/// Apply a user override for a specific field/set and fire event
func applyOverride(exerciseId: UUID, exerciseName: String, field: String, setIndex: Int, oldValue: Double, newValue: Double) {
    if exerciseOverrides[exerciseId] == nil {
        exerciseOverrides[exerciseId] = ExerciseOverrides()
    }
    exerciseOverrides[exerciseId]?.set(field: field, setIndex: setIndex, value: newValue)

    // Fire-and-forget event logging
    if let session = currentSession {
        Task {
            let payload: [String: CodableValue] = [
                "exercise_id": .string(exerciseId.uuidString),
                "exercise_name": .string(exerciseName),
                "field": .string(field),
                "set_index": .int(setIndex),
                "old_value": .double(oldValue),
                "new_value": .double(newValue)
            ]
            try? await apiService.sendWorkoutAction(
                sessionId: session.id,
                actionType: "user_override",
                payload: payload
            )
        }
    }
}
```

#### 2. Clear overrides on instance replacement
**What changes**: In each mid-workout action method (`adjustDifficulty`, `swapExercise`, `flagPain`, `timeScale`), after `currentInstance = updatedInstance`, add:

```swift
exerciseOverrides = [:] // Backend-driven changes replace local overrides
```

#### 3. Clear overrides on reset
**What changes**: In `reset()`, add `exerciseOverrides = [:]` alongside the other state clears.

#### 4. Persistence
**What changes**: Add `exerciseOverrides` to `ActiveWorkoutState`:

```swift
struct ActiveWorkoutState: Codable {
    // ... existing fields ...
    var exerciseOverrides: [String: ExerciseOverrides]  // UUID string -> overrides
}
```

Update `persist()` to encode overrides:
```swift
exerciseOverrides: exerciseOverrides.reduce(into: [:]) { result, pair in
    result[pair.key.uuidString] = pair.value
},
```

Update `loadPersistedState()` to decode overrides:
```swift
exerciseOverrides = state.exerciseOverrides.reduce(into: [:]) { result, pair in
    if let uuid = UUID(uuidString: pair.key) {
        result[uuid] = pair.value
    }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] iOS project builds without errors

#### Manual Verification:
- [ ] N/A — infrastructure only, no UI yet. Will be verified through Phase 3.

**Implementation Note**: After completing this phase and confirming the build succeeds, proceed to Phase 3.

---

## Phase 3: iOS — Tappable Chip Stepper Overlay

### Overview
Refactor `WorkoutModeView` to make value chips tappable. When tapped, a stepper overlay appears for adjusting the value. The exercise name chip and connecting text remain non-interactive.

### Changes Required:

#### 1. Refactor from AttributedString to tappable views
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutModeView.swift`
**What changes**:

The current `Text(exerciseAttributedString)` approach cannot support per-chip tap gestures. Replace with a `FlowLayout`-style approach using SwiftUI's `Layout` protocol or a wrapping `HStack`. Each segment is either a tappable `ChipView` or a plain `Text`.

Define a segment enum:
```swift
enum ParagraphSegment: Identifiable {
    case plain(String)
    case chip(label: String, field: String?, setIndex: Int?)

    var id: String { /* unique id based on content */ }
    var isTappable: Bool { field != nil }
}
```

Build an array of segments for each exercise type instead of an `AttributedString`. Render with a wrapping flow layout:

```swift
WrappingHStack(segments) { segment in
    switch segment {
    case .plain(let text):
        Text(text).font(.system(size: 18))
    case .chip(let label, let field, _):
        Text(" \(label) ")
            .font(.system(size: 18, weight: .semibold))
            .background(AppTheme.Colors.highlight)
            .onTapGesture { if field != nil { showStepper(for: segment) } }
    }
}
```

The `field` value identifies what the chip controls (`"load_each"`, `"reps"`, `"hold_duration_sec"`, `"rest_seconds"`, `"duration_min"`, `"work_sec"`, `"rounds"`). Exercise name chips and structural chips (set numbers, "of") have `field: nil` and are not tappable.

#### 2. Stepper overlay
**What changes**: Add a stepper overlay view (inline in the same file or as a small private struct). Appears when a chip is tapped, anchored near it.

```swift
private struct ChipStepperOverlay: View {
    let field: String
    let unit: String
    @Binding var value: Double
    let step: Double
    let minimum: Double
    let onDismiss: (Double) -> Void

    var body: some View {
        HStack(spacing: 16) {
            Button("-") { value = max(minimum, value - step) }
                .disabled(value <= minimum)

            Text(formattedValue)
                .font(.system(size: 20, weight: .semibold))
                .onTapGesture { /* open keyboard entry */ }

            Text(unit)
                .font(.system(size: 14))
                .foregroundStyle(AppTheme.Colors.secondaryText)

            Button("+") { value += step }
        }
        .padding()
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 4)
    }
}
```

Stepper increments per field (from the spec):

| Field | Step | Unit | Minimum |
|-------|------|------|---------|
| `load_each` (lbs) | 5 | lbs | 0 |
| `load_each` (kg) | 2.5 | kg | 0 |
| `reps` | 1 | reps | 1 |
| `hold_duration_sec` | 5 | sec | 5 |
| `rest_seconds` | 15 | sec | 0 |
| `duration_min` | 5 | min | 5 |
| `rounds` | 1 | rounds | 1 |
| `work_sec` | 5 | sec | 5 |

#### 3. Connect to WorkoutStore
**What changes**: On stepper dismiss, call `workoutStore.applyOverride(...)` with the exercise ID, field, set index, old value, and new value. The chip label updates immediately because `exerciseOverrides` is `@Observable` state.

When building segment labels, read from overrides first:
```swift
let load = workoutStore.effectiveValue(
    exerciseId: exercise.id,
    field: "load_each",
    setIndex: setIdx,
    fallback: exercise.load_each?[setIdx] ?? 0
)
```

### Success Criteria:

#### Automated Verification:
- [ ] iOS project builds without errors

#### Manual Verification:
- [ ] Tapping a value chip (weight, reps, hold duration, rest, etc.) opens the stepper
- [ ] Tapping the exercise name chip does nothing
- [ ] Stepper +/- buttons adjust the value with correct increments
- [ ] Stepper buttons disable at the floor (can't go below 1 rep, 0 weight, etc.)
- [ ] Dismissing the stepper saves the override — chip label updates
- [ ] Override applies only to the tapped set — other sets retain prescribed values
- [ ] Overrides survive app background/resume (kill and reopen within 6 hours)
- [ ] Tapping keyboard entry on the number works for direct input

**Implementation Note**: After completing this phase and all manual verification passes, proceed to Phase 4.

---

## Phase 4: iOS — Smart Difficulty Buttons

### Overview
Replace the single "Adjust Difficulty" row in MidWorkoutActionSheet with two side-by-side buttons: "Decrease Difficulty" and "Increase Difficulty". Each sends the `direction` field to the backend.

### Changes Required:

#### 1. Two side-by-side buttons
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/MidWorkoutActionSheet.swift`
**What changes**: Replace the single `actionRow` for "Adjust Difficulty" (lines 34-40) with an `HStack` of two buttons:

```swift
HStack(spacing: 8) {
    difficultyButton(
        icon: "minus.circle",
        title: "Easier",
        direction: "easier"
    )
    difficultyButton(
        icon: "plus.circle",
        title: "Harder",
        direction: "harder"
    )
}
```

Add a helper:
```swift
private func difficultyButton(icon: String, title: String, direction: String) -> some View {
    Button {
        isLoading = true
        Task {
            await workoutStore.adjustDifficulty(direction: direction)
            isLoading = false
            dismiss()
        }
    } label: {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(AppTheme.Colors.secondaryText)
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.Colors.primaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
    }
    .buttonStyle(.plain)
    .disabled(isLoading)
}
```

#### 2. Update WorkoutStore.adjustDifficulty to accept direction
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**What changes**: Change the method signature and payload:

```swift
func adjustDifficulty(direction: String = "easier") async {
    guard let session = currentSession, let exercise = currentExercise else { return }
    inFlightActionCount += 1
    defer { inFlightActionCount -= 1 }

    do {
        let payload: [String: CodableValue] = [
            "exercise_id": .string(exercise.id.uuidString),
            "exercise_name": .string(exercise.exercise_name),
            "direction": .string(direction)
        ]
        let response = try await apiService.sendWorkoutAction(
            sessionId: session.id,
            actionType: "adjust_prescription",
            payload: payload
        )
        if let updatedInstance = response.instance {
            currentInstance = updatedInstance
            exerciseOverrides = [:]
        }
    } catch {
        errorMessage = "Failed to adjust difficulty."
        print("Adjust difficulty failed: \(error)")
    }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] iOS project builds without errors

#### Manual Verification:
- [ ] Action sheet shows two side-by-side buttons where "Adjust Difficulty" used to be
- [ ] Tapping "Easier" decreases the primary parameter for the exercise type
- [ ] Tapping "Harder" increases the primary parameter for the exercise type
- [ ] Loading state shows while the API call is in progress
- [ ] Action sheet dismisses after the action completes
- [ ] Local overrides are cleared when auto-adjust returns a new instance

**Implementation Note**: After completing this phase, the feature is complete.

---

## Testing Strategy

### Unit Tests (Backend):
- Type-aware adjustment for each of the 4 exercise types (harder + easier)
- Boundary/fallback: bodyweight reps, hold at 5s minimum, intervals at 1 round
- `user_override` action logs event without modifying instance
- Existing `scaleWorkoutInstance` and `estimateWorkoutDuration` tests unchanged

### Manual Testing Steps (iOS):
1. Generate a workout with a mix of exercise types (reps, hold, duration, intervals)
2. Tap a weight chip → verify stepper with 5lb/2.5kg increment
3. Tap a reps chip → verify stepper with 1-rep increment
4. Adjust a value, dismiss, verify chip updates and other sets unchanged
5. Open action sheet → verify two difficulty buttons
6. Tap "Harder" on a reps exercise → verify weight increases
7. Tap "Easier" on a hold exercise → verify hold duration decreases
8. Background the app, reopen → verify overrides persist
9. Tap auto-adjust after manual edits → verify overrides clear

## References

- Spec: `docs/specs/2026-02-17-exercise-difficulty-adjustment.md`
- Backend service: `BACKEND/services/trainerWorkouts.service.js:479-501` (current), `:579-679` (applyAction)
- Backend tests: `BACKEND/__tests__/trainerWorkouts.test.js:162-208`
- iOS WorkoutModeView: `AI Personal Trainer App/.../Features/Workout/WorkoutModeView.swift`
- iOS MidWorkoutActionSheet: `AI Personal Trainer App/.../Features/Workout/MidWorkoutActionSheet.swift`
- iOS WorkoutStore: `AI Personal Trainer App/.../Services/WorkoutStore.swift`
