# Personal Trainer AI Agent Implementation Plan

**Created**: January 15, 2026  
**Status**: Planning  
**Reference**: `documents/agent-design.md`

---

## Overview

This plan migrates from the current Vercel AI SDK-based orchestration agent to a manual agent loop architecture with:
- Event stream persistence for conversation history
- Initializer Agent for dynamic context selection
- Direct exercise generation (replacing recommendation service)
- ~15 core tools (with ~18 more deferred to later phases)

---

## Phase 1: Database Schema & Foundation

**Goal**: Create the persistence layer for sessions and events.

### Files to Create/Modify
- `BACKEND/database/agent_schema.sql` (new)

### SQL Schema

```sql
-- Agent Sessions Table
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  context_start_sequence INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Agent Events Table  
CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('user_message', 'action', 'result', 'knowledge', 'checkpoint')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, sequence_number)
);

-- Indexes
CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_events_session_sequence ON agent_events(session_id, sequence_number);
CREATE INDEX idx_agent_events_session_type ON agent_events(session_id, event_type);

-- Row Level Security
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

-- Policies for agent_sessions
CREATE POLICY "Users can view own sessions" ON agent_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions" ON agent_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON agent_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Policies for agent_events
CREATE POLICY "Users can view own session events" ON agent_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agent_sessions 
      WHERE agent_sessions.id = agent_events.session_id 
      AND agent_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create events in own sessions" ON agent_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_sessions 
      WHERE agent_sessions.id = agent_events.session_id 
      AND agent_sessions.user_id = auth.uid()
    )
  );
```

### Success Criteria
- [ ] Tables created in Supabase (SQL file ready at `BACKEND/database/agent_schema.sql`)
- [ ] RLS policies active and tested
- [ ] Can insert/query sessions and events via Supabase client

---

## Phase 2: Session Management Service

**Goal**: Create the foundation service for managing agent sessions and events.

### Files to Create
- `BACKEND/services/agentSession.service.js` (new)

### Implementation

```javascript
// BACKEND/services/agentSession.service.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get or create a session for a user
 */
async function getOrCreateSession(userId) {
  // First, try to get the most recent active session
  const { data: existing, error: fetchError } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return existing;
  }

  // Create new session
  const { data: newSession, error: createError } = await supabase
    .from('agent_sessions')
    .insert({ user_id: userId })
    .select()
    .single();

  if (createError) throw createError;
  return newSession;
}

/**
 * Create a new session (force new)
 */
async function createSession(userId, metadata = {}) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .insert({ user_id: userId, metadata })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get session by ID
 */
async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Append an event to a session
 */
async function appendEvent(sessionId, eventType, content) {
  // Get next sequence number
  const { data: maxSeq } = await supabase
    .from('agent_events')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .single();

  const nextSequence = (maxSeq?.sequence_number ?? -1) + 1;

  const { data, error } = await supabase
    .from('agent_events')
    .insert({
      session_id: sessionId,
      sequence_number: nextSequence,
      event_type: eventType,
      content
    })
    .select()
    .single();

  if (error) throw error;

  // Update session timestamp
  await supabase
    .from('agent_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  return data;
}

/**
 * Get events for a session (from context_start_sequence)
 */
async function getSessionEvents(sessionId, fromSequence = 0) {
  const { data, error } = await supabase
    .from('agent_events')
    .select('*')
    .eq('session_id', sessionId)
    .gte('sequence_number', fromSequence)
    .order('sequence_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Update session context start (for checkpointing)
 */
async function updateContextStart(sessionId, newStartSequence) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .update({ context_start_sequence: newStartSequence })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user's session history
 */
async function getUserSessions(userId, limit = 10) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

module.exports = {
  getOrCreateSession,
  createSession,
  getSession,
  appendEvent,
  getSessionEvents,
  updateContextStart,
  getUserSessions
};
```

### Success Criteria
- [ ] Can create sessions for users
- [ ] Can append events with auto-incrementing sequence numbers
- [ ] Can retrieve events from a given sequence
- [ ] Session timestamps update correctly

---

## Phase 3: Data Formatters & Sources Registry

**Goal**: Create concise formatters for all data sources used in agent context.

### Files to Create
- `BACKEND/services/dataFormatters.service.js` (new)
- `BACKEND/services/dataSources.service.js` (new)

### Data Formatters Implementation

```javascript
// BACKEND/services/dataFormatters.service.js

/**
 * Format workout history for context
 * Optimized for token efficiency
 */
function formatWorkoutHistory(workouts) {
  if (!workouts || workouts.length === 0) {
    return 'No workout history available.';
  }

  return workouts.map(w => {
    const date = new Date(w.completed_at).toLocaleDateString();
    const exercises = w.exercises?.map(e => 
      `${e.name}(${e.sets}x${e.reps || e.duration || e.hold_time})`
    ).join(', ') || 'No exercises logged';
    return `${date}: ${exercises}`;
  }).join('\n');
}

/**
 * Format category goals for context
 */
function formatCategoryGoals(goals) {
  if (!goals || goals.length === 0) {
    return 'No category goals set.';
  }

  return goals.map(g => {
    const weight = g.weight > 0 ? `+${g.weight}` : g.weight;
    return `${g.category_name}: ${weight}`;
  }).join(', ');
}

/**
 * Format muscle goals for context
 */
function formatMuscleGoals(goals) {
  if (!goals || goals.length === 0) {
    return 'No muscle goals set.';
  }

  return goals.map(g => {
    const weight = g.weight > 0 ? `+${g.weight}` : g.weight;
    return `${g.muscle_name}: ${weight}`;
  }).join(', ');
}

/**
 * Format active preferences for context
 */
function formatPreferences(preferences) {
  if (!preferences || preferences.length === 0) {
    return 'No active preferences.';
  }

  return preferences.map(p => {
    let str = `[${p.id}] ${p.preference_type}: ${p.value}`;
    if (p.duration_type !== 'permanent') {
      str += ` (${p.duration_type})`;
    }
    return str;
  }).join('\n');
}

/**
 * Format exercise distribution for context
 */
function formatDistribution(distribution) {
  if (!distribution) {
    return 'No distribution data available.';
  }

  const { category_counts, muscle_counts, last_updated } = distribution;
  
  let result = '';
  
  if (category_counts && Object.keys(category_counts).length > 0) {
    result += 'Categories: ' + Object.entries(category_counts)
      .map(([cat, count]) => `${cat}:${count}`)
      .join(', ');
  }
  
  if (muscle_counts && Object.keys(muscle_counts).length > 0) {
    if (result) result += '\n';
    result += 'Muscles: ' + Object.entries(muscle_counts)
      .map(([muscle, count]) => `${muscle}:${count}`)
      .join(', ');
  }

  return result || 'No distribution data.';
}

/**
 * Format user settings for context
 */
function formatUserSettings(settings) {
  if (!settings) {
    return 'Default settings in use.';
  }

  const parts = [];
  if (settings.preferred_workout_duration) {
    parts.push(`Duration: ${settings.preferred_workout_duration}min`);
  }
  if (settings.fitness_level) {
    parts.push(`Level: ${settings.fitness_level}`);
  }
  if (settings.available_equipment?.length > 0) {
    parts.push(`Equipment: ${settings.available_equipment.join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : 'Default settings in use.';
}

