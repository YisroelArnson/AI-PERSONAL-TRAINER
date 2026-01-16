# Personal Trainer AI Agent Design Document

A Personal Trainer AI exercise app with an agentic architecture.

---

## Checklist

- [x] Looping functionality
- [ ] System prompt
- [ ] Context management
- [ ] Toolset
    - [ ] Tools for creating and adjusting exercise and muscle goals
        - [ ] Instructions in the system prompt to guide the PT
    - [ ] Tools for parsing and saving preferences
    - [ ] Tools for logging exercise
    - [ ] Timer tools and architecture / UI / UX
    - [ ] Access User's Calendar and scheduled workouts
    - [ ] Tools for generating workout statistics and analytics

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (CommonJS) |
| Framework | Express.js 5.1.0 |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth with JWT |
| AI/LLM | OpenAI API (GPT-4o, GPT-4o-mini) |
| Validation | Zod |

**Note**: This architecture replaces the previous Vercel AI SDK-based agent. We implement a manual agent loop instead of relying on `generateText`/`streamText` with maxSteps.

---

## 1. Agent Loop

The agent loop operates through iterative tool execution:

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT LOOP                              │
├─────────────────────────────────────────────────────────────┤
│  1. User provides input                                      │
│  2. INITIALIZER AGENT analyzes request & selects data        │
│  3. Selected data sources injected as knowledge events       │
│  4. Main Agent analyzes event stream + injected context      │
│  5. Main Agent selects action from predefined tool space     │
│  6. Action is executed                                       │
│  7. Execution produces observation                           │
│  8. Action + observation appended to event stream            │
│  9. Loop continues until:                                    │
│     - Agent calls `idle` tool                                │
│     - Max iterations reached (safety limit: 10)              │
│     - User explicitly stops                                  │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Details

This loop is a **manual loop** and does not use any Agent SDKs. The loop is implemented server-side with the following components:

```javascript
// BACKEND/services/agentLoop.service.js

async function runAgentLoop(sessionId, userId, userInput) {
  const MAX_ITERATIONS = 10;
  let iteration = 0;
  let shouldContinue = true;
  
  // Load or create session
  const session = await getOrCreateSession(sessionId, userId);
  
  // Check if checkpoint is needed (context approaching limit)
  const checkpointResult = await checkAndTriggerCheckpoint(sessionId);
  if (checkpointResult) {
    sessionId = checkpointResult.id;
  }
  
  // ════════════════════════════════════════════════════════════
  // INITIALIZER AGENT: Analyze request and APPEND needed context
  // ════════════════════════════════════════════════════════════
  const initResult = await initializeContext(sessionId, userId, userInput);
  // initResult contains: { reasoning, appendedSources, useExisting }
  
  // Append user message AFTER knowledge (for KV-cache efficiency)
  await appendEvent(sessionId, {
    type: 'user_message',
    content: userInput,
    timestamp: new Date().toISOString()
  });
  
  while (shouldContinue && iteration < MAX_ITERATIONS) {
    iteration++;
    
    // 1. Build context (stable prefix + event stream)
    const context = await buildAgentContext(sessionId, userId);
    
    // 2. Call LLM for next action
    const response = await callLLM(context);
    
    // 3. Parse tool call from response
    const toolCall = parseToolCall(response);
    
    // 4. Execute tool and get formatted result
    const { result, formattedResult } = await executeTool(toolCall, userId, sessionId);
    
    // 5. Append action + result to event stream
    await appendEvent(sessionId, {
      type: 'action',
      tool: toolCall.name,
      args: toolCall.arguments,
      timestamp: new Date().toISOString()
    });
    
    await appendEvent(sessionId, {
      type: 'result',
      tool: toolCall.name,
      formatted: formattedResult,
      timestamp: new Date().toISOString()
    });
    
    // 6. Check if agent wants to idle
    if (toolCall.name === 'idle') {
      shouldContinue = false;
    }
  }
  
  return await getSessionState(sessionId);
}
```

### Model Configuration

| Use Case | Model | Temperature | Notes |
|----------|-------|-------------|-------|
| Initializer Agent | `gpt-4o-mini` | 0.1 | Fast context selection |
| Main Agent reasoning | `gpt-4o` | 0.7 | Main agent loop |
| Timer generation | `gpt-4o-mini` | 0.6 | Faster, cheaper |
| Exercise generation | `gpt-4o` | 0.7 | Structured output |

---

## 2. System Prompt

The system prompt defines the agent's personality, capabilities, and behavioral rules.

### Core System Prompt

```xml
You are a Personal Trainer in an exercise app.

You excel at the following tasks:
1. Creating personalized workouts based on user stats, goals, and preferences
2. Answering workout questions and guiding users through exercises
3. Generating workout-specific timers and intervals
4. Helping users set and adjust their fitness goals
5. Tracking progress and providing insights on workout history

<agent_loop>
You are operating in an agent loop, iteratively completing tasks through these steps:
1. Analyze Events: Understand user needs and current state through the event stream, focusing on the latest user message and recent execution results
2. Select Tools: Choose the next tool call based on current state, task planning, relevant knowledge, and available data
3. Wait for Execution: Your selected tool action will be executed and the result added to the event stream
4. Iterate: Choose only ONE tool call per iteration. Repeat steps until task completion
5. Submit Results: Send results to user via message tools before entering idle
6. Enter Standby: Call `idle` when all tasks are complete or user explicitly requests to stop
</agent_loop>

<knowledge_injection>
- Before you process each request, an Initializer Agent analyzes the user's message and injects relevant data into the event stream as "knowledge" events
- The Initializer Agent selects which data sources you need based on the task type
- Knowledge events contain user profile, goals, preferences, workout history, and other contextual data
- You can request additional data using data retrieval tools if the injected knowledge is insufficient
- Each knowledge event has a "source" field indicating what type of data it contains
</knowledge_injection>

<event_stream>
You will be provided with a chronological event stream containing:
1. Message: User messages and your previous messages
2. Action: Tool calls you have made
3. Observation: Results from tool executions
4. Knowledge: User data and context injected by the system
</event_stream>

<message_rules>
- Communicate with users via message tools (message_notify_user, message_ask_user)
- Reply immediately to new user messages before other operations
- First reply should be brief, acknowledging the request
- Use notify for progress updates (non-blocking)
- Use ask only when you genuinely need user input (blocking)
- Always message users with results before calling idle
</message_rules>

<tool_use_rules>
- You MUST respond with exactly ONE tool call per iteration
- Plain text responses without tool calls are forbidden
- Do not mention specific tool names to users
- Only use tools that are explicitly available to you
</tool_use_rules>

<exercise_recommendation_rules>
- Always consider the user's category goals and muscle goals when recommending exercises
- Prioritize distribution balance: recommend exercises for under-represented categories/muscles
- Respect user preferences (both temporary and permanent)
- Apply progressive overload: use workout history to suggest appropriate weights
- Consider recovery: 48h for large muscles, 24h for small muscles
- Follow the priority hierarchy:
  1. Temporary preferences (override everything)
  2. Explicit user requests in current message
  3. Permanent preferences
  4. Distribution debt (under-represented goals)
  5. Goal weights
  6. Recent workout history
</exercise_recommendation_rules>

<goal_management_rules>
When helping users set or adjust goals:
- Only use fetch_data for category_goals or muscle_goals if not already in context
- Ask clarifying questions with the message_ask_user tool to understand the user's true objectives
- Guide users towards an effective, balanced distribution based on their priorities
- Use set_goals to save weights (percentages auto-normalize to 100%)
</goal_management_rules>

<preference_rules>
When users express preferences or constraints:
- Immediate requests ("give me hamstring exercises", "I want cardio") → delete_after_use: true
- Time-limited ("avoid shoulders for 2 weeks", "take it easy this week") → set expires_at to ISO timestamp
- Permanent ("I hate burpees", "I don't have a barbell") → no expiration
- Write clear guidance explaining how the preference affects workout recommendations
- Use set_preference to save; use fetch_data for active_preferences to see existing ones
</preference_rules>
```

### Dynamic User Data Section

The following is appended to the system prompt with current user data:

```xml
<user_data>

<unit_preferences>
Weight: {weight_unit} (lbs or kg)
Distance: {distance_unit} (miles or km)
</unit_preferences>

<body_stats>
Sex: {sex}
Age: {age}
Height: {height}
Weight: {weight}
Body Fat: {body_fat_percentage}%
</body_stats>

<category_goals>
{category_name}: {description} - Target: {weight*100}% / Actual: {actual_percentage}%
...
</category_goals>

<muscle_goals>
{muscle_name}: Target: {weight*100}% / Actual: {actual_percentage}%
...
</muscle_goals>

<distribution_debt>
Categories needing more focus: {categories_with_positive_debt}
Categories to reduce: {categories_with_negative_debt}
Muscles needing more focus: {muscles_with_positive_debt}
Muscles to reduce: {muscles_with_negative_debt}
</distribution_debt>

<current_location>
Location: {location_name}
Equipment available: {equipment_list}
</current_location>

<active_preferences>
Temporary preferences (expire soon):
{temporary_preferences}

Permanent preferences:
{permanent_preferences}
</active_preferences>

</user_data>
```

---

## 3. Context Management

Context is managed through multiple layers:

### 3.1 Data Sources (from Supabase)

| Table | Description | Use Case |
|-------|-------------|----------|
| `body_stats` | Physical stats (sex, age, height, weight, body fat) | Personalization |
| `user_category_and_weight` | Category goals with weights | Goal alignment |
| `user_muscle_and_weight` | Muscle targets with weights | Muscle targeting |
| `user_locations` | Locations with equipment lists | Equipment constraints |
| `preferences` | Temporary and permanent preferences | Preference handling |
| `workout_history` | Last 15+ exercises | Progression logic |
| `exercise_distribution_tracking` | Running totals for O(1) debt calculation | Distribution balance |
| `user_settings` | Unit preferences (lbs/kg, miles/km) | Display formatting |
| `agent_sessions` | Session metadata and state | Conversation continuity |
| `agent_events` | Event stream storage (JSONB) | Context history |
| `scheduled_workouts` | Future planned workouts | Calendar features |
| `milestone_goals` | Specific goals (e.g., run 5k) | Goal tracking |

### 3.2 Initializer Agent (Knowledge Module)

The Initializer Agent is a lightweight, fast model that runs **before each main agent iteration**. Its sole purpose is to analyze the user's request and determine which data sources should be injected into the context for the main agent.

#### Design Principles

- **Fast & Cheap**: Uses `gpt-4o-mini` with low temperature for deterministic output
- **Additive Only**: Can only add data sources to context, never remove
- **Context-Aware**: Knows what data is already in context to avoid duplication
- **Structured Output**: Returns a simple list of data sources to inject

#### Model Configuration

| Property | Value |
|----------|-------|
| Model | `gpt-4o-mini` |
| Temperature | 0.1 |
| Max Tokens | 500 |
| Response Format | Structured JSON |

#### Initializer Agent System Prompt

```xml
You are a Context Initializer for a Personal Trainer AI agent.

Your job is to analyze the user's message and determine which data sources the main agent needs. 
The system uses an APPEND-ONLY architecture for KV-cache efficiency.

<your_task>
1. Read the user's message
2. Review which data sources are already in context (and their parameters)
3. Determine if any NEW data sources should be APPENDED
4. Return ONLY a JSON object with your selections
</your_task>

<important>
APPEND-ONLY RULES:
- Knowledge is APPENDED to the context, never replaced or removed
- If a data source is already in context, you can still add MORE of it with different parameters
- Example: workout_history with days_back:14 is in context, but user asks about this month
  → Append workout_history with days_back:30 (LLM will see both and use combined info)
- Only request NEW data or EXPANDED data, not data already covered
</important>

<rules>
- You can ONLY ADD data sources, never remove existing ones
- If a source exists with SUFFICIENT scope, do NOT add it again
- If a source exists but with INSUFFICIENT scope (e.g., 14 days but need 30), ADD it with expanded params
- Select the MINIMUM data sources needed - avoid over-fetching
- Include a "reason" for each data source to explain why it's being added
</rules>

<task_to_data_mapping>
Use this guide to determine which data sources are needed for common tasks:

WORKOUT GENERATION / EXERCISE RECOMMENDATIONS:
- category_goals (includes distribution metrics - if not in context)
- muscle_goals (includes distribution metrics - if not in context)
- active_preferences (if not in context)
- workout_history (days_back: 14, or expand if need more)
- current_location (if not in context)

GOAL SETTING / ADJUSTMENTS:
- category_goals (includes distribution metrics to show current state and impact)
- muscle_goals (includes distribution metrics to show current state and impact)

VIEWING STATISTICS / PROGRESS:
- workout_history (set days_back based on request: week=7, month=30, year=365)
  → If current history is 14 days but user asks for month, ADD days_back: 30
- category_goals (includes distribution metrics for comparison)

SCHEDULING / PLANNING:
- scheduled_workouts (set days_ahead based on request)
- workout_plans (if discussing multi-week plans)
- milestone_goals (if discussing specific goals)

PREFERENCE MANAGEMENT:
- active_preferences (to show current state)

TIMER / INTERVAL REQUESTS:
- current_workout_session (needed for exercise details)

GENERAL QUESTIONS / CONVERSATION:
- Usually minimal data needed
- Only add if specifically relevant to question

INJURY / RECOVERY DISCUSSION:
- active_preferences (to check existing injury prefs)
- workout_history (recent, days_back: 7)
</task_to_data_mapping>

<output_format>
Respond with ONLY a JSON object in this exact format:
{
  "reasoning": "Brief explanation of what data is needed and why",
  "append_knowledge": [
    { "source": "source_name", "reason": "not_in_context" },
    { "source": "source_name", "params": { "days_back": 30 }, "reason": "expand_range" }
  ],
  "use_existing": ["source1", "source2"]
}

Reasons for adding:
- "not_in_context": Data source not present, needs to be added
- "expand_range": Data exists but with smaller range, need more (e.g., 14 days → 30 days)
- "refresh_state": Data may be stale and needs current state (e.g., current_workout_session during workout)

If no additional data sources are needed, return:
{
  "reasoning": "All necessary data is already in context with sufficient scope",
  "append_knowledge": [],
  "use_existing": ["list", "of", "existing", "sources", "being", "used"]
}
</output_format>
```

