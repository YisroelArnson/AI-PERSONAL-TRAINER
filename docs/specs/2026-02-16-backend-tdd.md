# Backend TDD — Workout & Calendar Services

**Date**: 2026-02-16
**Status**: Draft

## Problem

Features built in the workout generation & calendar plan (`docs/plans/2026-02-15-workout-generation-and-calendar.md`) have bugs — functions return wrong data or crash on unexpected inputs. There are zero tests in the backend. When Claude Code implements features, it has no automated feedback loop to verify correctness, so bugs survive until manual testing in the app.

## Solution

Add a Vitest test suite covering the five backend services built in the plan:
- `trainerWorkouts.service.js`
- `trainerCalendar.service.js`
- `statsCalculator.service.js`
- `weeklyReview.service.js`
- `trainerWeightsProfile.service.js`

All Supabase and Anthropic SDK calls are mocked — tests run offline, instantly, with no external dependencies. The test suite becomes a verification step that Claude Code runs after every implementation change.

## What We're Testing

### Tier 1: Pure Functions (no mocking needed)

These take data in and return data out. Most "wrong data" and "crash" bugs live here.

| Service | Function | What it does |
|---------|----------|-------------|
| `trainerWorkouts` | `extractJson(text)` | Extracts JSON from AI response text |
| `trainerWorkouts` | `normalizeExercise(exercise)` | Normalizes varied AI output into consistent shape |
| `trainerWorkouts` | `normalizeWorkoutInstance(raw, constraints)` | Normalizes full workout instance |
| `trainerWorkouts` | `buildUserContextSummary(dataSourceResults)` | Builds prompt context string from data sources |
| `trainerWorkouts` | `buildWorkoutPrompt(data, constraints, program, weights)` | Assembles the full generation prompt |
| `trainerWorkouts` | `adjustExerciseIntensity(exercise, direction)` | Scales exercise up/down by 15% |
| `trainerWorkouts` | `scaleWorkoutInstance(instance, ratio)` | Scales entire workout by time ratio |
| `trainerWorkouts` | `estimateWorkoutDuration(instance)` | Estimates duration from exercise types |
| `trainerCalendar` | `parseSessionsFromMarkdown(markdown)` | Extracts session templates from program markdown |
| `trainerCalendar` | `parseDaysPerWeek(markdown)` | Extracts training frequency from markdown |
| `statsCalculator` | `calculateSessionStats(instance, events, session)` | Computes per-session totals from raw data |
| `weightsProfile` | `formatProfileForPrompt(profileRecord)` | Formats weights profile as prompt text |

### Tier 2: Database Operations (Supabase mocked)

These call Supabase for reads/writes. Mocking verifies the right queries are built and results are handled correctly.

| Service | Function | What it does |
|---------|----------|-------------|
| `trainerWorkouts` | `getActiveSession(userId)` | Finds in-progress session |
| `trainerWorkouts` | `createSession(userId, metadata)` | Creates new workout session |
| `trainerWorkouts` | `getOrCreateSession(userId, options)` | Returns existing or creates new |
| `trainerWorkouts` | `logEvent(sessionId, eventType, data)` | Appends event to session log |
| `trainerWorkouts` | `createWorkoutInstance(sessionId, json)` | Stores versioned workout instance |
| `trainerWorkouts` | `applyAction({sessionId, userId, actionType, payload})` | Applies mid-workout action (swap, adjust, time_scale, flag_pain) |
| `trainerCalendar` | `listEvents(userId, start, end)` | Lists calendar events with planned sessions |
| `trainerCalendar` | `createEvent(userId, payload)` | Creates calendar event + planned session |
| `trainerCalendar` | `rescheduleEvent(userId, eventId, payload)` | Updates event dates |
| `trainerCalendar` | `skipEvent(userId, eventId, reason)` | Marks event as skipped |
| `trainerCalendar` | `completeEvent(userId, eventId)` | Marks event as completed |
| `trainerCalendar` | `syncCalendarFromProgram(userId)` | Generates 28-day projection from program |
| `trainerCalendar` | `regenerateWeeklyCalendar(userId, markdown)` | Regenerates next week's calendar |
| `statsCalculator` | `calculateWeeklyStats(userId, weekStart, weekEnd)` | Weekly rollup from DB data |
| `weightsProfile` | `getLatestProfile(userId)` | Gets most recent profile version |
| `weightsProfile` | `getProfileHistory(userId, limit)` | Gets version history |
| `weeklyReview` | `getWeekSessionSummaries(userId, start, end)` | Gets session summaries for the week |
| `weeklyReview` | `checkAndRunCatchUpReview(userId)` | Checks for upcoming events, regenerates if none |

