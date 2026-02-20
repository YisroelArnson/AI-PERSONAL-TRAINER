# Workout Generation System - Current Implementation Specification

This document is a language-agnostic specification of the current workout generation implementation in this repository. It describes only the workout generation subsystem as implemented today across iOS and backend services.

---

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Scope and Boundaries](#2-scope-and-boundaries)
3. [Architecture and Control Flow](#3-architecture-and-control-flow)
4. [Data Model and Storage](#4-data-model-and-storage)
5. [HTTP Interfaces and Contracts](#5-http-interfaces-and-contracts)
6. [Generation Engine Behavior](#6-generation-engine-behavior)
7. [iOS Orchestration Behavior](#7-ios-orchestration-behavior)
8. [In-Session Adaptation and Completion](#8-in-session-adaptation-and-completion)
9. [Known Limitations and Out of Scope](#9-known-limitations-and-out-of-scope)
10. [Definition of Done](#10-definition-of-done)

---

## 1. Overview and Goals

### 1.1 Problem Statement

The app needs to generate a workout session that matches real-time user constraints (intent, duration, equipment, and planned session context) instead of serving static templates. The current implementation solves this by combining a versioned workout-session backend with a client workflow that gathers pre-workout inputs, generates a workout instance via an LLM, and keeps that instance mutable during the session.

The generation path is implemented as a concrete workflow from `WorkoutStore` (iOS) to `/trainer/workouts` endpoints (Express), backed by `trainerWorkouts.service.js` and related dependencies for context data, active program markdown, and weights profile history.

### 1.2 Design Principles

**Session-first generation.** Generation is always tied to a `trainer_workout_sessions` row. A workout instance is generated and stored as a versioned record (`trainer_workout_instances`) rather than as a transient payload.

**Context-enriched prompting.** Prompt assembly includes user profile, settings, locations/equipment, workout history, active program markdown, optional planned session intent, and weights profile hints.

**Normalization before persistence.** Raw model output is normalized into a stable instance shape before being returned and inserted as a version.

**Action-driven adaptation.** Mid-workout operations (`swap_exercise`, `adjust_prescription`, `time_scale`, `flag_pain`) mutate the current instance by creating a new version instead of editing in place.

**Failure containment.** Multiple fallbacks prevent hard user-facing failure: controller-level error responses, summary fallback on completion, client-side local completion fallback, and async (non-blocking) weights profile updates.

---

## 2. Scope and Boundaries

### 2.1 In Scope

The implementation in this spec includes:

- iOS pre-workout intent planning and generation orchestration in `WorkoutStore`.
- Backend session creation/resume, workout generation, in-session actions, and completion endpoints in `/trainer/workouts`.
- The core generation service `BACKEND/services/trainerWorkouts.service.js`.
- Generation dependencies used directly by that service:
  - `dataSources.service` (profile/settings/locations/workout history),
  - `trainerProgram.service.getActiveProgram`,
  - `trainerWeightsProfile.service.getLatestProfile` and `formatProfileForPrompt`,
  - `trainerCalendar.service.getPlannedSession` and `completeEvent`.
- Agent tool entrypoint `generate_workout` and adaptation tools that call the same workout service.

### 2.2 Out of Scope

The following are not specified as part of workout generation behavior:

- Full onboarding, assessment, goals authoring, and full training program authoring/editing lifecycles.
- Assistant chat pipeline details not directly invoking workout-generation tools.
- Non-workout calendar features beyond fields used during generation linking.
- UI styling details outside behavior required to trigger generation.

### 2.3 Companion Surfaces

This spec depends on, but does not redefine, persistence objects in:

- `trainer_calendar_events` / `trainer_planned_sessions`
- `trainer_programs` / `trainer_active_program`
- `trainer_weights_profiles`

These are referenced only where generation reads/writes them.

---

## 3. Architecture and Control Flow

### 3.1 Runtime Components

```
+---------------------------------------------------------------+
| iOS App                                                       |
| - PreWorkoutSheet + HomeView                                 |
| - WorkoutStore (state machine + API orchestration)           |
| - APIService (/trainer/workouts, /trainer/calendar)          |
+---------------------------------------------------------------+
                  | Authenticated HTTP (Bearer Supabase token)
                  v
+---------------------------------------------------------------+
| Express Backend                                               |
| - routes/trainerWorkouts.routes.js                           |
| - controllers/trainerWorkouts.controller.js                  |
| - services/trainerWorkouts.service.js                        |
+---------------------------------------------------------------+
                  | Data + model calls
                  v
+---------------------------------------------------------------+
| Dependencies                                                  |
| - Supabase tables (sessions, instances, events, logs, etc.)  |
| - Anthropic messages.create                                  |
| - dataSources/program/weights/calendar services              |
+---------------------------------------------------------------+
```

### 3.2 Primary App Flow

```
FUNCTION app_generate_workout_flow():
    -- Pre-workout inputs are prepared in WorkoutStore.
    IF user_came_from_intent_page:
        ad_hoc_event = POST /trainer/calendar/events

    session = POST /trainer/workouts/sessions (force_new=true)

    instance = POST /trainer/workouts/sessions/{id}/generate

    -- On success
    WorkoutStore.session_status = ACTIVE
    WorkoutStore.current_instance = instance

    -- On failure
    IF ad_hoc_event exists:
        DELETE /trainer/calendar/events/{event_id}?cascade_planned=true
    WorkoutStore.session_status = PRE_WORKOUT
```

### 3.3 Agent Tool Flow (Secondary Entry Path)

The agent tool `generate_workout` also creates a workout session and instance through the same backend service (`getOrCreateSession` + `generateWorkoutInstance` + `createWorkoutInstance`). It stores an agent-session-to-workout-session map and publishes an artifact for UI delivery.

---

## 4. Data Model and Storage

### 4.1 Core Records

```
RECORD WorkoutSession:
    id                 : String
    user_id            : String
    status             : String                -- in_progress|completed|stopped|canceled
    coach_mode         : String                -- quiet|ringer
    planned_session_id : String | None
    calendar_event_id  : String | None
    metadata           : Dict
    started_at         : Timestamp | None
    completed_at       : Timestamp | None
    created_at         : Timestamp | None
    updated_at         : Timestamp | None

RECORD WorkoutInstance:
    title                  : String
    estimated_duration_min : Integer | None
    focus                  : List<String>
    exercises              : List<NormalizedExercise>
    metadata               : WorkoutInstanceMetadata

RECORD WorkoutInstanceMetadata:
    intent                 : String
    request_text           : String | None
    planned_session        : Dict | None
    planned_intent_original: Dict | None
    planned_intent_edited  : Dict | None
    generated_at           : String

RECORD NormalizedExercise:
    exercise_name      : String | None
    exercise_type      : String | None        -- reps|hold|duration|intervals
    muscles_utilized   : List<Dict>
    goals_addressed    : List<Dict>
    reasoning          : String
    exercise_description: String | None
    equipment          : List<String>
    sets               : Integer | None
    reps               : List<Integer> | None
    load_each          : List<Float> | None
    load_unit          : String | None
    hold_duration_sec  : List<Integer> | None
    duration_min       : Integer | Float | None
    distance_km        : Float | None
    distance_unit      : String | None
    rounds             : Integer | None
    work_sec           : Integer | None
    rest_seconds       : Integer | None
```

### 4.2 Storage Tables Used by Generation

| Key | Type | Default | Description |
|---|---|---|---|
| `trainer_workout_sessions.id` | UUID | generated | Session identifier |
| `trainer_workout_sessions.status` | TEXT | `in_progress` | Session state |
| `trainer_workout_sessions.coach_mode` | TEXT | `quiet` | Coaching style |
| `trainer_workout_sessions.planned_session_id` | UUID | `NULL` | Optional link to planned session |
| `trainer_workout_sessions.calendar_event_id` | UUID | `NULL` | Optional link to calendar event |
| `trainer_workout_sessions.metadata` | JSONB | `{}` | Session metadata snapshot |
| `trainer_workout_instances.session_id` | UUID | required | Parent session |
| `trainer_workout_instances.version` | INTEGER | `1` | Monotonic instance version per session |
| `trainer_workout_instances.instance_json` | JSONB | required | Generated/mutated workout instance |
| `trainer_workout_events.sequence_number` | INTEGER | required | Per-session append-only order |
| `trainer_workout_events.event_type` | TEXT | required | Session event classification |
| `trainer_workout_events.data` | JSONB | required | Event payload |
| `trainer_workout_logs.log_json` | JSONB | required | Materialized completion log |
| `trainer_session_summaries.summary_json` | JSONB | required | Session summary payload |

### 4.3 Event Types

| Status | Meaning |
|---|---|
| `session_started` | Session created/resumed marker |
| `instance_generated` | New generated instance saved |
| `action` | Generic action request recorded |
| `log_set` | Set result event |
| `log_interval` | Interval result event |
| `timer` | Timer event (`set_timer`/`cancel_timer`) |
| `coach_message` | Reserved coach messaging event |
| `safety_flag` | Pain/safety event |
| `session_completed` | Completion marker |
| `error` | Error event classification |

---

## 5. HTTP Interfaces and Contracts

### 5.1 Workout Routes

All routes are authenticated by `authenticateToken` and mounted at `/trainer/workouts`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/plan-intent` | Generate structured plan from free-text intent |
| `POST` | `/sessions` | Create or resume workout session |
| `GET` | `/sessions/:id` | Fetch session + latest instance |
| `POST` | `/sessions/:id/generate` | Generate workout instance for session |
| `POST` | `/sessions/:id/actions` | Apply in-session action |
| `POST` | `/sessions/:id/complete` | Complete session and generate summary |
| `GET` | `/sessions/:id/events` | SSE polling stream of session events |

### 5.2 Request Attributes

| Key | Type | Default | Description |
|---|---|---|---|
| `force_new` | Boolean | `false` | If true, always create new session |
| `metadata` | Dict | `{}` | Session metadata; used for `coach_mode` |
| `calendar_event_id` | String | `null` | Optional explicit link |
| `planned_session_id` | String | `null` | Optional explicit link |
| `intent` | String | `planned` | Planned/user-specified hint |
| `request_text` | String | `null` | User free-text request |
| `time_available_min` | Integer | `null` | Available workout duration |
| `equipment` | List<String> | `[]` | Equipment override from client |
| `planned_intent_original` | Dict | `null` | Original intent payload snapshot |
| `planned_intent_edited` | Dict | `null` | User edits to intent payload |
| `action_type` | String | required | Action key for `/actions` |
| `payload` | Dict | `{}` | Action payload |
| `reflection` | Dict | `{}` | Completion reflection |
| `log` | Dict | `{}` | Completion log summary |

### 5.3 Session Link Validation Rules

`createSession` validates explicit links:

- `calendar_event_id` must exist for the same user.
- `planned_session_id` must exist for the same user.
- If both are provided, they must refer to each other consistently.
- If neither is provided, the service auto-links the first scheduled workout event for "today" if found.

### 5.4 Controller-Level Behavior

```
FUNCTION create_or_resume_session(user_id, body):
    session = getOrCreateSession(user_id, options_from_body)
    logEvent(session.id, "session_started", {source, timestamp})
    RETURN {success: true, session}

FUNCTION generate_workout(user_id, session_id, body):
    ASSERT session.user_id == user_id
    IF session.planned_session_id exists:
        planned = getPlannedSession(...)
    constraints = normalize_generation_constraints(body, planned)
    instance = generateWorkoutInstance(user_id, constraints)
    saved = createWorkoutInstance(session_id, instance)
    logEvent(session_id, "instance_generated", {constraints, version})
    IF coach_mode provided:
        updateSession(session_id, {coach_mode})
    RETURN {success: true, instance: saved.instance_json, version: saved.version}
```

---

## 6. Generation Engine Behavior

### 6.1 Context Assembly

`generateWorkoutInstance(userId, constraints)` fetches in parallel:

- `user_profile`
- `user_settings`
- `all_locations`
- `workout_history`
- active training program (`getActiveProgram`)
- latest weights profile (`getLatestProfile`)

`buildUserContextSummary` compacts these data sources into prompt lines:

- body stats
- current location + equipment list
- recent workouts (up to 3)
- unit preferences

### 6.2 Prompt Construction

`buildWorkoutPrompt(...)` creates a single user prompt that includes:

1. User context summary text.
2. Active program markdown if present.
3. Weights profile lines if present.
4. Pre-workout context fields from constraints.
5. Required JSON output shape.
6. Weight-unit and rounding rules.

### 6.3 Model Invocation

The service calls Anthropic:

- model: `PRIMARY_MODEL` or `claude-haiku-4-5`
- max tokens: `4096`
- system: JSON-only instruction
- message: one user prompt

### 6.4 Parsing and Normalization

```
FUNCTION generate_workout_instance(user_id, constraints) -> WorkoutInstance:
    data = fetch_context_sources(user_id)
    prompt = buildWorkoutPrompt(data, constraints, program, weights)
    response = anthropic.messages.create(...)
    text = first_text_block(response.content)
    parsed = extractJson(text)                 -- first '{' to last '}'

    IF parsed is NONE OR parsed.exercises is falsy:
        RAISE "Failed to parse workout instance from model response"

    RETURN normalizeWorkoutInstance(parsed, constraints)
```

Normalization rules:

- Missing `title` -> `"Today's Workout"`.
- Missing `exercises` -> `[]`.
- `estimated_duration_min` can fall back from `duration_min`.
- Per-exercise aliases supported:
  - `type` -> `exercise_type`
  - `name` -> `exercise_name`
  - `hold_sec` -> `hold_duration_sec`
  - `rest_sec` -> `rest_seconds`
  - `distance` -> `distance_km`
  - `load_kg_each` -> `load_each`

### 6.5 Intent Planning (Pre-Generation)

`generateIntentPlan(userId, intentText)`:

- Uses profile/settings/locations + active program context.
- Calls Anthropic with JSON-only response format `{focus, notes, duration_min}`.
- Parses and clamps duration to `[10, 120]`.
- Defaults:
  - `focus` -> `"Custom Workout"`
  - `notes` -> `"Custom workout based on your request."`
  - `duration_min` -> `45` if absent/unparseable before clamp.

---

## 7. iOS Orchestration Behavior

### 7.1 State Machine

```
IDLE -> PRE_WORKOUT          -- start planned or custom
PRE_WORKOUT -> GENERATING    -- user taps Get Started
GENERATING -> ACTIVE         -- session + instance succeed
GENERATING -> PRE_WORKOUT    -- generation fails
ACTIVE -> COMPLETING         -- all exercises done / user flow
COMPLETING -> COMPLETED      -- completion API or local fallback
ANY -> IDLE                  -- reset()
```

### 7.2 Pre-Workout Sources

- Planned flow: `startPlannedSession(calendarEvent)` seeds title/notes/duration from planned intent JSON.
- Custom flow: `startNewWorkout()` starts on intent page.
- Intent submit: `planIntent(intentText)` backfills editable review fields.

### 7.3 Generate Request Mapping

| iOS Source | API Field | Behavior |
|---|---|---|
| `arrivedFromIntentPage ? "user_specified" : "planned"` | `intent` | Session intent classifier |
| trimmed user intent text | `request_text` | Sent only for intent-driven flow |
| clamped pre-workout duration | `time_available_min` | `10..120` on client |
| selected location equipment names | `equipment` | Optional override |
| original review values | `planned_intent_original` | Always sent in generate call |
| edited review diff | `planned_intent_edited` | Sent only when changed |
| `nil` | `coach_mode` | Not currently set by app on generate |

### 7.4 Generation Algorithm in WorkoutStore

```
FUNCTION workout_store_generate_workout():
    session_status = GENERATING
    dismiss_pre_workout_sheet()
    WAIT 300ms
    is_workout_view_presented = true

    IF arrived_from_intent_page:
        ad_hoc_event = create_calendar_event(intent_json=original_intent)

    session = create_or_resume_workout_session(force_new=true, links=calendar/planned)
    request = build_workout_generate_request(...)
    instance = generate_workout_instance(session.id, request)

    current_session = session
    current_instance = instance
    session_status = ACTIVE
    start_timer_segment()

ON ERROR:
    rollback_ad_hoc_event_if_created()
    clear_current_session_and_instance()
    error_message = "Failed to generate workout. Please try again."
    session_status = PRE_WORKOUT
    is_workout_view_presented = false
    show_pre_workout_sheet = true
```

### 7.5 Persistence-Related Generation Behavior

During active workout:

- Periodic persist every 30 seconds from `WorkoutFlowView`.
- Dismissing the workout view triggers `suspendWorkout()` via `HomeView` observer.
- Suspended state can be restored by `loadPersistedState()` on home load.

This persistence layer is used to preserve generated sessions and current instance state across app interruptions.

---

## 8. In-Session Adaptation and Completion

### 8.1 Action Types and Effects

| Action | Payload Inputs | Instance Updated | Behavior |
|---|---|---|---|
| `swap_exercise` | `index` or `exercise_name` | Yes | LLM generates replacement exercise |
| `adjust_prescription` | `index` or `exercise_name`, optional `direction` | Yes | Scales selected exercise (`harder`/`easier`) |
| `time_scale` | `target_duration_min` | Yes | Scales full instance by clamped ratio |
| `flag_pain` | any payload | Yes | Scales full instance by fixed ratio `0.8` |
| `set_coach_mode` | `mode` | No | Updates session row only |
| `log_set_result`, `log_interval_result`, timer actions | payload | No | Event log only |

### 8.2 Action Algorithms

```
FUNCTION apply_action(session_id, user_id, action_type, payload):
    latest = getLatestInstance(session_id)
    updated = latest.instance_json
    instance_updated = false

    SWITCH action_type:
        CASE "swap_exercise":
            idx = resolve_index(payload.index, payload.exercise_name)
            replacement = generateSwapExercise(user_id, updated.exercises[idx], payload)
            updated.exercises[idx] = replacement
            instance_updated = true
        CASE "adjust_prescription":
            idx = resolve_index(...)
            direction = payload.direction OR "easier"
            updated.exercises[idx] = adjustExerciseIntensity(..., direction)
            instance_updated = true
        CASE "time_scale":
            target = payload.target_duration_min
            ASSERT target exists
            base = instance.estimated_duration_min OR estimateWorkoutDuration(instance)
            ratio = CLAMP(target / base, 0.4, 1.0)
            updated = scaleWorkoutInstance(instance, ratio)
            instance_updated = true
        CASE "flag_pain":
            updated = scaleWorkoutInstance(instance, 0.8)
            instance_updated = true
        CASE "set_coach_mode":
            updateSession(session_id, {coach_mode})
        DEFAULT:
            PASS

    logEvent(session_id, mapped_event_type, payload)
    IF action_type == "flag_pain":
        logEvent(session_id, "safety_flag", payload)

    IF instance_updated:
        record = createWorkoutInstance(session_id, updated)
        updateSession(session_id, {})   -- touch updated_at
        RETURN updated instance + new version
    ELSE:
        updateSession(session_id, {})
        RETURN existing instance + existing version
```

### 8.3 Completion and Feedback Loop

Completion endpoint behavior:

1. Fetch latest instance for session.
2. Upsert workout log (`trainer_workout_logs`).
3. Generate summary via LLM with JSON-only prompt.
4. If summary parse/API fails, fallback summary is returned.
5. Save summary version.
6. Mark session `completed` with timestamp.
7. Mark linked calendar event complete if present.
8. Log `session_completed` event.
9. Trigger async weights-profile update (`updateAfterSession`) without blocking response.

Client completion behavior:

- App sends reflection/log payload.
- On API failure (including expired/missing server session), app still sets local completed summary fallback and continues UX.

---

## 9. Known Limitations and Out of Scope

### 9.1 Current Limitations

**No strict schema validation for generated JSON.** The backend only checks that parsed JSON exists and has a truthy `exercises` field before normalization.  
Extension point: Apply `zod` validation (for example `WorkoutResponseSchema`) before persistence.

**`adjustDifficulty()` currently defaults to easier.** iOS action payload omits `direction`, and service defaults to `"easier"`.  
Extension point: Add explicit direction UI and include `direction` in app payload.

**`time_scale` cannot extend duration above baseline.** Ratio is clamped to `<= 1.0`, so the current behavior only compresses or keeps duration, despite UI wording.  
Extension point: increase ratio upper bound and add guardrails for expansion.

**Model output extraction is brace-based.** `extractJson` slices first `{` to last `}` and may fail on malformed mixed content.  
Extension point: use strict JSON mode or incremental parser with schema validation and retries.

**Instance version writes are not concurrency-guarded.** Version is computed by read-latest-plus-one without explicit transaction/lock.  
Extension point: use DB-side sequence/version function or retry on unique conflicts similar to event sequencing.

**SSE events endpoint is implemented but not used by iOS workout flow.** App currently operates request/response for actions and completion.  
Extension point: consume `/sessions/:id/events` for real-time state/event stream.

### 9.2 Explicitly Out of Scope

**Training program authoring internals.** Only `getActiveProgram` read behavior used by generation is in scope.  
Extension point: separate program spec can define markdown lifecycle and edits.

**General assistant conversation orchestration.** Only the workout-specific tools and service interactions are covered here.  
Extension point: agent-system spec should govern tool planning and loop policy.

**Workout analytics/reporting engine details.** Weekly trend/report pipelines are not part of generation behavior.  
Extension point: monitoring spec can define post-session analytics contracts.

---

## 10. Definition of Done

### 10.1 Scope and Architecture

- [ ] Spec explicitly limits scope to workout generation subsystem behavior.
- [ ] Spec describes both app REST flow and agent tool flow entrypoints.
- [ ] Architecture diagram includes iOS store, API routes/controllers, core service, and dependencies.
- [ ] Authenticated route requirement for `/trainer/workouts` is documented.

### 10.2 Data and Persistence

- [ ] Session, instance, event, log, and summary storage entities are defined with field-level meaning.
- [ ] Event types used by generation and actions are enumerated.
- [ ] Versioned instance persistence behavior is documented.
- [ ] Metadata fields persisted on normalized workout instances are documented.

### 10.3 API Contracts

- [ ] Each workout-generation route (`plan-intent`, sessions, generate, actions, complete) is documented.
- [ ] Request field defaults and normalization rules are documented.
- [ ] Session-link validation behavior (`calendar_event_id` and `planned_session_id`) is documented.
- [ ] Error/fallback behavior at controller and service boundaries is documented.

### 10.4 Generation and Adaptation Algorithms

- [ ] Pseudocode describes context fetch -> prompt build -> model call -> parse -> normalize pipeline.
- [ ] Pseudocode describes action handling with per-action behavior.
- [ ] Duration and intensity scaling clamp rules are documented.
- [ ] Completion summary generation and fallback path are documented.

### 10.5 iOS Orchestration

- [ ] WorkoutStore state transitions for generation lifecycle are documented.
- [ ] Pre-workout intent and review flow behavior is documented.
- [ ] Generate request mapping from iOS state to API payload is documented.
- [ ] Ad-hoc calendar event creation and rollback on generation failure are documented.

### 10.6 Known Limitations and Out of Scope

- [ ] Current implementation limitations are listed as observed behavior, not target behavior.
- [ ] Each limitation includes an explicit extension point.
- [ ] Out-of-scope declarations are explicit and bounded to non-generation subsystems.

### 10.7 Cross-Feature Parity Matrix

| Test Case | iOS REST Path | Agent Tool Path | Direct Service Invocation |
|---|---|---|---|
| Session creation yields an `in_progress` session | [ ] | [ ] | [ ] |
| Workout generation stores instance version `1` | [ ] | [ ] | [ ] |
| `swap_exercise` creates a new instance version | [ ] | [ ] | [ ] |
| `adjust_prescription` modifies selected exercise | [ ] | [ ] | [ ] |
| `time_scale` rejects missing target duration | [ ] | [ ] | [ ] |
| Completion writes log + summary + session status | [ ] | [ ] | [ ] |
| Summary fallback path returns non-empty summary on LLM failure | [ ] | [ ] | [ ] |

### 10.8 Integration Smoke Test

```
-- 1. Setup user and pre-workout inputs
user_id = create_test_user()
calendar_event = create_calendar_event(user_id, intent_json={"focus":"Leg Day","duration_min":45})

-- 2. Create session
session = POST("/trainer/workouts/sessions", {
    "force_new": true,
    "calendar_event_id": calendar_event.id
})
ASSERT session.success == true
ASSERT session.session.status == "in_progress"

-- 3. Generate instance
generated = POST("/trainer/workouts/sessions/" + session.session.id + "/generate", {
    "intent": "planned",
    "time_available_min": 45,
    "equipment": ["dumbbell", "bench"],
    "planned_intent_original": {"focus":"Leg Day","duration_min":45}
})
ASSERT generated.success == true
ASSERT LENGTH(generated.instance.exercises) > 0
ASSERT generated.version == 1

-- 4. Apply action (time scale)
scaled = POST("/trainer/workouts/sessions/" + session.session.id + "/actions", {
    "action_type": "time_scale",
    "payload": {"target_duration_min": 30}
})
ASSERT scaled.success == true
ASSERT scaled.instance_updated == true
ASSERT scaled.instance_version == 2

-- 5. Complete session
completed = POST("/trainer/workouts/sessions/" + session.session.id + "/complete", {
    "reflection": {"notes":"Felt good"},
    "log": {"exercisesCompleted": 5, "setsCompleted": 14, "totalDurationMin": 32}
})
ASSERT completed.success == true
ASSERT completed.summary.title is not NONE

-- 6. Verify persistence side effects
saved_session = GET("/trainer/workouts/sessions/" + session.session.id)
ASSERT saved_session.session.status == "completed"
ASSERT saved_session.instance_version >= 2

-- 7. Error path: missing target duration on time_scale
error_response = POST("/trainer/workouts/sessions/" + session.session.id + "/actions", {
    "action_type": "time_scale",
    "payload": {}
})
ASSERT error_response.success == false OR error_response.http_status >= 400
```

---

## Appendix A: Endpoint Payload Reference

### A.1 `POST /trainer/workouts/plan-intent`

Request:

```
{ "intentText": "glute workout for 35 minutes" }
```

Response:

```
{
  "success": true,
  "plan": {
    "focus": "Lower Body - Glutes",
    "notes": "Posterior-chain emphasis with moderate volume.",
    "duration_min": 35
  }
}
```

### A.2 `POST /trainer/workouts/sessions/:id/generate`

Request:

```
{
  "intent": "user_specified",
  "request_text": "glutes and hamstrings",
  "time_available_min": 45,
  "equipment": ["dumbbell", "bench"],
  "planned_intent_original": { "focus": "Lower Body", "duration_min": 45 },
  "planned_intent_edited": { "duration_min": 40 }
}
```

Response:

```
{
  "success": true,
  "instance": { "...": "normalized workout instance json" },
  "version": 1
}
```

---

## Appendix B: Implementation Notes

**Why this spec is "current-state" and not "target-state".** This document records behavior currently observable in code paths under `WorkoutStore`, `APIService`, workout controllers/routes, and `trainerWorkouts.service`. It intentionally includes implementation quirks (for example default `adjust_prescription` direction and `time_scale` clamp behavior) so future changes can be compared against an accurate baseline.

**Why generation and completion are documented together.** Completion produces summary and weights-profile updates that feed back into future generation prompts, so completion behavior is part of the generation loop's effective implementation.