#### Available Data Sources Registry

| Source ID | Description | Parameters | Fetch Function |
|-----------|-------------|------------|----------------|
| `user_profile` | Basic user info (name, body stats, units) | None | `fetchUserProfile(userId)` |
| `category_goals` | Category goals with weights AND distribution metrics (actual vs target %, debt) | None | `fetchCategoryGoalsWithDistribution(userId)` |
| `muscle_goals` | Muscle goals with weights AND distribution metrics (actual vs target %, debt) | None | `fetchMuscleGoalsWithDistribution(userId)` |
| `active_preferences` | Temporary and permanent preferences | None | `fetchActivePreferences(userId)` |
| `workout_history` | Past workout exercises | `days_back` (default: 14) | `fetchWorkoutHistory(userId, params)` |
| `current_location` | Current location with equipment | None | `fetchCurrentLocation(userId)` |
| `current_workout_session` | Active workout in progress | None | `fetchCurrentWorkoutSession(userId)` |
| `scheduled_workouts` | Future planned workouts | `days_ahead` (default: 7) | `fetchScheduledWorkouts(userId, params)` |
| `workout_plans` | Multi-week workout plans | `status` (default: 'active') | `fetchWorkoutPlans(userId, params)` |
| `milestone_goals` | Specific achievement goals | `status` (default: 'active') | `fetchMilestoneGoals(userId, params)` |
| `user_settings` | Unit preferences and settings | None | `fetchUserSettings(userId)` |

#### Data Source Definitions

```javascript
// BACKEND/ai/dataSources.js

const DATA_SOURCES = {
  user_profile: {
    id: 'user_profile',
    description: 'Basic user info including name, body stats, and unit preferences',
    params: null,
    fetch: async (userId) => fetchUserProfile(userId)
  },
  
  category_goals: {
    id: 'category_goals',
    description: 'User fitness category goals with target weights AND distribution metrics (actual vs target, debt)',
    params: null,
    fetch: async (userId) => {
      const goals = await fetchCategoryGoals(userId);
      const distribution = await fetchDistributionMetrics(userId);
      return { goals, distribution };
    }
  },
  
  muscle_goals: {
    id: 'muscle_goals',
    description: 'User muscle group goals with target weights AND distribution metrics (actual vs target, debt)',
    params: null,
    fetch: async (userId) => {
      const goals = await fetchMuscleGoals(userId);
      const distribution = await fetchDistributionMetrics(userId);
      return { goals, distribution };
    }
  },
  
  active_preferences: {
    id: 'active_preferences',
    description: 'Active temporary and permanent user preferences',
    params: null,
    fetch: async (userId) => fetchActivePreferences(userId)
  },
  
  workout_history: {
    id: 'workout_history',
    description: 'Recent workout history for progression and analysis',
    params: {
      days_back: { type: 'number', default: 14, description: 'Number of days to look back' }
    },
    fetch: async (userId, params = {}) => {
      const daysBack = params.days_back || 14;
      return fetchWorkoutHistory(userId, { daysBack });
    }
  },
  
  current_location: {
    id: 'current_location',
    description: 'User current location with available equipment',
    params: null,
    fetch: async (userId) => fetchCurrentLocation(userId)
  },
  
  current_workout_session: {
    id: 'current_workout_session',
    description: 'The workout currently in progress or most recently generated',
    params: null,
    fetch: async (userId) => fetchCurrentWorkoutSession(userId)
  },
  
  scheduled_workouts: {
    id: 'scheduled_workouts',
    description: 'Future scheduled workouts',
    params: {
      days_ahead: { type: 'number', default: 7, description: 'Number of days to look ahead' }
    },
    fetch: async (userId, params = {}) => {
      const daysAhead = params.days_ahead || 7;
      return fetchScheduledWorkouts(userId, { daysAhead });
    }
  },
  
  workout_plans: {
    id: 'workout_plans',
    description: 'Multi-week workout plans',
    params: {
      status: { type: 'string', default: 'active', enum: ['active', 'completed', 'all'] }
    },
    fetch: async (userId, params = {}) => {
      const status = params.status || 'active';
      return fetchWorkoutPlans(userId, { status });
    }
  },
  
  milestone_goals: {
    id: 'milestone_goals',
    description: 'Specific achievement goals (e.g., run a 5K)',
    params: {
      status: { type: 'string', default: 'active', enum: ['active', 'achieved', 'all'] }
    },
    fetch: async (userId, params = {}) => {
      const status = params.status || 'active';
      return fetchMilestoneGoals(userId, { status });
    }
  },
  
  user_settings: {
    id: 'user_settings',
    description: 'User settings including unit preferences',
    params: null,
    fetch: async (userId) => fetchUserSettings(userId)
  }
};

module.exports = { DATA_SOURCES };
```

#### Initializer Agent Implementation

```javascript
// BACKEND/services/initializerAgent.service.js

const { openai } = require('../config/openai');
const { DATA_SOURCES } = require('../ai/dataSources');

const INITIALIZER_SYSTEM_PROMPT = `... (system prompt from above) ...`;

/**
 * Run the initializer agent to determine which data sources to append
 */
async function runInitializerAgent(userId, userMessage, existingKnowledge) {
  // Build summary of existing knowledge including params
  const existingSummary = existingKnowledge.length > 0 
    ? existingKnowledge.map(k => {
        const params = k.params ? ` (${JSON.stringify(k.params)})` : '';
        return `- ${k.source}${params}`;
      }).join('\n')
    : 'None';
  
  const userPrompt = `
<user_message>
${userMessage}
</user_message>

<knowledge_already_in_context>
${existingSummary}
</knowledge_already_in_context>

Analyze the user's message and determine if any additional data sources should be APPENDED.
Remember: You can expand existing data (e.g., more days of history) by adding with new params.
`;

  // Call the LLM
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: INITIALIZER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ]
  });

  // Parse the response
  const result = JSON.parse(response.choices[0].message.content);
  
  return {
    reasoning: result.reasoning,
    appendKnowledge: result.append_knowledge || [],
    useExisting: result.use_existing || []
  };
}

/**
 * Fetch and append selected data sources to the session
 * Uses 'knowledge' for initial injection, 'knowledge_update' for expansions
 */
async function appendKnowledge(sessionId, userId, selectedSources, existingKnowledge) {
  const knowledgeEvents = [];
  const appendedSources = []; // Track what we're adding for session update
  const existingSources = existingKnowledge.map(k => k.source);
  
  for (const selection of selectedSources) {
    const sourceId = selection.source;
    const params = selection.params || {};
    const reason = selection.reason || 'not_in_context';
    
    const dataSource = DATA_SOURCES[sourceId];
    if (!dataSource) {
      console.warn(`Unknown data source: ${sourceId}`);
      continue;
    }
    
    try {
      // Fetch the data
      const data = await dataSource.fetch(userId, params);
      
      // Determine event type: 'knowledge' for new, 'knowledge_update' for expansion
      const isExpansion = existingSources.includes(sourceId);
      const eventType = isExpansion ? 'knowledge_update' : 'knowledge';
      
      // Create knowledge event
      knowledgeEvents.push({
        type: eventType,
        source: sourceId,
        params: params,
        reason: reason,
        data: data,
        timestamp: new Date().toISOString()
      });
      
      // Track for session update
      appendedSources.push({ source: sourceId, params });
    } catch (error) {
      console.error(`Failed to fetch data source ${sourceId}:`, error);
    }
  }
  
  // Append all knowledge events to session (never replace!)
  for (const event of knowledgeEvents) {
    await appendEvent(sessionId, event);
  }
  
  // Update session's knowledge_in_context tracking
  if (appendedSources.length > 0) {
    const newKnowledgeList = [...existingKnowledge, ...appendedSources];
    await supabase
      .from('agent_sessions')
      .update({ knowledge_in_context: newKnowledgeList })
      .eq('id', sessionId);
  }
  
  return knowledgeEvents;
}

/**
 * Get list of data sources already in context with their params
 * Reads from session field (not events) - cleared on checkpoint
 */
async function getExistingKnowledge(sessionId) {
  const { data: session } = await supabase
    .from('agent_sessions')
    .select('knowledge_in_context')
    .eq('id', sessionId)
    .single();
  
  // Returns array of { source, params } objects
  // Empty array if checkpoint just occurred (data was summarized)
  return session?.knowledge_in_context || [];
}

/**
 * Main entry point: analyze message and append needed knowledge
 */
async function initializeContext(sessionId, userId, userMessage) {
  // 1. Get what's already in context (with params)
  const existingKnowledge = await getExistingKnowledge(sessionId);
  
  // 2. Run initializer agent to determine what to append
  const { reasoning, appendKnowledge, useExisting } = await runInitializerAgent(
    userId, 
    userMessage, 
    existingKnowledge
  );
  
  // 3. Fetch and append the new/expanded data sources
  const appendedEvents = await appendKnowledge(
    sessionId, 
    userId, 
    appendKnowledge, 
    existingKnowledge
  );
  
  return {
    reasoning,
    appendedSources: appendKnowledge,
    useExisting: useExisting,
    events: appendedEvents
  };
}

module.exports = {
  runInitializerAgent,
  appendKnowledge,
  getExistingKnowledge,
  initializeContext
};
```

#### Integration with Main Agent Loop

The initializer agent runs at the start of each user turn to determine if new knowledge should be appended:

```javascript
// Updated agent loop (from section 1)

async function runAgentLoop(sessionId, userId, userInput) {
  const MAX_ITERATIONS = 10;
  let iteration = 0;
  let shouldContinue = true;
  
  // Load or create session (stable prefix is built once at session creation)
  const session = await getOrCreateSession(sessionId, userId);
  
  // Check if checkpoint is needed before proceeding
  const checkpointResult = await checkAndTriggerCheckpoint(sessionId);
  if (checkpointResult) {
    sessionId = checkpointResult.id; // Use new session after checkpoint
    console.log('Checkpoint triggered, new session:', sessionId);
  }
  
  // ┌─────────────────────────────────────────────────────────────┐
  // │  RUN INITIALIZER AGENT - Determine what knowledge to APPEND │
  // └─────────────────────────────────────────────────────────────┘
  const initResult = await initializeContext(sessionId, userId, userInput);
  console.log('Initializer reasoning:', initResult.reasoning);
  console.log('Appended sources:', initResult.appendedSources.map(s => `${s.source} (${s.reason})`));
  
  // Append user message to event stream (AFTER knowledge, for cache efficiency)
  await appendEvent(sessionId, {
    type: 'user_message',
    content: userInput,
    timestamp: new Date().toISOString()
  });
  
  while (shouldContinue && iteration < MAX_ITERATIONS) {
    iteration++;
    
    // 1. Build context (stable prefix + event stream)
    const context = await buildAgentContext(sessionId, userId);
    
    // 2. Call LLM for next action
    const response = await callLLM(context);
    
    // 3. Parse tool call from response
    const toolCall = parseToolCall(response);
    
    // 4. Execute tool and get formatted result
    const { result, formattedResult } = await executeTool(toolCall, userId, sessionId);
    
    // 5. Append action + result to event stream
    await appendEvent(sessionId, {
      type: 'action',
      tool: toolCall.name,
      args: toolCall.arguments,
      timestamp: new Date().toISOString()
    });
    
    await appendEvent(sessionId, {
      type: 'result',
      tool: toolCall.name,
      formatted: formattedResult, // Pre-formatted for context (see section 4)
      raw: result, // Full result for debugging
      timestamp: new Date().toISOString()
    });
    
    // 6. Check if agent wants to idle
    if (toolCall.name === 'idle') {
      shouldContinue = false;
    }
  }
  
  return await getSessionState(sessionId);
}
```

#### Example Initializer Agent Interaction

**Example 1: Initial Workout Request**

**User Message:**
```
"I want a quick upper body workout today, maybe 30 minutes. I'm feeling a bit tired so nothing too intense."
```

**Knowledge Already in Context:**
```
(Stable prefix includes: user_profile)
(No dynamic knowledge yet - session just started)
```

**Initializer Agent Response:**
```json
{
  "reasoning": "User is requesting workout generation. Need goals (with distribution metrics) for targeting and balance, preferences for restrictions, workout history for progression (14 days), and current location for equipment.",
  "append_knowledge": [
    { "source": "category_goals", "reason": "not_in_context" },
    { "source": "muscle_goals", "reason": "not_in_context" },
    { "source": "active_preferences", "reason": "not_in_context" },
    { "source": "workout_history", "params": { "days_back": 14 }, "reason": "not_in_context" },
    { "source": "current_location", "reason": "not_in_context" }
  ],
  "use_existing": ["user_profile"]
}
```

**Example 2: Expanding Data Range (Mid-Session)**

**User Message (Turn 3):**
```
"How many workouts have I done this month? Show me my progress."
```

**Knowledge Already in Context:**
```
(Stable prefix includes: user_profile)
- category_goals (includes distribution metrics)
- muscle_goals (includes distribution metrics)
- active_preferences
- workout_history (days_back: 14)
- current_location
```

**Initializer Agent Response:**
```json
{
  "reasoning": "User wants monthly stats but workout_history only has 14 days. Need to EXPAND range to 30 days. Other data already present.",
  "append_knowledge": [
    { "source": "workout_history", "params": { "days_back": 30 }, "reason": "expand_range" }
  ],
  "use_existing": ["category_goals", "muscle_goals", "workout_history"]
}
```

The LLM will see BOTH the 14-day history (from earlier) AND the new 30-day history appended. It uses the combined information.

### 3.3 Event Stream Persistence

```sql
-- Database schema for agent sessions and events

CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  state VARCHAR(50) DEFAULT 'active', -- 'active', 'idle', 'completed', 'checkpointed', 'error'
  stable_prefix TEXT NOT NULL, -- Built once at session start, never changes
  context_start_sequence INTEGER DEFAULT 1, -- Sequence number to start reading events from (for checkpoints)
  knowledge_in_context JSONB DEFAULT '[]'::jsonb, -- Tracks which data sources have full data in context
  -- Format: [{ "source": "workout_history", "params": { "days_back": 14 } }, ...]
  -- Cleared when checkpoint triggers (data becomes summarized)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'user_message', 'action', 'result', 'knowledge', 'knowledge_update', 'checkpoint'
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sequence_number SERIAL
);

CREATE INDEX idx_agent_events_session ON agent_events(session_id, sequence_number);
CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own sessions" ON agent_sessions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can access own events" ON agent_events
  FOR ALL USING (
    session_id IN (SELECT id FROM agent_sessions WHERE user_id = auth.uid())
  );
```

### 3.4 Context Window Management

#### Overview

The context management system is optimized for **KV-cache efficiency**. With LLM inference APIs, cached input tokens cost up to 10x less than uncached tokens. To maximize cache hits, we use an **append-only architecture** where the context prefix remains stable across turns.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KV-CACHE OPTIMIZED CONTEXT                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [STABLE PREFIX - cached across all turns]                          │
│  ├── System Prompt (static)                                         │
│  ├── User Profile (static for session)                              │
│  └── User Settings (static for session)                             │
│                                                                     │
│  [SESSION BODY - append-only, never modified]                       │
│  ├── Initial Knowledge Block (goals, preferences, etc.)             │
│  ├── Turn 1: Message → Actions → Results                            │
│  ├── Turn 2: [New Knowledge] → Message → Actions → Results          │
│  ├── Turn 3: Message → Actions → Results                            │
│  └── Current Turn: Message ← (only new tokens processed)            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- **Stable Prefix**: Put static/rarely-changing data at the beginning so it can be cached
- **Append-Only**: Never modify or truncate existing content; only add new events at the end
- **Checkpoint on Limit**: When context approaches the limit, do a one-time compression
- **Efficient Formatting**: Use concise formats from the start (not truncated later)

#### 3.4.1 Stable Prefix

The stable prefix is built **once** when a session starts and never changes during the session. This ensures maximum KV-cache hits.

**What goes in the stable prefix:**
- System prompt (always static)
- User profile (name, body stats, unit preferences)

**What goes in the dynamic session body (via Initializer Agent):**
- Category goals (can be updated mid-session)
- Muscle goals (can be updated mid-session)
- Workout history, preferences, distribution metrics, etc.

```javascript
// BACKEND/services/sessionManager.service.js

async function buildStablePrefix(userId) {
  // Fetch user data ONCE at session start
  // Note: Goals are NOT included here - they're dynamic and injected by Initializer Agent
  const profile = await fetchUserProfile(userId);
  const settings = await fetchUserSettings(userId);
  
  // Format into stable prefix string (minimal, static data only)
  return `
<user_profile>
Name: ${profile.name}
Body: ${profile.sex}, ${profile.age}y, ${profile.height_cm}cm, ${profile.weight_kg}kg${profile.body_fat_pct ? `, ${profile.body_fat_pct}% BF` : ''}
Units: ${settings.weight_unit}/${settings.distance_unit}
</user_profile>
`.trim();
}

// Store the stable prefix in the session record
async function createSession(userId) {
  const stablePrefix = await buildStablePrefix(userId);
  
  const { data: session } = await supabase
    .from('agent_sessions')
    .insert({
      user_id: userId,
      stable_prefix: stablePrefix,
      state: 'active',
      knowledge_in_context: [] // Initialize empty - populated by Initializer Agent
    })
    .select()
    .single();
  
  return session;
}
```

#### 3.4.2 Append-Only Event Stream

Events are **only appended**, never modified or removed. This preserves the context prefix for KV-cache hits.

**Event types:**
- `<user_message>` - User's input
- `<action>` - Tool call made by the agent
- `<result>` - Tool execution result (formatted per-tool, see section 4)
- `<knowledge_update>` - New knowledge appended (not replacing old)

```javascript
// BACKEND/services/eventStream.service.js

async function appendEvent(sessionId, event) {
  const { data } = await supabase
    .from('agent_events')
    .insert({
      session_id: sessionId,
      event_type: event.type,
      event_data: event.data,
      // sequence_number auto-increments
    })
    .select()
    .single();
  
  return data;
}

// Events are NEVER deleted or modified during a session
// They are only appended at the end
```

**Knowledge Updates (Append, Not Replace):**

When new knowledge is needed (e.g., user asks for monthly stats but only 14-day history is loaded), we APPEND a new knowledge block rather than replacing the old one:

```xml
<!-- Initial injection at session start -->
<knowledge source="workout_history" timestamp="2025-01-11T10:00:00Z">
  Mon Jan 6: Bench Press 4x8 @70kg
  Mon Jan 6: Barbell Rows 4x8 @60kg
  ... (14 days of history)
</knowledge>

<!-- Later in session, user asks about monthly stats -->
<knowledge_update source="workout_history" timestamp="2025-01-11T10:30:00Z" reason="expanded to 30 days">
  Dec 20: Squats 4x6 @95kg
  Dec 18: Deadlift 3x5 @120kg
  ... (additional exercises from days 15-30)
</knowledge_update>
```

The LLM sees BOTH and uses the combined information. The old knowledge is still cached.

#### 3.4.3 Checkpoint System

When the context approaches the limit (~80% of max tokens), trigger a **checkpoint** to compress the history. The checkpoint creates a summary event and updates `context_start_sequence` so future context builds start from the checkpoint. All previous events remain in the database for history/debugging.

**Flow:**
1. Session starts with `context_start_sequence = 1`
2. Events accumulate (sequence 1, 2, 3... 47)
3. Checkpoint triggered when context exceeds threshold
4. Checkpoint summary event created at sequence 48
5. `context_start_sequence` updated to 48
6. Context builder now starts from event 48, ignoring 1-47
7. All events 1-47 remain in database for history/debugging

```javascript
// BACKEND/services/checkpoint.service.js

const CONTEXT_LIMIT = 100000; // tokens (adjust per model)
const CHECKPOINT_THRESHOLD = 0.8; // 80%

async function checkAndTriggerCheckpoint(sessionId) {
  const session = await getSession(sessionId);
  const startSeq = session.context_start_sequence || 1;
  const events = await getSessionEvents(sessionId, startSeq);
  
  const estimatedTokens = estimateContextTokens(session, events);
  
  if (estimatedTokens > CONTEXT_LIMIT * CHECKPOINT_THRESHOLD) {
    return await createCheckpoint(sessionId, session, events);
  }
  
  return null;
}

async function createCheckpoint(sessionId, session, events) {
  const startSeq = session.context_start_sequence || 1;
  const endSeq = events[events.length - 1].sequence_number;
  
  // 1. Generate simple event summary list
  const eventsSummary = summarizeEvents(events);
  
  // 2. Extract current state
  const currentState = await extractCurrentState(events, session.user_id);
  
  // 3. Create checkpoint event
  const checkpointEvent = await appendEvent(sessionId, {
    type: 'checkpoint',
    data: {
      events_summarized: `${startSeq}-${endSeq}`,
      events: eventsSummary,
      current_state: currentState,
      created_at: new Date().toISOString()
    }
  });
  
  // 4. Update session to start from checkpoint and clear knowledge tracking
  await supabase
    .from('agent_sessions')
    .update({ 
      context_start_sequence: checkpointEvent.sequence_number,
      knowledge_in_context: [] // Clear - data is now just summarized, Initializer must re-fetch
    })
    .eq('id', sessionId);
  
  return checkpointEvent;
}

/**
 * Compress events into a simple numbered list
 */
function summarizeEvents(events) {
  return events.map((event, i) => {
    const line = formatEventLine(event);
    return `${i + 1}. ${line}`;
  }).join('\n');
}

/**
 * Format a single event into a short line
 */
function formatEventLine(event) {
  const type = event.event_type;
  const data = event.event_data;
  
  switch (type) {
    case 'user_message':
      return `user: "${truncate(data.content, 40)}"`;
    
    case 'action':
      return `action: ${data.tool}`;
    
    case 'result':
      return `result: ${truncate(data.formatted || 'ok', 30)}`;
    
    case 'knowledge':
      return `knowledge: ${data.source}`;
    
    case 'knowledge_update':
      return `knowledge_update: ${data.source} (${data.reason})`;
    
    default:
      return `${type}`;
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

/**
 * Extract current state from events
 */
async function extractCurrentState(events, userId) {
  // Look for active workout, preferences, etc.
  const state = {};
  
  // Find current workout status
  const workoutSession = await fetchCurrentWorkoutSession(userId);
  if (workoutSession?.exercises?.length) {
    const completed = workoutSession.exercises.filter(e => e.completed).length;
    const remaining = workoutSession.exercises.filter(e => !e.completed).map(e => e.name);
    state.workout_in_progress = `${completed}/${workoutSession.exercises.length} complete`;
    if (remaining.length) state.remaining = remaining.join(', ');
  }
  
  // Find active temporary preferences
  const prefs = await fetchActivePreferences(userId);
  const tempPrefs = prefs.filter(p => p.expire_time || p.delete_after_call);
  if (tempPrefs.length) {
    state.temp_preferences = tempPrefs.map(p => `${p.type}: ${p.description}`).join('; ');
  }
  
  return state;
}
```

**Checkpoint Format:**

```xml
<checkpoint sequence="31" events_summarized="1-30">
  <events>
    1. knowledge: category_goals
    2. knowledge: muscle_goals
    3. knowledge: active_preferences
    4. knowledge: workout_history
    5. knowledge: current_location
    6. user: "Give me a quick upper body workout..."
    6. action: message_notify_user
    7. result: ok
    8. action: set_preference
    9. result: saved: intensity - Lower intensity...
    10. action: generate_workout
    11. result: 5 exercises generated
    12. action: message_notify_user
    13. result: ok
    14. action: idle
    15. knowledge: current_workout_session
    16. user: "Can you swap out the tricep kickbacks..."
    17. action: replace_workout_exercise
    18. result: swapped: Tricep Kickbacks → Overhead...
    19. action: idle
    20. user: "Done with the first three exercises..."
    21. action: mark_exercise_complete
    22. result: logged: Bench Press 3x10 @25kg
    23. action: mark_exercise_complete
    24. result: logged: Rows 3x10 @18kg
    25. action: mark_exercise_complete
    26. result: logged: Shoulder Press 3x10 @12kg
  </events>
  <current_state>
    workout_in_progress: 3/5 complete
    remaining: Bicep Curls, Overhead Extensions
  </current_state>
</checkpoint>
```

#### 3.4.4 Context Builder

The context builder assembles the final context for each LLM call. It respects `context_start_sequence` to start from the checkpoint if one exists.

```javascript
// BACKEND/services/contextBuilder.service.js

async function buildAgentContext(sessionId, userId) {
  const session = await getSession(sessionId);
  
  // Start from checkpoint sequence if set
  const startSequence = session.context_start_sequence || 1;
  
  // Fetch events from checkpoint onward
  const { data: events } = await supabase
    .from('agent_events')
    .select('*')
    .eq('session_id', sessionId)
    .gte('sequence_number', startSequence)
    .order('sequence_number', { ascending: true });
  
  // 1. Start with stable prefix (from session record)
  let context = session.stable_prefix;
  
  // 2. Add all events from checkpoint onward
  // If starting from checkpoint, the first event IS the checkpoint summary
  context += '\n\n<event_stream>\n';
  
  for (const event of events) {
    context += formatEvent(event) + '\n';
  }
  
  context += '</event_stream>';
  
  return context;
}

function formatEvent(event) {
  switch (event.event_type) {
    case 'user_message':
      return `<user_message>${event.event_data.content}</user_message>`;
    
    case 'action':
      return `<action tool="${event.event_data.tool}">${JSON.stringify(event.event_data.args)}</action>`;
    
    case 'result':
      // Results use per-tool formatting (see section 4)
      return event.event_data.formatted;
    
    case 'knowledge':
    case 'knowledge_update':
      return formatKnowledge(event);
    
    case 'checkpoint':
      return formatCheckpoint(event.event_data);
    
    default:
      return `<event type="${event.event_type}">${JSON.stringify(event.event_data)}</event>`;
  }
}

function formatCheckpoint(data) {
  let result = `<checkpoint events_summarized="${data.events_summarized}">\n`;
  result += `  <events>\n    ${data.events.replace(/\n/g, '\n    ')}\n  </events>\n`;
  if (data.current_state) {
    result += '  <current_state>\n';
    for (const [key, value] of Object.entries(data.current_state)) {
      result += `    ${key}: ${value}\n`;
    }
    result += '  </current_state>\n';
  }
  result += '</checkpoint>';
  return result;
}
```

#### 3.4.5 Data Source Formatters

Each data source has a concise formatter. Since we don't truncate over time, we use these formats from the start:

