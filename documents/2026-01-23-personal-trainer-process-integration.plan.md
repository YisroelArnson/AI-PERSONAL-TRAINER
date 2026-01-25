# Personal Trainer Process Integration Plan (Product + Architecture)

**Created**: 2026-01-23  
**Status**: Draft (living document)  
**Context**: Current app capabilities summarized in `thoughts/shared/research/2026-01-23-app-current-state-overview.md`.  
**Goal**: Expand from “chat + generate/adjust workouts” into a structured, trainer-like end-to-end journey: Intake → Assessment → Goals → Program → Execution → Monitoring.

---

## 1) Product Vision (What it should feel like)

### North Star
The user experiences a *single coach* that:
- Learns them deeply (intake + assessment)
- Aligns on realistic goals (goal contract)
- Designs a program (periodized plan)
- Coaches daily execution (day-of workout + technique guidance + adjustments)
- Monitors outcomes and adapts (weekly check-ins + reassessments)

### UX principles
- **Fast to start, deep over time**: minimal friction to begin; progressively gather depth.
- **Mode-appropriate UI**: conversations when it’s conversational; steppers/cards when it’s procedural.
- **Low cognitive load during workouts**: fewer questions, more “do the next thing”.
- **Safety-first**: conservative defaults, pain-aware modifications, clear escalation for red flags.

---

## 2) The Trainer Journey (Phases, outputs, and entry/exit criteria)

### Phase A — Initial Consultation (Intake)
**Format**: guided conversation (“coach interview”)
**Output artifacts**: transcript + `IntakeChecklist` + `IntakeSummary` (structured).  
**Exit criteria**: required fields complete + user confirms.

**Information to gather (v1)**:
- Goals (short-term, long-term), motivations, constraints
- Training history, current activity level, preferred modalities
- Equipment + locations (reuse existing locations feature)
- Injuries/limitations + “red flag” screening
- Time availability (days/week, minutes/session), schedule preferences
- Preferences: exercise likes/dislikes, coaching style, intensity tolerance

**Notes**


**UI (Intake Mode — conversational + voice-first)**
- **Overall feel**: “guided interview” on a mostly blank canvas (larger typography, fewer UI elements, calmer pacing) rather than a dense chat transcript.
- **Screen anatomy**
  - **Header**: “Trainer Setup” + phase label (“Intake”) + compact progress indicator (e.g., a segmented bar).
  - **Focus prompt canvas (primary)**:
    - **Coach prompt** in large text, centered-ish and vertically balanced for easy reading.
    - Optional small subtext for examples (“You can say: ‘3 days/week, 45 minutes’”).
    - **Kinetic text animation**: words appear one-by-one quickly (typewriter-esque but word-based) to feel “spoken” and alive.
  - **History (secondary, user-invoked)**:
    - By default, prior turns are visually minimized (they smoothly drift upward/off-screen as the next question begins).
    - User can scroll up to reveal the full transcript (e.g., a “pull down / scroll up” affordance).
  - **Voice input panel**:
    - Live transcription text area (shows what the user is saying in real time).
    - Controls: **Hold-to-talk** or **tap-to-record** (choose one), **Send** button, **Clear** / **Retry**.
    - States: idle → recording → transcribing → ready-to-send → sending.
  - **Quick actions** (optional, context-dependent): suggestion chips like “Skip”, “Not sure”, “Prefer not to say”, “Show examples”.
  - **Safety/consent microcopy**: subtle line for privacy + “This isn’t medical advice” link where appropriate.
- **Interaction pattern**
  1) Coach asks a single focused question (avoid multi-part prompts unless necessary).
  2) User answers by voice; transcript renders live (editable before sending).
  3) User taps **Send** to confirm the answer.
  4) Coach either (a) acknowledges + moves on, or (b) asks a follow-up for clarification, or (c) offers multiple choice chips to disambiguate.
- **Turn transitions (the “screen clears each question” behavior)**
  - Each new coach prompt begins on a mostly blank canvas; previous content slides upward and fades to a minimal “history layer”.
  - Scrolling upward reveals that layer; returning to the bottom snaps back into the focus prompt canvas.
- **Progress and structure without feeling “form-like”**
  - Questions grouped into “topics” (Goals, Schedule, Equipment, Injuries, Preferences, etc.).
  - The progress indicator reflects topics completed, not number of messages.
  - Provide an occasional “here’s what I’ve got so far” summary card after key milestones.
- **Review + edit step (end of intake)**
  - Present an `IntakeSummary` card with editable fields (inline edit or “tap to revise”).
  - Buttons: **Confirm & Continue** / **Edit** / **Run intake again**.
  - If the user edits, the coach confirms the delta and updates the structured artifact.
- **Failure/edge handling**
  - Low-confidence transcription: highlight uncertain words + “Tap to edit” before Send.
  - No response / user stuck: offer examples and chips (“I’m a beginner”, “I have knee pain”, “I don’t know my weight”).
  - Partial/rambling answers: coach paraphrases into a proposed structured interpretation and asks for confirmation (“Did I get that right?”).
- **Accessibility**
  - Full text-only alternative (type input) + optional TTS for coach questions.
  - Large text support; avoid color-only status signaling.

**Backend design (Intake Mode)**
- **Key assumption**: live transcription is rendered on-device (iOS) for low latency; backend receives only the *final user answer text* on **Send** (no partials; no confidence required in v1).
- **Core idea**: the interview LLM maintains progress using an explicit checklist tool, and a separate synthesis LLM generates the structured `IntakeSummary` *after* the interview using the full transcript.
- **Core responsibilities**: orchestrate the interview, persist the full-text transcript (assistant prompts + user answers), persist checklist state (what’s covered vs missing), stream assistant output + progress updates (SSE), enforce safety guardrails for red-flag responses, and run end-of-intake synthesis to produce `IntakeSummary` for user review.
- **Who tracks what (division of responsibilities)**
  - **LLM (interview)**: asks questions + decides when an intake item is “covered”; calls a tool to check it off.
  - **Backend (source of truth)**: stores the checklist state + transcript; enforces only simple gating (e.g., “all required items checked” before allowing confirm).
  - **LLM (synthesis)**: reads the entire transcript (and optionally the checklist) to generate the final structured `IntakeSummary`.
- **Checklist design**
  - Define an explicit list of intake items (IDs + labels), grouped by topic (Goals, Schedule, Injuries, Preferences, etc.).
  - Mark items as: `unchecked | checked | skipped` with an optional `note` (short justification like “user prefers not to share”).
  - Keep the checklist small and stable in v1 (easier prompting + UI progress).
