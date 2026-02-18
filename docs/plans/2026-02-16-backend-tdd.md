# Backend TDD — Implementation Plan

## Overview

Add a Vitest test suite covering the five backend services built in the workout generation & calendar plan. All external dependencies (Supabase, Anthropic SDK) are mocked. The test suite gives Claude Code an automated feedback loop to catch bugs during implementation.

**Spec**: `docs/specs/2026-02-16-backend-tdd.md`

## Current State Analysis

- Zero tests in the backend. `package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`.
- No test framework installed. `devDependencies` only has `nodemon`.
- Project uses CommonJS (`"type": "commonjs"`).
- Many pure functions we need to test are **not exported** from their modules:
  - `trainerWorkouts.service.js`: `extractJson`, `normalizeExercise`, `normalizeWorkoutInstance`, `buildUserContextSummary`, `buildWorkoutPrompt`, `adjustExerciseIntensity`, `scaleWorkoutInstance`, `estimateWorkoutDuration`, `generateSwapExercise`, `findTodayWorkoutEvent`
  - `trainerCalendar.service.js`: `normalizeEvent` (already exports `parseSessionsFromMarkdown`, `parseDaysPerWeek`)
  - `weeklyReview.service.js`: `rewriteProgram`, `saveNewProgramVersion`
  - `trainerWeightsProfile.service.js`: `extractJson`, `getNextVersion`

### Key Discoveries
- Supabase client is created at module top-level in every service via `createClient()` — must be mocked before module load
- Anthropic client comes from `./modelProviders.service.js` `getAnthropicClient()` — returns a singleton with `.messages.create()`
- `dataSources.service.js` `fetchMultipleDataSources()` returns `[{ source, raw, formatted }]` — used by workouts and weights profile
- `statsCalculator.service.js` already exports all its functions — no changes needed there

## Desired End State

After this plan is complete:
1. `cd BACKEND && npx vitest run` executes all tests and passes
2. Every exported function from the 5 services has at least one test
3. All pure functions are tested with happy path + edge cases
4. DB operations are tested with mocked Supabase verifying correct query construction
5. AI functions are tested with mocked responses verifying prompt construction + response parsing + error handling

### Verification
```bash
cd BACKEND && npx vitest run
```
All tests pass. No changes to runtime behavior — only new test files, config, fixtures, and expanded exports.

## What We're NOT Doing

- iOS tests (separate effort)
- Integration tests against real Supabase
- Express route/controller tests
- CI/CD pipeline
- Code coverage thresholds

---

## Phase 1: Infrastructure Setup

### Overview
Install Vitest, create configuration, build reusable mock helpers and test fixtures. No test files yet — just the foundation.

### Changes Required

#### 1. Install Vitest

```bash
cd BACKEND && npm install --save-dev vitest
```

#### 2. Create Vitest Config

**File**: `BACKEND/vitest.config.js` (NEW)

```javascript
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: '.',
    include: ['__tests__/**/*.test.js'],
    setupFiles: ['__tests__/helpers/setup.js'],
    testTimeout: 10000
  }
});
```

#### 3. Create Test Setup File

**File**: `BACKEND/__tests__/helpers/setup.js` (NEW)

Global setup that runs before all test files. Mocks `dotenv` so `.env` is not required, and mocks `@supabase/supabase-js` globally.

```javascript
const { vi } = require('vitest');

// Mock dotenv so tests don't need a .env file
vi.mock('dotenv', () => ({
  config: vi.fn()
}));
```

#### 4. Create Supabase Mock Helper

**File**: `BACKEND/__tests__/helpers/supabaseMock.js` (NEW)

Reusable mock that mimics the Supabase chainable query builder. Each test can configure what the chain resolves to.

Key design:
- Every method (`from`, `select`, `eq`, `gte`, `order`, `limit`, etc.) returns the chain object
- Terminal methods (`single`, `maybeSingle`) return `Promise.resolve({ data, error })`
- Non-terminal selects also resolve to `{ data, error }` for queries that don't end with `single`/`maybeSingle`
- `mockResolve(data)` and `mockReject(error)` helpers to configure what the chain returns
- `reset()` to clear between tests

