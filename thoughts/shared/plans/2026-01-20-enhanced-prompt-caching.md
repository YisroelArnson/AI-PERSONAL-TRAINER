# Enhanced Prompt Caching Implementation Plan

## Overview

Enhance the existing Anthropic prompt caching implementation to use proper multi-turn message format with dynamic cache marker placement, maximizing cache hit rates for agentic event streams.

## Current State Analysis

The current implementation has a solid foundation:
- Tool definitions are cached via `cache_control` on the last tool
- Message content is split into `cacheablePrefix` (cached) and `newContent` (not cached)
- Stable prefix is cached across iterations within the same agent loop
- Cache metrics (read/write tokens) are tracked and costed correctly

### Current Architecture
```
┌─────────────────────────────────────────────────────────────┐
│ Single User Message                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Block 1: cacheablePrefix (cache_control: ephemeral)     │ │
│ │ - System Prompt                                         │ │
│ │ - User Data XML                                         │ │
│ │ - <event_stream> + all events                           │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Block 2: newContent                                     │ │
│ │ - </event_stream> closing tag only                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Limitations
1. **Single-message format** - All content in one `user` message instead of multi-turn
2. **Static cache boundary** - Cache marker doesn't move forward with event growth
3. **No automatic compression** - Long conversations aren't summarized

## Desired End State

Implement proper multi-turn message format with **clear separation between historical and new messages**:

```
┌─────────────────────────────────────────────────────────────┐
│ Tools Array (cache_control on last tool - already done)     │
├─────────────────────────────────────────────────────────────┤
│ Messages Array                                              │
│                                                             │
│ ══════════════ HISTORICAL (CACHED) ══════════════          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ User: System prompt + user data (stable)                │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ User: Initial user message + knowledge from turn 1      │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Assistant: Tool use (message_notify_user)               │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ User: Tool result                                       │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Assistant: Tool use (generate_workout)                  │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ User: Tool result  ←── cache_control: ephemeral HERE    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ ══════════════ NEW THIS TURN (UNCACHED) ══════════════     │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ User: New knowledge injection (workout_history)         │ │
│ │       + current_workout_session injection               │ │
│ │       + new user message (if any)                       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Insight: Historical vs New

Each turn can have **multiple new events**:
- New knowledge injections from the initializer agent
- Current workout session state (injected from client)
- New user message
- Artifacts created this turn

The cache marker must be placed on the **last message from the previous iteration**, not on any content added this turn. This ensures:

1. **Iteration 1**: Cache marker on system context (no history yet)
2. **Iteration 2**: Cache marker on the tool_result from iteration 1's tool call
3. **Iteration N**: Cache marker moves forward to include all of iteration N-1's events

### Verification
- Cache read tokens should increase significantly on iterations 2+
- First request: ~0 cache read, high cache write (system + user data + initial events)
- Subsequent requests: High cache read, low cache write (only new knowledge + user message)
- Console logs show cache hit percentages > 80% after first iteration

## What We're NOT Doing

1. **Not changing OpenAI/OpenRouter paths** - Those use single-message format; focus on Anthropic
2. **Not implementing auto-compression yet** - That's a separate feature for very long sessions
3. **Not changing the event stream format** - XML event format works well, just changing message structure
4. **Not modifying tool definitions** - Current tool caching approach is optimal

## Implementation Approach

The key insight is that we already have `sequence_number` on every event in `agent_session_events`. We can simply store the **cache boundary sequence** (the last sequence number included in the cache) and use that to split events into historical vs new.

**Simplified approach using existing DB schema:**
1. Store `cache_boundary_sequence` in the `llm_response` event's data field
2. On each API call, query the last `llm_response` to get the boundary
3. Events with `sequence_number <= cache_boundary_sequence` are historical (cached)
4. Events with `sequence_number > cache_boundary_sequence` are new (uncached)
5. After successful response, the new `llm_response` event stores the updated boundary