- **Turn-by-turn flow (what happens after each user answer)**
  1) Client sends final `answer_text` → `POST /trainer/intake/sessions/:id/answers`.
  2) Backend appends a `user_answer` event to `trainer_intake_events`.
  3) Backend calls the **Interview LLM** with recent transcript + current checklist state + mode instructions.
  4) Interview LLM optionally calls `set_intake_item_status(item_id, status, note?)` one or more times.
  5) Interview LLM emits the next coach question (plus `presentation` metadata).
  6) Backend streams events to the client (assistant text + checklist updates + progress).
- **End-of-intake synthesis (how the intake document is generated)**
  - On `POST /trainer/intake/sessions/:id/confirm` the backend runs a **Synthesis LLM** pass that receives the full transcript and outputs a schema-valid `IntakeSummary`.
  - The client shows the generated `IntakeSummary` for review/edit; after acceptance, the backend applies canonical fields into existing tables (goals/injuries/preferences) while retaining the full transcript + summary for audit and re-runs.
- **Tradeoffs (acknowledged)**
  - This is simpler and more natural conversationally, but checklist correctness is model-driven; mitigate by keeping required items minimal and by requiring explicit `checked/skipped` statuses before confirmation.
- **Session lifecycle (multiple sessions)**
  - Support multiple intake sessions over time so a user can “Redo intake” from Settings.
  - “Current intake” defaults to the most recent session by date (typically the latest `confirmed_at`; if none are confirmed, the latest `updated_at` draft).
  - Starting “Redo intake” creates a new `trainer_intake_session` in `in_progress` status; prior sessions remain immutable history.
  - Confirming a new intake does **not** automatically pause or replace the active program; it creates a “program update available” banner/task and applies changes only after explicit user review/approval in Program Design.
- **Suggested components**
  - `IntakeSessionService`: create/resume, append events, compute topic progress, mark complete.
  - `IntakeAgentOrchestrator`: mode-specific prompt + allowed tools; calls the Interview LLM and streams events.
  - `IntakeChecklistTool` (tool): set/check/skip intake items (`set_intake_item_status`).
  - `IntakeSynthesisService`: runs the Synthesis LLM after confirmation to generate `IntakeSummary` from transcript.
  - (Optional) `IntakeSynthesisReviewer`: quick second pass to sanity-check the synthesized summary before showing it.
- **Data model (aligns with your event-stream direction)**
  - `trainer_intake_sessions`: `id`, `user_id`, `status`, `current_topic`, `created_at`, `updated_at`, `version`.
  - `trainer_intake_events`: append-only events (user answers, assistant prompts, tool calls/results, progress updates).
  - `trainer_intake_checklist`: `session_id`, `items_json`, `updated_at` (or store checklist updates as events and materialize a view).
  - `trainer_intake_summaries`: `session_id`, `version`, `summary_json`, `confirmed_at`, `source_event_sequence`.
  - After confirmation: apply canonical fields into existing tables (goals/injuries/preferences), but retain `IntakeSummary` for audit + re-runs.
- **Storage decision**
  - Use a **separate intake table set** (`trainer_intake_*`) rather than reusing the general agent session/event tables, to keep retention, access patterns, and evolution isolated.
- **Transcript persistence (since you want full text)**
  - Store each assistant prompt and each user answer as first-class events (not as a single blob) so you can: resume mid-flow, render history efficiently, and run analytics/QA later.
  - Use a lightweight `message_role` + `message_text` shape inside `trainer_intake_events.content` for transcript events, plus optional `presentation` metadata for UI behavior.
  - Retain transcripts indefinitely by default; still plan for user-initiated deletion/export controls as a later compliance feature if needed.
- **API surface**
  - Dedicated intake endpoints (do not reuse general chat SSE endpoints).
  - `POST /trainer/intake/sessions` (create/resume; returns `session_id` + current progress)
  - `POST /trainer/intake/sessions/:id/answers` (submit answer text; returns SSE stream: assistant + progress + checklist updates)
  - `GET /trainer/intake/sessions/:id/summary` (latest summary)
  - `POST /trainer/intake/sessions/:id/confirm` (locks + advances journey state)
  - `POST /trainer/intake/sessions/:id/edit` (user edits structured fields; server re-validates + versions)
  - `POST /trainer/intake/sessions/:id/restart` (optional convenience) or create a new session via `POST /trainer/intake/sessions` from Settings.
- **Streaming event types**
  - `assistant_text_delta` / `assistant_message_final`
  - `progress_update` (topic counts + remaining required items)
  - `checklist_update` (item_id + status changes)
  - `summary_generated` (emitted after synthesis; full JSON or a pointer)
  - `safety_flag` (red-flag screening result)
- **Presentation metadata (backend → UI)**
  - Include `presentation` in assistant messages (e.g., `{ style: "focus_prompt", animate: "word_by_word", replace_canvas: true }`) to drive the “screen clears each question” behavior consistently.
- **Reliability**
  - Accept an `idempotency_key` on `answers` so retries don’t duplicate events/summary writes; resume by replaying events to reconstruct state.
- **Privacy**
  - Minimize retention of raw audio (ideally none); keep strict RLS on health-adjacent data; allow “Prefer not to say” fields to remain unset; treat transcripts as sensitive and plan for deletion/export flows.

### Phase B — Assessment (No video, verbal-only)
**Format**: step-based flow where each screen is either (a) a question or (b) a guided test/exercise with instructions + reference imagery; user answers primarily by voice (on-device transcription) and taps `Next`.  
**Output artifact**: transcript + raw results + `AssessmentBaseline` (structured + confidence/uncertainty).  
**Exit criteria**: minimum step set completed (or skipped with reason) + baseline generated + user confirms.



**Assessment types (v1 set candidates)**
- Readiness/lifestyle baseline: sleep, stress, schedule, recovery capacity
- Strength/endurance proxies (equipment-dependent): push-up variation, squat pattern, plank/side plank holds
- Mobility/stability self-report: pain, ROM limits, balance confidence
- Conditioning proxy: time-based brisk walk / step test (self-reported exertion)

