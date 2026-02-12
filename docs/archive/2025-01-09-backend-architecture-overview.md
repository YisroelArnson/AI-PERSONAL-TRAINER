---
date: 2025-01-09T12:00:00-05:00
researcher: AI Assistant
git_commit: 7f9d2c7b6d9c9561680a65f2a18ef45ff9562cf3
branch: agent
repository: AI-PERSONAL-TRAINER
topic: "Backend Architecture Overview and Comprehensive Summary"
tags: [research, codebase, backend, architecture, api, ai-sdk, supabase, express]
status: complete
last_updated: 2025-01-09
last_updated_by: AI Assistant
---

# Research: Backend Architecture Overview and Comprehensive Summary

**Date**: 2025-01-09T12:00:00-05:00  
**Researcher**: AI Assistant  
**Git Commit**: 7f9d2c7b6d9c9561680a65f2a18ef45ff9562cf3  
**Branch**: agent  
**Repository**: AI-PERSONAL-TRAINER

## Research Question

Perform a general outline and summary research of the backend that another agent can use to understand the codebase. Be thorough and detailed.

## Summary

The backend is a **Node.js Express API** that serves as the intelligence layer for an AI Personal Trainer mobile application. It leverages:

- **Vercel AI SDK** with OpenAI (GPT-4o, GPT-4.1, GPT-4o-mini) for generating personalized exercise recommendations
- **Supabase** for PostgreSQL database and authentication
- **Zod** for schema validation
- A sophisticated **agentic architecture** with tools for natural language understanding and exercise generation

The backend is designed around a core concept of **highly personalized, adaptive exercise recommendations** that consider:
- User's category goals (e.g., Strength 45%, Cardio 20%, etc.)
- Muscle group targets with weighted priorities
- Workout history for progression logic
- Temporary and permanent preferences
- Distribution tracking to balance recommendations over time
- Available equipment at the user's current location

---

## Architecture Overview

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (CommonJS) |
| Framework | Express.js 5.1.0 |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth with JWT |
| AI/LLM | Vercel AI SDK (`ai` package) with OpenAI provider |
| Validation | Zod |
| Environment | dotenv |

### Dependencies (from `package.json`)

```json
{
  "@ai-sdk/openai": "^2.0.30",
  "@supabase/supabase-js": "^2.55.0",
  "ai": "^5.0.44",
  "express": "^5.1.0",
  "zod": "^4.1.8",
  "jsonwebtoken": "^9.0.2",
  "jwks-rsa": "^3.2.0"
}
```

---

## Directory Structure

```
BACKEND/
├── index.js                    # Express app entry point, route mounting
├── package.json                # Dependencies and scripts
├── README.md                   # App documentation and design specs
│
├── ai/                         # AI tooling for agentic workflows
│   └── tools/
│       ├── index.js            # Tool factory - creates all tools for a user
│       ├── logExercise.js      # Tool for logging completed exercises
│       ├── parsePreference.js  # Tool for parsing user preferences via AI
│       └── recommendExercise.js # Tool for generating exercise recommendations
│
├── controllers/                # Request handlers (thin layer)
│   ├── categoryGoals.controller.js
│   ├── exerciseDistribution.controller.js
│   ├── exerciseLog.controller.js
│   ├── interval.controller.js
│   ├── muscleGoals.controller.js
│   ├── orchestrationAgent.controller.js
│   ├── preference.controller.js
│   ├── recommend.controller.js
│   └── userSettings.controller.js
│
├── database/                   # SQL schema definitions
│   ├── exercise_distribution_tracking_schema.sql
│   ├── user_settings_schema.sql
│   └── workout_history_schema.sql
│
├── middleware/
│   └── auth.js                 # JWT authentication via Supabase getClaims
│
├── routes/                     # Express route definitions
│   ├── categoryGoals.routes.js
│   ├── exerciseDistribution.routes.js
│   ├── exerciseLog.routes.js
│   ├── interval.routes.js
│   ├── muscleGoals.routes.js
│   ├── orchestrationAgent.routes.js
│   ├── preference.routes.js
│   ├── recommend.routes.js
│   └── userSettings.routes.js
│
└── services/                   # Business logic layer
    ├── categoryGoals.service.js
    ├── exerciseDistribution.service.js
    ├── exerciseLog.service.js
    ├── fetchUserData.service.js
    ├── interval.service.js
    ├── muscleGoals.service.js
    ├── orchestrationAgent.service.js
    ├── preference.service.js
    ├── recommend.service.js
    └── userSettings.service.js
```

