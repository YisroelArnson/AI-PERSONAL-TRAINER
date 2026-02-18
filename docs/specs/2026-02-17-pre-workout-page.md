# Pre-Workout Page Redesign — Spec

**Date:** 2026-02-17
**Status:** Draft
**Scope:** iOS (PreWorkoutSheet, HomeView, WorkoutStore) + Backend (new intent-to-plan endpoint)
**Design reference:** `docs/designs/artifacts/design-schema.json` — all UI must follow this schema's tokens, components, and principles.

---

## Overview

Redesign the pre-workout flow into two distinct entry points:

1. **Planned Workout** — User taps the workout pill for a scheduled calendar session. Opens a full-height sheet pre-populated with intent data (focus, notes, duration) from the planned session. User can review/edit before generating.
2. **New Workout (from scratch)** — User taps the `+` button on the home screen and selects "Generate New Workout." Opens an intent specification page where the user describes what they want. This intent is sent to a new backend endpoint that returns a structured plan (focus, notes, duration_min). The structured plan is then displayed on the same pre-workout review page for final edits before generating.

Energy level and soreness selectors are removed from the pre-workout flow.

---

## Decision Addendum (Locked)

> **Date:** 2026-02-18
> **Status:** Accepted

The following product decisions are locked for implementation:

1. Use existing `POST /trainer/calendar/events` for ad-hoc workout event creation (do not add a redundant `create-for-workout` endpoint).
2. `POST /trainer/workouts/sessions` accepts explicit `calendar_event_id` and `planned_session_id` so session linkage is deterministic.
3. `plannedIntentEdited` includes **only changed fields**.
4. No backward compatibility fallback for legacy `intent_json` (`intensity`) is required.
5. Remove the readiness pipeline entirely (energy/soreness/pain removed from request + prompt context).
6. Use `intent: "user_specified"` for scratch flow; remove `"quick_request"` usage.
7. If ad-hoc event creation succeeded but workout generation fails, delete the created event/planned-session.
8. Pre-workout sheet is `.presentationDetents([.large])` only, with swipe-to-dismiss enabled.
9. "Add New Location" opens location creation sheet; location management (add/view/edit) is expanded as part of this redesign.
10. Remove the bottom "New" pill on Home. Custom workout entry is only via top-right `+` menu. If an active workout exists, selecting "Generate custom workout" shows discard confirmation first.

---

## Entry Points

### 1. Planned Workout (from WorkoutPill)

**Trigger:** User taps the workout pill at the bottom of HomeView when a scheduled calendar event exists for today.

**Behavior:** Opens the **Pre-Workout Review Page** as a full-height sheet (`.presentationDetents([.large])`), pre-populated with data from the planned session's `intent_json`:

| Field | Source | Editable |
|---|---|---|
| Title | `intent_json.focus` | Yes (inline text field) |
| Description | `intent_json.notes` | Yes (inline text field) |
| Duration | `intent_json.duration_min` | Yes (number wheel picker) |
| Location | `UserDataStore.currentLocation` | Yes (dropdown menu) |

### 2. New Workout (from + menu)

**Trigger:** User taps the existing `+` button in the top-right of the ThinTopBar (in `AppView.swift`) and selects "Generate custom workout" from the dropdown.

**Behavior:** Opens a single full-height sheet containing the **Intent Specification Page** (Screen A). After the user submits their intent, Screen A crossfades to the **Pre-Workout Review Page** (Screen B) with shimmer loading until the backend responds.

---

## Sheet Architecture

Both Screen A and Screen B live inside a **single `.sheet()` presentation**. This avoids the SwiftUI limitation where dismissing one sheet and presenting another in the same render cycle fails.

**Implementation:** A single `showPreWorkoutSheet: Bool` controls the sheet. Inside the sheet, an `enum PreWorkoutPage { case intent, review }` state variable determines which screen is displayed. Transitions between pages use a **crossfade animation** (`.transition(.opacity)` with `withAnimation(AppTheme.Animation.slow)`):

- **Screen A → Screen B:** Screen A fades out, Screen B fades in (triggered by "Plan My Workout" or when opening a planned workout directly)
- **Screen B → Screen A (back):** Screen B fades out, Screen A fades in (triggered by back chevron; `intentText` is preserved)

For planned workouts, the sheet opens directly on Screen B (the `PreWorkoutPage` starts as `.review`). For new workouts from the + menu, it starts on `.intent`.

```swift
// Single sheet on HomeView
.sheet(isPresented: $workoutStore.showPreWorkoutSheet) {
    PreWorkoutSheet()  // Contains both screens internally
        .presentationDetents([.large])
}

// Inside PreWorkoutSheet:
@State private var currentPage: PreWorkoutPage = .intent

var body: some View {
    ZStack {
        if currentPage == .intent {
            IntentSpecificationPage(...)
                .transition(.opacity)
        } else {
            PreWorkoutReviewPage(...)
                .transition(.opacity)
        }
    }
    .animation(AppTheme.Animation.slow, value: currentPage)
}
```

---

## Screen Designs

> **Design guidance:** All UI follows `docs/designs/artifacts/design-schema.json`. Use `AppTheme` tokens throughout — no hardcoded colors, no shadows, no borders. The interface is monochrome (black/white). The only color in the app is the AI orb gradient.

### Screen A: Intent Specification Page

Presented as a full-height bottom sheet (`.presentationDetents([.large])`).

**Layout (top to bottom):**

```
┌─────────────────────────────────────┐
│  ○ drag indicator                   │  handle: 36x4, tertiaryText, 2px radius
│                                     │
│                                     │
│  Describe your workout,             │  aiMessageLarge (19px, 400, 1.55 lh)
│  I'll build a personalized plan.    │  primaryText
│                                     │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ E.g., "I want to do legs     │  │  TextEditor, surface bg
│  │ today, about 45 minutes,     │  │  medium border-radius (11px)
│  │ focus on glutes and          │  │  padding: 14px 16px
│  │ hamstrings."                 │  │  font: bodyText (14px, 400)
│  │                              │  │  placeholder: tertiaryText
│  │                              │  │  typed text: primaryText
│  │                              │  │
│  │                              │  │  min height: ~200px
│  │                              │  │  grows with content
│  └───────────────────────────────┘  │
│                                     │
│              [ 🎤 ]                 │  iconButton medium: 50x50
│                                     │  surface bg, full radius
│                                     │  mic.fill icon, 20px, primaryText
│                                     │
│  ┌───────────────────────────────┐  │
│  │      Plan My Workout          │  │  primaryButton: accent bg, background text
│  └───────────────────────────────┘  │  pill radius (44px), 16px 20px padding
│                                     │  button font (15px, 600)
│                                     │  disabled state: accent @ 0.4 opacity
│                                     │  disabled when intentText is empty
└─────────────────────────────────────┘
```

