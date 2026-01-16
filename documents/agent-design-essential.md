# Personal Trainer AI Agent Design (Essential)

This is the streamlined spec for the Personal Trainer agent. It preserves core behavior and system contracts while removing implementation-heavy code. Use this as the primary design reference for building or refactoring the agent.

---

## Goals

- Provide personalized workouts, guidance, and progress insights.
- Maintain a predictable, tool-driven agent loop.
- Keep context efficient via append-only knowledge and checkpointing.
- Generate workouts with structured, machine-readable output.

---

## Architecture at a Glance

1. User message arrives.
2. Initializer agent decides which data sources to append.
3. Knowledge events are appended to the event stream.
4. Main agent runs a tool-driven loop until `idle`.
5. All actions/results are appended to the event stream.

---

## Core Agent Loop (Pseudocode)

```
function runAgentLoop(sessionId, userId, userInput):
  MAX_ITERATIONS = 10
  session = getOrCreateSession(sessionId, userId)

  if checkpointNeeded(session):
    session = checkpoint(session)

  init = initializeContext(session.id, userId, userInput)
  appendEvent(session.id, type="user_message", content=userInput)

  for i in 1..MAX_ITERATIONS:
    context = buildContext(session.id, userId)
    response = callLLM(context)
    toolCall = parseToolCall(response)  // exactly one tool
    result = executeTool(toolCall, userId, session.id)
    appendEvent(session.id, type="action", tool=toolCall.name, args=toolCall.args)
    appendEvent(session.id, type="result", tool=toolCall.name, formatted=result.formatted)

    if toolCall.name == "idle":
      break

  return getSessionState(session.id)
```

---

## Model Roles

- **Initializer agent**: `gpt-4o-mini` (low temp), fast data selection.
- **Main agent**: `gpt-4o` (moderate temp), reasoning + tool selection.
- **Timer generation**: `gpt-4o-mini` (faster/cheaper).
- **Exercise generation**: `gpt-4o` (structured output quality).

---

## System Prompt Essentials

### Responsibilities

- Create workouts based on goals, preferences, and history.
- Answer exercise questions.
- Generate timers and intervals.
- Help set/adjust goals.
- Track progress and surface insights.

### Core Loop Rules

- One tool call per iteration.
- Always communicate via message tools.
- Call `idle` only after messaging final results.

### Recommendation Rules

Priority order:
1. Temporary preferences
2. Explicit user request
3. Permanent preferences
4. Distribution debt (under-represented goals/muscles)
5. Goal weights
6. Recent workout history

Additional rules:
- Recovery: large muscles 48h, small muscles 24h.
- Progressive overload: modest increases vs last successful session.
- Equipment constraints: only use available equipment.
- Units: always use user preferred units.

---

## Context Management

### Event Stream (Append-Only)

Event types: `user_message`, `knowledge`, `knowledge_update`, `action`, `result`.

### Checkpointing

When context nears token limit:
- Summarize the session.
- Start a new session with summary as the new prefix.
- Reset knowledge tracking (fresh append-only list).

### Stable Prefix

Includes:
- System prompt
- User profile and unit preferences

### Knowledge Injection

Knowledge is appended before user message for KV-cache efficiency.

---

## Initializer Agent (Knowledge Selector)

**Inputs:** user message + list of knowledge already in context (with params).

**Output (structured JSON):**
```
{
  "reasoning": "short justification",
  "append_knowledge": [
    { "source": "workout_history", "params": { "days_back": 30 }, "reason": "expand_range" }
  ],
  "use_existing": ["category_goals", "active_preferences"]
}
```

**Rules:**
- Append-only: never remove or replace.
- Avoid duplication; expand scope only when needed.
- Minimize data fetched per turn.

---

## Data Sources (Supabase)

| Source | Purpose | Params |
|---|---|---|
| `user_profile` | Basic user info + units | none |
| `category_goals` | Category goals + distribution metrics | none |
| `muscle_goals` | Muscle goals + distribution metrics | none |
| `active_preferences` | Temporary/permanent preferences | none |
| `workout_history` | Recent workout history | `days_back` |
| `current_location` | Equipment/location constraints | none |
| `current_workout_session` | Active workout session | none |
| `scheduled_workouts` | Upcoming workouts | `days_ahead` |
| `workout_plans` | Multi-week plans | `status` |
| `milestone_goals` | Specific achievements | `status` |
| `user_settings` | Unit settings | none |

