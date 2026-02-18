# Workout Generation & Calendar — Implementation Plan

## Overview

Implement the full workout generation, execution, and calendar system as specified in `docs/specs/2025-02-14-workout-generation-and-calendar.md`. The iOS app is in a transitional state (old workout UI deleted, new one not built), while the backend has foundational infrastructure that needs targeted refactoring. This plan prioritizes the core workout loop first, then layers on supporting systems.

## Current State Analysis

### Backend (further along)
- `trainerWorkouts.service.js` — Already generates workouts via Claude directly (standalone, not through agent). Has session management, action handling (swap, adjust, pain flag, time scale).
- `trainerCalendar.service.js` — Calendar CRUD + 28-day projection from active program. Has event lifecycle (reschedule, skip, complete).
- `trainerProgram.service.js` — Full program lifecycle (draft → edit → approve → activate). Stores as JSON with markdown conversion.
- `agent/tools/exercises.js` — Separate in-memory exercise system for agent conversations. Needs to be unified with the generation service.
- No weights profile system exists.
- No cron jobs exist.

### iOS (broken transitional state)
- `HomeView.swift` — References deleted `ExerciseStore` and `WorkoutSessionStore`. Has sheet state variables but no sheet views.
- `WorkoutPill.swift` — Exists, positioned at bottom of home screen. Already receives workout name + duration.
- All API endpoints defined in `APIService.swift` (session create, generate, action, complete, calendar CRUD).
- All models exist (`Exercise`, `UIExercise`, `WorkoutSessionModels`, `ProgramModels`, `MonitoringModels`).
- No pre-workout screen, workout execution view, or completion screen exists.

### Key Discoveries
- `trainerWorkouts.service.js:~280` — `generateWorkoutInstance()` already calls Claude with user context (body stats, location, equipment, history). This IS the standalone generation endpoint — it just needs structured pre-workout inputs added.
- `HomeView.swift` — Already fetches `upcomingEvents: [CalendarEvent]` and searches for today's planned session. The data flow exists but the UI is broken.
- `WorkoutSessionModels.swift` — `WorkoutGenerateRequest` already has `readiness: WorkoutReadiness?` with energy/soreness/pain fields and `timeAvailableMin`. The iOS model is ready.
- `agent/tools/exercises.js` — Maintains its own in-memory exercise array, separate from the workout instance system. Two parallel systems that need unification.

## Desired End State

A user can:
1. Open the app and see today's planned workout on the home screen button
2. Tap to start → confirm location, energy, time on pre-workout screen
3. AI generates a personalized workout using program + weights profile + context
4. Execute the workout in swipeable exercise-by-exercise mode or list overview
5. Complete sets with a Done button, swap/adjust exercises mid-workout
6. Finish and see a summary with wins and next session focus
7. Their weights profile updates automatically in the background
8. Every Sunday night, the AI rewrites their program and regenerates next week's calendar

### Verification
- Build and deploy to iPhone (`xcodebuild` + `devicectl`)
- Walk through the full loop: home → pre-workout → generate → execute → complete
- Verify calendar shows planned sessions and completed history
- Verify weekly review runs and regenerates calendar

## What We're NOT Doing

- AI orb coach interaction (separate spec)
- Calendar UI (user-facing calendar view — separate effort, trainer data hub exists)
- Workout sharing/export
- Rep/weight logging per set (Done button only, v1)
- Rest timers between standard exercises
- User-visible progression tracker

---

## Phase 1: Core Workout Loop (iOS)

### Overview
Get the user from home screen → pre-workout → generated workout → exercise execution → completion. This is the critical path. Delete broken references, create new state management, build all missing views.

### Changes Required

#### 1. Create `WorkoutStore.swift` (replaces deleted ExerciseStore + WorkoutSessionStore)

**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutStore.swift` (NEW)

Single source of truth for workout state. Observable singleton that manages the full session lifecycle.

```swift
@Observable
class WorkoutStore {
    static let shared = WorkoutStore()

    // Session state
    var currentSession: WorkoutSession?
    var currentInstance: WorkoutInstance?
    var sessionStatus: WorkoutSessionStatus = .idle // idle, preWorkout, generating, active, completing, completed

    // Exercise execution state
    var currentExerciseIndex: Int = 0
    var currentSetIndex: Int = 0
    var completedSets: [String: [Int]] = [:] // exerciseId -> completed set indices
    var skippedExercises: Set<String> = []
    var painFlaggedExercises: Set<String> = []

    // View state
    var presentationMode: WorkoutPresentationMode = .workout // .list or .workout
    var showMidWorkoutActions: Bool = false

    // Pre-workout inputs (captured before generation)
    var selectedLocation: Location?
    var energyLevel: Int = 3 // 0-5
    var timeAvailableMin: Int = 60

    // Computed
    var currentExercise: UIExercise? { ... }
    var totalExercises: Int { ... }
    var isLastSet: Bool { ... }
    var isLastExercise: Bool { ... }
    var allComplete: Bool { ... }

    // Actions
    func startPlannedSession(calendarEvent: CalendarEvent) async { ... }
    func startCustomSession(description: String) async { ... }
    func generateWorkout() async { ... }
    func completeCurrentSet() { ... }
    func skipExercise() { ... }
    func flagPain() async { ... }
    func swapExercise() async { ... }
    func adjustDifficulty() async { ... }
    func timeScale(targetMinutes: Int) async { ... }
    func completeWorkout(reflection: WorkoutReflection) async { ... }
    func reset() { ... }
}
```

#### 2. Refactor `HomeView.swift`

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`

Changes:
- Remove `@StateObject var exerciseStore = ExerciseStore.shared` (deleted)
- Remove `@StateObject var workoutSessionStore = WorkoutSessionStore.shared` (deleted)
- Add `@State var workoutStore = WorkoutStore.shared`
- Update WorkoutPill binding to use today's calendar event data
- Wire sheet presentations to WorkoutStore state
- Add navigation to workout execution screen when generation completes

