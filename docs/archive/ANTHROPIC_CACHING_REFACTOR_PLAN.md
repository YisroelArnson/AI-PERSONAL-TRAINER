# Plan: Simplify Anthropic Caching Implementation

## Goal
Refactor the context building and agent loop to use Anthropic's proper multi-cache-block approach with 4 cache breakpoints:
1. **Tools** - cache_control on last tool
2. **System prompt** - cache_control on system text block
3. **User data** - cache_control on separate system text block
4. **Messages (multi-turn)** - cache_control on last content block of last message

## Current Problems
- Overly complex `cacheBoundarySequence` logic that splits events into historical/new
- `buildMultiTurnMessages()` function doing unnecessary work
- Cache prefix comparison debug code
- OpenAI compatibility code that's no longer needed

## Architecture

### Request Structure
```javascript
{
  model: "claude-haiku-4-5",
  max_tokens: 8192,
  tools: [
    { name: "tool1", ... },
    { name: "tool2", ..., cache_control: { type: "ephemeral" } }  // Last tool
  ],
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" }
    },
    {
      type: "text",
      text: "<user_data>...</user_data>",
      cache_control: { type: "ephemeral" }
    }
  ],
  tool_choice: { type: "any" },
  messages: [
    // Native Anthropic multi-turn format:
    { role: "user", content: "What workout should I do today?" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I'll create a workout for you." },
        { type: "tool_use", id: "toolu_abc123", name: "generate_workout", input: {...} }
      ]
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_abc123", content: "Workout created: art_xyz789" }
      ]
    },
    // ... more turns, with cache_control on last content block of last message
  ]
}
```

### Event Type to Message Mapping
| Event Type | Anthropic Message Format |
|------------|-------------------------|
| `user_message` | `{ role: "user", content: "message text" }` |
| `tool_call` | `{ role: "assistant", content: [{ type: "tool_use", id, name, input }] }` |
| `tool_result` | `{ role: "user", content: [{ type: "tool_result", tool_use_id, content }] }` |
| `knowledge` | Append to previous user message as text block |
| `artifact` | Append to previous user message as text block |

### Cache Behavior
- **Iteration 1**: Tools, system prompt, user data all cached. Events cached.
- **Iteration 2**: Cache hit on tools + system + user data. Events grow (new events appended), longest prefix match finds previous events cached, only processes new events.
- **Later session**: If user data changes, tools + system still cached. User data re-cached. Events continue incrementally.

---

## Files to Modify

### 1. contextBuilder.service.js

**Remove:**
- `buildMultiTurnMessages()` function (lines 537-724)
- `historicalMessages`, `newMessages`, `maxEventSequence` from return values
- `cacheBoundarySequence` parameter handling
- `cacheablePrefix`, `newContent` return values (legacy XML approach)
- `stablePrefixCache` parameter handling
- `formatEventXml()` function (no longer needed)

**Keep:**
- `SYSTEM_PROMPT` constant
- `formatUserDataXml()` function
- `estimateTokens()` function

**Add/Modify:**
- New `buildEventsToMessages()` function - converts events to Anthropic native format
- New `addCacheControlToLastMessage()` function
- Simplify `buildAgentContext()` to use new functions

### 2. agentLoop.service.js

**Remove:**
- `TOOL_CALL_SCHEMA` (OpenAI structured output schema)
- `parseToolCallFromJson()` function
- `callOpenAIModel()` function
- `buildAnthropicMessages()` function (replaced by contextBuilder functions)
- `logAnthropicCall()` function (or simplify)
- `cacheBoundarySequence` variable and tracking
- `stablePrefixCache` variable
- Cache debug comparison code (lines 410-428)
- `getModelConfig()`, `getProviderType()` imports

**Modify:**
- `callAnthropicModel()` - simplify to use new context structure
- `runAgentLoop()` - remove caching complexity, just call buildAgentContext and callAnthropicModel
- `getAnthropicTools()` - keep as-is (already correct)

### 3. modelProviders.service.js

**Simplify to Anthropic-only:**
- Remove `openai` and `openrouter` from PROVIDERS
- Remove non-Anthropic models from MODEL_REGISTRY (GPT-4o, Gemini, Kimi, DeepSeek, Llama)
- Keep only Claude models: `claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-5`
- Remove `getProviderType()` function (always 'anthropic')
- Simplify `getClientForModel()` to just return Anthropic client

### 4. sessionObservability.service.js

**Remove:**
- `getCacheBoundarySequence()` function (lines 403-411) - no longer needed
- Remove from exports (line 766)

**Keep:**
- `getContextEvents()` - still needed to fetch events in order
- All logging functions - still needed