---

## API Endpoints

### Route Mounting (from `index.js`)

| Route Prefix | Router File | Description |
|--------------|-------------|-------------|
| `/agent` | `orchestrationAgent.routes.js` | AI agent chat interface |
| `/recommend` | `recommend.routes.js` | Exercise recommendations |
| `/preferences` | `preference.routes.js` | User preference parsing |
| `/category-goals` | `categoryGoals.routes.js` | Category goal parsing |
| `/muscle-goals` | `muscleGoals.routes.js` | Muscle goal parsing |
| `/exercises` | `exerciseLog.routes.js` | Exercise logging & history |
| `/user-settings` | `userSettings.routes.js` | User unit preferences |
| `/intervals` | `interval.routes.js` | Timer/interval generation |

### Detailed Endpoint Reference

#### Orchestration Agent (`/agent`)
- **POST `/agent/chat`** - Process user message through AI agent (non-streaming)
- **POST `/agent/stream`** - Process user message with streaming response

#### Exercise Recommendations (`/recommend`)
- **POST `/recommend/exercises/:userId`** - Generate exercise recommendations (authenticated)
- **POST `/recommend/stream/:userId`** - Stream exercise recommendations (authenticated)

#### User Preferences (`/preferences`)
- **POST `/preferences/parse`** - Parse preference text using AI (authenticated)

#### Category Goals (`/category-goals`)
- **POST `/category-goals/parse`** - Parse category goals text into structured format (authenticated)

#### Muscle Goals (`/muscle-goals`)
- **POST `/muscle-goals/parse`** - Parse muscle goals text into 16 preset muscle weights (authenticated)

#### Exercise Logging (`/exercises`)
- **POST `/exercises/log/:userId`** - Log a completed exercise (authenticated)
- **DELETE `/exercises/log/:userId/:exerciseId`** - Delete/undo an exercise (authenticated)
- **GET `/exercises/history/:userId`** - Get workout history (authenticated)
- **GET `/exercises/distribution/:userId`** - Get distribution metrics (authenticated)
- **POST `/exercises/distribution/reset/:userId`** - Reset distribution tracking (authenticated)

#### User Settings (`/user-settings`)
- **GET `/user-settings`** - Get user's unit preferences (authenticated)
- **PUT `/user-settings`** - Update unit preferences (authenticated)

#### Interval Timers (`/intervals`)
- **POST `/intervals/exercise`** - Generate timer data for single exercise (authenticated)
- **POST `/intervals/batch`** - Generate timer data for multiple exercises (authenticated)

---

## Core Services Deep Dive

### 1. Orchestration Agent Service (`orchestrationAgent.service.js`)

The **central AI agent** that processes natural language user requests. Uses the Vercel AI SDK with tool calling.

**Key Function**: `processUserRequest(userInput, userId, options)`

**System Prompt Logic**:
- Determines when to use **tools** vs **direct responses**
- Uses tools for: logging exercises, requesting recommendations, parsing preferences
- Provides direct responses for: form questions, fitness advice, general conversation

**Tools Available**:
1. `logExercise` - Log completed workouts
2. `parsePreference` - Parse and store user preferences
3. `recommendExercise` - Generate personalized exercises

**Model**: `gpt-4o`  
**Max Steps**: 5 (multi-turn tool calling)

### 2. Recommendation Service (`recommend.service.js`)

The **core recommendation engine** - generates personalized exercises using structured output.

**Key Functions**:
- `generateExerciseRecommendations(userId, requestData)` - Non-streaming
- `streamExerciseRecommendations(userId, requestData)` - Streaming via `streamObject`

**Exercise Types Supported** (discriminated union):
1. `strength` - Sets, reps, load (kg)
2. `bodyweight` - Sets, reps without external load
3. `cardio_distance` - Distance-based (km)
4. `cardio_time` - Time-based steady state
5. `hiit` - Interval training with work/rest phases
6. `circuit` - Multiple exercises in sequence
7. `flexibility` - Hold-based stretches
8. `yoga` - Sequence of poses
9. `isometric` - Hold-based strength (planks, etc.)
10. `balance` - Stability holds
11. `sport_specific` - Sport drills

