# Coach Surface Workout Contract

This contract is rewritten around a fat-agent, thin-backend model for workouts.

The goal is:

- the agent chooses the workout,
- the agent chooses how the workout changes,
- the backend stores those choices in structured form,
- and the UI renders the resulting state.

## Core rule

The backend must not secretly decide training changes.

The agent is the training brain. The backend is the persistence and validation layer.

That means:

- the agent generates the specific workout,
- the agent chooses the exact sets, reps, load, duration, substitutions, and adjustments,
- the backend validates and stores those choices,
- and the backend deterministically renders feed cards from stored state.

The agent still should not author raw UI payloads as its main output. It should author workout decisions through typed tool inputs.

## Canonical state vs derived state

Canonical write model:

- `workout_sessions` holds session-level status, phase, and top-level guidance.
- `workout_exercises` holds exercise-level identity, order, status, and prescription context.
- `workout_sets` holds per-set targets and actual performance.
- `workout_adjustments` holds all live changes and safety/difficulty signals.
- `session_events` remains the append-only audit log of what happened and why.

Derived read model:

- `workout` inside `/v1/coach-surface` is the canonical frontend workout read model assembled from the workout tables.
- `feed` items are presentation records for the chat surface.
- `pinnedCard` is only a reference to an existing feed item, not a second copy of the card.

## What the agent controls

- exercise selection,
- exercise order,
- set targets,
- rest targets,
- load progression or regression,
- swaps and substitutions,
- shortening or expanding the session,
- finishing or abandoning the workout.

If the user says `too hard`, `swap this`, or `I only have 20 minutes`, the agent should decide the exact new plan.

## What the backend controls

- validating that referenced workout/session/exercise IDs exist,
- validating that the mutation is legal for the current state,
- storing before/after changes,
- rebuilding the current workout read model,
- rendering feed cards from state.

The backend should not independently decide:

- how much load to reduce,
- which exercise to substitute,
- how many sets to remove,
- or whether to progress/regress the user.

Those are agent decisions.

## Why this is still structured

- workout decisions are stored in workout tables, not buried in chat text,
- rich authored instructions can live in `guidance_json` and `prescription_json`,
- concrete numeric targets can still be projected into `workout_sets`,
- and terminal exercise history can still be indexed later for retrieval.

## Recommended tool model

The tools should be authoring tools, not coaching-decision tools.

Recommended v1 mutation tools:

1. `workout_generate`
2. `workout_rewrite_remaining`
3. `workout_replace_exercise`
4. `workout_adjust_set_targets`
5. `workout_record_set_result`
6. `workout_finish_session`

Recommended v1 read path:

1. Inject the current live workout state directly into prompt assembly on every run.
2. If no live workout exists, inject a semantic no-active-workout context instead.

## How the mutation tools should work

`workout_generate`

- The agent submits the full planned workout.
- The backend creates the workout session, exercises, and sets from that payload.

`workout_rewrite_remaining`

- The agent submits a replacement plan for the unfinished portion of the workout.
- This is the right tool for `too hard`, `too easy`, `short on time`, or similar mid-session changes.

`workout_replace_exercise`

- The agent replaces one exercise with another fully authored exercise plan.
- The backend records the replacement and preserves auditability.

`workout_adjust_set_targets`

- The agent chooses the new set targets explicitly.
- The backend stores the new targets and records the adjustment reason.

`workout_record_set_result`

- The agent records what the user actually did and may also direct workout flow forward.
- The backend stores the result and updates pointers/phase based on the agent-provided directive.

`workout_finish_session`

- The agent decides the final session status and summary.
- The backend closes the session cleanly.

## Recommended v1 feed item types

- `message`
- `card.workout.current`
- `card.workout.summary`
- `card.insight`

## Recommended v1 implementation order

1. Implement the authoring-tool handlers above so the agent can create and mutate workouts directly.
2. Build a workout read service that returns `WorkoutSessionState` for prompt assembly and card rendering.
3. Build deterministic card renderers that turn stored workout state into feed items.
4. Move coach-surface feed reads from `session_events` toward `feed_items`.
5. Mirror the backend contract in Swift models once the backend is returning real workout payloads.
