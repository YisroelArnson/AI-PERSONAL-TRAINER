// BACKEND/services/contextBuilder.service.js
// Builds context for Anthropic LLM calls with proper multi-cache-block approach
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
You create exercises using the generate_workout tool with exactly 4 types:

| Type | Use For | Required Fields |
|------|---------|-----------------|
| reps | Strength, bodyweight, weighted exercises | sets, reps[], rest_sec. Optional: load_each[], load_unit |
| hold | Planks, wall sits, static stretches, balance | sets, hold_sec[], rest_sec |
| duration | Running, cycling, yoga flows, continuous cardio | duration_min. Optional: distance, distance_unit, target_pace |
| intervals | HIIT, tabata, sprint work | rounds, work_sec, rest_sec |

Every exercise MUST include:
- exercise_name: Name of the exercise
- exercise_type: One of [reps, hold, duration, intervals]
- order: Position in workout (1-indexed)
- muscles_utilized: Array of {muscle, share} where shares sum to ~1.0
- goals_addressed: Array of {goal, share} where shares sum to ~1.0
- reasoning: Brief explanation for selecting this exercise

Valid muscles (16): Chest, Back, Shoulders, Biceps, Triceps, Abs, Lower Back, Quadriceps, Hamstrings, Glutes, Calves, Trapezius, Abductors, Adductors, Forearms, Neck

GROUPING: For circuits, supersets, etc., use the optional "group" field instead of a separate type:
- group.type: circuit, superset, giant_set, warmup, cooldown, sequence
- group.id: Unique identifier (e.g., "superset-1")
- group.position: Order within the group (1-indexed)
- group.rounds: How many times to repeat the group (set on first exercise only)
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

<artifact_rules>
CRITICAL: Workouts are created as artifacts that must be explicitly delivered to the user.

1. generate_workout creates an artifact and returns an artifact_id (e.g., "art_x7k2m9p4")
2. The artifact is NOT shown to the user automatically - it is stored waiting for delivery
3. You MUST call message_notify_user with the artifact_id to deliver it
4. REQUIRED workflow after calling generate_workout:
   - generate_workout returns: artifact_id="art_x7k2m9p4"
   - You MUST then call: message_notify_user(message="Here's your workout!", artifact_id="art_x7k2m9p4")
   - Only then does the user see their workout
5. If you skip the message_notify_user step with artifact_id, the user gets NO workout!
6. Previously created artifacts appear in the event stream as <artifact> elements
</artifact_rules>

<available_tools>
Each tool is called using: <action tool="tool_name">{"arg": "value"}</action>

## Communication Tools

### message_notify_user
Send information to user (non-blocking). Use for confirmations and updates.
Optionally include an artifact_id to deliver a previously created artifact with the message.
{"message": "Your workout is ready!"}
With artifact: {"message": "Here's your personalized workout!", "artifact_id": "art_abc123"}

### message_ask_user
Ask user a question (blocking - waits for response).
{"question": "What muscle groups would you like to focus on?", "options": ["Upper body", "Lower body", "Full body"]}
Note: "options" is optional.

### idle
Signal task completion. Always call when done with all tasks.
{"reason": "Workout generated and presented to user"}

## Exercise Management Tools

### generate_workout
Create a workout with exercises using the 4-type system. Each exercise requires:
- exercise_name, exercise_type, order
- muscles_utilized (with shares summing to ~1.0)
- goals_addressed (with shares summing to ~1.0)
- reasoning

