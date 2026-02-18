# Workout History Page — Implementation Plan

## Overview

Implement the nested history experience from the CloudApp design artifact:

1. History list page
2. Workout detail page
3. Exercise detail page

This plan aligns the UI with the existing app visual language (`AppTheme`, `ThinTopBar`, card/chip styling) and uses a production-grade backend contract built on existing `trainer_workout_*` tables.

Primary artifact reference:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/docs/designs/artifacts/claude-app-design-artifact.jsx` (History + WorkoutDetail + ExerciseDetail sections around lines ~875–1000)

Primary app/backend references:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/StatsView.swift`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/Components/ExerciseDetailSheet.swift`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Services/APIService.swift`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/routes/trainerWorkouts.routes.js`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/controllers/trainerWorkouts.controller.js`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/services/trainerWorkouts.service.js`

## Artifact-Derived UX Contract

## 1) History list page
- Top bar: back to Home, centered title `"History"`.
- Intro paragraph with 3 inline highlighted stats:
  - completed workouts this month
  - avg session duration
  - consistency delta vs last month
- Scrollable list of workout cards:
  - date label (Today/Yesterday/fallback date)
  - title
  - compact meta (duration + run/exercise count)
  - completion check icon
  - tap opens workout detail

## 2) Workout detail page
- Top bar: back to History, centered workout title.
- Date string (full date format).
- 3 stat cards:
  - Duration
  - Exercises
  - Volume
- Exercise list cards:
  - name
  - compact set/rep preview
  - chevron to exercise detail

## 3) Exercise detail page
- Top bar: back to Workout Detail, centered exercise name.
- Sections:
  - Sets (with set index badge + reps + weight + completed icon)
  - Muscles Targeted (chips)
  - Goals Addressed (chips)
  - Why This Exercise (AI reasoning paragraph)

## Current-State Assessment

- `StatsView` is currently placeholder-only; no history flow is implemented.
- `WorkoutHistoryItem` model exists but is legacy/flat (exercise-level rows from `workout_history`) and does not match session-level nested UX.
- Existing backend supports single-session lifecycle (`create`, `generate`, `actions`, `complete`) but does not provide history list/detail APIs for completed sessions.
- Needed data already exists across:
  - `trainer_workout_sessions`
  - `trainer_workout_instances` (exercise structure + metadata)
  - `trainer_workout_logs` (execution summary)
  - `trainer_session_summaries` (summary JSON)
- `ExerciseDetailSheet` already renders rich exercise metadata and can be reused/refactored into the new history flow.

## Target Architecture

## iOS
- Replace placeholder Stats screen with a dedicated `HistoryFlowView` under the existing `.stats` destination.
- Use `NavigationStack` for nested drill-down:
  - `HistoryListView`
  - `WorkoutHistoryDetailView`
  - `WorkoutExerciseDetailView`
- Keep styling consistent with existing app:
  - `AppTheme.Colors.*`
  - `AppTheme.Typography.*`
  - `ThinTopBar`
- Keep top bar behavior artifact-accurate for this flow (screen-specific title/back path).

## Backend
- Add read APIs under `/trainer/workouts/history`:
  - paginated history list + monthly insight summary
  - workout detail payload with exercise list
- Assemble response from existing normalized tables; no immediate schema rewrite required.
- Add focused query indexes for completed-session pagination and detail lookup.

## API Contract (Proposed)

## GET `/trainer/workouts/history?limit=20&cursor=<iso>`
Returns session-level cards and page summary.

```json
{
  "success": true,
  "summary": {
    "month_completed_workouts": 12,
    "month_avg_duration_min": 38,
    "consistency_delta_pct": 20
  },
  "items": [
    {
      "session_id": "uuid",
      "started_at": "2026-02-18T14:10:00.000Z",
      "completed_at": "2026-02-18T14:49:00.000Z",
      "title": "Lower Body Power",
      "duration_min": 39,
      "exercise_count": 5,
      "session_type": "strength",
      "is_completed": true
    }
  ],
  "next_cursor": "2026-01-29T10:23:00.000Z"
}
```

## GET `/trainer/workouts/history/:sessionId`
Returns one completed workout with nested exercises for drill-down.

```json
{
  "success": true,
  "workout": {
    "session_id": "uuid",
    "title": "Lower Body Power",
    "started_at": "2026-02-17T14:10:00.000Z",
    "completed_at": "2026-02-17T14:48:00.000Z",
    "duration_min": 38,
    "total_volume": 4250,
    "exercise_count": 3,
    "exercises": [
      {
        "exercise_id": "uuid-or-stable-composite",
        "name": "Barbell Back Squat",
        "sets_preview": "3 sets · 8, 8, 6 reps",
        "sets": [
          { "index": 1, "reps": 8, "weight": "135 lb", "completed": true }
        ],
        "muscles": ["Quadriceps", "Glutes", "Hamstrings", "Core"],
        "goals": ["Build strength", "Increase leg power"],
        "reasoning": "..."
      }
    ]
  }
}
```

Notes:
- Exercise detail screen should use `workout.exercises[n]` already in memory (no extra API call).
- If `total_volume` is missing, derive from set/reps/load when available; else return `null`.

## Data Mapping Rules

- `title`: latest summary title → instance title fallback → `"Workout"`.
- `duration_min`: `trainer_workout_logs.log_json.totalDurationMin` fallback to `(completed_at - started_at)`.
- `exercise_count`: `instance_json.exercises.length`.
- `session_type`:
  - `run` if majority exercise types are `duration`
  - else `strength`
- `sets` for detail:
  - Start from planned values in `instance_json.exercises`.
  - Overlay logged set results only if present in workout events/log payload.
- `reasoning`: exercise `reasoning` from instance.
- `muscles/goals`: use exercise metadata arrays from instance.

## UI/UX Quality Standards

- Fast perceived performance:
  - Skeleton loading for summary paragraph + first list cards.
  - Paginate list (`limit=20`) with infinite scroll threshold.
- Clear hierarchy:
  - Full-date + 3 metrics at workout level.
  - Progressive disclosure (history list is concise, details are deep).
- Error handling:
  - Inline retry state for list fetch and detail fetch.
  - Preserve back navigation even when detail fetch fails.
- Empty state:
  - “No workouts yet” with CTA to return Home/start workout.
- Accessibility:
  - Dynamic type compatible text layouts.
  - 44pt minimum tap targets for cards/buttons.
  - VoiceOver labels for stat cards, set rows, and check icons.

## Backend Implementation Plan

## Phase 1: Service + controller read endpoints
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/services/trainerWorkouts.service.js`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/controllers/trainerWorkouts.controller.js`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/routes/trainerWorkouts.routes.js`

