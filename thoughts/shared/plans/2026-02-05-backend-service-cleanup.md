# Backend Service Cleanup — Implementation Plan

## Overview

Remove 7 outdated backend services (recommend, preference, categoryGoals, muscleGoals, interval, exerciseLog, exerciseDistribution), consolidate data fetching by removing fetchUserData.service (replaced by dataSources.service), and clean up all corresponding frontend code. This includes removing the entire Info screen (relocating location management to its own feature), removing legacy recommendation/exercise-logging UI from HomeView, and cleaning up all dead API methods, models, and stores.

## Current State Analysis

The app has migrated to an artifact/session-based workout system powered by trainer agents. Seven legacy services remain from the old recommendation-based architecture — they are unused or redundant. The `fetchUserData.service` overlaps ~60-70% with `dataSources.service` and its primary consumer (`recommend.service`) is being removed.

### Key Discoveries:
- `exercises.js:4,514` imports and calls `exerciseDistributionService.updateTrackingIncrementally()` — must be edited despite research doc saying "keep as-is"
- `agent/tools/goals.js` writes to `user_category_and_weight` and `user_muscle_and_weight` — legacy tool not mentioned in research doc, must also be removed
- `MuscleGoalsAIAssistSheet.swift` exists but was missing from the research doc's deletion list
- 5 location-related files in `Features/Info/` must be relocated to `Features/Locations/`, not deleted
- `RefreshModalView.swift` is already orphaned (no active references)
- `AppStateCoordinator.swift` has orphaned `shouldFetchRecommendations` state
- `HomeView.swift` has an orphaned `.onChange` observer for recommendations
- `WorkoutHistoryStore.swift` is used by StatsView — StatsView references need cleanup
- The recommendation system is fully legacy — app uses artifact/session-based workouts now
- 6 Supabase tables become fully orphaned after cleanup and are dropped via migration script

## Desired End State

- All 7 legacy services and their route/controller files are deleted (~23 backend files)
- `fetchUserData.service.js` is deleted; `trainerWorkouts` and `contextBuilder` use `dataSources.service` instead
- `dataSources.service` and `dataFormatters.service` have no entries for removed features
- `agent/tools/preferences.js` and `agent/tools/goals.js` are deleted; `exercises.js` no longer references distribution tracking
- The entire Info screen is removed; location files live in `Features/Locations/`
- All frontend API methods, models, and store state for removed services are gone
- Navigation updated: Info tab replaced with Locations entry point
- The app builds and deploys successfully to iPhone

### How to Verify:
- Backend starts without errors: `cd BACKEND && node index.js`
- iOS app builds: `xcodebuild` with scheme "AI Personal Trainer App"
- No references to deleted services remain (grep verification)
- App launches and navigates without crashes

## What We're NOT Doing

- **Not rebuilding exercise logging** — new architecture will be designed later
- **Not rebuilding preferences UI** — will be rebuilt with new architecture
- **Not deleting `workout_history` table** — will get new write paths when exercise logging is rebuilt
- **Not changing the agent conversation system** — agent tools (except preferences and goals) remain
- **Not touching trainer services** (trainerWorkouts, trainerIntake, trainerAssessment, etc.) beyond the fetchUserData migration

## Implementation Approach

Work backend-first (deletions then edits), then frontend (deletions, relocations, then edits). This order ensures each phase is independently verifiable and minimizes merge conflicts.

---

## Phase 1: Backend — Delete Obsolete Files

### Overview
Delete all service, route, and controller files for the 7 targeted services plus `fetchUserData.service` and legacy agent tools (`preferences.js`, `goals.js`).

### Files to Delete (25 files):

**Services (8):**
- `BACKEND/services/recommend.service.js`
- `BACKEND/services/preference.service.js`
- `BACKEND/services/categoryGoals.service.js`
- `BACKEND/services/muscleGoals.service.js`
- `BACKEND/services/interval.service.js`
- `BACKEND/services/exerciseLog.service.js`
- `BACKEND/services/exerciseDistribution.service.js`
- `BACKEND/services/fetchUserData.service.js`

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

