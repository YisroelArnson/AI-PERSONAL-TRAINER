// BACKEND/services/initializerAgent.service.js
// Lightweight agent that selects relevant data sources based on user input
const OpenAI = require('openai');
const { fetchMultipleDataSources, getAvailableDataSources } = require('./dataSources.service');
const sessionObs = require('./sessionObservability.service');
const { calculateCostCents } = require('./observability/pricing');
const dotenv = require('dotenv');

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INITIALIZER_MODEL = 'gpt-4o-mini';

// JSON Schema for initializer response (used for structured outputs)
const INITIALIZER_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "context_selection",
    strict: true,
    schema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Brief explanation of what data is needed and why"
        },
        append_knowledge: {
          type: "array",
          description: "Array of data sources to append",
          items: {
            type: "object",
            properties: {
              source: { type: "string", description: "Data source name" },
              days_back: { 
                type: ["integer", "null"],
                description: "For workout_history: number of days to look back (default 14)"
              },
              reason: { 
                type: "string", 
                enum: ["not_in_context", "expand_range", "refresh_state"],
                description: "Reason for adding"
              }
            },
            required: ["source", "reason", "days_back"],
            additionalProperties: false
          }
        },
        use_existing: {
          type: "array",
          description: "List of existing sources being used",
          items: { type: "string" }
        }
      },
      required: ["reasoning", "append_knowledge", "use_existing"],
      additionalProperties: false
    }
  }
};

const INITIALIZER_SYSTEM_PROMPT = `You are a Context Initializer for a Personal Trainer AI agent.

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
- No additional data needed - current_workout_session is automatically provided by the client app
- The client sends the current workout state with each request when a workout is active

GENERAL QUESTIONS / CONVERSATION:
- Usually minimal data needed
- Only add if specifically relevant to question

INJURY / RECOVERY DISCUSSION:
- active_preferences (to check existing injury prefs)
- workout_history (recent, days_back: 7)

LOCATION / EQUIPMENT QUERIES:
- all_locations (to see all user locations with equipment details)
- Use when user asks: "what equipment do I have?", "where can I workout?",
  "switch to gym", "what's at home?", "show my locations", "compare my locations"
- The stable prefix ALWAYS includes current_location, but all_locations
  provides full details of ALL locations for comparison or switching

NOTE: current_workout_session is CLIENT-PROVIDED data, not a fetchable data source.
The iOS app automatically includes the current workout state in each request.
Do NOT try to add current_workout_session to append_knowledge - it's handled separately.
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
`;

/**
 * Run the initializer agent to select data sources
 * @param {string} sessionId - Session ID for logging
 * @param {string} userInput - The user's message
 * @param {Array} existingKnowledge - Array of already-loaded source names
 * @returns {Object} Selection with data_sources array and reasoning
 */
async function runInitializerAgent(sessionId, userInput, existingKnowledge = []) {
  const availableSources = getAvailableDataSources();
  const sourcesDescription = availableSources
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n');

  // Append available sources to system prompt
  const systemPrompt = INITIALIZER_SYSTEM_PROMPT + `\n\n<available_data_sources>\n${sourcesDescription}\n</available_data_sources>`;

  const userMessage = `User message: "${userInput}"\n\nAlready loaded data sources: ${existingKnowledge.join(', ') || 'none'}`;
  
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  // Log LLM request
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;
  await sessionObs.logLLMRequest(sessionId, INITIALIZER_MODEL, fullPrompt, Math.ceil(fullPrompt.length / 4));

  const startTime = Date.now();
  
  const response = await openai.chat.completions.create({
    model: INITIALIZER_MODEL,
    messages,
    response_format: INITIALIZER_RESPONSE_SCHEMA
  });

  const durationMs = Date.now() - startTime;

  // Parse the JSON response
  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content);

  // Log LLM response (pass raw response for observability)
  await sessionObs.logLLMResponse(sessionId, {
    rawResponse: response,
    durationMs
  });
  
  return parsed;
}

