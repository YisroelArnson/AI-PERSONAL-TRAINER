# Personal Trainer Process Integration — Phase-by-Phase Implementation Plan

**Created**: 2026-02-01  
**Status**: Draft (execution outline)  
**Source doc**: `documents/2026-01-23-personal-trainer-process-integration.plan.md`  
**Context doc**: `thoughts/shared/research/2026-01-23-app-current-state-overview.md`  
**Design reference**: `documents/design-schema.json`  
**Goal**: Implement the end-to-end “trainer journey” (Intake → Assessment → Goals → Program → Execution → Monitoring) using the modes, artifacts, and backend architecture described in the source doc.

---

## How to use this plan
From the user’s perspective, the goal is that this “trainer system” never feels like a bunch of disconnected features—each phase should ship as a coherent experience where the same coach shows up with the right UI for the moment (interview, test, plan review, workout runner), remembers what the user said, and makes the next step obvious without asking them to re-explain themselves.
- This is intentionally **high-level** and meant to be executed **iteratively** (phase-by-phase).
- Each phase includes: **deliverables**, **implementation slices**, and **acceptance criteria**.
- When implementing, favor shipping a **happy-path vertical slice** first, then add edge cases/safety hardening.

---

## Phase 0 — Scope decisions + shared vocabulary (1–2 sessions)
Practically, this phase determines what the user will *feel* in the first sessions: whether onboarding is a smooth guided setup that quickly produces a believable plan and first workout (demo), or a more thorough experience that handles more real-world variability (v1). The user should still experience clear expectations: what happens today, what happens next, and what “setup complete” means.

---

## Phase 1 — Platform foundations (required for everything)
This phase makes the app feel like “one product” instead of “features taped together”: the user can move between setup, planning, and workouts without losing context, and the UI always matches the task (not everything jammed into a chat screen).

### 1.1 Modes + routing (one coach, multiple flows)
In practice, the user experiences one consistent coach persona, but the *container* changes: Intake feels like a guided interview with a clean canvas; Assessment feels like a test session with steps and timers; Program review feels like a readable plan with edit buttons; Workout mode feels like an action-first runner. Internally, each mode can be implemented as a **fully separate backend codepath** (separate folders/services/endpoints) as long as they all honor a small set of **shared contracts** (schemas + conventions) so the UI can render them consistently and the user never feels like they switched products.
**Deliverables**
- Mode router in the app: `GeneralChat`, `IntakeMode`, `AssessmentMode`, `GoalSettingMode`, `ProgramReviewMode`, `WorkoutCoachMode`, `CheckinMode`.
- Shared contracts (no shared implementation code):
  - Request/response envelope fields (e.g., `mode`, correlation IDs, timestamps).
  - Streaming/SSE event envelope shape (event type naming, payload rules, replay/resume expectations).
  - UI `presentation` metadata schema (the UI-rendering “dialects” each mode is allowed to use).
  - Error conventions (retryable vs not, user-safe messages, validation error shapes).
  - Idempotency conventions (header/key format + how conflicts are returned).
  - Safety conventions (how red flags/pain are encoded, and what the UI must do when it sees them).
- Per-mode contracts:
  - required inputs / required outputs (artifacts in/out)
  - allowed actions/tools (what that mode is permitted to change)
  - resumability rules (what “resume” means for that mode)

**Implementation slices**
1) Define the shared contract docs (schemas + examples) and treat them as “API law”.
2) Add a UI “frame switch” based on `mode` (chat vs focus prompt vs stepper vs workout runner).
3) For each mode backend, implement its own endpoints and event stream that conform to the shared envelopes and `presentation` schema.

**Acceptance criteria**
- App can navigate to each mode shell screen (even with placeholder content).
- Backend can return mode-typed responses without breaking the current chat flow.