---

## Implementation Steps

### Step 1: Simplify contextBuilder.service.js

```javascript
// New simplified exports
module.exports = {
  buildAgentContext,       // Returns { systemPrompt, userDataXml, messages }
  buildEventsToMessages,   // Convert events → Anthropic message format
  formatUserDataXml,
  estimateTokens,
  SYSTEM_PROMPT
};
```

New `buildAgentContext()` will:
1. Fetch session and events (ordered by sequence_number)
2. Fetch user data
3. Format user data as XML
4. Convert events to Anthropic native message format (user/assistant/tool_use/tool_result)
5. Add cache_control to last message's last content block
6. Return context object ready for API call

### Step 2: Refactor agentLoop.service.js

New `callAnthropicModel()` will:
1. Get tools with cache_control on last one
2. Build system array with 2 blocks (prompt + user data), each with cache_control
3. Pass context.messages (native multi-turn format with user/assistant alternation, cache_control already on last message)
4. Call Anthropic API
5. Return normalized response

New simplified `runAgentLoop()` will:
1. Log user message
2. Initialize context
3. Loop:
   - Build context (simple fetch + format)
   - Call Anthropic (handles all caching)
   - Execute tool
   - Log result
   - Check for idle/ask_user

### Step 3: Clean up unused code

- Remove OpenAI-specific code
- Remove cache boundary tracking
- Remove debug comparison code

---

## Verification

1. **Unit test**: Call `buildAgentContext()` and verify structure
2. **Integration test**: Run agent loop, check logs for:
   - `cache_creation_input_tokens` on first call
   - `cache_read_input_tokens` on subsequent calls
3. **Multi-iteration test**: Verify events accumulate correctly and cache hits increase
4. **Cost verification**: Compare token costs before/after refactor

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing sessions | Test with new session first |
| Event ordering issues | Keep existing `getContextEvents()` ordering logic |
| Token limit exceeded | Keep `estimateTokens()` for monitoring |

## Additional Considerations

### 1. Empty Messages Array
If no events exist, `messages` will be empty and Anthropic API will fail.
- **Mitigation:** The agent loop logs user_message before building context, so this shouldn't happen. Add a check in `buildAgentContext` to throw if messages is empty.

### 2. Consecutive User Messages
If two `user_message` events are logged consecutively, we'd have two user-role messages in a row, which Anthropic rejects.
- **Mitigation:** In `buildEventsToMessages`, when adding a `user_message`, check if the last message is also `role: "user"` and merge content instead of creating new message.

### 3. Data Field Names Match
Verified that logged event data uses:
- `tool_call`: `{ tool_name, arguments, call_id }`
- `tool_result`: `{ tool_name, result, success, call_id }`
- `knowledge`: `{ source, data }`
- `artifact`: `{ type, artifact_id, summary, ... }`

The `buildEventsToMessages` code uses these field names correctly.

---

## Code Sketches

### contextBuilder.service.js - New buildEventsToMessages function