/**
 * Format body stats for context
 */
function formatBodyStats(stats) {
  if (!stats) {
    return 'No body stats recorded.';
  }

  const parts = [];
  if (stats.height_cm) parts.push(`Height: ${stats.height_cm}cm`);
  if (stats.weight_kg) parts.push(`Weight: ${stats.weight_kg}kg`);
  if (stats.age) parts.push(`Age: ${stats.age}`);
  if (stats.gender) parts.push(`Gender: ${stats.gender}`);
  
  return parts.length > 0 ? parts.join(' | ') : 'No body stats recorded.';
}

module.exports = {
  formatWorkoutHistory,
  formatCategoryGoals,
  formatMuscleGoals,
  formatPreferences,
  formatDistribution,
  formatUserSettings,
  formatBodyStats
};
```

### Data Sources Registry Implementation

```javascript
// BACKEND/services/dataSources.service.js
const { createClient } = require('@supabase/supabase-js');
const formatters = require('./dataFormatters.service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Registry of all available data sources
 * Each source has: fetch function, formatter, and description
 */
const DATA_SOURCES = {
  user_profile: {
    description: 'Basic user profile and body stats',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('body_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data;
    },
    format: formatters.formatBodyStats
  },

  category_goals: {
    description: 'User category training goals and weights',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('user_category_and_weight')
        .select('*')
        .eq('user_id', userId);
      return data;
    },
    format: formatters.formatCategoryGoals
  },

  muscle_goals: {
    description: 'User muscle-specific training goals',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('user_muscle_and_weight')
        .select('*')
        .eq('user_id', userId);
      return data;
    },
    format: formatters.formatMuscleGoals
  },

  active_preferences: {
    description: 'Current active user preferences',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);
      return data;
    },
    format: formatters.formatPreferences
  },

  workout_history: {
    description: 'Recent workout history',
    fetch: async (userId, params = {}) => {
      const limit = params.limit || 10;
      const { data } = await supabase
        .from('workout_history')
        .select('*')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(limit);
      return data;
    },
    format: formatters.formatWorkoutHistory
  },

  exercise_distribution: {
    description: 'Exercise distribution tracking data',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('exercise_distribution_tracking')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data;
    },
    format: formatters.formatDistribution
  },

  user_settings: {
    description: 'User app settings and preferences',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data;
    },
    format: formatters.formatUserSettings
  }
};

/**
 * Fetch and format a specific data source
 */
async function fetchDataSource(sourceName, userId, params = {}) {
  const source = DATA_SOURCES[sourceName];
  if (!source) {
    throw new Error(`Unknown data source: ${sourceName}`);
  }

  const rawData = await source.fetch(userId, params);
  const formatted = source.format(rawData);
  
  return {
    source: sourceName,
    raw: rawData,
    formatted
  };
}

/**
 * Fetch multiple data sources in parallel
 */
async function fetchMultipleDataSources(sourceNames, userId, params = {}) {
  const results = await Promise.all(
    sourceNames.map(name => 
      fetchDataSource(name, userId, params[name] || {})
        .catch(err => ({ source: name, error: err.message, formatted: 'Error loading data.' }))
    )
  );
  
  return results;
}

/**
 * Get list of available data sources with descriptions
 */
function getAvailableDataSources() {
  return Object.entries(DATA_SOURCES).map(([name, source]) => ({
    name,
    description: source.description
  }));
}