**Data Flow**:
1. Fetch all user data via `fetchAllUserData(userId)`
2. Format as natural language prompt
3. Call `generateObject` or `streamObject` with dynamic Zod schema
4. Validate muscles/goals against user's defined categories
5. Clean up one-time preferences after call

**Models Used**:
- Streaming: `gpt-4.1`
- Non-streaming: `gpt-4o`

### 3. Fetch User Data Service (`fetchUserData.service.js`)

Aggregates all user context for AI prompts.

**Data Sources**:
- `body_stats` - Physical stats (sex, age, height, weight, body fat %)
- `user_category_and_weight` - Category goals with weights
- `user_muscle_and_weight` - Muscle targets with weights
- `user_locations` - Current location with equipment list
- `preferences` - Active temporary and permanent preferences
- `workout_history` - Last 15 exercises for progression
- `exercise_distribution_tracking` - Distribution debt calculations
- `user_settings` - Unit preferences (lbs/kg, miles/km)

### 4. Exercise Distribution Service (`exerciseDistribution.service.js`)

Tracks **goal adherence** over time with O(1) incremental updates.

**Key Concept**: "Debt" - measures under/over-representation of categories/muscles
- Positive debt = under-represented (needs more exercises)
- Negative debt = over-represented (reduce)

**Functions**:
- `updateTrackingIncrementally(userId, exerciseData)` - Add exercise contribution
- `decrementTrackingIncrementally(userId, exerciseData)` - Remove (undo)
- `resetTracking(userId)` - Reset when goals change
- `getDistributionMetrics(userId)` - Calculate current debt
- `formatDistributionForPrompt(metrics)` - Format for AI prompt

### 5. Preference Service (`preference.service.js`)

Parses natural language preferences into structured data using AI.

**Preference Types**:
- `workout` - Workout style preferences
- `injury` - Pain/injury limitations
- `time` - Duration constraints
- `equipment` - Equipment availability
- `intensity` - Intensity preferences
- `muscle_group` - Target/avoid muscles
- `exercise` - Specific exercise likes/dislikes
- `goal` - Fitness goal focus
- `recovery` - Recovery needs
- `other` - Catch-all

**Temporal Handling**:
- **Immediate requests** (e.g., "give me exercises") → `deleteAfterCall: true`
- **Time-limited** (e.g., "for the next 2 weeks") → `expireTime` set
- **Permanent** (e.g., "I don't like burpees") → Never expires

### 6. Category Goals Service (`categoryGoals.service.js`)

Parses user fitness goals into weighted categories.

**Output**: Array of `{ category, description, weight }` where weights sum to 1.0

**Example Categories**: Strength, Cardio, Stability & Mobility, Zone 2, VO₂ Max Training, Hypertrophy

### 7. Muscle Goals Service (`muscleGoals.service.js`)

Parses muscle priorities across **16 preset muscle groups**.

**PRESET_MUSCLES**:
```javascript
['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Lower Back',
 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Trapezius',
 'Abductors', 'Adductors', 'Forearms', 'Neck']
```

**Output**: `{ weights: { Chest: 0.2, Back: 0.15, ... }, reasoning: "..." }`

### 8. Interval Service (`interval.service.js`)

Generates **timer/interval data** for exercises using AI.

**Phase Types**: `work`, `rest`, `hold`, `transition`

**Output Schema**:
```javascript
{
  exercise_name: string,
  exercise_type: string,
  total_duration_sec: number,
  phases: [{ phase_type, duration_sec, cue, detail, countdown, set_number? }]
}
```

**Model**: `gpt-4o-mini` (faster, cheaper for timer generation)

### 9. Exercise Log Service (`exerciseLog.service.js`)

Persists completed exercises to `workout_history` table.

**Functions**:
- `logCompletedExercise(userId, exerciseData)` - Insert + update distribution
- `getWorkoutHistory(userId, options)` - Query with filters
- `deleteCompletedExercise(userId, exerciseId)` - Delete + decrement distribution

### 10. User Settings Service (`userSettings.service.js`)

