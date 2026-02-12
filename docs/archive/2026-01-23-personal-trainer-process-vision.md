# AI Personal Trainer - Process Vision

*Last updated: 2026-01-23*

## Intent
Build a trainer-like end-to-end experience that mirrors how a human personal trainer onboards, assesses, plans, coaches, and adapts programs, while fitting the current AI chat + workout engine.

This document captures the target flow, artifacts, and system pieces. It is a living spec; open items are called out for follow-up.

---

## North Star Outcome
A user can move through a guided training journey:
1. **Initial consultation** (capture the person)
2. **Assessment** (capture their current state)
3. **Goal setting** (convert intent to measurable targets)
4. **Program design** (generate a plan)
5. **Coaching and execution** (daily/weekly workouts + guidance)
6. **Ongoing monitoring and adjustment** (progress loops)
7. **Education and accountability** (personalized support)

Each phase produces a structured artifact that feeds the next phase, and is visible to the user for approval or adjustment.

---

## Phase 1 - Initial Consultation
**Goal**: gather enough information to understand the person, not just the fitness goal, while building trust.

**Interaction**
- Conversational AI interview with a finite, explicit checklist of required fields, with a warm rapport-first opening.
- AI guides the user until required fields are complete.
- UI: conversational flow (chat-first), light inline prompts, minimal form fields.

**Outputs (structured doc)**
- `ClientProfile`
  - rapport notes (communication style, anxieties, support needs)
  - motivation / deeper "why"
  - health + medical history (injuries, surgeries, chronic conditions, meds, restrictions)
  - lifestyle (job, routine, stress, sleep, eating habits, current activity)
  - previous exercise experience (what worked, what did not, preferences)
  - expectations + logistics (frequency, schedule, budget, time of day, equipment access)
  - partnership expectations (trainer expectations, client expectations)
  - goals (raw, unstructured)
  - medical clearance flags

**Notes**
- LLM 1: interviewer (conversational)
- LLM 2: summarizer/structurer (creates canonical JSON)

---

## Phase 2 - Assessment
**Goal**: establish a baseline without vision input using guided verbal self-report and simple tests.

**Interaction**
- Guided step-by-step flows with task cards ("do this movement", "report this feeling").
- AI asks follow-ups based on responses.
- UI: structured flow with next/previous, exercise images, timers, and short instruction chips.

**Assessment Inputs**
- simple movement screens (e.g., squat, hinge, push, pull)
- cardio tolerance / stamina
- pain/discomfort flags
- RPE or subjective effort scores
- basic anthropometrics if provided (weight, height)

**Outputs (structured doc)**
- `AssessmentProfile`
  - movement screen summary
  - cardio baseline
  - strength baseline (self-reported)
  - limitations/contraindications
  - confidence and learning style

**Notes**
- Different instruction set + UI from consultation.
- Use constrained options to reduce ambiguity.

---

## Phase 3 - Goal Setting
**Goal**: convert intent into specific, measurable objectives.

**Interaction**
- Conversational refinement based on `ClientProfile` + `AssessmentProfile`.
- AI proposes measurable goals + timelines, user approves/edits.
- UI: chat + goal cards with edit/confirm.

**Outputs (structured doc)**
- `GoalPlan`
  - primary goals with metrics and target dates (or soft goals when preferred)
  - secondary goals (soft goals allowed)
  - constraints (availability, equipment, injuries)
  - success criteria

---

## Phase 4 - Program Design
**Goal**: generate a safe, effective program using all prior artifacts.

**Interaction**
- LLM proposes a program.
- Optional safety/quality review agent validates plan.
- User can approve or request edits.

**Outputs (structured doc)**
- `TrainingProgram`
  - macrocycle duration (flexible, based on user preference)
  - weekly schedule (high-level structure)
  - progression approach (overload, deloads)
  - exercise library + substitutions
  - safety constraints

**Notes**
- Use high-quality model for plan generation.
- Optional "review agent" to enforce safety/risk checks.

---

## Phase 5 - Coaching and Execution
**Goal**: deliver workouts that feel live, flexible, and intuitive.

**Interaction**
- Calendar or "upcoming" view shows planned session themes (visible to users).
- On workout day, live generation adapts to current context (location, equipment, fatigue).
- AI coach provides guidance, technique cues, and substitutions.
- UI: workout session flow, exercise cards, quick swaps, voice prompts.

**Execution Model (current thinking)**
- **Plan-as-intent**: schedule contains short session intents (e.g., "Lower body strength + core").
- **Day-of generation**: resolve intent into exercises using real-time context.
- **In-session guidance**: coach agent handles instructions, changes, and check-ins.

**Outputs (structured doc)**
- `WorkoutSession`
  - resolved exercises + sets/reps
  - adjustments made
  - completion metrics

---

## Phase 6 - Ongoing Monitoring and Adjustment
**Goal**: systematically adapt plans based on progress and feedback.

**Interaction**
- Weekly check-ins and adjustments.
- Re-assessments trigger changes to `TrainingProgram`.
- User sees clear "why" behind changes.

**Outputs (structured doc)**
- `ProgressReview`
  - adherence
  - performance trends
  - goal trajectory
  - recommended program adjustments

---

## Phase 7 - Education and Accountability
**Goal**: deliver tailored education and keep the user engaged.

**Interaction**
- Scheduled or contextual tips (sleep, recovery, nutrition basics).
- Lightweight accountability nudges.

**Outputs (structured doc)**
- `EducationFeed`
  - personalized snippets
  - recommended content

---

## System Architecture (High-Level)
**New artifacts**
- `ClientProfile`
- `AssessmentProfile`
- `GoalPlan`
- `TrainingProgram`
- `WorkoutSession`
- `ProgressReview`
- `EducationFeed`

**Agent roles**
- Interviewer agent (consultation)
- Assessment coach agent (guided tests)
- Goal-setting agent
- Program design agent
- Safety/quality review agent (optional)
- Workout coach agent (live session)
- Progress analyst agent
- Education agent

**Data flow**
`ClientProfile` -> `AssessmentProfile` -> `GoalPlan` -> `TrainingProgram` -> `WorkoutSession` -> `ProgressReview` -> updates to `TrainingProgram` and `GoalPlan`

---

## Product/UX Considerations
- Each phase should feel distinct in UI and pacing.
- Keep user cognitive load low by chunking steps and giving clear progress indicators.
- Always allow user edits/overrides with minimal friction.

---

## Open Questions (to resolve)
1. Which data fields are mandatory vs optional per phase?
2. How long should each phase last (1 session vs multiple sessions)?
3. What re-assessment triggers beyond the weekly cadence should exist?
4. What safety boundaries and constraints should be enforced by the review agent?
5. What program time horizon options should the user choose from?
6. How to represent "plan-as-intent" in the UI calendar?
7. What is the minimum viable assessment flow that still provides useful baselines?