```javascript
// BACKEND/ai/dataFormatters.js

const formatters = {
  workout_history: (data, params = {}) => {
    const exercises = data.slice(0, params.limit || 15);
    const formatted = exercises.map(ex => {
      const date = new Date(ex.performed_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      let details = `${ex.exercise_name} (${ex.exercise_type})`;
      if (ex.sets && ex.reps) details += ` ${ex.sets}x${ex.reps}`;
      if (ex.load_kg) details += ` @${ex.load_kg}kg`;
      if (ex.duration_min) details += ` ${ex.duration_min}min`;
      if (ex.rpe) details += ` RPE:${ex.rpe}`;
      return `  ${date}: ${details}`;
    }).join('\n');
    return `<workout_history count="${exercises.length}">\n${formatted}\n</workout_history>`;
  },
  
  current_workout_session: (data) => {
    if (!data?.exercises?.length) return '<current_workout>No active workout</current_workout>';
    const exercises = data.exercises.map((ex, i) => {
      const status = ex.completed ? '✓' : '○';
      let details = `${status} ${i + 1}. ${ex.name} (${ex.type})`;
      if (ex.sets && ex.reps) details += ` ${ex.sets}x${ex.reps}`;
      if (ex.load_kg) details += ` @${ex.load_kg}kg`;
      return `  ${details}`;
    }).join('\n');
    const completed = data.exercises.filter(e => e.completed).length;
    return `<current_workout>\nProgress: ${completed}/${data.exercises.length}\n${exercises}\n</current_workout>`;
  },
  
  active_preferences: (data) => {
    if (!data?.length) return '<preferences>None active</preferences>';
    const temp = data.filter(p => p.expire_time || p.delete_after_call);
    const perm = data.filter(p => !p.expire_time && !p.delete_after_call);
    let result = '<preferences>\n';
    if (temp.length) {
      result += '  Temporary:\n';
      temp.forEach(p => result += `    - ${p.type}: ${p.description}\n`);
    }
    if (perm.length) {
      result += '  Permanent:\n';
      perm.forEach(p => result += `    - ${p.type}: ${p.description}\n`);
    }
    return result + '</preferences>';
  },
  
  category_goals: (data) => {
    // data = { goals: [...], distribution: {...} }
    let result = '<category_goals>\n';
    result += '  Goals:\n';
    data.goals.forEach(g => result += `    ${g.category}: ${(g.weight * 100).toFixed(0)}% target\n`);
    result += '  Distribution:\n';
    data.distribution.categories.forEach(c => {
      result += `    ${c.category}: ${(c.actual * 100).toFixed(0)}% actual (${(c.target * 100).toFixed(0)}% target), debt: ${c.debt > 0 ? '+' : ''}${(c.debt * 100).toFixed(0)}%\n`;
    });
    return result + '</category_goals>';
  },
  
  muscle_goals: (data) => {
    // data = { goals: [...], distribution: {...} }
    let result = '<muscle_goals>\n';
    result += '  Goals:\n';
    data.goals.forEach(g => result += `    ${g.muscle}: ${(g.weight * 100).toFixed(0)}% target\n`);
    result += '  Distribution:\n';
    data.distribution.muscles.forEach(m => {
      result += `    ${m.muscle}: ${(m.actual * 100).toFixed(0)}% actual (${(m.target * 100).toFixed(0)}% target), debt: ${m.debt > 0 ? '+' : ''}${(m.debt * 100).toFixed(0)}%\n`;
    });
    return result + '</muscle_goals>';
  },
  
  scheduled_workouts: (data) => {
    if (!data?.length) return '<schedule>No upcoming workouts</schedule>';
    const upcoming = data.slice(0, 7).map(w => {
      const date = new Date(w.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `  ${date}: ${w.workout_type}${w.duration_minutes ? ` (${w.duration_minutes}min)` : ''}`;
    }).join('\n');
    return `<schedule>\n${upcoming}\n</schedule>`;
  }
};

module.exports = formatters;
```

#### 3.4.6 Context Management Summary

| Component | Location | Cache Behavior |
|-----------|----------|----------------|
| System prompt | Stable prefix | Always cached |
| User profile | Stable prefix | Cached for session |
| Goals (category/muscle) | Dynamic knowledge events | Cached after first injection |
| Initial knowledge | After prefix | Cached from turn 2+ |
| Knowledge updates | Appended | Cached after first use |
| User messages | Appended | Cached from next turn |
| Actions/results | Appended | Cached from next turn |
| Checkpoint summary | Start of new session | Cached for new session |

**Cost Savings Example:**

With GPT-4o pricing ($2.50/MTok input, $0.625/MTok cached):
- **Turn 1**: 8,000 tokens all new = $0.020
- **Turn 2**: 7,500 cached + 500 new = $0.006
- **Turn 3**: 8,000 cached + 500 new = $0.006
- **Turn 10**: 10,000 cached + 500 new = $0.008

Compared to rebuilding context each turn: **~70% cost reduction**

---

## 4. Toolset

### 4.1 Communication Tools

```javascript
const communicationTools = [
      {
        type: "function",
        function: {
          name: "message_notify_user",
      description: "Send a message to user without requiring a response. Use for acknowledging receipt, providing progress updates, reporting completion, displaying workouts, or explaining strategy changes.",
          parameters: {
            type: "object",
            properties: {
              text: {
                type: "string",
            description: "Message text to display to user"
              },
              attachments: {
            type: "array",
            items: { type: "string" },
            description: "(Optional) IDs of displayables to show. Use workout IDs (e.g., 'workout_1') to show a full workout, or exercise IDs (e.g., 'ex_001') to highlight individual exercises. See Displayables System below."
          }
        },
        required: ["text"]
      }
    }
      },
      {
        type: "function",
        function: {
          name: "message_ask_user",
      description: "Ask user a question and wait for response. Use for requesting clarification, seeking confirmation, or gathering missing information. This PAUSES the agent loop until user responds.",
          parameters: {
            type: "object",
            properties: {
              text: {
                type: "string",
            description: "Question text to present to user"
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "(Optional) Suggested response options for quick selection"
          }
        },
        required: ["text"]
      }
    }
  }
];
```

### 4.1.1 Displayables System

The **Displayables System** allows the agent to control when and how data is shown to the user. When tools like `generate_workout` create data, that data is registered in the session state with a unique ID. The agent can then reference these IDs in `message_notify_user` attachments to display the data to the user.

#### How It Works

1. **Registration**: When `generate_workout` runs, the workout and its exercises are registered in `session.displayables`
2. **Reference**: Agent uses IDs in `attachments` array (e.g., `["workout_1"]` or `["ex_001"]`)
3. **Resolution**: Backend resolves IDs to full data before sending to frontend
4. **Display**: Frontend receives resolved data and renders appropriate UI components

#### Session State Structure

```javascript
session.displayables = {
  workouts: {
    "workout_1": {
      exercise_ids: ["ex_001", "ex_002", "ex_003", "ex_004", "ex_005"],
      metadata: { focus: "upper body", duration_min: 30, intensity: "light" }
    },
    "workout_2": { ... }
  },
  exercises: {
    "ex_001": { id: "ex_001", name: "Bench Press", type: "reps", sets: 3, reps: [10, 10, 10], load: 40, load_unit: "kg", ... },
    "ex_002": { id: "ex_002", name: "Bent Over Rows", type: "reps", sets: 3, reps: [10, 10, 10], load: 35, load_unit: "kg", ... },
    // ... all exercises from all workouts in this session
  }
}
```

#### Displayable Types

| Type | ID Pattern | Source | Description |
|------|------------|--------|-------------|
| `workout` | `workout_1`, `workout_2`, etc. | `generate_workout` tool | Full workout with all exercises |
| `exercise` | `ex_001`, `ex_abc123`, etc. | Individual items from workouts | Single exercise for highlighting |

#### Usage Examples

**Display a full workout:**
```xml
<action tool="message_notify_user">
{
  "text": "Here's your 30-minute upper body session!",
  "attachments": ["workout_1"]
}
</action>
```

**Highlight a specific exercise:**
```xml
<action tool="message_notify_user">
{
  "text": "I'd especially recommend this one for your shoulder goals:",
  "attachments": ["ex_003"]
}
</action>
```

**Display workout with a highlighted exercise:**
```xml
<action tool="message_notify_user">
{
  "text": "Here's the full workout. Pay special attention to the Romanian Deadlifts for your hamstring goal:",
  "attachments": ["workout_1", "ex_004"]
}
</action>
```

#### Backend Resolution

When processing `message_notify_user`, the backend resolves attachment IDs:

```javascript
function resolveAttachments(attachmentIds, session) {
  return attachmentIds.map(id => {
    // Check workouts first
    if (session.displayables.workouts[id]) {
      const workout = session.displayables.workouts[id];
      return { 
        type: "workout", 
        id,
        data: {
          metadata: workout.metadata,
          exercises: workout.exercise_ids.map(exId => session.displayables.exercises[exId])
        }
      };
    }
    // Check individual exercises
    if (session.displayables.exercises[id]) {
      return { 
        type: "exercise", 
        id,
        data: session.displayables.exercises[id] 
      };
    }
    // Unknown ID - log warning, return null
    console.warn(`Unknown displayable ID: ${id}`);
    return null;
  }).filter(Boolean);
}
```

#### What Frontend Receives (SSE)

```javascript
data: {
  "type": "message",
  "text": "Here's your 30-minute upper body session!",
  "attachments": [
    {
      "type": "workout",
      "id": "workout_1",
      "data": {
        "metadata": { "focus": "upper body", "duration_min": 30, "intensity": "light" },
        "exercises": [
          { "id": "ex_001", "name": "Bench Press", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 40, "load_unit": "kg", ... },
          { "id": "ex_002", "name": "Bent Over Rows", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 35, "load_unit": "kg", ... },
          ...
        ]
      }
    }
  ]
}
```

#### Key Design Principles

1. **Agent has full control** - Data only appears when the agent explicitly attaches it
2. **Simple references** - Agent just uses string IDs, no complex objects
3. **Flexible granularity** - Can show whole workouts or individual exercises
4. **Session-scoped** - Displayables are cleared when session ends
5. **Frontend-agnostic** - Backend resolves everything; frontend just renders what it receives

### 4.2 Data Retrieval Tools

#### Batch Data Fetch Tool

The `fetch_data` tool allows the agent to retrieve multiple data sources in a single call. This saves iterations when the agent needs additional context mid-conversation.

```javascript
{
  type: "function",
  function: {
    name: "fetch_data",
    description: "Fetch multiple data sources in one call. Use when you need additional context that wasn't automatically injected. Each source is optional - only include sources you need.",
    parameters: {
      type: "object",
      properties: {
        user_profile: {
          type: "object",
          description: "Basic user info (name, body stats, units)",
          properties: {
            fetch: { type: "boolean", description: "Set to true to fetch this data" }
          },
          required: ["fetch"]
        },
        category_goals: {
          type: "object",
          description: "User's fitness category goals with weights AND distribution metrics (actual vs target %, debt)",
          properties: {
            fetch: { type: "boolean" }
          },
          required: ["fetch"]
        },
        muscle_goals: {
          type: "object",
          description: "User's muscle group goals with weights AND distribution metrics (actual vs target %, debt)",
          properties: {
            fetch: { type: "boolean" }
          },
          required: ["fetch"]
        },
        active_preferences: {
          type: "object",
          description: "Active temporary and permanent user preferences",
          properties: {
            fetch: { type: "boolean" }
          },
          required: ["fetch"]
        },
        workout_history: {
          type: "object",
          description: "Recent workout history for progression and analysis",
          properties: {
            fetch: { type: "boolean" },
            days_back: { type: "number", description: "Days of history (default: 14)" }
          },
          required: ["fetch"]
        },
        current_location: {
          type: "object",
          description: "User's current location with available equipment",
          properties: {
            fetch: { type: "boolean" }
          },
          required: ["fetch"]
        },
        current_workout_session: {
          type: "object",
          description: "Active workout in progress with exercises and completion status",
          properties: {
            fetch: { type: "boolean" }
          },
          required: ["fetch"]
        },
        scheduled_workouts: {
          type: "object",
          description: "Future scheduled workouts",
          properties: {
            fetch: { type: "boolean" },
            days_ahead: { type: "number", description: "Days to look ahead (default: 7)" }
          },
          required: ["fetch"]
        },
        workout_plans: {
          type: "object",
          description: "Multi-week workout plans",
          properties: {
            fetch: { type: "boolean" },
            status: { type: "string", enum: ["active", "completed", "all"], description: "Filter by status (default: active)" }
          },
          required: ["fetch"]
        },
        milestone_goals: {
          type: "object",
          description: "Specific achievement goals (e.g., run a 5K)",
          properties: {
            fetch: { type: "boolean" },
            status: { type: "string", enum: ["active", "achieved", "all"], description: "Filter by status (default: active)" }
          },
          required: ["fetch"]
        }
      }
    }
  }
}
```

**Example Usage:**
```json
{
  "tool": "fetch_data",
  "args": {
    "workout_history": { "fetch": true, "days_back": 30 },
    "category_goals": { "fetch": true },
    "active_preferences": { "fetch": true }
  }
}
```

**Implementation:**
```javascript
// BACKEND/ai/tools/fetchData.js

async function executeFetchData(args, userId, sessionId) {
  const results = {};
  const appendedSources = [];
  
  for (const [source, config] of Object.entries(args)) {
    if (config?.fetch) {
      const dataSource = DATA_SOURCES[source];
      if (!dataSource) continue;
      
      // Extract params (everything except 'fetch')
      const params = { ...config };
      delete params.fetch;
      
      try {
        const data = await dataSource.fetch(userId, params);
        results[source] = data;
        appendedSources.push({ source, params });
        
        // Append as knowledge event
        await appendEvent(sessionId, {
          type: 'knowledge',
          source,
          params,
          data,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Failed to fetch ${source}:`, error);
        results[source] = { error: error.message };
      }
    }
  }
  
  // Update session's knowledge tracking
  if (appendedSources.length > 0) {
    const { data: session } = await supabase
      .from('agent_sessions')
      .select('knowledge_in_context')
      .eq('id', sessionId)
      .single();
    
    const existing = session?.knowledge_in_context || [];
    await supabase
      .from('agent_sessions')
      .update({ knowledge_in_context: [...existing, ...appendedSources] })
      .eq('id', sessionId);
  }
  
  return results;
}

