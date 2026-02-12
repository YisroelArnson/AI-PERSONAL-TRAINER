---
name: Integrated Timer System
overview: Integrate timer generation directly into the recommendation engine so timers stream alongside exercises, then redesign the frontend to use a Dynamic Island-style expandable timer UI that feels intuitive and frictionless during workouts.
todos:
  - id: backend-schema
    content: Add ExerciseTimerSchema to recommend.service.js and extend all 12 exercise types
    status: pending
  - id: backend-prompt
    content: Update system prompt with timer generation guidelines per exercise type
    status: pending
  - id: ios-timer-model
    content: Create ExerciseTimer and TimerSegment models in IntervalTimer.swift
    status: pending
  - id: ios-api-models
    content: Add timer field to StreamingExercise in APIModels.swift
    status: pending
  - id: ios-pill-view
    content: Create TimerPillView component for collapsed state
    status: pending
  - id: ios-expanded-view
    content: Create TimerExpandedView component with segment timeline and controls
    status: pending
  - id: ios-dynamic-timer
    content: Create DynamicTimerView that orchestrates pill/expanded transitions
    status: pending
  - id: ios-viewmodel-refactor
    content: Refactor IntervalTimerViewModel to use integrated timer data
    status: pending
  - id: ios-homeview-integration
    content: Replace IntervalTimerOverlay with DynamicTimerView in HomeView
    status: pending
  - id: haptics-audio
    content: Implement haptic feedback and audio cues for timer states
    status: pending
  - id: cleanup
    content: Remove old interval service code once integrated timer is stable
    status: pending
---

# Integrated Timer System

## Current State

The app currently has **two separate systems**:

- **Recommendation service** generates exercises via streaming
- **Interval service** generates timers in a separate LLM call after exercises load

This causes latency, potential mismatches, and a disjointed UX.---

## Architecture Changes

### Backend: Single Integrated Call

Add `timer` field to each exercise type in `recommend.service.js`:

```javascript
// New timer schema to add to each exercise type
const TimerSegmentSchema = z.object({
  duration_sec: z.number().positive(),
  label: z.string(),
  intent: z.enum(["work", "rest", "prepare"]),
  cue: z.boolean().default(false),
});

const ExerciseTimerSchema = z.object({
  title: z.string(),
  rounds: z.number().int().positive().or(z.literal("infinite")).default(1),
  segments: z.array(TimerSegmentSchema).min(1),
  start_delay_sec: z.number().nonnegative().default(3),
  total_duration_cap_sec: z.number().positive().optional(),
});
```

Each exercise type (strength, hiit, yoga, etc.) gets `.extend({ timer: ExerciseTimerSchema })`.Update the system prompt to include timer generation guidelines (your detailed examples for each exercise type).

### Frontend: New Timer UI Flow

```javascript
+------------------+      tap       +----------------------+
|   Timer Pill     | ------------> |   Expanded Island    |
| [30s Rest Timer] |               |                      |
+------------------+               |  [Edit]       [X]    |
       ^                           |                      |
       |  tap outside              |  +--------------+    |
       |  while running            |  | 3 x 30s work |    |
       |                           |  | 3 x 10s rest |    |
       +---------------------------|  +--------------+    |
                                   |                      |
                                   |  [ START ]           |
                                   +----------------------+
                                           |
                                           | tap start
                                           v
                                   +----------------------+
                                   |   Running State      |
                                   |                      |
                                   |       :28            |
                                   |      WORK            |
                                   |   "Set 2 of 3"       |
                                   |                      |
                                   |  [||]      [Stop]    |
                                   +----------------------+
```

---

## Key Files to Modify

### Backend

| File | Changes ||------|---------|| [`BACKEND/services/recommend.service.js`](BACKEND/services/recommend.service.js) | Add `ExerciseTimerSchema` to base schema, update prompt with timer guidelines |

### Frontend (iOS)

| File | Changes ||------|---------|| [`APIModels.swift`](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Models/APIModels.swift) | Add `StreamingTimer` and `TimerSegment` structs || [`HomeView.swift`](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Home/HomeView.swift) | Replace `IntervalTimerOverlay` with new `DynamicTimerView` || **New:** `DynamicTimerView.swift` | Main timer component with pill/expanded states || **New:** `TimerExpandedView.swift` | Expanded Dynamic Island content || **New:** `TimerPillView.swift` | Collapsed pill display || [`IntervalTimerViewModel.swift`](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/IntervalTimerViewModel.swift) | Refactor to use new `ExerciseTimer` model from streaming || [`IntervalTimer.swift`](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Models/IntervalTimer.swift) | Add new unified timer model |---

## Timer UX States

### 1. Pill State (Collapsed)

- Position: Bottom center, between Complete and AI buttons
- Size: ~120pt wide capsule
- Shows: Timer title (e.g., "3x90s Rest") or countdown when running
- Tap: Expands to Dynamic Island

### 2. Expanded State (Pre-start)

- Slides up from pill, covers bottom ~40% of screen
- Frosted glass background (matches app aesthetic)
- Shows:
- **Title** at top
- **Edit button** (pencil icon) top-right for AI adjustments
- **Segment timeline** - visual preview of work/rest/prepare phases
- **Key metrics**: total duration, rounds, work/rest ratio
- **START button** - large, prominent
- Tap outside or X button: Collapses back to pill

### 3. Running State

- Can be collapsed (pill shows countdown) or expanded
- **Countdown phase**: 3-2-1 with haptics before timer starts
- **Active display**:
- Large countdown number (current segment)
- Current segment label ("WORK", "REST", "HOLD")
- Detail text ("Set 2 of 3", "Halfway!")
- Progress ring or bar
- **Controls**: Pause/Resume, Stop (resets)
- **Feedback**:
- Haptic at 3-2-1, segment transitions, completion
- Audio cues (configurable in settings)

### 4. Completion State

- Brief celebration animation
- Auto-prompts: "Log exercise?" or transitions to next exercise
- Timer resets to pre-start state

---

## Timer Schema Per Exercise Type

| Type | Timer Pattern ||------|---------------|| **Strength** | Rest timer between sets (60-180s), optional tempo || **Bodyweight** | Rest timer between sets (30-90s) || **HIIT** | Work/rest intervals with rounds || **Isometric** | Hold countdown with rest between || **Cardio Time** | Total duration with milestone cues || **Cardio Distance** | Split alerts every X minutes || **Circuit** | Station work + transition + circuit rest || **Yoga** | Pose holds with breathing cues || **Flexibility** | Hold duration per side with switch cues |---

## Implementation Notes

### Removing Separate Interval Service

- Keep `IntervalService.swift` temporarily for fallback
- Once integrated timer is stable, deprecate `/intervals/` endpoints
- Remove `interval.service.js` from backend

### Streaming Compatibility

The timer is included in each streamed exercise object, so it arrives with the exercise - no second API call needed.

### Edit Flow (Future Enhancement)

When user taps edit pencil: