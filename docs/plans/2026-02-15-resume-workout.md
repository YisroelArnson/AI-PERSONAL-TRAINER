# Resume Workout Implementation Plan

## Overview

Add the ability to persist an active workout to disk and resume it from the home screen. When a workout is in progress, the home screen shows two pills: a "Resume" pill with progress info and a "Start New Workout" pill with a confirm dialog.

**Spec**: `docs/specs/2026-02-15-resume-workout.md`

## Current State Analysis

- `WorkoutStore` is a `@Observable @MainActor` singleton holding all workout state in memory
- Dismissing the workout fullScreenCover calls `workoutStore.reset()`, wiping everything
- `showWorkoutFlow` is a computed binding that auto-presents when `sessionStatus` is `.generating/.active/.completing/.completed`
- Timer is a simple `sessionStartTime: Date?` with `elapsedMinutes` computed from `Date().timeIntervalSince(start)`
- All model types (`WorkoutSession`, `WorkoutInstance`, `UIExercise`, `CodableValue`) are already `Codable`
- `WorkoutPresentationMode` enum is NOT `Codable`

### Key Discoveries:
- `completedSets: [UUID: Set<Int>]` — UUID dictionary keys aren't directly JSON-friendly, need String conversion in the persistence struct
- `HomeView.showWorkoutFlow` binding (line 97) drives the fullScreenCover — needs decoupling from `sessionStatus`
- `WorkoutCompletionView` reads `workoutStore.elapsedMinutes` (line 54, 86) — timer rework must keep this working
- `WorkoutBottomBar` and `MidWorkoutActionSheet` trigger async API calls on WorkoutStore with no tracking of in-flight state

## Desired End State

- User can dismiss the workout screen mid-session and return to home
- Home screen shows a Resume pill (with "3/6 exercises") and a Start New pill
- Tapping Resume goes straight into the workout view at the exact point they left off
- Timer pauses on dismiss, resumes on re-entry — final duration reflects active time only
- State survives app kills via JSON file on disk
- Persisted state auto-expires after 6 hours
- Starting a new workout while one is in progress shows a confirmation dialog

### Verification:
1. Start workout, complete 2 exercises, dismiss → home shows Resume pill with "2/6 exercises"
2. Tap Resume → workout view opens at exercise 3, timer is accurate
3. Kill app, reopen → Resume pill still present, tap it → same state
4. Wait 6+ hours (or simulate) → pill disappears, normal Start Workout shown
5. Tap "Start New" with active workout → confirm dialog → discard and open pre-workout

## What We're NOT Doing

- Server-side session resume
- Partial workout logging (abandoned workouts are just discarded)
- Background timer or push notifications
- Persisting pre-workout inputs

---

## Phase 1: Persistence Layer

### Overview
Create the `ActiveWorkoutState` Codable struct and add `persist()`, `loadPersistedState()`, and `discardPersistedState()` methods to `WorkoutStore`. No behavior changes yet — just the plumbing.

### Changes Required:

#### 1. Add Codable conformance to WorkoutPresentationMode
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Make the enum Codable

```swift
enum WorkoutPresentationMode: String, Codable {
    case workout
    case list
}
```

#### 2. Create ActiveWorkoutState struct
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add the persistence struct below the enums, before the WorkoutStore class

```swift
struct ActiveWorkoutState: Codable {
    let session: WorkoutSession
    let instance: WorkoutInstance

    var currentExerciseIndex: Int
    var completedSets: [String: [Int]]  // UUID string -> sorted set indices
    var skippedExercises: [String]       // UUID strings
    var painFlaggedExercises: [String]   // UUID strings

    var presentationMode: WorkoutPresentationMode

    var accumulatedSeconds: TimeInterval
    var lastActiveAt: Date
}
```

Note: Using `[Int]` instead of `Set<Int>` for JSON compatibility. Convert on load/save.

#### 3. Add persistence methods to WorkoutStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add these methods in a new `// MARK: - Persistence` section before `// MARK: - Reset`