This is cleaner because:
- **Persists across requests** - even if the agent loop restarts, we know where the cache was
- **No in-memory tracking needed** - just query the DB
- **Uses existing infrastructure** - no schema changes required

---

## Phase 1: Multi-Turn Message Builder with Sequence-Based Separation

### Overview
Refactor `contextBuilder.service.js` to build proper multi-turn messages, using the event `sequence_number` to determine what's historical (cached) vs new (uncached).

### Changes Required:

#### 1. Get Cache Boundary from Last LLM Response
**File**: `BACKEND/services/sessionObservability.service.js`
**Changes**: Add function to retrieve the last cache boundary

```javascript
/**
 * Get the cache boundary sequence from the most recent llm_response event
 * This tells us which events are "historical" (already cached) vs "new"
 * @param {string} sessionId - Session UUID
 * @returns {number} The last sequence number that was cached (-1 if no cache yet)
 */
async function getCacheBoundarySequence(sessionId) {
  const { data, error } = await supabase
    .from('agent_session_events')
    .select('data')
    .eq('session_id', sessionId)
    .eq('event_type', 'llm_response')
    .order('sequence_number', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return -1;

  // Return the cache_boundary_sequence stored in the llm_response data
  return data.data?.cache_boundary_sequence ?? -1;
}
```

#### 2. Store Cache Boundary in LLM Response
**File**: `BACKEND/services/sessionObservability.service.js`
**Changes**: Update `logLLMResponse` to store the cache boundary

```javascript
async function logLLMResponse(sessionId, params) {
  const { rawResponse, durationMs, modelId, skipConsole = false, cacheBoundarySequence } = params;

  // ... existing token/cost calculation ...

  return await logEvent(sessionId, 'llm_response', {
    raw_response: rawResponse,
    tokens,
    cost_cents: costCents,
    cache_boundary_sequence: cacheBoundarySequence  // NEW: Store the boundary
  }, { durationMs, modelId: model });
}
```

#### 3. Pass Cache Boundary to Context Builder
**File**: `BACKEND/services/agentLoop.service.js`
**Changes**: Fetch and pass the cache boundary sequence

```javascript
// Before calling buildAgentContext:
const cacheBoundarySequence = await sessionObs.getCacheBoundarySequence(sessionId);

const context = await buildAgentContext(sessionId, userId, {
  stablePrefixCache,
  cacheBoundarySequence  // Events with seq <= this are historical
});

// After successful LLM response, log with the new boundary
await sessionObs.logLLMResponse(sessionId, {
  rawResponse: response,
  durationMs,
  cacheBoundarySequence: context.maxEventSequence  // Update boundary to current max
});
```

#### 4. New Message Builder Function with Sequence-Based Separation
**File**: `BACKEND/services/contextBuilder.service.js`
**Changes**: Add function that splits events by cache boundary sequence