### 1.2 Artifact storage + versioning
This is what makes the coach feel like it’s actually learning: after the user answers questions or completes a test, they see a clear summary card (“Here’s what I learned about you”) that they can review and fix. Over time, the user can revisit their goals/program/history in a “Your Data” hub, and changes don’t feel mysterious because versions exist and the system can explain what it’s using.
**Deliverables**
- Versioned storage for durable documents:
  - `IntakeSummary`, `AssessmentBaseline`, `GoalContract`, `TrainingProgram`, `WeeklyReport`, etc.
- Audit/event streams for each mode (append-only).

**Implementation slices**
1) Pick a consistent “document versioning” pattern:
   - `*_events` (append-only) + `*_documents` snapshots (versioned JSON).
2) Define a canonical JSON shape per artifact (start with “good enough” v1 fields; evolve later).
3) Add server-side validation (schema validation or structured validation) before persisting “confirmed/approved/active” versions.

**Acceptance criteria**
- Documents are immutable once “locked” (confirmed/approved/activated); new edits create new versions.
- Every persisted artifact is traceable back to an event sequence.

### 1.3 Journey state machine (gating + resume)
Practically, the app always gives the user a simple “Continue setup” or “Resume assessment” entry point, and it drops them back into the exact step they were on—no redoing work, no “where was I?” The user can also choose “not now” for parts of setup, and the app transparently shows what’s missing (and what that impacts) instead of silently proceeding.
**Deliverables**
- User-level `trainerJourneyState` stored server-side (and mirrored client-side for routing).
- Resume behavior: “Continue setup” banner until `program_active`.

**Implementation slices**
1) Create `trainer_journey_state` table/record with:
   - current_state, missing_requirements flags, last_updated, pointers to latest artifact versions
2) Add “skip for now” with explicit missing flags (never silently skip).
3) Implement “resume from last step” per mode session.

**Acceptance criteria**
- New user can start setup, leave mid-flow, and resume exactly where they left off.

### 1.4 Safety layer (always-on guardrails)
In practice, safety feels consistent and calm: the user regularly gets quick, context-appropriate checks (“Any pain today?”) and a visible “I have pain” escape hatch. If the user reports something risky, the coach clearly slows down, modifies the plan/workout, and explains why—prioritizing “play it safe” over hype or overly confident recommendations.
**Deliverables**
- Red-flag screening + pain scale capture patterns used consistently across modes.
- A single place to enforce conservative defaults (backend-side).

**Implementation slices**
1) Define `SafetyEvent` and `safety_flag` streaming event type.
2) Add “stop / seek help” escalation messages for red flags.
3) Ensure “pain triggers modification” pathway is available in Assessment + Workout.

**Acceptance criteria**
- Any pain/red-flag input produces a persisted `safety_flag` event.
- Modes behave conservatively under uncertainty.

---

## Phase 2 — Phase A: Intake (guided interview)
This is the user’s “first impression” of the trainer: it feels like a real coach interview—one focused question at a time, easy voice answers, and a sense of steady progress (topics completed) without the fatigue of filling out a form. At the end, the user sees a clean `IntakeSummary` that reads like “here’s what I understand about you,” with simple edit controls before they confirm and move on.

### Deliverables (v1)
- UI: Intake focus prompt canvas + topic progress + voice-first answer capture.
- Backend: intake session endpoints + checklist tracking + summary synthesis + confirm/edit.
- Artifact: `IntakeChecklist` + `IntakeSummary` (versioned).

### Implementation slices
1) **Session + checklist**
   - `POST /trainer/intake/sessions`
   - `POST /trainer/intake/sessions/:id/answers` (+ idempotency key)
   - Persist events and checklist item status updates (`set_intake_item_status`)
2) **Synthesis**
   - `POST /trainer/intake/sessions/:id/summary`
   - `POST /trainer/intake/sessions/:id/confirm` to lock + advance journey state
3) **Review/edit loop**
   - `POST /trainer/intake/sessions/:id/edit` to revise structured fields and create a new `IntakeSummary` version