```javascript
/**
 * Convert session events to Anthropic native multi-turn message format
 *
 * CRITICAL: Anthropic requires that every tool_use from assistant must be
 * IMMEDIATELY followed by a tool_result in the next user message.
 *
 * Event types map to:
 * - user_message → { role: "user", content: "text" }
 * - tool_call → { role: "assistant", content: [{ type: "tool_use", ... }] }
 * - tool_result → { role: "user", content: [{ type: "tool_result", ... }] }
 * - knowledge/artifact → Appended to user message AFTER the tool_result (if pending)
 *
 * Sequence handling:
 * 1. When we see a tool_call, we set pendingToolCallId
 * 2. Knowledge/artifacts that arrive before tool_result are buffered
 * 3. When tool_result arrives, we create the user message with tool_result FIRST,
 *    then append any buffered content
 *
 * @param {Array} events - Session events ordered by sequence_number
 * @returns {Array} Anthropic messages array
 */
function buildEventsToMessages(events) {
  const messages = [];
  let pendingToolCallId = null;  // Track if we're waiting for a tool_result
  let bufferedContent = [];       // Content to add after tool_result

  for (const event of events) {
    const eventType = event.event_type;
    const data = event.data || {};

    switch (eventType) {
      case 'user_message':
        // If waiting for tool_result, buffer this (shouldn't normally happen)
        if (pendingToolCallId) {
          bufferedContent.push({ type: 'text', text: data.message || data });
        } else {
          // Check if last message is also user - merge to avoid consecutive user messages
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'user') {
            if (typeof lastMsg.content === 'string') {
              lastMsg.content = [{ type: 'text', text: lastMsg.content }];
            }
            lastMsg.content.push({ type: 'text', text: data.message || data });
          } else {
            messages.push({
              role: 'user',
              content: data.message || data
            });
          }
        }
        break;

      case 'tool_call':
        messages.push({
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: data.call_id,
            name: data.tool_name,
            input: data.arguments
          }]
        });
        // Mark that we're waiting for a tool_result
        pendingToolCallId = data.call_id;
        bufferedContent = [];  // Reset buffer
        break;

      case 'tool_result':
        // Create user message with tool_result FIRST
        const toolResultContent = [{
          type: 'tool_result',
          tool_use_id: data.call_id,
          content: typeof data.result === 'string'
            ? data.result
            : JSON.stringify(data.result)
        }];

        // Append any buffered content (knowledge/artifacts that came before)
        if (bufferedContent.length > 0) {
          toolResultContent.push(...bufferedContent);
          bufferedContent = [];
        }

        messages.push({
          role: 'user',
          content: toolResultContent
        });

        // Clear pending state
        pendingToolCallId = null;
        break;

      case 'knowledge':
      case 'artifact':
        const textContent = eventType === 'knowledge'
          ? `<knowledge source="${data.source}">\n${data.data}\n</knowledge>`
          : `<artifact type="${data.type}" id="${data.artifact_id}">\n${JSON.stringify(data.summary)}\n</artifact>`;

        // If waiting for tool_result, buffer this content
        if (pendingToolCallId) {
          bufferedContent.push({ type: 'text', text: textContent });
        } else {
          // Append to last user message, or create new one
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'user') {
            // Convert string content to array if needed
            if (typeof lastMsg.content === 'string') {
              lastMsg.content = [{ type: 'text', text: lastMsg.content }];
            }
            lastMsg.content.push({ type: 'text', text: textContent });
          } else {
            messages.push({
              role: 'user',
              content: [{ type: 'text', text: textContent }]
            });
          }
        }
        break;
    }
  }

  // Handle edge case: buffered content with no tool_result (shouldn't happen)
  if (bufferedContent.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      if (typeof lastMsg.content === 'string') {
        lastMsg.content = [{ type: 'text', text: lastMsg.content }];
      }
      lastMsg.content.push(...bufferedContent);
    } else {
      messages.push({ role: 'user', content: bufferedContent });
    }
  }

  return messages;
}

/**
 * Add cache_control to the last content block of the last message
 */
function addCacheControlToLastMessage(messages) {
  if (messages.length === 0) return messages;

  const lastMsg = messages[messages.length - 1];

  // Convert string content to array format
  if (typeof lastMsg.content === 'string') {
    lastMsg.content = [{ type: 'text', text: lastMsg.content }];
  }

  // Add cache_control to last content block
  if (Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
    const lastBlock = lastMsg.content[lastMsg.content.length - 1];
    lastBlock.cache_control = { type: 'ephemeral' };
  }

  return messages;
}
```

### contextBuilder.service.js - New buildAgentContext

```javascript
async function buildAgentContext(sessionId, userId) {
  const session = await getSession(sessionId);
  const events = await getContextEvents(sessionId, session.context_start_sequence);
  const userData = await fetchAllUserData(userId);

  // Format user data as XML
  const userDataXml = formatUserDataXml(userData);

  // Convert events to Anthropic message format
  const messages = buildEventsToMessages(events);

  // Add cache_control to last message
  addCacheControlToLastMessage(messages);

  return {
    systemPrompt: SYSTEM_PROMPT,
    userDataXml,
    messages,  // Native Anthropic format, not XML
    session,
    eventCount: events.length
  };
}
```

### agentLoop.service.js - New callAnthropicModel

```javascript
async function callAnthropicModel(client, modelId, context) {
  const tools = getAnthropicTools(); // Already has cache_control on last tool

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 8192,
    tools: tools,
    tool_choice: { type: 'any' },
    system: [
      {
        type: 'text',
        text: context.systemPrompt,
        cache_control: { type: 'ephemeral' }
      },
      {
        type: 'text',
        text: context.userDataXml,
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: context.messages  // Native multi-turn format with cache_control on last
  });

  // Extract tool_use block
  const toolUseBlock = response.content.find(block => block.type === 'tool_use');

  return {
    toolCall: toolUseBlock ? {
      id: toolUseBlock.id,
      name: toolUseBlock.name,
      arguments: toolUseBlock.input
    } : null,
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      cacheCreationTokens: response.usage?.cache_creation_input_tokens || 0,
      cacheReadTokens: response.usage?.cache_read_input_tokens || 0
    },
    model: response.model,
    stopReason: response.stop_reason
  };
}
```
