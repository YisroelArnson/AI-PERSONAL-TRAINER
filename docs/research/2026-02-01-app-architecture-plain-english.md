# AI Personal Trainer App — Architecture in Plain English

*Last updated: February 1, 2026*

This document explains **how the current app works** in simple terms. It walks through each major part of the system—frontend, backend, database, and AI—and describes what each part does and how they connect.

---

## 1) Big Picture: Two Main Parts

**1. iOS App (SwiftUI)**
- What the user sees and interacts with.
- Shows workouts, stats, settings, and the AI chat overlay.

**2. Backend (Node.js / Express)**
- The “brain” that runs the AI coach, stores data, and serves the app.
- Connects to the database and the AI provider.

The app talks to the backend over HTTP and streams AI responses in real time.

---

## 2) iOS App Architecture (Frontend)

### a) Screens and Navigation
- **Home**: Main workout experience with exercise cards.
- **Stats**: Workout history and analytics.
- **Preferences**: Goals, equipment, locations, and AI-assisted goal setters.
- **Profile**: App settings, unit preferences, and access to trainer data tools.

Navigation is now handled by an **expanding FAB menu** at the top-left on Home (per the design schema). The old side drawer is no longer used in the main flow.

### b) Core UI Components
- **Exercise Cards**: Each exercise is a card. Different layouts based on type:
  - Reps (sets x reps)
  - Hold (hold time per set)
  - Duration (time/distance)
  - Intervals (work/rest rounds)
- **Orb Button**: The only colored element. It’s used as a primary AI/action trigger.
- **Assistant Overlay**: A floating chat interface on top of the app:
  - Shows messages, steps (“thinking”), and tool actions
  - Can minimize into a pill
- **FAB Menu**: Expands downward to show navigation icons

### c) State & Data Flow
- SwiftUI views use shared stores (singletons) for state:
  - `WorkoutHistoryStore`, `ExerciseStore`, `UserSettings`, etc.
- Most screens pull from these stores or call the backend directly via `APIService`.
- The UI reacts to store changes and updates automatically.

### d) Settings and Preferences
- **Units**: kg/lbs and km/mi
- **Auto-refresh**: When to fetch new workouts
- **Auto-location**: GPS-based location switching
- **Preferences**: User constraints and coaching preferences

These settings are saved in the backend and synced into `UserSettings`.

### e) Location System
- Users can save multiple locations with equipment lists.
- The app can auto-select the nearest location (if enabled).
- Location data affects which exercises the AI can recommend.

---

## 3) Backend Architecture (Node.js / Express)

### a) API Layer
- Express routes handle requests from the app.
- Typical endpoints:
  - Fetch workout history
  - Update goals/preferences
  - Fetch or generate workouts
  - Manage locations and equipment
  - Trainer “process” endpoints (intake, assessment, check-ins, etc.)

### b) AI Agent System
- The backend runs an **AI agent loop**.
- When the user sends a message:
  1. The system gathers context (goals, equipment, history, etc.).
  2. The AI chooses which “tools” to use (fetch data, create workout, ask question).
  3. The AI loops until it finishes and returns a final response.

This is why the app can show “thinking” steps during responses.

### c) Observability and Session Tracking
- Every AI interaction is logged:
  - Steps taken
  - Tools called
  - Tokens and cost
  - Timing

This makes it easy to see how the AI behaved and debug issues.

---

## 4) Database Layer (Supabase/Postgres)

The database stores:
- Users and auth sessions
- Workout history and exercises
- Goals (category and muscle)
- Preferences (constraints, injuries, etc.)
- Locations and equipment
- Trainer process sessions (intake, assessment, weekly reports, etc.)

Row-level security ensures each user only sees their own data.

---

## 5) AI Provider Integration (Anthropic)

- The backend uses Anthropic’s Claude models.
- Prompt caching is enabled to reduce cost and speed up responses.
- The AI agent can:
  - Generate full workouts
  - Summarize history
  - Ask clarifying questions
  - Update preferences

---

## 6) How a Typical Workout Flow Works

1. User opens Home.
2. App loads exercises from the backend (based on goals + equipment).
3. User completes exercises on card UI.
4. Completed sets and feedback are recorded.
5. History updates and feeds future recommendations.