### Acceptance criteria
- User completes required fields and confirms an `IntakeSummary`.
- Intake can be resumed mid-way without losing progress.

---

## Phase 3 — Phase B: Assessment (stepper tests, verbal-only)
The user experiences a short, guided “baseline session” with clear steps, simple instructions, and big, easy controls (start timer, next, skip). It should feel safe and doable at home: the app tells them exactly what to do, captures quick structured answers, and never makes them feel judged; the end result is a baseline summary that sets expectations (“we’ll start conservative here”) and highlights uncertainty when appropriate.

### Deliverables (v1)
- UI: stepper flow with instruction cards + timers + quick buttons + voice notes.
- Backend: assessment session + canonical `AssessmentStepLibrary` + per-step result persistence + synthesis.
- Artifact: `AssessmentBaseline` (versioned + confidence/uncertainty).

### Implementation slices
1) **Step library**
   - `GET /trainer/assessment/steps` returns ordered steps + input schema + contraindications + image keys.
2) **Session execution**
   - `POST /trainer/assessment/sessions`
   - `POST /trainer/assessment/sessions/:id/steps/:stepId/submit`
   - `POST /trainer/assessment/sessions/:id/steps/:stepId/skip` (requires reason)
3) **Synthesis + confirm/edit**
   - `POST /trainer/assessment/sessions/:id/complete` → generates baseline
   - `POST /trainer/assessment/sessions/:id/edit` → versions baseline fields

### Acceptance criteria
- Minimum step set can be completed (or skipped with reason), baseline is generated, user confirms.
- Pain reports can branch/modify/skip steps safely.

---

## Phase 4 — Phase C: Goal Setting (GoalContract)
Practically, the user is presented with a crisp “goal contract” that the coach drafted for them—timeline, commitments, and success metrics in plain language—so they can react instead of starting from a blank page. Editing feels like talking to a coach (“make it more realistic,” “I only have 30 minutes”) and the contract updates with a short “what changed” confirmation before the user approves.

### Deliverables (v1)
- UI: goal contract draft + approve/edit-by-voice loop.
- Backend: draft/edit/approve endpoints (versioned).
- Artifact: `GoalContract` (locked approved version).

### Implementation slices
1) `POST /trainer/goals/draft` from `IntakeSummary` + `AssessmentBaseline`
2) `POST /trainer/goals/:id/edit` applies user edits (document-edit tool)
3) `POST /trainer/goals/:id/approve` locks approved version and advances journey state

### Acceptance criteria
- User can approve without typing, or edit by voice and then approve.
- Contract clearly surfaces assumptions and constraints.

---

## Phase 5 — Phase D: Program Design (TrainingProgram + activation)
This is where the user sees the system “get specific”: a readable plan that shows what their typical week looks like, what the focus is, and how progression works—without dumping a wall of text. The user can ask quick “why” questions, request small changes by voice, and then press Activate with confidence because assumptions and guardrails are visible.

### Deliverables (v1)
- UI: program summary artifact + Q&A + voice edits + activate.
- Backend: draft/edit/review/activate endpoints.
- Artifact: `TrainingProgram` versioned; one version becomes active.

### Implementation slices
1) **Draft**
   - `POST /trainer/programs/draft` uses Intake + Assessment + GoalContract
2) **Review**
   - `review_training_program` tool (safety/quality) gates activation
3) **User iteration**
   - `POST /trainer/programs/:id/edit`
   - `GET /trainer/programs/:id` (latest version)
4) **Activation**
   - `POST /trainer/programs/:id/activate`
   - On activation, trigger calendar projection (Phase 6 dependency)

### Acceptance criteria
- A user can activate a program and see “what this week looks like” at a glance.
- Activated program is the single source of truth for Phase E generation.

---

