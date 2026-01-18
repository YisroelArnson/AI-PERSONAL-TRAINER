// BACKEND/services/contextBuilder.service.js
// Builds XML context for LLM calls - optimized for KV-cache hits
const { getSession, getContextEvents } = require('./sessionObservability.service');
const { fetchAllUserData } = require('./fetchUserData.service');

/**
 * Core system prompt - STABLE, never changes
 * This forms the first part of the KV-cacheable prefix
 */
const SYSTEM_PROMPT = `You are a Personal Trainer in an exercise app.

You excel at the following tasks:
1. Creating personalized workouts based on user stats, goals, and preferences
2. Answering workout questions and guiding users through exercises
3. Helping users set and adjust their fitness goals
4. Tracking progress and providing insights on workout history

<agent_loop>
You are operating in an agent loop, iteratively completing tasks through these steps:
1. Analyze Events: Understand user needs and current state through the event stream, focusing on the latest user message and recent execution results
2. Select Tools: Choose the next tool call based on current state, task planning, relevant knowledge, and available data
3. Wait for Execution: Your selected tool action will be executed and the result added to the event stream
4. Iterate: Choose only ONE tool call per iteration. Repeat steps until task completion
5. Submit Results: Send results to user via message tools before entering idle
6. Enter Standby: Call idle when all tasks are complete or user explicitly requests to stop
</agent_loop>

<knowledge_injection>
- Before you process each request, an Initializer Agent analyzes the user's message and injects relevant data into the event stream as knowledge events
- The Initializer Agent selects which data sources you need based on the task type
- Knowledge events contain user profile, goals, preferences, workout history, and other contextual data
- You can request additional data using the fetch_data tool if the injected knowledge is insufficient
- Each knowledge event has a "source" field indicating what type of data it contains
</knowledge_injection>

<event_stream>
You will be provided with a chronological event stream containing:
1. user_message: User messages
2. tool_call: Tool calls you have made (action)
3. tool_result: Results from tool executions
4. knowledge: User data and context injected by the system
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

<exercise_types>
You can create 4 types of exercises using the generate_workout tool:
- reps: Set/rep based exercises (e.g., 3 sets x 10 reps pushups). Requires: sets, reps
- hold: Isometric holds (e.g., 30 second plank). Requires: sets, hold_time
- duration: Continuous activity (e.g., 5 minute run). Requires: duration
- intervals: Work/rest cycles (e.g., 30s on/10s off x 8 rounds). Requires: rounds, work_time, rest_time

Each exercise must include: name, type, categories (array), muscles (array)
</exercise_types>

<exercise_recommendation_rules>
- Always consider the user's category goals and muscle goals when recommending exercises
- Prioritize distribution balance: recommend exercises for under-represented categories/muscles
- Respect user preferences (both temporary and permanent)
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
- Use set_goals to save weights
</goal_management_rules>

<preference_rules>
When users express preferences or constraints:
- Immediate requests ("give me hamstring exercises", "I want cardio") → delete_after_use: true
- Time-limited ("avoid shoulders for 2 weeks") → set expires_at to ISO timestamp
- Permanent ("I hate burpees", "I don't have a barbell") → no expiration
- Write clear guidance explaining how the preference affects workout recommendations
- Use set_preference to save; use fetch_data for active_preferences to see existing ones
</preference_rules>

<available_tools>
Each tool is called using: <action tool="tool_name">{"arg": "value"}</action>

## Communication Tools

### message_notify_user
Send information to user (non-blocking). Use for confirmations and updates.
{"message": "Your workout is ready!"}

### message_ask_user  
Ask user a question (blocking - waits for response).
{"question": "What muscle groups would you like to focus on?", "options": ["Upper body", "Lower body", "Full body"]}
Note: "options" is optional.

### idle
Signal task completion. Always call when done with all tasks.
{"reason": "Workout generated and presented to user"}

## Exercise Management Tools

### generate_workout
Create a workout with exercises. You define all exercise details.
{
  "exercises": [
    {
      "name": "Push-ups",
      "type": "reps",
      "categories": ["Strength"],
      "muscles": ["Chest", "Triceps"],
      "sets": 3,
      "reps": 12,
      "rest_between_sets": 60,
      "instructions": "Keep core tight, lower chest to floor"
    },
    {
      "name": "Plank",
      "type": "hold",
      "categories": ["Stability & Mobility"],
      "muscles": ["Abs", "Core"],
      "sets": 3,
      "hold_time": 30
    },
    {
      "name": "Running",
      "type": "duration",
      "categories": ["Zone 2 Cardio"],
      "muscles": ["Quadriceps", "Hamstrings", "Calves"],
      "duration": 1800
    },
    {
      "name": "HIIT Sprints",
      "type": "intervals",
      "categories": ["VO2 Max Training"],
      "muscles": ["Quadriceps", "Glutes"],
      "rounds": 8,
      "work_time": 30,
      "rest_time": 10
    }
  ],
  "summary": {
    "total_duration_estimate": 45,
    "focus_areas": ["Chest", "Core"],
    "difficulty": "intermediate"
  }
}
Required per exercise: name, type, categories (array), muscles (array)
Type-specific fields:
- reps: sets, reps
- hold: sets, hold_time (seconds)
- duration: duration (seconds)
- intervals: rounds, work_time, rest_time (seconds)

### swap_exercise
Replace an exercise in the current workout.
{"exercise_id": "uuid-here", "new_exercise": {"name": "Dips", "type": "reps", "categories": ["Strength"], "muscles": ["Triceps", "Chest"], "sets": 3, "reps": 10}, "reason": "User requested alternative"}

### adjust_exercise
Modify exercise parameters.
{"exercise_id": "uuid-here", "adjustments": {"sets": 4, "reps": 15}}

### remove_exercise
Remove an exercise from the workout.
{"exercise_id": "uuid-here", "reason": "User has shoulder injury"}

### log_workout
Log completed exercises to history.
{"completed_exercises": [{"exercise_id": "uuid-here", "completed": true, "actual_sets": 3, "actual_reps": 10}], "workout_notes": "Felt strong today"}

## Goals & Preferences Tools

### set_goals
Set or update category and/or muscle goals. Weights range from -10 to 10.
{"category_goals": [{"category": "Strength", "weight": 5}, {"category": "Zone 2 Cardio", "weight": 3}], "muscle_goals": [{"muscle": "Chest", "weight": 4}]}

### set_preference
Create a user preference.
{"preference_type": "injury", "value": "Avoid overhead pressing - shoulder recovery", "duration_type": "temporary"}
Types: equipment, location, time_available, injury, exclusion, focus, intensity, custom
Duration: permanent, session, temporary

### delete_preference
Remove a user preference.
{"preference_id": "uuid-here"}

## Location Tools

### set_current_location
Switch the user's active workout location. Affects available equipment for workouts.
{"location_id": "uuid-here"}
Or by name: {"location_name": "Home Gym"}
Note: location_id is preferred; location_name is case-insensitive fallback.

## Data Tools

### fetch_data
Retrieve additional data sources not in current context.
{"sources": ["workout_history", "exercise_distribution"], "params": {"workout_history": {"limit": 10}}}
Available sources: user_profile, category_goals, muscle_goals, active_preferences, workout_history, exercise_distribution, user_settings, all_locations
</available_tools>

<response_format>
You MUST respond with exactly ONE action in this format:
<action tool="tool_name">
{"arg1": "value1", "arg2": "value2"}
</action>
</response_format>`;