Tasks:
- Add service methods:
  - `listCompletedSessions(userId, { limit, cursor })`
  - `getCompletedSessionDetail(userId, sessionId)`
  - `buildHistorySummary(userId)` (current month vs previous month)
- Add controller handlers:
  - `listHistory`
  - `getHistoryDetail`
- Register routes:
  - `GET /history`
  - `GET /history/:sessionId`
- Keep auth and ownership checks consistent with existing controller style.

## Phase 2: Query performance + indexing
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/database/migrations/<new>-history-indexes.sql`

Tasks:
- Add index for history paging:
  - `(user_id, status, completed_at DESC)`
- Optional support indexes if needed:
  - `trainer_workout_instances(session_id, version DESC)`
  - `trainer_session_summaries(session_id, version DESC)` (already effectively covered by unique + sort, verify query plan)

## Phase 3: Backend tests
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/__tests__/trainerWorkouts.test.js`
- Optional new test file:
  - `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/__tests__/trainerWorkouts.history.test.js`

Tasks:
- Unit-test mapping logic for list cards and detail payload.
- Unit-test summary math:
  - month completed count
  - avg duration
  - consistency delta
- Controller tests:
  - 403 for wrong-user session access
  - pagination + cursor behavior

## iOS Implementation Plan

## Phase 1: Models + API client
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Models/WorkoutHistorySessionModels.swift` (new)
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Services/APIService.swift`