```javascript
const { vi } = require('vitest');

function createMockSupabase() {
  let resolveData = null;
  let resolveError = null;
  let resolveCount = null;

  const chain = {};
  const chainMethods = [
    'from', 'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'is',
    'order', 'limit', 'range', 'head'
  ];

  for (const method of chainMethods) {
    chain[method] = vi.fn(() => chain);
  }

  // Terminal methods
  chain.single = vi.fn(() => Promise.resolve({ data: resolveData, error: resolveError }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: resolveData, error: resolveError }));

  // Make the chain itself thenable for queries that don't end with single/maybeSingle
  chain.then = function(resolve, reject) {
    const result = { data: resolveData, error: resolveError };
    if (resolveCount !== null) result.count = resolveCount;
    return Promise.resolve(result).then(resolve, reject);
  };

  // Configuration helpers
  chain.mockResolve = (data) => { resolveData = data; resolveError = null; return chain; };
  chain.mockReject = (error) => { resolveData = null; resolveError = error; return chain; };
  chain.mockResolveWithCount = (data, count) => { resolveData = data; resolveError = null; resolveCount = count; return chain; };
  chain.reset = () => {
    resolveData = null;
    resolveError = null;
    resolveCount = null;
    for (const method of chainMethods) {
      chain[method].mockClear();
    }
    chain.single.mockClear();
    chain.maybeSingle.mockClear();
  };

  return chain;
}

module.exports = { createMockSupabase };
```

#### 5. Create Anthropic Mock Helper

**File**: `BACKEND/__tests__/helpers/anthropicMock.js` (NEW)

Reusable mock for the Anthropic SDK client.

```javascript
const { vi } = require('vitest');

function createMockAnthropicClient() {
  const mockCreate = vi.fn();

  return {
    client: {
      messages: {
        create: mockCreate
      }
    },
    mockCreate,
    // Helper to mock a successful JSON response
    mockJsonResponse: (json) => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(json) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });
    },
    // Helper to mock a text response (for markdown, etc.)
    mockTextResponse: (text) => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });
    },
    // Helper to mock a failure
    mockError: (error) => {
      mockCreate.mockRejectedValue(error);
    },
    reset: () => {
      mockCreate.mockReset();
    }
  };
}

module.exports = { createMockAnthropicClient };
```

#### 6. Create Test Fixtures

**File**: `BACKEND/__tests__/fixtures/exercises.js` (NEW)

One sample exercise per type, matching the shape from `normalizeExercise()`:

```javascript
const repsExercise = {
  exercise_name: 'Dumbbell Bench Press',
  exercise_type: 'reps',
  muscles_utilized: [{ muscle: 'chest', share: 0.6 }, { muscle: 'triceps', share: 0.3 }, { muscle: 'shoulders', share: 0.1 }],
  goals_addressed: [{ goal: 'upper body strength', share: 1.0 }],
  reasoning: 'Primary horizontal press for chest development',
  exercise_description: 'Lie on a flat bench with a dumbbell in each hand. Press up to full extension, then lower to chest level.',
  equipment: ['dumbbell', 'bench'],
  sets: 3,
  reps: [10, 10, 10],
  load_kg_each: [11],
  load_unit: 'lbs',
  hold_duration_sec: null,
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: 90
};

const holdExercise = {
  exercise_name: 'Plank',
  exercise_type: 'hold',
  muscles_utilized: [{ muscle: 'core', share: 0.8 }, { muscle: 'shoulders', share: 0.2 }],
  goals_addressed: [{ goal: 'core stability', share: 1.0 }],
  reasoning: 'Core stabilization exercise',
  exercise_description: 'Hold a straight-arm plank position with a neutral spine.',
  equipment: [],
  sets: 3,
  reps: null,
  load_kg_each: null,
  load_unit: null,
  hold_duration_sec: [30, 30, 30],
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: 60
};

const durationExercise = {
  exercise_name: 'Treadmill Walk',
  exercise_type: 'duration',
  muscles_utilized: [{ muscle: 'legs', share: 0.7 }, { muscle: 'cardiovascular', share: 0.3 }],
  goals_addressed: [{ goal: 'cardiovascular endurance', share: 1.0 }],
  reasoning: 'Low intensity cardio warm-up',
  exercise_description: 'Walk at a brisk pace on the treadmill.',
  equipment: ['treadmill'],
  sets: null,
  reps: null,
  load_kg_each: null,
  load_unit: null,
  hold_duration_sec: null,
  duration_min: 10,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: null
};

const intervalsExercise = {
  exercise_name: 'Kettlebell Swings',
  exercise_type: 'intervals',
  muscles_utilized: [{ muscle: 'glutes', share: 0.4 }, { muscle: 'hamstrings', share: 0.3 }, { muscle: 'core', share: 0.3 }],
  goals_addressed: [{ goal: 'power endurance', share: 1.0 }],
  reasoning: 'Posterior chain power with metabolic conditioning',
  exercise_description: 'Hinge at the hips and swing the kettlebell to shoulder height.',
  equipment: ['kettlebell'],
  sets: null,
  reps: null,
  load_kg_each: null,
  load_unit: null,
  hold_duration_sec: null,
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: 5,
  work_sec: 30,
  rest_seconds: 30
};

module.exports = { repsExercise, holdExercise, durationExercise, intervalsExercise };
```

