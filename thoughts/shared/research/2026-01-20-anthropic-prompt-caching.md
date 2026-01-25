---
date: 2026-01-20T00:00:00-08:00
researcher: Claude
git_commit: eb1d81b22e0df10a7e374be375d1485f50af1368
branch: agent
repository: AI-PERSONAL-TRAINER
topic: "How does prompt caching work with the Anthropic API?"
tags: [research, codebase, anthropic, prompt-caching, llm, cost-optimization]
status: complete
last_updated: 2026-01-20
last_updated_by: Claude
---

# Research: Anthropic Prompt Caching Implementation

**Date**: 2026-01-20
**Researcher**: Claude
**Git Commit**: eb1d81b22e0df10a7e374be375d1485f50af1368
**Branch**: agent
**Repository**: AI-PERSONAL-TRAINER

## Research Question
How does prompt caching currently work in the codebase for the Anthropic API?

## Summary

The codebase implements a sophisticated **two-level prompt caching strategy** for Anthropic API calls that achieves approximately **90% cost reduction** on cached tokens. The implementation uses Anthropic's native `cache_control: { type: 'ephemeral' }` feature strategically placed on:

1. **Tool definitions** - cached via the last tool in the array
2. **Message content** - split into cacheable prefix (stable content) and new content (dynamic closing tag)

The key insight is an **append-only architecture** where the event stream grows incrementally, allowing Anthropic's prefix matching to find the longest cached prefix and extend it with new events.

## Detailed Findings

### 1. Anthropic SDK Integration

**File:** `BACKEND/package.json`
```json
"@anthropic-ai/sdk": "^0.71.2"
```

**File:** `BACKEND/services/modelProviders.service.js`
```javascript
const Anthropic = require('@anthropic-ai/sdk');

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    client: () => new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY }),
    type: 'anthropic'  // Uses native tool use API
  }
};
```

Supported Claude models with caching:
- `claude-haiku-4-5` - Fastest, $1.00/M prompt tokens
- `claude-sonnet-4-5` - Balanced, $3.00/M prompt tokens
- `claude-opus-4-5` - Premium, $5.00/M prompt tokens

### 2. Tool-Level Caching

**File:** `BACKEND/services/agentLoop.service.js` (lines 16-32)

```javascript
function getAnthropicTools() {
  const toolDefs = getToolDefinitions();
  return toolDefs.map((tool, index) => {
    const anthropicTool = {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    };

    // Add cache_control to the LAST tool to cache all tools as a prefix
    // This gives us 90% cost reduction on tool definitions after first request
    if (index === toolDefs.length - 1) {
      anthropicTool.cache_control = { type: 'ephemeral' };
    }

    return anthropicTool;
  });
}
```

**Why the last tool?** Anthropic's caching works on prefixes. By placing the cache control marker on the last tool definition, all preceding tools become part of the cached prefix.

### 3. Message-Level Caching Strategy

**File:** `BACKEND/services/agentLoop.service.js` (lines 143-157)

```javascript
const messageContent = [
  {
    type: 'text',
    text: context.cacheablePrefix,
    cache_control: { type: 'ephemeral' }  // Cache breakpoint here
  },
  {
    type: 'text',
    text: context.newContent  // New events + closing tag, not cached
  }
];

const response = await client.messages.create({
  model: modelId,
  max_tokens: 8192,
  tools: tools,
  tool_choice: { type: 'any' },
  messages: [{
    role: 'user',
    content: messageContent
  }]
});
```

The message is split into two content blocks:
- **cacheablePrefix**: Contains system prompt + user data + event stream (cached)
- **newContent**: Contains only the closing `</event_stream>` tag (not cached)

### 4. Context Building for Cache Optimization

**File:** `BACKEND/services/contextBuilder.service.js` (lines 560-585)

```javascript
/**
 * Caching strategy: Put ALL content EXCEPT the closing tag in the cacheable prefix
 * This ensures that:
 * - Iteration 1: caches "stablePrefix + <event_stream>\n + events[0..N]"
 * - Iteration 2: tries to match "stablePrefix + <event_stream>\n + events[0..N] + events[N+1..M]"
 *   → Anthropic finds the longest matching prefix (iteration 1's cache)
 *   → Reads it from cache, processes the new events
 *   → Creates a NEW cache entry for the full prefix (extends the cache)
 *
 * The closing </event_stream> tag is NEVER cached because:
 * - It would break prefix matching (iteration 2's content != iteration 1's content)
 * - By keeping it in newContent, each iteration's cacheablePrefix is a PREFIX of the next
 */
const cacheablePrefix = stablePrefix + '\n\n<event_stream>\n' + allEventsXml;
const newContent = '</event_stream>';
```

**Stable Prefix Reuse (lines 282-301):**
```javascript
// Cache the stablePrefix string to ensure consistency across iterations
// This prevents cache misses due to slight differences in user data fetches
let stablePrefixCache = null;

// ...in loop:
if (!stablePrefixCache) {
  stablePrefixCache = context.stablePrefix;
}
```

### 5. Cache Pricing Model

**File:** `BACKEND/services/observability/pricing.js` (lines 90-113)

```javascript
'claude-haiku-4-5': {
  prompt: 1.00,
  completion: 5.00,
  cache_write: 1.25,    // 1.25x base = $1.25/M
  cache_read: 0.10      // 0.1x base = $0.10/M (90% off!)
},
'claude-sonnet-4-5': {
  prompt: 3.00,
  completion: 15.00,
  cache_write: 3.75,    // 1.25x base = $3.75/M
  cache_read: 0.30      // 0.1x base = $0.30/M (90% off!)
},
'claude-opus-4-5': {
  prompt: 5.00,
  completion: 25.00,
  cache_write: 6.25,    // 1.25x base = $6.25/M
  cache_read: 0.50      // 0.1x base = $0.50/M (90% off!)
}
```