Today's workout logic (already partially exists):
```swift
var todaysWorkout: CalendarEvent? {
    upcomingEvents.first { event in
        Calendar.current.isDateInToday(event.startAt) &&
        event.status != "completed" && event.status != "skipped"
    }
}

var workoutButtonTitle: String {
    if let event = todaysWorkout, let session = event.plannedSession {
        // Show session title from intent
        return session.intentJson?["focus"]?.stringValue ?? event.title ?? "Today's Workout"
    }
    return "Start Workout"
}
```

#### 3. Update `WorkoutPill.swift`

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/Components/WorkoutPill.swift`

Changes:
- Accept `title: String` instead of `workoutName` + `duration` separately
- The title comes from HomeView's `workoutButtonTitle` computed property
- Keep scrolling animation behavior
- Keep play button styling

#### 4. Create Pre-Workout Sheet

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/PreWorkoutSheet.swift` (NEW)

Three-input confirmation screen:
- **Location picker** — Pre-filled from `UserDataStore.currentLocation`. Dropdown/sheet to change. Shows equipment list for selected location.
- **Energy level** — Row of 6 tappable buttons (0–5). Visual styling (e.g. color gradient from red to green).
- **Time available** — Pre-filled from planned session's `estimated_duration_min`. Stepper or preset buttons (15, 30, 45, 60, 90 min).
- **Confirm button** — Sets values on WorkoutStore, triggers `generateWorkout()`.

For custom workouts (no planned session), the same sheet is used but with a text field added at the top: "What do you want to work on?" plus a mic button for voice input. This becomes the `requestText` on `WorkoutGenerateRequest`. One screen for both planned and custom — the text field only appears when there's no planned session.

#### 5. Create Workout Execution Screen

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutView.swift` (NEW)

Container view that holds both presentation modes and the bottom bar.

```swift
struct WorkoutView: View {
    @State var workoutStore = WorkoutStore.shared

    var body: some View {
        VStack(spacing: 0) {
            // Top bar: progress counter ("2 of 6") on left, mode toggle button on right
            HStack {
                WorkoutProgressBar(current: workoutStore.currentExerciseIndex + 1,
                                 total: workoutStore.totalExercises)
                Spacer()
                // Small icon button to toggle list/workout mode
                ModeToggleButton(mode: $workoutStore.presentationMode)
            }

            // Middle: exercise content (togglable)
            if workoutStore.presentationMode == .workout {
                WorkoutModeView()
            } else {
                ListModeView()
            }

            // Bottom bar: edit button + done button
            WorkoutBottomBar()
        }
    }
}
```

#### 6. Create Workout Mode View (swipeable)

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutModeView.swift` (NEW)

Full-screen, one exercise at a time, swipeable left/right.

- **TabView with `.page` style** for swipe navigation between exercises.
- Each page shows the exercise in **paragraph format**:
  - Exercise name (bold, large)
  - Key values highlighted with background chips (sets, reps, weight)
  - Form cues woven into text naturally
  - Example: "**Dumbbell Bench Press** — Set `3` of `3`. Aim for `10-12 reps` at `25 lb`. Keep your shoulder blades pinched together throughout."
- Set counter updates when user taps Done.
- Uses `exercise.exercise_description` from the AI generation for the paragraph text. Falls back to a constructed description from the exercise fields if description is empty.

#### 7. Create List Mode View

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/ListModeView.swift` (NEW)

Compact checklist of all exercises.

- Each line: exercise name, sets × reps (or equivalent for hold/duration/intervals), load/weight
- Completed exercises get a checkmark and dim styling
- Current exercise is highlighted
- Tap an exercise to jump to it in workout mode
- Minimal scrolling — no cards, just clean line items

#### 8. Create Workout Bottom Bar

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutBottomBar.swift` (NEW)

Persistent bottom bar with two elements:
- **Edit button** (pencil icon) — Opens mid-workout action menu (Phase 2)
- **Done button** (primary, large) — Completes current set. Label shows "Done" or "Next Exercise" or "Finish Workout" depending on state.

#### 9. Create Workout Completion Screen

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutCompletionView.swift` (NEW)

Two-step completion:

**Step 1: Summary**
- Workout title
- Exercises completed / total
- Total time
- Wins (from `WorkoutSessionSummary.wins`)
- Next session focus (from `WorkoutSessionSummary.nextSessionFocus`)

**Step 2: Optional Notes**
- Text field for typing notes
- Mic button for voice input (use existing `SpeechManager`)
- "Done" button saves and dismisses
- Notes are sent as part of `WorkoutReflection` on completion

#### 10. Integrate Custom Workout into PreWorkoutSheet

No separate screen. When there's no planned session (user tapped "Start Workout"), the PreWorkoutSheet adds a text field at the top: "What do you want to work on?" with a mic button for voice input. The rest of the sheet (location, energy, time) stays the same below it. One screen, one confirm button.

### Success Criteria

#### Automated Verification
- [ ] App builds without errors: `xcodebuild -project "AI Personal Trainer App.xcodeproj" -scheme "AI Personal Trainer App" -destination "id=00008120-001215180132201E" -configuration Debug build`
- [ ] No references to deleted `ExerciseStore` or `WorkoutSessionStore` remain

#### Manual Verification
- [ ] Home screen shows today's planned session title in the bottom button
- [ ] Home screen shows "Start Workout" when no session is planned
- [ ] Tapping the button opens pre-workout sheet with location pre-filled
- [ ] Energy level buttons work (0-5 selection)
- [ ] Time available adjusts
- [ ] Confirm generates a workout (exercises appear)
- [ ] Workout mode shows exercises one at a time with paragraph format
- [ ] Swiping navigates between exercises
- [ ] Progress bar updates correctly
- [ ] List mode shows compact checklist
- [ ] Mode toggle switches between views
- [ ] Done button completes sets and advances
- [ ] Finishing all exercises triggers completion screen
- [ ] Summary shows exercises completed, wins, next focus
- [ ] Notes can be entered via text
- [ ] Custom workout flow works (describe → pre-workout → generate)

**Pause here for manual testing before proceeding to Phase 2.**

---

## Phase 2: Mid-Workout Actions (iOS)

### Overview
Add the edit button menu for modifying the workout in progress. The backend already supports these actions via `POST /sessions/:id/actions`.

### Changes Required

#### 1. Create Mid-Workout Action Sheet

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/MidWorkoutActionSheet.swift` (NEW)