If the user wants changes:
- They tap the orb or chat to ask for adjustments.
- The AI creates a new workout or modifies the current one.

---

## 7) Current Functionality (What Works Today)

- Authentication and account management
- Workout generation and recommendations
- Real-time AI chat with streaming
- Four exercise types with specialized UI
- Workout history and filtering
- Goal setting (category + muscle)
- Equipment & location management
- Preferences and constraints
- Trainer data tools: intake, assessment, check-ins, reports

---

## 8) How the Pieces Connect

**iOS App → Backend**
- Sends requests, receives data and AI responses

**Backend → Database**
- Stores user state and workout history

**Backend → AI Provider**
- Generates workouts and replies using context

All of these loop back into the UI so the user sees updated workouts, history, and AI guidance immediately.

---

## 9) Feature-by-Feature Architecture (Detailed, Plain English)

This section goes deeper into each major feature so you can see exactly how intake, assessment, goals, programs, workouts, logging, and monitoring are wired.

### A) Intake (Phase A)
**Database:** `BACKEND/database/trainer_intake_schema.sql`
- `trainer_intake_sessions`: one row per intake session, status + current topic.
- `trainer_intake_events`: append‑only transcript log with `sequence_number`.
- `trainer_intake_checklist`: JSON checklist of required/optional items.
- `trainer_intake_summaries`: versioned JSON summaries.

**Backend:** `BACKEND/routes/trainerIntake.routes.js`, `BACKEND/controllers/trainerIntake.controller.js`, `BACKEND/services/trainerIntake.service.js`
- `POST /trainer/intake/sessions` creates or resumes an in‑progress session and seeds checklist + first question.
- `POST /trainer/intake/sessions/:id/answers` accepts a user answer and streams SSE events:
  - `assistant_message`, `checklist` updates, `progress` updates, optional `safety_flag`, then `done`.
- `POST /trainer/intake/sessions/:id/confirm` generates a summary (LLM) and marks the journey phase complete.
- `POST /trainer/intake/sessions/:id/edit` stores a new summary version from edits.
- `GET /trainer/intake/sessions/:id/summary` returns the latest summary JSON.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Services/IntakeSessionStore.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Models/IntakeModels.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerJourneyView.swift`
- `IntakeSessionStore` starts/resumes a session, streams answers, and updates checklist/progress in real time.
- `IntakeView` shows the current question, transcript, and progress.
- Confirm generates the summary and shows `IntakeSummaryView`.

**What happens end‑to‑end**
1. User taps **Start Intake** → `POST /trainer/intake/sessions`.
2. Backend creates session + checklist and returns the first question.
3. User answers → streamed SSE response updates the transcript and checklist.
4. User taps **Confirm** → LLM summary is saved as a versioned record.

---

### B) Assessment (Phase B)
**Database:** `BACKEND/database/trainer_assessment_schema.sql`
- `trainer_assessment_sessions`: session state + current step.
- `trainer_assessment_events`: append‑only event log.
- `trainer_assessment_step_results`: per‑step results.
- `trainer_assessment_baselines`: versioned baseline summary.

**Backend:** `BACKEND/routes/trainerAssessment.routes.js`, `BACKEND/controllers/trainerAssessment.controller.js`, `BACKEND/services/trainerAssessment.service.js`
- `ASSESSMENT_STEPS` is a fixed step list (intro, movement prompts, questions).
- `POST /trainer/assessment/sessions` creates/resumes a session and sets journey phase to `in_progress`.
- `GET /trainer/assessment/steps` returns the full step list.
- `POST /trainer/assessment/sessions/:id/steps/:stepId` stores a step result and advances.
- `POST /trainer/assessment/sessions/:id/steps/:stepId/skip` logs a skip and advances.
- `POST /trainer/assessment/sessions/:id/complete` generates a baseline JSON via Anthropic and marks the phase complete.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Services/AssessmentSessionStore.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Models/AssessmentModels.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerJourneyView.swift`
- `AssessmentSessionStore` loads steps, submits results, and requests baseline on completion.
- `AssessmentView` walks the step list and shows `AssessmentBaselineView` at the end.

---