**File**: `BACKEND/__tests__/fixtures/workoutInstance.js` (NEW)

```javascript
const { repsExercise, holdExercise, durationExercise, intervalsExercise } = require('./exercises');

const sampleWorkoutInstance = {
  title: 'Upper Body Push Day',
  estimated_duration_min: 45,
  focus: ['chest', 'shoulders', 'triceps'],
  exercises: [durationExercise, repsExercise, holdExercise, intervalsExercise],
  metadata: {
    intent: 'planned',
    request_text: null,
    planned_session: null,
    generated_at: '2026-02-16T10:00:00.000Z'
  }
};

const emptyWorkoutInstance = {
  title: "Today's Workout",
  estimated_duration_min: null,
  focus: [],
  exercises: [],
  metadata: {
    intent: 'planned',
    request_text: null,
    planned_session: null,
    generated_at: '2026-02-16T10:00:00.000Z'
  }
};

module.exports = { sampleWorkoutInstance, emptyWorkoutInstance };
```

**File**: `BACKEND/__tests__/fixtures/programMarkdown.js` (NEW)

```javascript
const sampleProgramMarkdown = `# Your Training Program
A balanced upper/lower split designed for intermediate lifters.

# Goals
**Primary goal:** Build upper body strength
**Secondary goal:** Improve cardiovascular endurance
**Timeline:** 12 weeks

**How we measure progress:**
- Dumbbell press weight increase
- Consistent 3x/week training

# Weekly Structure
You will train **3** days per week.
Upper/lower push-pull split with dedicated sessions for each movement pattern.

**Rest days:** Light walking or stretching on off days.

# Training Sessions
## Day 1: Upper Body Push
*45 minutes — moderate intensity*

Progressive chest and shoulder development with compound pressing movements.

## Day 2: Lower Body
*60 minutes — high intensity*

Squat and hinge pattern development with accessory work.

## Day 3: Upper Body Pull
*45 minutes — moderate intensity*

Back and bicep development with rowing and pulling movements.

# Progression Plan
Linear progression within each phase.

**Hypertrophy** (weeks 1-6)
Build muscle base with moderate loads and higher volume.

# Current Phase
**Hypertrophy** — Week 3 of 6
- Rep range: 8-12
- Intensity: Moderate (RPE 7-8)
- Volume: 16-20 sets per muscle group per week

# Available Phases
1. Hypertrophy (8-12 reps, moderate intensity, 4-6 weeks)
2. Strength (3-6 reps, high intensity, 3-4 weeks)
3. Deload (12-15 reps, low intensity, 1 week)

# Exercise Rules
**Prefer:** Compound movements, dumbbells
**Avoid:** Behind-the-neck press (shoulder impingement history)
**Always include:** Face pulls for shoulder health

# Recovery
**Sleep:** 7-8 hours minimum
**Nutrition:** High protein

# Safety Guidelines
Max session duration: 75 minutes. Flag any sharp pain immediately.