**V1 physical assessment flow (12–15 min; no equipment)**
- **Design note**: Intake already covers goals/history/equipment/schedule/preferences. Phase B focuses purely on physical testing + self-reported capability.
- **Structure**: 4 sections, stepper UI; each bullet is a screen (or tightly-coupled set of screens).
  - **Section 1 — Pre-check (1 min)**
    - `B0_intro`: brief explanation + “find space” + `Next`.
    - `B1_new_pain_check`: “Any new aches/pains today that affect movement?” → `no` or voice note; if `yes`, capture `location` + `severity` + `notes` and set `assessment_modifiers`.
  - **Section 2 — Movement quality (≈5 min)**
    - `B2_squat_5reps`: instructions + diagram; user does 5 reps → answers:
      - depth (`below_parallel|parallel|above_parallel|minimal`)
      - discomfort location (`none|knees|hips|low_back|ankles|other`)
      - heels (`flat|slight_lift|big_lift`)
    - `B3_single_leg_balance`: timer (20s) + “right then left” → answers:
      - balance (`steady_both|wobbly_both|one_side_harder|couldnt_hold`) + `harder_side` when relevant
    - `B4_overhead_reach_wall`: instructions + diagram → answers:
      - result (`yes_easy|yes_stretch|close|restricted`)
      - tightness (`none|shoulders|upper_back|chest`)
    - `B5_toe_touch`: instructions + diagram → answer:
      - reach (`floor|toes|ankles|mid_shin|knees_or_above`)
    - `B6_pushup_position_hold_15s`: instructions + diagram; timer (15s) → answers:
      - position (`full|knees|couldnt_hold`)
      - felt_working (`core|shoulders|arms|low_back_strain`)
      - line (`straight|sag|pike|not_sure`)
  - **Section 3 — Strength & endurance (≈5 min)**
    - `B7_pushups_amrap`: “as many as you can with good form” → answers:
      - count (number)
      - type (`full|knees|elevated|none`)
      - stop_reason (`arms|core|general_fatigue|discomfort`) + discomfort notes when relevant
    - `B8_squat_endurance_60s`: 60s timer + counter UI (user can tap per rep or speak final count) → answers:
      - count (number)
      - winded (`barely|moderately|very|stopped_early`)
    - `B9_plank_hold`: timer runs until stop → answers:
      - duration_seconds (number) or bucket (`<15|15_30|30_60|>60`)
      - first_limit (`core|shoulders|low_back_strain|general_fatigue`)
    - `B10_cardiovascular_check`: protocol chooser:
      - choose `jumping_jacks_20` or `high_knees_march_30s` (auto-suggest march if impact is contraindicated)
      - answers: `felt` (`fine|slightly_elevated|winded|very_winded`) + recovery (`already|<30s|30_60s|>60s`)
  - **Section 4 — Body awareness (≈2 min)**
    - `B11_tight_areas`: multi-select chips + optional voice note
    - `B12_weak_areas`: multi-select chips + optional voice note
    - `B13_coordination`: single choice (`coordinated|in_between|awkward`)
    - `B14_recovery_time`: single choice (`<=1_day|2_3_days|>3_days|not_sure`)
  - **Finish**
    - `B15_complete`: “Assessment complete” → triggers baseline synthesis + shows `AssessmentBaseline` review.

**UI/UX (Assessment Mode — stepper + voice)**
- **Overall feel**: “guided test session” (more procedural than chat) with a clear start/end, progress, and safety controls.
- **Screen structure**
  - Header: `Assessment` + progress (`Step 3 of 8`) + `Pause`/`Exit`.
  - Primary content area: step title + purpose (“Baseline: core endurance”), short instructions, and a diagram/image (when relevant).
  - Safety strip: “Stop if sharp pain/dizziness” + `Report pain` button.
  - Input area (per step type):
    - Voice answer with live transcription + `Send`.
    - Quick-select buttons for common responses (e.g., “No pain”, “Mild”, “Moderate”, “Severe”, “Not sure”).
    - Timers/countdown for holds/intervals (with `Start`, `Stop`, `Restart`).
  - Navigation: `Back` (when safe) / `Next` / `Skip` (requires reason).
- **Per-step UX conventions**
  - **One task per screen**: do the movement, then answer 1–3 short questions.
  - **Defaults + speed**: most inputs are chips/sliders; voice is for “other” and notes.
  - **Timer screens**: show big `Start`/`Stop` and auto-fill the measured time; user can override if needed.
  - **Rep count screens**: allow (a) typing, (b) speaking a number, or (c) tap-counter for 60s tests.
  - **“Report pain” is always visible** and can branch the flow (auto-skip high-risk steps, downgrade intensity).
- **Step types**
  - `QuestionStep`: single prompt + examples; voice + chips.
  - `TimedHoldStep`: shows form cues + timer; user reports duration achieved + RPE/pain.
  - `AMRAPStep` (optional): “as many reps as comfortable” within time; user reports reps + RPE/pain.
  - `ConditioningStep`: simple protocol + “talk test” + RPE; user reports time/distance if known.
  - `MobilityScreenStep`: guided self-check (“can you reach X?”) + pain/location selection.
- **On-step feedback**
  - Keep it minimal to avoid dragging the flow; provide clarifications only when the user is confused or reports pain.
  - Optional “Need help?” expands a small coach panel for quick explanations.
- **End screen**
  - “Assessment complete” + generated baseline summary card (`AssessmentBaseline`) with editable/confirmable fields.
  - Callouts for uncertainty (“We couldn’t confidently assess X; we’ll start conservatively.”).

**Backend design (Assessment Mode)**
- **Key assumption**: transcription is on-device; backend receives final `answer_text` or structured inputs (chips/timer results) per step.
- **Core idea**: persist a step-by-step transcript + raw results, then run a synthesis LLM once (or at milestones) to generate `AssessmentBaseline`.
- **Suggested components**
  - `AssessmentSessionService`: create/resume session, advance steps, persist step results, mark complete.
  - `AssessmentStepLibrary`: the canonical set of steps (IDs, instructions, image keys, input schema, required vs optional, contraindications, estimated time).
  - `AssessmentSynthesisService`: runs the synthesis model on completion to produce `AssessmentBaseline` from (a) full transcript events and (b) materialized step results.
  - (Optional) `AssessmentSynthesisReviewer`: sanity-checks baseline for risky conclusions and forces conservative outputs.
- **Data model (separate table set)**
  - `trainer_assessment_sessions`: `id`, `user_id`, `status`, `current_step_id`, `created_at`, `updated_at`, `version`.
  - `trainer_assessment_events`: append-only transcript + actions (assistant instruction shown, user answer, timer started/stopped, skip with reason).
  - `trainer_assessment_step_results`: materialized per-step results (structured fields for timers/reps/pain/RPE + free-text).
  - `trainer_assessment_baselines`: `session_id`, `version`, `baseline_json`, `confirmed_at`, `source_event_sequence`.
- **API surface (dedicated)**
  - `POST /trainer/assessment/sessions` (create/resume; returns `session_id` + current step)
  - `GET /trainer/assessment/steps` (returns ordered step list + step definitions for the current version)
  - `GET /trainer/assessment/sessions/:id` (session status + current step)
  - `POST /trainer/assessment/sessions/:id/steps/:stepId/submit` (answer payload; advances to next step)
  - `POST /trainer/assessment/sessions/:id/steps/:stepId/skip` (requires reason)
  - `POST /trainer/assessment/sessions/:id/complete` (runs synthesis; returns `AssessmentBaseline`)
  - `POST /trainer/assessment/sessions/:id/edit` (user edits baseline fields; versions + re-validates)
