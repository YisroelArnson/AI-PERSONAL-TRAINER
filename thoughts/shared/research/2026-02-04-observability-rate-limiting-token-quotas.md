---
date: 2026-02-04T12:00:00-05:00
researcher: Claude
git_commit: 335d88481164e3b376ccf029eb78c40704900afd
branch: pt-process-implementation
repository: AI-PERSONAL-TRAINER
topic: "How do observability, rate limiting, and token quotas per account currently work?"
tags: [research, codebase, observability, rate-limiting, token-quotas, metering, sentry, pricing]
status: complete
last_updated: 2026-02-04
last_updated_by: Claude
---

# Research: Observability, Rate Limiting, and Token Quotas Per Account

**Date**: 2026-02-04
**Researcher**: Claude
**Git Commit**: 335d884
**Branch**: pt-process-implementation
**Repository**: AI-PERSONAL-TRAINER

## Research Question
How do observability, rate limiting, and token quotas per account currently work in the architecture of the app?

## Summary

The app has **mature observability** (Sentry + custom session event tracking + a dashboard), but **rate limiting and per-user token quotas are not yet implemented**. A detailed design document exists (`thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md`) that describes the planned metering layer, but none of those files have been created in the codebase yet. The only existing safeguards are business-logic iteration caps (max 10 agent loop iterations, max 20 intake questions).

---

## Detailed Findings

### 1. Observability - What Exists Today

The backend has a comprehensive, multi-layered observability stack:

#### A. Sentry Integration
- **File**: `BACKEND/instrument.js`
- Sentry DSN is hardcoded; initialized before all other modules
- OpenAI integration records AI SDK inputs/outputs
- Node profiling integration enabled
- **100% trace and profile sampling** (development-appropriate, not production-tuned)
- PII capture enabled (`sendDefaultPii: true`)
- Express error handler installed in `BACKEND/index.js` via `Sentry.setupExpressErrorHandler(app)`

#### B. Session Observability Service
- **File**: `BACKEND/services/sessionObservability.service.js` (738 lines)
- Dual-purpose: provides both LLM context reconstruction AND operational metrics
- Tracks a chronological event timeline per session:
  - `user_message` - user input text
  - `llm_request` - model, prompt content, estimated tokens
  - `llm_response` - model, token usage (input/output/cache_read/cache_write), cost, duration
  - `tool_call` - tool name, arguments, call ID
  - `tool_result` - result data, success/failure, duration
  - `knowledge` - data source injections from initializer agent
  - `error` - error message, stack trace, context
  - `artifact` - structured outputs (workouts, reports)
- Session-level aggregates: `total_tokens`, `cached_tokens`, `total_cost_cents`
- Retry logic (5 attempts) for sequence number race conditions
- Color-coded console output with session ID, token counts, costs, durations

#### C. Database Schemas

**Session Observability** (`BACKEND/database/session_observability_schema.sql`):
- `agent_sessions` table: id, user_id, total_tokens, cached_tokens, total_cost_cents, status, metadata
- `agent_session_events` table: id, session_id, sequence_number, event_type, timestamp, duration_ms, data (JSONB)
- View `agent_session_summaries`: session with event counts (messages, LLM calls, tool calls, errors)
- View `agent_daily_metrics`: daily aggregations per user (tokens, cost, errors)
- RLS: users can only see their own data; service role has full access

**Legacy Observability** (`BACKEND/database/observability_schema.sql`):
- `agent_traces` / `agent_spans` tables (trace/span model)
- `agent_metrics_hourly` pre-aggregated table
- Views: `agent_trace_summaries`, `agent_tool_analytics`

#### D. Metrics Service
- **File**: `BACKEND/services/observability/metrics.service.js` (459 lines)
- Query functions: `getSummaryMetrics`, `getTokenUsageOverTime`, `getToolAnalytics`, `getLatencyDistribution`, `getRecentSessions`, `getSessionDetails`, `getSessionTimeline`
- Supports filtering by userId, date range, granularity (hour/day/week)
- Latency percentiles: avg, p50, p75, p90, p95, p99

#### E. Pricing Service
- **File**: `BACKEND/services/observability/pricing.js` (262 lines)
- Covers 30+ models: GPT-4o, Claude Haiku/Sonnet/Opus 4.5, Gemini, DeepSeek, Llama, Kimi K2
- Cache-aware: Anthropic cache read = 90% discount, cache write = 1.25x
- Functions: `calculateCost()` (USD), `calculateCostCents()` (cents)