# Coach Notes
> User responds well to supersets.
> Left shoulder mobility is limited.

# Milestones
- [x] Complete 12 sessions
- [ ] Dumbbell bench press at 35 lb (currently 25 lb)

# Scheduling Recommendations
- Consider adding a Saturday mobility session if recovery allows`;

const minimalProgramMarkdown = `# Your Training Program
Simple program.

# Weekly Structure
You will train **5** days per week.

# Training Sessions
## Day 1: Full Body
*30 minutes — low intensity*

Basic full body workout.`;

module.exports = { sampleProgramMarkdown, minimalProgramMarkdown };
```

**File**: `BACKEND/__tests__/fixtures/sessionEvents.js` (NEW)

```javascript
const sampleSetEvents = [
  {
    id: 'evt-1', session_id: 'sess-1', sequence_number: 1,
    event_type: 'log_set',
    data: { payload: { index: 0, reps_completed: 10, load: 25 }, timestamp: '2026-02-16T10:05:00Z' }
  },
  {
    id: 'evt-2', session_id: 'sess-1', sequence_number: 2,
    event_type: 'log_set',
    data: { payload: { index: 0, reps_completed: 10, load: 25 }, timestamp: '2026-02-16T10:06:00Z' }
  },
  {
    id: 'evt-3', session_id: 'sess-1', sequence_number: 3,
    event_type: 'log_set',
    data: { payload: { index: 0, reps_completed: 8, load: 25 }, timestamp: '2026-02-16T10:07:00Z' }
  },
  {
    id: 'evt-4', session_id: 'sess-1', sequence_number: 4,
    event_type: 'log_set',
    data: { payload: { index: 1, reps_completed: 12, load: 30 }, timestamp: '2026-02-16T10:10:00Z' }
  }
];

const sampleIntervalEvents = [
  {
    id: 'evt-5', session_id: 'sess-1', sequence_number: 5,
    event_type: 'log_interval',
    data: { payload: { index: 2, duration_sec: 180 }, timestamp: '2026-02-16T10:15:00Z' }
  }
];

const sampleSafetyEvents = [
  {
    id: 'evt-6', session_id: 'sess-1', sequence_number: 6,
    event_type: 'safety_flag',
    data: { payload: { index: 1, area: 'left shoulder' }, timestamp: '2026-02-16T10:12:00Z' }
  }
];

const sampleActionEvents = [
  {
    id: 'evt-7', session_id: 'sess-1', sequence_number: 7,
    event_type: 'action',
    data: { action_type: 'swap_exercise', payload: { index: 1 }, timestamp: '2026-02-16T10:11:00Z' }
  }
];

module.exports = { sampleSetEvents, sampleIntervalEvents, sampleSafetyEvents, sampleActionEvents };
```

**File**: `BACKEND/__tests__/fixtures/weightsProfile.js` (NEW)

```javascript
const sampleWeightsProfile = {
  id: 'wp-1',
  user_id: 'user-1',
  version: 3,
  profile_json: [
    { equipment: 'dumbbell', movement: 'bench press', load: 25, load_unit: 'lbs', confidence: 'moderate' },
    { equipment: 'dumbbell', movement: 'shoulder press', load: 20, load_unit: 'lbs', confidence: 'moderate' },
    { equipment: 'barbell', movement: 'squat', load: 135, load_unit: 'lbs', confidence: 'high' },
    { equipment: 'cable', movement: 'row', load: 50, load_unit: 'lbs', confidence: 'low' },
    { equipment: 'bodyweight', movement: 'pull-up', load: 0, load_unit: 'lbs', confidence: 'moderate' },
    { equipment: 'kettlebell', movement: 'swing', load: 35, load_unit: 'lbs', confidence: 'moderate' }
  ],
  trigger_type: 'session_complete',
  trigger_session_id: 'sess-prev',
  created_at: '2026-02-15T20:00:00.000Z'
};

const emptyWeightsProfile = {
  id: 'wp-0',
  user_id: 'user-1',
  version: 1,
  profile_json: [],
  trigger_type: 'initial_inference',
  trigger_session_id: null,
  created_at: '2026-02-10T10:00:00.000Z'
};

module.exports = { sampleWeightsProfile, emptyWeightsProfile };
```

