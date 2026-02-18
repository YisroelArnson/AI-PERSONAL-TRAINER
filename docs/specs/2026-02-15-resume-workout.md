# Resume Workout

**Date**: 2026-02-15
**Status**: Draft

## Problem

When a user dismisses the workout screen mid-session (e.g. to check something on the home screen, or iOS kills the app), all workout state is lost. `WorkoutStore.reset()` is called on dismiss, wiping the session, progress, and timer. There's no way to get back to an in-progress workout.

## Solution

Persist active workout state to disk and surface a "Resume Workout" pill on the home screen when an in-progress session exists. The user can seamlessly return to exactly where they left off, even after an app kill.

## User Experience

### Happy Path: Resume

1. User starts a workout via the normal pre-workout flow
2. Mid-workout, user dismisses the workout screen (X button or swipe)
3. Workout state persists — the screen closes but nothing is lost
4. Home screen bottom bar now shows **two pills**:
   - **Resume pill** — visually distinct, shows progress (e.g. "3/6 exercises done"). Tapping goes straight into the workout view (no pre-workout sheet).
   - **Start New Workout pill** — secondary/smaller styling. Opens the normal pre-workout flow.
5. User taps Resume, picks up exactly where they left off (same exercise, same completed sets, correct elapsed time)

### Happy Path: Start New

1. User has an in-progress workout but wants to start fresh
2. Taps "Start New Workout" pill
3. Confirmation dialog: "This will discard your current workout. Continue?"
4. On confirm: in-progress session is discarded, pre-workout sheet opens as normal
5. On cancel: nothing happens

### Timer Behavior

- When the user leaves the workout screen, the elapsed time **pauses**
- Accumulated time is stored as a total (not derived from `sessionStartTime`)
- When the user resumes, the timer picks up from the accumulated value
- Final workout duration reflects actual active workout time only

### Auto-Expiry

- Persisted workout state includes a `lastActiveAt` timestamp
- On app launch / home screen load, check if the persisted workout is older than **6 hours**
- If expired: silently discard the persisted state, show normal "Start Workout" pill
- If not expired: show the Resume + Start New pills

## Technical Design

### Persistence Layer

Store workout execution state as a JSON file on disk using `Codable`.

**File location**: App's documents directory, e.g. `Documents/active_workout.json`

**Persisted data** (`ActiveWorkoutState`):

```swift
struct ActiveWorkoutState: Codable {
    // Session data
    let session: WorkoutSession
    let instance: WorkoutInstance

    // Progress
    var currentExerciseIndex: Int
    var completedSets: [String: Set<Int>] // UUID string -> set indices
    var skippedExercises: Set<String>     // UUID strings
    var painFlaggedExercises: Set<String> // UUID strings

    // View state
    var presentationMode: WorkoutPresentationMode // .workout or .list

    // Timing
    var accumulatedSeconds: TimeInterval
    var lastActiveAt: Date
}
```

Note: UUID keys are stored as strings for Codable compatibility.

### WorkoutStore Changes

1. **Remove `reset()` from dismiss path** — dismissing the workout view no longer wipes state. Instead, it pauses the timer and persists to disk.

2. **New methods**:
   - `persist()` — serialize current execution state to disk. Called on dismiss and periodically during the workout.
   - `loadPersistedState() -> Bool` — attempt to load from disk on app launch. Returns true if a valid, non-expired session was restored.
   - `discardPersistedState()` — delete the file and reset. Called when starting a new workout or when the session expires.

3. **Timer rework**:
   - Replace `sessionStartTime: Date?` with `accumulatedSeconds: TimeInterval` and `currentSegmentStart: Date?`
   - `elapsedMinutes` computed property sums `accumulatedSeconds` + time since `currentSegmentStart` (if active)
   - On dismiss: add current segment to `accumulatedSeconds`, nil out `currentSegmentStart`
   - On resume: set `currentSegmentStart = Date()`

4. **Status on dismiss**: When the workout view is dismissed while `sessionStatus == .active`, transition to a new status `.suspended` (or keep `.active` — the view presentation is driven separately). The `sessionStatus` stays `.active` so `showWorkoutFlow` binding logic can be adjusted to not auto-present on resume until the user taps the pill.

### HomeView Changes

1. **`showWorkoutFlow` binding**: Currently auto-presents when status is `.generating/.active/.completing/.completed`. Needs a new flag `isWorkoutViewPresented` that the user controls explicitly, so a persisted `.active` session doesn't auto-present on app launch.

2. **Bottom bar**: Conditionally render two pills when `workoutStore.hasPersistedWorkout` is true:
   - Resume pill: shows exercise progress from persisted state
   - Start New pill: opens pre-workout flow after confirm dialog

3. **Expiry check**: In `loadHomeData()` or `onAppear`, call `workoutStore.loadPersistedState()` to hydrate state and check expiry.

### WorkoutView Changes