- **Safety behavior**
  - Any “pain/dizziness” report creates a `safety_flag` event; the flow can branch: reduce intensity, skip a step, or recommend stopping.
  - Synthesis must prefer “unknown / needs follow-up” over confident claims when the evidence is weak.

### Phase C — Goal Setting
**Format**: auto-drafted goal contract generated from Intake + Assessment, then a short review/edit flow where the user approves or refines by voice.  
**Inputs**: `IntakeSummary` + `AssessmentBaseline` (and optionally recent workout history if it exists).  
**Output artifact**: `GoalContract` (specific targets + timeline + tradeoffs + success metrics).  
**Exit criteria**: user approves the contract (or explicitly defers), and the approved version is persisted.

**How it works (v1)**
1) System generates a **Goal Draft** (no user typing required).
2) User reviews the draft and chooses: `Approve` / `Edit` / `Not now`.
3) If `Edit`, the user speaks changes (push-to-talk) and the contract updates live.
4) User re-approves; version is locked.

**UI/UX (Goal Setting Mode — draft + voice edits)**
- **Goal Draft screen (primary)**
  - A readable `GoalContract` card with:
    - Primary goal + timeline (“In 8 weeks…”)
    - Optional secondary goal (clearly labeled) to avoid diluted priorities
    - 2–4 measurable metrics (strength/conditioning/body comp/habit metrics as appropriate)
    - Weekly commitments (sessions/week, minutes/session)
    - Constraints/guardrails (injury considerations, schedule limits)
    - Tradeoffs/expectations (“We’ll prioritize X over Y for now”)
  - Actions: `Approve`, `Edit by voice`, `Not now`.
  - Confidence notes: highlight any assumptions (“If your goal weight is unknown, we’ll track consistency + strength first.”).
- **Edit-by-voice screen (overlay)**
  - Push-to-talk mic + live transcription + `Send`.
  - Shows the latest contract and highlights what changed after each instruction.
  - “Undo last change” and “Reset to draft” controls.
  - Optional quick chips: “Shorter timeline”, “More realistic”, “Focus on strength”, “Add cardio”, “I have less time”.
- **Approval loop**
  - After each edit, show a short diff-like summary (“Updated timeline: 8→12 weeks; sessions: 4→3/wk”).
  - Require explicit `Approve` to lock the current version.

**Backend design (Goal Setting Mode)**
- **Core idea**: generate a first-pass `GoalContract` once from the two upstream artifacts, then apply user-requested edits via a document-editing tool.
- **Dedicated endpoints**
  - `POST /trainer/goals/draft` (inputs: latest IntakeSummary + AssessmentBaseline; returns draft `GoalContract`)
  - `POST /trainer/goals/:id/edit` (voice edit instruction text; returns updated `GoalContract` version)
  - `POST /trainer/goals/:id/approve` (locks approved version)
- **Tools**
  - `draft_goal_contract` (LLM: creates initial draft)
  - `edit_goal_contract` (LLM: applies user instruction; must preserve schema + consistency)
  - (Optional) `review_goal_contract` (sanity check: realism, safety, measurability)
- **Data model (separate table set)**
  - `trainer_goal_contracts`: `id`, `user_id`, `status` (`draft|approved|deferred`), `version`, `contract_json`, `created_at`, `updated_at`, `approved_at`.
  - `trainer_goal_events`: edit instruction transcript + tool calls/results for audit.

**Examples (translation patterns)**
- “Lose weight” → weight goal (if provided) + fallback metrics (waist, steps, workouts/week) when weight is sensitive/unknown.
- “Get stronger” → measurable performance targets aligned with available equipment (e.g., push-ups, dumbbell presses, squat pattern).
- “Feel better/more athletic” → consistency + conditioning + movement quality targets.

**UI/UX questions to decide**
1) Allow **1 primary + optional 1 secondary** (e.g., strength + conditioning), with clear priority order.
2) Should timelines be **conservative by default** (recommended) or match user aspiration unless clearly unsafe?
3) Which metrics do you want to support in v1: weight/waist, reps/time tests, workouts/week, steps, VO2 proxy, subjective energy?

### Phase D — Program Design
**Purpose**: produce a *living reference document* that (a) supports continuous progression and (b) serves as the primary context for Phase E workout generation and real-time coaching.

**Format**: generate a program draft from approved upstream artifacts, run a safety/quality review pass, then present a review UI where the user can ask questions and request edits by voice before activation.

**Inputs**
- `IntakeSummary`
- `AssessmentBaseline`
- Approved `GoalContract` (primary + optional secondary)
- `BodyMeasurements` (if available)
- Workout history (if available)

**Output artifacts**
- `TrainingProgram` (versioned; structured “program spec”)
- `SessionTemplates` (repeatable session intents that Phase E can instantiate day-of)
- `ProgressionRules` (how loads/volume evolve; deload triggers; how to advance/regress)
- `Guardrails` (injury/pain modifications, contraindications, stop rules)

**What `TrainingProgram` must contain (v1 schema goals)**
- **Identity**: `program_id`, `version`, `created_at`, `active_from`, `authored_by` (`llm`), `assumptions`.
- **Goals**: primary/secondary goal mapping → measurable targets + timeline.
- **Schedule model**: `weekly_template` (days/week + session types) plus calendar projection rules (preferred training days, rest spacing constraints) used to generate continuous `CalendarEvents` + `PlannedSessions`.
- **Session intents**: per day/session type: focus, estimated duration, equipment requirements, and constraints.
- **Progression model**:
  - For each key movement pattern: how to progress (reps→load→sets), when to deload, and what to do on missed targets.
  - Time-scaling variants (e.g., `45min`, `30min`, `15min`) preserving intent.
- **Exercise selection rules**: allowed movements given equipment/injuries + substitution preferences.
- **Safety**: pain scale handling + “if pain then…” modifications + red-flag stop criteria.
- **Coach guidance hooks**: short cues per movement pattern (used in Phase E Ringer mode).

**UI/UX (Program Design Mode — draft + voice edits + Q&A)**
- **Program Draft screen**
  - A readable program summary card: weekly schedule + focus + progression overview + guardrails.
  - “What this looks like week-to-week” preview (simple week grid, not a calendar commitment).
  - Buttons: `Activate Program`, `Edit by voice`, `Ask a question`, `Not now`.
  - “Assumptions” callout: highlights anything inferred (e.g., recovery capacity) and invites correction.
- **Ask-a-question panel**
  - Lightweight chat/Q&A about the plan (“Why 3 days?” “Can we swap cardio to biking?”).
  - Answers should be brief and reference plan sections (“This affects your primary goal because…”).