module.exports = { executeFetchData };
```

**Observation Format:** Category 3 (Full Data Required) - returns all fetched data so the agent can analyze it.

---

### 4.3 Goal Management Tools

Goal management uses a single tool. The agent reads current goals via `fetch_data` (Section 4.2) and updates them with `set_goals`. The agent determines the weight distribution directly—no backend AI parsing.

```javascript
{
  type: "function",
  function: {
    name: "set_goals",
    description: "Set user's fitness goals. Use fetch_data first to see current goals. Percentages should roughly sum to 100 (auto-normalized). For categories, create any names you want. For muscles, use the 16 preset names.",
    parameters: {
      type: "object",
      properties: {
        goal_type: {
          type: "string",
          enum: ["category", "muscle"],
          description: "Which type of goals to set"
        },
        category_goals: {
          type: "array",
          description: "Required when goal_type is 'category'",
          items: {
            type: "object",
            properties: {
              category: { type: "string", description: "Category name (e.g., 'Strength', 'Zone 2 Cardio')" },
              description: { type: "string", description: "What this category means" },
              percentage: { type: "number", description: "Weight as percentage (e.g., 50 for 50%)" }
            },
            required: ["category", "percentage"]
          }
        },
        muscle_goals: {
          type: "object",
          description: "Required when goal_type is 'muscle'. Map muscle names to percentages.",
          properties: {
            "Chest": { type: "number" }, "Back": { type: "number" },
            "Shoulders": { type: "number" }, "Biceps": { type: "number" },
            "Triceps": { type: "number" }, "Abs": { type: "number" },
            "Lower Back": { type: "number" }, "Quadriceps": { type: "number" },
            "Hamstrings": { type: "number" }, "Glutes": { type: "number" },
            "Calves": { type: "number" }, "Trapezius": { type: "number" },
            "Abductors": { type: "number" }, "Adductors": { type: "number" },
            "Forearms": { type: "number" }, "Neck": { type: "number" }
          }
        }
      },
      required: ["goal_type"]
    }
  }
}
```

**Example Flow:**

User: *"I'm doing too much cardio"*

```
1. Agent calls fetch_data({ category_goals: { fetch: true } })
   -> Returns: [{ category: "Strength", percentage: 40 }, { category: "Cardio", percentage: 40 }, ...]

2. Agent determines new distribution based on user's request

3. Agent calls set_goals({
     goal_type: "category",
     category_goals: [
       { category: "Strength", description: "Compound lifts and progressive overload", percentage: 55 },
       { category: "Cardio", description: "Aerobic conditioning", percentage: 25 },
       { category: "Flexibility", description: "Stretching and mobility work", percentage: 20 }
     ]
   })
