# Exercise Difficulty Adjustment

**Date**: 2026-02-17
**Status**: Draft

## Problem

During a workout, users need to adjust exercise parameters — the prescribed weight is too heavy, they want more reps, or the hold duration is too long. Currently, the only option is a single "Adjust Difficulty" button that calls the backend and applies a blunt 15% multiplier across all parameters. Users have no way to make precise, per-set edits, and the auto-adjustment isn't smart about which parameter to change.

## Solution

Two complementary features:

1. **Tappable chip editing** — Tap any value chip in the exercise paragraph (weight, reps, hold duration, etc.) to open a stepper overlay. Adjust the value with +/- buttons or tap the number for direct keyboard entry. Changes apply only to the tapped set and are saved locally with a lightweight event logged to the backend.

2. **Smart increase/decrease buttons** — Replace the single "Adjust Difficulty" row in the action sheet with two side-by-side buttons. Each calls the backend, which picks the most logical parameter to adjust based on exercise type.

## User Experience

### Tappable Chip Editing

1. User is on the exercise page (WorkoutModeView), viewing the flowing paragraph with inline chip highlights (e.g., " 40 kg ", " 10 reps ").
2. User taps a chip (e.g., the "40 kg" chip on set 2).
3. A stepper overlay appears anchored near the tapped chip with:
   - A **minus (-)** button on the left
   - The **current value** in the center (tappable to open numeric keyboard)
   - A **plus (+)** button on the right
   - A label showing the unit (kg, reps, sec, etc.)
4. User adjusts the value via stepper or direct entry.
5. The chip updates immediately in the paragraph text.
6. The change applies **only to that set** — other sets retain their prescribed values.
7. Dismissing the stepper (tap outside or confirm) saves the edit.

### Smart Difficulty Buttons

1. User taps the pencil button to open MidWorkoutActionSheet.
2. Where "Adjust Difficulty" used to be, there are now two side-by-side buttons:
   - **Decrease Difficulty** (left) — makes the current exercise easier
   - **Increase Difficulty** (right) — makes the current exercise harder
3. User taps one. A loading state appears briefly.
4. The backend adjusts the most logical parameter for the exercise type (see Technical Design).
5. The action sheet dismisses, and the exercise paragraph reflects the updated values.

## Technical Design

### Data Model

No new database tables. The existing `trainer_workout_events` table captures `user_override` events.

**User override event shape** (logged to `trainer_workout_events`):
```json
{
  "event_type": "action",
  "data": {
    "action_type": "user_override",
    "payload": {
      "exercise_id": "uuid",
      "exercise_name": "Barbell Bench Press",
      "field": "load_each",
      "set_index": 1,
      "old_value": 40,
      "new_value": 35
    },
    "timestamp": "iso8601"
  }
}
```

### Local Exercise Mutation

WorkoutStore needs the ability to mutate individual exercise fields per-set. Since `UIExercise` is currently a `let`-based struct inside `WorkoutInstance`, the store will maintain a local overrides dictionary:

```
var exerciseOverrides: [UUID: ExerciseOverrides]
```

Where `ExerciseOverrides` holds per-set field changes. When rendering, the exercise paragraph reads from overrides first, falling back to the original prescribed values. When logging the workout, overrides are merged into the final logged data.

### Stepper Increments

| Field | Increment |
|-------|-----------|
| Weight (lbs) | 5 |
| Weight (kg) | 2.5 |
| Reps | 1 |
| Hold duration (sec) | 5 |
| Rest (sec) | 15 |
| Duration (min) | 5 |
| Rounds | 1 |
| Work interval (sec) | 5 |

### Smart Difficulty Adjustment Logic

Replace the current `adjustExerciseIntensity()` flat multiplier with type-aware logic:

| Exercise Type | Primary Adjustment | Fallback (at boundary) |
|---|---|---|
| **Reps** | Weight: +/- 5 lbs or 2.5 kg per set | Reps: +/- 1 per set |
| **Hold** | Hold duration: +/- 5s per set | Sets: +/- 1 |
| **Duration** | Pace adjustment (slower/faster) | Duration: +/- 5 min |
| **Intervals** | Rounds: +/- 1 | Work duration: +/- 5s |