module.exports = {
  DATA_SOURCES,
  fetchDataSource,
  fetchMultipleDataSources,
  getAvailableDataSources
};
```

### Success Criteria
- [ ] All formatters produce concise, token-efficient output
- [ ] Data sources can be fetched by name
- [ ] Multiple sources can be fetched in parallel
- [ ] Errors are handled gracefully

---

## Phase 4: Initializer Agent

**Goal**: Create the lightweight agent that selects relevant data sources based on user input.

### Files to Create
- `BACKEND/services/initializerAgent.service.js` (new)

### Implementation

```javascript
// BACKEND/services/initializerAgent.service.js
const OpenAI = require('openai');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');
const { fetchMultipleDataSources, getAvailableDataSources } = require('./dataSources.service');
const { appendEvent, getSessionEvents } = require('./agentSession.service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Schema for initializer response
const InitializerResponseSchema = z.object({
  data_sources: z.array(z.string()).describe('Array of data source names to fetch'),
  reasoning: z.string().describe('Brief explanation of why these sources are needed')
});

const INITIALIZER_SYSTEM_PROMPT = `You are a context selection agent. Your job is to determine which data sources are needed to answer a user's message.

Available data sources:
{{DATA_SOURCES}}

Rules:
1. Select ONLY the data sources genuinely needed for this specific request
2. For workout requests: include category_goals, muscle_goals, active_preferences, exercise_distribution
3. For preference changes: include active_preferences
4. For goal changes: include category_goals and/or muscle_goals
5. For general questions: minimal or no data sources needed
6. Always consider what's already in the conversation context

Return a JSON object with:
- data_sources: array of source names to fetch
- reasoning: brief explanation of your selection`;

/**
 * Run the initializer agent to select data sources
 */
async function runInitializerAgent(userInput, existingKnowledge = []) {
  const availableSources = getAvailableDataSources();
  const sourcesDescription = availableSources
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n');

  const systemPrompt = INITIALIZER_SYSTEM_PROMPT
    .replace('{{DATA_SOURCES}}', sourcesDescription);

  const messages = [
    { role: 'system', content: systemPrompt },
    { 
      role: 'user', 
      content: `User message: "${userInput}"\n\nAlready loaded data sources: ${existingKnowledge.join(', ') || 'none'}` 
    }
  ];

  const response = await openai.beta.chat.completions.parse({
    model: 'gpt-4o-mini',
    messages,
    response_format: zodResponseFormat(InitializerResponseSchema, 'context_selection')
  });

  return response.choices[0].message.parsed;
}

/**
 * Get existing knowledge events from session
 */
async function getExistingKnowledge(sessionId, contextStartSequence) {
  const events = await getSessionEvents(sessionId, contextStartSequence);
  
  return events
    .filter(e => e.event_type === 'knowledge')
    .map(e => e.content.source);
}

/**
 * Initialize context for a new user message
 */
async function initializeContext(sessionId, userId, userInput) {
  // Get existing knowledge to avoid re-fetching
  const existingKnowledge = await getExistingKnowledge(sessionId, 0);
  
  // Run initializer to select needed sources
  const selection = await runInitializerAgent(userInput, existingKnowledge);
  
  // Filter out already-loaded sources
  const newSources = selection.data_sources.filter(
    source => !existingKnowledge.includes(source)
  );
  
  if (newSources.length === 0) {
    return { 
      sources: [], 
      reasoning: selection.reasoning,
      message: 'All needed data already in context' 
    };
  }

  // Fetch new data sources
  const results = await fetchMultipleDataSources(newSources, userId);
  
  // Append knowledge events
  for (const result of results) {
    if (!result.error) {
      await appendEvent(sessionId, 'knowledge', {
        source: result.source,
        data: result.formatted,
        timestamp: new Date().toISOString()
      });
    }
  }

  return {
    sources: newSources,
    reasoning: selection.reasoning,
    results
  };
}

module.exports = {
  runInitializerAgent,
  initializeContext,
  getExistingKnowledge
};
```

### Success Criteria
- [ ] Initializer correctly identifies needed data sources
- [ ] Doesn't re-fetch already loaded data
- [ ] Knowledge events are appended to session
- [ ] Uses gpt-4o-mini for cost efficiency

---

## Phase 5: Tool Definitions & Registry

**Goal**: Create the tool definitions and execution registry for the agent.

### Files to Create
- `BACKEND/agent/tools/index.js` (new)
- `BACKEND/agent/tools/communication.js` (new)
- `BACKEND/agent/tools/exercises.js` (new)
- `BACKEND/agent/tools/goals.js` (new)
- `BACKEND/agent/tools/preferences.js` (new)
- `BACKEND/agent/tools/data.js` (new)
- `BACKEND/agent/schemas/exercise.schema.js` (new)

### Exercise Schema

```javascript
// BACKEND/agent/schemas/exercise.schema.js
const { z } = require('zod');

// Base fields for all exercise types
const BaseExerciseSchema = z.object({
  name: z.string().describe('Exercise name'),
  instructions: z.string().optional().describe('Brief form cues'),
  notes: z.string().optional().describe('Modifications or tips'),
  categories: z.array(z.string()).describe('Exercise categories (e.g., strength, cardio)'),
  muscles: z.array(z.string()).describe('Target muscles')
});

// Reps-based exercises (e.g., pushups, squats)
const RepsExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('reps'),
  sets: z.number().int().min(1).describe('Number of sets'),
  reps: z.number().int().min(1).describe('Reps per set'),
  rest_between_sets: z.number().int().optional().describe('Rest in seconds between sets')
});

// Hold exercises (e.g., plank, wall sit)
const HoldExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('hold'),
  sets: z.number().int().min(1).describe('Number of sets'),
  hold_time: z.number().int().min(1).describe('Hold duration in seconds'),
  rest_between_sets: z.number().int().optional().describe('Rest in seconds between sets')
});

// Duration exercises (e.g., running, jumping jacks)
const DurationExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('duration'),
  duration: z.number().int().min(1).describe('Total duration in seconds')
});

// Interval exercises (e.g., HIIT, Tabata)
const IntervalsExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('intervals'),
  rounds: z.number().int().min(1).describe('Number of rounds'),
  work_time: z.number().int().min(1).describe('Work period in seconds'),
  rest_time: z.number().int().min(0).describe('Rest period in seconds')
});

// Union of all exercise types
const ExerciseSchema = z.discriminatedUnion('type', [
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema
]);

// Full workout response schema
const WorkoutResponseSchema = z.object({
  exercises: z.array(ExerciseSchema).min(1).describe('Array of exercises'),
  summary: z.object({
    total_duration_estimate: z.number().optional().describe('Estimated duration in minutes'),
    focus_areas: z.array(z.string()).optional().describe('Main focus areas'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
  }).optional()
});

module.exports = {
  BaseExerciseSchema,
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema,
  ExerciseSchema,
  WorkoutResponseSchema
};
```

### Communication Tools

```javascript
// BACKEND/agent/tools/communication.js

const communicationTools = {
  message_notify_user: {
    description: 'Send a message to the user without expecting a response. Use for confirmations, status updates, and information.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to display to the user'
        }
      },
      required: ['message']
    },
    execute: async (args, context) => {
      return {
        success: true,
        message: args.message,
        type: 'notification'
      };
    },
    formatResult: (result) => `Notified user: "${result.message.substring(0, 50)}..."`
  },

  message_ask_user: {
    description: 'Ask the user a question and wait for their response. Use when you need clarification or input.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user'
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of suggested responses'
        }
      },
      required: ['question']
    },
    execute: async (args, context) => {
      return {
        success: true,
        question: args.question,
        options: args.options || [],
        type: 'question',
        awaiting_response: true
      };
    },
    formatResult: (result) => `Asked user: "${result.question.substring(0, 50)}..."`
  },

  idle: {
    description: 'Signal that you have completed the current task and are waiting for user input. Always call this when done.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for going idle'
        }
      },
      required: ['reason']
    },
    execute: async (args, context) => {
      return {
        success: true,
        idle: true,
        reason: args.reason
      };
    },
    formatResult: (result) => `Agent idle: ${result.reason}`
  }
};