Manages unit preferences.

**Settings**:
- `weight_unit`: `'lbs'` or `'kg'`
- `distance_unit`: `'miles'` or `'km'`

**Default**: US units (lbs, miles)

---

## AI Tool Definitions (`ai/tools/`)

### Tool Factory (`index.js`)

```javascript
function createAllTools(userId, options = {}) {
  return {
    recommendExercise: createRecommendExerciseTool(userId, options),
    logExercise: createLogExerciseTool(userId),
    parsePreference: createParsePreferenceTool(userId)
  };
}
```

### Log Exercise Tool (`logExercise.js`)

**Parameters**:
- `exerciseName` (string, optional)
- `duration` (number, optional)
- `sets` (number, optional)
- `reps` (number, optional)
- `weights` (array of numbers, optional)
- `notes` (string, optional)

**Note**: Currently returns mock data - would need database integration.

### Parse Preference Tool (`parsePreference.js`)

**Parameters**:
- `userInput` (string, required) - User's exact preference statement

**Actions**:
1. Calls `parsePreferenceText()` service
2. Stores in `preferences` table via Supabase
3. Returns structured preference object

**Helper Functions**:
- `getActivePreferences(userId)` - Fetch non-expired preferences
- `cleanupPreferences(userId)` - Delete expired and one-time-use preferences

### Recommend Exercise Tool (`recommendExercise.js`)

**Parameters**:
- `exerciseCount` (number, default: 8)
- `preferences` (string, optional)

**Features**:
- Supports **streaming mode** via `options.enableStreaming` and `options.onExercise` callback
- Falls back to non-streaming on error
- Cleans up preferences after generation

---

## Database Schemas

### `workout_history` Table

Stores all completed exercises with full metadata.

**Key Columns**:
- `id` (UUID, PK)
- `user_id` (UUID, FK → auth.users)
- `exercise_name` (VARCHAR)
- `exercise_type` (VARCHAR)
- `performed_at` (TIMESTAMPTZ)
- `sets`, `reps`, `load_kg_each`, `distance_km`, `duration_min`, etc.
- `muscles_utilized` (JSONB)
- `goals_addressed` (JSONB)
- `movement_pattern` (JSONB)
- `rpe` (INT, 1-10)

**Indexes**: user_id, performed_at, exercise_name, exercise_type

### `exercise_distribution_tracking` Table

Running totals for O(1) distribution calculations.

**Key Columns**:
- `user_id` (UUID, unique constraint)
- `tracking_started_at` (TIMESTAMPTZ)
- `total_exercises_count` (INT)
- `category_totals` (JSONB) - e.g., `{"Strength": 4.5, "Cardio": 2.3}`
- `muscle_totals` (JSONB) - e.g., `{"Chest": 3.2, "Legs": 5.6}`

### `user_settings` Table

Unit preferences per user.

**Key Columns**:
- `user_id` (UUID, unique)
- `weight_unit` (VARCHAR, default: 'lbs')
- `distance_unit` (VARCHAR, default: 'miles')

### Other Supabase Tables (referenced but not in schema files)

- `body_stats` - Physical user stats
- `user_category_and_weight` - Category goals
- `user_muscle_and_weight` - Muscle priorities
- `user_locations` - Locations with equipment
- `preferences` - Temporary/permanent preferences

---

## Authentication

### Middleware (`middleware/auth.js`)

Uses **Supabase Auth** with `getClaims()` to verify JWTs.

**Flow**:
1. Extract Bearer token from `Authorization` header
2. Call `supabase.auth.getClaims(token)`
3. Populate `req.user` with user ID, email, role, metadata
4. Log authentication time for monitoring

**Protected Routes**: All routes under `/recommend`, `/preferences`, `/category-goals`, `/muscle-goals`, `/exercises`, `/user-settings`, `/intervals`

**Unprotected Routes**: `/agent` (orchestration agent endpoints)

---

## AI Prompt Engineering

### Recommendation System Prompt (`recommend.service.js`)

