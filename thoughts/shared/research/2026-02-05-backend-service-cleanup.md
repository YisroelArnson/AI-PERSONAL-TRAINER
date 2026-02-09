---
date: 2026-02-05T12:00:00-05:00
researcher: Claude
git_commit: 80fc00339c8d0754b169cfbb08b6253ffa6cc111
branch: onboarding-overhaul
repository: AI-PERSONAL-TRAINER
topic: "Backend service cleanup - removing outdated services and analyzing dataSources vs fetchUserData overlap"
tags: [research, codebase, backend, services, cleanup, refactoring]
status: complete
last_updated: 2026-02-05
last_updated_by: Claude
last_updated_note: "Added categoryGoals.service, updated decisions: remove preference UI entirely, remove Supabase CRUD from frontend, no replacement for exercise logging yet"
---

# Research: Backend Service Cleanup

**Date**: 2026-02-05
**Researcher**: Claude
**Git Commit**: 80fc00339c8d0754b169cfbb08b6253ffa6cc111
**Branch**: onboarding-overhaul
**Repository**: AI-PERSONAL-TRAINER

## Research Question

Which backend services are outdated and should be removed (recommend, preference, muscleGoals, categoryGoals, interval, exerciseLog, exerciseDistribution)? What are their full dependency trees? Do dataSources.service and fetchUserData.service overlap? What frontend cleanup is needed?

## Decisions

- **Preference UI**: Remove entirely — both the backend AI parsing endpoint AND all frontend Supabase CRUD operations and UI components
- **categoryGoals.service**: Also being removed alongside muscleGoals.service
- **Exercise logging & workout history**: No replacement right now. New architecture will be designed later.
- **Frontend Supabase CRUD for preferences**: Remove all direct Supabase operations from Swift files

## Summary

**Seven** backend services are targeted for removal. All seven have backend route/controller/service files, and five of the seven have active frontend API calls in APIService.swift (interval.service has no frontend callers, categoryGoals only has AI parsing calls). Removing these services requires deleting **~25 backend files** and cleaning up / deleting **~20 frontend files**. The dataSources.service and fetchUserData.service have **~60-70% query overlap** (same 8 Supabase tables) but serve different architectural patterns — fetchUserData is a monolithic context builder while dataSources is a modular registry for agent tools.

---

## Detailed Findings

### 1. recommend.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/recommend.service.js` | 894 | Core recommendation engine using GPT-4o |
| `BACKEND/routes/recommend.routes.js` | 14 | POST /recommend/exercises/:userId, /recommend/stream/:userId |
| `BACKEND/controllers/recommend.controller.js` | 163 | Express handlers for both endpoints |

**Backend references that need updating:**
- `BACKEND/index.js:36-37` — imports and mounts recommendRouter at `/recommend`

**Frontend files affected:**
- `APIService.swift:386-521` — `fetchRecommendations()` and `streamRecommendations()` methods
- `APIModels.swift:15-116` — `ExerciseRecommendations`, `RecommendationExercise`, `StreamingMessage`, `StreamingExercise` model structs
- `Features/Home/RefreshModalView.swift` — references "Get new exercise recommendations"
- `Models/Exercise.swift` — has `init(from recommendation: RecommendationExercise)` initializer

**Internal dependencies:** Imports from muscleGoals.service (`PRESET_MUSCLES`), exerciseDistribution.service (`formatDistributionForPrompt`), and fetchUserData.service (`fetchAllUserData`). All three are also being removed or consolidated.

---

### 2. preference.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/preference.service.js` | 148 | AI-powered preference text parser using GPT-4o |
| `BACKEND/routes/preference.routes.js` | 14 | POST /preferences/parse |
| `BACKEND/controllers/preference.controller.js` | 60 | Express handler for parse endpoint |

**Backend references that need updating:**
- `BACKEND/index.js:39-40` — imports and mounts preferenceRouter at `/preferences`

**Note:** `BACKEND/agent/tools/preferences.js` has its own preference CRUD tools (`set_preference`, `delete_preference`) that operate directly on the `preferences` Supabase table. These agent tools may still be needed if the agent system continues to manage preferences.

**DECISION: Remove preference UI entirely** — both AI parsing and all Supabase CRUD operations from frontend.

