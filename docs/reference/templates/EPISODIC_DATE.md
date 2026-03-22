# EPISODIC_DATE.md

Append-only daily continuity notes keyed as `EPISODIC_DATE:YYYY-MM-DD`.

This file is for meaningful day-level context and session carry-over, not for curated long-term memory.

## Allowed Block Types

### Session Excerpt
Used for automatic or manual carry-over from a prior session.

Example:

```md
<!-- session-memory-flush:<session_id> -->
## Session Excerpt

- **Session Key**: user:<id>:main
- **Session ID**: <session_id>
- **Ended At**: 2026-03-20T14:30:00.000Z
- **Rotation Reason**: day_boundary

### Messages

user: I slept badly and my knee feels off.
assistant: Let's reduce load and keep the session simple.
```

### Workout Outcome
Summarize what was actually done, what changed, and what mattered.

### Notable Event
Use for relevant life context, schedule changes, travel, equipment changes, and other non-workout signals.

### Decision Made
Use for plan changes, constraints, and important agreements.

### Follow-Up Needed
Use when the coach should circle back later.

## V1 Notes
- Append new blocks. Do not rewrite the whole file unless you are deliberately compacting it.
- Keep each block understandable on its own.
- Put durable distilled insights into `MEMORY`, not here.
