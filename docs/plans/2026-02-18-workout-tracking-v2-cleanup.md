# Workout Tracking V2 — V1 Decommission Checklist

Use this checklist only after V2 has been validated in production-like environments.

## Current Status (2026-02-18)

- Legacy `/trainer/workouts` router removed from backend runtime.
- V1 trainer workout controller/service files removed from backend codebase.
- iOS workout flow now creates/completes/stops sessions via V2 endpoints only.
- V2 session creation no longer depends on V1 generation service.
- Weekly stats/review services now read from V2 source-of-truth tables.

## Exit Criteria Before Deleting V1

- 7 days of successful V2 command traffic with no blocking regressions.
- Conflict retry rate is below agreed threshold.
- V2 history/detail endpoints match expected UI payloads for active users.
- Session completion/stop summaries are generated correctly from V2 source-of-truth tables.
- No active iOS clients are still using V1-only endpoints for critical tracking writes.

## Step 1: Freeze V1 Writes

- Disable write paths to `trainer_workout_events` for set/interval logging.
- Disable V1 `sessions/:id/actions` writes for tracking mutations now covered by V2 commands.
- Keep V1 reads temporarily available for audit/debug only.

## Step 2: Remove V1 Runtime Dependencies

- Remove V1 mirror calls from controllers once all clients use V2 create/get/complete/stop.
- Remove V1 fallback summary generation paths in `trainerWorkouts.controller.js`.
- Remove V1 tracking-specific logic in `trainerWorkouts.service.js` that is no longer used.

## Step 3: Route Cleanup

- Remove legacy tracking endpoints (keep only if still needed for non-tracking AI actions):
  - `/trainer/workouts/sessions/:id/actions` (tracking parts)
  - `/trainer/workouts/sessions/:id/events` (if no longer required)
- Keep intent-planning/generation endpoints only if still part of product UX.

## Step 4: iOS Cleanup

- Remove legacy action logging calls (`sendWorkoutAction`) for tracking mutations.
- Remove legacy retry/fallback code paths that point to V1 tracking endpoints.
- Keep typed command outbox as the only mutation path for exercise execution tracking.

## Step 5: Database Cleanup (final)

- Stop writes to legacy tables:
  - `trainer_workout_events`
  - `trainer_workout_logs` (if superseded)
  - `trainer_workout_instances` (if superseded by V2 payload rows)
  - `trainer_session_summaries` (if superseded)
- Archive old data if needed for compliance/audit.
- Remove unused indexes and policies after verifying no references.

## Step 6: Monitoring Guardrails

- Keep alerts on:
  - command failures
  - queue retry growth
  - version conflict spikes
  - summary generation failures
- Track these for at least one full release cycle after V1 deletion.