#### F. Logger Service
- **File**: `BACKEND/services/observability/logger.service.js` (11.5KB)
- Two modes: human-readable console (default) or structured JSON (`STRUCTURED_LOGS=true`)
- Log levels: debug, info, warn, error (controlled by `LOG_LEVEL` env var)
- Context management: sessionId, userId correlation
- Agent-specific log methods for LLM requests/responses, tool calls, session lifecycle

#### G. Admin API + Dashboard
- **Routes**: `BACKEND/routes/observability.routes.js` - 8 endpoints under `/api/admin/`
  - `GET /health`, `/metrics/summary`, `/metrics/tokens`, `/metrics/tools`, `/metrics/latency`
  - `GET /sessions`, `/sessions/:id`, `/sessions/:id/timeline`
- **Dashboard**: `BACKEND/public/index.html` (43.9KB) - dark-themed SPA with Chart.js
  - Stats grid, token/cost charts, tool analytics, latency distribution
  - Session table with drill-down to event timeline
  - Time range filters (24h, 7d, 30d, custom)
- **Currently unprotected** - intended for local dev only

#### H. iOS-Side Observability
- **Minimal**: `MonitoringModels.swift` has data models for measurements and reports but no client-side telemetry
- No Sentry, Firebase Analytics, or custom analytics SDK on the iOS side

---

### 2. Rate Limiting - Current State

**Status: NOT IMPLEMENTED**

There is no HTTP-level, per-user, or per-endpoint rate limiting anywhere in the codebase today.

#### What does NOT exist:
- No `express-rate-limit` or equivalent package installed
- No per-IP or per-user request throttling middleware
- No RPM (requests per minute) enforcement
- No concurrent request limiting
- No 429 status code handling on the backend
- No Retry-After header generation
- No exponential backoff for upstream API calls (Anthropic, OpenAI)
- No request queuing or buffering

#### What DOES exist (business logic caps only):
- **Agent loop cap**: `MAX_ITERATIONS = 10` in `BACKEND/services/agentLoop.service.js:13` - prevents infinite agent loops
- **Intake question cap**: `MAX_QUESTIONS = 20` in `BACKEND/services/trainerIntake.service.js:15` - forces intake completion
- **Database retry**: 5 retries with 0-50ms random delay for sequence number collisions in `sessionObservability.service.js`

#### iOS client:
- Network fallback/retry across multiple base URLs (connection resilience, not rate limiting)
- No 429 error handling, no Retry-After parsing, no client-side throttling

---

### 3. Token Quotas Per Account - Current State

**Status: DESIGNED BUT NOT IMPLEMENTED**

#### What exists today:
- **Token tracking is fully operational**: every LLM call records input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
- **Cost calculation works**: per-call cost computed via pricing.js and stored in session events
- **Session-level totals**: summed at session end into `agent_sessions.total_tokens` and `total_cost_cents`
- **Daily metrics view**: `agent_daily_metrics` aggregates tokens and cost per user per day
- **No enforcement**: usage is tracked for observability but never checked before making LLM calls

#### What is designed but NOT coded:
A comprehensive design exists in `thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md`. All 7 planned files are **missing from the codebase**:

| Planned File | Purpose | Status |
|---|---|---|
| `BACKEND/services/observability/usageLimits.service.js` | Quota enforcement (daily tokens, monthly cost, RPM, concurrency) | Not created |
| `BACKEND/services/observability/metering.service.js` | Wrapper to log + enforce limits on all LLM calls | Not created |
| `BACKEND/database/user_usage_limits_schema.sql` | Per-user quota table | Not created |
| `BACKEND/controllers/usage.controller.js` | `GET /usage/me` endpoint | Not created |
| `BACKEND/routes/usage.routes.js` | Usage route registration | Not created |
| `BACKEND/middleware/requireUserMatch.js` | Prevent cross-user data access via `:userId` params | Not created |
| `BACKEND/middleware/adminAuth.js` | Protect `/api/admin/*` with `ADMIN_API_KEY` | Not created |

#### Planned quota types (from design doc):
- Daily token limit per user
- Monthly cost quota in cents
- RPM (requests per minute) limit
- Concurrent request limit
- Optional model allowlist per user
- Per-user overrides via `user_usage_limits` DB table