Example with all 4 types:
{
  "workout": {
    "exercises": [
      {
        "exercise_name": "Bench Press",
        "exercise_type": "reps",
        "order": 1,
        "muscles_utilized": [
          {"muscle": "Chest", "share": 0.5},
          {"muscle": "Triceps", "share": 0.3},
          {"muscle": "Shoulders", "share": 0.2}
        ],
        "goals_addressed": [
          {"goal": "strength", "share": 0.8},
          {"goal": "hypertrophy", "share": 0.2}
        ],
        "reasoning": "Compound pushing movement to build chest strength",
        "exercise_description": "Lie on bench, lower bar to chest, press up explosively",
        "sets": 3,
        "reps": [10, 10, 8],
        "load_each": [40, 40, 45],
        "load_unit": "kg",
        "rest_sec": 90,
        "equipment": ["barbell", "bench"]
      },
      {
        "exercise_name": "Plank",
        "exercise_type": "hold",
        "order": 2,
        "muscles_utilized": [
          {"muscle": "Abs", "share": 0.6},
          {"muscle": "Lower Back", "share": 0.4}
        ],
        "goals_addressed": [
          {"goal": "stability", "share": 1.0}
        ],
        "reasoning": "Core stability exercise for posture and strength foundation",
        "exercise_description": "Hold plank position with straight body line",
        "sets": 3,
        "hold_sec": [45, 45, 60],
        "rest_sec": 30
      },
      {
        "exercise_name": "Running",
        "exercise_type": "duration",
        "order": 3,
        "muscles_utilized": [
          {"muscle": "Quadriceps", "share": 0.3},
          {"muscle": "Hamstrings", "share": 0.25},
          {"muscle": "Calves", "share": 0.25},
          {"muscle": "Glutes", "share": 0.2}
        ],
        "goals_addressed": [
          {"goal": "endurance", "share": 0.7},
          {"goal": "cardio", "share": 0.3}
        ],
        "reasoning": "Zone 2 cardio for aerobic base building",
        "exercise_description": "Maintain conversational pace, focus on form",
        "duration_min": 30,
        "distance": 5,
        "distance_unit": "km",
        "target_pace": "6:00/km"
      },
      {
        "exercise_name": "Tabata Burpees",
        "exercise_type": "intervals",
        "order": 4,
        "muscles_utilized": [
          {"muscle": "Quadriceps", "share": 0.25},
          {"muscle": "Chest", "share": 0.25},
          {"muscle": "Shoulders", "share": 0.25},
          {"muscle": "Abs", "share": 0.25}
        ],
        "goals_addressed": [
          {"goal": "vo2max", "share": 0.6},
          {"goal": "conditioning", "share": 0.4}
        ],
        "reasoning": "High intensity intervals for metabolic conditioning",
        "exercise_description": "Full burpee with jump, go all out during work periods",
        "rounds": 8,
        "work_sec": 20,
        "rest_sec": 10
      }
    ],
    "summary": {
      "title": "Upper Body & Cardio Session",
      "estimated_duration_min": 45,
      "primary_goals": ["strength", "cardio"],
      "muscles_targeted": ["Chest", "Abs", "Quadriceps"],
      "difficulty": "intermediate"
    }
  }
}

SUPERSET EXAMPLE (using grouping):
{
  "exercises": [
    {
      "exercise_name": "Bicep Curls",
      "exercise_type": "reps",
      "order": 1,
      "group": {"id": "superset-1", "type": "superset", "position": 1, "name": "Arms Superset", "rounds": 3},
      "muscles_utilized": [{"muscle": "Biceps", "share": 1.0}],
      "goals_addressed": [{"goal": "hypertrophy", "share": 1.0}],
      "reasoning": "Superset pairing for efficient arm training",
      "sets": 3, "reps": [12, 12, 12], "load_each": [10, 10, 10], "load_unit": "kg", "rest_sec": 0
    },
    {
      "exercise_name": "Tricep Pushdowns",
      "exercise_type": "reps",
      "order": 2,
      "group": {"id": "superset-1", "type": "superset", "position": 2, "rest_between_rounds_sec": 60},
      "muscles_utilized": [{"muscle": "Triceps", "share": 1.0}],
      "goals_addressed": [{"goal": "hypertrophy", "share": 1.0}],
      "reasoning": "Antagonist pairing for balanced arm development",
      "sets": 3, "reps": [12, 12, 12], "load_each": [15, 15, 15], "load_unit": "kg", "rest_sec": 0
    }
  ]
}