Sheet presented when user taps the pencil/edit button. Options:

- **Swap exercise** — "Replace with an alternative". Calls `workoutStore.swapExercise()` → `POST /sessions/:id/actions` with `actionType: "swap_exercise"`. Returns new exercise, replaces current in the instance.
- **Adjust difficulty** — "Change weight/reps/intensity". Calls `workoutStore.adjustDifficulty()` → `POST /sessions/:id/actions` with `actionType: "adjust_prescription"`. Returns modified exercise.
- **Time scale** — "Compress or extend remaining workout". Shows a time picker (shorter/longer). Calls `workoutStore.timeScale(targetMinutes:)` → `POST /sessions/:id/actions` with `actionType: "time_scale"`.
- **Pain flag** — "Flag discomfort on this exercise". Calls `workoutStore.flagPain()` → `POST /sessions/:id/actions` with `actionType: "flag_pain"`. Marks exercise, may reduce volume.
- **Skip exercise** — "Move past without replacement". Calls `workoutStore.skipExercise()`. Advances to next exercise locally, logs skip.

Each option is a row with icon + title + subtitle. Tapping executes the action and dismisses the sheet.

#### 2. Wire Edit Button in WorkoutBottomBar

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Workout/WorkoutBottomBar.swift`

Update the edit button (pencil icon) to present `MidWorkoutActionSheet`.

### Success Criteria

#### Automated Verification
- [ ] App builds without errors

#### Manual Verification
- [ ] Edit button opens action menu during workout
- [ ] Swap exercise replaces current exercise with a new one
- [ ] Adjust difficulty modifies the current exercise parameters
- [ ] Time scale adjusts remaining workout duration
- [ ] Pain flag marks the exercise and adjusts volume
- [ ] Skip advances to next exercise

**Pause here for manual testing before proceeding to Phase 3.**

---

## Phase 3: Backend — Generation Endpoint Refactor

### Overview
Fix a critical gap: the active program is not currently fed into workout generation. Also add structured pre-workout inputs and unify the agent's exercise tool with the generation service.

### Changes Required

#### 1. Update `trainerWorkouts.service.js` — Feed Program + Pre-Workout Inputs into Generation

**File**: `BACKEND/services/trainerWorkouts.service.js`

The `generateWorkoutInstance()` function calls Claude with user context but **does not include the active training program**. The program defines the strategy (current phase, rep ranges, exercise rules, guardrails, Coach's Notes) — without it, Claude is generating blind.

Update to:

- **Fetch the active program** via `trainerProgram.service.getActiveProgram(userId)` and include it in the Claude prompt. This is the most important input — it tells Claude what kind of workout to generate.
- Accept structured pre-workout inputs: `{ energy_level, time_available_min, location_id, equipment, intent, request_text }`
- Include these explicitly in the Claude prompt (not buried in generic metadata)
- Add the weights profile as an input (once Phase 4 is complete)

Update the prompt construction to include:
```
Active Training Program:
{full program markdown}

Pre-Workout Context:
- Energy Level: {energy_level}/5
- Time Available: {time_available_min} minutes
- Location: {location_name}
- Available Equipment: {equipment_list}
- Session Intent: {intent}
```

The program goes first because it's the strategic foundation. Pre-workout inputs provide the tactical context for this specific session.

#### 2. Update `trainerWorkouts.controller.js` — Accept Pre-Workout Inputs

**File**: `BACKEND/controllers/trainerWorkouts.controller.js`

Update the `generateWorkout` handler to pass structured pre-workout data from the request body to the service:

```javascript
const { intent, requestText, timeAvailableMin, equipment, readiness, coachMode } = req.body;
// Pass energy from readiness.energy, map to 0-5
```

This already partially works — `WorkoutGenerateRequest` on the iOS side sends these fields. Just ensure the backend extracts and uses them properly in the prompt.

#### 3. Refactor Agent's `generate_workout` Tool

**File**: `BACKEND/agent/tools/exercises.js`

Currently maintains its own in-memory exercise array. Refactor to:

- Call `trainerWorkouts.service.generateWorkoutInstance()` instead of building exercises in memory
- Pass the user's conversational request as the `request_text`
- Return the generated workout instance from the service
- Remove the in-memory exercise array management

This unifies both generation paths through a single service.

### Success Criteria

#### Automated Verification
- [ ] Backend starts without errors: `node index.js`
- [ ] `POST /trainer/workouts/sessions/:id/generate` returns a workout with exercises
- [ ] Agent chat can still generate workouts via the tool

#### Manual Verification
- [ ] Generated workout follows the active program's current phase (e.g. hypertrophy phase → 8-12 rep range)
- [ ] Generated workout respects program guardrails and exercise rules (avoids restricted movements)
- [ ] Generated workout respects energy level (low energy → lighter workout)
- [ ] Generated workout respects time constraint (30 min → fewer exercises)
- [ ] Generated workout uses equipment from the selected location
- [ ] Agent-generated workout matches the same quality as endpoint-generated

**Pause here for testing before proceeding to Phase 4.**

---

## Phase 4: Weights Profile (Full Stack)

### Overview
New system for tracking the user's current capability by equipment + movement pattern. Versioned snapshots enable trend analysis. Auto-updated after each session.

### Changes Required

#### 1. Database Schema

**File**: `BACKEND/database/trainer_weights_profile_schema.sql` (NEW)

```sql
-- Weights profile: versioned snapshots of user capability
CREATE TABLE IF NOT EXISTS trainer_weights_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    version INT NOT NULL DEFAULT 1,
    profile_json JSONB NOT NULL, -- Array of { equipment, movement, load, load_unit, confidence }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    trigger_type TEXT NOT NULL DEFAULT 'session_complete', -- 'initial_inference', 'session_complete', 'weekly_review', 'catch_up'
    trigger_session_id UUID, -- Links to the session that triggered this version
    UNIQUE(user_id, version)
);

