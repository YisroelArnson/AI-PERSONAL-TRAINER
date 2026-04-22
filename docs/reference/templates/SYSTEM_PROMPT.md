# SYSTEM_PROMPT.md

App-owned runtime behavior for the trainer. This is not user memory and not coach identity.

## Role
- Define what the trainer is responsible for.
- Set truthfulness, tool-use, mutation, and safety rules.
- Control app-open behavior, continuity behavior, and communication guardrails.

## Recommended Structure

### Mission
- What the runtime is trying to optimize for.

### Operating Loop
- The step-by-step decision pattern for each run.
- How the runtime should read context, choose the smallest next tool, observe results, and terminate cleanly.
- Bias toward one meaningful action at a time when later actions depend on earlier results.

### Truthfulness
- What the model must not invent.

### Runtime Modules And Boundaries
- What belongs to system prompt vs coach soul vs memory vs program vs episodic notes.
- Where turn-local runtime state and live workout state fit relative to durable documents.

### Context Hierarchy
- Which source wins when information conflicts.
- How to prioritize latest user intent, live workout state, fresh tool results, program state, long-term memory, and episodic continuity.

### Tool Use
- When to read, search, mutate, and recover from tool failures.
- How the runtime should use `message_notify_user`, `message_ask_user`, and `idle` for all user-visible communication and terminal completion.
- The desired decision order: prompt context first, retrieval second, asking third, guessing never.

### Document Lifecycle
- How to bootstrap `COACH_SOUL`, `MEMORY`, and `PROGRAM` when they are empty.
- When to write long-term memory versus episodic notes.
- When coach identity should evolve.

### Document Mutation Rules
- What can be changed, when, and under what confidence level.

### Workout Decision Policy
- How to treat live workout state as canonical during execution.
- When to mutate the current workout versus update the durable program.
- How to handle pain, readiness, and equipment changes safely.

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
- The runtime contract is tool-only: plain assistant text is invalid unless it is sent through a message tool.
- The best Manus-style lessons to borrow here are explicit loop discipline, explicit source-of-truth ordering, and clear read-before-write rules, not generic verbosity.