```

### 4.4 Preference Tools

Preference management uses two tools. The agent reads current preferences via `fetch_data({ active_preferences: { fetch: true } })` and creates/deletes them directly.

```javascript
{
  type: "function",
  function: {
    name: "set_preference",
    description: "Save a user preference. Determine the type and temporal behavior based on what the user said.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["workout", "injury", "time", "equipment", "intensity", "muscle_group", "exercise", "goal", "recovery", "other"],
          description: "Category of preference"
        },
        description: {
          type: "string",
          description: "What the user wants or doesn't want"
        },
        guidance: {
          type: "string",
          description: "How this affects workout recommendations"
        },
        expires_at: {
          type: "string",
          description: "ISO timestamp when preference expires (omit for permanent or immediate)"
        },
        delete_after_use: {
          type: "boolean",
          description: "True for immediate requests, deleted after next workout generation"
        }
      },
      required: ["type", "description", "guidance"]
    }
  }
},
{
  type: "function",
  function: {
    name: "delete_preference",
    description: "Delete a preference by ID.",
    parameters: {
      type: "object",
      properties: {
        preference_id: { type: "string" }
      },
      required: ["preference_id"]
    }
  }
}
```

**Example Flow:**

User: *"My shoulder is bothering me, avoid it for the next 2 weeks"*

```
Agent calls set_preference({
  type: "injury",
  description: "Shoulder pain - temporary avoidance",
  guidance: "Exclude all shoulder-focused exercises",
  expires_at: "2026-01-27T00:00:00.000Z"
})
```

User: *"I don't like burpees"*

```
Agent calls set_preference({
  type: "exercise",
  description: "User dislikes burpees",
  guidance: "Never include burpees in recommendations"
})
```

### 4.5 Exercise Logging Tools

These tools handle logging completed exercises and maintaining workout history.

```javascript
const exerciseLoggingTools = [
  {
    type: "function",
    function: {
      name: "log_completed_exercise",
      description: "Log a completed exercise to the user's workout history. Updates distribution tracking automatically.",
      parameters: {
        type: "object",
        properties: {
          exercise_name: {
            type: "string",
            description: "Name of the exercise"
          },
          exercise_type: {
            type: "string",
            enum: ["strength", "bodyweight", "cardio_distance", "cardio_time", "hiit", "circuit", "flexibility", "yoga", "isometric", "balance", "sport_specific"],
            description: "Type of exercise"
          },
              sets: { type: "number" },
              reps: { type: "number" },
          load_kg: { type: "number", description: "Weight used in kg (will be converted based on user preference)" },
          duration_min: { type: "number", description: "Duration in minutes" },
          distance_km: { type: "number", description: "Distance in km (will be converted based on user preference)" },
          rpe: { type: "number", description: "Rate of Perceived Exertion (1-10)" },
          muscles_utilized: {
            type: "array",
            items: { type: "string" },
            description: "Muscle groups worked"
          },
          goals_addressed: {
            type: "array",
            items: { type: "string" },
            description: "Category goals this exercise contributes to"
          },
          notes: { type: "string" }
        },
        required: ["exercise_name", "exercise_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "undo_logged_exercise",
      description: "Delete a logged exercise from history. Use when user made a mistake or logged wrong exercise.",
      parameters: {
        type: "object",
        properties: {
          exercise_id: {
            type: "string",
            description: "UUID of the logged exercise to delete"
          }
        },
        required: ["exercise_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mark_exercise_complete",
      description: "Mark an exercise from the current workout session as complete with actual performance data.",
      parameters: {
        type: "object",
        properties: {
          exercise_id: {
            type: "string",
            description: "ID of the exercise in current session"
          },
          actual_sets: { type: "number" },
          actual_reps: { type: "number" },
          actual_load_kg: { type: "number" },
          actual_duration_min: { type: "number" },
          rpe: { type: "number" },
          notes: { type: "string" }
        },
        required: ["exercise_id"]
      }
    }
  }
];
```

### 4.6 Timer Tools

These tools generate workout timers and interval data. They integrate with the existing `interval.service.js`.

```javascript
const timerTools = [
      {
        type: "function",
        function: {
      name: "generate_exercise_timer",
      description: "Generate timer/interval data for a single exercise with appropriate phases (work, rest, hold, transition).",
          parameters: {
            type: "object",
            properties: {
          exercise_name: { type: "string" },
          exercise_type: {
            type: "string",
            enum: ["strength", "bodyweight", "cardio_distance", "cardio_time", "hiit", "circuit", "flexibility", "yoga", "isometric", "balance", "sport_specific"]
          },
              sets: { type: "number" },
              reps: { type: "number" },
          rest_seconds: { type: "number", description: "Rest between sets" },
          work_duration_seconds: { type: "number", description: "For timed exercises" },
          notes: { type: "string", description: "Special instructions or form cues" }
        },
        required: ["exercise_name", "exercise_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_workout_timers",
      description: "Generate timer data for multiple exercises in a workout. Returns array of timer objects.",
      parameters: {
        type: "object",
        properties: {
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                exercise_name: { type: "string" },
                exercise_type: { type: "string" },
                sets: { type: "number" },
                reps: { type: "number" },
              rest_seconds: { type: "number" },
                work_duration_seconds: { type: "number" }
              },
              required: ["exercise_name", "exercise_type"]
            }
          }
        },
        required: ["exercises"]
      }
    }
  }
];
```

**Timer Phase Schema:**
```javascript
{
  exercise_name: string,
  exercise_type: string,
  total_duration_sec: number,
  phases: [
    {
      phase_type: "work" | "rest" | "hold" | "transition",
      duration_sec: number,
      cue: string,           // e.g., "Bench Press - Set 1"
      detail: string,        // e.g., "8 reps at 60kg"
      countdown: boolean,    // Whether to show countdown
      set_number: number     // Optional, for multi-set exercises
    }
  ]
}
```

### 4.7 Calendar & Scheduling Tools

These tools handle scheduled workouts and multi-week planning.

```javascript
const calendarTools = [
  {
    type: "function",
    function: {
      name: "schedule_workout",
      description: "Schedule a workout for a future date/time.",
      parameters: {
        type: "object",
        properties: {
          scheduled_date: {
            type: "string",
            description: "ISO date string for when the workout should occur"
          },
          workout_type: {
            type: "string",
            description: "Type of workout (e.g., 'Upper Body Strength', 'Cardio', 'Full Body')"
          },
          duration_minutes: {
            type: "number",
            description: "Expected duration of the workout"
          },
              notes: {
                type: "string",
            description: "Additional notes or focus areas"
          },
          exercises: {
            type: "array",
            items: { type: "object" },
            description: "Optional: pre-planned exercises for this workout"
          }
        },
        required: ["scheduled_date", "workout_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_scheduled_workout",
      description: "Modify an existing scheduled workout.",
      parameters: {
        type: "object",
        properties: {
          workout_id: { type: "string" },
          scheduled_date: { type: "string" },
          workout_type: { type: "string" },
          duration_minutes: { type: "number" },
          notes: { type: "string" },
          exercises: { type: "array", items: { type: "object" } }
        },
        required: ["workout_id"]
      }
    }
      },
      {
        type: "function",
        function: {
      name: "delete_scheduled_workout",
      description: "Remove a scheduled workout from the calendar.",
          parameters: {
            type: "object",
            properties: {
          workout_id: {
                type: "string",
            description: "UUID of the scheduled workout to delete"
          }
        },
        required: ["workout_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_workout_plan",
      description: "Create a multi-day or multi-week workout plan. Use for users who want to plan ahead or work toward a specific goal.",
      parameters: {
        type: "object",
        properties: {
          plan_name: {
            type: "string",
            description: "Name of the plan (e.g., '5K Training Plan', '4-Week Strength Program')"
          },
          start_date: {
            type: "string",
            description: "When the plan starts (ISO date)"
          },
          duration_weeks: {
            type: "number",
            description: "How many weeks the plan spans"
          },
          goal_description: {
            type: "string",
            description: "What the user wants to achieve"
          },
          workouts_per_week: {
            type: "number",
            description: "How many workouts per week"
          },
          preferred_days: {
            type: "array",
            items: { type: "string" },
            description: "Preferred workout days (e.g., ['Monday', 'Wednesday', 'Friday'])"
          }
        },
        required: ["plan_name", "start_date", "duration_weeks", "goal_description"]
      }
    }
  }
];
```

**Database Schema for Scheduling:**

```sql
CREATE TABLE scheduled_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ NOT NULL,
  workout_type VARCHAR(100),
  duration_minutes INT,
  notes TEXT,
  exercises JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'completed', 'skipped', 'cancelled'
  plan_id UUID REFERENCES workout_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name VARCHAR(200),
  goal_description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'paused', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE milestone_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_name VARCHAR(200), -- e.g., "Run a 5K"
  goal_type VARCHAR(100), -- 'distance', 'weight', 'time', 'event', 'other'
  target_value DECIMAL,
  target_unit VARCHAR(50),
  target_date DATE,
  current_value DECIMAL,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'achieved', 'abandoned'
  plan_id UUID REFERENCES workout_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  achieved_at TIMESTAMPTZ
);

CREATE INDEX idx_scheduled_workouts_user_date ON scheduled_workouts(user_id, scheduled_date);
CREATE INDEX idx_workout_plans_user ON workout_plans(user_id, status);
CREATE INDEX idx_milestone_goals_user ON milestone_goals(user_id, status);
```

### 4.8 Statistics & Analytics Tools

These tools provide workout analytics by querying the workout history and distribution tracking.

```javascript
const analyticsTools = [
      {
        type: "function",
        function: {
      name: "get_workout_statistics",
      description: "Calculate comprehensive workout statistics for the user. Returns totals, averages, and breakdowns.",
          parameters: {
            type: "object",
        properties: {
          time_period: {
            type: "string",
            enum: ["week", "month", "quarter", "year", "all_time"],
            description: "Time period for statistics (default: month)"
          },
          start_date: {
            type: "string",
            description: "Custom start date (ISO format)"
          },
          end_date: {
            type: "string",
            description: "Custom end date (ISO format)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_exercise_breakdown",
      description: "Get detailed breakdown of exercises by category, muscle group, or exercise type.",
      parameters: {
        type: "object",
        properties: {
          breakdown_type: {
            type: "string",
            enum: ["category", "muscle", "exercise_type", "exercise_name"],
            description: "How to group the breakdown"
          },
          time_period: {
            type: "string",
            enum: ["week", "month", "quarter", "year", "all_time"]
          }
        },
        required: ["breakdown_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_progress_trends",
      description: "Analyze progress trends for specific exercises or metrics over time.",
      parameters: {
        type: "object",
        properties: {
          exercise_name: {
            type: "string",
            description: "Specific exercise to analyze (optional)"
          },
          metric: {
            type: "string",
            enum: ["weight", "reps", "volume", "frequency", "duration"],
            description: "Which metric to track"
          },
          time_period: {
            type: "string",
            enum: ["month", "quarter", "year"]
          }
        },
        required: ["metric"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_stats_summary",
      description: "Generate a formatted summary of workout statistics suitable for display to user.",
      parameters: {
        type: "object",
        properties: {
          time_period: {
            type: "string",
            enum: ["week", "month", "quarter", "year", "all_time"]
          },
          include_sections: {
            type: "array",
            items: {
              type: "string",
              enum: ["overview", "category_breakdown", "muscle_breakdown", "top_exercises", "progress", "goals"]
            },
            description: "Which sections to include in the summary"
          }
        }
      }
    }
  }
    ];
    ```
    
**Statistics Calculations (programmatic, not LLM-based):**

```javascript
// BACKEND/services/analytics.service.js

async function calculateWorkoutStatistics(userId, options = {}) {
  const { startDate, endDate } = getDateRange(options.timePeriod);
  
  const history = await getWorkoutHistory(userId, { startDate, endDate });
  
  return {
    overview: {
      total_workouts: countUniqueSessions(history),
      total_exercises: history.length,
      total_duration_hours: sumDuration(history) / 60,
      total_volume_kg: calculateTotalVolume(history), // sets * reps * weight
      average_rpe: averageRPE(history),
      workout_frequency: calculateFrequency(history, startDate, endDate)
    },
    by_category: groupByCategory(history),
    by_muscle: groupByMuscle(history),
    by_exercise_type: groupByExerciseType(history),
    top_exercises: getTopExercises(history, 10),
    personal_records: getPersonalRecords(userId, history)
  };
}
```

### 4.9 Exercise Generation

The agent generates exercises directly as part of its response using structured output. This eliminates the need for a separate recommendation service and allows the agent to explain its reasoning inline.

#### Architecture: Direct Generation via Structured Output

When a user requests a workout, the agent:
1. Receives injected context (goals, equipment, history, preferences, distribution tracking)
2. Generates exercises directly in its response using the exercise schema
3. Includes natural language explanation alongside the exercises

This is more efficient than tool-based generation (one LLM call instead of two) and allows the agent to provide contextual reasoning for each exercise selection.

#### Exercise Schema (4 Types)

The schema uses 4 core exercise types that cover all workout modalities:

| Type | Description | Key Fields |
|------|-------------|------------|
| `reps` | Count repetitions across sets | sets, reps[], load, rest_sec |
| `hold` | Hold positions for time | sets, hold_sec[], rest_sec |
| `duration` | Continuous effort | duration_min, distance, target_pace |
| `intervals` | Work/rest cycles | rounds, work_sec, rest_sec |

```javascript
// BACKEND/schemas/exercise.schema.js
const { z } = require('zod');

// Valid muscle names (16 preset)
const VALID_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Abs',
  'Lower Back', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves',
  'Trapezius', 'Abductors', 'Adductors', 'Forearms', 'Neck'
];

// Group types for circuits, supersets, etc.
const GROUP_TYPES = ['circuit', 'superset', 'giant_set', 'warmup', 'cooldown', 'sequence'];

// Base fields shared by all exercise types
const BaseExerciseSchema = z.object({
  // Identity & ordering
  name: z.string().describe('Exercise name'),
  order: z.number().int().positive().describe('Position in workout (1-indexed)'),
  
  // Grouping (optional - for circuits, supersets, etc.)
  group: z.object({
    id: z.string().describe('Unique group identifier (e.g., "circuit-1", "superset-a")'),
    type: z.enum(GROUP_TYPES).describe('How to execute the group'),
    position: z.number().int().positive().describe('Order within group (1-indexed)'),
    name: z.string().optional().describe('Display name (set on first exercise only)'),
    rounds: z.number().int().positive().optional().describe('Times to repeat group (set on first exercise only)'),
    rest_between_rounds_sec: z.number().int().nonnegative().optional().describe('Rest after completing group')
  }).nullable().optional(),
  
  // Metadata
  muscles: z.array(z.object({
    name: z.enum(VALID_MUSCLES),
    share: z.number().min(0).max(1)
  })).refine(
    muscles => muscles.length === 0 || Math.abs(muscles.reduce((sum, m) => sum + m.share, 0) - 1.0) < 0.01,
    { message: 'Muscle shares must sum to 1.0' }
  ),
  goals: z.array(z.object({
    name: z.string(),
    share: z.number().min(0).max(1)
  })).refine(
    goals => goals.length === 0 || Math.abs(goals.reduce((sum, g) => sum + g.share, 0) - 1.0) < 0.01,
    { message: 'Goal shares must sum to 1.0' }
  ),
  reasoning: z.string().max(200).describe('Brief explanation for this exercise selection'),
  equipment: z.array(z.string()).optional()
});

// Type: reps - Count repetitions across sets (strength, bodyweight)
const RepsExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('reps'),
  sets: z.number().int().positive(),
  reps: z.array(z.number().int().positive()).describe('Target reps per set'),
  load: z.number().nonnegative().nullable().describe('Weight (null for bodyweight)'),
  load_unit: z.enum(['lbs', 'kg']).nullable(),
  rest_sec: z.number().int().nonnegative().describe('Rest between sets')
});

// Type: hold - Hold positions for time (isometric, balance, static stretches)
const HoldExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('hold'),
  sets: z.number().int().positive(),
  hold_sec: z.array(z.number().int().positive()).describe('Hold duration per set'),
  rest_sec: z.number().int().nonnegative().describe('Rest between sets')
});

// Type: duration - Continuous effort (cardio, yoga flows)
const DurationExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('duration'),
  duration_min: z.number().positive().describe('Total duration'),
  distance: z.number().positive().nullable().optional().describe('Target distance (optional)'),
  distance_unit: z.enum(['km', 'mi']).nullable().optional(),
  target_pace: z.string().nullable().optional().describe('Target pace (e.g., "5:30/km")')
});

// Type: intervals - Work/rest cycles (HIIT, tabata)
const IntervalsExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('intervals'),
  rounds: z.number().int().positive(),
  work_sec: z.number().int().positive(),
  rest_sec: z.number().int().nonnegative()
});

// Combined exercise schema (discriminated union)
const ExerciseSchema = z.discriminatedUnion('type', [
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema
]);

// Workout response schema (what the agent produces)
const WorkoutResponseSchema = z.object({
  exercises: z.array(ExerciseSchema),
  summary: z.object({
    estimated_duration_min: z.number().positive(),
    primary_goals: z.array(z.string()),
    muscles_targeted: z.array(z.string())
  }).optional()
});

module.exports = {
  ExerciseSchema,
  WorkoutResponseSchema,
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema,
  VALID_MUSCLES,
  GROUP_TYPES
};
```

#### System Prompt: Exercise Generation Instructions

Add these instructions to the main agent system prompt:

```javascript
const EXERCISE_GENERATION_INSTRUCTIONS = `
## EXERCISE GENERATION

When generating workouts, produce exercises directly in your response using the exercise schema.

### EXERCISE TYPES (use the appropriate type)

| Type | Use For | Key Fields |
|------|---------|------------|
| reps | Strength, bodyweight, weighted exercises | sets, reps[], load, rest_sec |
| hold | Planks, wall sits, static stretches | sets, hold_sec[], rest_sec |
| duration | Running, cycling, yoga flows | duration_min, distance, target_pace |
| intervals | HIIT, tabata, sprint work | rounds, work_sec, rest_sec |

### GENERATION RULES

1. **Priority Scoring**: Prioritize based on user's goal weights + distribution debt
   - High-weight goals (0.7+) = primary focus
   - Positive debt = under-represented, prioritize more

2. **Recovery**: Check RECOVERY STATUS before targeting muscles
   - Large muscles (chest, back, legs): need 48+ hours
   - Small muscles (biceps, triceps, shoulders): need 24+ hours
   - Skip muscles still recovering

3. **Progressive Overload**: Use workout history for load recommendations
   - Familiar exercise: +5-10% from last successful session
   - New exercise in familiar pattern: use similar exercise data
   - Completely new: start conservative (bodyweight or light load)

4. **Exercise Order**: Structure workouts logically
   - Warmup exercises first (if included)
   - Compound movements before isolation
   - Higher intensity before fatigue sets in
   - Cooldown/flexibility last (if included)

5. **Units**: Always use the user's preferred unit system
   - Use practical increments: 5/10/15/20/25 lbs OR 2.5/5/7.5/10 kg
   - Never mix units in a workout

6. **Equipment**: Only recommend exercises possible with available equipment
   - Check EQUIPMENT in context
   - No substitutions - if equipment not available, choose different exercise

### GROUPING (for circuits, supersets, etc.)

Use the \`group\` field to link exercises that should be performed together:

- **circuit**: 3+ exercises done back-to-back, repeated for rounds
- **superset**: 2 exercises alternated (usually opposing muscles)
- **giant_set**: 3+ exercises for same muscle group, no rest between
- **warmup**: Preparatory exercises at start
- **cooldown**: Recovery exercises at end

For grouped exercises:
- All exercises in group share same \`group.id\`
- Set \`group.position\` for order within group (1, 2, 3...)
- Set \`group.name\`, \`group.rounds\`, \`group.rest_between_rounds_sec\` on FIRST exercise only

### MUSCLE & GOAL SHARES

- \`muscles\` array: distribute credit across muscles worked (shares must sum to 1.0)
- \`goals\` array: which user goals this exercise addresses (shares must sum to 1.0)
- Use exact muscle names: Chest, Back, Shoulders, Biceps, Triceps, Abs, Lower Back, Quadriceps, Hamstrings, Glutes, Calves, Trapezius, Abductors, Adductors, Forearms, Neck

### EXAMPLE OUTPUT

\`\`\`json
{
  "exercises": [
    {
      "name": "Barbell Bench Press",
      "type": "reps",
      "order": 1,
      "group": null,
      "sets": 4,
      "reps": [10, 10, 8, 6],
      "load": 135,
      "load_unit": "lbs",
      "rest_sec": 120,
      "muscles": [
        { "name": "Chest", "share": 0.65 },
        { "name": "Triceps", "share": 0.25 },
        { "name": "Shoulders", "share": 0.10 }
      ],
      "goals": [
        { "name": "Strength", "share": 0.7 },
        { "name": "Hypertrophy", "share": 0.3 }
      ],
      "reasoning": "Primary compound push. Progressing from 130 lbs last session.",
      "equipment": ["barbell", "bench"]
    },
    {
      "name": "Dumbbell Fly",
      "type": "reps",
      "order": 2,
      "group": {
        "id": "superset-1",
        "type": "superset",
        "position": 1,
        "name": "Chest Finisher",
        "rounds": 3,
        "rest_between_rounds_sec": 60
      },
      "sets": 1,
      "reps": [12],
      "load": 25,
      "load_unit": "lbs",
      "rest_sec": 0,
      "muscles": [{ "name": "Chest", "share": 0.9 }, { "name": "Shoulders", "share": 0.1 }],
      "goals": [{ "name": "Hypertrophy", "share": 1.0 }],
      "reasoning": "Superset A1 - chest isolation for hypertrophy.",
      "equipment": ["dumbbells", "bench"]
    },
    {
      "name": "Push-ups",
      "type": "reps",
      "order": 3,
      "group": {
        "id": "superset-1",
        "type": "superset",
        "position": 2
      },
      "sets": 1,
      "reps": [15],
      "load": null,
      "load_unit": null,
      "rest_sec": 0,
      "muscles": [
        { "name": "Chest", "share": 0.5 },
        { "name": "Triceps", "share": 0.3 },
        { "name": "Shoulders", "share": 0.2 }
      ],
      "goals": [{ "name": "Hypertrophy", "share": 0.6 }, { "name": "Endurance", "share": 0.4 }],
      "reasoning": "Superset A2 - bodyweight burnout after flys.",
      "equipment": []
    },
    {
      "name": "Plank",
      "type": "hold",
      "order": 4,
      "group": null,
      "sets": 3,
      "hold_sec": [45, 45, 60],
      "rest_sec": 30,
      "muscles": [{ "name": "Abs", "share": 0.7 }, { "name": "Lower Back", "share": 0.3 }],
      "goals": [{ "name": "Core Stability", "share": 1.0 }],
      "reasoning": "Core finisher. Increasing final hold for progression.",
      "equipment": []
    }
  ],
  "summary": {
    "estimated_duration_min": 35,
    "primary_goals": ["Strength", "Hypertrophy"],
    "muscles_targeted": ["Chest", "Triceps", "Shoulders", "Abs"]
  }
}
\`\`\`
`;
```

#### Exercise Generation Tool

The agent uses this tool to create exercises. The tool accepts structured exercise data following the 4-type schema. When the user requests a workout, the agent calls this tool with the exercises it generates.

```javascript
const exerciseGenerationTools = [
  {
    type: "function",
    function: {
      name: "generate_workout",
      description: "Create a workout by providing exercises. Use this when the user requests a workout or when regenerating with changes. Each exercise must follow one of the 4 types: reps, hold, duration, or intervals.",
      parameters: {
        type: "object",
        properties: {
          exercises: {
            type: "array",
            description: "Array of exercises to create",
            items: {
              type: "object",
              properties: {
                // Identity & ordering
                name: { type: "string", description: "Exercise name" },
                order: { type: "number", description: "Position in workout (1-indexed)" },
                type: { 
                  type: "string", 
                  enum: ["reps", "hold", "duration", "intervals"],
                  description: "Exercise type"
                },
                
                // Grouping (optional)
                group: {
                  type: "object",
                  description: "For circuits, supersets, etc. Set to null for standalone exercises.",
                  properties: {
                    id: { type: "string", description: "Group identifier (e.g., 'circuit-1')" },
                    type: { 
            type: "string",
                      enum: ["circuit", "superset", "giant_set", "warmup", "cooldown", "sequence"]
                    },
                    position: { type: "number", description: "Order within group (1-indexed)" },
                    name: { type: "string", description: "Display name (first exercise only)" },
                    rounds: { type: "number", description: "Times to repeat (first exercise only)" },
                    rest_between_rounds_sec: { type: "number", description: "Rest after group (first exercise only)" }
                  },
                  required: ["id", "type", "position"]
                },
                
                // Type: reps (strength, bodyweight)
                sets: { type: "number", description: "Number of sets (for reps/hold types)" },
                reps: { 
            type: "array",
                  items: { type: "number" },
                  description: "Reps per set (for reps type)"
                },
                load: { type: "number", description: "Weight - null for bodyweight (for reps type)" },
                load_unit: { type: "string", enum: ["lbs", "kg"], description: "Weight unit" },
                
                // Type: hold (isometric, balance)
                hold_sec: { 
                  type: "array", 
                  items: { type: "number" },
                  description: "Hold duration per set in seconds (for hold type)"
                },
                
                // Type: duration (cardio, yoga)
                duration_min: { type: "number", description: "Total duration in minutes (for duration type)" },
                distance: { type: "number", description: "Target distance (for duration type)" },
                distance_unit: { type: "string", enum: ["km", "mi"] },
                target_pace: { type: "string", description: "Target pace e.g. '5:30/km' (for duration type)" },
                
                // Type: intervals (HIIT, tabata)
                rounds: { type: "number", description: "Number of rounds (for intervals type)" },
                work_sec: { type: "number", description: "Work duration per round (for intervals type)" },
                
                // Common
                rest_sec: { type: "number", description: "Rest between sets/rounds" },
                
                // Metadata
                muscles: {
                  type: "array",
                  description: "Muscles worked (shares must sum to 1.0)",
                  items: {
                    type: "object",
                    properties: {
                      name: { 
                        type: "string",
                        enum: ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Abs", "Lower Back", "Quadriceps", "Hamstrings", "Glutes", "Calves", "Trapezius", "Abductors", "Adductors", "Forearms", "Neck"]
                      },
                      share: { type: "number", description: "Proportion of work (0-1)" }
                    },
                    required: ["name", "share"]
                  }
                },
                goals: {
                  type: "array",
                  description: "Goals addressed (shares must sum to 1.0)",
                  items: {
        type: "object",
        properties: {
                      name: { type: "string", description: "Goal name from user's goals" },
                      share: { type: "number", description: "Proportion addressed (0-1)" }
                    },
                    required: ["name", "share"]
                  }
                },
                reasoning: { type: "string", description: "Brief explanation for this exercise (max 200 chars)" },
                equipment: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Equipment required"
                }
              },
              required: ["name", "order", "type", "muscles", "goals", "reasoning"]
            }
          },
          message: {
            type: "string",
            description: "Message to display to user explaining the workout"
          }
        },
        required: ["exercises"]
      }
    }
  }
];
```

#### Exercise ID System & Displayables Registration

When the agent creates exercises via `generate_workout`, the system:
1. Assigns a unique ID to each exercise
2. Assigns a workout ID (e.g., `workout_1`, `workout_2`)
3. Registers the workout and exercises in `session.displayables`

These IDs are:
- Generated by the API (not the agent)
- Returned in the tool result observation
- Registered in session displayables for later reference
- Used by modification tools to identify specific exercises
- Used in `message_notify_user` attachments to display to user

```
Flow:
1. Agent calls generate_workout with exercises (no IDs)
2. API creates exercises and assigns IDs (ex_001, ex_002, etc.)
3. API assigns workout ID (workout_1, workout_2, etc.)
4. API registers workout + exercises in session.displayables
5. Result includes workout_id and exercises with IDs
6. Agent calls message_notify_user with attachments: ["workout_1"]
7. Backend resolves workout_1 → full workout data
8. Frontend receives and displays the workout
9. User: "Make the bench press heavier"
10. Agent sees exercises with IDs in context
11. Agent calls adjust_exercise with exercise_id: "ex_001"
```

**Example Tool Result:**
```json
{
  "success": true,
  "workout_id": "workout_1",
  "exercises": [
    { "id": "ex_001", "name": "Bench Press", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 40, "load_unit": "kg", ... },
    { "id": "ex_002", "name": "Bent Over Rows", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 35, "load_unit": "kg", ... },
    { "id": "ex_003", "name": "Shoulder Press", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 20, "load_unit": "kg", ... },
    { "id": "ex_004", "name": "Bicep Curls", "type": "reps", "sets": 2, "reps": [12, 12], "load": 10, "load_unit": "kg", ... },
    { "id": "ex_005", "name": "Tricep Dips", "type": "reps", "sets": 2, "reps": [10, 10], "load": null, ... }
  ],
  "metadata": {
    "focus": "upper body",
    "estimated_duration_min": 28,
    "intensity": "light"
  }
}
```

The agent then uses `workout_1` or individual exercise IDs (`ex_001`, etc.) in `message_notify_user` attachments to display the workout to the user.

#### Exercise Modification Tools

These tools use `exercise_id` to identify exercises (both current workout and history):

```javascript
const exerciseModificationTools = [
  {
    type: "function",
    function: {
      name: "swap_exercise",
      description: "Replace an exercise with a new one. Use the exercise_id from context to identify which exercise to replace.",
      parameters: {
        type: "object",
        properties: {
          exercise_id: {
            type: "string",
            description: "ID of the exercise to replace (from context)"
          },
          new_exercise: {
            type: "object",
            description: "The replacement exercise (same schema as generate_workout exercises)",
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: ["reps", "hold", "duration", "intervals"] },
              order: { type: "number", description: "Position in workout (inherits from replaced exercise if omitted)" },
              group: { type: "object", description: "Grouping info if part of circuit/superset" },
              sets: { type: "number" },
              reps: { type: "array", items: { type: "number" } },
              load: { type: "number" },
              load_unit: { type: "string", enum: ["lbs", "kg"] },
              hold_sec: { type: "array", items: { type: "number" } },
              duration_min: { type: "number" },
              rounds: { type: "number" },
              work_sec: { type: "number" },
              rest_sec: { type: "number" },
              muscles: { type: "array", items: { type: "object" } },
              goals: { type: "array", items: { type: "object" } },
              reasoning: { type: "string" },
              equipment: { type: "array", items: { type: "string" } }
            },
            required: ["name", "type", "muscles", "goals", "reasoning"]
          }
        },
        required: ["exercise_id", "new_exercise"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "adjust_exercise",
      description: "Modify parameters of an existing exercise. Works on current workout or historical exercises. Only include fields you want to change.",
      parameters: {
        type: "object",
        properties: {
          exercise_id: {
            type: "string",
            description: "ID of the exercise to modify (from context)"
          },
          sets: { type: "number" },
          reps: { type: "array", items: { type: "number" } },
          load: { type: "number" },
          hold_sec: { type: "array", items: { type: "number" } },
          duration_min: { type: "number" },
          rounds: { type: "number" },
          work_sec: { type: "number" },
          rest_sec: { type: "number" },
          order: { type: "number", description: "New position in workout" }
        },
        required: ["exercise_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remove_exercise",
      description: "Remove an exercise from the current workout.",
      parameters: {
        type: "object",
        properties: {
          exercise_id: {
            type: "string",
            description: "ID of the exercise to remove (from context)"
          }
        },
        required: ["exercise_id"]
      }
    }
  }
];
```

#### Tool Observation Formatters

```javascript
const workoutToolFormatters = {
  generate_workout: (result) => {
    // Include IDs so agent can reference them for modifications
    const exercises = result.exercises.map((ex, i) =>
      `  ${ex.id}: ${ex.name} (${ex.type}) [order: ${ex.order}]`
    ).join('\n');
    return `<result>Created ${result.exercises.length} exercises:\n${exercises}</result>`;
  },
  
  swap_exercise: (result) => {
    return `<result>Replaced ${result.old_id} (${result.old_name}) → ${result.new_exercise.id}: ${result.new_exercise.name}</result>`;
  },
  
  adjust_exercise: (result) => {
    return `<result>Updated ${result.exercise_id}: ${result.exercise_name} - ${result.changes_summary}</result>`;
  },
  
  remove_exercise: (result) => {
    return `<result>Removed ${result.exercise_id}</result>`;
  }
};
```

**Example Context After generate_workout:**

When exercises are created, the agent sees them with IDs in subsequent turns:

```
<knowledge type="current_workout">
Workout created at 2:30 PM:
  ex_7f8a9b: Barbell Bench Press (reps) [order: 1] - 4x[10,10,8,6] @ 135 lbs
  ex_2c3d4e: Dumbbell Fly (reps) [order: 2] - 3x[12,12,12] @ 25 lbs
  ex_9a1b2c: Push-ups (reps) [order: 3] - 3x[15,15,12] bodyweight
  ex_5e6f7g: Plank (hold) [order: 4] - 3x[45,45,60] sec holds
</knowledge>
```

The agent uses these IDs (e.g., `ex_7f8a9b`) when calling modification tools.

#### Frontend Integration

The frontend receives exercises and renders based on type and grouping:

```typescript
// Frontend types (TypeScript)
interface Exercise {
  name: string;
  type: 'reps' | 'hold' | 'duration' | 'intervals';
  order: number;
  group?: {
    id: string;
    type: 'circuit' | 'superset' | 'giant_set' | 'warmup' | 'cooldown' | 'sequence';
    position: number;
    name?: string;
    rounds?: number;
    rest_between_rounds_sec?: number;
  };
  // Type-specific fields...
  muscles: { name: string; share: number }[];
  goals: { name: string; share: number }[];
  reasoning: string;
  equipment?: string[];
}

// Group exercises for display
function groupExercises(exercises: Exercise[]): (Exercise | ExerciseGroup)[] {
  const result: (Exercise | ExerciseGroup)[] = [];
  const groupMap = new Map<string, Exercise[]>();
  
  for (const exercise of exercises) {
    if (exercise.group) {
      const existing = groupMap.get(exercise.group.id) || [];
      existing.push(exercise);
      groupMap.set(exercise.group.id, existing);
    } else {
      result.push(exercise);
    }
  }
  
  // Convert groups to ExerciseGroup objects
  for (const [groupId, groupExercises] of groupMap) {
    const first = groupExercises.find(e => e.group?.name);
    result.push({
      id: groupId,
      type: groupExercises[0].group!.type,
      name: first?.group?.name || groupId,
      rounds: first?.group?.rounds || 1,
      rest_between_rounds_sec: first?.group?.rest_between_rounds_sec || 0,
      exercises: groupExercises.sort((a, b) => a.group!.position - b.group!.position)
    });
  }
  
  return result.sort((a, b) => {
    const orderA = 'order' in a ? a.order : a.exercises[0].order;
    const orderB = 'order' in b ? b.order : b.exercises[0].order;
    return orderA - orderB;
  });
}
```

### 4.10 State Control Tools

```javascript
const stateControlTools = [
  {
    type: "function",
    function: {
      name: "idle",
      description: "Indicate all tasks are complete and enter standby state. MUST be called after messaging results to the user. The agent loop will pause until the next user message.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  }
];
```

### 4.11 Tool Observation Formatters

Tool observations (results) are formatted per-tool to minimize token usage while preserving essential information. Each tool falls into one of three categories:

#### Category 1: Confirmation Only (~5 tokens)

These tools only need a simple confirmation - the model doesn't need result details.

```javascript
const confirmationOnlyFormatters = {
  message_notify_user: (result) => '<result>ok</result>',
  delete_preference: (result) => '<result>deleted</result>',
  undo_logged_exercise: (result) => '<result>removed</result>',
  remove_exercise_from_workout: (result) => '<result>removed</result>',
  delete_scheduled_workout: (result) => '<result>deleted</result>',
  idle: (result) => '' // No observation for idle
};
```

#### Category 2: Confirmation + Brief Summary (~20 tokens)

These tools changed something and the model should know what changed.

```javascript
const summaryFormatters = {
  mark_exercise_complete: (result) => {
    const { exercise_name, sets, reps, load_kg, rpe } = result;
    return `<result>logged: ${exercise_name} ${sets}x${reps} @${load_kg}kg${rpe ? ` RPE:${rpe}` : ''}</result>`;
  },
  
  log_completed_exercise: (result) => {
    const { exercise_name, sets, reps, load_kg } = result;
    return `<result>logged: ${exercise_name} ${sets}x${reps}${load_kg ? ` @${load_kg}kg` : ''}</result>`;
  },
  
  update_category_goals: (result) => {
    return `<result>${result.count} categories updated</result>`;
  },
  
  update_muscle_goals: (result) => {
    return `<result>${result.count} muscles updated</result>`;
  },
  
  modify_workout_exercise: (result) => {
    const { exercise_name, changes } = result;
    return `<result>${exercise_name}: ${changes}</result>`;
  },
  
  replace_workout_exercise: (result) => {
    const { old_name, new_exercise } = result;
    return `<result>swapped: ${old_name} → ${new_exercise.name} ${new_exercise.sets}x${new_exercise.reps}</result>`;
  },
  
  add_exercise_to_workout: (result) => {
    const { exercise, position } = result;
    return `<result>added: ${exercise.name} at #${position}</result>`;
  },
  
  schedule_workout: (result) => {
    const { workout_type, scheduled_date } = result;
    const dateStr = new Date(scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<result>scheduled: ${workout_type} on ${dateStr}</result>`;
  },
  
  update_scheduled_workout: (result) => {
    return `<result>updated: ${result.workout_id}</result>`;
  },
  
  set_preference: (result) => {
    const { type, description, delete_after_use, expires_at } = result;
    const temporal = delete_after_use || expires_at;
    return `<result>saved: ${type} - ${description.slice(0, 50)}${temporal ? ' (temporary)' : ''}</result>`;
  }
};
```

#### Category 3: Full Data Required (variable tokens)

These tools return data the model MUST see to continue properly.

```javascript
const fullDataFormatters = {
  generate_workout: (result) => {
    const exercises = result.workout.exercises.map((ex, i) => 
      `  ${i + 1}. ${ex.name} (${ex.type}) ${ex.sets}x${ex.reps}${ex.load_kg ? ` @${ex.load_kg}kg` : ''}`
    ).join('\n');
    return `<result>\n${exercises}\n</result>`;
  },
  
  message_ask_user: (result) => {
    // User's actual response must be visible
    return `<result>user: ${result.user_response}</result>`;
  },
  
  parse_category_goals: (result) => {
    const goals = result.goals.map(g => `  ${g.category}: ${g.weight}%`).join('\n');
    return `<result>parsed:\n${goals}\n</result>`;
  },
  
  parse_muscle_goals: (result) => {
    const goals = result.goals.map(g => `  ${g.muscle}: ${g.weight}%`).join('\n');
    return `<result>parsed:\n${goals}\n</result>`;
  },
  
  fetch_data: (result) => {
    // Returns all fetched data sources
    // Result is an object with keys for each requested source
    const sources = Object.keys(result).map(source => `  ${source}: fetched`).join('\n');
    return `<result>\nFetched data sources:\n${sources}\n</result>`;
  },
  
  generate_exercise_timer: (result) => {
    const phases = result.timer.phases.map(p => `  ${p.name}: ${p.duration}s`).join('\n');
    return `<result>\n${phases}\nTotal: ${result.timer.total_duration}s\n</result>`;
  },
  
  generate_workout_timers: (result) => {
    const timers = result.timers.map(t => `  ${t.exercise}: ${t.total_duration}s`).join('\n');
    return `<result>\n${timers}\n</result>`;
  },
  
  get_workout_statistics: (result) => {
    return `<result>${JSON.stringify(result.stats, null, 2)}</result>`;
  },
  
  get_exercise_breakdown: (result) => {
    return `<result>${JSON.stringify(result.breakdown, null, 2)}</result>`;
  },
  
  get_progress_trends: (result) => {
    return `<result>${JSON.stringify(result.trends, null, 2)}</result>`;
  },
  
  generate_stats_summary: (result) => {
    return `<result>${result.summary}</result>`;
  },
  
  create_workout_plan: (result) => {
    const plan = result.plan;
    const weeks = plan.weeks.map(w => `  Week ${w.week_number}: ${w.workouts.length} workouts`).join('\n');
    return `<result>\nPlan: ${plan.name}\n${weeks}\n</result>`;
  }
};
```

#### Combined Formatter Registry

```javascript
// BACKEND/ai/tools/observationFormatters.js

const observationFormatters = {
  ...confirmationOnlyFormatters,
  ...summaryFormatters,
  ...fullDataFormatters
};

function formatToolResult(toolName, result) {
  const formatter = observationFormatters[toolName];
  if (formatter) {
    return formatter(result);
  }
  // Fallback for unknown tools
  return `<result>${JSON.stringify(result)}</result>`;
}

module.exports = { formatToolResult, observationFormatters };
```

#### Token Savings Estimate

| Category | Current Avg | Optimized Avg | Savings |
|----------|------------|---------------|---------|
| Confirmation Only | ~50 tokens | ~5 tokens | 90% |
| Confirmation + Summary | ~80 tokens | ~20 tokens | 75% |
| Full Data | ~150 tokens | ~150 tokens | 0% (needed) |

For a typical 10-turn session with ~30 tool calls:
- ~10 Category 1 calls: **450 tokens saved**
- ~15 Category 2 calls: **900 tokens saved**
- ~5 Category 3 calls: 0 tokens saved
- **Total: ~1,350 tokens (~40% reduction in tool overhead)**

---

## 5. Complete Tool Registry

```javascript
// BACKEND/ai/tools/index.js

const allTools = [
  // Communication (2)
  ...communicationTools,
  
  // Data Retrieval (5)
  ...dataRetrievalTools,
  
  // Goal Management (4)
  ...goalManagementTools,
  
  // Preferences (3)
  ...preferenceTools,
  
  // Exercise Logging (3)
  ...exerciseLoggingTools,
  
  // Timers (2)
  ...timerTools,
  
  // Calendar & Scheduling (4)
  ...calendarTools,
  
  // Analytics (4)
  ...analyticsTools,
  
  // Exercise Generation (5)
  ...exerciseGenerationTools,
  
  // State Control (1)
  ...stateControlTools
];

// Total: 33 tools

function createToolsForUser(userId) {
  // Return tools with userId bound for execution
  return allTools.map(tool => ({
    ...tool,
    execute: async (args) => executeToolForUser(tool.function.name, userId, args)
  }));
}

module.exports = { allTools, createToolsForUser };
```

---

## 6. Event Stream Format

### Standard Event Types

```javascript
// Message event
{
  type: "message",
  role: "user" | "assistant",
  content: "string",
  timestamp: "ISO string"
}

// Action event (tool call)
{
  type: "action",
  tool: "tool_name",
  args: { /* tool arguments */ },
  timestamp: "ISO string"
}

// Observation event (tool result)
{
  type: "observation",
  tool: "tool_name",
  result: { /* structured result */ },
  success: true | false,
  error: "optional error message",
  timestamp: "ISO string"
}

// Knowledge event (injected context)
{
  type: "knowledge",
  scope: "user_profile" | "workout_context" | "goals" | "schedule" | "history",
  data: { /* relevant data */ },
  timestamp: "ISO string"
}
```

### Example Event Stream
    
    ```xml
<event_stream>

<knowledge scope="user_profile">
{
  "name": "Alex",
  "units": { "weight": "lbs", "distance": "miles" },
  "body_stats": { "age": 32, "weight_kg": 75 },
  "current_location": "Home Gym",
  "equipment": ["Dumbbells", "Barbell", "Bench", "Pull-up Bar"]
}
</knowledge>

<knowledge scope="goals">
{
  "categories": [
    { "category": "Strength", "weight": 0.45, "actual": 0.38, "debt": 0.07 },
    { "category": "Hypertrophy", "weight": 0.35, "actual": 0.40, "debt": -0.05 },
    { "category": "Cardio", "weight": 0.20, "actual": 0.22, "debt": -0.02 }
  ]
}
</knowledge>

<message role="user">
I want a quick upper body workout today, maybe 30 minutes. I'm feeling a bit tired so nothing too intense.
</message>

<action tool="message_notify_user">
{ "text": "Got it! Let me put together a lighter upper body workout for you." }
</action>

<observation tool="message_notify_user">
{ "success": true, "delivered": true }
    </observation>
    
<action tool="set_preference">
{
  "type": "intensity",
  "description": "Lower intensity due to fatigue",
  "guidance": "Recommend low to moderate intensity exercises only",
  "delete_after_use": true
}
</action>

<observation tool="set_preference">
{ "success": true, "id": "pref-123" }
    </observation>
    
<action tool="generate_workout">
{
  "exercise_count": 5,
  "focus": "upper body",
  "duration_minutes": 30,
  "intensity": "light"
}
</action>

<observation tool="generate_workout">
{
  "success": true,
  "workout_id": "workout_1",
  "exercises": [
    { "id": "ex_001", "name": "Dumbbell Bench Press", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 20, "load_unit": "kg" },
    { "id": "ex_002", "name": "Bent Over Rows", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 18, "load_unit": "kg" },
    { "id": "ex_003", "name": "Shoulder Press", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 12, "load_unit": "kg" },
    { "id": "ex_004", "name": "Bicep Curls", "type": "reps", "sets": 2, "reps": [12, 12], "load": 8, "load_unit": "kg" },
    { "id": "ex_005", "name": "Tricep Dips", "type": "reps", "sets": 2, "reps": [10, 10], "load": null }
  ],
  "metadata": {
    "estimated_duration_min": 28,
    "focus": "upper body",
    "intensity": "light"
  }
}
</observation>

<action tool="message_notify_user">
{
  "text": "Here's your 30-minute upper body workout! I've kept it light since you're feeling tired. 5 exercises focusing on chest, back, shoulders, and arms.",
  "attachments": ["workout_1"]
}
</action>

<observation tool="message_notify_user">
{ "success": true, "delivered": true }
</observation>

<action tool="idle">
{}
</action>

</event_stream>
```

---

## 7. API Endpoints

### Agent Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agent/chat` | Process user message (non-streaming) |
| POST | `/agent/stream` | Process user message with streaming |
| GET | `/agent/sessions` | List user's sessions |
| GET | `/agent/sessions/:id` | Get session with event stream |
| DELETE | `/agent/sessions/:id` | Delete a session |

### Supporting Endpoints (existing)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/user-settings` | Get user unit preferences |
| PUT | `/user-settings` | Update unit preferences |
| GET | `/exercises/history/:userId` | Get workout history |
| GET | `/exercises/distribution/:userId` | Get distribution metrics |

---

## 8. Front-End Integration (Future Phase)

When the user first opens the app, we will load a workout for them automatically by calling the agent with an auto-generated prompt.

The Personal Trainer is always available to help the user with a single tap. Once "woken", the user can speak or text to the AI and ask for things, like:
- How they are feeling
- Adjustments to the workout
- A whole new workout altogether
- Plan out their goals
- View their statistics
- Schedule future workouts

Every page has the Personal Trainer Icon on the bottom right. When the user asks to adjust their goals, the personal trainer is trained on how to advise and guide the user. It may ask questions to clarify or help the user decide what their goals should be.

### Streaming Response Format

For the mobile app, streaming responses should follow this format:

```javascript
// Server-Sent Events (SSE) format
data: { "type": "thinking", "content": "Analyzing your request..." }

data: { "type": "message", "content": "Got it! Let me generate your workout..." }

data: { "type": "tool_start", "tool": "generate_workout" }

data: { "type": "tool_end", "tool": "generate_workout", "result": { "workout_id": "workout_1", "exercise_count": 5 } }

// When agent calls message_notify_user with attachments, they are resolved before sending:
data: { 
  "type": "message", 
  "content": "Here's your 30-minute upper body workout!",
  "attachments": [
    {
      "type": "workout",
      "id": "workout_1",
      "data": {
        "metadata": { "focus": "upper body", "duration_min": 30, "intensity": "light" },
        "exercises": [
          { "id": "ex_001", "name": "Dumbbell Bench Press", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 20, "load_unit": "kg" },
          { "id": "ex_002", "name": "Bent Over Rows", "type": "reps", "sets": 3, "reps": [10, 10, 10], "load": 18, "load_unit": "kg" },
          // ... remaining exercises
        ]
      }
    }
  ]
}

data: { "type": "done" }
```

**Note:** The `attachments` array is only present when the agent calls `message_notify_user` with attachment IDs. The backend resolves these IDs from `session.displayables` before sending to the frontend. Messages without attachments simply have the `content` field.

---

## 9. Implementation Notes

1. **Migration from Old Architecture**
   - Remove the old `orchestrationAgent.service.js` that uses Vercel AI SDK's `generateText`/`streamText` with maxSteps
   - Remove the `ai/tools/` directory that creates tools for the SDK
   - The new agent loop handles tool calling manually
   - Keep the existing services (`exerciseDistribution`, `exerciseLog`, `preference`, etc.) as they provide the underlying functionality

2. **Exercise Generation**
   - The main agent generates exercises directly using the `generate_workout` tool
   - This replaces the separate `recommend.service.js` flow
   - Exercise generation uses structured output with Zod schemas (can keep existing schema definitions)

3. **Database Migrations**
   - Add `agent_sessions` and `agent_events` tables
   - Add `scheduled_workouts`, `workout_plans`, and `milestone_goals` tables
   - Add appropriate indexes and RLS policies

4. **Stateful Sessions**
   - Each conversation is a session with persisted event stream
   - Sessions can be resumed if user returns
   - Sessions expire after configurable period (e.g., 24 hours of inactivity)

5. **Error Handling**
   - Tool execution errors should be captured and returned as observations
   - Agent can see errors and decide how to recover
   - Max iteration limit prevents infinite loops

---

## 10. Testing Checklist

- [ ] Agent loop executes correctly with max iteration limit
- [ ] Event stream persists to Supabase correctly
- [ ] **Initializer Agent Tests:**
  - [ ] Initializer agent runs before main agent loop
  - [ ] Correctly identifies needed data sources for various request types
  - [ ] Does not duplicate data sources already in context
  - [ ] Handles parameterized data sources correctly (e.g., days_back)
  - [ ] Returns empty list when all needed data is present
  - [ ] Fast response time (< 500ms typical)
  - [ ] Truncation hints are respected by context builder
- [ ] **Context Window Management Tests:**
  - [ ] Data formatters produce correct full/truncated/decayed output
  - [ ] Token estimation is reasonably accurate
  - [ ] Retention tiers are correctly applied based on event age
  - [ ] T1 (Persistent) data never truncates
  - [ ] T2 (Semi-Persistent) data truncates after configured events
  - [ ] T3 (Session-Bound) data truncates when session conditions met
  - [ ] T4 (Decay) data progressively decays through levels
  - [ ] Conversation events follow keepFull → keepTruncated → summarize flow
  - [ ] Total context stays within token budget
  - [ ] Priority sorting preserves critical information
  - [ ] Workout history decay levels show correct item counts (15→7→5→3)
- [ ] All 33 tools execute and return proper observations
- [ ] Goal tools correctly parse and update goals
- [ ] Preference tools handle temporal preferences correctly
- [ ] Exercise logging updates distribution tracking
- [ ] Timer generation produces valid phase data
- [ ] Calendar tools create/update/delete scheduled workouts
- [ ] Analytics tools calculate correct statistics
- [ ] Streaming responses work for mobile client
- [ ] Session resumption works correctly
- [ ] Error handling captures and surfaces errors appropriately