ALTER TABLE trainer_weights_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profiles" ON trainer_weights_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can manage profiles" ON trainer_weights_profiles FOR ALL USING (true);

CREATE INDEX idx_weights_profiles_user_version ON trainer_weights_profiles(user_id, version DESC);
```

Profile JSON structure (each entry):
```json
{
    "equipment": "dumbbell",
    "movement": "bench press",
    "load": 25,
    "load_unit": "lb",
    "confidence": "moderate"
}
```

#### 2. Weights Profile Service

**File**: `BACKEND/services/trainerWeightsProfile.service.js` (NEW)

```javascript
// Core functions:
getLatestProfile(userId)          // Get most recent version
getProfileHistory(userId, limit)  // Get version history for trends
createInitialProfile(userId)      // AI infers from intake data
updateAfterSession(userId, sessionId, workoutLog, sessionSummary)  // AI reviews session and updates
```

- `createInitialProfile()` — Called during onboarding after program activation. Uses intake data (experience level, body metrics, training history) to infer starting weights. Calls Claude (Haiku) with a focused prompt.
- `updateAfterSession()` — Called async after session completion. AI reviews what was generated vs. what was completed, plus any pain flags or skips, and creates a new version with updated entries.

#### 3. Weights Profile Controller & Routes

**File**: `BACKEND/controllers/trainerWeightsProfile.controller.js` (NEW)
**File**: `BACKEND/routes/trainerWeightsProfile.routes.js` (NEW)

Endpoints:
- `GET /trainer/weights-profile` — Get latest profile
- `GET /trainer/weights-profile/history` — Get version history
- `POST /trainer/weights-profile/initialize` — Create initial profile (called during onboarding)

#### 4. Wire into Workout Generation

**File**: `BACKEND/services/trainerWorkouts.service.js`

Update `generateWorkoutInstance()` to fetch the latest weights profile and include it in the Claude prompt:

```
Current Weights Profile:
- Dumbbell bench press: 25 lb
- Barbell squat: 135 lb
- Cable row: 50 lb
...
```

#### 5. Wire into Session Completion

**File**: `BACKEND/services/trainerWorkouts.service.js`

After `generateSessionSummary()` completes, trigger `weightsProfileService.updateAfterSession()` asynchronously (don't block the completion response).

#### 6. Wire into Onboarding

**File**: `BACKEND/controllers/trainerProgram.controller.js`

After `activateProgram()`, trigger `weightsProfileService.createInitialProfile()` asynchronously.

#### 7. iOS Model

**File**: `AI Personal Trainer App/AI Personal Trainer App/Models/WeightsProfileModels.swift` (NEW)

```swift
struct WeightsProfile: Codable {
    let id: String
    let version: Int
    let entries: [WeightsEntry]
    let createdAt: Date
}

struct WeightsEntry: Codable {
    let equipment: String
    let movement: String
    let load: Double
    let loadUnit: String
    let confidence: String
}
```

### Success Criteria

#### Automated Verification
- [ ] Migration applies cleanly on Supabase
- [ ] Backend starts without errors
- [ ] `GET /trainer/weights-profile` returns profile data
- [ ] App builds without errors

#### Manual Verification
- [ ] After onboarding, an initial weights profile is created with reasonable starting weights
- [ ] After completing a workout, the weights profile updates with a new version
- [ ] Generated workouts use weights from the profile (e.g. prescribing the right dumbbell weight)
- [ ] Profile history shows progression over multiple sessions

**Pause here for testing before proceeding to Phase 5.**

---

## Phase 5: Program Migration to Markdown

### Overview
Migrate the program from structured JSON to a single markdown document that the AI rewrites weekly. This is the foundation for the weekly review process in Phase 6.

### Changes Required

#### 1. Define Program Markdown Format

The program document mirrors the existing `programToMarkdown()` format (which the iOS app already parses with section icons, RPE badges, rest timer pills, and form cues) but adds new sections from the spec. Existing sections are preserved; new sections are added at the end.

```markdown
# Your Training Program
[2-3 sentence overview]

# Goals
**Primary goal:** Build upper body strength
**Secondary goal:** Improve cardiovascular endurance
**Timeline:** 12 weeks

**How we measure progress:**
- Dumbbell press weight increase
- Consistent 3x/week training

# Weekly Structure
You will train **3 days per week**.
Upper/lower push-pull split with dedicated sessions for each movement pattern.

**Rest days:** Light walking or stretching on off days.

# Training Sessions
## Day 1: Upper Push
*60 minutes — moderate intensity*

Progressive chest and shoulder development with compound pressing movements.

**Warm-up:**
- 5 min light cardio
- Band pull-aparts x 15

**Movement focus:**
- **Horizontal Press** — Dumbbell bench press, incline press
  3-4 sets of 8-12 reps
  *RPE 7-8. Last 1-2 reps should be challenging but doable with good form. Rest 90-120 seconds.*

- **Vertical Press** — Overhead press, lateral raises
  3 sets of 10-12 reps
  *RPE 7. Focus on controlled movement through full range. Rest 60-90 seconds.*

**Cool-down:**
- Chest doorway stretch 30s each side
- Shoulder cross-body stretch

## Day 2: Lower Body
[same structure per session]

## Day 3: Upper Pull
[same structure per session]

# Progression Plan
Linear progression within each phase, increasing load when target reps are consistently hit.

**Hypertrophy** (weeks 1-6)
Build muscle base with moderate loads and higher volume.

**Strength** (weeks 7-10)
Increase intensity, reduce volume, focus on compound lifts.