```javascript
/**
 * Convert session events to Anthropic multi-turn message format
 * with clear separation between historical (cacheable) and new (uncached) messages.
 *
 * Uses the cache boundary sequence to determine the split:
 * - Events with sequence_number <= cacheBoundarySequence are HISTORICAL (cached)
 * - Events with sequence_number > cacheBoundarySequence are NEW (uncached)
 *
 * @param {Array} events - Session events from getContextEvents()
 * @param {string} systemContext - Combined system prompt + user data
 * @param {number} cacheBoundarySequence - Last sequence# in the cache (-1 if no cache)
 * @returns {Object} { historicalMessages, newMessages, maxSequence }
 */
function buildMultiTurnMessages(events, systemContext, cacheBoundarySequence = -1) {
  const historicalMessages = [];
  const newMessages = [];
  let maxSequence = -1;

  // System context always goes first in historical (it's stable)
  let currentHistoricalContent = [{
    type: 'text',
    text: systemContext
  }];
  let currentNewContent = [];

  for (const event of events) {
    const eventType = event.event_type;
    const content = event.data || {};
    const sequence = event.sequence_number;

    // Track max sequence for updating cache boundary later
    if (sequence > maxSequence) {
      maxSequence = sequence;
    }

    // Determine if this event is historical (cached) or new (uncached)
    const isHistorical = sequence <= cacheBoundarySequence;

    // Select the appropriate content array and message list
    const currentContent = isHistorical ? currentHistoricalContent : currentNewContent;
    const targetMessages = isHistorical ? historicalMessages : newMessages;

    switch (eventType) {
      case 'user_message':
        currentContent.push({
          type: 'text',
          text: `<user_message>${content.message}</user_message>`
        });
        break;

      case 'knowledge':
        currentContent.push({
          type: 'text',
          text: `<knowledge source="${content.source}">\n${content.data}\n</knowledge>`
        });
        break;

      case 'artifact':
        currentContent.push({
          type: 'text',
          text: `<artifact type="${content.type}" id="${content.artifact_id}">\ntitle: ${content.title}\nsummary: ${JSON.stringify(content.summary)}\n</artifact>`
        });
        break;

      case 'tool_call':
        // Flush pending user content before assistant message
        if (isHistorical && currentHistoricalContent.length > 0) {
          historicalMessages.push({ role: 'user', content: currentHistoricalContent });
          currentHistoricalContent = [];
        } else if (!isHistorical && currentNewContent.length > 0) {
          newMessages.push({ role: 'user', content: currentNewContent });
          currentNewContent = [];
        }

        // Add assistant tool_use message
        targetMessages.push({
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: content.call_id || `call_${Date.now()}`,
            name: content.tool_name,
            input: content.arguments
          }]
        });
        break;

      case 'tool_result':
        // Tool result goes in user message as tool_result block
        currentContent.push({
          type: 'tool_result',
          tool_use_id: content.call_id,
          content: typeof content.result === 'string'
            ? content.result
            : JSON.stringify(content.result)
        });
        break;
    }
  }

  // Flush remaining content
  if (currentHistoricalContent.length > 0) {
    historicalMessages.push({ role: 'user', content: currentHistoricalContent });
  }
  if (currentNewContent.length > 0) {
    newMessages.push({ role: 'user', content: currentNewContent });
  }

  return {
    historicalMessages,  // Cache marker goes on the last message here
    newMessages,         // These are never cached
    maxSequence          // Return so we can update the cache boundary
  };
}
```

#### 5. Update buildAgentContext to Use Cache Boundary
**File**: `BACKEND/services/contextBuilder.service.js`
**Changes**: Accept and use cacheBoundarySequence