### 6. Cost Calculation with Cache Support

**File:** `BACKEND/services/observability/pricing.js` (lines 172-210)

```javascript
function calculateCost(model, promptTokens, completionTokens, cacheInfo = 0) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];

  if (typeof cacheInfo === 'object' && cacheInfo !== null) {
    // Anthropic format: { cache_creation_input_tokens, cache_read_input_tokens }
    const cacheWrite = cacheInfo.cache_creation_input_tokens || 0;
    const cacheRead = cacheInfo.cache_read_input_tokens || 0;

    const promptCost = (promptTokens * pricing.prompt) / 1_000_000;

    if (pricing.cache_write && cacheWrite > 0) {
      cacheCost += (cacheWrite * pricing.cache_write) / 1_000_000;
    }
    if (pricing.cache_read && cacheRead > 0) {
      cacheCost += (cacheRead * pricing.cache_read) / 1_000_000;
    }
  }
  // ...
}
```

### 7. Token Metrics Tracking

**File:** `BACKEND/services/sessionObservability.service.js` (lines 394-407)

```javascript
const isAnthropic = rawResponse?._provider === 'anthropic';
const tokens = {
  prompt: usage?.prompt_tokens || 0,
  completion: usage?.completion_tokens || 0,
  // Anthropic: cache_read_input_tokens
  cached: isAnthropic
    ? (usage?.cache_read_input_tokens || 0)
    : (usage?.prompt_tokens_details?.cached_tokens || 0),
  // Anthropic: cache_creation_input_tokens for cache writes
  cache_write: usage?.cache_creation_input_tokens || 0,
  total: usage?.total_tokens || 0
};
```

### 8. Response Normalization

**File:** `BACKEND/services/agentLoop.service.js` (lines 186-198)

```javascript
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
    // Anthropic cache tokens
    cache_creation_input_tokens: response.usage?.cache_creation_input_tokens || 0,
    cache_read_input_tokens: response.usage?.cache_read_input_tokens || 0
  },
  model: response.model,
  stop_reason: response.stop_reason,
  _provider: 'anthropic',
  _native_tool_use: true
};
```

## Code References

| Component | File | Lines |
|-----------|------|-------|
| Tool caching | `BACKEND/services/agentLoop.service.js` | 16-32 |
| Message caching | `BACKEND/services/agentLoop.service.js` | 143-157 |
| Context building | `BACKEND/services/contextBuilder.service.js` | 560-585 |
| Stable prefix cache | `BACKEND/services/agentLoop.service.js` | 282-301 |
| Cache pricing | `BACKEND/services/observability/pricing.js` | 90-113 |
| Cost calculation | `BACKEND/services/observability/pricing.js` | 172-210 |
| Token tracking | `BACKEND/services/sessionObservability.service.js` | 394-407 |
| Response normalization | `BACKEND/services/agentLoop.service.js` | 186-198 |

## Architecture Insights

### Cache Flow Diagram

```
Iteration 1:
┌─────────────────────────────────────────────────────────────────┐
│ [TOOLS with cache_control on last] + [MESSAGE BLOCK 1: prefix] │
│ ─────────────────────────────────────────────────────────────── │
│ System Prompt + User Data + <event_stream> + events[0..N]      │
│ cache_control: { type: 'ephemeral' }                           │
├─────────────────────────────────────────────────────────────────┤
│ [MESSAGE BLOCK 2: new content]                                 │
│ </event_stream>                                                │
└─────────────────────────────────────────────────────────────────┘
        ↓ Creates cache entry

Iteration 2:
┌─────────────────────────────────────────────────────────────────┐
│ [TOOLS - cache HIT] + [MESSAGE BLOCK 1: prefix]                │
│ ─────────────────────────────────────────────────────────────── │
│ System Prompt + User Data + <event_stream> + events[0..N]      │← Cache READ
│ + events[N+1..M]                                               │← New tokens
│ cache_control: { type: 'ephemeral' }                           │
├─────────────────────────────────────────────────────────────────┤
│ [MESSAGE BLOCK 2: new content]                                 │
│ </event_stream>                                                │
└─────────────────────────────────────────────────────────────────┘
        ↓ Extends cache entry
```

### Key Design Decisions

1. **Append-only event stream**: Events are never modified or removed, only appended. This ensures prefix matching works across iterations.

2. **Closing tag separation**: The `</event_stream>` tag is always in `newContent` (not cached) so that each iteration's `cacheablePrefix` is a true prefix of the next iteration's content.

3. **Stable prefix caching in code**: The `stablePrefixCache` variable stores the exact bytes of the system prompt + user data on first iteration, ensuring byte-for-byte consistency.

4. **Tool caching via last element**: Placing `cache_control` on the last tool caches all tool definitions as a prefix.

5. **Ephemeral cache type**: Uses Anthropic's ephemeral caching which auto-expires but provides maximum cost savings.

## Open Questions

1. **Cache TTL**: The ephemeral cache has a 5-minute TTL (Anthropic's default). For long-running sessions, consider if this is sufficient.

2. **Cache warming**: Currently no explicit cache warming strategy. First request in a session always pays full price.

3. **Multi-user cache sharing**: Each user has unique data, so caches are per-user. Could system prompt + tool definitions be shared across users?