**Deload protocol:** 1 week at 60% volume every 4-6 weeks, or when energy trends below 2/5 for 3+ sessions.

# Current Phase
**Hypertrophy** — Week 3 of 6
- Rep range: 8-12
- Intensity: Moderate (RPE 7-8)
- Volume: 16-20 sets per muscle group per week

# Available Phases
1. Hypertrophy (8-12 reps, moderate intensity, 4-6 weeks)
2. Strength (3-6 reps, high intensity, 3-4 weeks)
3. Deload (12-15 reps, low intensity, 1 week)

# Exercise Rules
**Prefer:** Compound movements, dumbbells
**Avoid:** Behind-the-neck press (shoulder impingement history)
**Always include:** Face pulls for shoulder health

# Recovery
**Sleep:** 7-8 hours minimum, consistent schedule
**Nutrition:** High protein (0.8g/lb bodyweight), adequate hydration
**Active recovery:** Light walking or yoga on off days

- Foam roll tight areas before training
- Prioritize sleep over extra sessions

# Safety Guidelines
Max session duration: 75 minutes. Flag any sharp pain immediately.

**Movements to avoid or modify:**
- Behind-the-neck press — use front press instead
- Heavy barbell work without spotter notation

**Stop and reassess if:**
- Sharp or shooting pain during any movement
- Persistent joint pain lasting more than 48 hours

# Coach Notes
> User responds well to supersets — keeps engagement high.
> Left shoulder mobility is limited; warm up thoroughly before pressing.
> Prefers morning workouts; energy dips if training after 6pm.

# Milestones
- [x] Complete 12 sessions
- [ ] Dumbbell bench press at 35 lb (currently 25 lb)
- [ ] 3 consecutive sessions with RPE ≤ 7

# Scheduling Recommendations
- Consider adding a Saturday mobility session if recovery allows
```

**New sections** added to the existing format:
- `# Current Phase` — Active training phase with parameters (parsed for phase transition logic)
- `# Available Phases` — What phases the program can cycle through
- `# Exercise Rules` — Preferences and restrictions (was implicit in safety, now explicit)
- `# Milestones` — Phase-specific goals with completion checkboxes
- `# Scheduling Recommendations` — AI suggestions for template adjustments

**Existing sections** preserved as-is:
- `# Your Training Program`, `# Goals`, `# Weekly Structure`, `# Training Sessions`, `# Progression Plan`, `# Recovery`, `# Safety Guidelines`, `# Coach Notes`

The iOS `ProgramReviewView` already parses `# ` headers into section cards with icons. New sections just need icon mappings added:
- "Current Phase" → `arrow.trianglepath`
- "Available Phases" → `list.bullet`
- "Exercise Rules" → `checklist`
- "Milestones" → `flag`
- "Scheduling Recommendations" → `calendar.badge.clock`

#### 2. Update Program Service

**File**: `BACKEND/services/trainerProgram.service.js`

- Update `draftProgram()` to generate markdown instead of JSON. The Claude prompt should output the program in the markdown format above.
- Drop `program_json` column entirely. Replace with `program_markdown` column.
- Delete `programToMarkdown()` — the program IS markdown now.
- Update `editProgram()` to edit the markdown document via Claude.

#### 3. Database Migration

**File**: `BACKEND/database/migrations/add_program_markdown.sql` (NEW)

```sql
ALTER TABLE trainer_programs DROP COLUMN IF EXISTS program_json;
ALTER TABLE trainer_programs ADD COLUMN IF NOT EXISTS program_markdown TEXT;
```

#### 4. Update iOS ProgramModels

**File**: `AI Personal Trainer App/AI Personal Trainer App/Models/ProgramModels.swift`

The `TrainingProgram` model already has `programMarkdown: String?`. Ensure the program review screen uses this field for display.

#### 5. Update Program Review View

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/ProgramReviewView.swift`

Display the markdown program document. Use a simple markdown renderer or styled text view.

### Success Criteria

#### Automated Verification
- [ ] Migration applies cleanly
- [ ] Backend starts without errors
- [ ] `POST /programs` (draft) returns a program with `program_markdown` populated
- [ ] App builds without errors

#### Manual Verification
- [ ] New programs are generated in markdown format
- [ ] Program review screen displays the markdown readably
- [ ] Edit program instruction modifies the markdown correctly
- [ ] Activate program still syncs calendar correctly

**Pause here for testing before proceeding to Phase 6.**

---

## Phase 6: Weekly Review & Automation

### Overview
The weekly review is the engine that keeps the program alive. Sunday night cron job rewrites the program, regenerates the calendar, calculates stats, and evaluates phase transitions. Also handles inactivity pausing and catch-up reviews.

### Changes Required

#### 1. Install Cron Library

```bash
cd BACKEND && npm install node-cron
```

#### 2. Create Weekly Review Service

**File**: `BACKEND/services/weeklyReview.service.js` (NEW)

Core orchestration service:

```javascript
async function runWeeklyReview(userId) {
    // 1. Gather inputs
    const weekSummaries = await getWeekSessionSummaries(userId);
    const weeklyStats = await calculateWeeklyStats(userId);
    const currentProgram = await getActiveProgram(userId);
    const weightsProfile = await getLatestWeightsProfile(userId);

    // 2. Check for inactivity
    if (weekSummaries.length === 0) {
        await pauseWeeklyReview(userId);
        return; // No sessions = no review
    }

    // 3. AI rewrites the program
    const newProgramMarkdown = await rewriteProgram({
        currentProgram,
        weekSummaries,
        weeklyStats,
        weightsProfile
    });

    // 4. Save new program version
    await saveNewProgramVersion(userId, newProgramMarkdown);

    // 5. Regenerate next week's calendar
    await regenerateCalendar(userId, newProgramMarkdown);

    // 6. Archive old program version
    await archiveProgramVersion(userId, currentProgram.version);
}
```

#### 3. Create Programmatic Stats Calculator

**File**: `BACKEND/services/statsCalculator.service.js` (NEW)

Deterministic, no LLM. Calculated from raw session data:

**Per-session stats** (calculated on completion, stored on the session):
- Total exercises completed
- Total sets completed
- Total reps (rep-based exercises)
- Total volume (weight × reps)
- Cardio time (duration/interval exercises)
- Workout duration (actual)
- Exercises skipped
- Pain flags
- Energy rating

**Weekly rollup** (calculated during weekly review):
- Sessions completed vs planned
- Totals: reps, volume, cardio time, workout time
- Averages: energy rating, session duration
- Trends vs prior week (up/down/flat)

Store weekly rollup as a distinct object in `trainer_weekly_reports` (update the existing table to include structured stats).

#### 4. Program Rewrite Prompt

The AI receives:
- Current program markdown
- All session AI summaries from the week
- Weekly stats rollup
- Current weights profile

Prompt instructs:
- Preserve core goals and safety guardrails unless user explicitly requested changes
- Update Coach's Notes with observations from the week
- Update milestone progress
- Evaluate phase transition (stay, advance, deload)
- Adjust weekly template if needed
- Output a complete new program markdown document

#### 5. Calendar Regeneration

Update `trainerCalendar.service.js`:

```javascript
async function regenerateWeeklyCalendar(userId, programMarkdown) {
    // Parse weekly template from markdown
    const template = parseWeeklyTemplate(programMarkdown);

    // Delete existing future planned events (not completed/generated)
    await deleteFuturePlannedEvents(userId);

    // Create next week's events from template
    const nextMonday = getNextMonday();
    for (const session of template.sessions) {
        await createEvent(userId, {
            date: nextMonday + session.dayOffset,
            eventType: 'planned_session',
            title: session.name,
            status: 'planned',
            intentJson: {
                focus: session.focus,
                duration_min: session.durationMin,
                intent: session.description
            }
        });
    }
}
```

#### 6. Cron Job Setup

**File**: `BACKEND/cron/weeklyReview.cron.js` (NEW)

```javascript
const cron = require('node-cron');