```swift
// MARK: - Persistence

private static let persistenceURL: URL = {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return docs.appendingPathComponent("active_workout.json")
}()

private static let expiryInterval: TimeInterval = 6 * 60 * 60 // 6 hours

var hasActivePersistedWorkout: Bool {
    sessionStatus == .active && currentInstance != nil
}

func persist() {
    guard sessionStatus == .active,
          let session = currentSession,
          let instance = currentInstance else { return }

    let state = ActiveWorkoutState(
        session: session,
        instance: instance,
        currentExerciseIndex: currentExerciseIndex,
        completedSets: completedSets.reduce(into: [:]) { result, pair in
            result[pair.key.uuidString] = Array(pair.value).sorted()
        },
        skippedExercises: skippedExercises.map { $0.uuidString },
        painFlaggedExercises: painFlaggedExercises.map { $0.uuidString },
        presentationMode: presentationMode,
        accumulatedSeconds: accumulatedSeconds,
        lastActiveAt: Date()
    )

    do {
        let data = try JSONEncoder().encode(state)
        let tempURL = Self.persistenceURL.appendingPathExtension("tmp")
        try data.write(to: tempURL, options: .atomic)
        try FileManager.default.moveItem(at: tempURL, to: Self.persistenceURL)
    } catch {
        // Move failed because destination exists — overwrite
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: Self.persistenceURL, options: .atomic)
        } catch {
            print("WorkoutStore: Failed to persist state: \(error)")
        }
    }
}

func loadPersistedState() -> Bool {
    guard FileManager.default.fileExists(atPath: Self.persistenceURL.path) else { return false }

    do {
        let data = try Data(contentsOf: Self.persistenceURL)
        let state = try JSONDecoder().decode(ActiveWorkoutState.self, from: data)

        // Check expiry
        if Date().timeIntervalSince(state.lastActiveAt) > Self.expiryInterval {
            discardPersistedState()
            return false
        }

        // Restore state
        currentSession = state.session
        currentInstance = state.instance
        sessionStatus = .active

        currentExerciseIndex = state.currentExerciseIndex
        completedSets = state.completedSets.reduce(into: [:]) { result, pair in
            if let uuid = UUID(uuidString: pair.key) {
                result[uuid] = Set(pair.value)
            }
        }
        skippedExercises = Set(state.skippedExercises.compactMap { UUID(uuidString: $0) })
        painFlaggedExercises = Set(state.painFlaggedExercises.compactMap { UUID(uuidString: $0) })

        presentationMode = state.presentationMode
        accumulatedSeconds = state.accumulatedSeconds

        return true
    } catch {
        print("WorkoutStore: Failed to load persisted state: \(error)")
        discardPersistedState()
        return false
    }
}

func discardPersistedState() {
    try? FileManager.default.removeItem(at: Self.persistenceURL)
}
```

Note: `accumulatedSeconds` doesn't exist yet on WorkoutStore — that's Phase 2. This code won't compile until Phase 2. That's fine; we're laying the foundation.

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds after Phase 1 + Phase 2 combined: `xcodebuild build`

#### Manual Verification:
- [ ] N/A — no user-facing changes yet

---

## Phase 2: Timer Rework

### Overview
Replace `sessionStartTime: Date?` with `accumulatedSeconds: TimeInterval` and `currentSegmentStart: Date?`. The timer pauses when the workout view is dismissed and resumes when re-entered.

### Changes Required:

#### 1. Replace timer properties on WorkoutStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Replace `sessionStartTime` and update `elapsedMinutes`

Remove:
```swift
var sessionStartTime: Date?
```

Add:
```swift
var accumulatedSeconds: TimeInterval = 0
var currentSegmentStart: Date?
```

Update `elapsedMinutes` computed property:
```swift
var elapsedMinutes: Int {
    var total = accumulatedSeconds
    if let segmentStart = currentSegmentStart {
        total += Date().timeIntervalSince(segmentStart)
    }
    return Int(total / 60)
}
```

#### 2. Update generateWorkout() to use new timer
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: In `generateWorkout()`, replace `sessionStartTime = Date()` with:

```swift
accumulatedSeconds = 0
currentSegmentStart = Date()
```

#### 3. Add pause/resume timer methods
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add in the Persistence section

```swift
func pauseTimer() {
    if let segmentStart = currentSegmentStart {
        accumulatedSeconds += Date().timeIntervalSince(segmentStart)
        currentSegmentStart = nil
    }
}

func resumeTimer() {
    currentSegmentStart = Date()
}
```

#### 4. Update reset() to clear new timer properties
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: In `reset()`, replace `sessionStartTime = nil` with:

```swift
accumulatedSeconds = 0
currentSegmentStart = nil
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `xcodebuild build`

#### Manual Verification:
- [ ] Start a workout, wait 1 minute, complete it — duration shows ~1 min on completion screen
- [ ] Timer still works correctly end-to-end

**Implementation Note**: After completing this phase and Phase 1, pause for manual confirmation that the timer works correctly before proceeding.

---

## Phase 3: In-Flight Action Tracking

### Overview
Track whether an async workout action (swap, flag pain, adjust difficulty, time scale) is in-flight so that the dismiss flow can wait for it to finish before persisting.

### Changes Required:

#### 1. Add in-flight tracking to WorkoutStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add a property in the Session State section

```swift
var inFlightActionCount: Int = 0
```

#### 2. Wrap each async action with tracking
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: In `flagPain()`, `swapExercise()`, `adjustDifficulty()`, and `timeScale()`, wrap the API call:

```swift
// At the start of each method, after the guard:
inFlightActionCount += 1
defer { inFlightActionCount -= 1 }
```

Add to each of the four methods: `flagPain()` (line 279), `swapExercise()` (line 301), `adjustDifficulty()` (line 323), `timeScale()` (line 345).

#### 3. Add a method to wait for in-flight actions
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add in the Persistence section

```swift
func waitForInFlightActions(timeout: TimeInterval = 3.0) async {
    let deadline = Date().addingTimeInterval(timeout)
    while inFlightActionCount > 0 && Date() < deadline {
        try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
    }
}
```

#### 4. Update reset() to clear tracking
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add to `reset()`:

```swift
inFlightActionCount = 0
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `xcodebuild build`

#### Manual Verification:
- [ ] N/A — behavior verified in Phase 4

---

## Phase 4: Dismiss Behavior

### Overview
Change the workout dismiss flow to persist state instead of resetting. Rework the `showWorkoutFlow` binding to use an explicit flag so persisted `.active` state doesn't auto-present the fullscreen cover.

### Changes Required:

#### 1. Add explicit presentation flag to WorkoutStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add in the View State section

```swift
var isWorkoutViewPresented: Bool = false
```

#### 2. Add suspend method to WorkoutStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add in the Persistence section

```swift
func suspendWorkout() async {
    await waitForInFlightActions()
    pauseTimer()
    showMidWorkoutActions = false
    persist()
    isWorkoutViewPresented = false
}
```

#### 3. Set presentation flag during generation
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: In `generateWorkout()`, right before `sessionStatus = .generating`, add:

```swift
isWorkoutViewPresented = true
```

#### 4. Add resume method to WorkoutStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add in the Persistence section

```swift
func resumeWorkout() {
    resumeTimer()
    isWorkoutViewPresented = true
}
```

#### 5. Rework showWorkoutFlow in HomeView
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: Replace the `showWorkoutFlow` computed binding (lines 97-113)

```swift
private var showWorkoutFlow: Binding<Bool> {
    Binding(
        get: {
            workoutStore.isWorkoutViewPresented
        },
        set: { newValue in
            if !newValue {
                Task {
                    await workoutStore.suspendWorkout()
                }
            }
        }
    )
}
```

#### 6. Update WorkoutView X button
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutView.swift`
**Changes**: The X button (line 18-25) calls `dismiss()` which triggers the fullScreenCover's `isPresented` setter, which now calls `suspendWorkout()`. No change needed here — it flows through the binding.

#### 7. Update reset() to also clear presentation flag and delete persisted file
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: Add to `reset()`:

```swift
isWorkoutViewPresented = false
discardPersistedState()
```

#### 8. Handle completed status dismiss
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: In `WorkoutFlowView`, the `.onChange(of: workoutStore.sessionStatus)` handler (line 243) dismisses on `.idle`. This still works because `completeWorkout()` eventually calls `reset()` which sets `isWorkoutViewPresented = false`. But we should also ensure the completion flow dismisses properly.

Update `WorkoutCompletionView` done button (line 177-191) — currently it calls `dismiss()` AND `completeWorkout()`. The dismiss triggers `suspendWorkout()` through the binding, but we actually want `reset()` here.

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutCompletionView.swift`
**Changes**: Update the done button action:

```swift
Button {
    Task {
        await workoutStore.completeWorkout(notes: notes.isEmpty ? nil : notes)
        workoutStore.reset()
    }
} label: {
    // ... unchanged
}
```

Remove the `dismiss()` call — `reset()` sets `isWorkoutViewPresented = false` which dismisses the fullScreenCover.

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `xcodebuild build`