module.exports = { communicationTools };
```

### Exercise Tools

```javascript
// BACKEND/agent/tools/exercises.js
const { v4: uuidv4 } = require('uuid');
const exerciseDistributionService = require('../../services/exerciseDistribution.service');

// In-memory storage for current workout session
// In production, this would be stored in the session state
const workoutSessions = new Map();

const exerciseTools = {
  generate_workout: {
    description: 'Generate a workout with exercises based on user goals, preferences, and context. The exercises will be created directly by you.',
    parameters: {
      type: 'object',
      properties: {
        workout: {
          type: 'object',
          description: 'The workout object containing exercises array',
          properties: {
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['reps', 'hold', 'duration', 'intervals'] },
                  instructions: { type: 'string' },
                  categories: { type: 'array', items: { type: 'string' } },
                  muscles: { type: 'array', items: { type: 'string' } },
                  sets: { type: 'number' },
                  reps: { type: 'number' },
                  hold_time: { type: 'number' },
                  duration: { type: 'number' },
                  rounds: { type: 'number' },
                  work_time: { type: 'number' },
                  rest_time: { type: 'number' },
                  rest_between_sets: { type: 'number' }
                },
                required: ['name', 'type', 'categories', 'muscles']
              }
            },
            summary: {
              type: 'object',
              properties: {
                total_duration_estimate: { type: 'number' },
                focus_areas: { type: 'array', items: { type: 'string' } },
                difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] }
              }
            }
          },
          required: ['exercises']
        }
      },
      required: ['workout']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const { workout } = args;

      // Assign unique IDs to each exercise
      const exercisesWithIds = workout.exercises.map(exercise => ({
        ...exercise,
        id: uuidv4()
      }));

      // Store in session
      workoutSessions.set(sessionId, {
        exercises: exercisesWithIds,
        summary: workout.summary,
        created_at: new Date().toISOString()
      });

      return {
        success: true,
        exercises: exercisesWithIds,
        summary: workout.summary,
        exercise_count: exercisesWithIds.length
      };
    },
    formatResult: (result) => {
      const names = result.exercises.map(e => e.name).join(', ');
      return `Generated ${result.exercise_count} exercises: ${names}`;
    }
  },

  swap_exercise: {
    description: 'Replace an exercise in the current workout with a new one.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to replace'
        },
        new_exercise: {
          type: 'object',
          description: 'The new exercise to insert',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['reps', 'hold', 'duration', 'intervals'] },
            instructions: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            muscles: { type: 'array', items: { type: 'string' } },
            sets: { type: 'number' },
            reps: { type: 'number' },
            hold_time: { type: 'number' },
            duration: { type: 'number' },
            rounds: { type: 'number' },
            work_time: { type: 'number' },
            rest_time: { type: 'number' },
            rest_between_sets: { type: 'number' }
          },
          required: ['name', 'type', 'categories', 'muscles']
        },
        reason: {
          type: 'string',
          description: 'Reason for the swap'
        }
      },
      required: ['exercise_id', 'new_exercise']
    },
    execute: async (args, context) => {
      const { sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const index = workout.exercises.findIndex(e => e.id === args.exercise_id);
      if (index === -1) {
        return { success: false, error: 'Exercise not found' };
      }

      const oldExercise = workout.exercises[index];
      const newExercise = { ...args.new_exercise, id: uuidv4() };
      workout.exercises[index] = newExercise;

      return {
        success: true,
        old_exercise: oldExercise.name,
        new_exercise: newExercise.name,
        new_id: newExercise.id
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Swap failed: ${result.error}`;
      return `Swapped "${result.old_exercise}" with "${result.new_exercise}"`;
    }
  },

  adjust_exercise: {
    description: 'Modify parameters of an existing exercise (sets, reps, duration, etc.).',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to modify'
        },
        adjustments: {
          type: 'object',
          description: 'Fields to update',
          additionalProperties: true
        }
      },
      required: ['exercise_id', 'adjustments']
    },
    execute: async (args, context) => {
      const { sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const exercise = workout.exercises.find(e => e.id === args.exercise_id);
      if (!exercise) {
        return { success: false, error: 'Exercise not found' };
      }

      const oldValues = {};
      for (const [key, value] of Object.entries(args.adjustments)) {
        if (key !== 'id' && key !== 'type') { // Prevent changing id or type
          oldValues[key] = exercise[key];
          exercise[key] = value;
        }
      }

      return {
        success: true,
        exercise_name: exercise.name,
        adjustments: args.adjustments,
        old_values: oldValues
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Adjustment failed: ${result.error}`;
      const changes = Object.entries(result.adjustments)
        .map(([k, v]) => `${k}: ${result.old_values[k]} → ${v}`)
        .join(', ');
      return `Adjusted "${result.exercise_name}": ${changes}`;
    }
  },

  remove_exercise: {
    description: 'Remove an exercise from the current workout.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to remove'
        },
        reason: {
          type: 'string',
          description: 'Reason for removal'
        }
      },
      required: ['exercise_id']
    },
    execute: async (args, context) => {
      const { sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const index = workout.exercises.findIndex(e => e.id === args.exercise_id);
      if (index === -1) {
        return { success: false, error: 'Exercise not found' };
      }

      const removed = workout.exercises.splice(index, 1)[0];

      return {
        success: true,
        removed_exercise: removed.name,
        remaining_count: workout.exercises.length
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Removal failed: ${result.error}`;
      return `Removed "${result.removed_exercise}". ${result.remaining_count} exercises remaining.`;
    }
  },

  log_workout: {
    description: 'Log the completed workout to history and update exercise distribution.',
    parameters: {
      type: 'object',
      properties: {
        completed_exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exercise_id: { type: 'string' },
              completed: { type: 'boolean' },
              actual_sets: { type: 'number' },
              actual_reps: { type: 'number' },
              notes: { type: 'string' }
            },
            required: ['exercise_id', 'completed']
          },
          description: 'Array of completed exercise data'
        },
        workout_notes: {
          type: 'string',
          description: 'Overall workout notes'
        }
      },
      required: ['completed_exercises']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const completedIds = new Set(
        args.completed_exercises
          .filter(e => e.completed)
          .map(e => e.exercise_id)
      );

      const completedExercises = workout.exercises.filter(e => completedIds.has(e.id));

      // Update exercise distribution for each completed exercise
      for (const exercise of completedExercises) {
        try {
          await exerciseDistributionService.recordExercise(userId, {
            categories: exercise.categories,
            muscles: exercise.muscles
          });
        } catch (err) {
          console.error('Failed to update distribution:', err);
        }
      }

      // Clear the session workout
      workoutSessions.delete(sessionId);

      return {
        success: true,
        logged_count: completedExercises.length,
        total_in_workout: workout.exercises.length
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Logging failed: ${result.error}`;
      return `Logged ${result.logged_count}/${result.total_in_workout} exercises to history.`;
    }
  }
};