---

## Toolset (Essential)

### Communication
- `message_notify_user(text, attachments?)`
- `message_ask_user(text, options?)`

### Data Retrieval
- `fetch_data(...)` supports multiple sources in one call.

### Goal Management
- `set_goals(goal_type, category_goals? | muscle_goals?)`

### Preferences
- `set_preference(type, description, guidance, expires_at?, delete_after_use?)`
- `delete_preference(preference_id)`

### Exercise Logging
- `log_completed_exercise(...)`
- `undo_logged_exercise(exercise_id)`
- `mark_exercise_complete(...)`

### Timers
- `generate_exercise_timer(...)`
- `generate_workout_timers(exercises[])`

### Calendar & Planning
- `schedule_workout(...)`
- `update_scheduled_workout(workout_id, ...)`
- `delete_scheduled_workout(workout_id)`
- `create_workout_plan(...)`

### Analytics
- `get_workout_statistics(...)`
- `get_exercise_breakdown(...)`
- `get_progress_trends(...)`
- `generate_stats_summary(...)`

### Workout Modifications
- `swap_exercise(exercise_order, reason, specific_request?)`
- `adjust_exercise(exercise_order, ...fields_to_change)`
- `remove_exercise(exercise_order)`

### State Control
- `idle()`

---

## Exercise Generation (Structured Output)

The main agent generates workouts directly in its response (no tool call required).

### Exercise Types

- `reps`: strength or bodyweight (sets, reps[], load, rest_sec)
- `hold`: static holds (sets, hold_sec[], rest_sec)
- `duration`: steady-state (duration_min, distance?, target_pace?)
- `intervals`: work/rest cycles (rounds, work_sec, rest_sec)

### Grouping

Use `group` to link exercises:
- `circuit`, `superset`, `giant_set`, `warmup`, `cooldown`
- All items share `group.id`
- `group.name`, `group.rounds`, `group.rest_between_rounds_sec` set only on first item

### Muscle & Goal Shares

- Each exercise includes `muscles[]` and `goals[]` with `share` values.
- Shares must sum to `1.0` per list.
- Use canonical muscle names (16 total).

### Minimal Output Shape (Example)

```
{
  "exercises": [
    {
      "name": "Barbell Bench Press",
      "type": "reps",
      "order": 1,
      "sets": 4,
      "reps": [10, 8, 8, 6],
      "load": 135,
      "load_unit": "lbs",
      "rest_sec": 120,
      "muscles": [{ "name": "Chest", "share": 0.65 }, ...],
      "goals": [{ "name": "Strength", "share": 0.7 }, ...],
      "reasoning": "Brief rationale",
      "equipment": ["barbell", "bench"]
    }
  ],
  "summary": {
    "estimated_duration_min": 35,
    "primary_goals": ["Strength"],
    "muscles_targeted": ["Chest", "Triceps"]
  }
}
```

---

## Event Stream Format (Minimal)

```
message: { type: "message", role, content, timestamp }
action:  { type: "action", tool, args, timestamp }
result:  { type: "result", tool, formatted, timestamp }
knowledge:{ type: "knowledge", source, params?, data, timestamp }
```

---

## API Endpoints (Core)

- `POST /agent/chat` (non-streaming)
- `POST /agent/stream` (streaming)
- `GET /agent/sessions`
- `GET /agent/sessions/:id`
- `DELETE /agent/sessions/:id`

---

## Testing Priorities (High Level)

- Agent loop: max iterations, tool parsing, idle termination.
- Initializer: correct data selection, no duplicates, proper expansions.
- Context builder: stable prefix, append-only events, checkpointing.
- Tool execution: all tools return valid observations.
- Workout output: schema validity, unit correctness, equipment constraints.
- Timers: valid phases and totals.
- Streaming: correct SSE sequence.