Tasks:
- Add new DTOs for:
  - list summary
  - list items
  - workout detail
  - nested exercise detail
- Add API methods:
  - `listWorkoutHistory(limit:cursor:)`
  - `fetchWorkoutHistoryDetail(sessionId:)`

## Phase 2: ViewModel + history list UI
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/WorkoutHistoryViewModel.swift` (new)
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/StatsView.swift`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/App/AppView.swift`

Tasks:
- Replace placeholder with `HistoryFlowView` backed by `NavigationStack`.
- Render artifact-style summary paragraph + list cards.
- Add pagination and pull-to-refresh.
- Ensure `.stats` page uses local nested navigation titles/back behavior (artifact-accurate) while preserving app-level page routing.

## Phase 3: Workout detail + exercise detail screens
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/WorkoutHistoryDetailView.swift` (new)
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/WorkoutExerciseDetailView.swift` (new)
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/Components/ExerciseDetailSheet.swift` (reuse/extract shared sections)

Tasks:
- Build workout detail stat cards and exercise rows.
- Build exercise detail sections (sets, muscles, goals, reasoning).
- Reuse existing section rendering from `ExerciseDetailSheet` where practical; avoid duplicate business formatting code.

## Phase 4: Instrumentation + polish
Files:
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App/AI Personal Trainer App/Features/Stats/*`
- `/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/BACKEND/controllers/trainerWorkouts.controller.js`

Tasks:
- Analytics events:
  - `history_opened`
  - `history_workout_opened`
  - `history_exercise_opened`
- Add defensive fallback UI for partial detail data.
- Validate dark/light contrast against app theme rules.

## Acceptance Criteria

Functional:
- History menu opens a real list of completed workouts.
- Tapping a workout opens workout detail with duration/exercise/volume cards.
- Tapping an exercise opens detail with sets, muscles, goals, reasoning.
- Back path works exactly: Exercise → Workout Detail → History → Home.

Data:
- Values come from `trainer_workout_*` records, not hardcoded mock data.
- Pagination works and avoids duplicate rows.
- Monthly summary reflects real completed sessions.

Quality:
- No blocking jank on first render.
- Empty/error states are fully handled.
- Unit tests pass for history mapping and API handlers.

## Testing Strategy

Backend:
- Run workout service tests and add history-specific coverage.
- Validate route auth with JWT-scoped user.
- Validate SQL performance with realistic history volume (1000+ sessions).

iOS:
- ViewModel unit tests:
  - date labels (`Today`, `Yesterday`, fallback)
  - summary sentence formatting
  - pagination dedupe/merge
- UI/manual pass:
  - iPhone small + large device sizes
  - slow network simulation
  - empty account and dense history account

## Risks and Mitigations

- Risk: inconsistent historical data quality across old sessions.
  - Mitigation: layered fallbacks for title/duration/volume and safe null rendering.
- Risk: large detail payloads for long workouts.
  - Mitigation: compact response shape and lazy render in exercise list.
- Risk: top bar conflicts between global app shell and nested history flow.
  - Mitigation: explicitly scope top-bar ownership for `.stats` flow during implementation.

## Out of Scope (for this iteration)

- Editing past workout logs.
- Merging/splitting sessions.
- Cross-workout exercise analytics timeline.
- Advanced charting beyond artifact parity.

## Delivery Order (recommended)

1. Backend list/detail endpoints + tests.
2. iOS models/API integration.
3. History list UI and navigation shell.
4. Workout detail and exercise detail UI.
5. Analytics/polish and final QA.