// Export session getter for other modules
function getWorkoutSession(sessionId) {
  return workoutSessions.get(sessionId);
}

module.exports = { exerciseTools, getWorkoutSession };
```

### Goal Tools

```javascript
// BACKEND/agent/tools/goals.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const goalTools = {
  set_goals: {
    description: 'Set or update category and/or muscle training goals for the user.',
    parameters: {
      type: 'object',
      properties: {
        category_goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'Category name' },
              weight: { type: 'number', description: 'Priority weight (-10 to 10)' }
            },
            required: ['category', 'weight']
          },
          description: 'Array of category goals to set'
        },
        muscle_goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              muscle: { type: 'string', description: 'Muscle name' },
              weight: { type: 'number', description: 'Priority weight (-10 to 10)' }
            },
            required: ['muscle', 'weight']
          },
          description: 'Array of muscle goals to set'
        }
      }
    },
    execute: async (args, context) => {
      const { userId } = context;
      const results = { category_goals: [], muscle_goals: [] };

      // Update category goals
      if (args.category_goals && args.category_goals.length > 0) {
        for (const goal of args.category_goals) {
          const { data, error } = await supabase
            .from('user_category_and_weight')
            .upsert({
              user_id: userId,
              category_name: goal.category,
              weight: Math.max(-10, Math.min(10, goal.weight))
            }, {
              onConflict: 'user_id,category_name'
            })
            .select()
            .single();

          if (!error) {
            results.category_goals.push({ category: goal.category, weight: goal.weight });
          }
        }
      }

      // Update muscle goals
      if (args.muscle_goals && args.muscle_goals.length > 0) {
        for (const goal of args.muscle_goals) {
          const { data, error } = await supabase
            .from('user_muscle_and_weight')
            .upsert({
              user_id: userId,
              muscle_name: goal.muscle,
              weight: Math.max(-10, Math.min(10, goal.weight))
            }, {
              onConflict: 'user_id,muscle_name'
            })
            .select()
            .single();

          if (!error) {
            results.muscle_goals.push({ muscle: goal.muscle, weight: goal.weight });
          }
        }
      }

      return {
        success: true,
        updated: results
      };
    },
    formatResult: (result) => {
      const parts = [];
      if (result.updated.category_goals.length > 0) {
        parts.push(`Categories: ${result.updated.category_goals.map(g => `${g.category}(${g.weight})`).join(', ')}`);
      }
      if (result.updated.muscle_goals.length > 0) {
        parts.push(`Muscles: ${result.updated.muscle_goals.map(g => `${g.muscle}(${g.weight})`).join(', ')}`);
      }
      return `Updated goals - ${parts.join('; ')}`;
    }
  }
};

module.exports = { goalTools };
```

### Preference Tools

```javascript
// BACKEND/agent/tools/preferences.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const preferenceTools = {
  set_preference: {
    description: 'Create or update a user preference.',
    parameters: {
      type: 'object',
      properties: {
        preference_type: {
          type: 'string',
          enum: ['equipment', 'location', 'time_available', 'injury', 'exclusion', 'focus', 'intensity', 'custom'],
          description: 'Type of preference'
        },
        value: {
          type: 'string',
          description: 'The preference value'
        },
        duration_type: {
          type: 'string',
          enum: ['permanent', 'session', 'temporary'],
          description: 'How long the preference should last',
          default: 'permanent'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the preference'
        }
      },
      required: ['preference_type', 'value']
    },
    execute: async (args, context) => {
      const { userId } = context;
      
      const { data, error } = await supabase
        .from('preferences')
        .insert({
          user_id: userId,
          preference_type: args.preference_type,
          value: args.value,
          duration_type: args.duration_type || 'permanent',
          metadata: args.metadata || {},
          is_active: true
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        preference: {
          id: data.id,
          type: data.preference_type,
          value: data.value,
          duration: data.duration_type
        }
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Failed to set preference: ${result.error}`;
      return `Set ${result.preference.type} preference: "${result.preference.value}" (${result.preference.duration})`;
    }
  },

  delete_preference: {
    description: 'Delete/deactivate a user preference.',
    parameters: {
      type: 'object',
      properties: {
        preference_id: {
          type: 'string',
          description: 'ID of the preference to delete'
        }
      },
      required: ['preference_id']
    },
    execute: async (args, context) => {
      const { userId } = context;
      
      // First verify the preference belongs to the user
      const { data: existing } = await supabase
        .from('preferences')
        .select('*')
        .eq('id', args.preference_id)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        return { success: false, error: 'Preference not found' };
      }

      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('preferences')
        .update({ is_active: false })
        .eq('id', args.preference_id);

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        deleted: {
          id: existing.id,
          type: existing.preference_type,
          value: existing.value
        }
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Failed to delete: ${result.error}`;
      return `Deleted ${result.deleted.type} preference: "${result.deleted.value}"`;
    }
  }
};

module.exports = { preferenceTools };
```

### Data Retrieval Tool

```javascript
// BACKEND/agent/tools/data.js
const { fetchMultipleDataSources } = require('../../services/dataSources.service');

const dataTools = {
  fetch_data: {
    description: 'Fetch additional data sources into context. Use when you need information not currently available.',
    parameters: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['user_profile', 'category_goals', 'muscle_goals', 'active_preferences', 'workout_history', 'exercise_distribution', 'user_settings']
          },
          description: 'Array of data source names to fetch'
        },
        params: {
          type: 'object',
          description: 'Optional parameters for specific sources (e.g., { workout_history: { limit: 5 } })'
        }
      },
      required: ['sources']
    },
    execute: async (args, context) => {
      const { userId } = context;
      
      const results = await fetchMultipleDataSources(
        args.sources, 
        userId, 
        args.params || {}
      );

      return {
        success: true,
        data: results.reduce((acc, r) => {
          acc[r.source] = r.formatted;
          return acc;
        }, {})
      };
    },
    formatResult: (result) => {
      const sources = Object.keys(result.data);
      return `Fetched ${sources.length} data sources: ${sources.join(', ')}`;
    }
  }
};