#### Planned env var configuration:
```
USAGE_LIMITS_ENABLED=true|false
USAGE_DAILY_TOKEN_LIMIT=<int>
USAGE_MONTHLY_COST_CENTS_LIMIT=<number>
USAGE_RPM_LIMIT=<int>
USAGE_CONCURRENT_LIMIT=<int>
USAGE_ALLOWED_MODELS=model1,model2,...
```

#### User settings (current):
- `BACKEND/database/user_settings_schema.sql` only stores `weight_unit` and `distance_unit`
- No subscription tiers, billing info, or usage tiers

---

## Code References

### Observability
- `BACKEND/instrument.js` - Sentry setup with OpenAI + profiling integrations
- `BACKEND/services/sessionObservability.service.js` - Core event logging (738 lines)
- `BACKEND/services/observability/metrics.service.js` - Dashboard query layer (459 lines)
- `BACKEND/services/observability/pricing.js` - Model pricing database (262 lines)
- `BACKEND/services/observability/logger.service.js` - Structured/console logger
- `BACKEND/services/observability/index.js` - Unified export module
- `BACKEND/database/session_observability_schema.sql` - Session + events tables
- `BACKEND/database/observability_schema.sql` - Legacy trace/span tables
- `BACKEND/routes/observability.routes.js` - Admin API endpoints
- `BACKEND/controllers/observability.controller.js` - Admin API handlers
- `BACKEND/public/index.html` - Admin dashboard SPA

### Rate Limiting (only existing caps)
- `BACKEND/services/agentLoop.service.js:13` - `MAX_ITERATIONS = 10`
- `BACKEND/services/trainerIntake.service.js:15` - `MAX_QUESTIONS = 20`

### Token/Cost Tracking (operational)
- `BACKEND/services/agentLoop.service.js:189-209` - Per-call token/cache logging
- `BACKEND/services/sessionObservability.service.js:404-470` - LLM response event logging
- `BACKEND/services/observability/pricing.js` - Cost calculation per model

### Design Document (not yet implemented)
- `thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md` - Full metering plan

---

## Architecture Insights

1. **Observability is production-ready; guardrails are not.** The event timeline, cost tracking, and dashboard work well. But nothing prevents a user from making unlimited LLM calls.

2. **Dual-purpose session events.** The `agent_session_events` table serves both LLM context reconstruction (the agent reads its own history) and operational observability (the dashboard queries it). This is elegant but means observability writes are on the hot path.

3. **Cache-aware cost model.** Anthropic prompt caching gives 90% discounts on cache reads. The pricing service and session observability both account for this correctly, making cost tracking accurate.

4. **100% Sentry sampling.** Appropriate for current scale but will need adjustment before significant user growth.

5. **Admin endpoints are unprotected.** The design doc proposes `adminAuth.js` middleware with `ADMIN_API_KEY`, but it hasn't been implemented, so `/api/admin/*` is open.

6. **No iOS telemetry.** The iOS app has no client-side analytics or error tracking. All observability is server-side.

7. **Single-node assumptions.** The planned RPM and concurrency limits use in-memory counters, which work for a single server instance but would need Redis or similar for horizontal scaling.

---

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md` - Comprehensive design for the metering layer, covering user scoping middleware, usage limits service, metering wrapper, per-user DB overrides, admin auth, and a `/usage/me` endpoint. All designed but not yet implemented in code.
- `thoughts/shared/research/2026-01-20-anthropic-prompt-caching.md` - Research on prompt caching strategy (related to cost optimization)
- `thoughts/shared/research/2026-02-01-app-architecture-plain-english.md` - Architecture overview

---

## Related Research
- [2026-02-04-llm-usage-metering-and-guardrails.md](thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md) - The design document for the planned implementation

---

## Open Questions

1. **Implementation priority**: Should the metering/guardrails layer be the next implementation task? The design is thorough and ready to code.
2. **iOS usage display**: When quotas are enforced, should the iOS app show a usage meter or quota warnings? No UI exists for this.
3. **Sentry sampling**: Should trace/profile sampling be reduced before scaling to more users?
4. **Admin auth**: Should `/api/admin/*` be protected now, even before the full metering layer?
5. **Upstream 429 handling**: Should the backend handle rate limit responses from Anthropic/OpenAI APIs with retry + backoff?