### Tier 3: AI Integration (Anthropic SDK mocked)

These call Claude for generation. Mocking verifies the prompt is constructed correctly and the response is parsed/handled correctly, including error cases.

| Service | Function | What it does |
|---------|----------|-------------|
| `trainerWorkouts` | `generateWorkoutInstance(userId, constraints)` | Generates workout via Claude |
| `trainerWorkouts` | `generateSwapExercise(userId, exercise, constraints)` | Generates replacement exercise |
| `trainerWorkouts` | `generateSessionSummary({sessionId, instance, log, reflection})` | AI summary of completed session |
| `weightsProfile` | `createInitialProfile(userId)` | AI infers starting weights from intake |
| `weightsProfile` | `updateAfterSession(userId, sessionId, instance, summary)` | AI updates profile after session |
| `weeklyReview` | `rewriteProgram({currentProgram, summaries, stats, profile})` | AI rewrites program markdown |
| `weeklyReview` | `runWeeklyReview(userId)` | Full orchestration: gather data, rewrite, save, regenerate |

## Technical Design

### Test Framework Setup

**Framework**: Vitest
**Module system**: CommonJS (matching `"type": "commonjs"` in package.json)

```
BACKEND/
  vitest.config.js
  __tests__/
    trainerWorkouts.test.js
    trainerCalendar.test.js
    statsCalculator.test.js
    weeklyReview.test.js
    trainerWeightsProfile.test.js
    fixtures/
      workoutInstance.js      — sample workout instances
      exercises.js            — sample exercise objects (all 4 types)
      programMarkdown.js      — sample program markdown
      sessionEvents.js        — sample session event arrays
      weightsProfile.js       — sample weights profile records
    helpers/
      supabaseMock.js         — reusable Supabase mock builder
      anthropicMock.js        — reusable Anthropic SDK mock builder
```

### Mocking Strategy

#### Supabase Mock

Every service creates its own Supabase client at module level. Mock `@supabase/supabase-js` globally:

```javascript
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));
```

The `mockSupabaseClient` supports the chainable query builder pattern:

```javascript
function createMockSupabase() {
  const chain = {};
  const methods = ['from', 'select', 'insert', 'update', 'upsert', 'delete',
                   'eq', 'gte', 'lte', 'lt', 'gt', 'in', 'order', 'limit',
                   'single', 'maybeSingle'];

  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }

  // Terminal methods return { data, error }
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  // Default select resolution
  chain.then = undefined; // Let specific tests configure resolution

  return chain;
}
```

Each test configures what the mock returns for that specific scenario.

#### Anthropic SDK Mock

Mock `./modelProviders.service` which provides `getAnthropicClient()`:

```javascript
vi.mock('./modelProviders.service', () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}));
```

Each test sets the mock return value to simulate different AI responses — valid JSON, malformed JSON, empty response, error.

### Test Fixtures

Reusable sample data reflecting the actual shapes from the codebase:

**`fixtures/exercises.js`** — One sample exercise per type:
- `reps` exercise (e.g., Dumbbell Bench Press with sets, reps, load)
- `hold` exercise (e.g., Plank with hold_duration_sec)
- `duration` exercise (e.g., Treadmill Walk with duration_min)
- `intervals` exercise (e.g., Kettlebell Swings with rounds, work_sec, rest_seconds)

**`fixtures/workoutInstance.js`** — Complete workout instance with all 4 exercise types, title, duration, focus, metadata.

**`fixtures/programMarkdown.js`** — A program markdown string with all sections: Training Sessions (3 days), Weekly Structure, Current Phase, etc. Matches the format in the plan.

**`fixtures/sessionEvents.js`** — Arrays of workout events: log_set events, log_interval events, safety_flag events, action events.

**`fixtures/weightsProfile.js`** — A weights profile record with `profile_json` containing 5-10 entries across different equipment and movements.

