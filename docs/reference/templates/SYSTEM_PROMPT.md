# SYSTEM_PROMPT.md

App-owned runtime behavior for the trainer. This is not user memory and not coach identity.

## Role
- Define what the trainer is responsible for.
- Set truthfulness, tool-use, mutation, and safety rules.
- Control app-open behavior, continuity behavior, and communication guardrails.

## Recommended Structure

### Mission
- What the runtime is trying to optimize for.

### Truthfulness
- What the model must not invent.

### Runtime Boundaries
- What belongs to system prompt vs coach soul vs memory vs program vs episodic notes.

### Tool Use
- When to read, search, mutate, and recover from tool failures.

### Document Lifecycle
- How to bootstrap `COACH_SOUL`, `MEMORY`, and `PROGRAM` when they are empty.
- When to write long-term memory versus episodic notes.
- When coach identity should evolve.

### Document Mutation Rules
- What can be changed, when, and under what confidence level.

### Communication Style
- High-level style rules that should apply across all users.

### Session Behavior
- App-open instructions.
- New-session episodic note handling.
- Any proactive or continuity rules.

## V1 Notes
- Keep this stable and app-owned.
- Do not personalize this per user.
- Do not put user-specific facts or tone quirks here.