### C) Goals Contract (Phase C)
**Database:** `BACKEND/database/trainer_goals_schema.sql`
- `trainer_goal_contracts`: versioned goal contract JSON + status.
- `trainer_goal_events`: event log for draft/edit/approve.

**Backend:** `BACKEND/routes/trainerGoals.routes.js`, `BACKEND/controllers/trainerGoals.controller.js`, `BACKEND/services/trainerGoals.service.js`
- Draft uses **latest intake summary + latest assessment baseline** to generate a goal contract via Anthropic.
- `POST /trainer/goals/contracts` → draft.
- `POST /trainer/goals/contracts/:id/edit` → apply edits via LLM.
- `POST /trainer/goals/contracts/:id/approve` → mark approved and update journey.
- `GET /trainer/goals/contracts/:id` → fetch contract.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Services/GoalContractStore.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Models/GoalModels.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerJourneyView.swift`
- `GoalsView` can generate, edit, and approve the contract.

---

### D) Program Design (Phase D)
**Database:** `BACKEND/database/trainer_program_schema.sql`
- `trainer_programs`: versioned program JSON + status.
- `trainer_program_events`: draft/edit/approve/activate timeline.
- `trainer_active_program`: one active program per user.

**Backend:** `BACKEND/routes/trainerProgram.routes.js`, `BACKEND/controllers/trainerProgram.controller.js`, `BACKEND/services/trainerProgram.service.js`
- Draft uses **intake + assessment + approved goal contract** to build a structured TrainingProgram JSON.
- `POST /trainer/programs` → draft.
- `POST /trainer/programs/:id/edit` → apply edits via LLM.
- `POST /trainer/programs/:id/approve` → mark approved.
- `POST /trainer/programs/:id/activate` → set active program for the user.
- `GET /trainer/programs/:id` → fetch program.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Services/TrainingProgramStore.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Models/ProgramModels.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerJourneyView.swift`
- `ProgramDesignView` renders the program draft, allows edits, approval, and activation.

---

### E) Workout Sessions + Coach Mode (Phase E)
**Database:** `BACKEND/database/trainer_workouts_schema.sql`
- `trainer_workout_sessions`: active session metadata + coach mode.
- `trainer_workout_instances`: versioned workout JSON snapshots.
- `trainer_workout_events`: append‑only event stream (actions, logs, safety flags).
- `trainer_workout_logs`: final session log JSON.
- `trainer_session_summaries`: versioned post‑session summaries.

**Backend:** `BACKEND/routes/trainerWorkouts.routes.js`, `BACKEND/controllers/trainerWorkouts.controller.js`, `BACKEND/services/trainerWorkouts.service.js`
- `POST /trainer/workouts/sessions` → create/resume a session (links today’s calendar event if available).
- `POST /trainer/workouts/sessions/:id/generate` → uses Anthropic to create a workout instance JSON.
- `POST /trainer/workouts/sessions/:id/actions` → handles swap, adjust, time scale, pain flags, coach mode.
- `POST /trainer/workouts/sessions/:id/complete` → saves log, generates summary, and closes session.
- `GET /trainer/workouts/sessions/:id/events` → SSE stream of workout events.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutSessionStore.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Models/WorkoutSessionModels.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
- `WorkoutSessionStore.startSession()` creates a session and generates the instance.
- Actions (swap, adjust, log sets) call the backend and refresh the current instance.
- Completion triggers `completeWorkoutSession()` and clears the local state.

---

### F) Monitoring + Calendar (Phase F)
**Database:**  
`BACKEND/database/trainer_calendar_schema.sql`  
`BACKEND/database/trainer_monitoring_schema.sql`
- Calendar events live in `trainer_calendar_events`.
- Planned sessions are in `trainer_planned_sessions`.
- Weekly reports are in `trainer_weekly_reports`.