## Phase 6 — Calendar + Planned Sessions (continuous scheduling)
Practically, the user can glance at a calendar/list and immediately understand what’s coming up (“Lower Strength • 45 min”) and move it around like a normal schedule. If life happens, they can reschedule or skip with one tap, and the system adapts forward without fighting them—future sessions adjust, but user-made changes are respected and not overwritten.

### Deliverables (v1)
- Backend calendar entities (`CalendarEvent`, `PlannedSession`) + rolling projection job.
- UI: basic calendar surface (month/week + list) + move/skip actions.

### Implementation slices
1) **Model + endpoints**
   - `GET /trainer/calendar?start=...&end=...`
   - `POST /trainer/calendar/events`
   - `POST /trainer/calendar/events/:id/reschedule`
   - `POST /trainer/calendar/events/:id/skip`
2) **Projection**
   - `generate_calendar_from_program` on activation and on program version changes
   - Rolling horizon extender (nightly/weekly job)
3) **PlannedSession intent**
   - Persist session intent per event for Phase E to consume

### Acceptance criteria
- Calendar populates the next 4–6 weeks from the active program.
- User edits are preserved (`user_modified=true`) across re-projections.

---

## Phase 7 — Phase E: Coaching & Execution (Workout Coach Mode)
This is the daily product: the user opens the app and can start training in seconds. The flow is action-first—minimal questions, big buttons, quick logging—and the coach shows up at the right moments (or stays quiet if preferred). When the user says “I have knee pain” or “I only have 15 minutes,” the workout adapts immediately with a clear reason, and the session ends with a short recap that feels motivating and useful.

### Deliverables (v1)
- UI: Today screen + micro readiness check + workout runner + swap/modify flows + end summary.
- Backend: workout session endpoints + event stream + generation + logging + completion summary.
- Artifacts: `WorkoutInstance`, `WorkoutLog`, `SessionSummary`.

### Implementation slices
1) **Session + instance generation**
   - `POST /trainer/workouts/sessions`
   - `POST /trainer/workouts/sessions/:id/generate` (planned/off-plan/quick_request)
2) **Event stream**
   - `GET /trainer/workouts/sessions/:id/events` (SSE)
   - Persist `trainer_workout_events` as source of truth; snapshot current state as needed
3) **Actions**
   - `POST /trainer/workouts/sessions/:id/actions` for swap/adjust/timer/pain/mode/end
   - Tools: `swap_exercise`, `adjust_prescription`, `set_timer`, `flag_pain_and_modify`, `log_set_result`
4) **Completion**
   - `POST /trainer/workouts/sessions/:id/complete` → `SessionSummary` + log persistence

### Acceptance criteria
- User can start/resume a workout in seconds and log sets with minimal friction.
- Quick-request sessions are tracked as replacements (and count toward progression).
- Pain/time constraints produce explainable modifications with conservative defaults.

---

## Phase 8 — Voice transcription + command routing (cross-cutting, but unlocks Phase E)
Practically, voice feels like a superpower during workouts: the user can tap-to-talk and say “timer 90,” “next,” “swap this,” or “RPE 8” and see it execute instantly with a small confirmation (haptic/toast), without waiting for a full assistant response. When they say something complex (“hotel gym, quick workout”), it smoothly falls back to coach reasoning and generates a good outcome without the user thinking about “fast path vs slow path.”

### Deliverables (v1)
- On-device transcription pipeline + local “fast path” command parsing for workout actions.
- Slow-path: send complex requests as text to backend coach.

### Implementation slices
1) Implement `SpeechManager` with:
   - `isListening`, `partialTranscript`, `finalTranscript`, `lastCommand`, `error`
2) Build a small command grammar:
   - next / set done / timer N / RPE N / swap / pain
3) Debounce + instant execution on high-confidence partials.

### Acceptance criteria
- Common commands trigger the correct UI/backend actions with low latency.
- Typed fallback always exists (no silent network STT fallback in v1).