### What Each Test File Covers

#### `trainerWorkouts.test.js`

**Pure functions:**
- `extractJson` — valid JSON, JSON with surrounding text, malformed JSON, empty string, null
- `normalizeExercise` — complete exercise, missing fields use defaults, alternate field names (`name` vs `exercise_name`, `load_each` vs `load_kg_each`)
- `normalizeWorkoutInstance` — complete instance, missing exercises defaults to empty array, metadata populated from constraints
- `buildUserContextSummary` — all data sources present, missing sources, empty arrays
- `buildWorkoutPrompt` — includes program markdown when present, includes weights profile, includes pre-workout context, omits optional fields when null
- `adjustExerciseIntensity` — harder increases by 15%, easier decreases by 15%, sets clamp at min 1, null fields preserved
- `scaleWorkoutInstance` — ratio 0.5 halves everything, ratio 1.0 no-ops, minimum clamps (sets >= 1, duration >= 5, etc.)
- `estimateWorkoutDuration` — mixed exercise types, empty instance returns 30, single duration exercise

**DB operations (Supabase mocked):**
- `createSession` — creates with correct fields, links to today's calendar event when one exists, handles no calendar event
- `getOrCreateSession` — returns existing active session, creates new when none exists, `forceNew` always creates
- `logEvent` — increments sequence number, handles first event (sequence 1)
- `applyAction` — each action type:
  - `swap_exercise`: replaces exercise at index, creates new instance version
  - `adjust_prescription`: scales exercise harder/easier
  - `time_scale`: scales workout by time ratio, requires target_minutes
  - `flag_pain`: reduces volume by 20%, logs safety event
  - `set_coach_mode`: updates session, no instance change
  - Invalid index throws error

**AI integration (Anthropic mocked):**
- `generateWorkoutInstance` — returns normalized instance from AI response, throws on unparseable response
- `generateSwapExercise` — returns normalized exercise, throws on bad response
- `generateSessionSummary` — returns parsed summary, falls back to default on AI error

#### `trainerCalendar.test.js`

**Pure functions:**
- `parseSessionsFromMarkdown` — extracts 3 sessions from sample markdown, parses duration and intensity, handles empty markdown, handles markdown with no Training Sessions section, handles session at end of file (no next heading)
- `parseDaysPerWeek` — extracts "3 days per week", defaults to 3 when pattern not found, handles "5 days per week"

**DB operations (Supabase mocked):**
- `createEvent` — creates event + planned session when intent_json provided, creates event only when no intent_json
- `rescheduleEvent` — updates start_at and end_at
- `skipEvent` — sets status to 'skipped', stores reason
- `completeEvent` — sets status to 'completed'
- `syncCalendarFromProgram` — deletes old projections, creates correct number of events based on days/week, creates planned sessions for each, handles no active program
- `regenerateWeeklyCalendar` — deletes future planned events, creates next week's events, correct day spacing based on frequency

#### `statsCalculator.test.js`

**Pure function (main focus):**
- `calculateSessionStats`:
  - Empty events → zeros with exercise count from instance
  - Sets logged → correct totalSets, totalReps, totalVolume
  - Volume calculation: weight * reps accumulated correctly
  - Interval events → correct cardio_time_min
  - Duration exercises from instance → added to cardio time
  - Workout duration from session timestamps
  - Exercises skipped = total - those with logged events
  - Pain flags counted from safety events
  - Energy rating from session metadata

**DB operation:**
- `calculateWeeklyStats` — aggregates session stats, calculates averages, computes trends vs prior week, handles zero sessions

#### `weeklyReview.test.js`

**DB operations:**
- `getWeekSessionSummaries` — returns summaries for completed sessions in range, handles no sessions
- `checkAndRunCatchUpReview` — returns early if upcoming events exist, regenerates calendar if none, handles no active program

**AI integration:**
- `rewriteProgram` — sends correct prompt with all inputs, strips code fences from response, throws on empty/invalid response
- `runWeeklyReview` — full orchestration:
  - Skips if no sessions this week
  - Skips if no active program
  - Calls rewriteProgram with gathered data
  - Saves new program version
  - Regenerates calendar
  - Returns stats

#### `trainerWeightsProfile.test.js`