#### Manual Verification:
- [ ] Start workout, dismiss with X → returns to home, no crash
- [ ] Start workout, complete it → completion flow works, returns to home
- [ ] Start workout, dismiss, kill app, reopen → app loads (no auto-present yet, that's Phase 5)

**Implementation Note**: After this phase, the dismiss no longer resets state and the file gets written to disk. But there's no way to resume from the home screen yet — that's Phase 5.

---

## Phase 5: Home Screen UI

### Overview
Show two pills on the home screen when a persisted workout exists. Resume pill shows progress, Start New shows a confirm dialog. Load persisted state on app launch.

### Changes Required:

#### 1. Load persisted state on home screen appear
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: At the start of `loadHomeData()` (line 177), add:

```swift
// Attempt to restore a persisted workout
let _ = workoutStore.loadPersistedState()
```

#### 2. Add confirm dialog state
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: Add state variable:

```swift
@State private var showDiscardConfirm = false
```

#### 3. Replace bottomActionBar with conditional layout
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: Replace the `bottomActionBar` computed property (lines 133-151):

```swift
private var bottomActionBar: some View {
    HStack(spacing: 10) {
        if workoutStore.hasActivePersistedWorkout {
            // Resume pill
            ResumePill(
                completedCount: workoutStore.totalCompletedExercises,
                totalCount: workoutStore.totalExercises,
                onTap: {
                    workoutStore.resumeWorkout()
                }
            )

            // Start New pill
            Button(action: {
                showDiscardConfirm = true
            }) {
                Text("New")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .frame(height: 50)
                    .padding(.horizontal, 16)
                    .background(
                        Capsule()
                            .fill(AppTheme.Colors.surface)
                    )
            }
            .buttonStyle(.plain)
        } else {
            // Normal workout pill
            WorkoutPill(
                title: workoutButtonTitle,
                onTap: {
                    if let event = todaysEvent {
                        workoutStore.startPlannedSession(calendarEvent: event)
                    } else {
                        workoutStore.startCustomSession()
                    }
                }
            )
        }

        // Space for AI Orb
        Color.clear
            .frame(width: 50, height: 50)
    }
}
```

#### 4. Add confirm dialog
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: Add after the existing `.alert` modifier (after line 75):

```swift
.alert("Discard Workout?", isPresented: $showDiscardConfirm) {
    Button("Discard", role: .destructive) {
        workoutStore.reset()
        if let event = todaysEvent {
            workoutStore.startPlannedSession(calendarEvent: event)
        } else {
            workoutStore.startCustomSession()
        }
    }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("This will discard your current workout. You can't undo this.")
}
```

#### 5. Create ResumePill component
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/Components/ResumePill.swift` (NEW FILE)

```swift
//
//  ResumePill.swift
//  AI Personal Trainer App
//
//  Pill showing in-progress workout with exercise progress.
//  Visually distinct from WorkoutPill to signal an active session.
//

import SwiftUI

struct ResumePill: View {
    let completedCount: Int
    let totalCount: Int
    let onTap: () -> Void

    private let pillHeight: CGFloat = 50

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Progress ring
                ZStack {
                    Circle()
                        .stroke(AppTheme.Colors.divider, lineWidth: 3)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(AppTheme.Colors.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 28, height: 28)

                // Text
                VStack(alignment: .leading, spacing: 1) {
                    Text("Resume Workout")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Text("\(completedCount)/\(totalCount) exercises")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }

                Spacer()

                // Play button
                Circle()
                    .fill(AppTheme.Colors.accent)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.background)
                            .offset(x: 1)
                    )
            }
            .padding(.leading, 12)
            .padding(.trailing, 9)
            .frame(height: pillHeight)
            .background(
                Capsule()
                    .fill(AppTheme.Colors.surface)
            )
        }
        .buttonStyle(.plain)
    }

    private var progress: CGFloat {
        guard totalCount > 0 else { return 0 }
        return CGFloat(completedCount) / CGFloat(totalCount)
    }
}
```

#### 6. Add ResumePill.swift to Xcode project
**File**: `AI Personal Trainer App/AI Personal Trainer App.xcodeproj/project.pbxproj`
**Changes**: Add the new file reference. (Handled by Xcode or manual pbxproj edit.)

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `xcodebuild build`

#### Manual Verification:
- [ ] Start workout, complete 2 exercises, dismiss → home shows Resume pill with "2/6 exercises" and a "New" pill
- [ ] Tap Resume → workout opens at exercise 3, timer is accurate
- [ ] Tap "New" → confirm dialog appears → "Discard" opens pre-workout sheet → "Cancel" does nothing
- [ ] Kill app, reopen → Resume pill still shows, tapping it resumes correctly
- [ ] Complete workout normally → returns to home, normal Start Workout pill shown
- [ ] Wait 6+ hours (change `expiryInterval` to 10s for testing) → Resume pill disappears

**Implementation Note**: After completing this phase, all user-facing functionality is complete. Test the full flow end-to-end.

---

## Phase 6: Polish & Edge Cases

### Overview
Handle the remaining edge cases from the spec: resume with all exercises complete, server session expiry on completion, and periodic auto-persist during the workout.

### Changes Required:

#### 1. Periodic auto-persist during active workout
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
**Changes**: In `WorkoutFlowView`, add a timer that persists every 30 seconds while active:

```swift
.onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { _ in
    if workoutStore.sessionStatus == .active {
        workoutStore.persist()
    }
}
```

Add this modifier to the `WorkoutView()` case inside the ZStack in WorkoutFlowView.

#### 2. Handle resume with all exercises complete
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: In `resumeWorkout()`, do NOT auto-transition to `.completing`. The current code already doesn't — `allExercisesComplete` is only checked in `completeCurrentSet()` and `skipExercise()`. The user will see the workout view with everything done and can tap "Finish Workout". No code change needed — just verify.

#### 3. Handle server session expiry on completion
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
**Changes**: In `completeWorkout(notes:)`, handle the API failure gracefully:

```swift
func completeWorkout(notes: String?) async {
    guard let session = currentSession else { return }

    let reflection = WorkoutReflection(
        rpe: nil,
        rir: nil,
        enjoyment: nil,
        pain: painFlaggedExercises.isEmpty ? nil : "Flagged \(painFlaggedExercises.count) exercise(s)",
        notes: notes
    )

    let log = WorkoutLogPayload(
        exercisesCompleted: totalCompletedExercises,
        setsCompleted: totalCompletedSets,
        totalDurationMin: elapsedMinutes
    )

    do {
        let response = try await apiService.completeWorkoutSession(
            sessionId: session.id,
            reflection: reflection,
            log: log
        )
        summary = response.summary
        sessionStatus = .completed
    } catch {
        // Server may have expired the session — still show completion with local data
        print("Complete workout failed: \(error)")
        summary = WorkoutSessionSummary(
            title: currentInstance?.title ?? "Workout",
            completion: WorkoutCompletion(
                exercises: totalCompletedExercises,
                totalSets: totalCompletedSets
            ),
            overallRpe: nil,
            painNotes: nil,
            wins: [],
            nextSessionFocus: ""
        )
        sessionStatus = .completed
    }
}
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `xcodebuild build`