**Component details:**

| Element | Design token | Specifics |
|---|---|---|
| Sheet background | `AppTheme.Colors.background` | `#000` dark / `#FFF` light |
| Drag indicator | `bottomSheet.handle` | 36x4px, `tertiaryText`, 2px radius, 20px bottom margin |
| Header text | `AppTheme.Typography.aiMessageLarge` | 19px, weight 400, line-height 1.55. Color: `primaryText`. Left-aligned. |
| Text input area | Similar to `chatInput` | `surface` background, `medium` border-radius (11px). Padding: 14px 16px. Font: 14px regular (`bodyText`). Multiline `TextEditor`. Min height ~200px. |
| Placeholder text | `cardSubtitle` style | 13px, weight 400, `tertiaryText`. Disappears on focus. Text: `E.g., "I want to do legs today, about 45 minutes, focus on glutes and hamstrings."` |
| Mic button | `iconButton` medium | 50x50px, `surface` bg, `full` radius. Icon: `mic.fill`, 20px, `primaryText`. Centered horizontally below the text area. Placeholder — no speech-to-text wired yet. |
| "Plan My Workout" button | `primaryButton` | Full-width. `accent` bg, `background` text color. `pill` radius (44px). Padding: 16px vertical, 20px horizontal. Font: 15px weight 600. Pinned to bottom with 32px bottom padding. |
| Disabled state | — | When `intentText` is empty, button opacity drops to 0.4 and tap is ignored. |

**Spacing:**
- Screen horizontal padding: 20px (`screenPadding.horizontal`)
- Header top padding: 24px
- Gap between header and text input: 24px (`spacing.5xl`)
- Gap between text input and mic: 16px (`spacing.3xl`)
- Gap between mic and button: 16px
- Button bottom padding: 32px

### Screen B: Pre-Workout Review Page

Presented as a full-height bottom sheet (`.presentationDetents([.large])`).

**Layout (top to bottom):**

```
┌─────────────────────────────────────┐
│  ‹                                  │  back chevron: iconButton standard (44x44)
│  (only if arrivedFromIntentPage)    │  surface bg, full radius
│                                     │  chevron.left, 18px, primaryText
│                                     │
│  Lower Body - Quads,                │  editable TextField
│  Hamstrings, Glutes                 │  screenTitle (17px, 600), primaryText
│                                     │  no border, transparent bg
│                                     │
│  Master movement patterns           │  editable TextEditor
│  before adding heavy load,          │  aiMessageMedium (16px, 400, 1.55 lh)
│  prioritize form over weight        │  secondaryText
│                                     │  no border, transparent bg
│                                     │
│  ┌───────────────────────────────┐  │
│  │  This session should take     │  │  surface bg card
│  │  [ 50 ✏ ] minutes            │  │  large radius (15px), padding 14px 16px
│  └───────────────────────────────┘  │  text: bodyText (14px), secondaryText
│                                     │  "50" in highlight bg chip (4px radius)
│                                     │  pencil icon: 12px, tertiaryText
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Built around your            │  │  surface bg card
│  │  [ Home ▾ ] location          │  │  large radius (15px), padding 14px 16px
│  └───────────────────────────────┘  │  text: bodyText (14px), secondaryText
│                                     │  "Home" in highlight bg chip (4px radius)
│                                     │  chevron.down: 10px, tertiaryText
│                                     │
│                                     │
│  ┌───────────────────────────────┐  │
│  │        Get Started             │  │  primaryButton: accent bg, background text
│  └───────────────────────────────┘  │  pill radius, 16px 20px padding
│                                     │  play.fill icon (16px) + text (15px, 600)
└─────────────────────────────────────┘
```

**Component details:**

| Element | Design token | Specifics |
|---|---|---|
| Sheet background | `AppTheme.Colors.background` | `#000` dark / `#FFF` light |
| Back chevron | `iconButton` standard | 44x44px, `surface` bg, `full` radius. Icon: `chevron.left`, 18px, `primaryText`. Top-left, 20px from edges. **Only visible when `arrivedFromIntentPage == true`.** Hidden for planned workout flow. |
| Title field | `AppTheme.Typography.screenTitle` | 17px, weight 600, `primaryText`. Editable `TextField` with transparent background, no border. Left-aligned. Horizontal padding 20px. |
| Description field | `AppTheme.Typography.aiMessageMedium` | 16px, weight 400, line-height 1.55, `secondaryText`. Editable multiline `TextEditor` with transparent background, no border. Left-aligned. Horizontal padding 20px. |
| Duration card | `surface` bg, `large` radius (15px) | Padding: 14px 16px. Full-width within 20px horizontal margins. |
| Duration label text | `bodyText` (14px, 400) | Color: `secondaryText`. Text: "This session should take {N} minutes" |
| Duration chip (the number) | `statHighlight` | Inline-flex, `highlight` bg (`rgba(255,255,255,0.1)` dark), 4px radius, padding 0 5px. Font: 14px weight 600, `primaryText`. Tapping opens a `.wheel` Picker (range 10–120, step 5). |
| Duration pencil icon | — | SF Symbol `pencil`, 12px, `tertiaryText`. Placed immediately after the number chip. Indicates editability. |
| Location card | `surface` bg, `large` radius (15px) | Padding: 14px 16px. Full-width within 20px horizontal margins. |
| Location label text | `bodyText` (14px, 400) | Color: `secondaryText`. Text: "Built around your {Location} location" |
| Location chip (the name) | `statHighlight` | Same style as duration chip. `highlight` bg, 4px radius, padding 0 5px. Font: 14px weight 600, `primaryText`. Contains location name + `chevron.down` (10px, `tertiaryText`). |
| Location menu | SwiftUI `Menu` | Triggered by tapping the location chip. Lists user's saved locations as menu items. Last item: "Add New Location" which opens the location creation sheet. |
| "Get Started" button | `primaryButton` | Full-width. `accent` bg, `background` text. `pill` radius (44px). Padding: 16px vertical, 20px horizontal. Icon: `play.fill` 16px + text "Get Started" 15px weight 600, gap 8px. Pinned to bottom with 32px bottom padding. |
| Disabled "Get Started" | — | During loading state: `accent` at 0.7 opacity, tap ignored. |