```javascript
async function buildAgentContext(sessionId, userId, options = {}) {
  const { stablePrefixCache = null, cacheBoundarySequence = -1 } = options;

  // ... existing code to get session, events, stablePrefix ...

  // Build multi-turn messages with historical/new separation
  const { historicalMessages, newMessages, maxSequence } = buildMultiTurnMessages(
    events,
    stablePrefix,
    cacheBoundarySequence
  );

  return {
    prompt: fullPrompt,           // Keep for OpenAI compatibility
    stablePrefix,
    eventStream,
    session,
    userData,
    eventCount: events.length,
    cacheablePrefix,              // Keep for backward compatibility
    newContent,                   // Keep for backward compatibility
    // NEW: For Anthropic multi-turn with proper caching
    historicalMessages,           // Cache marker goes on last message here
    newMessages,                  // These are never cached
    maxEventSequence: maxSequence // For storing as new cache boundary
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Unit tests pass: `npm test`
- [ ] No lint errors: `npm run lint`
- [ ] `getCacheBoundarySequence()` returns -1 for new sessions
- [ ] `getCacheBoundarySequence()` returns correct value after `logLLMResponse()`

#### Manual Verification:
- [ ] On first request: cacheBoundarySequence is -1, all events go to newMessages
- [ ] After first response: cacheBoundarySequence is stored in llm_response event
- [ ] On second request: events up to boundary go to historicalMessages, new events to newMessages
- [ ] Historical/new split matches expectation based on sequence numbers

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Integrate Cache Boundary in Agent Loop

### Overview
Update the agent loop to fetch the cache boundary from DB, pass it to context builder, and store the new boundary after each LLM response.

### Changes Required:

#### 1. Update Agent Loop to Use DB-Stored Cache Boundary
**File**: `BACKEND/services/agentLoop.service.js`
**Changes**: Fetch cache boundary before each iteration, store after response

```javascript
async function runAgentLoop(userId, userInput, options = {}) {
  // ... existing setup code ...

  let iteration = 0;
  let shouldContinue = true;
  const actions = [];
  let totalDurationMs = 0;
  let stablePrefixCache = null;

  while (shouldContinue && iteration < MAX_ITERATIONS) {
    iteration++;

    // Get cache boundary from the last LLM response in this session
    // This persists even if the agent loop restarts
    const cacheBoundarySequence = await sessionObs.getCacheBoundarySequence(sessionId);

    // Build context with cache boundary
    const context = await buildAgentContext(sessionId, userId, {
      stablePrefixCache,
      cacheBoundarySequence
    });

    // Store stablePrefix on first iteration
    if (!stablePrefixCache) {
      stablePrefixCache = context.stablePrefix;
    }

    // Debug logging
    console.log(`[CACHE DEBUG] Iteration ${iteration}:`);
    console.log(`[CACHE DEBUG]   cacheBoundarySequence: ${cacheBoundarySequence}`);
    console.log(`[CACHE DEBUG]   maxEventSequence: ${context.maxEventSequence}`);
    console.log(`[CACHE DEBUG]   Historical: ${context.historicalMessages?.length || 0} messages`);
    console.log(`[CACHE DEBUG]   New: ${context.newMessages?.length || 0} messages`);

    // ... LLM call code ...

    const response = await callModel(activeModel, context);
    const durationMs = Date.now() - startTime;

    // Log cache metrics from response
    if (response.usage) {
      const cacheRead = response.usage.cache_read_input_tokens || 0;
      const cacheWrite = response.usage.cache_creation_input_tokens || 0;
      const total = response.usage.prompt_tokens || 0;
      console.log(`[CACHE DEBUG]   Cache: ${cacheRead} read, ${cacheWrite} write`);
    }

    // Log LLM response WITH the new cache boundary
    // This stores maxEventSequence so the next iteration knows what's cached
    await sessionObs.logLLMResponse(sessionId, {
      rawResponse: response,
      durationMs,
      cacheBoundarySequence: context.maxEventSequence  // NEW: Store boundary
    });

    // ... rest of tool execution code ...
  }
}
```

#### 2. Add Cache Marker in callModel
**File**: `BACKEND/services/agentLoop.service.js`
**Changes**: Place cache_control on last historical message

```javascript
if (providerType === 'anthropic') {
  const tools = getAnthropicTools();

  // Deep clone to avoid mutating the original
  const historicalMessages = JSON.parse(JSON.stringify(context.historicalMessages || []));
  const newMessages = context.newMessages || [];

  // Add cache_control to the LAST historical message's LAST content block
  // Everything up to here is cached; everything after is new
  if (historicalMessages.length > 0) {
    const lastHistorical = historicalMessages[historicalMessages.length - 1];
    const lastContent = lastHistorical.content;

    if (Array.isArray(lastContent) && lastContent.length > 0) {
      lastContent[lastContent.length - 1].cache_control = { type: 'ephemeral' };
    }
  }

  // Combine: historical (with cache marker) + new (uncached)
  const messages = [...historicalMessages, ...newMessages];

  // Fallback for empty messages (shouldn't happen)
  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: context.prompt }]
    });
  }

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 8192,
    tools: tools,
    tool_choice: { type: 'any' },
    messages: messages
  });

  // ... normalize response ...
}
```

### Success Criteria:

#### Automated Verification:
- [ ] API calls succeed without errors
- [ ] Response contains expected tool_use blocks
- [ ] Cache tokens are reported in response.usage
- [ ] `cache_boundary_sequence` is stored in each llm_response event

#### Manual Verification:
- [ ] Iteration 1: cache_creation_input_tokens is high, cache_read is 0, boundary stored
- [ ] Iteration 2+: cache_read_input_tokens is high (system + prev events cached)
- [ ] New knowledge injections appear in newMessages, not historicalMessages
- [ ] Boundary sequence increases after each successful response

**Implementation Note**: Test by sending a message, checking the llm_response event in DB for `cache_boundary_sequence`, then sending another message and verifying cache hits.

---

## Phase 3: Refactor callModel into Provider-Specific Functions

### Overview
Refactor `callModel()` to cleanly separate Anthropic multi-turn logic from OpenAI single-message logic.

### Changes Required:

#### 1. Extract Provider-Specific Functions
**File**: `BACKEND/services/agentLoop.service.js`
**Changes**: Split `callModel()` into dedicated functions for each provider

```javascript
/**
 * Call Anthropic with multi-turn messages and proper cache marker placement
 */
