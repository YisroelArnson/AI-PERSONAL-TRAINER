---
date: 2026-02-15
researcher: Claude
git_commit: 838be02
branch: main
repository: AI-PERSONAL-TRAINER
topic: "Current codebase state vs. Workout Generation & Calendar spec"
tags: [research, codebase, workout, calendar, spec-gap-analysis]
status: complete
last_updated: 2026-02-15
last_updated_by: Claude
---

# Research: Codebase State vs. Workout Generation & Calendar Spec

**Date**: 2026-02-15
**Git Commit**: 838be02
**Branch**: main

## Research Question

What is the current state of the codebase in reference to the Workout Generation & Calendar spec (`docs/specs/2025-02-14-workout-generation-and-calendar.md`)?

## Summary

The codebase has **foundational infrastructure** (database schemas, API endpoints, models, exercise type system) but is **missing most of the user-facing features** described in the spec. The backend is further along than the frontend. Several iOS workout views were recently deleted (visible in git status), suggesting active restructuring. No cron jobs, no weights profile, no calendar UI, no pre-workout flow, and no workout mode exist yet.

## Gap Analysis by Spec Section

### Legend
- **Built** — Exists and matches spec
- **Partial** — Some infrastructure exists, incomplete
- **Not Built** — No implementation found

---

### Home Screen Workout Button — NOT BUILT

**Spec says**: Persistent bottom button showing today's planned session title or "Start Workout" fallback.

**Codebase has**: `HomeView.swift` exists with an AI greeting message, workout pills (`WorkoutPill.swift`), a quick action sheet, and a floating AI orb button. The Workout pill at the bottom should be refactored to match the spec's functionality for starting exercises.

---

### Calendar — PARTIAL (backend only)

**Spec says**: Rolling 1-week window of planned sessions, regenerated weekly. Calendar is single source of truth for planning and history. Entry lifecycle: planned → generated → completed.

