# Intake + Exercise Logging Architecture (Plain English, Specific)

*Last updated: February 1, 2026*

This document explains **exactly how intake works** (backend + frontend) and **how exercises are saved/logged**. It references the concrete files and tables so you can evaluate whether this matches what you want.

---

## Part A — Trainer Intake (Phase A)

### 1) Database Structure (Supabase/Postgres)
**File:** `BACKEND/database/trainer_intake_schema.sql`

Four tables power intake:

1) `trainer_intake_sessions`
- One row per intake session.
- Fields: `user_id`, `status` (`in_progress`, `confirmed`, `archived`), `current_topic`, timestamps.

2) `trainer_intake_events`
- Event log for the intake conversation.
- Each event has a `sequence_number` so the transcript is ordered.
- `event_type` can be `assistant_message`, `user_answer`, `checklist_update`, `progress_update`, `safety_flag`, etc.
- Each event stores a `data` JSON payload.

3) `trainer_intake_checklist`
- One row per session storing **all intake checklist items** in JSON.
- Items track `status` (`unchecked`, `checked`, `skipped`) + optional notes.

4) `trainer_intake_summaries`
- Versioned JSON summaries of the intake.
- Each confirm/edit creates a new version.

RLS policies ensure the user only sees their own sessions/events/checklist/summary.

---

### 2) Backend Flow (Express + Service Layer)
#### Routes
**File:** `BACKEND/routes/trainerIntake.routes.js`

- `POST /trainer/intake/sessions` → create or resume a session
- `POST /trainer/intake/sessions/:id/answers` → submit an answer (SSE stream)
- `POST /trainer/intake/sessions/:id/confirm` → generate summary
- `POST /trainer/intake/sessions/:id/edit` → edit summary
- `GET /trainer/intake/sessions/:id/summary` → fetch latest summary

#### Controller Layer
**File:** `BACKEND/controllers/trainerIntake.controller.js`

- **createOrResumeSession**
  - Finds or creates an `in_progress` session.
  - Ensures trainer journey status becomes `in_progress`.
  - Returns: `session`, `checklist`, and the latest assistant prompt (if any).

- **submitAnswer** (SSE stream)
  - Verifies ownership.
  - Calls service to handle the answer.
  - Streams events back to the client:
    - `assistant_message`
    - `checklist` (updated items)
    - `progress` (aggregated)
    - optional `safety_flag`
    - `done`

- **confirmIntake**
  - Generates a summary (LLM). Stores new summary version.
  - Marks journey phase as `complete`.

- **editIntake**
  - Accepts `changes` JSON and stores a new summary version.

- **getLatestSummary**
  - Returns the most recent summary JSON.

#### Service Layer
**File:** `BACKEND/services/trainerIntake.service.js`

Key behaviors:

- **Checklist seed**
  - `CHECKLIST_ITEMS` defines required + optional intake items.
  - A new session writes a JSON checklist to `trainer_intake_checklist`.

- **Transcript log**
  - Every question/answer is written to `trainer_intake_events` with a sequence number.
  - This is the system’s “source of truth” for what was said.

- **Question generation**
  - `generateNextQuestion()` uses Anthropic to:
    - read transcript
    - pick missing items
    - return JSON with `next_question`, `checklist_updates`, `current_topic`, `safety_flag`
  - The response is parsed and then written to the event log.

- **Progress tracking**
  - `summarizeChecklist()` computes per-topic completion and required completion.
  - Stored as a `progress_update` event and returned to client.

- **Summary generation**
  - `synthesizeSummary()` sends the transcript to Anthropic and expects strict JSON.
  - Saved to `trainer_intake_summaries` as a new version.

---

### 3) iOS Frontend (Intake UI)
#### Models
**File:** `AI Personal Trainer App/AI Personal Trainer App/Models/IntakeModels.swift`

- `IntakeSession`, `IntakeChecklistItem`, `IntakeProgress`, `IntakeSummary` etc.
- These match the backend JSON structures exactly.

#### Store (State + Networking)
**File:** `AI Personal Trainer App/AI Personal Trainer App/Services/IntakeSessionStore.swift`

- `startOrResume()`:
  - Calls `APIService.createIntakeSession()`.
  - Sets `session`, `checklist`, and `currentQuestion`.
  - Appends the first “Coach” prompt to `transcript`.

- `submitAnswer(text)`:
  - Appends “You: …” to transcript.
  - Calls `APIService.streamIntakeAnswer()` (SSE stream).
  - Reacts to streaming events:
    - `assistant_message` → updates prompt + transcript
    - `checklist` → updates checklist items
    - `progress` → updates progress
    - `done` → ends loading state