1. **X button dismiss**: Instead of triggering `reset()`, call `workoutStore.persist()` then `dismiss()`.
2. **Resume entry**: When opened from the Resume pill, the workout view reads the already-hydrated `WorkoutStore` state — no changes needed to the view itself.

## Edge Cases & Error Handling

### Data Integrity

- **Corrupt file on disk**: If JSON deserialization fails, silently discard and show normal Start Workout. Log the error.
- **App killed during persist**: Write to a temp file first, then atomically move to the final path to avoid partial writes.
- **Low disk space**: If `persist()` fails (write error), log the error but don't crash. The workout continues in-memory as normal — the user just loses resume-on-kill protection. Consider showing a subtle warning if we can detect the write failure.
- **Multiple rapid dismiss/resume cycles**: `persist()` is idempotent, writing the same file path each time. No accumulation of stale files.

### In-Flight API Calls

- **Dismiss during swap/flag-pain/adjust API call**: If an async action (swap exercise, flag pain, adjust difficulty) is in-flight when the user dismisses, we have a race condition. **Solution**: Before persisting on dismiss, wait for any in-flight workout action to complete (with a short timeout ~3s). If the action completes, persist the updated state. If it times out, persist the pre-action state — the user loses that one action but keeps everything else. Track in-flight actions with a simple counter or `Task` reference on `WorkoutStore`.

### Session & Server State

- **Workout data references stale server state**: The persisted `WorkoutInstance` and `WorkoutSession` are self-contained snapshots. No server round-trip needed to resume. Completion still calls the API as normal.
- **Server session expiry**: The backend may have its own TTL on workout sessions. If the user resumes after several hours and taps "Finish Workout", `completeWorkoutSession` could fail with a 404 or expired error. **Solution**: If completion fails with a session-not-found error, still show the completion screen with local data (exercises completed, duration, etc.) and display a note like "Workout saved locally but couldn't sync to server." Don't lose the user's sense of accomplishment. Optionally retry or create a new session to log the results.
- **Orphaned server sessions from interrupted generation**: If the user kills the app during `.generating`, the server has an open session but the client has no persisted state. Next workout creates a new session via `forceNew: true`. The orphaned session sits on the server. **Solution**: Accept this for v1 — orphaned sessions are harmless. Backend can clean them up with a TTL job later.

### Workout Status Transitions

- **User leaves during `.generating` status**: Don't persist generating state — there's nothing to resume yet. Only persist when status is `.active`.
- **User leaves during `.completing`/`.completed`**: Don't persist — let the completion flow finish or reset naturally.
- **Resume with all exercises already complete**: If the user completed the last set right before dismissing, on resume `allExercisesComplete` returns true. **Solution**: Don't auto-transition to `.completing` on resume. Let the user see the workout view with everything checked off, and tap "Finish Workout" themselves. This avoids a jarring jump straight to the completion screen.
- **User completes workout after resuming**: Normal completion flow. After completion, delete the persisted file.

### View State

- **Presentation mode not persisted**: If the user was in list view (`.list`) when they dismissed, they'd snap back to single-exercise view on resume. **Solution**: Persist `presentationMode` as part of `ActiveWorkoutState`.
- **Mid-workout action sheet was open**: If `showMidWorkoutActions` was true on dismiss, don't persist that — always resume with the sheet closed. Same for any other transient sheet/alert state.

### Calendar & Home Screen Conflicts

- **Calendar event changes while workout is suspended**: The user started today's planned "Upper Body" session, left halfway. A cron job or schedule change modifies today's calendar event. On return, the home screen shows a Resume pill for the in-progress workout AND potentially different planned session info. **Solution**: The Resume pill takes priority and uses data from the persisted workout state (not the calendar). The "Start New Workout" pill follows normal calendar logic. No conflict — they're independent.

## What We're NOT Building

- Server-side session resume (the backend already has `createOrResumeWorkoutSession` but we're not using it for this — state is fully client-side)
- Workout history / partial workout logging (if you abandon, it's just gone)
- Background timer or notifications ("You left a workout in progress!")
- Persisting pre-workout inputs (location, energy, time) — only execution state

## Open Questions

None — all decisions resolved during spec interview.

## Decision Log

| Decision | Options Considered | Choice | Reasoning |
|----------|-------------------|--------|-----------|
| Persistence scope | In-memory only, disk, disk + server sync | Disk persistence | Survives app kills without backend complexity |
| Timer behavior on leave | Pause, keep running, ignore for v1 | Pause the clock | Duration should reflect actual workout time |
| Home screen UX | Replace text, visual distinction, both | Visual distinction + two pills | Resume pill shows progress, separate "Start New" pill |
| Abandon old workout | No abandon, confirm to abandon, auto-expire, separate buttons | Two pills + confirm dialog | Clear UX with safety net before discarding progress |
| What to persist | Everything, execution state only | Execution state only | Pre-workout inputs are irrelevant after generation |
| Auto-expiry | Time-based, never, next-day boundary | 6-hour expiry | Reasonable window — covers breaks but clears stale sessions |
