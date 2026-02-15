# Workout Generation & Calendar

**Date**: 2025-02-15
**Status**: Draft

## Problem

The user has an approved training program with a weekly template, progression rules, and guardrails — but no concrete workouts yet. We need to define how individual workouts get generated, presented to the user, tracked on the calendar, and completed — and how the program evolves over time.

## Solution

A just-in-time workout generation system where the calendar holds the upcoming week's planned session intents, regenerated fresh each week. When the user is ready to train, they confirm a few inputs (location, energy, time), the AI generates a full workout, and the calendar entry gets updated with all the details. After completion, that entry becomes a permanent historical record. The program itself is rewritten weekly by the AI to stay current with the user's progress.

## User Experience

### Home Screen Workout Button

A persistent button at the bottom of the home screen that serves as the primary entry point for starting a workout.

- **Planned session exists today (uncompleted)**: Button displays the session title (e.g. "Upper Body Push — 60 min"). Tapping opens the pre-workout flow for that session.
- **Multiple planned sessions today**: Button shows the next uncompleted session.
- **No planned session today, or all planned sessions completed**: Button displays "Start Workout". Tapping opens the custom workout flow.

The button always has a purpose — there's no empty or disabled state.

### Calendar

- **Rolling 1-week window** of planned sessions, regenerated fresh each week during the weekly review.
- **Planned sessions show**: Session type + muscle focus + estimated duration + brief intent (e.g. "Upper Body Push — 60 min — Focus on progressive overload for chest and shoulders").
- **Missed sessions are skipped** — no rescheduling, no guilt. The program moves forward.

#### Calendar Entry Lifecycle

1. **Future/Planned** — Intent only. Session type, focus, duration, brief description. No exercises.
2. **Generated** — User triggered workout generation. Entry updated with full exercise details. User can tap to view everything.
3. **Completed** — Workout finished. Entry saves the full workout as performed, becoming a historical record.
4. **Custom/Unplanned** — User requested a workout outside the schedule. Gets generated, added to today's calendar, follows the same lifecycle.

The calendar is the **single source of truth** for both planning and workout history.

### Pre-Workout Flow

When the user starts a planned session (or creates a custom one), they see a pre-workout screen with three inputs:

1. **Location** — Pre-filled with current/saved location (which has associated equipment data). User can change if they're somewhere else.
2. **Energy level** — Visual 0-5 rating buttons.
3. **Time available** — Pre-filled from the program's estimated session duration. User can adjust.

User confirms, AI generates the workout.

### Workout Presentation

Two modes the user can toggle between:

#### List Mode
- Compact line items (not cards) — minimal scrolling.
- Each line shows: exercise name, sets x reps (or equivalent), and load/weight.
- Functions as an overview/checklist of the full workout.

#### Workout Mode
- Full-screen, one exercise at a time.
- **Swipeable** left and right between exercises.
- **Progress bar + counter** at top (e.g. "2 of 6").
- **Written paragraph format**: Exercise name (bold) with key values (sets, reps, weight) highlighted with background chips, plus form cues woven into the text naturally.
  - Example: "**Dumbbell Bench Press** — Set **3** of **3**. Aim for **10-12 reps** at **25 lb**. Keep your shoulder blades pinched together throughout."
- **Bottom bar**:
  - **Edit button** (pencil icon) — Opens mid-workout action menu.
  - **Done button** — Completes the current set. Description updates to next set. Once all sets are done, advances to next exercise.
  - **AI orb** — Coach interaction (to be specced separately).

### Mid-Workout Actions (via Edit Button)

- **Swap exercise** — Replace with an alternative.
- **Adjust difficulty** — Change weight/reps/intensity.
- **Time scale** — Compress or extend remaining workout for time.
- **Pain flag** — Flag discomfort on an exercise.
- **Skip exercise** — Move past without replacement.

### Workout Completion

1. **Summary screen** — Recap of exercises completed, total time, highlights/wins, and what to focus on next session.
2. **Optional notes prompt** — User can log how they felt or note anything for next time. they can type or speak
3. Notes are saved and **silently inform future workout generation** — the AI reads past session feedback when generating the next workout, but doesn't explicitly surface it back to the user.

### Unplanned / Custom Workouts

Users can initiate a custom workout two ways:

1. **AI orb** — Speak or type what they want.
2. **Plus button on home screen** — Tap "Generate Custom Workout", describe what they want.

The user's description becomes the session intent. They then go through the same pre-workout screen (location, energy, time) before the AI generates. The workout is added to today's calendar and follows the same lifecycle (generated → completed).

## Technical Design

### Data Model

#### Exercise (generated by AI)
- `name` — Exercise name
- `exercise_type` — "reps" | "hold" | "duration" | "intervals"
- `sets` — Number of sets
- `reps` / `hold_duration_sec` / `duration_min` / `rounds` — Type-specific values
- `load` — Weight/resistance (when applicable)
- `description` — Written paragraph with form cues (the text shown in workout mode)
- `timer_seconds` — Only included for exercises that need timers (holds, timed sets, intervals). Null/absent for standard rep-based exercises.
- `muscles_utilized` — Target muscles
- `equipment` — Required equipment

#### Calendar Entry
- `date` — Scheduled date
- `status` — "planned" | "generated" | "completed" | "skipped" | "custom"
- `session_type` — From program weekly template
- `muscle_focus` — Target muscle groups
- `estimated_duration_min` — From program (or user-adjusted)
- `intent` — Brief description of session purpose
- `workout_instance` — Full workout data (null when planned, populated when generated)
- `completion_data` — Summary, notes, actual duration (null until completed)

### Program Document

A single markdown document that is the AI coach's complete plan for the user. Contains everything the AI needs to generate workouts and manage progression.

#### Contents
- **Goals** — User's training goals and priorities
- **Weekly template** — Session schedule (e.g. "Monday: Upper Push, Wednesday: Lower, Friday: Upper Pull")
- **Current phase** — Active training phase (hypertrophy, strength, deload, etc.) with its parameters (rep ranges, intensity, volume targets)
- **Available phases** — What phases the program can cycle through
- **Progression rules** — How and when to advance
- **Exercise rules** — Preferences, restrictions, movement patterns
- **Guardrails** — Safety boundaries (injury accommodations, max volume, etc.)
- **Coach's Notes** — The AI's observations, to-do list, guidance notes, and anything it wants to remember for future sessions
- **Milestones** — Phase-specific goals with completion status (e.g. "Complete 12 sessions ✓", "Increase dumbbell press to 35 lb — in progress")
- **Scheduling recommendations** — Any adjustments to the weekly template

#### Weekly Rewrite
- **Once per week**, the AI rewrites the entire program document.
- **Inputs**: All session summaries from the past week + current program + current weights profile.
- **The AI can adjust anything**: phase, weekly template, scheduling, milestones, Coach's Notes, exercise guidance, progression targets.
- **Prompt guidance**: The AI is instructed to preserve the user's core goals and safety guardrails unless the user explicitly requested changes. Everything else is fair game.
- **Version history**: Every version of the program is saved. Enables rollback if the AI makes an unwanted change, and provides a record of how the program has evolved.
- **Timing**: Happens during weekly calendar regeneration. The program rewrite and next week's calendar entries are generated together.

### Weights Profile (separate from program)

A structured profile tracking the user's current capability by equipment + movement pattern.

#### Structure
Each entry is an equipment + movement combination with a current load:
- e.g. "Barbell squat: 135 lb", "Dumbbell press: 30 lb", "Cable row: 50 lb", "Bodyweight push-up: bodyweight"

#### Versioning
- Every update creates a new version (snapshot) of the full profile.
- Historical versions are preserved, enabling trend analysis over time (e.g. "your barbell squat has gone from 95 lb → 135 lb over 8 weeks").
- Versioned data can power future progress visualizations.

#### Updates
- **Timing**: Updated asynchronously after each session completion. User sees their summary screen immediately; profile update happens in the background.
- **Mechanism**: The AI reviews what was generated and completed in the session, then updates relevant entries. Fully automatic, no user input.
- **Signals**: If the user completed all sets easily at a given load, the profile trends up. Pain flags or skips may hold or decrease the entry.

### Program Phases & Progression

#### Phase Structure
The training program defines available phases (e.g. hypertrophy, strength, power, deload). Each phase has its own training style — rep ranges, intensity levels, volume targets, exercise selection patterns.