**Agent tools (2):**
- `BACKEND/agent/tools/preferences.js`
- `BACKEND/agent/tools/goals.js`

### Success Criteria:

#### Automated Verification:
- [x] All 25 files deleted: `ls` confirms they no longer exist
- [x] No other backend file directly `require()`s the deleted files (grep check — note: Phase 2 edits will fix remaining references)

#### Manual Verification:
- [ ] None — this phase is purely file deletion

**Implementation Note**: Phase 2 must follow immediately — the backend will not start until remaining import references are cleaned up.

---

## Phase 2: Backend — Edit Remaining Files

### Overview
Remove all imports/references to deleted services from remaining backend files. Migrate `trainerWorkouts.service` and `contextBuilder.service` from `fetchAllUserData()` to `dataSources.service.fetchMultipleDataSources()`.

### Changes Required:

#### 1. BACKEND/index.js
**Remove** these import lines and their corresponding `app.use()` mounts:

```javascript
// DELETE these imports:
const recommendRouter = require('./routes/recommend.routes');
const preferenceRouter = require('./routes/preference.routes');
const categoryGoalsRouter = require('./routes/categoryGoals.routes');
const muscleGoalsRouter = require('./routes/muscleGoals.routes');
const exerciseLogRouter = require('./routes/exerciseLog.routes');
const intervalRouter = require('./routes/interval.routes');

// DELETE these mounts:
app.use('/recommend', recommendRouter);
app.use('/preferences', preferenceRouter);
app.use('/category-goals', categoryGoalsRouter);
app.use('/muscle-goals', muscleGoalsRouter);
app.use('/exercises', exerciseLogRouter);
app.use('/intervals', intervalRouter);
```