**Frontend files to DELETE:**
- `Features/Info/Views/AddPreferenceSheet.swift` (425 lines) — Supabase INSERT + AI parsing
- `Features/Info/Views/PreferenceManagerView.swift` (389 lines) — Supabase UPDATE/INSERT/DELETE
- `Features/Info/Components/ActivePreferencesSection.swift` (~140 lines) — Supabase DELETE, displays preferences
- `Features/Info/Components/EmptyPreferencesState.swift` (~55 lines) — empty state UI

**Frontend files to EDIT:**
- `APIService.swift:1160-1193` — remove `parsePreference()` method
- `APIModels.swift:231-261` — remove `ParsePreferenceRequest`, `ParsePreferenceResponse`, `ParsedPreference`, `CurrentPreferenceContext` structs
- `Features/Info/Views/InfoView.swift` — remove state variables (`showingAddPreference`, `selectedPreference`), remove `ActivePreferencesSection`, remove sheet presentations
- `Services/UserDataStore.swift` — remove `preferences` state (line 19), `isLoadingPreferences` (line 25), `refreshPreferences()` (lines 176-188), `fetchPreferences()` (lines 190-218), `updatePreference()` (lines 252-258), `removePreference()` (lines 261-263), `UserPreferenceDB` struct (lines 588-602), `UserPreference` struct (lines 606-624)

**Frontend Supabase CRUD operations being removed:**
| Operation | File | Lines |
|-----------|------|-------|
| SELECT | UserDataStore.swift | 198-205 |
| INSERT | PreferenceManagerView.swift | 305-310 |
| INSERT | AddPreferenceSheet.swift | 254-260 |
| UPDATE | PreferenceManagerView.swift | 261-265 |
| DELETE | PreferenceManagerView.swift | 348-352 |
| DELETE | ActivePreferencesSection.swift | 129-133 |

---

### 3. categoryGoals.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/categoryGoals.service.js` | 117 | AI category goal text parser using GPT-4o |
| `BACKEND/routes/categoryGoals.routes.js` | 14 | POST /category-goals/parse |
| `BACKEND/controllers/categoryGoals.controller.js` | 56 | Express handler |

**Backend references that need updating:**
- `BACKEND/index.js:42-43` — imports and mounts categoryGoalsRouter at `/category-goals`
- `BACKEND/services/dataFormatters.service.js:30-42` — `formatCategoryGoals()` formatter (used by dataSources.service)
- `BACKEND/services/dataSources.service.js:32-42` — `category_goals` data source entry
- `BACKEND/services/exerciseDistribution.service.js:400-404` — fetches category goals for distribution metrics (also being removed)

**Frontend files affected:**
- `APIService.swift:1195-1237` — `parseCategoryGoals()` method
- `APIModels.swift:264-292` — `ParseCategoryGoalsRequest`, `ParseCategoryGoalsResponse`, `ParsedCategoryGoals`, `CategoryGoalContext` structs
- `Features/Info/Views/CategoryGoalSetterView.swift` (~750 lines) — full goal setter UI with AI parsing, presets, Supabase CRUD
- `Features/Info/Views/CategoryGoalsAIAssistSheet.swift` (~248 lines) — standalone AI assist sheet (has TODO/mock implementation)
- `Features/Info/Components/CategoryGoalsSection.swift` — displays category goals, calls `fetchDistributionMetrics()`
- `Services/UserDataStore.swift:17,51,105-136` — `categoryGoals` state, `refreshCategoryGoals()`, `fetchCategoryGoals()`, `CategoryGoalItem` struct (lines 554-568)

**Frontend Supabase CRUD to remove:**
- `CategoryGoalSetterView.swift:305-366` — saves goals directly to `user_category_and_weight` table, calls `resetDistributionTracking()`

**Navigation references:**
- `Features/Info/Views/InfoView.swift:19-20,53-56,86-92` — state variables, CategoryGoalsSection display, sheet presentations for CategoryGoalsAIAssistSheet and CategoryGoalSetterView

---

### 4. muscleGoals.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/muscleGoals.service.js` | 156 | AI muscle goal text parser using GPT-4o |
| `BACKEND/routes/muscleGoals.routes.js` | 15 | POST /muscle-goals/parse |
| `BACKEND/controllers/muscleGoals.controller.js` | 70 | Express handler |