/**
 * Get existing knowledge events from session
 * @param {string} sessionId - The session UUID
 * @param {number} contextStartSequence - Starting sequence for context
 * @returns {Array} Array of already-loaded source names
 */
async function getExistingKnowledge(sessionId, contextStartSequence) {
  const events = await sessionObs.getContextEvents(sessionId, contextStartSequence);
  
  return events
    .filter(e => e.event_type === 'knowledge')
    .map(e => e.data?.source || e.content?.source);
}

/**
 * Get human-friendly display name for a knowledge source
 * @param {string} source - The data source name
 * @returns {string} Human-friendly display name
 */
function getKnowledgeDisplayName(source) {
  const names = {
    'workout_history': 'Loading workout history',
    'category_goals': 'Loading category goals',
    'muscle_goals': 'Loading muscle goals',
    'active_preferences': 'Loading preferences',
    'user_profile': 'Loading profile',
    'exercise_distribution': 'Analyzing exercise patterns',
    'user_settings': 'Loading settings',
    'all_locations': 'Loading locations',
    'current_workout_session': 'Loading current workout'
  };
  return names[source] || source.replace(/_/g, ' ');
}

/**
 * Initialize context for a new user message
 * Runs the initializer agent and fetches needed data sources
 * @param {string} sessionId - The session UUID
 * @param {string} userId - The user's UUID
 * @param {string} userInput - The user's message
 * @param {Function} emit - Optional callback to emit events for real-time streaming
 * @returns {Object} Results of context initialization
 */
async function initializeContext(sessionId, userId, userInput, emit = null) {
  // Get existing knowledge to avoid re-fetching
  const existingKnowledge = await getExistingKnowledge(sessionId, 0);

  // Run initializer to select needed sources
  let selection;
  try {
    selection = await runInitializerAgent(sessionId, userInput, existingKnowledge);
  } catch (error) {
    await sessionObs.logError(sessionId, error, 'initializer_agent');
    throw error;
  }

  // Extract source names from append_knowledge
  const newSources = selection.append_knowledge.map(k => k.source);

  if (newSources.length === 0) {
    sessionObs.consoleLog(
      sessionId,
      '📚',
      'Context init: All needed data already in context',
      `using: ${selection.use_existing.join(', ')}`
    );

    return {
      sources: [],
      reasoning: selection.reasoning,
      useExisting: selection.use_existing,
      message: 'All needed data already in context'
    };
  }

  try {
    // Build params object keyed by source name
    const paramsMap = {};
    for (const k of selection.append_knowledge) {
      // Handle days_back parameter for workout_history
      if (k.days_back !== null && k.days_back !== undefined) {
        paramsMap[k.source] = { days_back: k.days_back };
      }
    }

    // Fetch new data sources with their params
    const results = await fetchMultipleDataSources(newSources, userId, paramsMap);

    // Append knowledge events and emit for real-time UI
    for (const result of results) {
      if (!result.error) {
        await sessionObs.logKnowledge(sessionId, result.source, result.formatted);

        // Emit knowledge event for real-time streaming to client
        if (emit && typeof emit === 'function') {
          emit('knowledge', {
            source: result.source,
            displayName: getKnowledgeDisplayName(result.source)
          });
        }
      } else {
        await sessionObs.logError(sessionId, result.error, `fetch_data:${result.source}`);
      }
    }

    sessionObs.consoleLog(
      sessionId,
      '📚',
      `Context init: Added ${results.filter(r => !r.error).length} data sources`,
      selection.reasoning.substring(0, 60)
    );

    return {
      sources: newSources,
      reasoning: selection.reasoning,
      useExisting: selection.use_existing,
      results
    };

  } catch (error) {
    await sessionObs.logError(sessionId, error, 'data_fetch');
    throw error;
  }
}

module.exports = {
  runInitializerAgent,
  initializeContext,
  getExistingKnowledge
};