module.exports = { dataTools };
```

### Tool Registry Index

```javascript
// BACKEND/agent/tools/index.js
const { communicationTools } = require('./communication');
const { exerciseTools, getWorkoutSession } = require('./exercises');
const { goalTools } = require('./goals');
const { preferenceTools } = require('./preferences');
const { dataTools } = require('./data');

// Combine all tools into registry
const TOOL_REGISTRY = {
  ...communicationTools,
  ...exerciseTools,
  ...goalTools,
  ...preferenceTools,
  ...dataTools
};

/**
 * Get OpenAI-formatted tool definitions
 */
function getToolDefinitions() {
  return Object.entries(TOOL_REGISTRY).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

/**
 * Execute a tool by name
 */
async function executeTool(toolName, args, context) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const result = await tool.execute(args, context);
  const formatted = tool.formatResult(result);

  return { result, formatted };
}

/**
 * Check if a tool exists
 */
function hasTool(toolName) {
  return toolName in TOOL_REGISTRY;
}

module.exports = {
  TOOL_REGISTRY,
  getToolDefinitions,
  executeTool,
  hasTool,
  getWorkoutSession
};
```

### Success Criteria
- [ ] All core tools implemented and registered
- [ ] Tool definitions export in OpenAI format
- [ ] Tool execution with context works correctly
- [ ] Result formatters produce concise output

---

## Phase 6: Core Agent Loop

**Goal**: Implement the main agent loop that orchestrates tool execution.

### Files to Create
- `BACKEND/services/agentLoop.service.js` (new)
- `BACKEND/services/contextBuilder.service.js` (new)

### Context Builder Implementation

```javascript
// BACKEND/services/contextBuilder.service.js
const { getSession, getSessionEvents } = require('./agentSession.service');

const MAIN_AGENT_SYSTEM_PROMPT = `You are a Personal Trainer AI assistant. You help users with workouts, exercise recommendations, fitness goals, and preferences.

## Your Capabilities
You have access to tools for:
- Generating personalized workouts
- Managing user goals (categories and muscles)
- Setting and removing preferences
- Fetching additional user data
- Modifying exercises in the current workout

## Rules
1. ALWAYS use tools to take actions - never just describe what you would do
2. When asked for a workout, use generate_workout with appropriate exercises
3. After completing a task, ALWAYS call idle to signal completion
4. Be concise in your responses
5. Consider the user's goals, preferences, and history when generating workouts
6. Use message_notify_user for confirmations and information
7. Use message_ask_user when you need clarification

## Exercise Types
You can create 4 types of exercises:
- reps: Set/rep based (e.g., 3x10 pushups)
- hold: Isometric holds (e.g., 30s plank)
- duration: Continuous activity (e.g., 5min run)
- intervals: Work/rest cycles (e.g., 30s on/10s off x 8)

## Context
The conversation history and knowledge injections are shown below. Use this context to personalize your responses.`;

/**
 * Format events for LLM context
 */
function formatEventsForContext(events) {
  return events.map(event => {
    switch (event.event_type) {
      case 'user_message':
        return {
          role: 'user',
          content: event.content.message || event.content
        };
      
      case 'action':
        return {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: event.content.call_id || `call_${event.sequence_number}`,
            type: 'function',
            function: {
              name: event.content.tool,
              arguments: JSON.stringify(event.content.args)
            }
          }]
        };
      
      case 'result':
        return {
          role: 'tool',
          tool_call_id: event.content.call_id || `call_${event.sequence_number - 1}`,
          content: event.content.formatted || JSON.stringify(event.content.result)
        };
      
      case 'knowledge':
        // Knowledge is injected as system context, not as messages
        return null;
      
      case 'checkpoint':
        return {
          role: 'system',
          content: `[Context Summary]\n${event.content.summary}`
        };
      
      default:
        return null;
    }
  }).filter(Boolean);
}

/**
 * Extract knowledge from events
 */
function extractKnowledge(events) {
  return events
    .filter(e => e.event_type === 'knowledge')
    .map(e => `## ${e.content.source}\n${e.content.data}`)
    .join('\n\n');
}

/**
 * Build the full context for an LLM call
 */
async function buildAgentContext(sessionId, userId) {
  const session = await getSession(sessionId);
  const events = await getSessionEvents(sessionId, session.context_start_sequence);

  const knowledge = extractKnowledge(events);
  const messages = formatEventsForContext(events);

  // Build system message with knowledge
  let systemContent = MAIN_AGENT_SYSTEM_PROMPT;
  if (knowledge) {
    systemContent += `\n\n## Current Context\n${knowledge}`;
  }

  return {
    systemMessage: { role: 'system', content: systemContent },
    messages,
    session
  };
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(context) {
  const { systemMessage, messages } = context;
  let text = systemMessage.content;
  
  for (const msg of messages) {
    if (msg.content) text += msg.content;
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        text += tc.function.name + tc.function.arguments;
      }
    }
  }
  
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