**Spacing:**
- Screen horizontal padding: 20px
- Back button top/left: 20px
- Title top padding: 24px (or 12px below back button if present)
- Gap between title and description: 8px (`spacing.md`)
- Gap between description and duration card: 24px (`spacing.5xl`)
- Gap between duration card and location card: 12px (`spacing.xl`)
- Gap between location card and button: flex (Spacer pushes button to bottom)
- Button bottom padding: 32px

**Loading state (when arriving from Screen A):**

When `isLoadingIntentPlan == true`, the content area shows shimmer skeletons instead of real data:

| Element | Shimmer style |
|---|---|
| Title | Rounded rectangle, `surface` bg, 60% width, 20px height. Shimmer animation: `highlight` color sweep left-to-right, 1.5s loop. |
| Description | Two rounded rectangles stacked, `surface` bg, 90% and 70% width, 14px height each, 6px gap. Same shimmer animation. |
| Duration card | Full card is `surface` bg. Number area replaced with a small shimmer rectangle (40px wide). Label text still visible. |
| Location card | Fully visible (location is known client-side from `UserDataStore`, not from backend). |
| "Get Started" button | Disabled (accent at 0.7 opacity). |

Once data arrives, shimmers fade out and real content fades in using `AppTheme.Animation.slow` (implicit animation).

**Error state:**

When `intentPlanError != nil`, the entire content area (between back button and CTA) is replaced with a centered error view:

| Element | Design token | Specifics |
|---|---|---|
| Icon | SF Symbol `face.dashed` | 48px, `tertiaryText` |
| Error text | `aiMessageMedium` (16px, 400) | `secondaryText`. Text: "Something went wrong. Please try again." Centered, max 250px width. |
| Gap icon → text | 16px | |
| "Retry" button | `primaryButton` small variant | `accent` bg, `background` text. Padding: 12px 20px. Font: 14px weight 600. `pill` radius. |
| Gap text → button | 20px | |
| Back chevron | Still visible | User can go back to Screen A to adjust intent. |
| "Get Started" button | Hidden | Not shown during error state. |

### Home Screen: Existing + Menu (ThinTopBar)

The `+` button already exists in the top-right corner of the `ThinTopBar` (`AppView.swift:141`). It has a dropdown `Menu` with three options:
- "Generate custom workout" (`sparkles` icon) — posts `.showQuickWorkoutSheet`
- "Schedule a workout" (`calendar` icon) — posts `.showScheduleWorkoutSheet`
- "Start a run" (`figure.run` icon) — posts `.showStartRunSheet`

**Change:** The "Generate custom workout" option currently triggers `workoutStore.startCustomSession()` (which opens the old pre-workout sheet). Update the `.showQuickWorkoutSheet` handler in `HomeView.swift` to call `workoutStore.startNewWorkout()` instead, which opens Screen A (Intent Specification Page).

**Active workout guard:** If an active workout exists and user selects "Generate custom workout" from `+`, show discard confirmation first. On confirm, discard and continue to `startNewWorkout()`. On cancel, do nothing.

**Bottom bar update:** Remove the bottom "New" button from HomeView. Bottom bar remains smooth with:
- `ResumePill` when workout is active/persisted
- Regular `WorkoutPill` when no active workout

---

## Data Flow

### Planned Workout Flow

```
HomeView → tap WorkoutPill
  → WorkoutStore.startPlannedSession(calendarEvent)
    → Set sessionStatus = .preWorkout
    → Pre-fill: title (focus), description (notes), duration (duration_min), location
    → Present Screen B (Pre-Workout Review Page)
  → User reviews/edits fields
  → Tap "Get Started"
    → WorkoutStore.generateWorkout()
      → POST /trainer/workouts/sessions
        Body includes:
        {
          force_new: true,
          calendar_event_id: <planned event id>,
          planned_session_id: <linked planned session id>
        }
      → POST /trainer/workouts/sessions/{id}/generate
        Body includes:
        {
          intent: "planned",
          timeAvailableMin: <edited duration>,
          equipment: <location equipment>,
          requestText: null,
          plannedIntentOriginal: <original intent_json>,   // NEW
          plannedIntentEdited: <edited fields only if changed>  // NEW
        }
      → Receive WorkoutInstance → transition to .active
```

### New Workout Flow

```
ThinTopBar → tap + → "Generate custom workout"
  → Present Screen A (Intent Specification Page)
  → User types/speaks intent
  → Tap "Plan My Workout"
    → POST /trainer/workouts/plan-intent
      Body: { intentText: "I want to do legs, 45 min, focus glutes" }
    → Transition to Screen B with shimmer loading
    → Backend responds: { focus, notes, duration_min }
    → Populate Screen B fields
  → User reviews/edits fields
  → Tap "Get Started"
    → POST /trainer/calendar/events (create calendar event + planned session)  // NEW
      Body includes:
      {
        event_type: "workout",
        start_at: now,
        title: <focus>,
        status: "scheduled",
        source: "user_created",
        intent_json: { focus, notes, duration_min }
      }
    → WorkoutStore.generateWorkout()
      → POST /trainer/workouts/sessions
        Body includes:
        {
          force_new: true,
          calendar_event_id: <new event id>,
          planned_session_id: <new planned session id>
        }
      → POST /trainer/workouts/sessions/{id}/generate
        Body includes:
        {
          intent: "user_specified",
          timeAvailableMin: <duration>,
          equipment: <location equipment>,
          requestText: <original intent text>,
          plannedIntentOriginal: { focus, notes, duration_min },
          plannedIntentEdited: <edited fields only if changed>
        }
      → Receive WorkoutInstance → transition to .active
      → On generation failure after ad-hoc event creation:
        DELETE /trainer/calendar/events/{eventId}?cascade_planned=true
```