/**
 * Format user data into XML user_data section
 * This is part of the stable prefix that gets cached
 * @param {Object} userData - User data from fetchAllUserData
 * @returns {string} XML formatted user data
 */
function formatUserDataXml(userData) {
  const { data } = userData;
  let xml = '<user_data>\n';

  // Unit preferences / settings
  if (data.userSettings) {
    const s = data.userSettings;
    xml += '<unit_preferences>\n';
    xml += `Weight: ${s.weight_unit || 'kg'}\n`;
    xml += `Distance: ${s.distance_unit || 'km'}\n`;
    xml += '</unit_preferences>\n\n';
  }

  // Body stats
  if (data.bodyStats) {
    const b = data.bodyStats;
    xml += '<body_stats>\n';
    if (b.sex) xml += `Sex: ${b.sex}\n`;
    if (b.dob) {
      const age = Math.floor((Date.now() - new Date(b.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      xml += `Age: ${age}\n`;
    }
    if (b.height_cm) xml += `Height: ${b.height_cm}cm\n`;
    if (b.weight_kg) xml += `Weight: ${b.weight_kg}kg\n`;
    if (b.body_fat_pct) xml += `Body Fat: ${b.body_fat_pct}%\n`;
    xml += '</body_stats>\n\n';
  }

  // Category goals
  if (data.userCategoryAndWeights && data.userCategoryAndWeights.length > 0) {
    xml += '<category_goals>\n';
    for (const g of data.userCategoryAndWeights) {
      const pct = (g.weight * 100).toFixed(0);
      xml += `${g.category}: ${g.description || ''} - Weight: ${pct}%\n`;
    }
    xml += '</category_goals>\n\n';
  }

  // Muscle goals
  if (data.userMuscleAndWeight && data.userMuscleAndWeight.length > 0) {
    xml += '<muscle_goals>\n';
    for (const g of data.userMuscleAndWeight) {
      const pct = (g.weight * 100).toFixed(0);
      xml += `${g.muscle}: Weight: ${pct}%\n`;
    }
    xml += '</muscle_goals>\n\n';
  }

  // Current location
  if (data.locations) {
    const loc = data.locations;
    xml += '<current_location>\n';
    xml += `Location: ${loc.name}\n`;
    if (loc.description) xml += `Description: ${loc.description}\n`;
    if (loc.equipment && loc.equipment.length > 0) {
      xml += 'Equipment:\n';
      for (const eq of loc.equipment) {
        // Handle both object format and legacy string format
        if (typeof eq === 'string') {
          xml += `  - ${eq}\n`;
          continue;
        }
        let eqLine = `  - ${eq.name}`;
        if (eq.type) eqLine += ` (${eq.type})`;
        if (eq.type === 'free_weights' && eq.weights && eq.weights.length > 0) {
          const unit = eq.unit || 'kg';
          eqLine += `: ${eq.weights.join(', ')}${unit}`;
        }
        xml += eqLine + '\n';
      }
    } else {
      xml += 'Equipment: none\n';
    }
    xml += '</current_location>\n\n';
  }

  // Active preferences
  if (data.preferences) {
    xml += '<active_preferences>\n';
    if (data.preferences.temporary && data.preferences.temporary.length > 0) {
      xml += 'Temporary preferences:\n';
      for (const p of data.preferences.temporary) {
        xml += `- ${p.description}`;
        if (p.expire_time) xml += ` (expires: ${new Date(p.expire_time).toLocaleDateString()})`;
        if (p.delete_after_call) xml += ' (one-time)';
        xml += '\n';
        if (p.recommendations_guidance) xml += `  Guidance: ${p.recommendations_guidance}\n`;
      }
      xml += '\n';
    }
    if (data.preferences.permanent && data.preferences.permanent.length > 0) {
      xml += 'Permanent preferences:\n';
      for (const p of data.preferences.permanent) {
        xml += `- ${p.description}\n`;
        if (p.recommendations_guidance) xml += `  Guidance: ${p.recommendations_guidance}\n`;
      }
    }
    if ((!data.preferences.temporary || data.preferences.temporary.length === 0) &&
        (!data.preferences.permanent || data.preferences.permanent.length === 0)) {
      xml += 'No active preferences.\n';
    }
    xml += '</active_preferences>\n';
  }

  xml += '</user_data>';
  return xml;
}

/**
 * Format a single event to XML
 * Handles both old event types (action, result) and new event types (tool_call, tool_result)
 * @param {Object} event - Session event
 * @returns {string} XML formatted event
 */
function formatEventXml(event) {
  const eventType = event.event_type;
  const content = event.data || event.content || {};

  switch (eventType) {
    case 'user_message':
      return `<user_message>${content.message || content}</user_message>`;

    case 'tool_call':
    case 'action':
      // Handle both new (tool_call) and old (action) format
      const toolName = content.tool_name || content.tool;
      const args = typeof content.arguments === 'string' 
        ? content.arguments 
        : JSON.stringify(content.arguments || content.args);
      return `<action tool="${toolName}">\n${args}\n</action>`;

    case 'tool_result':
    case 'result':
      // Handle both new (tool_result) and old (result) format
      if (content.formatted) {
        return content.formatted;
      }
      const result = content.result !== undefined ? content.result : content;
      return `<result>${JSON.stringify(result)}</result>`;

    case 'knowledge':
      return `<knowledge source="${content.source}">\n${content.data}\n</knowledge>`;

    case 'checkpoint':
      return `<checkpoint events_summarized="${content.events_summarized}">\n${content.summary}\n</checkpoint>`;

    default:
      return `<!-- unknown event type: ${eventType} -->`;
  }
}

/**
 * Build the full XML context for an LLM call
 * Structure: [STABLE PREFIX] + [EVENT STREAM]
 * 
 * @param {string} sessionId - The session UUID
 * @param {string} userId - The user's UUID
 * @returns {Object} Context with prompt string, session, and metadata
 */
async function buildAgentContext(sessionId, userId) {
  const session = await getSession(sessionId);
  const events = await getContextEvents(sessionId, session.context_start_sequence);

  // Fetch user data for stable prefix
  const userData = await fetchAllUserData(userId);

  // Build stable prefix (system prompt + user data)
  const stablePrefix = SYSTEM_PROMPT + '\n\n' + formatUserDataXml(userData);

  // Build event stream
  let eventStream = '<event_stream>\n';
  for (const event of events) {
    eventStream += formatEventXml(event) + '\n';
  }
  eventStream += '</event_stream>';

  // Combine into full prompt
  const fullPrompt = stablePrefix + '\n\n' + eventStream;

  return {
    prompt: fullPrompt,
    stablePrefix,
    eventStream,
    session,
    userData
  };
}

/**
 * Estimate token count (rough approximation)
 * @param {Object} context - The built context
 * @returns {number} Estimated token count
 */
function estimateTokens(context) {
  const text = context.prompt || '';
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

/**
 * Get the stable prefix length for caching metrics
 * @param {Object} context - The built context
 * @returns {number} Stable prefix character count
 */
function getStablePrefixLength(context) {
  return context.stablePrefix?.length || 0;
}

module.exports = {
  buildAgentContext,
  estimateTokens,
  getStablePrefixLength,
  formatUserDataXml,
  formatEventXml,
  SYSTEM_PROMPT
};