**Core Principles**:
1. PERSONALIZATION - Align with user's goals
2. PROGRESSION - Conservative 5-10% overload
3. RECOVERY - Respect 48h (large muscles) / 24h (small muscles)
4. MOVEMENT PATTERNS - Use similar exercises for weight estimation
5. EXERCISE SELECTION - Match goals (compounds for strength, isolation for hypertrophy)
6. REP RANGES - Strength (1-5), Hypertrophy (6-12), Endurance (12+)

**Unit Handling**:
- Uses user's preferred units throughout
- Recommends practical weight increments

**Decision Hierarchy**:
1. Temporary preferences (override everything)
2. Explicit requests
3. Permanent preferences
4. Distribution debt
5. Goal weights
6. Workout history

### User Data Formatting

The `formatUserDataAsNaturalLanguage()` function converts structured data into readable prompts:

- Unit preferences displayed first
- Body stats summarized
- Goals categorized by priority (high/medium/low)
- Location with equipment details
- Preferences separated into temporary/permanent
- Distribution debt highlighted
- Workout history with movement pattern analysis

---

## Streaming Architecture

The backend supports **streaming responses** for better UX:

1. **Agent Streaming** (`/agent/stream`)
   - Uses `streamText` from AI SDK
   - Streams text deltas and exercise objects via chunked HTTP
   - Message format: `{ type: 'start' | 'exercise' | 'text' | 'response' | 'complete' }`

2. **Recommendation Streaming** (`/recommend/stream/:userId`)
   - Uses `streamObject` with `output: 'array'`
   - Each exercise streamed individually as generated
   - Message format: `{ type: 'metadata' | 'exercise' | 'complete' | 'error' }`

---

## Key Design Patterns

### 1. Service-Controller Separation
Controllers are thin HTTP handlers; services contain business logic.

### 2. Tool-Based Agent Architecture
AI agent uses function calling with typed tools for structured actions.

### 3. Dynamic Schema Generation
Exercise recommendation schema adapts to user's defined goals and muscles.

### 4. Incremental Distribution Tracking
O(1) updates instead of recalculating from full workout history.

### 5. Preference Lifecycle Management
- One-time preferences deleted after use
- Temporary preferences expire automatically
- Permanent preferences persist indefinitely

### 6. Natural Language Data Formatting
Structured data converted to prose for better LLM comprehension.

---

## Code References

### Entry Point
- `BACKEND/index.js:1-48` - Express app setup and route mounting

### Core Services
- `BACKEND/services/orchestrationAgent.service.js:1-101` - AI agent processing
- `BACKEND/services/recommend.service.js:1-960` - Exercise recommendation engine
- `BACKEND/services/fetchUserData.service.js:1-361` - User data aggregation
- `BACKEND/services/exerciseDistribution.service.js:1-606` - Distribution tracking

### AI Tools
- `BACKEND/ai/tools/index.js:1-25` - Tool factory
- `BACKEND/ai/tools/recommendExercise.js:1-100` - Recommendation tool
- `BACKEND/ai/tools/parsePreference.js:1-154` - Preference parsing tool

### Database Schemas
- `BACKEND/database/workout_history_schema.sql:1-93`
- `BACKEND/database/exercise_distribution_tracking_schema.sql:1-79`
- `BACKEND/database/user_settings_schema.sql:1-66`

### Authentication
- `BACKEND/middleware/auth.js:1-65` - JWT verification middleware

---

## Open Questions / Future Work

Based on the README.md, planned features include:

1. **LLM Usage Price Tracking** - Track cost per user
2. **Weight Progression System** - Hybrid search for exercise history, smart progression
3. **Sessions Management** - Auto-start/end sessions with gap detection
4. **Self-Guided Mode** - Persistent workout plans vs. ultra-guided mode
5. **Specific Goals** - Natural language goal → AI-generated multi-week plans
6. **Voice Control** - Local transcription with trigger word

---

## Getting Started

```bash
# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

**Environment Variables Required**:
- `SUPABASE_PUBLIC_URL`
- `SUPBASE_SECRET_KEY` (note: typo in codebase)
- `SUPABASE_PUBLISHABLE_KEY`
- OpenAI API key (configured via AI SDK)

**Server runs on**: Port 3000 (or `PORT` env var)

---

## Related Research

- `documents/2025-01-07-ai-agent-architecture-research.md` - AI agent architecture research
- `documents/integrated_timer_system_9373889d.plan.md` - Timer system implementation plan