---

## Backend Changes

### New Endpoint: `POST /trainer/workouts/plan-intent`

**Purpose:** Takes a free-text intent string from the user and returns a structured plan matching the `intent_json` format used by planned sessions.

**Route:** `BACKEND/routes/trainerWorkouts.routes.js`
**Controller:** `BACKEND/controllers/trainerWorkouts.controller.js` → `planIntent()`
**Service:** `BACKEND/services/trainerWorkouts.service.js` → `generateIntentPlan()`

**Request:**
```json
{
  "intentText": "I want to do legs today, about 45 minutes, focus on glutes and hamstrings"
}
```

**Response (success):**
```json
{
  "success": true,
  "plan": {
    "focus": "Lower Body - Glutes & Hamstrings",
    "notes": "Focus on glute and hamstring development with compound movements",
    "duration_min": 45
  }
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Failed to generate plan from intent"
}
```

**Implementation details:**

- Calls `getActiveProgram(userId)` to include the user's training program as context
- Calls `fetchMultipleDataSources(userId, ['user_profile', 'all_locations'])` for user context
- Builds a prompt with a **special instruction** that the user is specifying a specific workout they want right now, and the AI should prioritize the user's intent over the program structure
- Calls Claude (same model as workout generation: `claude-haiku-4-5`) with max_tokens ~512 (small structured response)
- Returns the structured plan

**Prompt structure:**
```
You are an AI personal trainer assistant. The user wants to plan a specific workout session.

User's training program (for context only — prioritize the user's stated intent):
{program_markdown}

User context:
{user_context_summary}

The user said: "{intentText}"

Based on their request, generate a structured session plan. Return ONLY valid JSON:
{
  "focus": "Short title for the session (e.g., 'Lower Body - Glutes & Hamstrings')",
  "notes": "1-2 sentence description of the session's intent and approach",
  "duration_min": <number>
}

Rules:
- The focus should be a clear, descriptive title
- The notes should capture the user's intent and any specific instructions
- The duration_min should match what the user requested, or default to 45 if unspecified
- Prioritize the user's specific request over the general program plan
```

### Existing Calendar Endpoint Usage (Ad-Hoc Flow)

**Decision:** Reuse existing `POST /trainer/calendar/events` for ad-hoc creation. Do not add `create-for-workout`.

**Request payload (from iOS intent flow):**
```json
{
  "event_type": "workout",
  "start_at": "now",
  "title": "Lower Body - Glutes & Hamstrings",
  "status": "scheduled",
  "source": "user_created",
  "intent_json": {
    "focus": "Lower Body - Glutes & Hamstrings",
    "notes": "Focus on glute and hamstring development",
    "duration_min": 45
  }
}
```

**Expected behavior:** Existing `createEvent` path creates and links:
1. `trainer_calendar_events` row
2. `trainer_planned_sessions` row (because `intent_json` is present)
3. `linked_planned_session_id` on event

Return remains `{"success": true, "event": ...}` with embedded planned session as defined by current API.

### Session Creation Endpoint Extension

**Endpoint:** `POST /trainer/workouts/sessions`

Add optional request fields:
- `calendar_event_id` (string)
- `planned_session_id` (string)

When provided, `createOrResumeSession()` must pass these IDs through to `getOrCreateSession()/createSession()` and skip `findTodayWorkoutEvent()` auto-linking for deterministic association.

### New Endpoint: Ad-Hoc Rollback Delete

**Purpose:** If ad-hoc event/planned-session creation succeeds but workout generation fails, delete the just-created event.

**Endpoint:** `DELETE /trainer/calendar/events/:id?cascade_planned=true`

**Behavior:**
- Deletes calendar event
- Deletes linked planned session when `cascade_planned=true`
- Returns `{ success: true }`

### Modifications to Existing Endpoints

**`POST /trainer/workouts/sessions/{id}/generate`** — Accept additional fields:
- `plannedIntentOriginal` (object, optional) — The original planned intent before user edits
- `plannedIntentEdited` (object, optional) — The user's edited version (**only changed fields**, and only sent when any field changed)

Controller wiring explicitly includes:
- Destructure `plannedIntentOriginal` and `plannedIntentEdited` from `req.body`
- Add to constraints map:
  - `planned_intent_original: plannedIntentOriginal || null`
  - `planned_intent_edited: plannedIntentEdited || null`
- Remove readiness extraction from this endpoint (`readiness` is removed from the flow)

**`buildWorkoutPrompt()`** — Add to the Pre-Workout Context section:
```
- Original Planned Intent: {JSON}
- User Modified Intent: {JSON} (user changed these fields from the original plan)
```

Also remove readiness language from prompt context:
- Remove Energy Level line
- Remove Soreness line
- Remove Pain line

---

## iOS Changes

### WorkoutStore Changes

**New properties:**
```swift
// Pre-workout review fields
var preWorkoutTitle: String = ""
var preWorkoutDescription: String = ""
var preWorkoutDurationMin: Int = 45

// Track original values for change detection
var originalTitle: String = ""
var originalDescription: String = ""
var originalDurationMin: Int = 45

// Intent flow state
var intentText: String = ""
var isLoadingIntentPlan: Bool = false
var intentPlanError: String? = nil

// Sheet & page navigation (single sheet, internal crossfade)
var showPreWorkoutSheet: Bool = false              // Controls the single sheet
var preWorkoutPage: PreWorkoutPage = .intent       // Which page is visible inside the sheet
var arrivedFromIntentPage: Bool = false             // Tracks if user came from Screen A (for back button)
```

**Remove:** `energyLevel` property (no longer collected in pre-workout flow).

**Modified `startPlannedSession(calendarEvent:)`:**
```swift
func startPlannedSession(calendarEvent: CalendarEvent) {
    reset()
    sessionStatus = .preWorkout

    // Pre-fill from planned session intent_json
    let intent = calendarEvent.plannedSession?.intentJson
    preWorkoutTitle = intent?["focus"]?.stringValue ?? calendarEvent.title ?? "Today's Workout"
    preWorkoutDescription = intent?["notes"]?.stringValue ?? ""
    preWorkoutDurationMin = intent?["duration_min"]?.intValue ?? 45

    // Store originals for change detection
    originalTitle = preWorkoutTitle
    originalDescription = preWorkoutDescription
    originalDurationMin = preWorkoutDurationMin

    selectedLocation = UserDataStore.shared.currentLocation
    arrivedFromIntentPage = false
    preWorkoutPage = .review       // Start directly on Screen B
    showPreWorkoutSheet = true
}
```