async function callAnthropicWithMultiTurn(client, modelId, context) {
  const tools = getAnthropicTools();

  // Deep clone historical messages to avoid mutation
  const historicalMessages = JSON.parse(JSON.stringify(context.historicalMessages || []));
  const newMessages = context.newMessages || [];

  // Add cache_control to the LAST historical message's LAST content block
  if (historicalMessages.length > 0) {
    const lastHistorical = historicalMessages[historicalMessages.length - 1];
    const lastContent = lastHistorical.content;

    if (Array.isArray(lastContent) && lastContent.length > 0) {
      lastContent[lastContent.length - 1].cache_control = { type: 'ephemeral' };
    }
  }

  // Combine: historical (with cache marker) + new (uncached)
  const messages = [...historicalMessages, ...newMessages];

  // Fallback for empty messages (shouldn't happen)
  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: context.prompt }]
    });
  }

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 8192,
    tools: tools,
    tool_choice: { type: 'any' },
    messages: messages
  });

  // Extract tool_use block
  const toolUseBlock = response.content.find(block => block.type === 'tool_use');

  // Normalize to common format
  return {
    choices: [{
      message: {
        content: null,
        tool_use: toolUseBlock ? {
          id: toolUseBlock.id,
          name: toolUseBlock.name,
          input: toolUseBlock.input
        } : null
      }
    }],
    usage: {
      prompt_tokens: response.usage?.input_tokens || 0,
      completion_tokens: response.usage?.output_tokens || 0,
      total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      cache_creation_input_tokens: response.usage?.cache_creation_input_tokens || 0,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens || 0
    },
    model: response.model,
    stop_reason: response.stop_reason,
    _provider: 'anthropic',
    _native_tool_use: true
  };
}

/**
 * Call OpenAI/OpenRouter with single-message format
 */
async function callOpenAICompatible(client, modelId, context, config) {
  const response = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content: context.prompt }],
    response_format: config.supportsStructuredOutput ? TOOL_CALL_SCHEMA : undefined
  });

  return {
    ...response,
    _provider: 'openai-compatible'
  };
}

/**
 * Main callModel dispatcher
 */