**Boundary conditions for fallback:**
- Reps type: Falls back to reps if the exercise has no load (bodyweight) or load is 0.
- Hold type: Falls back to sets if hold duration is already at minimum (5s for decrease).
- Duration type: Falls back to duration if no target_pace is set.
- Intervals type: Falls back to work_sec if rounds are already at 1 (for decrease).

The backend `adjust_prescription` action continues to create a new workout instance version (existing pattern), but uses this smarter logic instead of the flat multiplier.

### API Changes

The existing `adjust_prescription` action type gains a required `direction` field in the payload:

```json
{
  "action_type": "adjust_prescription",
  "payload": {
    "exercise_id": "uuid",
    "exercise_name": "Barbell Bench Press",
    "direction": "harder"
  }
}
```

The `direction` field (`"harder"` or `"easier"`) is now explicitly sent by the client. Previously the backend defaulted to `"easier"`.

No new endpoints needed. The `user_override` action type is new but uses the existing `applyAction` pathway — it just logs the event without modifying the instance.

### Files Touched

**iOS (Frontend):**
- `WorkoutModeView.swift` — Make chips tappable, show stepper overlay
- `MidWorkoutActionSheet.swift` — Replace single row with two side-by-side buttons
- `WorkoutStore.swift` — Add `exerciseOverrides` dictionary, override reading/merging logic, `user_override` event firing

**Backend:**
- `services/trainerWorkouts.service.js` — Replace `adjustExerciseIntensity()` with type-aware logic, add `user_override` case to `applyAction`

## Edge Cases & Error Handling

- **Tapping a non-editable chip** (e.g., exercise name, "of"): Only value chips are tappable. The exercise name chip and connecting text are not interactive.
- **Keyboard entry of invalid values**: Floor at 0 for all fields. Reps, sets, rounds floor at 1. Empty input reverts to the previous value.
- **Stepper below minimum**: Stepper buttons disable at the floor (e.g., can't go below 1 rep, 0 weight, 5s hold).
- **Backend auto-adjust at boundary**: If primary parameter can't be adjusted further, use fallback. If fallback also can't be adjusted, no-op (return instance unchanged).
- **User edits a value then taps auto-adjust**: Auto-adjust works on the latest instance from the backend, which doesn't include local overrides. The local overrides are replaced by the new instance from the backend. This is acceptable — the auto-adjust is a "reset and re-prescribe" action.
- **Backend event logging fails**: Local edit still applies. Fire-and-forget — don't block the UI on event logging success.
- **Persistence**: `exerciseOverrides` must be included in `ActiveWorkoutState` so they survive app backgrounding/resume.

## What We're NOT Building

- No undo mechanism for edits
- No whole-workout difficulty scaling from these buttons (time_scale already handles that)
- No guard rails or caps on how far values can be adjusted
- No visual diff showing "prescribed vs. actual" during the workout
- No exercise swap changes (that's a separate action)

## Decision Log

| Decision | Options Considered | Choice | Reasoning |
|----------|-------------------|--------|-----------|
| Where edits live | Local only, Local + event, Backend round-trip | Local + event (B) | Fast UX, no blocking, but data is still captured for training history |
| Picker style | Scroll wheel, Stepper, Text field | Stepper + tappable number for keyboard | Stepper for quick adjustments, keyboard for precise entry |
| Button placement | Inline in action sheet, On workout view, Both | Inline in action sheet (A) | Keeps the main workout view clean, consistent with other actions |
| Auto-adjust scope | Current exercise, Whole workout | Current exercise only | More precise, user controls exactly what changes |
| Guard rails | Caps/limits, No limits | No limits | Keep it simple for v1, trust the user |
| Auto-adjust logic | Flat multiplier, Type-aware primary/fallback | Type-aware | Smarter — bumping weight for reps exercises is more useful than scaling everything 15% |

## Open Questions

None — ready for planning.