module.exports = {
  buildAgentContext,
  formatEventsForContext,
  extractKnowledge,
  estimateTokens,
  MAIN_AGENT_SYSTEM_PROMPT
};
```

### Agent Loop Implementation

```javascript
// BACKEND/services/agentLoop.service.js
const OpenAI = require('openai');
const { getOrCreateSession, appendEvent } = require('./agentSession.service');
const { initializeContext } = require('./initializerAgent.service');
const { buildAgentContext, estimateTokens } = require('./contextBuilder.service');
const { getToolDefinitions, executeTool, hasTool } = require('../agent/tools');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_ITERATIONS = 10;
const MODEL = 'gpt-4o';

/**
 * Parse tool call from LLM response
 */
function parseToolCall(response) {
  const message = response.choices[0].message;
  
  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0];
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments)
    };
  }
  
  return null;
}

/**
 * Call the LLM with context and tools
 */
async function callLLM(context) {
  const { systemMessage, messages } = context;
  
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [systemMessage, ...messages],
    tools: getToolDefinitions(),
    tool_choice: 'required' // Always require a tool call
  });

  return response;
}

/**
 * Main agent loop
 */
async function runAgentLoop(userId, userInput, options = {}) {
  const { sessionId: existingSessionId } = options;
  
  // Get or create session
  const session = existingSessionId 
    ? await require('./agentSession.service').getSession(existingSessionId)
    : await getOrCreateSession(userId);
  
  const sessionId = session.id;

  // Initialize context with relevant data
  await initializeContext(sessionId, userId, userInput);

  // Append user message
  await appendEvent(sessionId, 'user_message', {
    message: userInput,
    timestamp: new Date().toISOString()
  });

  let iteration = 0;
  let shouldContinue = true;
  const actions = [];

  while (shouldContinue && iteration < MAX_ITERATIONS) {
    iteration++;

    // Build context
    const context = await buildAgentContext(sessionId, userId);
    
    // Check token estimate
    const tokenEstimate = estimateTokens(context);
    if (tokenEstimate > 100000) {
      console.warn(`High token count: ${tokenEstimate}. Consider checkpointing.`);
    }

    // Call LLM
    const response = await callLLM(context);
    const toolCall = parseToolCall(response);

    if (!toolCall) {
      console.error('No tool call in response');
      break;
    }

    // Record action
    await appendEvent(sessionId, 'action', {
      tool: toolCall.name,
      args: toolCall.arguments,
      call_id: toolCall.id,
      timestamp: new Date().toISOString()
    });

    // Execute tool
    const executionContext = { userId, sessionId };
    
    try {
      const { result, formatted } = await executeTool(
        toolCall.name, 
        toolCall.arguments, 
        executionContext
      );

      // Record result
      await appendEvent(sessionId, 'result', {
        tool: toolCall.name,
        result,
        formatted,
        call_id: toolCall.id,
        timestamp: new Date().toISOString()
      });

      actions.push({
        tool: toolCall.name,
        args: toolCall.arguments,
        result,
        formatted
      });

      // Check for idle (completion signal)
      if (toolCall.name === 'idle') {
        shouldContinue = false;
      }

      // Check for question (wait for user response)
      if (toolCall.name === 'message_ask_user') {
        shouldContinue = false;
      }

    } catch (error) {
      console.error(`Tool execution error: ${error.message}`);
      
      await appendEvent(sessionId, 'result', {
        tool: toolCall.name,
        error: error.message,
        formatted: `Error: ${error.message}`,
        call_id: toolCall.id,
        timestamp: new Date().toISOString()
      });

      actions.push({
        tool: toolCall.name,
        args: toolCall.arguments,
        error: error.message
      });
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn('Agent reached max iterations');
  }

  return {
    sessionId,
    actions,
    iterations: iteration
  };
}

/**
 * Get the current state of a session
 */
async function getSessionState(sessionId) {
  const session = await require('./agentSession.service').getSession(sessionId);
  const events = await require('./agentSession.service').getSessionEvents(
    sessionId, 
    session.context_start_sequence
  );
  
  // Extract last messages/results for client
  const recentActions = events
    .filter(e => e.event_type === 'action' || e.event_type === 'result')
    .slice(-10);

  return {
    session,
    recentActions
  };
}

module.exports = {
  runAgentLoop,
  getSessionState
};
```

### Success Criteria
- [ ] Agent loop executes tools iteratively
- [ ] Context is built correctly with system prompt and history
- [ ] Tool calls are parsed and executed
- [ ] Events are appended to session
- [ ] Loop terminates on `idle` or `message_ask_user`
- [ ] Max iterations prevents infinite loops

---

## Phase 7: API Routes & Controller

**Goal**: Create the HTTP endpoints for the agent.

### Files to Create/Modify
- `BACKEND/controllers/agent.controller.js` (new)
- `BACKEND/routes/agent.routes.js` (new)
- `BACKEND/index.js` (modify)

### Agent Controller

```javascript
// BACKEND/controllers/agent.controller.js
const { runAgentLoop, getSessionState } = require('../services/agentLoop.service');
const { getUserSessions, getSession, createSession } = require('../services/agentSession.service');

/**
 * Handle chat request (non-streaming)
 */
async function handleChat(req, res) {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await runAgentLoop(userId, message, { sessionId });

    // Extract response for client
    const response = formatResponseForClient(result.actions);

    res.json({
      sessionId: result.sessionId,
      response,
      iterations: result.iterations
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Handle streaming chat request
 */
async function handleStreamChat(req, res) {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // For now, run the loop and stream results
    // Future: implement true streaming with partial results
    const result = await runAgentLoop(userId, message, { sessionId });

    // Stream each action
    for (const action of result.actions) {
      const event = {
        type: action.tool,
        data: action.result
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Send completion
    res.write(`data: ${JSON.stringify({ type: 'done', sessionId: result.sessionId })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
}

/**
 * Get user's sessions
 */
async function getSessions(req, res) {
  try {
    const userId = req.user.id;
    const { limit } = req.query;

    const sessions = await getUserSessions(userId, parseInt(limit) || 10);
    res.json({ sessions });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get specific session details
 */
async function getSessionById(req, res) {
  try {
    const { id } = req.params;
    const state = await getSessionState(id);
    res.json(state);

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create new session
 */
async function startNewSession(req, res) {
  try {
    const userId = req.user.id;
    const session = await createSession(userId);
    res.json({ session });

  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Format actions into client response
 */
function formatResponseForClient(actions) {
  const response = {
    messages: [],
    exercises: null,
    question: null
  };

  for (const action of actions) {
    if (action.tool === 'message_notify_user' && action.result?.message) {
      response.messages.push(action.result.message);
    }
    
    if (action.tool === 'message_ask_user' && action.result?.question) {
      response.question = {
        text: action.result.question,
        options: action.result.options
      };
    }
    
    if (action.tool === 'generate_workout' && action.result?.exercises) {
      response.exercises = action.result.exercises;
    }
  }

  return response;
}

module.exports = {
  handleChat,
  handleStreamChat,
  getSessions,
  getSessionById,
  startNewSession
};
```

### Agent Routes

```javascript
// BACKEND/routes/agent.routes.js
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const agentController = require('../controllers/agent.controller');

// All routes require authentication
router.use(authenticateUser);

// Chat endpoints
router.post('/chat', agentController.handleChat);
router.post('/stream', agentController.handleStreamChat);

// Session management
router.get('/sessions', agentController.getSessions);
router.get('/sessions/:id', agentController.getSessionById);
router.post('/sessions', agentController.startNewSession);

module.exports = router;
```

### Update Index.js

```javascript
// In BACKEND/index.js, add:
const agentRouter = require('./routes/agent.routes');

// Replace or add alongside existing /agent route
app.use('/agent', agentRouter);
```

### Success Criteria
- [ ] POST `/agent/chat` processes messages and returns response
- [ ] POST `/agent/stream` returns SSE stream of actions
- [ ] GET `/agent/sessions` returns user's sessions
- [ ] GET `/agent/sessions/:id` returns session details
- [ ] POST `/agent/sessions` creates new session
- [ ] Authentication middleware protects all routes

---

## Phase 8: Checkpoint System (Deferred)

**Goal**: Implement context compression for long conversations.

> **Note**: This phase can be implemented later as an optimization. The core agent will work without it for typical conversation lengths.

### Files to Create
- `BACKEND/services/checkpoint.service.js` (new)

### Overview
- Monitor token count in context
- When approaching 80K tokens, trigger checkpoint
- Summarize older events using GPT-4o-mini
- Update session's `context_start_sequence`
- Store checkpoint event with summary

---

## Phase 9: Cleanup & Migration

**Goal**: Remove old orchestration agent code and update imports.

### Files to Remove
- `BACKEND/ai/tools/index.js`
- `BACKEND/ai/tools/recommendExercise.js`
- `BACKEND/ai/tools/logExercise.js`
- `BACKEND/ai/tools/parsePreference.js`
- `BACKEND/services/orchestrationAgent.service.js`
- `BACKEND/controllers/orchestrationAgent.controller.js`
- `BACKEND/routes/orchestrationAgent.routes.js`

### Files to Keep (Integrated)
- `BACKEND/services/recommend.service.js` - Keep for reference, may extract exercise knowledge
- `BACKEND/services/exerciseDistribution.service.js` - Keep and integrate
- `BACKEND/services/preference.service.js` - Keep core logic

### Success Criteria
- [ ] Old agent code removed
- [ ] No broken imports
- [ ] New agent fully functional
- [ ] Distribution tracking integrated

---

## Implementation Order

1. **Phase 1**: Database Schema (SQL commands for user to run)
2. **Phase 2**: Session Management Service
3. **Phase 3**: Data Formatters & Sources
4. **Phase 4**: Initializer Agent
5. **Phase 5**: Tool Definitions & Registry
6. **Phase 6**: Core Agent Loop
7. **Phase 7**: API Routes & Controller
8. **Phase 9**: Cleanup (remove old code)
9. **Phase 8**: Checkpoint System (later optimization)

---

## Testing Checklist

### Core Functionality
- [ ] Create new session for user
- [ ] Process simple message
- [ ] Generate workout with exercises
- [ ] Modify exercise (swap, adjust, remove)
- [ ] Set user preferences
- [ ] Set user goals
- [ ] Conversation persists across requests
- [ ] Session history retrievable

### Edge Cases
- [ ] Empty message handling
- [ ] Invalid tool arguments
- [ ] Database errors handled gracefully
- [ ] Max iterations reached
- [ ] Concurrent requests to same session

### Integration
- [ ] Exercise distribution updates on log
- [ ] Preferences affect workout generation
- [ ] Goals affect workout generation
- [ ] Initializer selects correct data sources

---

## File Structure Summary

```
BACKEND/
├── agent/
│   ├── tools/
│   │   ├── index.js           (tool registry)
│   │   ├── communication.js   (notify, ask, idle)
│   │   ├── exercises.js       (generate, swap, adjust, remove, log)
│   │   ├── goals.js           (set_goals)
│   │   ├── preferences.js     (set, delete)
│   │   └── data.js            (fetch_data)
│   └── schemas/
│       └── exercise.schema.js (Zod schemas)
├── services/
│   ├── agentSession.service.js
│   ├── agentLoop.service.js
│   ├── contextBuilder.service.js
│   ├── initializerAgent.service.js
│   ├── dataSources.service.js
│   ├── dataFormatters.service.js
│   └── (existing services kept)
├── controllers/
│   └── agent.controller.js
├── routes/
│   └── agent.routes.js
└── database/
    └── agent_schema.sql
```

---

## Deferred Features (Future Phases)

These tools from the spec are deferred to later implementation:

### Timer Tools
- `generate_exercise_timer`
- `generate_workout_timers`

### Calendar Tools
- `schedule_workout`
- `get_scheduled_workouts`
- `update_scheduled_workout`
- `cancel_scheduled_workout`

### Analytics Tools
- `get_progress_summary`
- `get_workout_stats`
- `get_goal_progress`

### Advanced Exercise Tools
- `get_exercise_suggestions`
- `validate_exercise`

---

## Questions Resolved

1. **Priority**: Core tools only for initial implementation ✓
2. **iOS Compatibility**: Breaking changes allowed ✓
3. **Existing Services**: Keep and integrate ✓
4. **Distribution Tracking**: Remains unchanged ✓
5. **Database Migrations**: Raw SQL provided ✓