**New `startNewWorkout()`:**
```swift
func startNewWorkout() {
    reset()
    sessionStatus = .preWorkout
    selectedLocation = UserDataStore.shared.currentLocation
    preWorkoutPage = .intent       // Start on Screen A
    showPreWorkoutSheet = true
}
```

**New `submitIntent()`:**
```swift
func submitIntent() async {
    arrivedFromIntentPage = true
    isLoadingIntentPlan = true
    intentPlanError = nil
    withAnimation(AppTheme.Animation.slow) {
        preWorkoutPage = .review   // Crossfade from Screen A → Screen B (with shimmer)
    }

    do {
        let plan = try await apiService.planIntent(intentText: intentText)
        preWorkoutTitle = plan.focus
        preWorkoutDescription = plan.notes
        preWorkoutDurationMin = plan.durationMin

        // Store as originals (user can still edit on Screen B)
        originalTitle = preWorkoutTitle
        originalDescription = preWorkoutDescription
        originalDurationMin = preWorkoutDurationMin

        isLoadingIntentPlan = false
    } catch {
        intentPlanError = "Something went wrong. Please try again."
        isLoadingIntentPlan = false
    }
}
```

**New `retryIntentPlan()`:**
```swift
func retryIntentPlan() async {
    await submitIntent()
}
```

**Modified `generateWorkout()`:**
- Remove readiness from request entirely (no energy/soreness/pain fields)
- Add `plannedIntentOriginal` and `plannedIntentEdited` (`plannedIntentEdited` includes changed fields only)
- If `arrivedFromIntentPage`, first call existing `createCalendarEvent(..., intentJson: ...)`
- Capture returned `event.id` and `plannedSession.id`, then pass both IDs into `createOrResumeWorkoutSession(...)`
- If generation fails after ad-hoc event creation, call `deleteCalendarEvent(eventId, cascadePlanned: true)` for rollback cleanup
- Use `intent = "user_specified"` for intent flow; remove `quick_request`

**Modified `reset()`:**
- Clear all new properties (`preWorkoutTitle`, `preWorkoutDescription`, `intentText`, etc.)

### New Views

**Refactored `PreWorkoutSheet.swift`** — Single sheet container with internal crossfade
- Located at: `AI Personal Trainer App/Features/Home/PreWorkoutSheet.swift` (replace existing file)
- Contains a `ZStack` that switches between Screen A and Screen B based on `workoutStore.preWorkoutPage`
- Transitions use `.transition(.opacity)` with `withAnimation(AppTheme.Animation.slow)` for crossfade
- New enum: `enum PreWorkoutPage { case intent, review }`

**`IntentSpecificationView.swift`** (Screen A content)
- Located at: `AI Personal Trainer App/Features/Home/IntentSpecificationView.swift`
- Header text, multiline text editor, mic button (placeholder), "Plan My Workout" button
- Extracted as a separate View but rendered inside `PreWorkoutSheet`

**`PreWorkoutReviewView.swift`** (Screen B content)
- Located at: `AI Personal Trainer App/Features/Home/PreWorkoutReviewView.swift`
- Editable title field, editable description field, duration chip with wheel picker, location dropdown with menu, "Get Started" button
- Shimmer loading state for when arriving from intent flow
- Error state with retry
- Back chevron (when `arrivedFromIntentPage == true`) — triggers crossfade back to Screen A

**Back button behavior:** Tapping the back chevron on Screen B crossfades back to Screen A:
```swift
withAnimation(AppTheme.Animation.slow) {
    workoutStore.preWorkoutPage = .intent  // Crossfade Screen B → Screen A
}
// intentText is preserved on WorkoutStore, so Screen A still shows the user's text
```

### HomeView Changes

- Keep the existing `.sheet(isPresented: $workoutStore.showPreWorkoutSheet)` — it now presents the refactored `PreWorkoutSheet` which handles both screens internally
- Change the `.showQuickWorkoutSheet` notification handler from `workoutStore.startCustomSession()` to `workoutStore.startNewWorkout()` (which opens the sheet starting on Screen A)
- Remove bottom "New" button from the bottom bar
- If active workout exists and `.showQuickWorkoutSheet` fires, show discard confirmation before starting new flow

### APIService Changes

**New method:**
```swift
func planIntent(intentText: String) async throws -> IntentPlanResponse {
    // POST /trainer/workouts/plan-intent
    // Body: { "intentText": intentText }
    // Returns: { success, plan: { focus, notes, duration_min } }
}
```

**Modified method:**
```swift
func createOrResumeWorkoutSession(
    forceNew: Bool,
    coachMode: String? = nil,
    calendarEventId: String? = nil,
    plannedSessionId: String? = nil
) async throws -> WorkoutSessionResponse
```

**New method:**
```swift
func deleteCalendarEvent(eventId: String, cascadePlanned: Bool) async throws
```

**Modified `generateWorkoutInstance()`:**
- Accept `plannedIntentOriginal` and `plannedIntentEdited` in the request body
- Remove readiness from `WorkoutGenerateRequest`

### New Models

```swift
struct IntentPlanResponse: Codable {
    let success: Bool
    let plan: IntentPlan
}

struct IntentPlan: Codable {
    let focus: String
    let notes: String
    let durationMin: Int
}

// IntentPlan maps duration_min -> durationMin via CodingKeys
```

---

## Removals

### Energy Level — Full Removal

Energy level is no longer collected anywhere in the pre-workout flow. Remove all references across the stack:

**iOS:**

