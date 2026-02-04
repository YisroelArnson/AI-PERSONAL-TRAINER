# Per-user Token/Cost Metering + Anti‑Abuse Guardrails (Backend)

## Why this work exists

This app makes LLM calls on behalf of authenticated users. Without metering + limits, a single user (or a compromised client) can drive unbounded token usage and create runaway API costs.

Goals:

1. Track token usage + cost per user (across Anthropic and OpenAI calls)
2. Add safety limits (rate limiting + quotas) to prevent abuse and enforce plan limits
3. Harden user scoping in endpoints where the backend uses Supabase **service role** (bypasses RLS)

---

## Existing observability foundation (already in repo)

The backend already had an event-based observability design:

- `agent_sessions` + `agent_session_events` tables (see `BACKEND/database/session_observability_schema.sql`)
- `BACKEND/services/sessionObservability.service.js` to log:
  - `llm_request` / `llm_response` events
  - per-session totals (tokens, cached tokens, cost) computed at session end

This work extends that foundation so **all LLM calls** (not only the agent loop) are logged in the same format, and so we can enforce **per-user limits** before calls happen.

---

## Summary of what was added/changed

### 1) Route-level user safety: `:userId` must match `req.user.id`

Problem:

- Many services use `SUPABASE_SECRET_KEY` (service role). That bypasses row-level security.
- If an endpoint trusts a user-provided `:userId`, it can become a cross-user data leak/modification vector.

Fix:

- New middleware: `BACKEND/middleware/requireUserMatch.js`
- Applied to all routes that take `:userId`:
  - `BACKEND/routes/recommend.routes.js`
  - `BACKEND/routes/exerciseLog.routes.js`
  - `BACKEND/routes/exerciseDistribution.routes.js`

Result:

- Requests like `POST /recommend/exercises/:userId` are safe even though the backend uses service role internally.

---

### 2) Per-user usage limits + lightweight rate limiting

New service:

- `BACKEND/services/observability/usageLimits.service.js`

What it supports:

- RPM limit (requests per minute) per user (in-memory, per-node)
- Concurrent in-flight requests limit per user (in-memory, per-node)
- Daily token quota (projected pre-check)
- Monthly cost quota in cents (projected pre-check)
- Optional model allowlist

How “current usage” is computed:

- Reads from `agent_daily_metrics` view (defined in `BACKEND/database/session_observability_schema.sql`)
- That view aggregates token + cost from `llm_response` events joined to `agent_sessions.user_id`
- Uses a small cache (~15 seconds) to avoid hammering Supabase during multi-step flows

Per-user overrides:

- If `user_usage_limits` exists, the backend reads it to override env defaults.

---

### 3) Metering wrapper that logs LLM calls into `agent_sessions`

New service:

- `BACKEND/services/observability/metering.service.js`

Pattern used:

1. Enforce usage limits (quota/rate/concurrency) **before** making the LLM call
2. Create a short-lived “metering” session in `agent_sessions` (`metadata.kind = "metering"`)
3. Log a `llm_request` event (payload redacted by default)
4. Execute the LLM call
5. Normalize usage into a “rawResponse” shape so existing `logLLMResponse()` can compute:
   - prompt tokens, completion tokens, cache tokens (where available)
   - cost via `BACKEND/services/observability/pricing.js`
6. End the session to finalize totals

Payload storage policy (privacy / DB size):

- By default, metering avoids storing full prompts/responses in Supabase.
- Controlled by env: `OBSERVABILITY_STORE_LLM_PAYLOADS=true|false` (default is “off” unless explicitly enabled).

---

### 4) Anthropic usage normalization fix (correct tokens/cost)

`sessionObservability.service.js` previously assumed OpenAI-style usage fields (`prompt_tokens`, `completion_tokens`, `total_tokens`).

Anthropic’s native SDK commonly provides `input_tokens` and `output_tokens`.

Fix:

- `BACKEND/services/sessionObservability.service.js` now maps:
  - prompt = `prompt_tokens ?? input_tokens`
  - completion = `completion_tokens ?? output_tokens`
  - total = `total_tokens ?? (prompt + completion)`

Result:

- token totals + cost computation for Anthropic calls are correct.

---

### 5) Keep “agent sessions” separate from “metering sessions”

Problem:

- The agent loop uses `getOrCreateSession()`. Without filtering, it could accidentally reuse a “metering” session.

Fix:

- `BACKEND/services/sessionObservability.service.js`
  - `createSession()` normalizes `metadata.kind` (defaults to `agent`)
  - `getOrCreateSession()` filters to `kind=agent` (or null for legacy rows)

Result:

- The agent chat timeline stays clean and isolated from other metered endpoints.

---

### 6) Metering wired into all LLM call sites

OpenAI (Vercel AI SDK / `ai` package):

- `BACKEND/services/recommend.service.js`
  - non-streaming: metered via `meteredCall()`
  - streaming: `startMeteredSession()` + finalize in `streamObject({ onFinish, onError })`
- `BACKEND/services/preference.service.js` (parse preference)
- `BACKEND/services/categoryGoals.service.js` (parse category goals)
- `BACKEND/services/muscleGoals.service.js` (parse muscle goals)
- `BACKEND/services/interval.service.js` (interval generation; signature updated to accept `userId`)

Anthropic (native SDK calls):