async function callModel(modelId, context) {
  const client = getClientForModel(modelId);
  const config = getModelConfig(modelId);
  const providerType = getProviderType(modelId);

  if (providerType === 'anthropic') {
    return await callAnthropicWithMultiTurn(client, modelId, context);
  } else {
    return await callOpenAICompatible(client, modelId, context, config);
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass for both Anthropic and OpenAI models
- [ ] No regressions in existing functionality

#### Manual Verification:
- [ ] Test with `gpt-4o` - uses single-message format, works as before
- [ ] Test with `claude-sonnet-4-5` - uses multi-turn with proper cache markers
- [ ] Both produce correct tool call responses

---

## Phase 4: Enhanced Cache Metrics

### Overview
Add detailed cache metrics to observability for monitoring cache efficiency.

### Changes Required:

#### 1. Expand Token Tracking
**File**: `BACKEND/services/sessionObservability.service.js`
**Changes**: Add cache efficiency calculation

```javascript
async function logLLMResponse(sessionId, params) {
  // ... existing code ...

  const tokens = {
    prompt: usage?.prompt_tokens || 0,
    completion: usage?.completion_tokens || 0,
    cached: isAnthropic
      ? (usage?.cache_read_input_tokens || 0)
      : (usage?.prompt_tokens_details?.cached_tokens || 0),
    cache_write: usage?.cache_creation_input_tokens || 0,
    total: usage?.total_tokens || 0
  };

  // NEW: Calculate cache efficiency percentage
  const cacheEfficiency = tokens.prompt > 0
    ? Math.round((tokens.cached / (tokens.prompt + tokens.cached)) * 100)
    : 0;

  tokens.cache_efficiency_pct = cacheEfficiency;

  // Enhanced console logging
  if (cacheEfficiency > 0) {
    consoleLog(
      sessionId,
      '💾',
      `${colors.green}Cache hit${colors.reset}`,
      `${cacheEfficiency}% efficiency (${formatTokens(tokens.cached)} read, ${formatTokens(tokens.cache_write)} write)`
    );
  }

  // ... rest of function
}
```

#### 2. Add Cache Summary to Session End
**File**: `BACKEND/services/sessionObservability.service.js`
**Changes**: Add cache summary when ending session

```javascript
async function endSession(sessionId, status = 'completed', errorMessage = null) {
  // ... existing code ...

  let cacheWriteTotal = 0;
  for (const event of events || []) {
    const tokens = event.data?.tokens || {};
    totalTokens += tokens.total || 0;
    cachedTokens += tokens.cached || 0;
    cacheWriteTotal += tokens.cache_write || 0;
    totalCostCents += event.data?.cost_cents || 0;
    totalDurationMs += event.duration_ms || 0;
  }

  // Calculate session-level cache efficiency
  const sessionCacheEfficiency = (totalTokens + cachedTokens) > 0
    ? Math.round((cachedTokens / (totalTokens + cachedTokens)) * 100)
    : 0;

  // Log with cache summary
  consoleLog(
    sessionId,
    icon,
    `${color}Session ${status}${colors.reset}`,
    `${formatTokens(totalTokens)} tokens | ` +
    `Cache: ${sessionCacheEfficiency}% hit rate (${formatTokens(cachedTokens)} read, ${formatTokens(cacheWriteTotal)} write) | ` +
    `${formatCost(totalCostCents)} | ${formatDuration(totalDurationMs)}`
  );
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass
- [ ] No errors in log output

#### Manual Verification:
- [ ] Console shows cache efficiency percentage
- [ ] Session summary includes cache hit rate
- [ ] Metrics reflect actual cache behavior (> 80% on multi-turn sessions)

---

## Testing Strategy

### Unit Tests:
- Test `buildMultiTurnMessages()` with various event sequences
- Verify message structure matches Anthropic API spec
- Test cache marker placement on different message types

### Integration Tests:
- End-to-end test with Anthropic API
- Verify cache metrics in response.usage
- Test multi-turn conversation with tool calls

### Manual Testing Steps:
1. Send initial user message, note cache_creation_input_tokens
2. Agent responds with tool call, send tool result
3. Verify cache_read_input_tokens increases on subsequent calls
4. Check console logs for cache efficiency percentages
5. Compare costs between first call and subsequent calls

## Performance Considerations

- **First request**: Higher cost (cache write), expected
- **Subsequent requests**: ~90% cheaper on cached portion
- **Long conversations**: May need compression at ~50+ events (future work)
- **Memory**: Multi-turn format may use slightly more memory for messages array

## Migration Notes

- No database changes required
- No breaking API changes
- Backward compatible - OpenAI/OpenRouter paths unchanged
- Can be rolled back by reverting to single-message format

## References

- Original caching research: `thoughts/shared/research/2026-01-20-anthropic-prompt-caching.md`
- Anthropic caching docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Current implementation: `BACKEND/services/agentLoop.service.js`, `BACKEND/services/contextBuilder.service.js`