| File | What to remove |
|---|---|
| `WorkoutStore.swift:76` | `var energyLevel: Int = 3` property |
| `WorkoutStore.swift:211` | `WorkoutReadiness(energy: String(energyLevel), ...)` — stop constructing readiness with energy. Send `readiness: nil` or omit from request. |
| `WorkoutStore.swift:633` | `energyLevel = 3` in `reset()` |
| `PreWorkoutSheet.swift:156–189` | Entire energy level selector UI (the 1–5 buttons in `readinessCard`). This file is being replaced by `PreWorkoutReviewPage.swift` so it goes away naturally. |
| `WorkoutSessionModels.swift:111–114` | `WorkoutReadiness` struct — remove `energy` field. Keep the struct if `soreness`/`pain` are still used elsewhere, otherwise delete entirely. |
| `WorkoutSessionModels.swift:98` | `readiness: WorkoutReadiness?` in `WorkoutGenerateRequest` — remove this field. |

**Backend:**

| File | What to remove |
|---|---|
| `trainerWorkouts.controller.js:55` | Stop extracting `readiness` from `req.body` |
| `trainerWorkouts.controller.js:72–73` | Remove `energy_level: readiness?.energy ?? null` and `readiness: readiness || {}` from `constraints` |
| `trainerWorkouts.service.js:295` | Remove `const energyLevel = constraints?.energy_level ?? constraints?.readiness?.energy ?? 'unknown'` |
| `trainerWorkouts.service.js:326` | Remove `- Energy Level: ${energyLevel}/5` from the prompt template |
| `agent/tools/exercises.js:28–30` | Remove `energy_level` parameter definition from the tool schema |
| `agent/tools/exercises.js:54` | Remove `energy_level: args.energy_level || null` from constraints |
| `agent/tools/exercises.js:12` | Update description to remove "energy level" mention |

**Backend Stats (keep but stop populating):**

The stats calculator reads `energy_level` from session metadata for historical tracking. Since we're no longer sending it, new sessions will have `energy_rating: null`. The code can stay — it handles null gracefully already. No changes needed to:
- `statsCalculator.service.js:75, 87, 157–159, 194`
- `statsCalculator.test.js:27, 86, 91, 135`

### Other Removals

- **Soreness indicator** — Not currently in UI, but ensure it's not added.
- **Time preset buttons** — Replace with the duration chip + wheel picker.
- **Equipment display** — Remove from pre-workout page (equipment is still sent to the backend from the selected location, just not displayed).
- **Custom request text field** — Replaced by the intent specification page (Screen A).
- **`isCustomWorkout` parameter** — No longer needed. The two flows are distinguished by `arrivedFromIntentPage`.
- **`showPreWorkoutSheet` in WorkoutStore** — Kept. Now controls the single sheet that contains both Screen A and Screen B.
- **`customRequestText` in WorkoutStore** — Replaced by `intentText`.

---

## Unit Tests

### Backend Tests (Jest)

**File:** `BACKEND/__tests__/workoutIntentPlan.test.js` — New

| # | Test | What it verifies |
|---|---|---|
| 1 | `planIntent returns focus, notes, duration_min from intent string` | `generateIntentPlan()` calls Claude with the intent text and returns a properly structured `{ focus, notes, duration_min }` response |
| 2 | `planIntent includes user program in prompt context` | The prompt sent to Claude includes the user's active program markdown |
| 3 | `planIntent includes user profile data in prompt context` | The prompt includes user context (body stats, equipment, etc.) |
| 4 | `planIntent returns 400 if intentText is missing` | Controller returns 400 error when no intent text provided |
| 5 | `planIntent returns 500 with error message if Claude call fails` | Error from Anthropic API is caught and returned as `{ success: false, error: "..." }` |
| 6 | `planIntent defaults duration_min to 45 when Claude omits it` | If the parsed JSON lacks `duration_min`, defaults to 45 |
| 7 | `planIntent handles malformed JSON from Claude gracefully` | If Claude returns invalid JSON, the endpoint returns an error |
| 8 | `planIntent works with no active program` | When `getActiveProgram` returns null, still generates a valid plan from intent alone |
| 9 | `planIntent extracts JSON from Claude response with surrounding text` | Claude returns `"Here's the plan: {...} Let me know"` — `extractJson` still parses it |
| 10 | `planIntent defaults focus to "Custom Workout" when Claude omits it` | If parsed JSON lacks `focus`, falls back to a sensible default |

**File:** `BACKEND/__tests__/calendarAdHocEvent.test.js` — New

| # | Test | What it verifies |
|---|---|---|
| 11 | `createAdHocWorkoutEvent creates a calendar event and planned session` | Both DB rows are created with correct data |
| 12 | `createAdHocWorkoutEvent links planned session to calendar event` | The event's `linked_planned_session_id` matches the planned session's `id` |
| 13 | `createAdHocWorkoutEvent sets source to user_created` | The calendar event's `source` field is `"user_created"` |
| 14 | `createAdHocWorkoutEvent sets event status to scheduled` | The event starts in `"scheduled"` status |
| 15 | `createAdHocWorkoutEvent sets event title to intentJson.focus` | The calendar event title matches the focus field |
| 16 | `createAdHocWorkoutEvent sets start_at to current time` | The event's `start_at` is approximately now |

**File:** `BACKEND/__tests__/trainerWorkouts.test.js` — Extend existing (buildWorkoutPrompt)

`buildWorkoutPrompt` is already exported but has zero tests. These are all pure function tests on the existing function plus the new fields:

| # | Test | What it verifies |
|---|---|---|
| 17 | `includes energy level in prompt` | Energy level from constraints appears in output string |
| 18 | `includes time available in prompt` | Time constraint appears in output string |
| 19 | `includes equipment list in prompt` | Equipment array is comma-joined into prompt |
| 20 | `includes program markdown when provided` | "Active Training Program" section appears with markdown content |
| 21 | `omits program section when no program` | No "Active Training Program" when program is null |
| 22 | `includes planned session JSON when provided` | `constraints.planned_session` is serialized into "Planned Session" line |
| 23 | `includes request text when provided` | `constraints.request_text` shows up as "User Request" line |
| 24 | `omits request text when null` | No "User Request" line when `request_text` is null |
| 25 | `includes weights profile when provided` | "Current Weights Profile" section appears with formatted text |
| 26 | `handles all constraints being null/empty` | Doesn't crash, uses defaults like "unknown" for energy/time |
| 27 | `includes plannedIntentOriginal when provided` | New field appears as "Original Planned Intent" in prompt (new feature) |
| 28 | `includes plannedIntentEdited when provided` | New field appears as "User Modified Intent" in prompt (new feature) |
| 29 | `omits plannedIntentEdited when null` | No "User Modified Intent" line when user made no changes |