- **Edit-by-voice loop**
  - Push-to-talk + live transcription + `Send`.
  - After each edit: show “what changed” summary + `Undo` + `Reset to draft`.
  - Common quick chips: “Less time per session”, “More cardio”, “More strength focus”, “Easier on knees”, “Add 4th day”.

**Backend design (Program Design Mode)**
- **Core idea**: generate a structured program draft, then allow iterative document edits; activation publishes a specific program version that Phase E reads.
- **Dedicated endpoints**
  - `POST /trainer/programs/draft` (creates a draft from Intake+Assessment+GoalContract; returns `program_id`)
  - `GET /trainer/programs/:id` (returns latest draft/version)
  - `POST /trainer/programs/:id/edit` (voice instruction text; returns updated program version)
  - `POST /trainer/programs/:id/approve` (locks reviewed version)
  - `POST /trainer/programs/:id/activate` (sets as active program for Phase E generation and triggers calendar projection)
- **Tools**
  - `draft_training_program` (LLM: produces the initial structured program spec)
  - `edit_training_program` (LLM: applies user edits while preserving schema + internal consistency)
  - `review_training_program` (LLM: safety/quality; flags volume spikes, missing warmups, unrealistic timelines)
  - `finalize_training_program` (optional: produces a concise user-readable summary view)
- **Data model (suggested)**
  - `trainer_programs`: `id`, `user_id`, `status` (`draft|approved|active|archived`), `version`, `program_json`, `created_at`, `updated_at`, `approved_at`, `active_from`.
  - `trainer_program_events`: edit/Q&A transcripts + tool calls/results (audit).
  - `trainer_active_program`: pointer to current `program_id` + `version` (or store on user profile).

**Proposed generation pipeline**
1) **Draft**: `draft_training_program` uses Intake + Assessment + GoalContract to create `TrainingProgram` + templates + progression rules.
2) **Review**: `review_training_program` returns required fixes + risk flags (must be resolved before activation).
3) **User review**: user asks questions and requests edits by voice (`edit_training_program`).
4) **Activate**: lock a version; generate the rolling calendar schedule from the weekly template; Phase E uses that version as the reference for workout generation and progression.

### Phase E — Coaching & Execution (Day-of workouts)
**Format**: “Workout Coach Mode” optimized for action; minimal typing; quick adjustments; voice-first when helpful.  
**Role in product**: this is the main daily experience—where the user actually trains, logs performance, and feels “coached”.

**Output artifacts**
- `PlannedSession` (calendar-level intent for a date)
- `WorkoutInstance` (the generated workout for today, based on program + readiness + equipment + time)
- `WorkoutLog` (what actually happened: sets/reps/load/RPE/pain/notes + substitutions + timestamps)
- `SessionSummary` (auto-generated recap + next-session recommendations)

**Exit criteria**
- Workout completed, ended early, or rescheduled; log saved; summary generated.

**UX goals**
- **Zero friction**: the user can start within ~5 seconds and begin moving.
- **Hands-free**: voice input for “swap this”, “make it easier”, “I have knee pain”, “start rest timer”.
- **Minimal cognitive load**: default path is just “do next set” and tap once.
- **Trust**: clear rationale for changes (“because you said you’re short on time…”).
- **Safety**: pain-first modifications, conservative progressions, deload triggers.

**Primary screens (suggested)**
- **Today / Workout Home**
  - Shows “Today’s Session” CTA: `Start` / `Resume` / `Rest Day` / `Schedule` (opens calendar).
  - Displays the day’s intent (from `PlannedSession` or program template): e.g., “Lower body strength + core (45 min)”.
  - Location/equipment chip (auto-detected, user-editable).
  - Coach mode toggle: `Quiet` / `Ringer` (persisted; can change mid-session).
  - Quick workout entry: `Quick workout…` (lets the user specify context like “hotel”, “no equipment”, “15 min”).
- **Readiness Check (micro-modal, 10–20 seconds)**
  - 2–4 quick inputs: `Time available`, `Energy`, `Soreness/Pain`, `Equipment changes`.
  - Skip/Defaults allowed; only ask more if necessary.
- **Workout Runner (existing card stack, upgraded)**
  - Exercise cards with sets/reps/weight + timers + rest.
  - “Glowing orb” / one-tap completion stays, but becomes set-level and session-level consistent.
  - Persistent top strip: elapsed time, next rest timer, quick actions.
- **Coach Overlay (lightweight, context-aware)**
  - A small “coach line” that occasionally surfaces cues (“Brace here”, “Slow down on the way down”) and can be expanded.
  - On-demand: tap/hold mic to ask anything; quick chips for common actions.
- **Swap / Modify Flow**
  - One tap: `Swap`, `Make easier`, `Make harder`, `Short on time`, `Pain`.
  - Presents 2–4 suggested alternatives with “why” and required equipment.
- **End-of-Workout Summary**
  - Celebrates completion + shows key stats (volume, PRs, RPE trend, pain notes).
  - Asks 1–2 reflection questions: “How hard was it?” “Any pain?”.

**Core loop (session day)**
1) **Start/Resume** → (optional) Readiness check.
2) **Generate/Load `WorkoutInstance` on Start**
   - If already generated today: resume.
   - If a planned session exists: generate from the plan + today constraints.
   - If no planned session exists: generate an “off-plan” workout based on program patterns + goals + history + constraints.
3) **Run workout**
   - Set-by-set logging + timers.
   - On-the-fly modifications: swap exercise, adjust load/reps, shorten session, handle pain.
4) **Wrap-up**
   - Capture quick reflection (RPE/pain/satisfaction).
   - Generate `SessionSummary` and persist.

**Feature requirements (v1)**
- **Generate workout on Start** (planned or off-plan) from the active program patterns + today constraints.
- **Quick workout requests**: user can request a workout that deviates from today’s plan (e.g., “I’m at a hotel, 15 minutes, no equipment”).
- **Exercise substitutions** (equipment mismatch, pain, preference) with rationale and safety constraints.
- **Time-scaling** (auto “45→25 min” variant: reduce sets/accessories; preserve main lift intent) with one-tap UX.
- **Logging**: sets, reps, load, time, rest, RPE, pain scale, notes, substitution reasons.
- **Technique guidance**: short cues per exercise + deeper “How do I do this?” drill-down.
- **Voice actions (push-to-talk)** (minimum set): “next”, “swap”, “timer”, “pain”, “change weight to X”.
- **Resumability**: leaving the app mid-workout and returning restores state.
- **Coach modes**: `Quiet` (only responds when asked / on safety triggers) vs `Ringer` (proactive cues at the right moments).