**Backend references that need updating:**
- `BACKEND/index.js:45-46` — imports and mounts muscleGoalsRouter
- `BACKEND/services/recommend.service.js:6` — imports `PRESET_MUSCLES` constant (also being removed)

**Frontend files affected:**
- `APIService.swift:1239-1272` — `parseMuscleGoals()` method
- `Features/Info/Views/MuscleGoalSetterView.swift` — calls `parseMuscleGoals()` and `resetDistributionTracking()`
- `Features/Info/Components/MuscleGoalsSection.swift` — displays muscle goals, calls `fetchDistributionMetrics()`

---

### 5. interval.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/interval.service.js` | 369 | Generates interval timer phases for exercises |
| `BACKEND/routes/interval.routes.js` | 16 | POST /intervals/exercise, /intervals/batch |
| `BACKEND/controllers/interval.controller.js` | 156 | Express handlers |

**Backend references that need updating:**
- `BACKEND/index.js:54-55` — imports and mounts intervalRouter

**Frontend files affected:**
- **None found.** No Swift code calls the `/intervals/*` endpoints. This service appears to be unused by the frontend already.

---

### 6. exerciseLog.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/exerciseLog.service.js` | 274 | Logs exercises to workout_history, manages history |
| `BACKEND/routes/exerciseLog.routes.js` | 29 | POST/DELETE /exercises/log/*, GET /exercises/history/* |
| `BACKEND/controllers/exerciseLog.controller.js` | 186 | Express handlers for log/delete/history |

**Backend references that need updating:**
- `BACKEND/index.js:48-49` — imports and mounts exerciseLogRouter
- `BACKEND/services/fetchUserData.service.js:2` — imports `getWorkoutHistory` from this service

**Frontend files affected:**
- `APIService.swift:1279-1386` — `logCompletedExercise()`, `deleteCompletedExercise()`, `fetchWorkoutHistory()`
- `Services/ExerciseStore.swift:23` — tracks `workoutHistoryIds` mapping from log responses
- `Services/WorkoutHistoryStore.swift:43-184` — `loadInitialHistory()`, `loadAllTimeHistory()`, `loadOlderHistory()`, `addCompletedExercise()`, `removeCompletedExercise()`

---

### 7. exerciseDistribution.service

**Backend files to remove:**
| File | Lines | Purpose |
|------|-------|---------|
| `BACKEND/services/exerciseDistribution.service.js` | 606 | Tracks exercise distribution across categories/muscles |
| `BACKEND/routes/exerciseDistribution.routes.js` | 20 | GET /exercises/distribution/:userId, POST reset |
| `BACKEND/controllers/exerciseDistribution.controller.js` | 99 | Express handlers |

**Backend references that need updating:**
- `BACKEND/services/exerciseLog.service.js:2` — imports tracking functions (also being removed)
- `BACKEND/services/recommend.service.js:5` — imports `formatDistributionForPrompt` (also being removed)
- `BACKEND/services/fetchUserData.service.js:3` — imports `getDistributionMetrics`
- `BACKEND/agent/tools/exercises.js:4` — imports the service for agent tools

**Frontend files affected:**
- `APIService.swift:1391-1440` — `resetDistributionTracking()`, `fetchDistributionMetrics()`
- `Features/Info/Views/MuscleGoalSetterView.swift:326` — calls `resetDistributionTracking()` after saving goals
- `Features/Info/Components/MuscleGoalsSection.swift` — calls `fetchDistributionMetrics()`
- `Features/Info/Components/CategoryGoalsSection.swift` — calls `fetchDistributionMetrics()`

---

## dataSources.service vs fetchUserData.service Overlap Analysis

### Tables Queried by Both

| Supabase Table | fetchUserData | dataSources |
|---------------|:---:|:---:|
| `body_stats` | Yes | Yes |
| `user_category_and_weight` | Yes | Yes |
| `user_muscle_and_weight` | Yes | Yes |
| `user_locations` | Yes | Yes |
| `preferences` | Yes | Yes |
| `workout_history` | Yes (via exerciseLog) | Yes |
| `exercise_distribution_tracking` | Yes (via exerciseDistribution) | Yes |
| `user_settings` | Yes (via userSettings) | Yes |

### Key Differences

| Aspect | fetchUserData.service | dataSources.service |
|--------|----------------------|---------------------|
| **Pattern** | Monolithic — fetches everything at once | Registry — fetch individual sources on-demand |
| **Return format** | Single structured object with all data | Individual results with text formatting |
| **Formatters** | Direct field mapping in-service | Uses `dataFormatters.service.js` for text output |
| **Used by** | recommend.service, trainerWorkouts.service, contextBuilder.service | agent/tools/data.js, initializerAgent.service |
| **Preferences filter** | Time-based (`expire_time`) | `is_active` field |
| **Locations** | Single current location | All locations with metadata |
| **Error handling** | Collects errors in result object | Per-source error catching |

### Overlap Assessment

**~60-70% query overlap.** They hit the same 8 tables but differ in:
1. **Filtering strategy** — fetchUserData filters fields inline; dataSources returns raw + formats via formatters
2. **Preferences logic** — different filtering (time-based vs is_active flag) — potential data inconsistency
3. **Location handling** — current-only vs all locations
4. **Consumption pattern** — bulk context vs selective agent retrieval

### Consolidation Recommendation

Since recommend.service (the primary consumer of fetchUserData) is being removed, and the agent system uses dataSources.service, the remaining consumers of fetchUserData are:
- `trainerWorkouts.service.js` — builds workout sessions
- `contextBuilder.service.js` — builds LLM context

**DECISION: Keep dataSources.service, remove fetchUserData.service.** The remaining consumers (`trainerWorkouts.service` and `contextBuilder.service`) will be migrated to use `dataSources.service` with `fetchMultipleDataSources()`. The preferences filtering logic will need to be reconciled during migration.

---

## Complete File Inventory for Removal

### Backend Files to DELETE (22+ files)

**Services (8):**
- `BACKEND/services/recommend.service.js`
- `BACKEND/services/preference.service.js`
- `BACKEND/services/categoryGoals.service.js`
- `BACKEND/services/muscleGoals.service.js`
- `BACKEND/services/interval.service.js`
- `BACKEND/services/exerciseLog.service.js`
- `BACKEND/services/exerciseDistribution.service.js`
- `BACKEND/services/fetchUserData.service.js` (being replaced by dataSources.service)

**Routes (7):**
- `BACKEND/routes/recommend.routes.js`
- `BACKEND/routes/preference.routes.js`
- `BACKEND/routes/categoryGoals.routes.js`
- `BACKEND/routes/muscleGoals.routes.js`
- `BACKEND/routes/interval.routes.js`
- `BACKEND/routes/exerciseLog.routes.js`
- `BACKEND/routes/exerciseDistribution.routes.js`

**Controllers (7):**
- `BACKEND/controllers/recommend.controller.js`
- `BACKEND/controllers/preference.controller.js`
- `BACKEND/controllers/categoryGoals.controller.js`
- `BACKEND/controllers/muscleGoals.controller.js`
- `BACKEND/controllers/interval.controller.js`
- `BACKEND/controllers/exerciseLog.controller.js`
- `BACKEND/controllers/exerciseDistribution.controller.js`

### Backend Files to DELETE additionally

- `BACKEND/agent/tools/preferences.js` — agent preference CRUD tools (being removed)

### Backend Files Needing Edits (6+ files)

- `BACKEND/index.js` — remove 7 route imports and `app.use()` mounts (recommend, preference, categoryGoals, muscleGoals, interval, exerciseLog + exerciseDistribution routes)
- `BACKEND/services/trainerWorkouts.service.js` — migrate from `fetchAllUserData()` to `dataSources.service.fetchMultipleDataSources()`
- `BACKEND/services/contextBuilder.service.js` — migrate from `fetchAllUserData()` to `dataSources.service.fetchMultipleDataSources()`
- `BACKEND/agent/tools/index.js` — remove preferences.js import/export; keep exercises.js as-is
- `BACKEND/services/dataSources.service.js` — remove entries: `category_goals`, `muscle_goals`, `active_preferences`, `exercise_distribution`. Keep: `user_profile`, `workout_history`, `user_settings`, `all_locations`
- `BACKEND/services/dataFormatters.service.js` — remove `formatCategoryGoals()`, `formatMuscleGoals()`, `formatDistribution()`, `formatPreferences()` (no longer referenced after dataSources cleanup). Keep formatters for remaining entries.

**Note:** `BACKEND/agent/tools/exercises.js` is kept as-is (no changes).

### Frontend Files to DELETE (~12 files)

**Info screen (entire removal):**
- `Features/Info/Views/InfoView.swift` — entire screen removed
- `Features/Info/Views/AddPreferenceSheet.swift` (425 lines)
- `Features/Info/Views/PreferenceManagerView.swift` (389 lines)
- `Features/Info/Components/ActivePreferencesSection.swift` (~140 lines)
- `Features/Info/Components/EmptyPreferencesSection.swift` (~55 lines)
- `Features/Info/Views/CategoryGoalSetterView.swift` (~750 lines)
- `Features/Info/Views/CategoryGoalsAIAssistSheet.swift` (~248 lines)
- `Features/Info/Components/CategoryGoalsSection.swift`
- `Features/Info/Views/MuscleGoalSetterView.swift`
- `Features/Info/Components/MuscleGoalsSection.swift`

**Workout History:**
- `Services/WorkoutHistoryStore.swift` (no replacement yet)

### Frontend Files to EDIT (~6 files)

**API layer:**
- `APIService.swift` — remove ~12 methods (~400+ lines): `fetchRecommendations`, `streamRecommendations`, `parsePreference`, `parseCategoryGoals`, `parseMuscleGoals`, `logCompletedExercise`, `deleteCompletedExercise`, `fetchWorkoutHistory`, `resetDistributionTracking`, `fetchDistributionMetrics`
- `APIModels.swift` — remove all related request/response structs (~150+ lines): recommendation, preference, category goals, muscle goals, streaming models

**Views:**
- `Features/Home/RefreshModalView.swift` — remove recommendation references
- `Models/Exercise.swift` — remove `init(from recommendation: RecommendationExercise)` initializer

**Stores:**
- `Services/ExerciseStore.swift` — remove `workoutHistoryIds` tracking
- `Services/UserDataStore.swift` — remove all preference state/methods/structs, all categoryGoals state/methods/structs (`CategoryGoalItem`, `refreshCategoryGoals()`, `fetchCategoryGoals()`), any muscleGoals state

**Navigation:**
- Whatever tab/navigation view references InfoView needs to remove that tab/link

**Xcode project:**
- `AI Personal Trainer App.xcodeproj/project.pbxproj` — remove references to all deleted Swift files


---

## Architecture Insights

1. **The recommend.service is the most deeply connected** — it imports from muscleGoals, exerciseDistribution, and fetchUserData. Removing all three of its dependencies simultaneously simplifies the cleanup.

2. **exerciseLog and exerciseDistribution are tightly coupled** — exerciseLog calls distribution tracking on every log/delete. Removing both together is clean.

3. **Preference system: full removal** — backend parsing, frontend Supabase CRUD, all UI components, AND agent/tools/preferences.js are all being removed. Preferences will be rebuilt with a new architecture later.

4. **categoryGoals follows the same pattern as muscleGoals** — AI text parser + frontend with direct Supabase CRUD. Both are being removed together.

5. **interval.service is already dead code** from the frontend perspective — no Swift files call its endpoints.

6. **Exercise logging has no replacement yet** — a new architecture will be designed later. For now, these endpoints and their frontend callers are simply removed.

7. **fetchUserData.service is being removed** — dataSources.service is kept as the canonical data fetching layer. `trainerWorkouts.service` and `contextBuilder.service` will need migration.

8. **Agent tools cleanup** — `exercises.js` kept as-is; `preferences.js` removed; `index.js` updated to remove preferences export.

9. **Metering/observability references** — per `thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md`, all seven services were wrapped with metering. Removing them removes those metering points.

10. **InfoView.swift removed entirely** — with preferences, category goals, and muscle goals all gone, the entire Info screen is deleted. Navigation references to it must be cleaned up.

11. **Migration is simpler than expected** — trainerWorkouts and contextBuilder don't need preferences, workoutHistory (contextBuilder), or exerciseDistribution. They only need `user_profile`, `user_settings`, `all_locations`, and `workout_history` (trainerWorkouts only). The category/muscle goals XML formatting in contextBuilder also needs removal since those dataSources entries are being deleted.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-02-01-app-architecture-plain-english.md` — documents the current backend service architecture including all services targeted for removal
- `thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md` — documents metering wrappers added to all seven services
- `thoughts/shared/research/2026-02-01-intake-and-logging-architecture.md` — details exerciseLog.service integration with distribution tracking
- `thoughts/shared/research/2026-01-30-trainer-implementation-summary.md` — shows the trainer services that will remain after cleanup

## Related Research

- [thoughts/shared/research/2026-02-01-app-architecture-plain-english.md](thoughts/shared/research/2026-02-01-app-architecture-plain-english.md)
- [thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md](thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md)
- [thoughts/shared/research/2026-02-01-intake-and-logging-architecture.md](thoughts/shared/research/2026-02-01-intake-and-logging-architecture.md)

## Resolved Decisions

1. ~~Should the preference UI be removed entirely?~~ **YES** — remove everything: backend parsing, frontend Supabase CRUD, and all UI components.
2. ~~Should categoryGoals.service also be removed?~~ **YES** — remove alongside muscleGoals.service.
3. ~~What replaces exercise logging and workout history?~~ **Nothing yet** — new architecture will be designed later.
4. ~~Should fetchUserData.service be kept or consolidated?~~ **REMOVE** — keep dataSources.service, migrate trainerWorkouts and contextBuilder to use it.
5. ~~Should agent/tools/exercises.js and agent/tools/preferences.js be removed too?~~ **Keep exercises.js as-is. Remove preferences.js.** Update agent tools index accordingly.
6. ~~Should dataSources.service entries for removed features be cleaned up?~~ **Remove entries for:** `category_goals`, `muscle_goals`, `active_preferences`, `exercise_distribution`. **Keep:** `workout_history`.
7. ~~What remains on InfoView after cleanup?~~ **Remove InfoView entirely.**
8. ~~How should the trainerWorkouts/contextBuilder migration handle preferences?~~ **Skip preferences entirely.** Preferences are being fully removed — no migration needed. Just delete the preferences formatting code from contextBuilder and the broken preferences code from trainerWorkouts.

## Open Questions

None — all questions resolved.

---

## Appendix: Migration Simplification Analysis

### trainerWorkouts.service.js and contextBuilder.service.js — What They Actually Need

Research into the actual field usage revealed the migration is simpler than expected:

**trainerWorkouts.service.js (`buildUserContextSummary`, lines 261-300):**
- Uses: bodyStats, userCategoryAndWeights, userMuscleAndWeight, locations, workoutHistory, userSettings
- Preferences code (lines 280-285) is **broken/legacy** — tries to access `.preference_type` and `.value` which don't exist in the data structure. Never executes.
- Does NOT use: exerciseDistribution (fetched but ignored)

**contextBuilder.service.js (`formatUserDataXml`, lines 365-471):**
- Uses: bodyStats, userCategoryAndWeights, userMuscleAndWeight, locations, userSettings, **preferences (heavily, lines 442-467)**
- Does NOT use: workoutHistory, exerciseDistribution (both fetched but never read)

### DECISION: Skip preferences entirely in migration

Since the entire preferences system is being removed (no UI, no agent tools, no way to create them), there will be no preferences to format. The contextBuilder preferences handling (lines 442-467) can simply be deleted. The trainerWorkouts preferences code was already broken.

### Minimal dataSources migration

After removing preferences, the actual data needs are:

| dataSources entry | trainerWorkouts | contextBuilder |
|---|:---:|:---:|
| `user_profile` | Yes | Yes |
| `user_settings` | Yes | Yes |
| `all_locations` | Yes | Yes |
| `workout_history` | Yes | No |

Migration is: replace `fetchAllUserData()` with `fetchMultipleDataSources([...needed sources], userId)` and remove the preferences formatting from contextBuilder.

**Note:** Both services currently also use `userCategoryAndWeights` and `userMuscleAndWeight`, but those dataSources entries (`category_goals`, `muscle_goals`) are being removed. The contextBuilder XML formatting for those fields (lines 394-411) should also be removed, and trainerWorkouts' references cleaned up.

### Preferences Filtering Reference (for future rebuild)

Both `expire_time` (ISO timestamp) and `is_active` (boolean) columns exist on the `preferences` Supabase table. They serve different purposes:
- **`expire_time`**: Automatic time-based expiration (no action needed when time passes)
- **`is_active`**: Manual soft-delete flag (explicit action required)
- These were never synchronized — different services used different approaches. Future preferences rebuild should unify this.