**File:** `BACKEND/__tests__/trainerWorkouts.test.js` — Extend existing (generateWorkoutInstance)

| # | Test | What it verifies |
|---|---|---|
| 30 | `generateWorkoutInstance calls Claude and returns normalized instance` | End-to-end: builds prompt → calls AI → extracts JSON → normalizes → returns instance |
| 31 | `generateWorkoutInstance throws when Claude returns unparseable response` | Error handling when AI returns garbage/empty text |
| 32 | `generateWorkoutInstance includes weights profile in prompt` | Calls `getLatestProfile` and passes result to prompt builder |

**File:** `BACKEND/__tests__/trainerWorkouts.test.js` — Extend existing (findTodayWorkoutEvent)

| # | Test | What it verifies |
|---|---|---|
| 33 | `findTodayWorkoutEvent returns today's scheduled event` | Finds event with status "scheduled" and `event_type: "workout"` for today |
| 34 | `findTodayWorkoutEvent returns null when no events exist` | Returns null gracefully when Supabase returns no rows |

### iOS Tests (Manual Verification)

These cannot be unit tested with the current backend test setup and need manual verification:

| # | Test | What to verify |
|---|---|---|
| M1 | Planned session pre-fills Screen B | Tap the workout pill when a planned session exists. Screen B opens with title = `focus`, description = `notes`, duration = `duration_min` from the planned session's `intent_json`. |
| M2 | + menu "Generate custom workout" opens Screen A | Tap the `+` button in the top-right ThinTopBar. Select "Generate custom workout." The Intent Specification Page (Screen A) opens as a full-height sheet. |
| M3 | Intent → Screen B shimmer → populated fields | Type an intent on Screen A, tap "Plan My Workout." Screen B appears with shimmer loading. Once the backend responds, fields populate with the returned focus, notes, and duration_min. |
| M4 | Duration chip opens wheel picker | On Screen B, tap the duration chip. An iOS wheel picker appears. Selecting a new value updates the displayed duration. |
| M5 | Location dropdown shows locations | On Screen B, tap the location chip. A dropdown menu shows saved locations and "Add New Location." Selecting one updates the chip. |
| M6 | Editing fields tracks changes | Edit the title or description on Screen B. When "Get Started" is tapped, the request includes both the original and edited values. |
| M7 | Error state on Screen B | Simulate a backend failure. Screen B shows the error view with frown face and retry button. Tapping retry re-sends the request. |
| M8 | Back button returns to Screen A | From Screen B (arrived via intent flow), tap back. Returns to Screen A with the original intent text preserved. |
| M9 | "Get Started" generates the workout | Tap "Get Started" on Screen B. The workout generates and transitions to the active workout view. |
| M10 | Ad-hoc workout creates calendar event | After generating a workout from the intent flow, verify a new calendar event appears on the home screen (or in the calendar). |

---

## Edge Cases

1. **Empty intent text** — "Plan My Workout" button is disabled until the user enters text.
2. **User edits nothing on Screen B** — `plannedIntentEdited` is `null` (no changes detected). Backend uses the original intent as-is.
3. **No active program** — The `plan-intent` endpoint works without a program. The prompt still generates a reasonable plan based on the user's request alone.
4. **No saved locations** — Location chip shows "No location set." The "Add New Location" option is still available. Equipment array sent to backend is empty.
5. **Backend timeout on plan-intent** — After 30 seconds, show the error state on Screen B. User can retry or go back.
6. **User dismisses Screen B by swiping down (intent flow)** — Resets state. User can re-open from the `+` button.
7. **User dismisses Screen B by swiping down (planned flow)** — Resets state. Workout pill is still tappable on the home screen.
8. **Planned session has no notes** — Description field is empty but editable. User can add notes if they want.
9. **Planned session has no duration_min** — Default to 45 minutes.
10. **Multiple rapid taps on "Get Started"** — Disable button after first tap (same pattern as current `isStarting` guard).
11. **Empty `intent_json: {}`** — All fields fall back gracefully: title → `calendarEvent.title ?? "Today's Workout"`, description → `""`, duration → `45`.
12. **`duration_min` is 0 or negative from Claude** — Clamp to range 10–120 on the backend before returning. iOS picker also constrains to 10–120.
13. **User dismisses Screen B mid-loading (intent flow)** — `reset()` clears state. The in-flight `planIntent` API call should be cancelled (Task cancellation) or its response should be discarded if `showPreWorkoutReview` is no longer true.
14. **Multiple rapid taps on "Plan My Workout"** — Disable button after first tap to prevent duplicate API calls.
15. **Concurrent flow triggers** — If Screen B is open from a planned workout and the user triggers "Generate custom workout" from the + menu, `startNewWorkout()` calls `reset()` first, which dismisses the current sheet. No confirmation dialog — acceptable since no generation has started yet.

---

## Spec Review Report

> **Date:** 2026-02-17
> **Reviewers:** ios-analyzer, backend-analyzer, spec-consistency-checker (automated agents)
> **Method:** Each agent read the full spec and all relevant source files, then cross-referenced for coherence, data flow gaps, and logic problems.

### Critical Issues

#### ~~C1. SwiftUI Sheet Race Condition in `submitIntent()`~~ — RESOLVED
Resolved by using a single sheet with internal crossfade. No sheet dismiss/present cycle needed.

#### ~~C2. SwiftUI Multiple `.sheet()` Modifiers — Fragile Pattern~~ — RESOLVED
Resolved by using a single `.sheet()` with `PreWorkoutPage` enum controlling which screen is displayed inside. Crossfade transitions via `.transition(.opacity)` with `withAnimation(AppTheme.Animation.slow)`.

#### C3. `intensity` vs `notes` Data Shape Mismatch
**Source:** Backend analysis

Existing planned sessions in the DB have `intent_json: { focus, duration_min, intensity }`. The spec's pre-workout review page reads `intent?["notes"]?.stringValue` for the description — this returns `nil` for all existing planned sessions because they have `intensity`, not `notes`.