**Codebase has**:
- **Backend**: `trainer_calendar_events` and `trainer_planned_sessions` tables exist. Full CRUD routes (`GET /`, `POST /events`, reschedule, skip, complete, sync`). Calendar service handles events and planned sessions.
- **iOS**: No dedicated calendar view. `MonitoringModels.swift` defines `CalendarEvent` and `PlannedSession` Swift models. `TrainerDataHubView` has a calendar section but it's a trainer/admin data hub, not the user-facing calendar.
- **Missing**: Weekly regeneration logic, rolling 1-week window enforcement, calendar entry lifecycle state machine.

---

### Pre-Workout Flow — NOT BUILT

**Spec says**: Screen with location (pre-filled), energy level (0-5), and time available (pre-filled from program). User confirms, AI generates.

**Codebase has**: Workout session creation endpoint (`POST /sessions`) exists. The iOS app has some readiness-check UI in the workout flow but not the three-input pre-workout screen described in the spec. Readiness check UI should be replaced with new page matching spec.

---

### Workout Presentation (List Mode + Workout Mode) — NOT BUILT

**Spec says**: Two toggleable modes — compact list items and full-screen swipeable exercise-by-exercise view with paragraph format and Done button.

**Codebase has**: Several workout component views were **recently deleted** (git status shows deletions of `BodyweightExerciseView`, `DurationExerciseView`, `ExerciseCard`, `ExerciseDotTracker`, `ExpandableDescriptionView`, `IntervalsExerciseView`, `IsometricExerciseView`, `StrengthExerciseView`). `WorkoutCoachSheets.swift` also deleted. This suggests the old workout UI is being torn out to make room for the new spec.

---

### Mid-Workout Actions — NOT BUILT

**Spec says**: Edit button opens menu with swap, adjust difficulty, time scale, pain flag, skip.

**Codebase has**: Backend has `POST /sessions/:id/actions` for logging exercise actions, and the workout events schema supports `safety_flag` and `action` event types. No iOS UI for mid-workout actions.

---

### Workout Completion — PARTIAL

**Spec says**: Summary screen with recap, wins, focus for next session. Optional notes prompt (type or speak). Notes silently inform future generation.

**Codebase has**:
- **Backend**: `POST /sessions/:id/complete` endpoint exists. `trainer_session_summaries` table stores AI-generated summaries.
- **iOS**: Some completion/reflection UI existed but is likely part of the deleted views.

---

### Custom/Unplanned Workouts — PARTIAL

**Spec says**: Via AI orb or plus button → describe what you want → pre-workout screen → generate.

**Codebase has**: The home screen has quick actions including "Generate" in an expanding FAB menu. The agent system supports workout generation via the `generate_workout` tool. No structured custom workout flow matching the spec.

---

### Workout Generation Endpoint — PARTIAL (needs separation)

**Spec says**: Dedicated API endpoint, not routed through the agent. Agent can invoke it as a tool.

**Codebase has**: `POST /sessions/:id/generate` endpoint exists in `trainerWorkouts.controller.js`. However, the generation currently happens through the agent tool system (`agent/tools/exercises.js` → `generate_workout` tool). The endpoint and the agent tool are **not yet separated** — the endpoint triggers agent-based generation rather than being a standalone generation endpoint that the agent can also call.

---

### Exercise Model — BUILT

**Spec says**: 4-type system (reps, hold, duration, intervals) with name, sets, type-specific values, load, description, timer_seconds, muscles_utilized, equipment.

**Codebase has**:
- **Backend**: `agent/schemas/exercise.schema.js` defines the 4-type system with full validation. Context builder enumerates 16 valid muscle groups.
- **iOS**: `Exercise.swift` and `UIExercise.swift` implement the 4-type model with muscle utilization and equipment.
- This is the **most complete** piece of the spec.

---

### Program Document — PARTIAL

**Spec says**: Single markdown document with goals, weekly template, current phase, progression rules, exercise rules, guardrails, Coach's Notes, milestones. Full weekly rewrite.

**Codebase has**:
- **Backend**: `trainer_programs` table with full lifecycle (draft → edit → approve → activate). `trainerProgram.service.js` handles AI-powered program drafting. Programs store `program_json` with exercises and periodization.
- **iOS**: `ProgramModels.swift` defines `TrainingProgram`, goals, weekly template, progression. `TrainingProgramStore.swift` manages program state.
- **Missing**: The "single markdown document" format. Current programs are structured JSON, not the living markdown doc described in the spec. No weekly rewrite mechanism. No Coach's Notes or milestones system.

---

### Weights Profile — NOT BUILT

**Spec says**: Separate structured profile tracking current capability by equipment + movement pattern. Versioned with snapshots. Auto-updated after each session.

**Codebase has**: No weights profile entity found in database schemas, backend services, or iOS models.

---

### Program Phases & Progression — NOT BUILT

**Spec says**: Performance-driven phase transitions evaluated weekly. AI autonomously picks next phase based on multiple signals.

**Codebase has**: `ProgramModels.swift` defines some progression concepts but no phase transition logic exists on the backend. No evaluation signals, no automatic phase management.

---

### AI Generation Inputs — PARTIAL

**Spec says**: 8 inputs (program, weights profile, session intent, location + equipment, energy, time, recent history, user profile).

**Codebase has**: `dataSources.service.js` fetches user_profile, workout_history, all_locations, user_settings. `contextBuilder.service.js` builds LLM context with user data as XML. Missing: weights profile, session intent as distinct input, energy level, time available as structured inputs.

---

### Session Data (Two Layers) — PARTIAL

**Spec says**: Programmatic stats (calculated, no LLM) per-session and weekly rollup + AI summary (Haiku).

**Codebase has**:
- `trainer_workout_logs` table for materialized workout data
- `trainer_session_summaries` for AI-generated summaries
- `trainer_weekly_reports` for weekly monitoring
- **Missing**: Deterministic programmatic stats calculator (total volume, total reps, etc.). Weekly rollup as a distinct object.

---

### Weekly Review Process — NOT BUILT

**Spec says**: Sunday night cron job. Gathers inputs → AI rewrites program → calendar regeneration → version saved. Pauses after 1 inactive week.

**Codebase has**: **No cron jobs exist.** Weekly report generation is manual (`POST /trainer/monitoring/weekly`). No automated program rewrite or calendar regeneration.

---

### Calendar Auto-Regeneration — NOT BUILT

**Spec says**: System plans 1 week ahead. Entire upcoming week regenerated fresh after weekly review.

**Codebase has**: Calendar sync endpoint exists (`POST /sync`) but no automated regeneration logic.

---

### First Week Bootstrap — PARTIAL

**Spec says**: During onboarding: program generation + first week of calendar entries + weights profile inference.

**Codebase has**: Program generation during onboarding works (draft → approve → activate). Calendar event creation on activation exists. Weights profile inference does not exist.

---

## What's Built vs. What's Not

| Feature | Backend | iOS | Status |
|---------|---------|-----|--------|
| Exercise 4-type model | Built | Built | **Complete** |
| Program lifecycle (draft/approve/activate) | Built | Built | **Complete** |
| Calendar CRUD | Built | Models only | **Partial** |
| Workout session endpoints | Built | Deleted/rebuilding | **Partial** |
| Session summaries | Built | Unknown | **Partial** |
| Agent chat/streaming | Built | Built | **Complete** |
| Location management | Built | Built | **Complete** |
| Home screen workout button | — | Not built | **Not started** |
| Pre-workout flow | — | Not built | **Not started** |
| Workout list mode | — | Not built | **Not started** |
| Workout swipe mode | — | Not built | **Not started** |
| Mid-workout actions | Events schema | Not built | **Not started** |
| Workout completion UI | Endpoint exists | Deleted/rebuilding | **Partial** |
| Standalone generation endpoint | Endpoint exists but agent-coupled | — | **Needs refactor** |
| Weights profile | Not built | Not built | **Not started** |
| Weekly review cron | Not built | — | **Not started** |
| Calendar auto-regeneration | Not built | — | **Not started** |
| Program weekly rewrite | Not built | — | **Not started** |
| Phase transitions | Not built | Not built | **Not started** |
| Programmatic stats calculator | Not built | — | **Not started** |
| Weekly stats rollup | Not built | — | **Not started** |

## Architecture Insights

1. **Old workout UI is being torn out.** The git status shows 8+ deleted Swift files for exercise views and workout coach sheets. The codebase is in a transition state — old implementation removed, new one not yet built.

2. **Backend is further along than frontend.** Database schemas, API routes, and services exist for workouts, calendar, and programs. The iOS app has models but is missing most of the user-facing views.

3. **Generation is agent-coupled.** The spec calls for a standalone workout generation endpoint, but currently generation flows through the agent tool system. This needs to be separated so the endpoint can be called directly from the pre-workout flow.

4. **No automation exists.** The weekly review, calendar regeneration, and weights profile updates are all spec'd as automated processes. None of these exist yet — everything is manual/on-demand.

5. **Program format mismatch.** The spec describes the program as a "single markdown document" that gets fully rewritten. The current implementation uses structured JSON (`program_json`). This is a design decision that needs to be resolved during planning.

## Code References

### Backend
- `BACKEND/controllers/trainerWorkouts.controller.js` — Workout session endpoints
- `BACKEND/controllers/trainerCalendar.controller.js` — Calendar CRUD
- `BACKEND/controllers/trainerProgram.controller.js` — Program lifecycle
- `BACKEND/services/trainerWorkouts.service.js` — Workout business logic (deleted per git status)
- `BACKEND/services/trainerCalendar.service.js` — Calendar service (deleted per git status)
- `BACKEND/agent/tools/exercises.js` — generate_workout tool
- `BACKEND/agent/schemas/exercise.schema.js` — Exercise validation schema
- `BACKEND/services/dataSources.service.js` — User data fetching
- `BACKEND/services/contextBuilder.service.js` — LLM context building
- `BACKEND/database/trainer_workouts_schema.sql` — Workout tables
- `BACKEND/database/trainer_calendar_schema.sql` — Calendar tables
- `BACKEND/database/trainer_program_schema.sql` — Program tables

### iOS
- `Features/Home/HomeView.swift` — Current home screen
- `Features/Home/Components/WorkoutPill.swift` — Compact workout display
- `Models/Exercise.swift` — 4-type exercise model
- `Models/UIExercise.swift` — UI exercise model with display metadata
- `Models/WorkoutSessionModels.swift` — Session, instance, completion models
- `Models/ProgramModels.swift` — Program, goals, weekly template
- `Models/MonitoringModels.swift` — CalendarEvent, PlannedSession models
- `Services/TrainingProgramStore.swift` — Program state management
- `Services/APIService.swift` — API communication

## Open Questions

1. **Program format**: Should the program remain structured JSON or migrate to the markdown format described in the spec? This affects the weekly rewrite approach. Answer: Should migrate to markdown
2. **Deleted services**: `trainerWorkouts.service.js`, `trainerCalendar.service.js`, and `trainerMonitoring.service.js` show as deleted in git status. Are these being rewritten or removed? Answer: THey have been readded, but can be refactored if neccesary for the new approach
3. **Generation endpoint refactor**: What's the plan for separating workout generation from the agent loop? The endpoint exists but internally delegates to the agent. Answer: We will have a generate workout end point that does not use the agent. The agent will have a tool to call this endpoint.