**Pure function:**
- `formatProfileForPrompt` — formats entries as readable lines, handles null/empty profile, handles missing fields

**DB operations:**
- `getLatestProfile` — returns most recent version
- `getProfileHistory` — returns versions in descending order, respects limit

**AI integration:**
- `createInitialProfile` — sends correct prompt with user data, parses AI response, saves with version 1 and trigger_type 'initial_inference', throws on unparseable response
- `updateAfterSession` — sends current profile + session data to AI, saves new version, returns null on parse failure (doesn't throw — graceful degradation)

## Edge Cases & Error Handling

- **`extractJson` with nested braces**: The function uses first `{` and last `}` — verify it handles nested objects correctly and doesn't break on JSON with `}` in string values
- **`normalizeExercise` with completely empty input**: Should return object with all null/empty defaults, not crash
- **`adjustExerciseIntensity` with null arrays**: `reps: null` should stay null, not crash on `.map()`
- **`scaleWorkoutInstance` with ratio near 0**: Minimum clamps should prevent sets=0, duration=0
- **`parseSessionsFromMarkdown` when last session has no trailing heading**: The current code pushes `currentSession` when it hits the next `# ` heading OR end of file — verify both paths
- **`calculateSessionStats` with duplicate exercise indices in events**: Should count unique indices for exercisesCompleted
- **`generateWorkoutInstance` when AI returns valid JSON but no `exercises` key**: Should throw, not return a broken instance
- **`generateSessionSummary` fallback**: When AI call throws, should return the hardcoded fallback summary, not propagate the error
- **`updateAfterSession` graceful failure**: Returns null instead of throwing — the caller (session completion) shouldn't be blocked by a weights profile update failure
- **`rewriteProgram` code fence stripping**: AI sometimes wraps markdown in ` ```markdown ... ``` ` — the function strips this, verify it works with and without the language tag
- **`syncCalendarFromProgram` with 7 days/week**: interval calculation `Math.floor(7/7) = 1`, should create 7 events, not overflow
- **`regenerateWeeklyCalendar` on different days of the week**: The "next Monday" calculation uses `getDay()` — verify it works correctly when run on Sunday (day=0), Monday (day=1), and Wednesday (day=3)

## What We're NOT Building

- **iOS tests** — Swift/XCTest is a separate effort with different tooling
- **Integration tests against real Supabase** — Everything is mocked for speed and isolation
- **End-to-end API tests** — No Express route testing (controller layer). Focus is on service logic.
- **Snapshot tests for AI prompts** — Prompts change frequently; testing the structure is enough
- **CI/CD pipeline** — Test runner is local-only for now. CI comes later.
- **Code coverage thresholds** — Not enforcing a coverage percentage. Goal is catching real bugs, not hitting a number.

## Workflow Integration

After the test suite is set up, the implementation workflow becomes:

1. **Claude Code writes/modifies a service function**
2. **Claude Code runs `npm test`** (or `npx vitest run`)
3. **If tests fail** → Claude Code reads the failure, fixes the code, re-runs
4. **If tests pass** → Change is verified, move on

This can be codified in the CLAUDE.md instructions:
```
After modifying any backend service file, run `cd BACKEND && npx vitest run` to verify.
```

For true TDD on new features:
1. Claude Code writes a failing test first (describing expected behavior)
2. Claude Code writes the implementation
3. Claude Code runs tests — they should pass
4. If not, fix and re-run

## Open Questions

None — all decisions made during interview.

## Decision Log

| Decision | Options Considered | Choice | Reasoning |
|----------|-------------------|--------|-----------|
| Test framework | Vitest, Jest, Node built-in | Vitest | Fast, modern, built-in mocking, good DX |
| Database strategy | Mock all, real DB, Supabase branch | Mock all | Speed, offline, no side effects, no cost |
| AI strategy | Mock all, real API | Mock all | Deterministic tests, no API cost, fast |
| Scope | Pure functions only, +DB mocks, +AI mocks | All three tiers | Full coverage catches the most bugs |
| Test structure | One big file, per-service files | Per-service files | Matches 1:1 with source, easy to find |
| What to export | Only public API, also internals | Export pure functions for testing | Many internal pure functions are where bugs live — worth testing directly even if not in module.exports today |