#### Phase Transitions
- **Performance-driven** — The AI evaluates whether to transition based on multiple signals:
  - Weights profile trends (plateauing, steady growth, or declining)
  - Session completion rate (consistency)
  - Energy rating trends (trending high, low, or stable)
  - Pain flag and skip frequency
  - Milestone completion status
- **AI-determined** — The AI autonomously picks the next phase based on the user's current state. It may insert a deload even if the program sequence says strength is next, or extend a phase if the user hasn't progressed enough.
- **Evaluated weekly** — Phase transition evaluation happens as part of the weekly program rewrite. The AI reviews the full picture and decides whether to stay or transition.

#### How Program, Profile, and Pre-Workout Inputs Interact
- **Program defines the strategy**: Current phase, what kind of training, what rep ranges, what overall approach, Coach's Notes, milestones.
- **Weights profile provides the numbers**: What loads to prescribe for each equipment + movement pattern.
- **Pre-workout inputs provide the context**: Location, energy, time available.
- **AI combines all three** to generate each specific workout.

### Workout Generation Endpoint

Workout generation is a **dedicated API endpoint**, not a function of the AI coach agent. The normal flow is: user completes the pre-workout screen → client calls the workout generation endpoint directly.

The AI coach agent can also invoke this endpoint as one of its tools (e.g. when the user asks the coach to generate a workout via the AI orb), but the endpoint exists independently.

### AI Generation Inputs

When generating a workout, the workout generation endpoint receives:

1. **Program document** — Full program including current phase, weekly template, progression rules, guardrails, Coach's Notes, milestones
2. **Weights profile** — Current capability by equipment + movement pattern
3. **Session intent** — What this session is supposed to accomplish
4. **Location + equipment** — What's available
5. **Energy level** — 0-5 rating
6. **Time available** — How long they have
7. **Recent workout history** — Last several sessions (exercises done, loads used, completion notes, pain flags, skips)
8. **User profile** — Injuries, health nuances, experience level, preferences

### Session Data (two layers)

Every completed session produces two types of data:

#### Programmatic Stats (calculated, no LLM)
Deterministic, cheap, calculated from raw session data immediately after completion.

**Per-session:**
- Total exercises completed
- Total sets completed
- Total reps (for rep-based exercises)
- Total volume (weight x reps)
- Cardio time (for duration/interval exercises)
- Workout duration (actual)
- Exercises skipped
- Pain flags
- Energy rating (captured pre-workout)

**Weekly rollup (aggregated into a distinct object):**
- Sessions completed vs planned
- Totals: reps, volume, cardio time, workout time
- Averages: energy rating, session duration
- Trends vs prior week (up/down/flat for key metrics)

#### AI Summary (generated by Haiku)
A short narrative generated by a cheap, fast model after each session. Captures the qualitative side: how the session went, what the coach noticed, what stood out. More context-rich than raw numbers.

Both layers are fed into the AI for workout generation and weekly program rewrites — the stats give hard data, the summary gives the story.

### Weekly Review Process

Runs **Sunday night** via backend cron job. Fresh week ready for Monday morning.

1. **Gather inputs** — All session AI summaries + programmatic weekly rollup + current program + current weights profile + any user requests/preferences captured during the week.
2. **AI rewrites the program** — Full program document rewrite. Phase transitions, milestone updates, Coach's Notes, scheduling changes — all handled in one pass.
3. **Calendar regeneration** — Next week's planned sessions generated fresh from the updated program.
4. **Version saved** — Old program version archived.

**Pauses after 1 inactive week** (no sessions completed). Resumes via catch-up review when the user returns.

### Calendar Auto-Regeneration

- The system plans **1 week ahead** of sessions.
- **Each week, the entire upcoming week is regenerated fresh** as the final step of the Weekly Review Process — the AI rewrites the program first, then generates next week's calendar entries from the updated program.
- No stale future entries — every planned session always reflects the latest program state.
- Past entries (generated, completed) are preserved as historical records on the calendar.
- No user action required — happens automatically.

### Implementation Approach

#### First Week Bootstrap (during onboarding)

When the user completes onboarding and the program is generated:

1. **Program generation** — AI creates the program document + first week of calendar entries. User leaves onboarding with a plan ready to go.
2. **Weights profile generation** (separate call) — AI infers starting weights from intake data (experience level, body metrics, training history, goals). Produces the initial weights profile.