- `BACKEND/services/trainerIntake.service.js`
- `BACKEND/services/trainerWorkouts.service.js`
- `BACKEND/services/trainerAssessment.service.js`
- `BACKEND/services/trainerGoals.service.js`
- `BACKEND/services/trainerProgram.service.js`

Controllers were updated to:

- pass `req.user.id` into metered services where needed
- return HTTP `429` when limits are hit

---

### 7) Agent loop + initializer agent: enforce limits before each call

These flows already logged usage after the fact, but needed pre-flight enforcement.

- `BACKEND/services/agentLoop.service.js`
  - enforces limits for each Anthropic iteration using the context token estimate + max output tokens
  - validates the requested model via `modelProviders.service.js` (prevents arbitrary strings from clients)

- `BACKEND/services/initializerAgent.service.js`
  - enforces limits before OpenAI initializer calls
  - attributes usage to the session’s `user_id`

Agent controllers were updated to return 429 cleanly:

- `BACKEND/controllers/agent.controller.js`

---

### 8) New DB schema: per-user limits

New file:

- `BACKEND/database/user_usage_limits_schema.sql`

Creates:

- `user_usage_limits` keyed by `user_id`
- Quotas:
  - `daily_token_limit`
  - `monthly_cost_cents_limit`
- Rate limits:
  - `rpm_limit`
  - `concurrent_limit`
- Optional `allowed_models[]`

RLS:

- users can read their own row (for showing limits in UI if desired)
- only service role can write (users can’t raise their own quotas)

---

### 9) New endpoint: “my usage”

New endpoint for app UI:

- `GET /usage/me`

Files:

- `BACKEND/controllers/usage.controller.js`
- `BACKEND/routes/usage.routes.js`
- mounted in `BACKEND/index.js`

Response includes:

- effective limits (env defaults + DB overrides if enabled)
- usage totals (day + month) when limits are enabled

---

### 10) Observability/admin endpoint protection

Problem:

- `/api/admin/*` routes were intentionally unprotected for local dev, but that’s risky in production.

Fix:

- `BACKEND/middleware/adminAuth.js` + `BACKEND/routes/observability.routes.js`

Behavior:

- If `ADMIN_API_KEY` is unset → allow (local dev)
- If set → require `x-admin-key: <ADMIN_API_KEY>`

---

### 11) Metrics filtering fix (bug)

In `metrics.service.js`, token events were not consistently filtered by user when `userId` was provided because events are stored in `agent_session_events` and ownership is in `agent_sessions`.

Fix:

- `BACKEND/services/observability/metrics.service.js`
  - joins `agent_session_events` → `agent_sessions` and filters `agent_sessions.user_id`

---

## Configuration knobs (env vars)

Documented in `BACKEND/README.md`:

- `USAGE_LIMITS_ENABLED=true|false`
- `USAGE_DAILY_TOKEN_LIMIT=<int>` (empty/null = unlimited)
- `USAGE_MONTHLY_COST_CENTS_LIMIT=<number>` (empty/null = unlimited)
- `USAGE_RPM_LIMIT=<int>` (empty/null = unlimited)
- `USAGE_CONCURRENT_LIMIT=<int>` (empty/null = unlimited)
- `USAGE_ALLOWED_MODELS=model1,model2,...` (optional allowlist)
- `OBSERVABILITY_STORE_LLM_PAYLOADS=true|false` (store prompts/responses when enabled)
- `ADMIN_API_KEY=<string>` (protect `/api/admin/*` routes)

---

## How limit errors propagate to clients

When a limit is hit, the backend throws `UsageLimitError`:

- `status = 429`
- `code = "USAGE_LIMIT"`
- `details` describing which limit triggered

Controllers were updated across affected endpoints to return HTTP 429 with details so the iOS app can show a clear error.

---

## Notes / caveats / follow-ups

1. In-memory RPM/concurrency is **per-node**.
   - Fine for single-instance.
   - For multi-instance scaling, move counters to Redis or a DB-based limiter.

2. Quota checks are “projected”:
   - checks `estimatedPromptTokens + maxOutputTokens` up front
   - prevents runaway costs but can be conservative

3. Observability storage:
   - safest default is to avoid storing raw prompts/responses
   - enable only when debugging with `OBSERVABILITY_STORE_LLM_PAYLOADS=true`

---

## File list (high level)

Added:

- `BACKEND/middleware/requireUserMatch.js`
- `BACKEND/middleware/adminAuth.js`
- `BACKEND/services/observability/usageLimits.service.js`
- `BACKEND/services/observability/metering.service.js`
- `BACKEND/database/user_usage_limits_schema.sql`
- `BACKEND/controllers/usage.controller.js`
- `BACKEND/routes/usage.routes.js`

Modified (not exhaustive):

- `BACKEND/services/sessionObservability.service.js`
- `BACKEND/services/agentLoop.service.js`
- `BACKEND/services/initializerAgent.service.js`
- `BACKEND/services/recommend.service.js`
- `BACKEND/services/preference.service.js`
- `BACKEND/services/categoryGoals.service.js`
- `BACKEND/services/muscleGoals.service.js`
- `BACKEND/services/interval.service.js`
- `BACKEND/services/trainerIntake.service.js`
- `BACKEND/services/trainerWorkouts.service.js`
- `BACKEND/services/trainerAssessment.service.js`
- `BACKEND/services/trainerGoals.service.js`
- `BACKEND/services/trainerProgram.service.js`
- `BACKEND/services/observability/metrics.service.js`
- `BACKEND/index.js`
- `BACKEND/README.md`