// Run Sunday at 11 PM UTC
cron.schedule('0 23 * * 0', async () => {
    const activeUsers = await getActiveUsers(); // Users with sessions this week
    for (const userId of activeUsers) {
        try {
            await runWeeklyReview(userId);
        } catch (err) {
            console.error(`Weekly review failed for ${userId}:`, err);
            // Don't block other users
        }
    }
});
```

Register in `index.js`:
```javascript
require('./cron/weeklyReview.cron');
```

#### 7. Catch-Up Review on Return

**File**: `BACKEND/services/weeklyReview.service.js`

```javascript
async function checkAndRunCatchUpReview(userId) {
    const hasActiveWeek = await hasUpcomingPlannedEvents(userId);
    if (!hasActiveWeek) {
        // User returning from inactivity
        await runWeeklyReview(userId); // Full review, factoring in the gap
    }
}
```

Trigger this from the app's initial data load — when the iOS app fetches calendar events and finds none upcoming, call a new endpoint:

**File**: `BACKEND/controllers/trainerCalendar.controller.js`

New endpoint: `POST /trainer/calendar/check-and-regenerate`
- Checks if the user has upcoming planned events
- If not, triggers a catch-up review
- Returns the newly generated events

#### 8. iOS — Trigger Catch-Up on App Open

**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`

In the existing `loadHomeData()` or equivalent, after fetching calendar events:
```swift
if upcomingEvents.filter({ $0.status == "planned" }).isEmpty {
    // No planned events — trigger catch-up review
    await apiService.checkAndRegenerateCalendar()
    // Re-fetch events
    upcomingEvents = await apiService.listCalendarEvents(...)
}
```

### Success Criteria

#### Automated Verification
- [x] Backend starts with cron job registered
- [x] `POST /trainer/calendar/check-and-regenerate` returns events
- [x] Stats calculator produces correct totals from test session data
- [x] App builds without errors

#### Manual Verification
- [ ] After completing sessions during the week, Sunday night cron generates a new program version
- [ ] New program reflects the week's training (Coach's Notes updated, milestones progressed)
- [ ] Next week's calendar has fresh planned sessions matching the updated program
- [ ] Paused after a week with no sessions (no new calendar entries generated)
- [ ] Returning after inactivity triggers catch-up review and generates a new week
- [ ] Phase transition happens when performance signals warrant it

---

## Testing Strategy

### Unit Tests (Backend)
- Stats calculator: verify correct totals for various session configurations
- Calendar regeneration: verify correct dates and session mapping from template
- Weights profile update: verify entries change based on session data

### Integration Tests (Backend)
- Full workout flow: create session → generate → actions → complete → verify summary + profile update
- Weekly review: mock sessions → run review → verify new program + calendar
- Catch-up review: simulate inactivity → trigger → verify recovery

### Manual Testing (Full Stack)
1. Walk through complete onboarding → first workout on iPhone
2. Complete 3 workouts over a week, verify weights profile updates
3. Wait for Sunday cron → verify new program + calendar Monday morning
4. Test custom workout flow (describe → generate → complete)
5. Test mid-workout actions (swap, pain flag, skip)
6. Test inactivity → return → catch-up review

## Performance Considerations

- **Workout generation**: Should complete in < 5 seconds. Use Haiku for speed.
- **Session completion**: Summary generates async. User sees completion screen immediately, profile + summary update in background.
- **Weekly review**: Can take 30-60 seconds per user (program rewrite + calendar). Runs at off-peak hours. Process users sequentially to avoid rate limits.
- **Catch-up review**: Blocks the user briefly on return. Show a loading state ("Preparing your week...").

## Migration Notes

- `program_json` column is dropped. Any existing programs will need to be regenerated in markdown format.
- Old calendar entries (completed/generated) are preserved. Only future planned entries are regenerated.

## References