#### Ongoing Operations

- Weekly program rewrite + calendar regeneration runs on the backend as a Sunday night cron job.
- Workout generation is triggered client-side when user completes pre-workout flow.
- Generated workout data is written back to the calendar entry.
- Completion data is appended to the same calendar entry.
- Custom workouts create a new calendar entry for today.
- Weights profile updated async after each session completion.

## Edge Cases & Error Handling

- **No equipment at location**: AI generates bodyweight-only workout.
- **Very short time (e.g. 15 min)**: AI generates a focused, abbreviated session that still aligns with the program intent.
- **All sets skipped/pain flagged**: Session still counts as attempted. Completion summary notes the issues. AI factors this into future generation.
- **Network failure mid-generation**: Pre-workout inputs are saved locally. User can retry without re-entering.
- **Multiple workouts in one day**: Custom workout creates an additional calendar entry. Both are tracked independently.
- **User changes location mid-workout**: Not supported. Equipment is locked in at generation time. They can swap individual exercises via the edit menu.
- **Program rewrite regression**: Version history enables rollback. Prompt instructs AI to preserve core goals and guardrails.
- **No sessions completed in a week**: Weekly review pauses immediately. No new calendar entries generated. Saves compute until the user returns.
- **User returns after inactivity**: Catch-up review triggered when the user opens the app and no active week exists. Full weekly review runs (program rewrite + calendar generation), factoring in the gap. AI also adjusts the weights profile during this review based on how long the user was gone.
- **Extended inactivity**: Weekly review stays paused indefinitely. No automatic decay of weights profile — the AI handles adjustments during the catch-up review on return.

## What We're NOT Building

- **Pre-generated workouts** — No generating workouts ahead of time. Always just-in-time.
- **Workout sharing/export** — No social features or PDF export.
- **Rep/weight logging per set** — Done button tracks set completion, but we're not asking users to log actual reps/weight performed (v1).
- **AI orb coach interaction** — Will be specced separately.
- **Rest timers between sets** — No automatic rest countdown for standard exercises. Timers only appear for exercises where timing is inherent (holds, intervals, timed runs).
- **User-visible state tracker** — Progression tracking (milestones, phase status) is internal to the AI. The user experiences it through their workouts.

## Open Questions

None — all decisions resolved during interview.

## Decision Log