### Success Criteria

#### Automated Verification
- [ ] `cd BACKEND && npx vitest --version` shows vitest installed
- [ ] `vitest.config.js` exists
- [ ] All fixture files importable: `node -e "require('./__tests__/fixtures/exercises')"`
- [ ] All helper files importable: `node -e "require('./__tests__/helpers/supabaseMock')"`

---

## Phase 2: Export Internal Functions

### Overview
Add non-exported pure functions and key internal functions to `module.exports` in each service so they can be tested directly. No behavioral changes — only expanding what's accessible.

### Changes Required

#### 1. Update `trainerWorkouts.service.js` exports

**File**: `BACKEND/services/trainerWorkouts.service.js`

Add these to the existing `module.exports`:
```javascript
module.exports = {
  // ... existing exports ...
  // Exported for testing
  extractJson,
  normalizeExercise,
  normalizeWorkoutInstance,
  buildUserContextSummary,
  buildWorkoutPrompt,
  adjustExerciseIntensity,
  scaleWorkoutInstance,
  estimateWorkoutDuration,
  generateSwapExercise,
  findTodayWorkoutEvent
};
```

#### 2. Update `trainerCalendar.service.js` exports

**File**: `BACKEND/services/trainerCalendar.service.js`

Add `normalizeEvent` to the existing `module.exports`:
```javascript
module.exports = {
  // ... existing exports ...
  normalizeEvent
};
```

#### 3. Update `weeklyReview.service.js` exports

**File**: `BACKEND/services/weeklyReview.service.js`

Add `rewriteProgram` and `saveNewProgramVersion` to the existing `module.exports`:
```javascript
module.exports = {
  // ... existing exports ...
  rewriteProgram,
  saveNewProgramVersion
};
```

#### 4. Update `trainerWeightsProfile.service.js` exports

**File**: `BACKEND/services/trainerWeightsProfile.service.js`

Add `extractJson` and `getNextVersion` to the existing `module.exports`:
```javascript
module.exports = {
  // ... existing exports ...
  extractJson,
  getNextVersion
};
```

### Success Criteria

#### Automated Verification
- [ ] Backend starts without errors: `cd BACKEND && node -e "require('./services/trainerWorkouts.service'); require('./services/trainerCalendar.service'); require('./services/statsCalculator.service'); require('./services/weeklyReview.service'); require('./services/trainerWeightsProfile.service'); console.log('OK')"`
- [ ] All newly exported functions are accessible

---

## Phase 3: Write Test Files

### Overview
Write all 5 test files covering pure functions, DB operations, and AI integration. Each file mocks its dependencies, imports the service, and tests every exported function.

### Changes Required

#### 1. `statsCalculator.test.js`

**File**: `BACKEND/__tests__/statsCalculator.test.js` (NEW)

Starting with this file because it's the simplest — `calculateSessionStats` is pure, and `calculateWeeklyStats` only needs Supabase mocking.

**Tests for `calculateSessionStats`:**
- Empty events with 4-exercise instance → `total_exercises: 4, exercises_completed: 4, total_sets: 0, total_reps: 0, total_volume: 0`
- 4 set events across 2 exercise indices → correct `total_sets: 4`, `total_reps: 40`, `total_volume: 1110` (10*25 + 10*25 + 8*25 + 12*30)
- Interval events → `cardio_time_min: 3.0` (180 sec)
- Duration exercises in instance → added to cardio time
- Session timestamps → `workout_duration_min` calculated
- Safety events → `pain_flags` count
- `energy_rating` from `session.metadata.energy_level`
- Exercises skipped = total - unique indices with logs
- Null/missing fields don't crash

**Tests for `getCurrentWeekBounds`:**
- Returns Monday 00:00 and Sunday 23:59 for current week

**Tests for `calculateWeeklyStats` (Supabase mocked):**
- No sessions in range → zeros
- Multiple sessions → correct aggregation
- Trend calculation: more sessions than prior week → `'up'`

#### 2. `trainerWorkouts.test.js`

**File**: `BACKEND/__tests__/trainerWorkouts.test.js` (NEW)