**Backend:** `BACKEND/services/trainerCalendar.service.js`, `BACKEND/services/trainerMonitoring.service.js`
- Calendar sync reads the active program and creates 28 days of projected sessions.
- Weekly reports scan `trainer_workout_logs` for the week and produce summary JSON.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerMonitoringViews.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Trainer/TrainerJourneyView.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Features/Home/HomeView.swift`
- `TrainerCalendarView` shows upcoming sessions and allows reschedule/skip.
- `WeeklyReportsView` generates and lists weekly reports.
- Home shows “upcoming event” and latest report.

---

### G) Exercise Logging + History (Stats)
**Database:** `BACKEND/database/workout_history_schema.sql`
- `workout_history` stores a completed exercise as a single row.

**Backend:** `BACKEND/routes/exerciseLog.routes.js`, `BACKEND/services/exerciseLog.service.js`
- `POST /exercises/log/:userId` logs a completed exercise.
- `GET /exercises/history/:userId` fetches history.
- `DELETE /exercises/log/:userId/:exerciseId` removes a log (undo).
- Logging also updates **exercise distribution tracking** if present.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Services/APIService.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutHistoryStore.swift`  
`AI Personal Trainer App/AI Personal Trainer App/Models/WorkoutHistory.swift`
- The app logs each completed exercise and caches it locally for Stats.

---

### H) Goals, Preferences, and Constraints (General)
**Category + Muscle Goals**
- **Backend:** `BACKEND/routes/categoryGoals.routes.js`, `BACKEND/routes/muscleGoals.routes.js`, `BACKEND/services/categoryGoals.service.js`, `BACKEND/services/muscleGoals.service.js`
- Parses user text into weighted goals using AI.
- **Frontend:** `CategoryGoalSetterView`, `MuscleGoalSetterView`, and `UserDataStore` sync to Supabase.

**Preferences**
- **Backend:** `BACKEND/routes/preference.routes.js`, `BACKEND/services/preference.service.js`
- Parses preference text into structured objects (temporary vs permanent).
- **Data source for AI:** `preferences` table is fetched and injected into prompts.

**Distribution Tracking**
- **Database:** `BACKEND/database/exercise_distribution_tracking_schema.sql`
- Incrementally updated on each logged exercise to track goal/muscle balance.

---

### I) Locations + Equipment
**Database:** `user_locations` table (used by `BACKEND/services/fetchUserData.service.js` and `BACKEND/services/dataSources.service.js`)
- Each location can include equipment metadata.
- The “current” location is marked and affects workout generation.

**Frontend**
- Locations are editable in Preferences/Profile flows and used by the AI context builder.

---

### J) AI Chat / Agent System
**Backend:**  
`BACKEND/routes/agent.routes.js`  
`BACKEND/controllers/agent.controller.js`  
`BACKEND/services/agentLoop.service.js`  
`BACKEND/services/initializerAgent.service.js`  
`BACKEND/services/contextBuilder.service.js`
- The **initializer agent** chooses which data sources to fetch.
- The **main agent loop** runs tool calls and streams events in real time.
- Tool results and assistant messages are streamed to the iOS app via SSE.

**Database:** `BACKEND/database/agent_schema.sql` + `BACKEND/database/observability_schema.sql`
- Stores agent sessions, events, traces, and metrics.

**Frontend:**  
`AI Personal Trainer App/AI Personal Trainer App/Features/Assistant/AssistantOverlayView.swift`
- Shows the live agent stream, tool steps, and responses.

---

### K) Journey State (Phase Progress)
**Database:** `BACKEND/database/trainer_journey_schema.sql`
- A single row tracks progress across intake → assessment → goals → program → monitoring.

**Backend:** `BACKEND/services/trainerJourney.service.js`
- Updates the phase statuses and computes overall state for the UI.

---

### L) Memory, Measurements, Check‑ins (Scaffolding Ready)
**Database:**
- Memory: `BACKEND/database/trainer_memory_schema.sql`
- Measurements: `BACKEND/database/trainer_measurements_schema.sql`
- Check‑ins: `BACKEND/database/trainer_checkins_schema.sql`

These schemas are in place to store long‑term memory, body measurements, and weekly/monthly check‑ins. The core UI flow doesn’t yet expose full CRUD screens for these, but the data model is ready.

---

## Summary (Plain English)

The app is a **SwiftUI front end** that shows workouts and chat, backed by a **Node.js server** that runs an **AI agent** and stores data in **Supabase**. The AI uses your goals, equipment, and history to generate workouts and guidance. The UI is intentionally minimal, black‑and‑white, and flat—with the AI orb as the only colored element.

If you want, I can also add an “architecture map” diagram or a short walkthrough video script next.