- Spec: `docs/specs/2025-02-14-workout-generation-and-calendar.md`
- Research: `docs/research/2026-02-15-workout-generation-and-calendar.md`
- Backend services: `BACKEND/services/trainerWorkouts.service.js`, `BACKEND/services/trainerCalendar.service.js`, `BACKEND/services/trainerProgram.service.js`
- iOS models: `Models/Exercise.swift`, `Models/WorkoutSessionModels.swift`, `Models/ProgramModels.swift`

---

## UI Design Guidance

How each new or modified screen should look, based on `docs/designs/artifacts/design-schema.json` and `docs/designs/artifacts/claude-app-design-artifact.jsx`. Follow the design system's core rules throughout: **monochrome only** (black/white + surface grays), **no shadows or borders** (except the AI orb), **text-first with inline stat highlights**, **AI orb is the only colored element**.

### Phase 1 Screens

#### Home Screen (refactored `HomeView.swift`)

Already matches the design schema's `screens.home` layout. No visual changes — just wire the data correctly:

- **Top-left**: Expanding FAB menu (hamburger icon, drops down to History + Profile)
- **Top-right**: Plus button for custom workout / schedule / start run
- **Middle**: AI message paragraph using `aiMessageLarge` (19px, weight 400, line-height 1.55). Key stats wrapped in inline `statHighlight` chips (subtle background `highlight` color, 4px radius, font-weight 600)
- **Bottom bar**: Workout pill (left, flex) + AI orb (right, 50px)
- Workout pill shows today's session title from calendar. `surface` background, `pill` border-radius (44px), 14px font. Play button circle (32px, `accent` background) on right side of pill
- If no planned session: pill text reads "Start Workout"

#### Pre-Workout Sheet (`PreWorkoutSheet.swift`)

Present as a **bottom sheet** sliding up from the bottom. Use the `bottomSheet` component spec:
- Background: `background` color
- Top corners: 20px border-radius
- Drag handle: 36px wide, 4px tall, `textTertiary` color, centered, 2px radius
- Padding: 12px top, 20px horizontal, 32px bottom

**Content layout (top to bottom):**

1. **Title** — "Get Ready" or the planned session name. Use `screenTitle` (17px, weight 600). Centered below the drag handle.

2. **Custom workout text field** (only when no planned session) — "What do you want to work on?" placeholder. Use `chatInput` spec: `surface` background, `medium` border-radius (11px), 14px padding, 15px font. Mic button (50px circle, `surface` background) to the right.

3. **Location picker** — Show current location name as a tappable `menuItem` row: `surface` background, `large` border-radius (15px), 14px 16px padding. Left icon (map pin, 20px, `textSecondary`), location name (15px, weight 500), chevron right (16px, `textTertiary`). Below it, show equipment list as `pillTag` chips: `surface` background, `pill` radius (44px), 13px font, 8px gap between pills.

4. **Energy level** — Section label "Energy" in `label` style (12px, weight 500, uppercase, `textTertiary`). Row of 5 tappable circles (44px each, `surface` background, `full` border-radius). Selected state: `accent` background with `background` text color. Numbers 1-5 inside, 15px weight 600. No colors — selected is white-on-black (dark mode) or black-on-white (light mode).

5. **Time available** — Section label "Time Available" in `label` style. Row of preset pill buttons (15, 30, 45, 60, 90 min). Use `primaryButton.small` variant for selected (12px 20px padding, `accent` background, `background` text), unselected uses `surface` background with `text.primary` color. All `pill` border-radius.

6. **Confirm button** — Full-width `primaryButton`: `accent` background, `background` text, `pill` border-radius, 16px 20px padding, 15px weight 600 text. Label: "Start Workout" with a play icon (16px) to the left.

#### Generating State

While the workout generates, show a centered view:
- AI orb at `large` size (56px), centered, with its glow
- Below it: "Generating your workout..." in `aiMessageMedium` (16px, weight 400, `textSecondary`)
- Thin indeterminate progress bar below (3px, `surface` track, `text.primary` fill, animated)

#### Workout Execution Screen (`WorkoutView.swift`)

Maps directly to the design schema's `screens.strengthExercise`:

- **Top bar** — Use `ThinTopBar` pattern: Close button (chevron-left or X, top-left), progress text "2 of 6" (center, 14px weight 500, `textSecondary`), edit button (pencil icon, top-right). All touch targets 44px minimum. No background color on the bar — it's transparent over `background`.
- **Progress bar** — Directly below top bar, full width with 20px horizontal padding. 3px height, `surface` track, `text.primary` fill. Animates width on set/exercise completion (0.3s ease).
- **Middle content** — Fills remaining space. This is either Workout Mode or List Mode (toggle via the edit button or a small icon button in the top bar).
- **Bottom bar** — 3 elements in a row with 10px gap, 16px 20px 24px padding:
  - Edit button: `iconButton.standard` (44px circle, `surface` background, pencil icon 18px, `text.primary`)
  - Done button: `primaryButton` (flex: 1, `accent` background, checkmark icon 16px + "Done" label). Label changes contextually: "Done" → "Next Exercise" → "Finish Workout"
  - AI orb: 50px, always rightmost

#### Workout Mode View (`WorkoutModeView.swift` — swipeable)

Each exercise page is a **text-first paragraph** filling the middle content area:

- 20px horizontal padding
- Exercise name in `statHighlight` inline chip (highlighted background, weight 600)
- Set counter: "Set `2` of `3`" with numbers in `statHighlight` chips
- Rep target and weight in `statHighlight` chips: "`10-12 reps`", "`25 lb`"
- Form cues woven into natural language between the highlighted values
- Font: `aiMessageMedium` size (16px) for the paragraph body, but use 18px (matching the design artifact's `StrengthContent`) for better readability
- Line-height: 1.6
- Color: `text.primary`

Example rendering:
> **Dumbbell Bench Press** — Set `2` of `3`. Aim for `10-12 reps` at `25 lb`. Keep your shoulder blades pinched together throughout the movement.

Where bold text and backtick values are rendered as inline `statHighlight` chips.

Swipe navigation: Use `TabView` with `.page` style. Dot indicators are NOT shown (the top progress bar serves this purpose). Swipe left = next exercise, swipe right = previous.

#### List Mode View (`ListModeView.swift`)

Compact checklist using `setRow`-inspired styling but for exercises:

- Scrollable list, 20px horizontal padding
- Each exercise row: `surface` background, `medium` border-radius (11px), 12px 16px padding, 6px margin-bottom
- Left: exercise index number in a circle (24px, `highlight` background, 12px weight 600)
- Middle (flex: 1): exercise name (15px, weight 500), below it "3 × 10-12 reps · 25 lb" (13px, `textSecondary`)
- Right: checkmark icon (16px, `textSecondary`) for completed exercises
- Current exercise: full opacity. Completed: 60% opacity with checkmark. Upcoming: full opacity, no checkmark
- Tapping a row jumps to that exercise in workout mode

#### Workout Completion Screen (`WorkoutCompletionView.swift`)

Full-screen view replacing the workout. No bottom sheet — this is a destination screen.

**Layout (top to bottom):**

1. **Top bar** — Close/X button (top-left), "Workout Complete" text (center, `screenTitle`)

2. **AI summary** — `aiMessageMedium` (16px, weight 400, line-height 1.55). Natural language with inline `statHighlight` chips for key stats. Example: "Great session! You completed `5 of 6` exercises in `38 minutes`. Your bench press is up `5 lb` from last week."

3. **Stat cards row** — 3 cards in a horizontal row, 8px gap. Each card: `statCard.small` — `surface` background, `medium` border-radius (11px), 12px padding, centered text. Value in 18px weight 700, label in 11px uppercase `textTertiary`. Stats: Duration, Exercises, Volume.

4. **Wins section** — Section label "Wins" in `label` style. Each win as a text line with a checkmark prefix (16px, `textSecondary`). 15px weight 400 text.

5. **Next focus** — Section label "Next Session" in `label` style. AI text in `aiMessageMedium`.

6. **Notes input** — `chatInput` style: `surface` background, `medium` border-radius, 14px 16px padding, 15px font. Placeholder: "Add notes about this session...". Mic button (50px circle, `surface` background) to the right.

7. **Done button** — Full-width `primaryButton` at the bottom. "Done" label. Dismisses to home.

### Phase 2 Screens

#### Mid-Workout Action Sheet (`MidWorkoutActionSheet.swift`)

Use the `bottomSheet` + `modalListItem` component specs exactly:

- Sheet: `background` color, 20px top corner radius, drag handle (36px × 4px, `textTertiary`)
- Backdrop: `rgba(0,0,0,0.4)`
- Each option is a `modalListItem`: `surface` background, `medium` border-radius (11px), 14px 16px padding, 4px gap between items
- Left: icon (20px, `textSecondary`)
- Right: label (15px, weight 500, `text.primary`)

**Options with icons:**
- Swap exercise: swap/arrows icon → "Replace with an alternative"
- Adjust difficulty: sliders icon → "Change weight, reps, or intensity"
- Time scale: clock icon → "Compress or extend workout"
- Pain flag: alert/exclamation icon → "Flag discomfort on this exercise"
- Skip exercise: skip-forward icon → "Move past without replacement"

Skip and Pain flag are non-destructive. No destructive (red) styling on any of these — they're all neutral actions. The design schema reserves `danger` (#FF3B30) only for truly destructive actions like "Delete exercise" or "Remove exercise", which aren't in our Phase 2 menu.

### Phase 5 Screens

#### Program Review View (updated `ProgramReviewView.swift`)

The program is now pure markdown. Render it as styled sections:

- Each `# ` header becomes a section card: `surface` background, `large` border-radius (15px), 16px padding, 8px margin-bottom
- Section header: icon (20px, `textSecondary`) + title (`cardTitle` — 15px, weight 600) in a row
- Section body: rendered markdown text in `bodyText` (14px, weight 400), respecting bold, lists, and blockquotes
- Blockquotes (Coach Notes): left border 3px `highlight` color, 12px left padding, `textSecondary` color

**Icon mappings for sections:**
| Section | SF Symbol |
|---------|-----------|
| Your Training Program | `figure.strengthtraining.traditional` |
| Goals | `target` |
| Weekly Structure | `calendar` |
| Training Sessions | `dumbbell` |
| Progression Plan | `chart.line.uptrend.xyaxis` |
| Current Phase | `arrow.trianglepath` |
| Available Phases | `list.bullet` |
| Exercise Rules | `checklist` |
| Recovery | `bed.double` |
| Safety Guidelines | `shield` |
| Coach Notes | `quote.bubble` |
| Milestones | `flag` |
| Scheduling Recommendations | `calendar.badge.clock` |

**Milestone checkboxes:** Render `[x]` as a filled checkmark circle (accent), `[ ]` as an empty circle (`surface` background, no border — distinguish by background shade).

### General Rules (Apply Everywhere)

1. **No shadows, no borders** — Distinguish surfaces by background color only (`background` vs `surface` vs `highlight`)
2. **No colors** — Everything is monochrome. The only color in the app is the AI orb gradient and glow
3. **Touch targets** — Minimum 44px, recommended 50px
4. **Typography** — SF Pro Display (system default on iOS). Use the exact sizes from the design schema
5. **Stat highlights** — Any time a number, exercise name, or key data point appears in AI text, wrap it in a `statHighlight` chip (inline, 0px 5px padding, `highlight` background, 4px radius, weight 600)
6. **Bottom bar** — Always 2-3 elements max. 10px gap between items. 16px top, 20px horizontal, 24px bottom padding
7. **Spacing** — Screen horizontal padding: 20px. Card gaps: 8px. Modal item gaps: 4px
8. **Motion** — Sheet transitions: 300ms ease. Progress bar: 0.3s ease. Button hover: background shifts to `surfaceHover`
9. **Dark mode** — background #000000, surface #111111. **Light mode** — background #FFFFFF, surface #F5F5F7. Support both