**Mocks needed:**
- `@supabase/supabase-js`
- `./dataSources.service` → `fetchMultipleDataSources`
- `./modelProviders.service` → `getAnthropicClient`
- `./trainerProgram.service` → `getActiveProgram`
- `./trainerWeightsProfile.service` → `getLatestProfile`, `formatProfileForPrompt`

**Pure function tests:**

`extractJson`:
- `'{"a":1}'` → `{a:1}`
- `'Here is the JSON: {"a":1} end'` → `{a:1}`
- `'{"nested":{"b":2}}'` → correct nested object
- `'not json'` → `null`
- `''` → `null`
- `null` → `null`
- `'{"broken":'` → `null`

`normalizeExercise`:
- Complete exercise → all fields preserved
- Exercise with alternate field names (`name` → `exercise_name`, `load_each` → `load_kg_each`, `hold_sec` → `hold_duration_sec`, `rest_sec` → `rest_seconds`) → correctly mapped
- Empty object → all fields null/empty defaults, no crash
- Missing `exercise_type` but has `type` → uses `type`

`normalizeWorkoutInstance`:
- Complete instance → all fields preserved, exercises normalized
- Missing `exercises` key → empty array
- Constraints populate metadata (`intent`, `request_text`, `planned_session`)
- Missing `title` → defaults to `"Today's Workout"`

`buildUserContextSummary`:
- All data sources present → includes body stats, location, equipment, workout history, units
- Missing sources → skips gracefully
- Empty location array → no crash
- Equipment as strings vs objects → both handled

`buildWorkoutPrompt`:
- With program → prompt includes program markdown
- Without program → prompt omits program section
- With weights profile → prompt includes weights text
- Without weights profile → prompt omits weights section
- Pre-workout inputs (energy, time, equipment, intent) → all appear in prompt
- Optional fields (request_text, planned_session, soreness, pain) → included when present, omitted when null

`adjustExerciseIntensity`:
- `'harder'` → sets +1, reps/holds scaled by 1.15
- `'easier'` → sets -1 (min 1), reps/holds scaled by 0.85
- Null reps → stays null (no crash on `.map()`)
- Null duration_min → stays null

`scaleWorkoutInstance`:
- Ratio 0.5 → halves sets, reps, duration, etc.
- Ratio 1.0 → no change
- Minimum clamps: sets ≥ 1, duration ≥ 5, rounds ≥ 1, work_sec ≥ 10
- `estimated_duration_min` also scaled

`estimateWorkoutDuration`:
- Mixed exercise types → correct aggregate
- Empty instance → returns 30
- Duration-only exercise → duration_min * 60 sec
- Intervals exercise → rounds * (work_sec + rest_sec)
- Reps exercise → sets * (rest + 30)
- Hold exercise → sets * (rest + 40)
- Unknown type → 120 seconds default

**DB operation tests (Supabase mocked):**

`createSession`:
- Creates session with correct user_id, status, coach_mode
- When today has a calendar event → links `planned_session_id` and `calendar_event_id`
- When no calendar event → null for both

`getOrCreateSession`:
- Active session exists → returns it without creating
- No active session → creates new
- `forceNew: true` → always creates new

`logEvent`:
- First event → sequence_number 1
- Subsequent event → increments sequence

`applyAction` — `swap_exercise`:
- Replaces exercise at given index in instance
- Creates new instance version
- Logs action event
- Invalid index → throws

`applyAction` — `adjust_prescription`:
- Scales exercise at index
- Creates new instance version

`applyAction` — `time_scale`:
- Scales workout by target_minutes / estimated_duration ratio
- Missing `target_minutes` → throws

`applyAction` — `flag_pain`:
- Scales workout by 0.8
- Logs both action and safety_flag events

`applyAction` — `set_coach_mode`:
- Updates session coach_mode
- Does NOT create new instance

**AI integration tests (Anthropic mocked):**

`generateWorkoutInstance`:
- Valid AI response → returns normalized instance
- AI returns JSON with no `exercises` → throws
- AI returns non-JSON → throws

`generateSwapExercise`:
- Valid response → returns normalized exercise
- Invalid response → throws

