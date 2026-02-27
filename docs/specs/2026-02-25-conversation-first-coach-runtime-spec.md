# Conversation-First Coach Runtime Specification

This document is a language-agnostic NLSpec for implementing a conversation-first AI personal trainer runtime with constrained agent actions, memory-backed personalization, and cost-aware model routing. It is intended to be implementable from scratch by a developer or coding agent.

---

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Scope and Boundaries](#2-scope-and-boundaries)
3. [Architecture](#3-architecture)
4. [Data Model](#4-data-model)
5. [Coach Runtime and Turn Processing](#5-coach-runtime-and-turn-processing)
6. [Memory and Retrieval](#6-memory-and-retrieval)
7. [Tooling and Policy Enforcement](#7-tooling-and-policy-enforcement)
8. [Interfaces and Contracts](#8-interfaces-and-contracts)
9. [Cost Controls and Usage Metering](#9-cost-controls-and-usage-metering)
10. [Observability and Reliability](#10-observability-and-reliability)
11. [Rollout and Migration](#11-rollout-and-migration)
12. [Definition of Done](#12-definition-of-done)

---

## 1. Overview and Goals

### 1.1 Problem Statement

The product needs to evolve from workout generation into a persistent coaching experience that feels like a real personal trainer. Users must be able to return to a single conversation where the coach remembers relevant history, adapts workouts to current constraints, and triggers timely reminders without unsafe or opaque autonomy.

The implementation must improve retention and personalization while keeping LLM and memory costs controlled. The runtime therefore needs explicit session boundaries, selective memory retrieval, strict tool gating, and predictable billing/usage behavior.

### 1.2 Design Principles

**Conversation-first UX.** The primary interface must be a persistent coach thread with quick actions and optional voice, not a disconnected sequence of one-off generators.

**Constrained action surface.** The runtime must expose only high-value, auditable actions (workout adaptation, reminders, schedule-aware nudges, recap generation) and must not allow broad autonomous execution.

**Hybrid intelligence for cost control.** Deterministic logic should handle routine decisions first; LLM reasoning should be invoked only when personalization or nuanced adaptation is required.

**Typed memory separation.** Long-term semantic memory and short-term episodic memory must be stored and retrieved separately so updates remain accurate and context remains lean.

**Policy before prompting.** Safety, permissions, and tool authorization must be enforced by runtime policy layers, not by prompt instructions alone.

**Metered but simple user economics.** The backend must meter cost and usage per turn/tool, while externally supporting predictable subscription tiers with allowance and optional overage.

### 1.3 Architecture Overview

```
+--------------------------------------------------------------------+
| Mobile App (chat-first; optional voice input)                      |
| - Coach thread, Today plan, quick actions, progress, plan screen   |
+--------------------------------------------------------------------+
              | HTTPS (auth token)                         ^
              v                                            | push notifications
+--------------------------------------------------------------------+
| API Gateway                                                         |
| - auth, request validation, rate limits, idempotency               |
| - usage checks (allowance/overage)                                 |
+--------------------------------------------------------------------+
              | internal RPC                                          ^
              v                                                       |
+--------------------------------------------------------------------+
| Coach Runtime Service                                               |
| - session resolver, context assembler, model router                |
| - tool orchestrator, policy engine, memory writer                  |
+--------------------------------------------------------------------+
       |                           |                           |
       v                           v                           v
+----------------------+  +----------------------+  +----------------------+
| Transactional Store  |  | Vector/FTS Retrieval |  | Worker Queue         |
| (users, workouts,    |  | (episodic + semantic)|  | reminders, compaction|
| events, usage, plans)|  |                      |  | recap generation     |
+----------------------+  +----------------------+  +----------------------+
```

---

## 2. Scope and Boundaries

### 2.1 In Scope

- Persistent per-user coach sessions with append-only turn/event history.
- Chat-led daily check-in and workout adaptation workflow.
- Memory system with:
  - semantic profile memory,
  - episodic workout/check-in memory,
  - retrieval with hybrid scoring.
- Constrained tool execution for:
  - reminder scheduling,
  - workout generation/update,
  - progress recap generation,
  - calendar-aware suggestion generation.
- Usage metering and allowance gating at API/runtime boundaries.
- Weekly recap and plan-adjust worker jobs.

### 2.2 Out of Scope

**Multi-channel messaging platform adapters.** WhatsApp/Discord/Slack/iMessage adapters are excluded from V1. Extension point: channel adapter layer behind `InboundMessage` contract.

**General-purpose plugin marketplace.** User-installed tools/providers are excluded. Extension point: `ToolRegistry` provider plug-in slot.

**Broad autonomous agent capabilities.** Shell/browser/file-system execution is excluded. Extension point: privileged operator-only tool profile in future admin surface.

**Self-hosted per-user gateway topology.** Consumer V1 uses managed cloud services. Extension point: dedicated deployment profile with isolated runtime pods.

### 2.3 Companion Specs

This spec complements existing implementation docs in this repository and may reference implementation-specific surfaces in:

- [AI Personal Trainer Agent System Specification](./agent-system-spec.md)
- [Workout Generation System - Current Implementation Specification](./workout-generation-spec.md)

---

## 3. Architecture

### 3.1 Runtime Components

| Component | Type | Responsibility |
|---|---|---|
| `api_gateway` | Service | Auth, request validation, rate limits, idempotency, allowance checks |
| `coach_runtime` | Service | Turn orchestration, context assembly, policy checks, model invocation, tool execution |
| `memory_service` | Module/Service | Memory ingestion, consolidation, indexing, retrieval |
| `tool_executor` | Module | Safe execution of whitelisted coach tools |
| `notification_worker` | Worker | Time/event-triggered reminder dispatch |
| `recap_worker` | Worker | Weekly summaries and plan adjustment artifacts |
| `usage_metering` | Module | Per-turn and per-tool cost accounting and allowance updates |

### 3.2 Request Lifecycle

```
FUNCTION handle_user_turn(request: ChatTurnRequest, auth_context: Dict) -> ChatTurnResponse:
    auth_user = authenticate(auth_context)
    enforce_rate_limit(auth_user.user_id, request.client_request_id)
    enforce_allowance(auth_user.user_id, request.mode)

    session_id = resolve_session(auth_user.user_id, request.session_id)
    turn = append_user_turn(session_id, request.message, request.metadata)

    context = assemble_context(session_id, request.message, request.quick_action)
    policy = evaluate_policy(auth_user.user_id, session_id, request)
    ensure_policy_allows_turn(policy, request)

    model_plan = route_model(context, policy, request.mode)
    llm_output = invoke_model(model_plan, context)
    action_plan = parse_actions(llm_output)

    enforced_actions = authorize_actions(action_plan, policy)
    tool_results = execute_authorized_actions(enforced_actions, session_id)

    assistant_message = render_assistant_message(llm_output, tool_results)
    append_assistant_turn(session_id, assistant_message, tool_results)

    usage = record_usage(auth_user.user_id, session_id, model_plan, llm_output, tool_results)
    maybe_schedule_followups(session_id, tool_results, assistant_message)
    maybe_write_memories(session_id, turn, assistant_message, tool_results)

    RETURN ChatTurnResponse(
        session_id = session_id,
        message = assistant_message,
        tool_results = tool_results,
        usage_snapshot = usage
    )
```

### 3.3 Failure Isolation

| Failure Point | Required Behavior |
|---|---|
| model timeout/error | return fallback coaching message + retry-safe status code |
| unauthorized tool action | skip action, log policy violation, continue turn |
| memory write failure | do not fail user turn; enqueue retry job |
| notification scheduling failure | turn succeeds; worker retry with backoff |
| usage metering persistence failure | mark turn for reconciliation; block overage-sensitive actions until reconciled |

---

## 4. Data Model

### 4.1 Core Records

```
RECORD CoachSession:
    id                    : String
    user_id               : String
    status                : String                 -- active|archived
    channel               : String = "in_app_chat"
    created_at            : Timestamp
    updated_at            : Timestamp
    last_user_turn_at     : Timestamp | None
    last_assistant_turn_at: Timestamp | None

RECORD SessionTurn:
    id                    : String
    session_id            : String
    role                  : String                 -- user|assistant|system
    content               : String
    quick_action          : String | None
    metadata              : Dict
    created_at            : Timestamp

RECORD SessionEvent:
    id                    : String
    session_id            : String
    event_type            : String                 -- tool_call|tool_result|policy_violation|memory_write|notification
    payload               : Dict
    created_at            : Timestamp

RECORD SemanticMemory:
    id                    : String
    user_id               : String
    key                   : String                 -- goal|injury|equipment|schedule|preference
    value                 : String
    confidence            : Float
    source_turn_id        : String | None
    updated_at            : Timestamp

RECORD EpisodicMemoryChunk:
    id                    : String
    user_id               : String
    session_id            : String
    text                  : String
    token_count           : Integer
    embedding_id          : String | None
    created_at            : Timestamp

RECORD UsageLedgerEntry:
    id                    : String
    user_id               : String
    session_id            : String
    turn_id               : String | None
    category              : String                 -- model_input|model_output|embedding|tool|notification
    quantity              : Float
    unit_cost_usd         : Float
    total_cost_usd        : Float
    created_at            : Timestamp
```

### 4.2 Configuration Attributes

| Key | Type | Default | Description |
|---|---|---|---|
| `runtime.max_turn_tokens` | Integer | `12000` | Upper bound for assembled model context |
| `runtime.max_actions_per_turn` | Integer | `4` | Maximum tool calls allowed in one turn |
| `runtime.turn_timeout_ms` | Integer | `45000` | End-to-end turn timeout budget |
| `memory.episodic_window_days` | Integer | `14` | Rolling episodic retrieval window |
| `memory.min_retrieval_score` | Float | `0.35` | Minimum fused retrieval score |
| `memory.top_k` | Integer | `8` | Max memory snippets injected into context |
| `memory.chunk_size_tokens` | Integer | `400` | Target chunk size for episodic indexing |
| `memory.chunk_overlap_tokens` | Integer | `80` | Overlap to preserve local continuity |
| `billing.allowance_enforcement` | Boolean | `true` | Gate turns/actions when allowance exhausted |
| `billing.overage_enabled` | Boolean | `true` | Allow continued usage with paid overage credits |

### 4.3 Event Taxonomy

| Status | Meaning |
|---|---|
| `TURN_RECEIVED` | Authenticated user turn accepted by gateway |
| `CONTEXT_ASSEMBLED` | Runtime built context for model call |
| `MODEL_INVOKED` | Model request sent with route metadata |
| `TOOL_AUTHORIZED` | Requested action passed policy checks |
| `TOOL_DENIED` | Requested action failed policy checks |
| `TURN_COMPLETED` | Assistant response persisted and returned |
| `MEMORY_UPSERTED` | Semantic or episodic memory write persisted |
| `USAGE_RECORDED` | Ledger entries persisted for the turn |

---

## 5. Coach Runtime and Turn Processing

### 5.1 Session Resolution

The implementation must maintain one default active session per user for the coach thread. If a session ID is provided and belongs to the user, that session may be reused. Otherwise, the runtime must resolve to the user default session.

```
FUNCTION resolve_session(user_id: String, provided_session_id: String | None) -> String:
    IF provided_session_id is not NONE:
        session = get_session(provided_session_id)
        IF session.user_id == user_id AND session.status == "active":
            RETURN session.id

    default_session = get_active_default_session(user_id)
    IF default_session is not NONE:
        RETURN default_session.id

    created = create_session(user_id, channel="in_app_chat")
    RETURN created.id
```

### 5.2 Context Assembly Rules

The runtime must assemble context in this order:

1. system safety and behavior policy,
2. active user profile summary,
3. retrieved semantic memory snippets,
4. retrieved episodic memory snippets,
5. recent session turns (most recent first or compacted summary + tail),
6. current user message and quick action metadata.

If token budget would be exceeded, the runtime must truncate lower-priority context first (older episodic snippets, then older turns), while preserving policy and latest user message.

### 5.3 Model Routing

```
FUNCTION route_model(context: Dict, policy: Dict, mode: String) -> ModelPlan:
    complexity = estimate_turn_complexity(context, mode)
    IF complexity == "low":
        RETURN ModelPlan(model_id="economy_coach_model", reason="default_low_cost")
    IF complexity == "medium":
        RETURN ModelPlan(model_id="balanced_coach_model", reason="moderate_reasoning")
    RETURN ModelPlan(model_id="premium_reasoning_model", reason="high_complexity_or_safety")
```

The implementation should keep routing deterministic and auditable by recording selected model and route reason in each `MODEL_INVOKED` event.

### 5.4 Quick Actions

The runtime must support these quick actions as first-class turn metadata:

| Quick Action | Behavior |
|---|---|
| `start_workout` | create or resume active workout session and respond with immediate first step |
| `shorten_to_20` | rescale current/next workout duration to about 20 minutes |
| `swap_exercise` | replace one exercise while preserving session intent and constraints |
| `im_sore` | apply recovery-aware adjustments and suggest intensity modifications |
| `skip_today` | log skip reason and generate follow-up plan/reminder suggestion |

---

## 6. Memory and Retrieval

### 6.1 Memory Write Policy

Semantic memory writes must be high-signal and stable. The runtime should require explicit confirmation for sensitive or durable facts (for example, injury constraints). Episodic memory writes capture recent events, check-ins, and adaptations.

```
FUNCTION classify_memory_write(candidate: Dict) -> String:
    IF candidate.type IN ["injury", "medical_constraint", "long_term_preference"] AND candidate.confirmed != true:
        RETURN "REQUIRES_CONFIRMATION"
    IF candidate.stability_score >= 0.75:
        RETURN "SEMANTIC_UPSERT"
    RETURN "EPISODIC_APPEND"
```

### 6.2 Hybrid Retrieval Pipeline

The memory retrieval algorithm must combine vector and keyword signals.

```
FUNCTION retrieve_memory(query: String, user_id: String, top_k: Integer, min_score: Float) -> List<Dict>:
    vector_results = vector_search(user_id, query, top_k * 4)
    keyword_results = bm25_search(user_id, query, top_k * 4)

    fused = []
    FOR EACH candidate IN union_candidates(vector_results, keyword_results):
        vector_score = candidate.vector_score OR 0.0
        keyword_score = candidate.keyword_score OR 0.0
        fused_score = (0.7 * vector_score) + (0.3 * keyword_score)
        IF fused_score >= min_score:
            fused.APPEND({ candidate WITH score = fused_score })

    sorted = sort_descending(fused, key="score")
    RETURN sorted[0..top_k]
```

### 6.3 Memory Search and Get Tools

```
TOOL memory_search:
    description: "Find relevant memory snippets for current coaching turn"
    parameters:
        query       : String (required)          -- semantic and keyword query
        top_k       : Integer (optional)         -- max results (default: 8)
        min_score   : Float (optional)           -- score threshold (default: 0.35)
    returns: List of snippet summaries with source identifiers and scores
    errors: invalid query, retrieval unavailable

TOOL memory_get:
    description: "Fetch exact memory content by source identifier"
    parameters:
        source_id   : String (required)          -- snippet source identifier
        line_start  : Integer (optional)         -- start line for text sources
        line_count  : Integer (optional)         -- number of lines (default: 200)
    returns: Exact memory content segment
    errors: source not found, unauthorized source access
```

### 6.4 Compaction

The implementation must compact long-running sessions to stay within context budgets. Compaction should preserve:

- latest user goals and constraints,
- unresolved commitments/promises,
- latest workout progression state,
- recent motivational and adherence context.

---

## 7. Tooling and Policy Enforcement

### 7.1 Allowed Tool Set (V1)

| Tool | Purpose | Risk Level |
|---|---|---|
| `workout_plan_generate` | create/adapt workout plans | medium |
| `workout_session_update` | update in-progress workout structure | medium |
| `reminder_schedule` | create/update reminders | low |
| `calendar_suggest` | suggest schedule-aware sessions (read-only) | low |
| `progress_recap_generate` | produce weekly recap artifact | low |
| `memory_search` | retrieve relevant memory snippets | low |
| `memory_get` | load specific memory content | low |

### 7.2 Policy Layers

```
ENUM PolicyDecision:
    ALLOW
    DENY
    ALLOW_WITH_REDACTION

FUNCTION evaluate_action_policy(action: Dict, user_policy: Dict, feature_policy: Dict) -> PolicyDecision:
    IF action.tool_name NOT IN feature_policy.allowed_tools:
        RETURN DENY
    IF action.tool_name == "reminder_schedule" AND user_policy.notifications_enabled != true:
        RETURN DENY
    IF action.contains_sensitive_reasoning == true:
        RETURN ALLOW_WITH_REDACTION
    RETURN ALLOW
```

Policy evaluation must run before any side-effecting tool executes. Denied actions must be logged with explicit reason codes.

### 7.3 Safety Constraints

- The implementation must not execute shell commands, browser automation, or file-system operations from user turns.
- The implementation must not present medical diagnosis; injury-aware coaching should remain non-diagnostic and advice-limited.
- The runtime must preserve an audit trail for every policy deny/allow decision.

---

## 8. Interfaces and Contracts

### 8.1 API Contracts

| Key | Type | Default | Description |
|---|---|---|---|
| `POST /coach/turn` | HTTP endpoint | none | process one user turn and return assistant response |
| `GET /coach/sessions/:id` | HTTP endpoint | none | fetch session metadata and recent turns |
| `GET /coach/today` | HTTP endpoint | none | fetch daily coaching card and recommended actions |
| `POST /coach/reminders` | HTTP endpoint | none | configure reminder preferences and schedule |
| `GET /coach/weekly-recap` | HTTP endpoint | none | fetch latest generated weekly recap |

### 8.2 Request and Response Records

```
RECORD ChatTurnRequest:
    session_id           : String | None
    message              : String
    quick_action         : String | None
    client_request_id    : String
    mode                 : String = "text"
    metadata             : Dict

RECORD ChatTurnResponse:
    session_id           : String
    assistant_message    : String
    tool_results         : List<Dict>
    usage_snapshot       : Dict
    blocked_reason       : String | None
```

### 8.3 Idempotency and Retry

`POST /coach/turn` must require `client_request_id`. If the same user submits the same `client_request_id` within idempotency retention window, the API must return the original response without re-running tools.

---

## 9. Cost Controls and Usage Metering

### 9.1 Metering Model

The implementation must meter usage for:

- model input tokens,
- model output tokens,
- embedding operations,
- tool executions with non-zero provider cost (if any),
- outbound notification sends.

Each metered event must write a `UsageLedgerEntry`.

### 9.2 Allowance and Overage Enforcement

```
FUNCTION enforce_allowance(user_id: String, mode: String):
    entitlement = get_user_entitlement(user_id)
    usage = get_current_cycle_usage(user_id)

    IF usage.remaining_allowance <= 0:
        IF entitlement.overage_enabled != true:
            RAISE AllowanceExceeded("included usage exhausted")
        IF entitlement.credit_balance_usd <= 0:
            RAISE OverageBlocked("no overage credits available")
```

### 9.3 Cost Guardrails

| Guardrail | Required Behavior |
|---|---|
| per-turn token cap | hard-fail model request if assembled context exceeds cap after compaction |
| max tool calls per turn | deny additional side-effecting calls after limit |
| fallback model | route to lower-cost model for low-complexity turns |
| cache and summary reuse | reuse recent summaries/embeddings where valid |

---

## 10. Observability and Reliability

### 10.1 Required Telemetry

| Key | Type | Default | Description |
|---|---|---|---|
| `trace_id` | String | generated | request-level distributed trace ID |
| `session_id` | String | required | coaching session identifier |
| `turn_id` | String | generated | turn identifier |
| `model_id` | String | required on model call | selected model for turn |
| `route_reason` | String | none | reason from router decision |
| `latency_ms` | Integer | none | measured latency per stage |
| `policy_decision` | String | none | allow/deny outcome for each action |
| `cost_usd` | Float | `0.0` | cost per event/turn |

### 10.2 SLO Targets

| SLO | Target |
|---|---|
| first response token latency (p95) | <= 2.5 seconds |
| turn completion latency (p95, no heavy tools) | <= 6 seconds |
| successful turn persistence | >= 99.9% |
| reminder dispatch success (daily) | >= 99.5% |

### 10.3 Retry and Recovery

Workers should use exponential backoff with bounded retries for reminder and recap jobs. Dead-letter queue entries must be inspectable with root-cause metadata.

---

## 11. Rollout and Migration

### 11.1 Incremental Rollout Phases

1. Phase 1: chat-first runtime in shadow mode with read-only memory retrieval.
2. Phase 2: enable semantic and episodic memory writes for a limited cohort.
3. Phase 3: enable reminder scheduling and weekly recap generation.
4. Phase 4: enable allowance enforcement and overage billing controls.

### 11.2 Migration Requirements

- Existing user profile/preferences must map into `SemanticMemory`.
- Existing workout/check-in history must be backfilled into episodic chunks for retrieval bootstrap.
- Migration jobs must be idempotent and resumable.

---

## 12. Definition of Done

### 12.1 Session and Turn Runtime

- [ ] Runtime resolves one active default session per user when `session_id` is absent.
- [ ] `POST /coach/turn` persists user and assistant turns with event linkage.
- [ ] Context assembly preserves policy layer and latest user message even under token pressure.
- [ ] Quick actions (`start_workout`, `shorten_to_20`, `swap_exercise`, `im_sore`, `skip_today`) execute with deterministic behavior.
- [ ] Unauthorized actions are denied before tool execution and logged with reason codes.

### 12.2 Memory System

- [ ] Semantic memory writes are separated from episodic writes.
- [ ] Sensitive durable facts require explicit confirmation before semantic upsert.
- [ ] Retrieval uses hybrid vector + BM25 scoring with weighted fusion.
- [ ] Retrieval returns at most configured `top_k` snippets and honors `min_score`.
- [ ] Session compaction preserves commitments, constraints, and progression context.

### 12.3 Tooling and Policy

- [ ] Only V1 allowed tools are invocable from runtime turns.
- [ ] Runtime rejects shell/browser/file-system tool categories for user turns.
- [ ] Reminder scheduling respects user notification permissions.
- [ ] Policy decisions are recorded for every requested action.

### 12.4 Cost and Billing Controls

- [ ] Usage ledger entries are written for model, embedding, tool, and notification cost categories.
- [ ] Allowance checks run before expensive model/tool execution.
- [ ] Overage behavior blocks usage when credits are not available.
- [ ] Model routing records selected model and route reason per turn.

### 12.5 Reliability and Observability

- [ ] Turn traces include `trace_id`, `session_id`, `turn_id`, and stage latencies.
- [ ] Worker retries use bounded exponential backoff and dead-letter failed jobs.
- [ ] Idempotent `client_request_id` on turn submission returns prior response on retry.
- [ ] Critical failures degrade gracefully with user-safe fallback messages.

### 12.6 Cross-Feature Parity Matrix

| Test Case | Text Mode | Voice-Initiated Mode | Quick Action Mode |
|---|---|---|---|
| Session resolution and turn persistence | [ ] | [ ] | [ ] |
| Policy enforcement before side effects | [ ] | [ ] | [ ] |
| Hybrid memory retrieval and context injection | [ ] | [ ] | [ ] |
| Usage metering and allowance gating | [ ] | [ ] | [ ] |
| Fallback behavior on model timeout | [ ] | [ ] | [ ] |

### 12.7 Integration Smoke Test

```
-- 1. Setup
user_id = create_test_user(plan="coach_tier_with_allowance")
session_id = resolve_session(user_id, NONE)

-- 2. Prime memory
write_semantic_memory(user_id, key="injury", value="left knee sensitivity", confirmed=true)
append_episodic_memory(user_id, session_id, "User reported soreness after squats yesterday.")

-- 3. Execute a normal turn
request = ChatTurnRequest(
    session_id = session_id,
    message = "I only have 20 minutes and my knee is sore today.",
    quick_action = "shorten_to_20",
    client_request_id = "req-001",
    mode = "text",
    metadata = {}
)
response = post_coach_turn(user_id, request)
ASSERT response.session_id == session_id
ASSERT response.assistant_message is not NONE

-- 4. Validate tool + policy + memory behavior
events = get_session_events(session_id)
ASSERT ANY(events, e -> e.event_type == "TOOL_AUTHORIZED")
ASSERT NONE(events, e -> e.payload.tool_category == "shell")
ASSERT ANY(events, e -> e.event_type == "MEMORY_UPSERTED" OR e.event_type == "CONTEXT_ASSEMBLED")

-- 5. Validate metering
ledger = get_usage_ledger(user_id, session_id)
ASSERT ANY(ledger, x -> x.category == "model_input")
ASSERT ANY(ledger, x -> x.category == "model_output")

-- 6. Validate idempotency
response_retry = post_coach_turn(user_id, request)
ASSERT response_retry.assistant_message == response.assistant_message

-- 7. Allowance exhaustion path
force_exhaust_allowance(user_id)
blocked = TRY_POST_COACH_TURN(user_id, ChatTurnRequest(
    session_id = session_id,
    message = "Generate my new plan",
    quick_action = NONE,
    client_request_id = "req-002",
    mode = "text",
    metadata = {}
))
ASSERT blocked.error_type IN ["AllowanceExceeded", "OverageBlocked"]
```

---

## Appendix A: Implementation Mapping for Current Repository

The following mapping is a suggested implementation alignment to current code locations.

| Spec Concern | Candidate Existing Surface |
|---|---|
| `coach_runtime` turn loop | `BACKEND/services/agentLoop.service.js` |
| context assembly | `BACKEND/services/contextBuilder.service.js` |
| usage ledger + pricing | `BACKEND/services/observability/pricing.js` |
| telemetry/events | `BACKEND/services/sessionObservability.service.js` |
| workout actions | `BACKEND/services/workoutGeneration.service.js`, `BACKEND/services/workoutTracking.service.js` |
| reminders + weekly jobs | `BACKEND/cron/weeklyReview.cron.js`, `BACKEND/services/weeklyReview.service.js` |

---

## Appendix B: Design Decision Rationale

**Why conversation-first instead of workflow-first?** Daily coaching adherence depends on frequent low-friction interaction. A persistent thread creates continuity and supports check-ins, adaptive planning, and reminders without forcing users to navigate isolated flows.

**Why constrained tools instead of general agent tools?** Constrained tools reduce safety and security risk while still delivering high-value coaching actions. Broad tool access increases blast radius and is not required for V1 user outcomes.

**Why hybrid retrieval instead of vector-only?** Literal strings (exercise names, identifiers, specific constraints) are often missed by vector-only retrieval. Weighted fusion of semantic and BM25 signals improves recall quality under production constraints.

**Why subscription with allowance and optional overage?** Users need predictable pricing while the system needs cost control. This model balances conversion and margin better than wallet-only pay-per-use for early product stages.