**Agent/LLM roles in Phase E (keep it modular)**
- **Workout Generator** (at start of session): produces `WorkoutInstance` from program + constraints.
- **Workout Coach** (during session): reacts to user commands/events; proposes safe modifications and cues.
- **Session Summarizer** (end): produces `SessionSummary` + feeds Monitoring (Phase F).

**Backend architecture (Workout Coach Mode)**
- **Dedicated endpoints** (parallel to Intake):
  - `POST /trainer/workouts/sessions` (create or resume session; supports planned/off-plan; returns `session_id`)
  - `GET /trainer/workouts/sessions/:id` (status + current `WorkoutInstance`)
  - `GET /trainer/workouts/sessions/:id/events` (SSE stream for live coaching + updates)
  - `POST /trainer/workouts/sessions/:id/actions` (user/UX actions: swap/adjust/timer/pain/end/coach_mode)
  - `POST /trainer/workouts/sessions/:id/generate` (generate `WorkoutInstance` on Start; includes `intent` + constraints)
  - `POST /trainer/workouts/sessions/:id/complete` (finalize + reflection; generates `SessionSummary`)
- **Event stream as source of truth**
  - Persist a `trainer_workout_events` stream (start, set completed, timer started, swap requested, coach message, instance updated).
  - Materialize current workout state from events (or store a snapshot on each major update).
- **Planned vs off-plan**
  - `WorkoutInstance.metadata.intent`: `planned | off_plan | quick_request`.
  - `WorkoutInstance.metadata.request_text` (optional): user-provided “hotel quick workout” text for traceability.
  - If a planned session exists for today and the user starts a `quick_request`, it **replaces today’s planned session** (not logged as an extra).
  - Replacements **count toward program progression** (i.e., Phase F treats it as today’s training stimulus when adapting upcoming sessions).
  - Suggested metadata to make this explicit:
    - `WorkoutInstance.metadata.replaces_planned_session_id` (nullable)
    - `WorkoutInstance.metadata.counts_toward_progression=true`
- **Tools/actions the coach can take (auditable)**
  - `create_or_update_workout_instance` (initial generation + mid-session updates)
  - `swap_exercise` (with constraints + reason)
  - `adjust_prescription` (sets/reps/load/rest/tempo)
  - `set_timer` / `cancel_timer`
  - `log_set_result` / `log_interval_result`
  - `flag_pain_and_modify` (forces safer alternatives + optionally ends session)
  - `end_session` (complete/stop/reschedule)
  - `set_coach_mode` (`quiet` / `ringer`)
- **Context provided to the Workout Generator**
  - Active `TrainingProgram` + today’s planned intent
  - Current location/equipment set
  - Recent workout history + distribution/fatigue signals
  - User preferences/injuries
  - Goals
  - Other relevant user data
  - Readiness check answers + time budget
- **Coach mode behavior**
  - `quiet`: coach only speaks when the user asks (push-to-talk) or when safety triggers (pain/red flags).
  - `ringer`: coach proactively provides cues at key moments (exercise start, first set, rest start/end) but stays brief and non-spammy.
- **“Quiet by default” coaching**
  - The backend should avoid constant LLM chatter; trigger coaching on events: first time seeing an exercise, user asks, pain/time change, repeated failures, or end-of-set reflections.

### Phase F — Ongoing Monitoring & Adjustment
**Goal**: make the program feel “alive” and continuously improving in the background, based on what the user actually does (Phase E logs), with minimal required input.

**Format**: background analysis + automatic small adjustments; occasional lightweight check-ins; clear reports/notifications so the user understands what’s changing and why.

**Inputs (v1)**
- Active `TrainingProgram` (current version)
- `WorkoutLog` + `SessionSummary` signals (adherence, RPE, pain, substitutions, time-scaling used, failures)
- `BodyMeasurements` trends (weight/waist if the user logs them)
- Goal progress tracking (from `GoalContract` metrics)

**Outputs (v1)**
- `WeeklyReport` (adherence + progress + flags + next-week focus)
- `AdjustmentRecommendation` (small changes or a proposed program version bump)
- `ProgramVersionUpdate` (new `TrainingProgram` version when needed)

**User experience (what it feels like)**
- **Mostly automatic**: the user trains; the system adapts behind the scenes.
- **Visible and explainable**: a weekly summary and occasional “we adjusted X because Y” notifications.
- **Minimal input**: only ask the user when the system is uncertain or safety-relevant.

**What gets adjusted (v1 adjustment menu)**
- **Progression tuning**
  - Increase/decrease load or reps targets based on success/failure and RPE.
  - Swap progression method (add reps before load, or vice versa) if the user stalls.
- **Volume/frequency tuning**
  - Add/remove sets or accessories based on recovery signals and adherence.
  - Deload insertion when fatigue/pain patterns suggest it.
- **Exercise selection**
  - Promote frequently-used substitutions into the plan (respecting equipment and preferences).
  - Replace exercises that repeatedly cause pain or confusion.
- **Time-budget alignment**
  - If the user repeatedly time-scales down, automatically shift the weekly template toward shorter sessions.
- **Calendar alignment**
  - Keep the user’s calendar schedule in sync with the program’s intended weekly template (rolling forward), while respecting user edits (moved sessions, rest days).
  - If the user consistently trains on different days than planned, propose (or auto-apply in `Auto-small`) a schedule shift so the calendar matches reality.
- **Program alignment for “quick requests”**
  - Since `quick_request` sessions replace the planned day and count toward progression, incorporate the actual stimulus into the next sessions (e.g., avoid repeating the same muscle emphasis tomorrow).

**Autopilot levels (recommended)**
- `Auto-small`: automatically apply small, low-risk adjustments (loads, small set changes, substitutions) and report them.
- `Review-major`: require user approval for major changes (days/week changes, new modality emphasis, major volume jumps, deload week insertion if not urgent).
- Safety overrides can still force conservative changes (e.g., pain-triggered regressions).

**Triggers (v1)**
- **After each session** (light): update progression targets for that movement pattern; detect pain/red flags; update “next session” notes.
- **Weekly** (primary): adherence + fatigue + progress trends → weekly report + minor adjustments.
- **Monthly / every 4–6 weeks**: propose a small reassessment battery (or refresh `AssessmentBaseline` if needed) and/or a program version bump.
- **Immediate**: pain spike, repeated failed sets, excessive soreness, user feedback.

**UI/UX (Monitoring & Adjustment)**
- **Weekly report card**
  - “You did 3/4 sessions” + key wins (PRs, consistency) + one improvement focus.
  - “Changes we made” section (bulleted, plain language).
  - “What’s next week” preview (high-level intent).
- **Change notifications**
  - Small toast/badge: “Program updated (minor)” with tap-to-view.
  - Major changes create a “Review changes” screen (voice Q&A + approve/undo).