`generateSessionSummary`:
- Valid response → returns parsed summary
- AI throws error → returns fallback summary (doesn't propagate)

#### 3. `trainerCalendar.test.js`

**File**: `BACKEND/__tests__/trainerCalendar.test.js` (NEW)

**Mocks needed:**
- `@supabase/supabase-js`

**Pure function tests:**

`parseSessionsFromMarkdown`:
- Sample program with 3 sessions → extracts all 3 with correct names, durations, intensities
- Empty string → empty array
- Markdown with no `# Training Sessions` → empty array
- Last session at end of file (no next `# ` heading) → still captured
- Duration/intensity parsing: `*45 minutes — moderate intensity*` → `{ durationMin: 45, intensity: 'moderate' }`
- Missing duration line → defaults (durationMin: 45, intensity: 'moderate')

`parseDaysPerWeek`:
- `**3** days per week` → 3
- `**5** days per week` → 5
- No match → defaults to 3
- Empty string → 3

`normalizeEvent`:
- Event with `trainer_planned_sessions` array → extracts first as `planned_session`
- Event with empty array → `planned_session: null`
- Strips `trainer_planned_sessions` key from result

**DB operation tests:**

`listEvents`:
- Returns normalized events
- Passes start/end filters when provided
- Omits filters when null

`createEvent`:
- Workout with `intent_json` → creates event + planned session
- Non-workout event → creates event only, no planned session
- Returns event with planned_session attached

`rescheduleEvent`:
- Updates `start_at`, `end_at`, sets `user_modified: true`

`skipEvent`:
- Sets status to `'skipped'`, stores reason in notes

`completeEvent`:
- Sets status to `'completed'`

`syncCalendarFromProgram`:
- 3 days/week program → creates ~12 events over 28 days (every ~2 days)
- Deletes existing future projections before creating
- Creates planned sessions for each event
- No active program → returns `{ created: 0, reason: 'no_active_program' }`

`regenerateWeeklyCalendar`:
- Creates events for next Monday-Sunday
- 3 days/week → 3 events with correct spacing
- Deletes existing future scheduled/planned events first
- Creates planned sessions for each event

#### 4. `trainerWeightsProfile.test.js`

**File**: `BACKEND/__tests__/trainerWeightsProfile.test.js` (NEW)

**Mocks needed:**
- `@supabase/supabase-js`
- `./modelProviders.service`
- `./dataSources.service`

**Pure function tests:**

`formatProfileForPrompt`:
- Profile with entries → formatted lines like `"- dumbbell bench press: 25 lbs (confidence: moderate)"`
- Null profile → `null`
- Empty profile_json array → `null`
- Entry with no equipment → formats without equipment prefix

`extractJson`:
- Same test cases as trainerWorkouts version (these are separate copies of the same function)

**DB operation tests:**

`getLatestProfile`:
- Returns most recent version for user
- No profile → `null`

`getProfileHistory`:
- Returns array of versions, descending
- Respects limit parameter

`getNextVersion`:
- Latest version 3 → returns 4
- No existing profile → returns 1

**AI integration tests:**

`createInitialProfile`:
- Valid AI response with entries → saves profile with version 1, trigger_type `'initial_inference'`
- AI response missing `entries` → throws
- Prompt includes user profile data and equipment

`updateAfterSession`:
- Valid AI response → saves new version, trigger_type `'session_complete'`, links session_id
- AI response unparseable → returns `null` (graceful, no throw)
- Prompt includes current profile + workout instance + session summary

#### 5. `weeklyReview.test.js`

**File**: `BACKEND/__tests__/weeklyReview.test.js` (NEW)

**Mocks needed:**
- `@supabase/supabase-js`
- `./modelProviders.service`
- `./trainerProgram.service`
- `./trainerWeightsProfile.service`
- `./statsCalculator.service`
- `./trainerCalendar.service`

**DB operation tests:**

`getWeekSessionSummaries`:
- 2 completed sessions with summaries → returns both
- No sessions in range → empty array
- Session without summary → includes with `summary: null`

`checkAndRunCatchUpReview`:
- Has upcoming events → returns `{ regenerated: false, reason: 'has_upcoming_events' }`
- No upcoming events + has program → regenerates calendar, returns `{ regenerated: true }`
- No upcoming events + no program → returns `{ regenerated: false, reason: 'no_active_program' }`

`getActiveUsers`:
- Returns array of user_ids from trainer_active_program

**AI integration tests:**

`rewriteProgram`:
- Valid markdown response → returns cleaned markdown
- Response wrapped in code fences → strips them
- Response with ` ```markdown ` language tag → strips correctly
- Empty/invalid response (no `# ` heading) → throws

`saveNewProgramVersion`:
- Increments version, updates program, upserts active_program, logs event

`runWeeklyReview`:
- No sessions this week → returns `{ skipped: true, reason: 'no_sessions' }`
- No active program → returns `{ skipped: true, reason: 'no_active_program' }`
- Happy path → gathers data, rewrites program, saves version, regenerates calendar, returns stats

### Success Criteria

#### Automated Verification
- [ ] `cd BACKEND && npx vitest run` — all tests pass
- [ ] Each test file runs independently: `npx vitest run __tests__/statsCalculator.test.js`
- [ ] No test requires network access or environment variables

---

## Phase 4: Wire into Workflow

### Overview
Update package.json scripts and CLAUDE.md so tests are part of the development workflow.

### Changes Required

#### 1. Update `package.json`

**File**: `BACKEND/package.json`

Update the test script:
```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

#### 2. Update `CLAUDE.md`

**File**: `CLAUDE.md`

Add a section after "Build and Deploy to iPhone":

```markdown
## Run Backend Tests

After modifying any backend service file, run the test suite:

\`\`\`bash
cd BACKEND && npm test
\`\`\`

For watch mode during development:
\`\`\`bash
cd BACKEND && npm run test:watch
\`\`\`

For a specific test file:
\`\`\`bash
cd BACKEND && npx vitest run __tests__/trainerWorkouts.test.js
\`\`\`
```

### Success Criteria

#### Automated Verification
- [ ] `cd BACKEND && npm test` runs and passes all tests
- [ ] `cd BACKEND && npm run test:watch` starts in watch mode (exit with q)

---

## Implementation Notes

### Mocking Pattern for Each Test File

Every test file follows this pattern:

```javascript
const { describe, it, expect, vi, beforeEach } = require('vitest');
const { createMockSupabase } = require('./helpers/supabaseMock');
const { createMockAnthropicClient } = require('./helpers/anthropicMock');

// Create mocks BEFORE importing the module under test
const mockSupabase = createMockSupabase();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

// Mock other service dependencies as needed
vi.mock('../services/modelProviders.service', () => ({
  getAnthropicClient: vi.fn()
}));

// NOW import the module under test
const { functionToTest } = require('../services/theService.service');

// Set up Anthropic mock per-test
const { getAnthropicClient } = require('../services/modelProviders.service');
const anthropic = createMockAnthropicClient();
getAnthropicClient.mockReturnValue(anthropic.client);

beforeEach(() => {
  mockSupabase.reset();
  anthropic.reset();
});
```

### Order of Implementation Within Phase 3

Write test files in this order (simplest → most complex):
1. `statsCalculator.test.js` — mostly pure, minimal mocking
2. `trainerCalendar.test.js` — pure functions + straightforward DB mocks
3. `trainerWeightsProfile.test.js` — pure + DB + simple AI mocks
4. `trainerWorkouts.test.js` — most functions, most complex (applyAction has many branches)
5. `weeklyReview.test.js` — orchestration, mocks other services

### Running Tests During Implementation

After writing each test file, run it immediately to verify:
```bash
cd BACKEND && npx vitest run __tests__/[filename].test.js
```

Fix any failures before moving to the next file. If a test reveals a bug in the service code, fix the service code and re-run.

## References

- Spec: `docs/specs/2026-02-16-backend-tdd.md`
- Parent plan: `docs/plans/2026-02-15-workout-generation-and-calendar.md`
- Services: `BACKEND/services/trainerWorkouts.service.js`, `trainerCalendar.service.js`, `statsCalculator.service.js`, `weeklyReview.service.js`, `trainerWeightsProfile.service.js`