- `confirmIntake()`:
  - Calls `APIService.confirmIntake()`.
  - Sets `summary` for the Summary view.

#### View
**File:** `AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerJourneyView.swift`

- `IntakeView` displays:
  - Current AI question
  - Progress view
  - Transcript
  - Text input + Send / Confirm buttons
- The “Confirm” button triggers summary generation and shows `IntakeSummaryView`.

---

### 4) Intake: What Actually Happens (Step-by-Step)

1) User taps **Start Intake**.
2) iOS calls `POST /trainer/intake/sessions`.
3) Backend creates session (if needed), creates checklist, and seeds the first AI question.
4) App shows that question.
5) User answers → `POST /trainer/intake/sessions/:id/answers`.
6) Backend logs answer, updates checklist via AI, returns next question as SSE events.
7) App updates UI live (question text, progress, transcript).
8) User clicks **Confirm** → summary is generated and stored.
9) Summary is shown to user.

---

## Part B — Exercise Logging (Saving Completed Exercises)

### 1) Database Structure
**File:** `BACKEND/database/workout_history_schema.sql`

Table: `workout_history`
- Each row is a single completed exercise.
- Stores:
  - Exercise name/type
  - Exercise-specific data (sets, reps, hold time, intervals, etc.)
  - Metadata (muscles, goals addressed, reasoning, equipment)
  - User feedback (RPE, notes)
  - Timestamps

RLS ensures each user only sees their own history.

---

### 2) Backend Flow (Express + Service)
#### Routes
**File:** `BACKEND/routes/exerciseLog.routes.js`

- `POST /exercises/log/:userId` → save completed exercise
- `GET /exercises/history/:userId` → fetch history
- `DELETE /exercises/log/:userId/:exerciseId` → undo completion

#### Controller
**File:** `BACKEND/controllers/exerciseLog.controller.js`

- Validates `userId`
- Calls service to log or delete
- Returns JSON response

#### Service
**File:** `BACKEND/services/exerciseLog.service.js`

- `logCompletedExercise(userId, exerciseData)`:
  - Validates required fields.
  - Inserts into `workout_history`.
  - Calls distribution tracking update (does not fail if tracking fails).

- `getWorkoutHistory(userId, options)`:
  - Supports limit + date range.

- `deleteCompletedExercise(userId, exerciseId)`:
  - Fetches exercise (for decrementing tracking).
  - Deletes row.
  - Decrements distribution tracking.

---

### 3) iOS Frontend (Logging + History Cache)

#### API Layer
**File:** `AI Personal Trainer App/AI Personal Trainer App/Services/APIService.swift`

- `logCompletedExercise(exercise)`:
  - Builds JSON from `Exercise`.
  - POSTs to `/exercises/log/:userId`.
  - Returns the database ID for that record.

- `deleteCompletedExercise(workoutHistoryId)`:
  - DELETEs from backend.

- `fetchWorkoutHistory(...)`:
  - Pulls history from backend by date or limit.

#### Cache Store
**File:** `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutHistoryStore.swift`

- `loadInitialHistory()` pulls last 30 days on app launch.
- `loadHistoryForDateRange()` fetches older data if needed.
- `addCompletedExercise(exercise, databaseId)` inserts into local cache.
- `removeCompletedExercise(id)` removes from cache.

#### Models
**File:** `AI Personal Trainer App/AI Personal Trainer App/Models/WorkoutHistory.swift`

- `WorkoutHistoryItem` matches the DB fields.
- Used by Stats/History UI and detail views.

---

### 4) Exercise Logging: What Actually Happens (Step-by-Step)

1) User completes an exercise in the workout UI.
2) iOS calls `APIService.logCompletedExercise(exercise)`.
3) Backend validates and writes row to `workout_history`.
4) Backend updates distribution tracking (muscle + goal balance).
5) Backend returns the new record ID.
6) iOS adds it to the in‑memory cache (`WorkoutHistoryStore.addCompletedExercise`).
7) Stats/History UI reflect the new record immediately.

Undo flow:
- iOS calls delete endpoint → backend deletes row → cache removes it.

---

## Summary (In Plain English)

**Intake** is a structured interview. The backend logs every question and answer, uses an AI model to decide what to ask next, and tracks progress through a checklist. When you confirm, it synthesizes a structured JSON summary and stores it as a versioned record.

**Exercise logging** is a simple pipeline: the app sends a completed exercise to the backend, it’s saved into `workout_history`, and the app updates its local cache so the history screens show it right away.

---

## If you want more detail
I can also add:
- A sequence diagram showing each network call and event
- Exact JSON payload examples for intake answers and exercise logs
- A quick “walkthrough trace” with realistic sample data