| Decision | Options Considered | Choice | Reasoning |
|----------|-------------------|--------|-----------|
| Generation timing | Just-in-time vs. ahead-of-time vs. hybrid | Just-in-time | Maximizes personalization — accounts for location, equipment, energy, and time at the moment of training |
| Calendar projection | 1 week / 2 weeks / 4 weeks / infinite | 1 week | Regenerated fresh each week during the weekly review. No stale entries. Past completed/generated sessions remain as history. |
| Missed sessions | Skip / reschedule / auto-adapt | Skip and move on | Reduces guilt and complexity. Program marches forward. |
| Calendar regeneration | Rolling auto / manual / mesocycle-driven | Full weekly regeneration | Entire upcoming week generated fresh from the updated program. No stale entries, no append logic. |
| Planned session display | Type only / type + duration / type + duration + intent | Type + focus + duration + intent | Gives user enough context to mentally prepare without showing exercises that don't exist yet |
| Workout presentation | Full upfront / exercise-by-exercise / full with focus | Full upfront, two modes | List mode for overview, workout mode for focus. User toggles between them. |
| List mode style | Cards / line items | Compact line items | Minimal, clean, less scrolling. Just the essentials. |
| Workout mode format | Structured fields / written paragraph | Written paragraph with highlighted values | Reads naturally like a coach talking to you. Key numbers visually pop with chip styling. |
| Set completion | Tap to complete / log each set / optional detail | Tap Done per set | Low friction. Description auto-updates to next set. |
| Timers | Always show rest timer / contextual only | Contextual only | Timers for holds, intervals, timed exercises. No rest countdown for standard rep-based work. |
| Mid-workout actions | Swap/adjust/time/pain / add skip / add coach | Swap, adjust, time scale, pain flag, skip | Skip added for flexibility. Coach interaction via AI orb (separate spec). |
| Workout completion | Minimal / summary / summary + notes | Summary + optional notes | Celebrates wins and captures feedback. Notes silently inform future AI generation. |
| Feedback usage | Inform AI silently / surface back to user / just store | Silently inform future generation | AI adapts without being explicit about it. Cleaner UX. |
| Unplanned workouts | Allow / not supported / allow but track separately | Allow, add to calendar | Users can start custom workouts via AI orb or plus button. Added to today's calendar, same lifecycle as planned workouts. |
| Custom workout pre-workout flow | Same flow / description replaces intent / skip pre-workout | Description replaces intent, rest is same | User provides the intent via their request. Still goes through location, energy, time confirmation. |
| Calendar as history | Separate history view / calendar is history | Calendar is single source of truth | No duplicate data. Tap any past date to see what was done. |
| Progression model | Exercise-level / session-level / program-level / layered | Weights profile + weekly program rewrite | Weights profile tracks capability by equipment + movement pattern. Program rewrite handles everything else (phases, milestones, scheduling). |
| Weights profile structure | By movement pattern / by muscle group / by equipment + pattern / AI-defined | Equipment + movement pattern | Load varies significantly between equipment types. "Barbell squat: 135 lb" vs "Dumbbell press: 30 lb" is meaningful. |
| Weights profile updates | After every session / AI proposes user confirms / only on signals | Auto after every session (async) | Zero friction. User sees summary immediately, profile updates in background. |
| Profile versioning | Latest only / versioned over time | Versioned with snapshots | Enables trend analysis and future progress visualizations. |
| Phase transitions | Calendar-driven / performance-driven / calendar with AI override | Performance-driven | AI evaluates multiple signals (profile trends, completion rate, energy trends, pain/skip frequency, milestones) rather than rigid timelines. |
| Phase transition timing | After every session / weekly / at threshold | Weekly during program rewrite | Natural cadence. Pairs with the moment the AI is already reviewing the full picture. |
| Next phase selection | Program-defined sequence / AI-determined / AI proposes user approves | AI-determined | Full autonomy. AI picks what's right based on current state, can insert deload or extend phases as needed. |
| Milestones | AI-generated / program template / hybrid | AI-generated at phase start | Milestones are tailored to the user's current state, not generic templates. Dynamic and personalized. |
| State tracker visibility | AI-only / user-visible / user-visible but passive | AI-only (internal) | User experiences progression through their workouts. The tracking machinery stays behind the curtain. |
| Program mutability | Immutable + separate state / immutable core + mutable plan / full weekly rewrite | Full weekly rewrite | Simplest architecture. One document, one write per week. No separate state tracker, no merge logic. Version history is the safety net. Coach's Notes, milestones, and plan are all one thing. |
| Program + state tracker architecture | Separate objects / merged view / single document | Single document (program) | Coach's Notes, milestones, phase tracking all live inside the program. Rewritten together weekly. Weights profile remains separate (different update cadence). |
| Session data | AI summary only / programmatic stats only / both | Both layers | Programmatic stats are cheap and deterministic (reps, volume, cardio time, etc.). AI summary (Haiku) captures the qualitative story. Both fed into the AI for context. |
| Weekly review trigger | Fixed day / relative to first session / relative to schedule / on app open | Fixed: Sunday night cron job | Simple, predictable. Fresh week ready Monday morning for all users. |
| Weekly review during inactivity | Always run / pause after X weeks / only on app open | Pause after 1 inactive week | No sessions = no review. Saves compute. Catch-up review on return. |
| Return from inactivity | Catch-up review / lightweight restart / re-onboarding | Catch-up review on return | Detect no active week when user opens app. Run full weekly review immediately, factoring in the gap. |
| Weights profile decay | No decay / automatic decay / AI decides on return | AI decides during catch-up review | AI has full context on gap length and can make a judgment call on how much to dial back. No programmatic decay. |
| Initial weights profile | From assessment / AI from intake / first session bootstraps / during program gen | AI infers from intake data (separate call) | AI uses experience level, body metrics, training history to estimate starting weights. Separate call from program generation. |
| First week calendar | During program gen / separate trigger after onboarding | During program generation | User leaves onboarding with a plan ready. First week of calendar entries generated alongside the program. |
| Weekly stats rollup | Per-session only / per-session + weekly rollup | Per-session + distinct weekly rollup object | Gives the AI a quick read on the week without processing every individual session. Includes totals, averages, and trends vs prior week. |