Type quick reference:
- reps: sets, reps[], load_each[] (optional), load_unit, rest_sec
- hold: sets, hold_sec[], rest_sec
- duration: duration_min, distance (optional), distance_unit, target_pace (optional)
- intervals: rounds, work_sec, rest_sec

### swap_exercise
Replace an exercise in the current workout. Use same structure as generate_workout exercises.
exercise_id can be either the UUID or the order number (e.g., "1" for first exercise).
{"exercise_id": "1", "new_exercise": {"exercise_name": "...", "exercise_type": "reps|hold|duration|intervals", "order": 1, "muscles_utilized": [...], "goals_addressed": [...], "reasoning": "...", ...type-specific fields...}, "reason": "User requested alternative"}

### adjust_exercise
Modify exercise parameters. exercise_id can be either the UUID or the order number.
{"exercise_id": "1", "adjustments": {"sets": 4, "reps": 15}}

### remove_exercise
Remove an exercise from the workout. exercise_id can be either the UUID or the order number.
{"exercise_id": "1", "reason": "User has shoulder injury"}

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
You MUST respond with a JSON object containing your tool call:

{
  "tool": "tool_name",
  "arguments": {"arg1": "value1", "arg2": "value2"}
}

Examples:

Sending a message to the user:
{"tool": "message_notify_user", "arguments": {"message": "Your workout is ready!"}}

Asking the user a question:
{"tool": "message_ask_user", "arguments": {"question": "What muscle groups do you want to focus on?", "options": ["Upper body", "Lower body", "Full body"]}}

Completing a task:
{"tool": "idle", "arguments": {"reason": "Workout generated and presented to user"}}

IMPORTANT: Always respond with valid JSON. The tool field must be one of the available tool names.
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
 * @param {Array} messages - Anthropic messages array
 * @returns {Array} Messages with cache_control added
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

/**
 * Build the full context for an Anthropic API call
 * Uses proper multi-cache-block approach with 4 cache breakpoints:
 * 1. Tools - cache_control on last tool
 * 2. System prompt - cache_control on system text block
 * 3. User data - cache_control on separate system text block
 * 4. Messages - cache_control on last content block of last message
 *
 * @param {string} sessionId - The session UUID
 * @param {string} userId - The user's UUID
 * @returns {Object} Context with systemPrompt, userDataXml, messages
 */
async function buildAgentContext(sessionId, userId) {
  const session = await getSession(sessionId);
  const events = await getContextEvents(sessionId, session.context_start_sequence);
  const userData = await fetchAllUserData(userId);

  // Format user data as XML
  const userDataXml = formatUserDataXml(userData);

  // Convert events to Anthropic message format
  const messages = buildEventsToMessages(events);

  // Validate: messages should not be empty
  if (messages.length === 0) {
    throw new Error('Cannot build context: no events in session');
  }

  // Add cache_control to last message
  addCacheControlToLastMessage(messages);

  return {
    systemPrompt: SYSTEM_PROMPT,
    userDataXml,
    messages,  // Native Anthropic format with cache_control on last message
    session,
    eventCount: events.length
  };
}

/**
 * Estimate token count (rough approximation)
 * @param {Object} context - The built context
 * @returns {number} Estimated token count
 */
function estimateTokens(context) {
  // Estimate based on system prompt + user data + messages
  let totalChars = 0;
  totalChars += context.systemPrompt?.length || 0;
  totalChars += context.userDataXml?.length || 0;

  // Estimate message content
  if (context.messages) {
    for (const msg of context.messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.text) totalChars += block.text.length;
          if (block.content) totalChars += block.content.length;
          if (block.input) totalChars += JSON.stringify(block.input).length;
        }
      }
    }
  }

  // Rough estimate: ~4 chars per token
  return Math.ceil(totalChars / 4);
}

module.exports = {
  buildAgentContext,
  buildEventsToMessages,
  addCacheControlToLastMessage,
  estimateTokens,
  formatUserDataXml,
  SYSTEM_PROMPT
};
