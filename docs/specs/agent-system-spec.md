# AI Personal Trainer Agent System Specification

This document is a language-agnostic specification describing the current implementation of the AI Personal Trainer agent system -- a multi-turn conversational agent that generates personalized workouts, manages exercise sessions, and provides fitness guidance through an iterative tool-use loop.

---

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Architecture](#2-architecture)
3. [Agent Loop](#3-agent-loop)
4. [Context Building](#4-context-building)
5. [Initializer Agent](#5-initializer-agent)
6. [Tool System](#6-tool-system)
7. [Session and Event Model](#7-session-and-event-model)
8. [Streaming Protocol](#8-streaming-protocol)
9. [Data Sources](#9-data-sources)
10. [Authentication and API](#10-authentication-and-api)
11. [Cost Tracking and Observability](#11-cost-tracking-and-observability)
12. [Definition of Done](#12-definition-of-done)

---

## 1. Overview and Goals

### 1.1 Problem Statement

Users need personalized workout guidance -- exercise selection, set/rep programming, recovery awareness, equipment constraints, and progress tracking -- that adapts to their goals, body stats, location, and history. A static program cannot account for these variables in real-time. The agent system provides an AI personal trainer that operates as an iterative tool-use agent: it analyzes user requests, selects relevant data, generates structured workouts, and manages exercise sessions through a multi-turn conversation loop.

### 1.2 Design Principles

**Tool-use agent loop.** The agent must respond exclusively through tool calls -- never plain text. Every iteration selects exactly one tool, executes it, and decides whether to continue or stop. This enforces structured, predictable behavior and prevents hallucinated responses.

**Append-only event stream.** All session state is stored as an ordered sequence of immutable events (user messages, tool calls, tool results, knowledge injections). Events are never modified or deleted. This enables KV-cache efficiency because the prompt prefix remains stable across iterations.

**Two-agent architecture.** A lightweight initializer agent (GPT-4o-mini) selects which data sources the main agent needs before each turn. This keeps the main agent's context lean and avoids over-fetching user data on every request.

**Artifact-based delivery.** Structured outputs (workouts) are created as artifacts with unique IDs, then explicitly delivered to the user via a separate message tool call. This two-step pattern ensures the agent can create, review, and present artifacts with accompanying commentary.

**Cache-optimized context.** The system uses a 4-level KV-cache strategy (tools, system prompt, user data, messages) to achieve up to 90% cost reduction on repeated requests within a session.

**Session observability.** Every event -- LLM requests, responses, tool calls, errors, costs -- is logged to a persistent event store. Sessions can be replayed, debugged, and analyzed for cost and performance.

### 1.3 Architecture Overview

```
+--------------------------------------------------+
|  iOS Client (SwiftUI)                             |
+--------------------------------------------------+
        |  POST /agent/stream                ^
        |  { message, sessionId,             |  SSE events
        |    currentWorkout, model }         |  (status, tool_result,
        v                                    |   knowledge, done)
+--------------------------------------------------+
|  HTTP Layer (Express)                             |
|  auth middleware → agent controller               |
+--------------------------------------------------+
        |                            ^
        v                            |
+--------------------------------------------------+
|  Agent Loop (agentLoop.service)                   |
|  +--------------------+  +---------------------+ |
|  | Initializer Agent  |  | Context Builder     | |
|  | (GPT-4o-mini)      |  | (event→message      | |
|  | selects data       |  |  conversion + KV    | |
|  | sources            |  |  cache breakpoints) | |
|  +--------------------+  +---------------------+ |
|  +--------------------+  +---------------------+ |
|  | Tool Registry      |  | Session             | |
|  | (execute + format) |  | Observability       | |
|  +--------------------+  +---------------------+ |
+--------------------------------------------------+
        |                            ^
        v                            |
+--------------------------------------------------+
|  External Services                                |
|  +------------+  +------------+  +-------------+  |
|  | Anthropic  |  | OpenAI     |  | Supabase    |  |
|  | Claude API |  | (init only)|  | PostgreSQL  |  |
|  +------------+  +------------+  +-------------+  |
+--------------------------------------------------+
```

---

## 2. Architecture

### 2.1 Component Overview

The agent system consists of six primary components:

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| Agent Loop | `agentLoop.service.js` | Orchestrates the iterative tool-use cycle |
| Context Builder | `contextBuilder.service.js` | Converts events to Anthropic message format with KV-cache breakpoints |
| Initializer Agent | `initializerAgent.service.js` | Selects data sources before each user turn |
| Tool Registry | `agent/tools/index.js` + tool modules | Defines and executes all available tools |
| Session Observability | `sessionObservability.service.js` | Manages sessions, logs events, tracks costs |
| Model Providers | `modelProviders.service.js` | Configures Anthropic client and model registry |

### 2.2 Technology Stack

| Concern | Technology |
|---------|-----------|
| Runtime | Node.js (CommonJS) |
| HTTP framework | Express |
| Main LLM | Anthropic Claude (Haiku 4.5 default, Sonnet 4.5, Opus 4.5 available) |
| Initializer LLM | OpenAI GPT-4o-mini |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth (JWT) |
| Streaming | Server-Sent Events (SSE) |

### 2.3 Environment Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | yes | -- | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | yes | -- | OpenAI API key for initializer agent |
| `SUPABASE_PUBLIC_URL` | yes | -- | Supabase project URL |
| `SUPABASE_SECRET_KEY` | yes | -- | Service role key for server operations |
| `SUPABASE_PUBLISHABLE_KEY` | yes | -- | Publishable key for client auth verification |
| `PRIMARY_MODEL` | no | `claude-haiku-4-5` | Default Claude model ID |
| `PORT` | no | `3000` | Server listen port |

---

## 3. Agent Loop

### 3.1 Core Algorithm

The agent loop is the central orchestration mechanism. It receives a user message, initializes context, then iteratively calls the LLM and executes tools until a termination condition is met.

```
FUNCTION runAgentLoop(userId: String, userInput: String, options: Dict) -> AgentResult:
    session = getOrCreateSession(userId, options.sessionId)
    logUserMessage(session.id, userInput)

    -- Inject current workout state from client (if active)
    IF options.currentWorkout is not NONE:
        logKnowledge(session.id, "current_workout_session", formatCurrentWorkout(options.currentWorkout))

    -- Run initializer to select and fetch needed data sources
    TRY:
        initializeContext(session.id, userId, userInput, options.onEvent)
    CATCH error:
        logError(session.id, error, "context_init")
        -- Continue with limited context

    iteration = 0
    shouldContinue = true
    actions = []

    WHILE shouldContinue AND iteration < MAX_ITERATIONS:
        iteration += 1

        -- Build full context from event stream
        context = buildAgentContext(session.id, userId)

        -- Log and call LLM
        logLLMRequest(session.id, activeModel, context)
        response = callAnthropicModel(client, activeModel, context)
        logLLMResponse(session.id, response)

        toolCall = response.toolCall
        IF toolCall is NONE:
            logError(session.id, "No tool call in response")
            BREAK

        -- Log and execute tool
        logToolCall(session.id, toolCall.name, toolCall.arguments, toolCall.id)
        emit("tool_start", { tool: toolCall.name, args: toolCall.arguments })

        result = executeTool(toolCall.name, toolCall.arguments, { userId, sessionId })
        logToolResult(session.id, toolCall.name, result)
        emit("tool_result", { tool: toolCall.name, result })

        actions.APPEND({ tool: toolCall.name, args: toolCall.arguments, result })

        -- Check termination conditions
        IF toolCall.name == "idle" OR toolCall.name == "message_ask_user":
            shouldContinue = false

    endSession(session.id, "completed")
    RETURN { sessionId: session.id, actions, iterations: iteration }
```

### 3.2 Termination Conditions

The loop stops when any of these conditions is met:

| Condition | Trigger | Behavior |
|-----------|---------|----------|
| Idle signal | Agent calls `idle` tool | Normal completion -- agent is done |
| User question | Agent calls `message_ask_user` | Blocking -- wait for user response |
| Max iterations | `iteration >= 10` | Safety limit -- logged as error |
| No tool call | LLM response contains no `tool_use` block | Error -- breaks loop |
| LLM error | Anthropic API call throws | Fatal -- propagated to caller |

### 3.3 LLM Call Configuration

```
FUNCTION callAnthropicModel(client, modelId, context) -> LLMResponse:
    response = client.messages.create(
        model       = modelId,
        max_tokens  = 8192,
        tools       = getAnthropicTools(),      -- with cache_control on last tool
        tool_choice = { type: "any" },           -- FORCE tool use
        system      = [
            { type: "text", text: context.systemPrompt, cache_control: EPHEMERAL },
            { type: "text", text: context.userDataXml,  cache_control: EPHEMERAL }
        ],
        messages    = context.messages            -- cache_control on last message
    )

    toolUseBlock = response.content.FIND(block -> block.type == "tool_use")

    RETURN {
        toolCall: { id: toolUseBlock.id, name: toolUseBlock.name, arguments: toolUseBlock.input },
        usage: { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens },
        model: response.model,
        stopReason: response.stop_reason
    }
```

**Key constraint:** `tool_choice` is set to `{ type: "any" }`, forcing the model to always respond with a tool call. The agent must never produce plain text responses.

### 3.4 Model Registry

```
RECORD ModelConfig:
    displayName  : String
    pricing      : ModelPricing
    notes        : String

RECORD ModelPricing:
    prompt         : Float     -- $/MTok for input tokens
    completion     : Float     -- $/MTok for output tokens
    cached_prompt  : Float     -- $/MTok for cache-read input tokens
```

| Model ID | Display Name | Prompt $/MTok | Completion $/MTok | Cached $/MTok |
|----------|-------------|---------------|-------------------|---------------|
| `claude-haiku-4-5` | Claude Haiku 4.5 | 1.00 | 5.00 | 0.10 |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 | 3.00 | 15.00 | 0.30 |
| `claude-opus-4-5` | Claude Opus 4.5 | 5.00 | 25.00 | 0.50 |

---

## 4. Context Building

### 4.1 Overview

The context builder transforms the persistent event stream into the Anthropic messages API format. It fetches session events, converts them to native message structures, injects user data as XML, and places KV-cache breakpoints at strategic positions.

### 4.2 KV-Cache Strategy

The system uses 4 cache breakpoints to maximize prompt caching efficiency:

```
Cache Breakpoint Layout:
+-----------------------------------------------+
| 1. Tools (cache_control on last tool def)     |  ← Stable across all sessions
+-----------------------------------------------+
| 2. System Prompt (cache_control on text block) |  ← Stable across all sessions
+-----------------------------------------------+
| 3. User Data XML (cache_control on text block) |  ← Stable within a session
+-----------------------------------------------+
| 4. Messages (cache_control on last content     |  ← Grows each iteration
|    block of last message)                      |
+-----------------------------------------------+
```

Each breakpoint uses `{ type: "ephemeral" }` cache control. After the first request, tool definitions and system prompt achieve ~90% cost reduction via cache reads.

### 4.3 Event-to-Message Conversion

Events are converted to Anthropic's native multi-turn format. The conversion must satisfy a critical constraint: **every `tool_use` from the assistant must be immediately followed by a `tool_result` in the next user message.**

```
FUNCTION buildEventsToMessages(events: List<Event>) -> List<Message>:
    messages = []
    pendingToolCallId = NONE
    bufferedContent = []

    FOR EACH event IN events:
        SWITCH event.event_type:
            CASE "user_message":
                IF pendingToolCallId is not NONE:
                    bufferedContent.APPEND({ type: "text", text: event.data.message })
                ELSE:
                    -- Merge consecutive user messages
                    IF last message is user role:
                        append text block to last message
                    ELSE:
                        messages.APPEND({ role: "user", content: event.data.message })

            CASE "tool_call":
                messages.APPEND({
                    role: "assistant",
                    content: [{ type: "tool_use", id: event.data.call_id,
                                name: event.data.tool_name, input: event.data.arguments }]
                })
                pendingToolCallId = event.data.call_id
                bufferedContent = []

            CASE "tool_result":
                content = [{ type: "tool_result", tool_use_id: event.data.call_id,
                             content: stringify(event.data.result) }]
                -- Append any buffered knowledge/artifacts
                content.APPEND(bufferedContent)
                bufferedContent = []
                messages.APPEND({ role: "user", content: content })
                pendingToolCallId = NONE

            CASE "knowledge":
                text = '<knowledge source="SOURCE">\nDATA\n</knowledge>'
                IF pendingToolCallId is not NONE:
                    bufferedContent.APPEND({ type: "text", text: text })
                ELSE:
                    append to last user message or create new one

            CASE "artifact":
                text = '<artifact type="TYPE" id="ID">\nSUMMARY\n</artifact>'
                -- Same buffering logic as knowledge

    RETURN messages
```

### 4.4 User Data XML

User data (profile, settings, locations) is fetched fresh on every context build and formatted as XML:

```
<user_data>
<unit_preferences>
Weight: kg
Distance: km
</unit_preferences>

<body_stats>
Sex: male
Age: 28
Height: 180cm
Weight: 82kg
Body Fat: 15%
</body_stats>

<current_location>
Location: Home Gym
Equipment:
  - Dumbbells (free_weights): 5, 10, 15, 20kg
  - Pull-up Bar
</current_location>
</user_data>
```

This XML is passed as a separate system message block with its own cache breakpoint, allowing it to be cached independently from the system prompt.

### 4.5 Context Build Output

```
RECORD AgentContext:
    systemPrompt  : String               -- core system instructions (stable)
    userDataXml   : String               -- user profile/settings/location XML
    messages      : List<AnthropicMessage>  -- native multi-turn format
    session       : Session              -- session metadata
    eventCount    : Integer              -- number of events in context
```

---

## 5. Initializer Agent

### 5.1 Purpose

The initializer agent is a lightweight LLM (GPT-4o-mini) that runs before each main agent turn. It analyzes the user's message, reviews which data sources are already in the session's event stream, and selects which new data sources to fetch.

### 5.2 Algorithm

```
FUNCTION initializeContext(sessionId, userId, userInput, emit) -> InitResult:
    -- Check what knowledge is already loaded
    existingKnowledge = getExistingKnowledge(sessionId)

    -- Run GPT-4o-mini to select needed sources
    selection = runInitializerAgent(sessionId, userInput, existingKnowledge)

    newSources = selection.append_knowledge.MAP(k -> k.source)

    IF newSources is empty:
        RETURN { sources: [], reasoning: selection.reasoning }

    -- Fetch new data sources in parallel
    results = fetchMultipleDataSources(newSources, userId, paramsMap)

    -- Append each result as a knowledge event
    FOR EACH result IN results:
        IF NOT result.error:
            logKnowledge(sessionId, result.source, result.formatted)
            emit("knowledge", { source: result.source, displayName: getDisplayName(result.source) })

    RETURN { sources: newSources, reasoning: selection.reasoning, results }
```

### 5.3 Selection Response Schema

The initializer agent returns structured JSON via OpenAI's structured output feature:

```
RECORD InitializerResponse:
    reasoning        : String                      -- brief explanation
    append_knowledge : List<KnowledgeSelection>    -- new sources to add
    use_existing     : List<String>                -- already-loaded sources being used

RECORD KnowledgeSelection:
    source    : String                             -- data source name
    reason    : "not_in_context" | "expand_range" | "refresh_state"
    days_back : Integer | None                     -- for workout_history
```

### 5.4 Append-Only Architecture

The initializer follows append-only rules:

- Knowledge events are **appended** to the session, never replaced
- If a data source exists with sufficient scope, it is **not** re-fetched
- If a data source exists with insufficient scope (e.g., 14 days of history but user asks about this month), a **new** knowledge event with expanded parameters is appended
- The main agent sees both old and new knowledge events and uses the combined information

### 5.5 Task-to-Data Mapping

| Task Type | Required Data Sources |
|-----------|----------------------|
| Workout generation | `category_goals`, `muscle_goals`, `active_preferences`, `workout_history` |
| Goal setting | `category_goals`, `muscle_goals` |
| Statistics/progress | `workout_history` (expanded `days_back`), `category_goals` |
| Location queries | `all_locations` |
| Preferences | `active_preferences` |
| General conversation | Minimal -- only if specifically relevant |

---

## 6. Tool System

### 6.1 Tool Registry

All tools are registered in a single `TOOL_REGISTRY` map. Each tool provides:

```
RECORD ToolDefinition:
    description    : String              -- human-readable description
    parameters     : JsonSchema          -- JSON Schema for input validation
    statusMessage  : StatusMessage | None  -- UI progress messages
    execute        : Function(args, context) -> ToolResult
    formatResult   : Function(result) -> String   -- format result for event stream

RECORD StatusMessage:
    start : String    -- shown when tool begins (e.g., "Creating your workout...")
    done  : String    -- shown when tool completes (e.g., "Workout ready")

RECORD ExecutionContext:
    userId    : String    -- authenticated user UUID
    sessionId : String    -- current session UUID
```

### 6.2 Tool Execution

```
FUNCTION executeTool(toolName: String, args: Dict, context: ExecutionContext) -> ToolOutput:
    tool = TOOL_REGISTRY[toolName]
    IF tool is NONE:
        RAISE "Unknown tool: {toolName}"

    result = AWAIT tool.execute(args, context)
    rawFormatted = tool.formatResult(result)
    formatted = wrapInXml(rawFormatted, isError = NOT result.success)

    RETURN { result, formatted, rawFormatted }
```

### 6.3 Communication Tools

#### message_notify_user

Send a message to the user. Optionally delivers an artifact.

```
TOOL message_notify_user:
    description: "Send a message to the user without expecting a response"
    parameters:
        message      : String (required)     -- the message text
        artifact_id  : String (optional)     -- ID of artifact to deliver
    returns: { success, message, artifact?, artifact_id? }
    errors: artifact not found (non-fatal, warning included)
```

The `message_notify_user` tool has no status message -- it **is** the message to the user.

#### message_ask_user

Ask the user a question and pause the loop.

```
TOOL message_ask_user:
    description: "Ask the user a question and wait for their response"
    parameters:
        question : String (required)         -- the question text
        options  : List<String> (optional)   -- suggested response options
    returns: { success, question, options, awaiting_response: true }
    errors: none
```

Calling this tool **terminates the current loop iteration**. The next user message continues the session.

#### idle

Signal task completion.

```
TOOL idle:
    description: "Signal that all tasks are complete"
    parameters:
        reason : String (required)           -- why the agent is going idle
    returns: { success, idle: true, reason }
    errors: none
```

Calling this tool **terminates the loop**. The agent must always call `message_notify_user` to deliver results before calling `idle`.

### 6.4 Exercise Management Tools

#### generate_workout

Create a structured workout artifact.

```
TOOL generate_workout:
    description: "Generate a workout with exercises. Creates an artifact."
    parameters:
        workout : WorkoutPayload (required)
    returns: { success, artifact_id, exercise_count, summary }
    errors: invalid workout format
```

**Critical workflow:** After `generate_workout` returns an `artifact_id`, the agent **must** call `message_notify_user` with that `artifact_id` to deliver the workout to the user. If this step is skipped, the user sees no workout.

The formatted result explicitly reminds the agent: `"IMPORTANT: You MUST now call message_notify_user with artifact_id=..."`.

**In-memory state:** Generated exercises are stored in a `Map<sessionId, WorkoutSession>` for subsequent swap/adjust/remove operations.

#### Exercise Types

The system supports exactly 4 exercise types:

```
ENUM ExerciseType:
    REPS        -- set/rep based (strength, bodyweight)
    HOLD        -- isometric (planks, wall sits, static stretches)
    DURATION    -- continuous effort (running, cycling, yoga)
    INTERVALS   -- work/rest cycles (HIIT, tabata)
```

| Type | Required Fields | Optional Fields |
|------|----------------|-----------------|
| `reps` | `sets`, `reps[]`, `rest_sec` | `load_each[]`, `load_unit` |
| `hold` | `sets`, `hold_sec[]`, `rest_sec` | -- |
| `duration` | `duration_min` | `distance`, `distance_unit`, `target_pace` |
| `intervals` | `rounds`, `work_sec`, `rest_sec` | -- |

Every exercise must include:

| Field | Type | Description |
|-------|------|-------------|
| `exercise_name` | String | Name of the exercise |
| `exercise_type` | ExerciseType | One of `reps`, `hold`, `duration`, `intervals` |
| `order` | Integer | Position in workout (1-indexed) |
| `muscles_utilized` | List<MuscleShare> | Muscles worked; shares sum to ~1.0 |
| `goals_addressed` | List<GoalShare> | Goals addressed; shares sum to ~1.0 |
| `reasoning` | String | Brief explanation for selecting this exercise |

```
RECORD MuscleShare:
    muscle : ValidMuscle    -- one of 16 preset muscles
    share  : Float          -- 0.0 to 1.0, all shares sum to ~1.0

RECORD GoalShare:
    goal   : String         -- goal category (e.g., "strength", "endurance")
    share  : Float          -- 0.0 to 1.0, all shares sum to ~1.0
```

**Valid muscles (16):** Chest, Back, Shoulders, Biceps, Triceps, Abs, Lower Back, Quadriceps, Hamstrings, Glutes, Calves, Trapezius, Abductors, Adductors, Forearms, Neck.

#### Exercise Grouping

Exercises may be grouped for circuits, supersets, etc. using an optional `group` field:

```
RECORD ExerciseGroup:
    id                      : String    -- unique group identifier (e.g., "superset-1")
    type                    : GroupType  -- how to execute the group
    position                : Integer   -- order within group (1-indexed)
    name                    : String | None  -- display name (first exercise only)
    rounds                  : Integer | None -- repeat count (first exercise only)
    rest_between_rounds_sec : Integer | None -- rest after completing group
```

```
ENUM GroupType:
    CIRCUIT       -- cycle through exercises sequentially
    SUPERSET      -- paired exercises with no rest between
    GIANT_SET     -- 3+ exercises performed back-to-back
    WARMUP        -- warmup grouping
    COOLDOWN      -- cooldown grouping
    SEQUENCE      -- ordered sequence
```

#### swap_exercise

```
TOOL swap_exercise:
    description: "Replace an exercise in the current workout"
    parameters:
        exercise_id  : String (required)    -- UUID or order number (e.g., "1")
        new_exercise : ExerciseObject (required) -- full replacement exercise
        reason       : String (optional)
    returns: { success, old_exercise, new_exercise, new_id }
    errors: no active workout, exercise not found
```

#### adjust_exercise

```
TOOL adjust_exercise:
    description: "Modify parameters of an existing exercise"
    parameters:
        exercise_id : String (required)     -- UUID or order number
        adjustments : Dict (required)       -- fields to update
    returns: { success, exercise_name, adjustments, old_values }
    errors: no active workout, exercise not found
```

The `id` and `type` fields are protected and cannot be changed via adjustments.

#### remove_exercise

```
TOOL remove_exercise:
    description: "Remove an exercise from the current workout"
    parameters:
        exercise_id : String (required)     -- UUID or order number
        reason      : String (optional)
    returns: { success, removed_exercise, remaining_count }
    errors: no active workout, exercise not found
```

#### log_workout

```
TOOL log_workout:
    description: "Log completed exercises to history"
    parameters:
        completed_exercises : List<CompletedExercise> (required)
        workout_notes       : String (optional)
    returns: { success, logged_count, total_in_workout }
    errors: no active workout
```

Logging a workout clears the in-memory workout session for that `sessionId`.

### 6.5 Data Tools

#### fetch_data

```
TOOL fetch_data:
    description: "Fetch additional data sources into context"
    parameters:
        sources : List<DataSourceName> (required)
        params  : Dict (optional)          -- per-source parameters
    returns: { success, data: Map<source, formatted_string> }
    errors: unknown source, fetch failure
```

Available source names: `user_profile`, `category_goals`, `muscle_goals`, `active_preferences`, `workout_history`, `exercise_distribution`, `user_settings`, `all_locations`.

### 6.6 Location Tools

#### set_current_location

```
TOOL set_current_location:
    description: "Switch the user's active workout location"
    parameters:
        location_id   : String (optional)   -- UUID of location (preferred)
        location_name : String (optional)   -- name fallback (case-insensitive)
    returns: { success, location: { id, name, description, equipment_count, equipment_summary } }
    errors: location not found, multiple matches, database error
```

At least one of `location_id` or `location_name` must be provided. The tool clears `current_location` on all user locations and sets it on the target.

### 6.7 Tool Status Messages

Each tool may define a `statusMessage` with `start` and `done` phases for real-time UI feedback:

| Tool | Start Message | Done Message |
|------|--------------|-------------|
| `generate_workout` | "Creating your workout..." | "Workout ready" |
| `swap_exercise` | "Finding alternative..." | "Exercise swapped" |
| `adjust_exercise` | "Adjusting exercise..." | "Exercise updated" |
| `remove_exercise` | "Removing exercise..." | "Exercise removed" |
| `log_workout` | "Saving your workout..." | "Workout logged" |
| `fetch_data` | "Gathering your info..." | "Context ready" |
| `set_current_location` | "Switching location..." | "Location updated" |
| `idle` | "Wrapping up..." | "All done" |
| `message_notify_user` | (none) | (none) |
| `message_ask_user` | (none) | (none) |

---

## 7. Session and Event Model

### 7.1 Database Schema

#### agent_sessions

```
RECORD AgentSession:
    id                      : UUID (PK, auto-generated)
    user_id                 : UUID (FK → auth.users)
    created_at              : Timestamp
    updated_at              : Timestamp
    context_start_sequence  : Integer = 0    -- checkpointing offset
    total_tokens            : Integer = 0
    cached_tokens           : Integer = 0
    total_cost_cents        : Float = 0
    status                  : "active" | "completed" | "error"
    metadata                : Dict = {}      -- flexible storage
```

#### agent_session_events

```
RECORD AgentSessionEvent:
    id              : UUID (PK, auto-generated)
    session_id      : UUID (FK → agent_sessions)
    sequence_number : Integer              -- chronological ordering
    event_type      : EventType
    timestamp       : Timestamp
    duration_ms     : Integer | None
    data            : Dict                 -- event-specific payload
    -- UNIQUE(session_id, sequence_number)
```

### 7.2 Event Types

```
ENUM EventType:
    USER_MESSAGE    -- user input (used for context)
    LLM_REQUEST     -- prompt sent to LLM (observability only)
    LLM_RESPONSE    -- LLM response with tokens/cost (observability only)
    TOOL_CALL       -- tool invocation (used for context)
    TOOL_RESULT     -- tool execution result (used for context)
    KNOWLEDGE       -- injected data from initializer (used for context)
    ERROR           -- any error that occurred
    ARTIFACT        -- structured output for client delivery
```

### 7.3 Event Data Structures

| Event Type | Data Shape |
|------------|-----------|
| `user_message` | `{ message: String }` |
| `llm_request` | `{ model: String, prompt: String, estimated_tokens: Integer }` |
| `llm_response` | `{ raw_response: Dict, tokens: TokenUsage, cost_cents: Float }` |
| `tool_call` | `{ tool_name: String, arguments: Dict, call_id: String }` |
| `tool_result` | `{ tool_name: String, result: Any, success: Boolean, call_id: String }` |
| `knowledge` | `{ source: String, data: String }` |
| `error` | `{ message: String, stack: String | None, context: String | None }` |
| `artifact` | `{ artifact_id: String, type: String, schema_version: String, title: String, summary: Dict, auto_start: Boolean, payload: Dict }` |

```
RECORD TokenUsage:
    prompt      : Integer
    completion  : Integer
    cached      : Integer
    cache_write : Integer
    total       : Integer
```

### 7.4 Context Events vs Observability Events

Only certain event types are included when building the LLM context:

| Event Type | Included in Context | Purpose |
|------------|-------------------|---------|
| `user_message` | yes | User's messages |
| `tool_call` | yes | Agent's actions |
| `tool_result` | yes | Action outcomes |
| `knowledge` | yes | Injected data |
| `artifact` | yes | Created artifacts |
| `llm_request` | no | Observability only |
| `llm_response` | no | Observability only |
| `error` | no | Observability only |

### 7.5 Sequence Number Management

Events within a session are ordered by `sequence_number` with a `UNIQUE(session_id, sequence_number)` constraint. The next sequence is determined by querying the maximum existing sequence and incrementing by 1. Race conditions are handled with up to 5 retries on duplicate key errors (PostgreSQL error code `23505`), with random backoff between retries.

### 7.6 Session Lifecycle

```
Session States:
ACTIVE -> COMPLETED     -- normal completion via endSession()
ACTIVE -> ERROR         -- fatal error during agent loop
```

On session end, the system aggregates all `llm_response` events to compute totals (total tokens, cached tokens, cost) and updates the session record.

### 7.7 Row-Level Security

Both tables have RLS enabled:

- Users can SELECT/INSERT/UPDATE their own sessions
- Users can SELECT/INSERT events in their own sessions (via join to `agent_sessions.user_id`)
- Service role has full access to both tables

### 7.8 Database Views

**`agent_session_summaries`:** Session data with event counts (messages, LLM calls, tool calls, errors, artifacts).

**`agent_daily_metrics`:** Aggregated daily usage per user (session count, token totals, costs).

---

## 8. Streaming Protocol

### 8.1 Transport

The streaming endpoint (`POST /agent/stream`) uses Server-Sent Events (SSE). The response uses `Content-Type: text/event-stream` with `Cache-Control: no-cache` and `Connection: keep-alive`.

Each event is written as: `data: {JSON}\n\n`

### 8.2 Event Types

```
ENUM SSEEventType:
    STATUS       -- progress indicator
    TOOL_START   -- tool execution begins (type = tool name)
    TOOL_RESULT  -- tool completes (type = tool name)
    KNOWLEDGE    -- data source loaded
    DONE         -- session complete
    ERROR        -- error occurred
```

### 8.3 Event Shapes

**status:**
```
{
    type: "status",
    data: { message: String, tool: String, phase: "start" | "done" | "error" }
}
```

**tool_start** (type is the tool name, e.g., `"generate_workout"`):
```
{
    type: "<tool_name>",
    data: { status: "running", args: Dict }
}
```

**tool_result** (type is the tool name):
```
{
    type: "<tool_name>",
    data: ToolResult,
    formatted: String,
    status: "done" | "failed",
    artifact?: ArtifactData,        -- included when message_notify_user delivers an artifact
    artifact_id?: String
}
```

**knowledge:**
```
{
    type: "knowledge",
    data: { source: String, displayName: String, status: "done" }
}
```

**done:**
```
{
    type: "done",
    sessionId: String
}
```

**error:**
```
{
    type: "error",
    message: String
}
```

### 8.4 Client Disconnect Handling

The server monitors `req.on('close')` to detect client disconnects. If the client disconnects, SSE writes are silently skipped (the agent loop continues to completion but events are not sent).

---

## 9. Data Sources

### 9.1 Data Source Registry

Each data source has a fetch function, formatter, and description:

```
RECORD DataSource:
    description : String
    fetch       : Function(userId, params) -> Any
    format      : Function(rawData) -> String
```

### 9.2 Available Sources

| Source Name | Description | Database Table(s) | Parameters |
|-------------|------------|-------------------|------------|
| `user_profile` | Body stats and profile | `app_user`, `trainer_measurements` | -- |
| `workout_history` | Recent workout history | `workout_history` | `limit` (default 10), `days_back` |
| `user_settings` | App settings and preferences | `user_settings` | -- |
| `all_locations` | All locations with equipment | `user_locations` | -- |

### 9.3 Stable Prefix Data

Three sources are fetched on **every** context build (not via the initializer agent) to populate the user data XML:

1. `user_profile` -- body stats
2. `user_settings` -- unit preferences
3. `all_locations` -- current location with equipment

These form the stable "user data" section of the prompt that is cached via breakpoint 3.

---

## 10. Authentication and API

### 10.1 Authentication Flow

```
FUNCTION authenticateToken(req, res, next):
    token = req.headers["authorization"].split(" ")[1]    -- Bearer TOKEN
    IF token is NONE:
        RETURN 401 "Access token required"

    claims = supabase.auth.getClaims(token)
    IF claims is NONE or error:
        RETURN 401 "Invalid token"

    req.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role
    }
    next()
```

All agent endpoints require authentication via this middleware.

### 10.2 API Endpoints

All endpoints are prefixed with `/agent` and require a valid `Authorization: Bearer <token>` header.

#### POST /agent/chat

Non-streaming chat endpoint.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | String | yes | User's message |
| `sessionId` | String | no | Existing session to continue |
| `currentWorkout` | Dict | no | Current workout state from client |
| `model` | String | no | Model override (default: `PRIMARY_MODEL`) |

**Response:** `{ sessionId: String, response: ClientResponse, iterations: Integer }`

```
RECORD ClientResponse:
    messages  : List<String>           -- agent messages to display
    exercises : List<Exercise> | None  -- generated exercises (if any)
    question  : Question | None        -- pending question (if any)
```

#### POST /agent/stream

Streaming chat endpoint. Same request body as `/agent/chat`. Returns SSE event stream (see Section 8).

#### GET /agent/sessions

List user's sessions.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `limit` | Integer | 10 | Max sessions to return |

**Response:** `{ sessions: List<AgentSession> }`

#### GET /agent/sessions/:id

Get session state with recent actions.

**Response:** `{ session: AgentSession, recentActions: List<Event> }`

#### POST /agent/sessions

Create a new session.

**Response:** `{ session: AgentSession }`

---

## 11. Cost Tracking and Observability

### 11.1 Cost Calculation

Cost is calculated per LLM response using model-specific pricing:

```
FUNCTION calculateCostCents(model, promptTokens, completionTokens, cacheInfo) -> Float:
    pricing = MODEL_REGISTRY[model].pricing
    promptCost = (promptTokens / 1_000_000) * pricing.prompt
    completionCost = (completionTokens / 1_000_000) * pricing.completion

    -- Anthropic cache tokens
    IF cacheInfo has cache_read_input_tokens:
        cachedCost = (cacheInfo.cache_read_input_tokens / 1_000_000) * pricing.cached_prompt
        -- Subtract cached tokens from prompt cost (they're already counted)
        promptCost = ((promptTokens - cacheInfo.cache_read_input_tokens) / 1_000_000) * pricing.prompt
        totalCost = promptCost + completionCost + cachedCost

    RETURN totalCost * 100    -- convert to cents
```

### 11.2 Session-Level Aggregation

When a session ends, all `llm_response` events are aggregated:

- `total_tokens` -- sum of all token usage
- `cached_tokens` -- sum of cache-read tokens
- `total_cost_cents` -- sum of per-request costs
- `cache_hit_rate` -- `cached_tokens / (prompt_tokens + cached_tokens) * 100`

### 11.3 Console Logging

All events are logged to the console with structured formatting:

```
TIMESTAMP [SESSION_ID] ICON Event Type ← details
```

Example output:
```
14:32:01.123 [a1b2c3d4] 👤 User: "Give me a chest workout"
14:32:01.456 [a1b2c3d4] 📤 LLM Request → claude-haiku-4-5  est. 2.1K tokens
14:32:02.789 [a1b2c3d4] 📥 LLM Response ← (empty)  3.2K tokens (2.8K cached) | $0.0012 | 1.3s
14:32:02.890 [a1b2c3d4] 🔧 Tool Call → generate_workout  {"workout":{"exercises":[...
14:32:03.012 [a1b2c3d4] 🔧 Tool Result ← generate_workout: ✓  112ms
14:32:03.145 [a1b2c3d4] 📦 Artifact ← exercise_list  "Chest & Triceps Session"
```

### 11.4 Token Estimation

Before each LLM call, token count is estimated using a rough heuristic: `total_characters / 4`.

---

## 12. Definition of Done

### 12.1 Agent Loop

- [ ] Agent loop receives user message and returns structured result with `sessionId`, `actions`, and `iterations`
- [ ] Loop terminates when agent calls `idle` tool
- [ ] Loop terminates when agent calls `message_ask_user` tool
- [ ] Loop terminates when `MAX_ITERATIONS` (10) is reached
- [ ] Loop terminates when LLM response contains no tool call
- [ ] Each iteration calls the LLM exactly once and executes exactly one tool
- [ ] `tool_choice` is set to `{ type: "any" }` forcing tool use
- [ ] LLM errors propagate to the caller after logging
- [ ] Tool execution errors are logged but do not terminate the loop
- [ ] Session status is set to `completed` on normal exit and `error` on failure

### 12.2 Context Building

- [ ] Events are converted to Anthropic native multi-turn format
- [ ] Every `tool_use` message from the assistant is immediately followed by a `tool_result` in the next user message
- [ ] Consecutive user messages are merged into a single message
- [ ] Knowledge and artifact events are buffered when a tool_result is pending, then appended after it
- [ ] Cache breakpoint 1: `cache_control` on last tool definition
- [ ] Cache breakpoint 2: `cache_control` on system prompt text block
- [ ] Cache breakpoint 3: `cache_control` on user data XML text block
- [ ] Cache breakpoint 4: `cache_control` on last content block of last message
- [ ] User data XML is freshly fetched from `user_profile`, `user_settings`, `all_locations` on every build
- [ ] Empty event list throws an error ("Cannot build context: no events in session")

### 12.3 Initializer Agent

- [ ] Runs GPT-4o-mini with structured output (JSON Schema response format)
- [ ] Receives user message and list of already-loaded knowledge sources
- [ ] Returns `append_knowledge` array with source names and reasons
- [ ] Fetches selected data sources in parallel
- [ ] Logs each fetched source as a `knowledge` event in the session
- [ ] Emits `knowledge` SSE events for real-time UI feedback
- [ ] Follows append-only rules: never replaces existing knowledge
- [ ] Errors in the initializer do not prevent the main agent from running

### 12.4 Tool System

- [ ] Tool registry combines communication, exercise, data, and location tools
- [ ] Unknown tool name raises an error
- [ ] Each tool result is wrapped in XML tags for the event stream
- [ ] `generate_workout` returns an `artifact_id` and stores exercises in memory
- [ ] `generate_workout` formatted result instructs agent to call `message_notify_user` with the `artifact_id`
- [ ] `message_notify_user` with `artifact_id` resolves and includes the artifact payload
- [ ] `swap_exercise`, `adjust_exercise`, `remove_exercise` accept both UUID and order number as `exercise_id`
- [ ] `adjust_exercise` prevents changing `id` and `type` fields
- [ ] `log_workout` clears the in-memory workout session
- [ ] `set_current_location` clears all `current_location` flags before setting the target
- [ ] `fetch_data` fetches multiple sources in parallel

### 12.5 Session and Events

- [ ] Sessions are created with status `active` and a default `context_start_sequence` of 0
- [ ] `getOrCreateSession` returns the most recent active session or creates a new one
- [ ] Events are ordered by `sequence_number` with a `UNIQUE(session_id, sequence_number)` constraint
- [ ] Sequence number race conditions are retried up to 5 times with random backoff
- [ ] `endSession` aggregates token usage and cost from all `llm_response` events
- [ ] Context events query filters to only `user_message`, `tool_call`, `tool_result`, `knowledge`, `artifact`
- [ ] Artifacts are retrievable by `artifact_id` within a session
- [ ] RLS policies restrict users to their own sessions and events

### 12.6 Streaming

- [ ] SSE response uses `Content-Type: text/event-stream`
- [ ] `status` events are emitted for tool start/done phases
- [ ] `tool_start` events include the tool name and arguments
- [ ] `tool_result` events include the result data and formatted string
- [ ] `message_notify_user` results with artifacts include the artifact payload in the SSE event
- [ ] `knowledge` events are emitted as data sources are loaded
- [ ] `done` event is sent with `sessionId` on completion
- [ ] `error` event is sent on unrecoverable errors
- [ ] Client disconnect is detected and SSE writes are silently skipped

### 12.7 Authentication and API

- [ ] All `/agent/*` endpoints require `Authorization: Bearer <token>` header
- [ ] Token is verified via `supabase.auth.getClaims()`
- [ ] Missing token returns 401
- [ ] Invalid/expired token returns 401
- [ ] `req.user.id` is set to `claims.sub` for downstream use
- [ ] `POST /agent/chat` validates that `message` is present (400 if missing)
- [ ] `POST /agent/stream` validates that `message` is present (400 if missing)

### 12.8 Cross-Feature Parity Matrix

| Test Case | Haiku 4.5 | Sonnet 4.5 | Opus 4.5 |
|-----------|-----------|------------|----------|
| Simple message → notify → idle cycle | [ ] | [ ] | [ ] |
| Workout generation → artifact delivery | [ ] | [ ] | [ ] |
| Multi-turn with swap/adjust/remove | [ ] | [ ] | [ ] |
| Context initialization selects correct data | [ ] | [ ] | [ ] |
| Cache hit rate > 50% on second iteration | [ ] | [ ] | [ ] |
| Streaming events arrive in correct order | [ ] | [ ] | [ ] |

### 12.9 Integration Smoke Test

```
-- 1. Setup: Create session and send a workout request
userId = "test-user-uuid"
session = createSession(userId)
ASSERT session.status == "active"

-- 2. Run agent loop with a workout generation request
result = runAgentLoop(userId, "Give me a quick chest workout", {
    sessionId: session.id,
    model: "claude-haiku-4-5"
})
ASSERT result.sessionId == session.id
ASSERT result.iterations >= 2          -- at least: generate_workout + message_notify_user
ASSERT result.iterations <= 10         -- within safety limit

-- 3. Verify tool execution sequence
toolNames = result.actions.MAP(a -> a.tool)
-- Agent should have generated a workout and notified user
ASSERT "generate_workout" IN toolNames
ASSERT "message_notify_user" IN toolNames
-- notify_user should come AFTER generate_workout
genIndex = toolNames.INDEX_OF("generate_workout")
notifyIndex = toolNames.INDEX_OF("message_notify_user")
ASSERT notifyIndex > genIndex

-- 4. Verify artifact delivery
genAction = result.actions.FIND(a -> a.tool == "generate_workout")
ASSERT genAction.result.success == true
ASSERT genAction.result.artifact_id STARTS_WITH "art_"
notifyAction = result.actions.FIND(a -> a.tool == "message_notify_user")
ASSERT notifyAction.result.artifact_id == genAction.result.artifact_id
ASSERT notifyAction.result.artifact is not NONE

-- 5. Verify session events were logged
events = getSessionTimeline(session.id)
eventTypes = events.MAP(e -> e.event_type)
ASSERT "user_message" IN eventTypes
ASSERT "tool_call" IN eventTypes
ASSERT "tool_result" IN eventTypes
ASSERT "artifact" IN eventTypes
ASSERT "llm_request" IN eventTypes
ASSERT "llm_response" IN eventTypes

-- 6. Verify session completion
finalSession = getSession(session.id)
ASSERT finalSession.status == "completed"
ASSERT finalSession.total_tokens > 0
ASSERT finalSession.total_cost_cents > 0

-- 7. Verify exercise structure in artifact
artifact = getArtifact(session.id, genAction.result.artifact_id)
ASSERT artifact.type == "exercise_list"
ASSERT LENGTH(artifact.payload.exercises) > 0
firstExercise = artifact.payload.exercises[0]
ASSERT firstExercise.exercise_name is not NONE
ASSERT firstExercise.exercise_type IN ["reps", "hold", "duration", "intervals"]
ASSERT LENGTH(firstExercise.muscles_utilized) > 0
ASSERT LENGTH(firstExercise.goals_addressed) > 0

-- 8. Verify streaming events (if using stream endpoint)
sseEvents = []
runAgentLoop(userId, "Show me a leg workout", {
    sessionId: session.id,
    onEvent: (event) -> sseEvents.APPEND(event)
})
ASSERT ANY(sseEvents, e -> e.type == "tool_start")
ASSERT ANY(sseEvents, e -> e.type == "tool_result")
```

---

## Appendix A: System Prompt Reference

The complete system prompt is defined in `contextBuilder.service.js` and contains the following XML-tagged sections:

| Section | Purpose |
|---------|---------|
| `<agent_loop>` | Describes the iterative tool-use cycle |
| `<knowledge_injection>` | Explains the initializer agent and data injection |
| `<event_stream>` | Documents the event types the agent will see |
| `<message_rules>` | Rules for communicating with users |
| `<tool_use_rules>` | Constraints on tool usage (one per iteration, no plain text) |
| `<exercise_types>` | The 4-type exercise system with required fields |
| `<exercise_recommendation_rules>` | Priority hierarchy for exercise selection |
| `<artifact_rules>` | Critical workflow for artifact creation and delivery |
| `<available_tools>` | Complete tool reference with examples |
| `<response_format>` | Expected JSON response format |

---

## Appendix B: Design Decision Rationale

**Why force tool use with `tool_choice: { type: "any" }`?** Plain text responses from the agent would bypass the structured event stream and break the loop's ability to track actions. Forcing tool use ensures every agent action is logged, observable, and produces a predictable data structure. The `message_notify_user` and `message_ask_user` tools serve as the controlled channel for user-facing text.

**Why a separate initializer agent (GPT-4o-mini) instead of letting the main agent fetch its own data?** The initializer runs before the main agent sees the request, so the main agent's first iteration already has all necessary context. Without this, the main agent would spend its first iteration calling `fetch_data`, adding a full LLM round-trip. GPT-4o-mini is fast and cheap -- it makes the data selection decision in ~200ms at negligible cost, saving a full Claude API call.

**Why append-only knowledge instead of replacing stale data?** Replacing knowledge events would invalidate the KV-cache prefix, forcing a full re-computation of all prior context. Appending preserves the cache. The main agent sees both old and new versions and uses the most recent data naturally.

**Why XML for user data and knowledge events?** XML tags provide clear semantic boundaries that LLMs parse reliably. The `<user_data>`, `<knowledge>`, and `<artifact>` tags are unambiguous delimiters that don't conflict with natural language content. XML also compresses well in token encoding.

**Why in-memory workout storage instead of database?** The workout session (exercises being edited) is transient -- it only matters during the active conversation. Storing it in a `Map<sessionId, WorkoutSession>` avoids database round-trips for rapid swap/adjust/remove operations. The trade-off is that server restarts lose active workout state, which is acceptable since users can regenerate workouts.

**Why 4 cache breakpoints instead of 1 or 2?** Each breakpoint allows a different stability tier. Tools and system prompt are stable across all sessions (breakpoints 1-2). User data changes only when the user's profile changes (breakpoint 3). Messages grow each iteration (breakpoint 4). This layered approach maximizes cache reuse at each tier.

**Why `sequence_number` with retry logic instead of database-generated sequences?** Application-level sequence numbers allow the context builder to fetch events starting from any arbitrary sequence (via `context_start_sequence`), enabling future checkpointing. The retry logic handles the rare case of concurrent event inserts within the same session.