---

## Phase 9 — Phase F: Monitoring & Adjustment (weekly reports + autopilot)
This phase makes the program feel alive without nagging: the user mostly just trains, and once a week they get a simple report that celebrates consistency, surfaces one or two insights, and lists any small changes made (“we reduced volume slightly because recovery was low”). Big changes never feel sneaky—when something major is recommended, the user gets a clear review screen and can approve/undo with confidence.

### Deliverables (v1)
- Deterministic aggregation (adherence/volume/intensity trends).
- Weekly report generation + notifications.
- Adjustment engine producing minor changes and queuing major ones for review.
- Artifacts: `WeeklyReport`, `AdjustmentRecommendation`, `ProgramPatch` → new `TrainingProgram` version.

### Implementation slices
1) **Aggregator**
   - Compute stable metrics from `WorkoutLog` + `SessionSummary` + measurements
2) **Weekly report**
   - `generate_weekly_report` tool + `trainer_weekly_reports` storage
3) **Adjustments**
   - `recommend_program_adjustments` tool proposes patches
   - `apply_program_patch` creates a new `TrainingProgram` version (auditable diff)
4) **Autopilot enforcement**
   - Auto-apply minor safe changes; require review for major changes
5) **UX surface**
   - Weekly report card + “Changes we made” + “Review changes” flow for major updates

### Acceptance criteria
- Weekly report is generated on schedule and visible on the home surface.
- Minor adjustments can be applied safely and explained; major ones require approval.

---

## Phase 10 — Measurements + user memory (supporting systems)
These systems make the coach feel accurate and personalized over time: measurements provide objective progress signals when the user opts in, and “coach memory” prevents the experience from repeatedly asking the same questions or proposing things the user has already ruled out (like running or certain exercises).

### Measurements (append-only time series)
From the user’s perspective, measurements are quick and optional: a simple screen to log weight/waist/height in seconds, see a clean trend line, and correct mistakes without losing history. The coach can reference trends gently (“weight trending down ~0.5 lb/week”) but never makes measurements feel mandatory unless the user chose that as a goal metric.
**Deliverables**
- `POST /trainer/measurements`
- `GET /trainer/measurements?...`
- `POST /trainer/measurements/:id/correct`
- UI: Measurements screen with quick add + chart + correction history.

### User memory (durable preferences/constraints)
Practically, this feels like a transparent “what the coach remembers about me” page: the user can see constraints and preferences (e.g., “no running,” “prefers 30-minute sessions,” “knee pain—avoid deep flexion”), edit them, and delete them. When the system wants to save something sensitive or high-impact, it asks for confirmation so the user stays in control.
**Deliverables**
- `upsert_user_memory`, `get_user_memory`, `forget_user_memory`
- UI: “Coach Memory” settings screen with edit/forget + confirmations for sensitive items.

### Acceptance criteria
- Memory retrieval returns a small, mode-relevant subset and always includes high-impact constraints.
- Measurements can be appended and corrected without deleting history.

---

## Phase 11 — Hardening + QA (do continuously, but formalize at the end)
This phase is what makes the experience feel trustworthy in the real world: no duplicated actions when the network flakes, workouts resume exactly where the user left off, summaries and plans don’t randomly change, and the system can always answer “why did you change this?” In practice, users should experience stability, clarity, and privacy—not “AI weirdness.”

### Hardening checklist
- Idempotency across all “submit answer/action” endpoints.
- Resumability: sessions survive app restarts and flaky networks.
- Schema validation for all “locked” artifacts.
- Observability: event correlation IDs, tool-call audit, error reporting.
- Security: RLS / user scoping on all sensitive artifacts and event streams.
- Safety: conservative behavior under uncertainty, plus red-flag escalation copy.

### Acceptance criteria
- A fresh user can complete A→F without manual DB edits or dev-only flags.
- The system can explain “what changed and why” for program updates.