**Fix:** iOS should read both fields with fallback: `intent?["notes"]?.stringValue ?? intent?["intensity"]?.stringValue ?? ""`. The `plan-intent` endpoint returns `notes` (new format). Document that old sessions use `intensity` and new ones use `notes`.

#### C4. `createSession` Auto-Links to Wrong Calendar Event
**Source:** Backend analysis

`createSession()` calls `findTodayWorkoutEvent()` which returns the FIRST scheduled event for today (ordered by `start_at ASC`). For ad-hoc workouts, the user may have both a program-projected event (at midnight) and a new ad-hoc event (at current time). `findTodayWorkoutEvent` returns the midnight one — linking the session to the wrong event.

**Fix:** The `createOrResumeWorkoutSession()` API should accept optional `calendarEventId` and `plannedSessionId` parameters. When the iOS app creates an ad-hoc event first, it passes those IDs explicitly to the session creation call, bypassing `findTodayWorkoutEvent()`.

#### C5. Removing `readiness` from Controller Breaks Soreness/Pain in Prompt
**Source:** Spec-consistency analysis

The Removals section says to remove `readiness` from the controller (`trainerWorkouts.controller.js:55`). But `buildWorkoutPrompt()` still reads `readiness.soreness` and `readiness.pain` at lines 337–342. If `readiness` is removed entirely, these prompt lines break.

**Fix:** Keep the `readiness` object in the controller but remove only the `energy` field extraction. The `constraints` object should still include `readiness: readiness || {}` so soreness/pain continue to flow through. On iOS, keep `WorkoutReadiness` struct but remove the `energy` field (leaving `soreness` and `pain`). Update the Removals section to be precise: remove `energy` from readiness, not readiness itself.

### Moderate Issues

#### M1. `generateWorkout()` Still References `showPreWorkoutSheet`
**Source:** iOS analysis

Current code at `WorkoutStore.swift:194` does `showPreWorkoutSheet = false`. Since `showPreWorkoutSheet` is being removed, this must become `showPreWorkoutReview = false`.

#### M2. Data Flow Path Mismatch
**Source:** Spec-consistency analysis

The "New Workout Flow" data flow diagram says `POST /trainer/calendar/events` but the Backend Changes section defines the endpoint as `POST /trainer/calendar/events/create-for-workout`. These should match.

#### M3. Test #17 Contradicts Energy Level Removal
**Source:** Backend analysis, Spec-consistency analysis (both found this independently)

Test #17 (`includes energy level in prompt`) verifies energy IS present, but the Removals section deletes it from the prompt. Change test #17 to: `does NOT include energy level in prompt after removal`.

#### M4. `plannedIntentOriginal`/`plannedIntentEdited` Wiring Not Specified
**Source:** Backend analysis, Spec-consistency analysis

The spec says to "accept additional fields" in the generate endpoint but doesn't show the controller destructuring or the constraints object mapping. Needs explicit detail:
1. Add to controller destructuring: `const { ..., plannedIntentOriginal, plannedIntentEdited } = req.body`
2. Add to constraints: `planned_intent_original: plannedIntentOriginal || null, planned_intent_edited: plannedIntentEdited || null`

#### M5. `intentText` Not Carried to `generateWorkout()`
**Source:** Spec-consistency analysis

The New Workout data flow sends `requestText: <original intent text>` in the generate request, but `generateWorkout()` modification notes don't mention reading `intentText` from WorkoutStore and mapping it to `requestText`.

#### M6. `IntentPlan` Missing CodingKeys
**Source:** iOS analysis, Spec-consistency analysis

`IntentPlan.durationMin` (camelCase) needs a CodingKeys enum to map from the JSON key `duration_min` (snake_case), or decoding will fail.

#### M7. Missing `currentCalendarEventId` Property
**Source:** iOS analysis

The planned workout flow has no mechanism to pass the calendar event ID to the session creation call. Add a `currentCalendarEventId: String?` property to WorkoutStore, set it in `startPlannedSession()` from `calendarEvent.id`, and pass it to `createOrResumeWorkoutSession()`.

#### M8. `createAdHocWorkoutEvent` Is Redundant with Existing `createEvent`
**Source:** Backend analysis

The existing `POST /trainer/calendar/events` endpoint (via `createEvent` service) already creates calendar events, planned sessions, and links them. The new dedicated endpoint is functionally identical. Consider using the existing endpoint with specific fields instead of creating a new one. If keeping the new endpoint for API clarity, document why.

#### M9. Route Ordering for Express Parameter Matching
**Source:** Backend analysis

`POST /trainer/workouts/plan-intent` must be placed BEFORE `:id` routes in `trainerWorkouts.routes.js`, otherwise Express treats `"plan-intent"` as a session ID. Same for `/events/create-for-workout` in `trainerCalendar.routes.js` — must go before `/events/:id/reschedule`.

### Minor Issues

| # | Issue | Fix |
|---|---|---|
| L1 | `WorkoutReadiness` can be safely deleted from iOS if soreness/pain are also removed (currently only constructed in one place) | Decide: keep readiness without energy, or remove entirely |
| L2 | `reset()` missing complete list of new properties to clear | List all 12 new properties in spec |
| L3 | `CreateEventForWorkoutResponse` needs ISO8601 decoder for CalendarEvent dates | Note in spec that `makeISO8601Decoder()` must be used |
| L4 | `WorkoutGenerateRequest` new fields should be typed `[String: CodableValue]?` not `[String: Any]` | Update spec model to use CodableValue |
| L5 | `generateIntentPlan` missing from `module.exports` mention | Add to spec |
| L6 | Controller `planIntent` missing from `module.exports` mention | Add to spec |
| L7 | `intent: "user_specified"` is a new value not in existing agent tool enum | Document as intentional new value |
| L8 | `generateIntentPlan()` naming breaks pattern vs controller `planIntent()` | Consider renaming to `planIntent()` in service too |
| L9 | No controller-level 400 test for `createEventForWorkout` with missing `intentJson` | Add test #16b |
| L10 | Test #26 description references "energy/time" defaults — update to just "time" | Update description |
| L11 | No test for `intent: "user_specified"` in `buildWorkoutPrompt` | Add test |