- **Progress surface**
  - Simple charts for goal metrics (workouts/week, plank time, push-ups, weight/waist if logged).
  - “Coach notes” timeline: short notes the system generates from `SessionSummary`.

**Backend design (Monitoring & Adjustment)**
- **Core idea**: analyze workout/measurement streams, produce a weekly report, and optionally publish a new program version (or a patch) that Phase E immediately uses.
- **Services/components**
  - `MonitoringAggregator`: computes deterministic aggregates (adherence, volume, intensity, trend deltas) from `WorkoutLog` + measurements.
  - `AdjustmentEngine` (LLM-assisted): proposes safe modifications and/or a `TrainingProgram` patch given aggregates + recent sessions.
  - `ProgramVersioningService`: applies approved/auto-approved patches as new `TrainingProgram` versions and updates `trainer_active_program`.
  - `NotificationService`: creates in-app notifications (and later push) for weekly reports and changes.
- **Jobs/scheduling**
  - Run weekly jobs per user (cron-like) to generate `WeeklyReport` and apply `Auto-small` adjustments.
  - Run “after session” job on workout completion to update progression targets and generate `SessionSummary` if not already done.
  - Extend the calendar schedule on a rolling basis (e.g., always keep the next 4–6 weeks populated) and update upcoming planned sessions if the active program version changes.
- **Data model (suggested)**
  - `trainer_weekly_reports`: `id`, `user_id`, `week_start`, `report_json`, `created_at`.
  - `trainer_adjustment_events`: proposed changes + applied changes + rationale + severity (`minor|major|safety`).
  - `trainer_program_patches`: patch documents that produce new program versions (auditable diffs).

**Exit criteria**
- Weekly report generated; any eligible `Auto-small` adjustments applied; major changes queued for review; program version pointers updated.

---

## 3) App Architecture (How to integrate with the current system)

### 3.1 Interaction “Modes” (one coach, multiple flows)
Use the existing agent + streaming artifacts, but introduce **mode-specific instruction sets** and UI wrappers:
- `GeneralChat` (current)
- `IntakeMode` (conversation + progress)
- `AssessmentMode` (stepper + test cards + “Next”)
- `GoalSettingMode` (conversation + review/edit contract)
- `ProgramReviewMode` (plan artifact + accept/edit)
- `WorkoutCoachMode` (today workout + lightweight chat)
- `CheckinMode` (weekly/monthly check-in)

Each mode should define:
- Required inputs + required outputs
- Allowed tools/actions
- UI “frame” (chat-only vs stepper vs workout screen)

### 3.2 Data artifacts (structured outputs that persist)
Store durable documents that can be:
- read by LLMs as high-quality context
- shown to the user for confirmation
- versioned as the user changes

**Suggested artifacts (v1)**
- `IntakeChecklist`
- `IntakeSummary`
- `BodyMeasurements` (time-series: weight/height/waist/etc.)
- `AssessmentBaseline`
- `GoalContract`
- `TrainingProgram` (versioned)
- `CalendarEvents` + `PlannedSessions` (schedule + session intents)
- `WorkoutInstance` + `WorkoutLog`
- `WeeklyReport` + `AdjustmentRecommendations` + `ProgramPatches`

### 3.3 State machine (gating + resuming)
Introduce a user-level `trainerJourneyState` that supports:
- “Resume where I left off”
- “Skip for now” (with explicit missing-data flags)
- “Re-run intake/assessment” when circumstances change

Example states:
- `not_started`
- `intake_in_progress` → `intake_complete`
- `assessment_in_progress` → `assessment_complete`
- `goals_in_progress` → `goals_complete`
- `program_design_in_progress` → `program_active`
- `program_paused` / `program_needs_attention`

### 3.4 Tooling changes (backend agent capabilities)
Add tools that are explicit and easy to audit:
- `set_intake_item_status` (checklist tracking during intake)
- `synthesize_intake_summary` (generate `IntakeSummary` from transcript after confirm)
- `submit_assessment_step_result` (persist per-step inputs + transcript)
- `synthesize_assessment_baseline` (generate `AssessmentBaseline` from assessment transcript/results)
- `draft_goal_contract`
- `edit_goal_contract`
- `approve_goal_contract` (locks approved version)
- `draft_training_program`
- `edit_training_program`
- `review_training_program`
- `activate_training_program`
- `generate_calendar_from_program` (project program template onto dates)
- `create_or_update_calendar_event` / `reschedule_calendar_event`
- `create_or_update_planned_session` (session intent linked to a calendar event)
- `create_or_update_workout_instance` (initial + mid-session updates)
- `log_set_result` / `log_interval_result`
- `swap_exercise` / `adjust_prescription` (sets/reps/load/rest/tempo)
- `set_timer` / `cancel_timer`
- `flag_pain_and_modify`
- `complete_workout_session` (reflection + `SessionSummary`)
- `log_body_measurement` / `get_body_measurements` (weight/height/waist; append-only)
- `generate_weekly_report`
- `recommend_program_adjustments`
- `apply_program_patch` (creates a new `TrainingProgram` version)
- `create_notification` (weekly report + program changes)

### 3.5 Safety layer (always-on guardrails)
Implement a consistent “safety contract” across all modes:
- Red flag screening (chest pain, dizziness, acute injury, etc.)
- Pain scale handling + modifications
- Conservative progressions by default; deload triggers
- Clear medical disclaimer copy and escalation path

### 3.6 Measurements (Weight/Height/Waist tracking)
Store body measurements as an append-only time series so progress can be tracked and audited over time.

- **Design**
  - Treat measurements as **events**: never overwrite; new entries become the latest.
  - Support corrections by creating a new entry that references the prior one (e.g., `supersedes_id`).
  - Separate `measured_at` (when the user measured) from `created_at` (when they logged it).
- **Measurement types (v1)**
  - `weight`, `height`, `waist_circumference` (optionally later: `hip`, `chest`, `body_fat_percent`).
- **Data model (suggested)**
  - `trainer_measurements`
    - `id`, `user_id`, `measurement_type`, `value`, `unit`, `measured_at`, `created_at`
    - `source` (`user_manual|intake|checkin|import`) + `notes` (optional)
    - `supersedes_id` (nullable) to support corrections without deleting history
- **API surface (suggested)**
  - `POST /trainer/measurements` (append measurement)
  - `GET /trainer/measurements?types=weight,waist_circumference&limit=…` (time series)
  - `POST /trainer/measurements/:id/correct` (creates a new entry with `supersedes_id`)
- **Where it shows up**
  - Goal setting can propose metrics that rely on measurements (weight/waist) if the user opts in.
  - Monitoring can chart trends and include them in weekly/monthly check-ins.

### 3.7 Calendar (Continuous scheduling)
Add a first-class calendar so the user can see and edit “what’s on which day”, and so the system can continuously assign upcoming sessions based on the active program.