Note: `exerciseDistribution` does not have its own route mount in index.js (it's nested under exerciseLog routes). Verify this during implementation.

#### 2. BACKEND/services/dataSources.service.js
**Remove** 4 entries from the `DATA_SOURCES` registry:
- `category_goals` entry (fetches from `user_category_and_weight`)
- `muscle_goals` entry (fetches from `user_muscle_and_weight`)
- `active_preferences` entry (fetches from `preferences`)
- `exercise_distribution` entry (fetches from `exercise_distribution_tracking`)

**Keep** these 4 entries:
- `user_profile`
- `workout_history`
- `user_settings`
- `all_locations`

#### 3. BACKEND/services/dataFormatters.service.js
**Remove** 4 formatter functions and their exports:
- `formatCategoryGoals()`
- `formatMuscleGoals()`
- `formatPreferences()`
- `formatDistribution()`

**Keep** these formatters:
- `formatWorkoutHistory()`
- `formatUserSettings()`
- `formatBodyStats()`
- `formatCurrentWorkout()`
- `formatAllLocations()`

#### 4. BACKEND/agent/tools/exercises.js
**Remove** the exerciseDistribution import (line 4):
```javascript
// DELETE:
const exerciseDistributionService = require('../../services/exerciseDistribution.service');
```

**Remove** the distribution tracking call (line 514):
```javascript
// DELETE:
await exerciseDistributionService.updateTrackingIncrementally(userId, exerciseData);
```

Keep the rest of the `log_workout` tool intact — workout logging itself continues, just without distribution tracking.

#### 5. BACKEND/agent/tools/index.js
**Remove** the preferences and goals tools imports and their inclusion in `TOOL_REGISTRY`:
```javascript
// DELETE imports:
const preferenceTools = require('./preferences');
const goalTools = require('./goals');

// DELETE from TOOL_REGISTRY spread:
...preferenceTools,
...goalTools,
```

#### 6. BACKEND/services/trainerWorkouts.service.js
**Replace** `fetchAllUserData` import and usage:

```javascript
// REPLACE import:
// OLD: const { fetchAllUserData } = require('./fetchUserData.service');
// NEW:
const { fetchMultipleDataSources } = require('./dataSources.service');
```

**In `generateWorkoutInstance()` (~line 413):**
```javascript
// OLD: const userData = await fetchAllUserData(userId);
// NEW:
const dataSources = await fetchMultipleDataSources(
  ['user_profile', 'user_settings', 'all_locations', 'workout_history'],
  userId
);
```
Update `buildWorkoutPrompt()` to accept the new data shape (keyed by source name with `.data` and `.formatted` fields).

**In `generateSwapExercise()` (~line 506):**
```javascript
// OLD: const userData = await fetchAllUserData(userId);
// NEW:
const dataSources = await fetchMultipleDataSources(
  ['user_profile', 'user_settings', 'all_locations', 'workout_history'],
  userId
);
```
Update `buildUserContextSummary()` to work with the new data shape. Remove the broken preferences code (lines 280-285) and any references to `userCategoryAndWeights`/`userMuscleAndWeight` (those dataSources entries no longer exist).

#### 7. BACKEND/services/contextBuilder.service.js
**Replace** `fetchAllUserData` import and usage:

```javascript
// REPLACE import:
// OLD: const { fetchAllUserData } = require('./fetchUserData.service');
// NEW:
const { fetchMultipleDataSources } = require('./dataSources.service');
```

**In `buildAgentContext()` (~line 649):**
```javascript
// OLD: const userData = await fetchAllUserData(userId);
// NEW:
const dataSources = await fetchMultipleDataSources(
  ['user_profile', 'user_settings', 'all_locations'],
  userId
);
```

**In `formatUserDataXml()` (lines 365-471):**
- Update to accept the new dataSources shape
- **Remove** category goals XML formatting (lines ~394-411)
- **Remove** muscle goals XML formatting
- **Remove** preferences XML formatting (lines ~442-467)
- **Keep** body stats, user settings, and locations formatting
- Adapt field access from `userData.data.fieldName` to `dataSources.source_name.data`

### Success Criteria:

#### Automated Verification:
- [x] Backend starts without errors: `cd BACKEND && node index.js`
- [x] No remaining `require()` references to deleted files: `grep -r "require.*recommend\|require.*preference\.service\|require.*categoryGoals\|require.*muscleGoals\|require.*interval\.service\|require.*exerciseLog\|require.*exerciseDistribution\|require.*fetchUserData\|require.*\/preferences\|require.*\/goals" BACKEND/ --include="*.js"`
- [x] Agent system initializes without errors (check startup logs)

#### Manual Verification:
- [ ] Start a trainer conversation — agent can still fetch user data via dataSources
- [ ] Start a workout session — trainerWorkouts generates exercises correctly
- [ ] Agent context building works — no errors in contextBuilder

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Supabase — Drop Orphaned Tables

### Overview
Drop 6 Supabase tables that have no remaining code consumers after the backend cleanup. Run the migration script in the Supabase SQL editor.

### Migration Script
**File**: `BACKEND/database/migrations/2026-02-05-drop-orphaned-tables.sql`

### Tables to Drop (6):

| Table | Reason | FK Dependencies |
|-------|--------|-----------------|
| `exercise_distribution_tracking` | All consumers removed (service, dataSources entry, exercises.js call) | `auth.users(id)` only — no other tables reference this |
| `preferences` | All consumers removed (service, agent tool, dataSources entry, fetchUserData) | `auth.users(id)` only — no other tables reference this |
| `user_category_and_weight` | All consumers removed (service, agent tool, dataSources entry, fetchUserData) | `auth.users(id)` only — no other tables reference this |
| `user_muscle_and_weight` | All consumers removed (service, agent tool, dataSources entry, fetchUserData) | `auth.users(id)` only — no other tables reference this |
| `preset_category` | Static reference data — no backend code references it | None. Sequence `preset_category_id_seq` dropped automatically |
| `preset_muscle` | Static reference data — no backend code references it | None. Sequence `preset_muscle_id_seq` dropped automatically |

### Tables NOT Dropped:
- **`workout_history`** — still read by `dataSources.service` for agent context, will get new write paths when exercise logging is rebuilt

### Success Criteria:

#### Automated Verification:
- [ ] SQL script executes without errors in Supabase SQL editor (manual — run after deploy)
- [ ] Tables no longer appear in Supabase table list (manual — run after deploy)
- [x] Backend still starts without errors: `cd BACKEND && node index.js`

#### Manual Verification:
- [ ] Agent conversations still work (no queries to dropped tables)

**Implementation Note**: Run this AFTER Phases 1-2 are deployed and verified. Back up data first if needed. Paste the SQL script into the Supabase SQL editor and execute.

---

## Phase 4: Frontend — Delete Obsolete Files

### Overview
Delete all Info screen files (except location-related ones), RefreshModalView, and WorkoutHistoryStore.

### Files to Delete (13 files):

**Info Views (7):**
- `Features/Info/Views/InfoView.swift`
- `Features/Info/Views/AddPreferenceSheet.swift`
- `Features/Info/Views/PreferenceManagerView.swift`
- `Features/Info/Views/CategoryGoalSetterView.swift`
- `Features/Info/Views/CategoryGoalsAIAssistSheet.swift`
- `Features/Info/Views/MuscleGoalSetterView.swift`
- `Features/Info/Views/MuscleGoalsAIAssistSheet.swift`

**Info Components (4):**
- `Features/Info/Components/ActivePreferencesSection.swift`
- `Features/Info/Components/EmptyPreferencesState.swift`
- `Features/Info/Components/CategoryGoalsSection.swift`
- `Features/Info/Components/MuscleGoalsSection.swift`

**Home (1):**
- `Features/Home/RefreshModalView.swift`

**Services (1):**
- `Services/WorkoutHistoryStore.swift`

### Files to KEEP in Features/Info/ (for Phase 4 relocation):
- `Views/LocationEditorView.swift`
- `Views/LocationMapPickerView.swift`
- `Views/LocationsListSheet.swift`
- `Components/CurrentLocationPill.swift`
- `Components/EquipmentInputView.swift`

### Success Criteria:

#### Automated Verification:
- [x] All 13 files deleted
- [x] Location files still exist in `Features/Info/`

#### Manual Verification:
- [ ] None — Phase 6 edits are required before the project can build

---

## Phase 5: Frontend — Relocate Location Files

### Overview
Move the 5 location-related files from `Features/Info/` to a new `Features/Locations/` directory.

### Changes Required:

Create directory structure:
```
Features/Locations/
  Views/
    LocationEditorView.swift
    LocationMapPickerView.swift
    LocationsListSheet.swift
  Components/
    CurrentLocationPill.swift
    EquipmentInputView.swift
```

Move files:
- `Features/Info/Views/LocationEditorView.swift` → `Features/Locations/Views/LocationEditorView.swift`
- `Features/Info/Views/LocationMapPickerView.swift` → `Features/Locations/Views/LocationMapPickerView.swift`
- `Features/Info/Views/LocationsListSheet.swift` → `Features/Locations/Views/LocationsListSheet.swift`
- `Features/Info/Components/CurrentLocationPill.swift` → `Features/Locations/Components/CurrentLocationPill.swift`
- `Features/Info/Components/EquipmentInputView.swift` → `Features/Locations/Components/EquipmentInputView.swift`

After moving, delete the now-empty `Features/Info/` directory.

### Success Criteria:

#### Automated Verification:
- [x] All 5 files exist in new `Features/Locations/` paths
- [x] `Features/Info/` directory no longer exists

#### Manual Verification:
- [ ] None — Xcode project references are updated in Phase 6

---

## Phase 6: Frontend — Edit Remaining Files

### Overview
Clean up all Swift files that reference deleted services, models, and views. Update navigation to replace Info screen with Locations.

### Changes Required:

#### 1. APIService.swift
**Remove** these methods (in order from bottom to top to preserve line numbers):
- `fetchDistributionMetrics()` (~lines 1416-1440)
- `resetDistributionTracking()` (~lines 1391-1414)
- `fetchWorkoutHistory()` (~lines 1341-1386)
- `deleteCompletedExercise()` (~lines 1314-1337)
- `logCompletedExercise()` (~lines 1279-1310)
- `parseMuscleGoals()` (~lines 1239-1272)
- `parseCategoryGoals()` (~lines 1195-1237)
- `parsePreference()` (~lines 1160-1193)
- `streamRecommendations()` (~lines 423-521)
- `fetchRecommendations()` (~lines 386-421)

Total: ~10 methods, ~400+ lines removed.

#### 2. APIModels.swift
**Remove** all structs for removed features:

Recommendation models (~lines 15-116):
- `ExerciseRecommendations`
- `RecommendAPIResponse`, `RecommendationData`, `RecommendationExercise`, `RecommendationMetadata`
- `StreamingMessage`, `StreamingExercise`

Preference models (~lines 231-261):
- `ParsePreferenceRequest`, `CurrentPreferenceContext`, `ParsePreferenceResponse`, `ParsedPreference`

Category goal models (~lines 264-292):
- `ParseCategoryGoalsRequest`, `CategoryGoalContext`, `ParseCategoryGoalsResponse`, `ParsedCategoryGoals`, `ParsedCategoryGoal`

Muscle goal models (~lines 295-310):
- `ParseMuscleGoalsRequest`, `ParseMuscleGoalsResponse`, `ParsedMuscleGoals`

Workout history models (~lines 313-329):
- `WorkoutHistoryAPIResponse`, `LogExerciseResponse`, `LoggedExerciseData`

#### 3. UserDataStore.swift
**Remove** all state, methods, and structs for preferences, category goals, and muscle goals:

State properties to remove:
- `categoryGoals: [CategoryGoalItem]` (line 17)
- `muscleGoals: [MuscleGoalItem]` (line 18)
- `preferences: [UserPreference]` (line 19)
- `isLoadingPreferences` (line ~25)

Methods to remove:
- `refreshCategoryGoals()` (lines 105-117)
- `fetchCategoryGoals()` (lines 119-136)
- `refreshMuscleGoals()` (lines 141-153)
- `fetchMuscleGoals()` (lines 155-171)
- `refreshPreferences()` (lines 176-188)
- `fetchPreferences()` (lines 190-218)
- `updateCategoryGoal()` (lines 224-230)
- `removeCategoryGoal()` (lines 233-235)
- `updateMuscleGoal()` (lines 238-244)
- `removeMuscleGoal()` (lines 247-249)
- `updatePreference()` (lines 252-258)
- `removePreference()` (lines 261-263)

Structs to remove:
- `CategoryGoalItem` (lines ~554-568)
- `UserPreferenceDB` (lines ~588-602)
- `UserPreference` (lines ~606-624)

Also remove any `MuscleGoalItem` struct if defined here.

#### 4. ExerciseStore.swift
**Remove:**
- `@Published var workoutHistoryIds: [UUID: String] = [:]` (line 23)
- `markExerciseCompleted(exerciseId:, workoutHistoryId:)` (lines 176-180)
- `markExerciseUncompleted(exerciseId:)` (lines 183-187)
- Remove `workoutHistoryIds` from `saveState()` (lines 89-108) and `loadState()` (lines 111-135)

**Keep** `completedExerciseIds` and all other workout session state.

#### 5. Exercise.swift
**Remove:**
- `init(from recommendation: RecommendationExercise)` (~lines 51-68)
- `init(from streamingExercise: StreamingExercise)` (~lines 72-144)

#### 6. AppView.swift
**Update navigation:**
- Remove `.info` case from navigation enum (or rename to `.locations`)
- Replace `InfoPageView()` (line 194) with a new `LocationsPageView()` wrapper
- Update menu item from "Preferences" label to "Locations" (line ~104-105)
- Create `LocationsPageView` wrapper struct (replaces `InfoPageView`) that presents `LocationsListSheet` or similar

#### 7. AppStateCoordinator.swift
**Remove:**
- `@Published var shouldFetchRecommendations: Bool = false` (line 68)
- Assignment to `false` (line 113)
- Reset to `false` in `reset()` (line 204)

#### 8. HomeView.swift
**Remove:**
- `.onChange(of: appCoordinator.shouldFetchRecommendations)` observer (lines 138-147)

#### 9. StatsView / History References
**Search** for any references to `WorkoutHistoryStore` and clean up:
- Remove `@EnvironmentObject` or `@StateObject` declarations for `WorkoutHistoryStore`
- Remove any `loadInitialHistory()` calls
- Remove or stub out any workout history display sections

This needs to be verified during implementation — the exact files referencing `WorkoutHistoryStore` should be found via grep.

### Success Criteria:

#### Automated Verification:
- [ ] No Swift compilation errors (checked in Phase 7)
- [ ] No references to deleted types: `grep -r "RecommendationExercise\|ExerciseRecommendations\|StreamingExercise\|ParsePreference\|ParseCategoryGoals\|ParseMuscleGoals\|WorkoutHistoryStore\|InfoView\|InfoContentView\|InfoPageView\|fetchRecommendations\|streamRecommendations\|logCompletedExercise\|deleteCompletedExercise\|fetchWorkoutHistory\|fetchDistributionMetrics\|resetDistributionTracking\|shouldFetchRecommendations" "AI Personal Trainer App/" --include="*.swift"`

#### Manual Verification:
- [ ] None until Phase 7 build

---

## Phase 7: Xcode Project Update & Build

### Overview
Update `project.pbxproj` to reflect all file deletions, relocations, and additions. Build and deploy to iPhone.

### Changes Required:

#### 1. project.pbxproj
**Remove** PBXFileReference and PBXBuildFile entries for all 13 deleted Swift files:
- InfoView.swift
- AddPreferenceSheet.swift
- PreferenceManagerView.swift
- CategoryGoalSetterView.swift
- CategoryGoalsAIAssistSheet.swift
- MuscleGoalSetterView.swift
- MuscleGoalsAIAssistSheet.swift
- ActivePreferencesSection.swift
- EmptyPreferencesState.swift
- CategoryGoalsSection.swift
- MuscleGoalsSection.swift
- RefreshModalView.swift
- WorkoutHistoryStore.swift

**Update** file references for 5 relocated location files (update path from `Features/Info/...` to `Features/Locations/...`):
- LocationEditorView.swift
- LocationMapPickerView.swift
- LocationsListSheet.swift
- CurrentLocationPill.swift
- EquipmentInputView.swift

**Update** PBXGroup entries:
- Remove the `Info` group (or update to only reference relocated files)
- Add `Locations` group with Views and Components subgroups

**Note:** It may be easier to remove and re-add the files via Xcode rather than manually editing pbxproj. If building from CLI, manual pbxproj edits are required.

#### 2. Build & Deploy
```bash
cd "/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App" && \
xcodebuild -project "AI Personal Trainer App.xcodeproj" \
  -scheme "AI Personal Trainer App" \
  -destination "id=00008120-001215180132201E" \
  -configuration Debug build
```

### Success Criteria:

#### Automated Verification:
- [ ] `xcodebuild` completes with **BUILD SUCCEEDED**
- [ ] No warnings related to missing files
- [ ] App installs on device: `xcrun devicectl device install app --device "00008120-001215180132201E" <app_path>`
- [ ] App launches: `xcrun devicectl device process launch --device "00008120-001215180132201E" "AI-PT-ORG.AI-Personal-Trainer-App"`

#### Manual Verification:
- [ ] App launches without crashes
- [ ] Home screen loads correctly (no recommendation UI, workout pills still work)
- [ ] Locations accessible from navigation menu
- [ ] Location editor works (add/edit/delete locations)
- [ ] Starting a workout session works end-to-end
- [ ] Stats view loads without crashes (workout history section gracefully empty or removed)
- [ ] Agent conversations work correctly

**Implementation Note**: After completing this phase and confirming build success, do a final grep sweep for any remaining references to deleted services/files.

---

## Testing Strategy

### Automated:
- Backend starts without errors
- iOS app builds without errors
- Grep sweep confirms no dangling references to removed services

### Manual Testing Steps:
1. Launch app on iPhone — verify no crash on startup
2. Navigate to Home — verify workout pills display, no recommendation UI
3. Navigate to Locations — verify location list, editor, and map picker work
4. Start a workout — verify trainer generates exercises
5. Complete an exercise — verify completion UI works (even without backend logging)
6. Open Stats — verify no crash (history may be empty)
7. Start an agent conversation — verify data fetching works
8. Check backend logs during above — verify no unhandled errors

## Performance Considerations

- Removing 7 services reduces backend memory footprint and startup time
- `dataSources.service` fetches only requested sources (selective), vs `fetchUserData` which fetched everything (monolithic) — migration improves per-request performance
- Frontend bundle size reduced by removing ~1000+ lines of dead Swift code

## Supabase Database Tables — Impact Analysis

### Tables to Drop (Phase 3)

6 tables are deleted via `BACKEND/database/migrations/2026-02-05-drop-orphaned-tables.sql`:

| Table | Previous Consumers | Why Safe to Drop |
|-------|-------------------|-----------------|
| `exercise_distribution_tracking` | exerciseDistribution.service, dataSources entry, exercises.js call | All consumers removed. No FK references from other tables. |
| `preferences` | preference.service, agent/tools/preferences.js, dataSources entry, fetchUserData | All consumers removed. No FK references from other tables. |
| `user_category_and_weight` | categoryGoals.service, agent/tools/goals.js, dataSources entry, fetchUserData | All consumers removed. No FK references from other tables. |
| `user_muscle_and_weight` | muscleGoals.service, agent/tools/goals.js, dataSources entry, fetchUserData | All consumers removed. No FK references from other tables. |
| `preset_category` | None (already orphaned) | Static reference data with no code consumers. |
| `preset_muscle` | None (already orphaned) | Static reference data with no code consumers. |

### Tables Remaining Active

| Table | Remaining Consumers | Notes |
|-------|-------------------|-------|
| `workout_history` | dataSources.service `workout_history` entry (read) | Read-only after exerciseLog removal. Will get new write paths when exercise logging is rebuilt. |
| `body_stats` | dataSources.service `user_profile` entry | Actively used |
| `user_locations` | dataSources.service `all_locations` entry | Actively used |
| `user_settings` | dataSources.service `user_settings` entry | Actively used |
| `app_user` | Core user table | Actively used |
| All `trainer_*` tables | Active trainer system | Untouched |
| All `agent_*` tables | Active agent system | Untouched |

## Migration Notes

- **6 Supabase tables dropped** — via migration script `BACKEND/database/migrations/2026-02-05-drop-orphaned-tables.sql`, run in Phase 3
- **No API versioning needed** — frontend and backend are deployed together
- **Agent tools**: `preferences.js` and `goals.js` removed. `exercises.js` `log_workout` tool still works but no longer tracks distribution. `data.js` tool still works via `dataSources.service`.

## References

- Research document: `thoughts/shared/research/2026-02-05-backend-service-cleanup.md`
- App architecture: `thoughts/shared/research/2026-02-01-app-architecture-plain-english.md`
- Metering research: `thoughts/shared/research/2026-02-04-llm-usage-metering-and-guardrails.md`