#### Manual Verification:
- [ ] Start workout, complete all exercises, dismiss before tapping Finish → resume shows workout view (not completion screen), tap Finish works
- [ ] Simulate server failure (disconnect WiFi) → complete workout → still shows completion screen with local stats
- [ ] Start workout, wait 30+ seconds, kill app → reopen → state is preserved (auto-persist worked)

---

## Testing Strategy

### Manual Testing Steps:
1. **Happy path resume**: Start workout → do 2 exercises → dismiss → tap Resume → verify exercise index and timer
2. **App kill resume**: Start workout → do 2 exercises → dismiss → kill app → reopen → tap Resume → verify state
3. **Start new with confirm**: Start workout → dismiss → tap New → Cancel → nothing happens → tap New → Discard → pre-workout opens
4. **Complete after resume**: Start → dismiss → resume → finish all exercises → complete → returns to home
5. **Expiry**: Start workout → dismiss → (set expiry to 10s for test) → wait → reopen → normal Start Workout pill
6. **Mid-action dismiss**: Start workout → tap swap exercise → immediately dismiss → resume → verify exercise state is consistent
7. **Timer accuracy**: Start workout → note time → dismiss → wait 2 minutes → resume → verify timer didn't count the 2-minute gap

## References

- Spec: `docs/specs/2026-02-15-resume-workout.md`
- WorkoutStore: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift`
- HomeView: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
- WorkoutView: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutView.swift`
- WorkoutPill: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/Components/WorkoutPill.swift`
- WorkoutSessionModels: `AI Personal Trainer App/AI Personal Trainer App/Models/WorkoutSessionModels.swift`