- **Design principles**
  - The program defines a *weekly template* (e.g., 3 days/week: Upper/Lower/Full).
  - The calendar holds *dated events* generated from that template on a rolling horizon (e.g., next 4–6 weeks).
  - A calendar event stores *intent*, not the full workout. Phase E still generates the actual `WorkoutInstance` on `Start`.
  - User edits are respected: moving/skipping a session updates the schedule and informs future projections.
- **Entities**
  - `CalendarEvent`: a dated item (workout session, rest day, assessment reminder, check-in).
  - `PlannedSession`: the session intent linked to a workout-type `CalendarEvent` (focus, duration, constraints, equipment assumptions).
- **Rolling projection**
  - When a program is activated (or version changes), generate/refresh calendar events for the next N weeks.
  - Nightly/weekly job extends the horizon to stay continuous.
  - If the user reschedules, mark that event as `user_modified` so future jobs don’t overwrite it.
- **Data model (suggested)**
  - `trainer_calendar_events`
    - `id`, `user_id`, `event_type` (`workout|rest|checkin|assessment|note`)
    - `start_at`, `end_at`, `title`, `status` (`scheduled|completed|skipped|canceled`)
    - `source` (`program_projection|user_created|system`) + `user_modified` (bool)
    - `linked_program_id`, `linked_program_version`, `linked_planned_session_id` (nullable)
    - `notes` (optional)
  - `trainer_planned_sessions`
    - `id`, `user_id`, `calendar_event_id`, `intent_json` (focus, duration, constraints, time variants)
    - `created_at`, `updated_at`
- **API surface (suggested)**
  - `GET /trainer/calendar?start=...&end=...` (events)
  - `POST /trainer/calendar/events` (create custom event)
  - `POST /trainer/calendar/events/:id/reschedule` (move/resize; sets `user_modified=true`)
  - `POST /trainer/calendar/events/:id/skip` (skip with reason)
  - `POST /trainer/calendar/events/:id/complete` (mark complete; typically driven by workout completion)
  - `POST /trainer/calendar/sync` (regenerate rolling horizon from active program; admin/system)
- **Agent capabilities**
  - The agent can assign events by creating/updating calendar events (e.g., schedule a workout earlier due to travel, add a check-in reminder, insert a deload week preview).
  - User edits remain the final authority; the system should propose “major” schedule changes rather than silently moving multiple workouts.
- **How Phase E uses it**
  - On Today screen, “Today’s Session” is derived from today’s `CalendarEvent` → `PlannedSession`.
  - If no workout event exists today, user can still `Start` (off-plan) or create a `Quick workout` that replaces today’s planned event (if present).
- **How Phase F uses it**
  - Weekly adjustments can update upcoming `PlannedSessions` (intent) and/or shift the weekly template, then re-project future calendar events (respecting `user_modified`).

---

## 4) UI/UX Workstreams (Concrete screens/flows)

### 4.1 Entry points
- “Start Trainer Setup” CTA (first-run + Settings/Profile)
- “Continue setup” persistent banner until program is active
- Chat can always answer questions, but **setup progress lives in dedicated flows**

### 4.2 Intake flow UI
- Focus prompt canvas with word-by-word prompt animation + live transcript + topic progress
- Review/edit screen: user edits the synthesized `IntakeSummary` (inline fields) before confirming

### 4.3 Assessment flow UI
- Stepper: each step is a test card (instructions + reference image + timers)
- Voice input + quick buttons for common answers
- Capture: results + confidence + pain notes

### 4.4 Program review UI
- Program summary artifact (weekly schedule, goals, progression rules)
- Accept / request changes (guided)

### 4.5 Workout coach UI (daily)
- Very small check-in
- “Today’s workout” card stack (existing paradigm)
- Always-available “swap exercise” + “I have pain” + “short on time” actions

### 4.6 Calendar UI
- Month/week view with colored session types (Upper/Lower/Full/Cardio/Rest).
- Tap a day to see the planned session intent + quick actions: `Move`, `Skip`, `Mark rest day`, `Start`.
- Drag-and-drop rescheduling (optional v2); v1 can use a simple “Reschedule to…” picker.

### 4.7 Measurements UI
- Simple “Measurements” screen in Profile/Settings:
  - Quick add: `Weight`, `Waist`, `Height` (with unit toggle).
  - Timeline chart + latest value + last updated date.
  - Edit history via “Correct” (creates a new entry; doesn’t erase old data).

### 4.8 Monitoring UI
- Home/Stats surface for “Weekly update”:
  - Weekly report card with “Changes we made” + “Next week focus”.
  - Notification badge when a new report is ready.
- Program changes review (only for major changes):
  - Diff-style summary + `Approve` / `Undo` + voice Q&A.

### 4.9 Check-ins UI
- Weekly/monthly check-in card (1–2 minutes) when the system needs extra input or wants to confirm assumptions.
- “Changes recommended” review + accept (used when adjustments are major or the user is in `Review-major` autopilot mode).

---

## 5) Open Questions (to answer next, then iterate this plan)

### Product scope questions
1) Is this phase primarily for the **ad demo** (a polished happy-path) or for **full product readiness** (edge cases + long-term adaptation)?
2) What is the target user segment first (beginner, intermediate, returning after injury, busy professionals, etc.)?
3) What does “success” mean for the first 2 weeks of a new user (behavior + outcomes)?

### Intake questions (what must be collected vs nice-to-have)
4) Which fields are *required* to proceed to assessment and program design?
5) How do you want to handle medical conditions and liability copy (where/when shown)?

### Assessment questions (verbal-only feasibility)
6) Which assessment tests do you want in v1 (pick 5–8 max), and must they be equipment-agnostic?
7) Should assessment be “one session” (10–15 min) or “spread across days”?

### Program design questions
8) Do you want a repeating weekly template (simple) or a 4-week mesocycle (more structure)?
9) Calendar is first-class: how far ahead should we project events (e.g., 4 weeks vs 8 weeks), and do we auto-place workouts on specific weekdays or let users choose preferred days?
10) What level of user control is ideal (choose days, swap modalities, set max intensity, etc.)?

### Execution/coaching questions
11) What are the top 3 “in-the-moment” adjustments you want to support on day-of (pain, time constraint, equipment change, energy low, etc.)?
12) Do you want live conversational coaching during sets, or mostly pre-written guidance + on-demand Q&A?

### Monitoring/adjustment questions
13) How often should we prompt for check-ins (weekly, after each workout, both)?
14) What data should drive adjustments most: adherence, RPE, pain, progression, or subjective satisfaction?

---

## 6) Change Log
- 2026-01-23: Initial draft created from current-state overview + desired trainer process phases.
