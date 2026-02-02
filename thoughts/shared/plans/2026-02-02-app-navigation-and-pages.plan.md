# App Navigation & Page Architecture Plan

**Created:** 2026-02-02
**Status:** Draft
**Context:** Define the complete page structure, navigation model, and screen inventory for the AI Personal Trainer app.

---

## Overview

This plan defines all pages/screens needed in the app, how they're organized, and how users navigate between them. The goal is a simple, clear structure that supports the full trainer journey from onboarding through daily workouts and long-term progress tracking.

---

## Current State

### Existing Navigation Model
The app currently uses a **menu-driven navigation** (not tab bar):
- Top bar with left menu button, center title, right actions
- 5 destinations via `DrawerDestination` enum:
  - `.home` - Main workout screen
  - `.stats` - History/stats view
  - `.info` - Preferences management
  - `.coach` - Trainer journey view
  - `.profile` - User profile (sheet)

### Existing Features
- **Home** - Workout runner with exercise cards
- **Trainer** - Journey view, data hub, monitoring
- **Stats** - Workout history
- **Info** - Preferences, locations, goals
- **Profile** - Settings, units, permissions
- **Assistant** - Chat overlay and inline

### Existing Services (to leverage)
- `TrainingProgramStore` - Program data
- `IntakeSessionStore` - Intake flow
- `AssessmentSessionStore` - Assessment flow
- `GoalContractStore` - Goals
- `WorkoutSessionStore` - Current workout
- `WorkoutHistoryStore` - Completed workouts
- `LocationService` - Location management
- `UserSettings` - User preferences

---

## Proposed Navigation Model

### Decision: Keep Menu-Based Navigation

Reasons:
1. Already implemented and working
2. Cleaner for a coach-centric app (focus on content, not chrome)
3. Tab bar would require significant refactor
4. Menu allows more than 5 destinations without crowding

### Updated Menu Structure

```
┌─────────────────────────────────────┐
│ [≡]     AI Personal Trainer    [+] │  ← Top bar (Home)
├─────────────────────────────────────┤
│                                     │
│         [Page Content]              │
│                                     │
└─────────────────────────────────────┘

Menu (≡) opens:
┌─────────────────────────────────────┐
│  Home                          🏠  │
│  Calendar                      📅  │
│  Progress                      📊  │
│  My Data                       📁  │  ← NEW (Artifacts hub)
│  Settings                      ⚙️  │
│  ─────────────────────────────────  │
│  Help & Support                ❓  │
└─────────────────────────────────────┘
```

### Navigation Destinations (Updated)

| Destination | Purpose | Replaces |
|-------------|---------|----------|
| `home` | Daily workout command center | (same) |
| `calendar` | Schedule view and management | (new) |
| `progress` | Stats, history, measurements | `stats` |
| `myData` | Artifacts hub (intake, goals, program, etc.) | `coach` + `info` |
| `settings` | App settings and account | `profile` |

**Removed/Consolidated:**
- `.info` → Merged into `.myData` (preferences live there now)
- `.coach` → Merged into `.myData` (trainer data hub)
- `.profile` → Renamed to `.settings`

---

## Complete Page Inventory

### 1. Home (Daily Command Center)

**Purpose:** The user's daily starting point. Clean, focused design with minimal distractions.

**File:** `HomeView.swift` (existing, to be updated)

**Layout:**
```
┌─────────────────────────────────────┐
│ [≡]                            [+]  │  ← Top bar
├─────────────────────────────────────┤
│                                     │
│   [Stats text blurb]                │  ← Top section
│   "3 workouts this week"            │
│   "5 day streak"                    │
│                                     │
│                                     │
│                                     │
│         [Main content area]         │  ← Middle (mostly empty/clean)
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [AI Orb]  [Today's Workout Button] │  ← Bottom section
│     🔵     ┌─────────────────────┐  │
│            │ Upper Body Strength │  │
│            │ ~45 min • Start →   │  │
│            └─────────────────────┘  │
└─────────────────────────────────────┘
```

**Content:**
- **Top bar:**
  - Left: Hamburger menu (≡) → Opens side menu
  - Right: Plus button (+) → Quick actions (Quick Workout, Log Measurement, etc.)
- **Stats blurb (top):**
  - Simple text showing key stats
  - Workouts this week, streak, or motivational message
- **Bottom section:**
  - AI Orb (tap to chat with coach)
  - Today's Workout button (tap to start workout)
    - Shows workout type/focus
    - Estimated duration
    - "Start" action

**Navigates to:**
- Side Menu (hamburger tap)
- Quick Actions Sheet (+ tap)
- Coach Chat (orb tap)
- Workout Runner (workout button tap)

---

### 1a. Side Menu (Navigation Drawer)

**Purpose:** Access all main app sections.

**File:** `MenuView.swift` (new)

**Layout:**
```
┌─────────────────────────────────────┐
│  [User Name]                        │
│  [Email]                            │
│  ─────────────────────────────────  │
│                                     │
│  🏠  Home                           │
│  📅  Calendar                       │
│  📊  Progress                       │
│  📁  My Data                        │
│  ⚙️  Settings                       │
│                                     │
│  ─────────────────────────────────  │
│  ❓  Help & Support                 │
│                                     │
└─────────────────────────────────────┘
```

**Behavior:**
- Slides in from left
- Tap outside or swipe to dismiss
- Current page highlighted

---

### 1b. Quick Actions Sheet (+ Button)

**Purpose:** Quick access to common actions without leaving Home.

**File:** `QuickActionsSheet.swift` (new)

**Content:**
- Quick Workout (off-plan workout request)
- Log Measurement (weight, etc.)
- Schedule Rest Day
- Report Pain/Injury

**Behavior:**
- Bottom sheet that slides up
- Tap action to open relevant flow
- Tap outside to dismiss

---

### 2. Calendar

**Purpose:** View and manage the workout schedule.

**File:** `CalendarView.swift` (new)

**Content:**
- Month/week toggle view
- Colored session indicators by type
- Tap day to see:
  - Planned session details (focus, duration, equipment)
  - Actions: Start, Move, Skip, Mark Rest Day
  - If past: View Session Summary
- "Add Event" for custom rest days or notes

**Navigates to:**
- Workout Runner (Start)
- Session Detail (past sessions)
- Reschedule Sheet

---

### 3. Progress

**Purpose:** Track fitness progress over time.

**File:** `ProgressView.swift` (rename from `StatsView.swift`)

**Sub-pages:**

#### 3.1 Progress Overview (default)
- Goal progress summary
- Key metrics charts (consistency, volume, strength tests)
- This week vs last week comparison

#### 3.2 Workout History
**File:** `WorkoutHistoryView.swift` (existing, move here)
- List of completed workouts
- Filter by date range, type
- Tap to view Session Detail

#### 3.3 Measurements
**File:** `MeasurementsView.swift` (new)
- Weight, height, waist charts over time
- "Add Measurement" quick action
- Body fat % (if tracked)

#### 3.4 Weekly Reports
**File:** `WeeklyReportsView.swift` (new)
- List of weekly report cards
- Tap to view full report
- "Changes we made" history

**Navigates to:**
- Session Detail
- Measurement Entry Sheet
- Weekly Report Detail

---

### 4. My Data (Artifacts Hub)

**Purpose:** Transparency and control. User can see and edit everything the AI knows about them.

**File:** `MyDataView.swift` (new)

**Sub-pages:**

#### 4.1 My Data Overview (default)
- Cards for each artifact type
- Last updated timestamps
- Quick status indicators

#### 4.2 Intake Summary
**File:** `IntakeSummaryView.swift` (new)
- Full intake summary from onboarding
- Editable fields (inline or "Request Change")
- "Redo Intake" action
- Last updated date

#### 4.3 Assessment Baseline
**File:** `AssessmentBaselineView.swift` (new)
- Movement quality, strength, conditioning results
- Confidence indicators
- "Redo Assessment" action

#### 4.4 Goals
**File:** `GoalsView.swift` (new)
- Current `GoalContract`
- Primary goal, timeline, metrics
- "Request Changes" (voice/text)
- Goal history (past versions)

#### 4.5 Program
**File:** `ProgramView.swift` (new)
- Current `TrainingProgram`
- Weekly template visualization
- Progression rules summary
- "Request Changes" (voice/text)
- "Pause Program" / "Archive Program"

#### 4.6 Session Summaries
**File:** `SessionSummariesListView.swift` (new)
- List of all `SessionSummary` documents
- Sorted by date (newest first)
- Tap to view full summary

#### 4.7 Coach Memory (includes user preferences)
**File:** `CoachMemoryView.swift` (new)
- List of all memory items the coach knows about the user
- Category grouping:
  - **Preferences** - Equipment, exercise likes/dislikes, coaching style
  - **Constraints** - Injuries, limitations, schedule constraints
  - **Capabilities** - Self-reported abilities, fitness level
  - **Locations** - Saved training locations with equipment
  - **Notes** - Other relevant info
- "Forget this" action per item
- "Add note" for user-initiated memories
- "Edit" for location management

**Navigates to:**
- Session Detail
- Edit sheets for each artifact
- Redo Intake/Assessment flows
- Location Editor (for location items)

---

### 5. Settings

**Purpose:** App configuration and account management.

**File:** `SettingsView.swift` (rename from `ProfileView.swift`)

**Content:**

#### Account
- Email display
- Sign out

#### App Settings
- Units (weight: kg/lb, distance: km/mi, height: cm/ft)
- Coach mode (Quiet/Ringer) - default for workouts
- Voice settings (enable/disable, language)

#### Notifications
- Workout reminders (on/off, time)
- Weekly report notifications
- Progress celebrations

#### Privacy & Data
- Export my data
- Delete account
- Privacy policy link
- Terms of service link

#### Help & Support
- FAQ / Help center
- Contact support
- Report a bug

#### About
- App version
- Acknowledgments

---

### 6. Workout Runner

**Purpose:** Execute the current workout session.

**File:** `WorkoutRunnerView.swift` (consolidate from `HomeView.swift` workout components)

**This is a full-screen takeover (not a menu destination).**

**Content:**
- Exercise card stack (existing)
- Top bar: elapsed time, current exercise, rest timer
- Bottom bar: quick actions (Swap, Pain, Time, End)
- Coach overlay (optional, based on mode)
- Voice command listener

**Sheets/Overlays:**
- Swap Exercise Sheet
- Pain Report Sheet
- Time Adjustment Sheet
- End Workout Confirmation
- Exercise Detail (how to do it)

**Exit to:**
- Session Summary (on complete)
- Home (on cancel/pause)

---

### 7. Session Detail

**Purpose:** View a completed workout's details.

**File:** `SessionDetailView.swift` (new)

**Content:**
- Workout log (exercises, sets, reps, weights, RPE)
- Session summary (AI-generated)
- Duration, total volume
- Pain/discomfort notes
- "Share" action (future)

**Accessed from:**
- Workout History
- Calendar (past dates)
- Session Summaries list

---

### 8. Coach Chat

**Purpose:** Full conversation interface with the AI coach.

**File:** `CoachChatView.swift` (consolidate from `AssistantView.swift`)

**Can be accessed:**
- As a sheet/overlay from Home
- As a floating button on most screens
- Full-screen from menu (optional)

**Content:**
- Chat message history
- Voice input (push-to-talk)
- Text input
- Quick action chips
- Artifact cards (when coach shares documents)

---

### 9. Onboarding Flow (Separate)

Covered in `2026-02-02-onboarding-flow.plan.md`. Includes:
- Welcome
- Auth (Terms/Privacy + OTP)
- Microphone Permission
- Intake
- Assessment Prompt / Assessment
- Name Collection + Goal Loading
- Goal Draft / Review
- Program Draft / Review
- Notification Permission
- Success Screen
- Feature Tour

---

## Page Hierarchy Diagram

```
App Launch
    │
    ├── [Not Authenticated]
    │   └── Onboarding Flow (see onboarding plan)
    │
    └── [Authenticated + Onboarding Complete]
        │
        └── Main App
            │
            ├── Home (default)
            │   ├── → Workout Runner (full screen)
            │   │       └── → Session Summary → Home
            │   ├── → Coach Chat (sheet)
            │   ├── → Quick Workout (sheet)
            │   └── → Calendar (tap snippet)
            │
            ├── Calendar
            │   ├── → Session Detail (past)
            │   ├── → Workout Runner (start)
            │   └── → Reschedule Sheet
            │
            ├── Progress
            │   ├── Overview (default)
            │   ├── Workout History
            │   │   └── → Session Detail
            │   ├── Measurements
            │   │   └── → Add Measurement (sheet)
            │   └── Weekly Reports
            │       └── → Report Detail
            │
            ├── My Data
            │   ├── Overview (default)
            │   ├── Intake Summary
            │   │   └── → Redo Intake (onboarding flow)
            │   ├── Assessment Baseline
            │   │   └── → Redo Assessment (onboarding flow)
            │   ├── Goals
            │   │   └── → Edit Goals (sheet/voice)
            │   ├── Program
            │   │   └── → Edit Program (sheet/voice)
            │   ├── Session Summaries
            │   │   └── → Session Detail
            │   └── Coach Memory
            │       └── → Edit/Delete items, Location Editor
            │
            └── Settings
                ├── Account
                ├── App Settings (units, voice, coach mode)
                ├── Notifications
                ├── Privacy & Data
                ├── Help & Support
                └── About
```

---

## Navigation Implementation

### Updated DrawerDestination Enum

```swift
enum AppDestination: String, CaseIterable, Identifiable {
    case home
    case calendar
    case progress
    case myData
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .calendar: return "Calendar"
        case .progress: return "Progress"
        case .myData: return "My Data"
        case .settings: return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house.fill"
        case .calendar: return "calendar"
        case .progress: return "chart.line.uptrend.xyaxis"
        case .myData: return "folder.fill"
        case .settings: return "gearshape.fill"
        }
    }
}
```

### MainAppView Structure

```swift
struct MainAppView: View {
    @State private var currentDestination: AppDestination = .home
    @State private var showMenu = false
    @State private var showCoachChat = false

    var body: some View {
        ZStack {
            // Main content
            NavigationStack {
                destinationView
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            menuButton
                        }
                        ToolbarItem(placement: .principal) {
                            if currentDestination != .home {
                                Text(currentDestination.title)
                            }
                        }
                        ToolbarItem(placement: .navigationBarTrailing) {
                            trailingActions
                        }
                    }
            }

            // Menu overlay
            if showMenu {
                MenuView(
                    currentDestination: $currentDestination,
                    showMenu: $showMenu
                )
            }

            // Coach chat floating button + sheet
            CoachChatButton(showChat: $showCoachChat)
        }
        .sheet(isPresented: $showCoachChat) {
            CoachChatView()
        }
    }

    @ViewBuilder
    private var destinationView: some View {
        switch currentDestination {
        case .home:
            HomeView()
        case .calendar:
            CalendarView()
        case .progress:
            ProgressView()
        case .myData:
            MyDataView()
        case .settings:
            SettingsView()
        }
    }
}
```

---

## New Files to Create

### Views

| File | Location | Purpose |
|------|----------|---------|
| `CalendarView.swift` | `/Features/Calendar/` | Month/week schedule view |
| `CalendarDayDetailView.swift` | `/Features/Calendar/` | Single day detail |
| `RescheduleSheet.swift` | `/Features/Calendar/` | Move/reschedule workout |
| `ProgressView.swift` | `/Features/Progress/` | Progress overview (rename from StatsView) |
| `MeasurementsView.swift` | `/Features/Progress/` | Body measurements tracking |
| `MeasurementEntrySheet.swift` | `/Features/Progress/` | Add measurement |
| `WeeklyReportsView.swift` | `/Features/Progress/` | List of weekly reports |
| `WeeklyReportDetailView.swift` | `/Features/Progress/` | Single report view |
| `MyDataView.swift` | `/Features/MyData/` | Artifacts hub overview |
| `IntakeSummaryView.swift` | `/Features/MyData/` | View/edit intake |
| `AssessmentBaselineView.swift` | `/Features/MyData/` | View assessment results |
| `GoalsView.swift` | `/Features/MyData/` | View/edit goal contract |
| `ProgramView.swift` | `/Features/MyData/` | View/edit program |
| `SessionSummariesListView.swift` | `/Features/MyData/` | List all session summaries |
| `CoachMemoryView.swift` | `/Features/MyData/` | View/edit coach memory (includes preferences, locations) |
| `SettingsView.swift` | `/Features/Settings/` | App settings (rename from ProfileView) |
| `SessionDetailView.swift` | `/Features/Workout/` | View completed workout |
| `WorkoutRunnerView.swift` | `/Features/Workout/` | Full workout execution |
| `CoachChatView.swift` | `/Features/Coach/` | Full chat interface |
| `MenuView.swift` | `/Features/Navigation/` | Side menu |
| `QuickActionsSheet.swift` | `/Features/Home/` | Quick actions from + button |

### Components

| File | Location | Purpose |
|------|----------|---------|
| `CalendarMonthView.swift` | `/Shared/Components/Calendar/` | Month grid |
| `CalendarWeekView.swift` | `/Shared/Components/Calendar/` | Week strip |
| `SessionCard.swift` | `/Shared/Components/` | Reusable session preview |
| `ArtifactCard.swift` | `/Shared/Components/` | Card for artifacts in My Data |
| `ProgressChart.swift` | `/Shared/Components/` | Reusable chart component |
| `MeasurementRow.swift` | `/Shared/Components/` | Single measurement display |
| `MemoryItemRow.swift` | `/Shared/Components/` | Single memory item |

### Services (if needed)

| File | Purpose |
|------|---------|
| `CalendarStore.swift` | Calendar events and planned sessions |
| `MeasurementsStore.swift` | Body measurements time series |
| `WeeklyReportStore.swift` | Weekly reports |
| `CoachMemoryStore.swift` | User memory items |

---

## Files to Modify

| File | Changes |
|------|---------|
| `AppView.swift` | Update routing for new destinations |
| `MainAppView.swift` | New navigation structure with menu |
| `HomeView.swift` | Simplify to command center (extract workout runner) |
| `StatsView.swift` | Rename to `ProgressView.swift`, restructure |
| `ProfileView.swift` | Rename to `SettingsView.swift`, simplify |
| `InfoView.swift` | Remove (preferences now in Coach Memory via user memory system) |
| `TrainerJourneyView.swift` | Migrate to `MyDataView.swift` |
| `TrainerDataHubView.swift` | Split into My Data sub-views |

---

## Implementation Phases

### Phase 1: Navigation Restructure
1. Create `MenuView.swift` with new destinations
2. Update `AppDestination` enum
3. Update `MainAppView.swift` routing
4. Create placeholder views for new destinations
5. Test navigation flow

### Phase 2: Home Refinement
1. Extract workout runner to `WorkoutRunnerView.swift`
2. Simplify `HomeView.swift` to command center
3. Add calendar snippet component
4. Add quick stats component
5. Add coach chat entry point

### Phase 3: Calendar
1. Create `CalendarView.swift` with month/week views
2. Create `CalendarDayDetailView.swift`
3. Create `RescheduleSheet.swift`
4. Integrate with `CalendarStore` (or create if needed)
5. Connect to existing `TrainingProgramStore` for planned sessions

### Phase 4: Progress
1. Rename `StatsView.swift` to `ProgressView.swift`
2. Create `MeasurementsView.swift`
3. Create `MeasurementEntrySheet.swift`
4. Create `WeeklyReportsView.swift`
5. Create `WeeklyReportDetailView.swift`
6. Add navigation between sub-pages

### Phase 5: My Data (Artifacts Hub)
1. Create `MyDataView.swift` overview
2. Create `IntakeSummaryView.swift`
3. Create `AssessmentBaselineView.swift`
4. Create `GoalsView.swift`
5. Create `ProgramView.swift`
6. Create `SessionSummariesListView.swift`
7. Create `CoachMemoryView.swift`
8. Migrate preferences from `InfoView.swift`

### Phase 6: Settings
1. Rename `ProfileView.swift` to `SettingsView.swift`
2. Reorganize into sections (Account, Preferences, Notifications, etc.)
3. Add Help & Support section
4. Add Privacy & Data section

### Phase 7: Session Detail & Workout Flow
1. Create `SessionDetailView.swift`
2. Create `WorkoutRunnerView.swift` (extract from Home)
3. Connect session completion to Session Summary flow
4. Add sharing capability (future)

### Phase 8: Coach Chat
1. Consolidate `AssistantView.swift` into `CoachChatView.swift`
2. Create `CoachChatButton.swift` floating button
3. Make available as sheet from multiple screens
4. Ensure voice input works

### Phase 9: Polish & Cleanup
1. Remove deprecated files (`InfoView.swift`, old `TrainerJourneyView.swift`)
2. Update all navigation references
3. Ensure deep linking works
4. Test all flows end-to-end

---

## File Structure (Target)

```
/Features/
├── Home/
│   ├── HomeView.swift
│   ├── Components/
│   │   ├── TodayWorkoutCard.swift
│   │   ├── QuickStatsCard.swift
│   │   ├── CalendarSnippet.swift
│   │   └── ... (existing exercise components)
│   └── Sheets/
│       └── QuickWorkoutSheet.swift
│
├── Calendar/
│   ├── CalendarView.swift
│   ├── CalendarDayDetailView.swift
│   ├── RescheduleSheet.swift
│   └── Components/
│       ├── CalendarMonthView.swift
│       └── CalendarWeekView.swift
│
├── Progress/
│   ├── ProgressView.swift
│   ├── WorkoutHistoryView.swift
│   ├── MeasurementsView.swift
│   ├── MeasurementEntrySheet.swift
│   ├── WeeklyReportsView.swift
│   └── WeeklyReportDetailView.swift
│
├── MyData/
│   ├── MyDataView.swift
│   ├── IntakeSummaryView.swift
│   ├── AssessmentBaselineView.swift
│   ├── GoalsView.swift
│   ├── ProgramView.swift
│   ├── SessionSummariesListView.swift
│   └── CoachMemoryView.swift
│
├── Settings/
│   └── SettingsView.swift
│
├── Workout/
│   ├── WorkoutRunnerView.swift
│   ├── SessionDetailView.swift
│   └── Components/
│       └── ... (exercise cards, etc.)
│
├── Coach/
│   ├── CoachChatView.swift
│   └── CoachChatButton.swift
│
├── Navigation/
│   └── MenuView.swift
│
├── Onboarding/
│   └── ... (see onboarding plan)
│
└── FeatureTour/
    └── ... (see onboarding plan)

/Services/
├── CalendarStore.swift (new)
├── MeasurementsStore.swift (new)
├── WeeklyReportStore.swift (new)
├── CoachMemoryStore.swift (new)
└── ... (existing services)

/Models/
├── CalendarModels.swift (new)
├── MeasurementModels.swift (new)
└── ... (existing models)
```

---

## Verification Checklist

### Navigation
- [ ] Menu opens and closes correctly
- [ ] All 5 destinations accessible
- [ ] Back navigation works on sub-pages
- [ ] Deep links work (future)

### Home
- [ ] Today's workout displays correctly
- [ ] Start Workout launches runner
- [ ] Quick stats show current week
- [ ] Calendar snippet shows next days
- [ ] Coach chat accessible

### Calendar
- [ ] Month view displays all days
- [ ] Week view displays correctly
- [ ] Tap day shows detail
- [ ] Can start workout from calendar
- [ ] Can reschedule workout
- [ ] Past sessions show summary link

### Progress
- [ ] Overview shows goal progress
- [ ] Workout history list loads
- [ ] Session detail shows full log
- [ ] Measurements chart displays
- [ ] Can add new measurement
- [ ] Weekly reports list loads

### My Data
- [ ] Overview shows all artifacts
- [ ] Intake summary viewable
- [ ] Redo Intake triggers onboarding flow
- [ ] Assessment baseline viewable
- [ ] Redo Assessment triggers flow
- [ ] Goals viewable and editable
- [ ] Program viewable and editable
- [ ] Session summaries list loads
- [ ] Coach memory viewable (shows preferences, constraints, locations)
- [ ] Can delete/forget memory items
- [ ] Can edit locations from Coach Memory

### Settings
- [ ] Account info displays
- [ ] Can sign out
- [ ] Unit preferences work
- [ ] Coach mode toggle works
- [ ] Notification settings work
- [ ] Help links work

### Workout Flow
- [ ] Workout runner loads correctly
- [ ] Can complete workout
- [ ] Session summary generated
- [ ] Returns to Home after complete

---

## Open Questions

1. **Menu style:** Slide-out drawer vs overlay modal?
2. **Coach chat:** Floating button on all screens, or just Home?
3. **Calendar API:** Create new backend endpoints or extend existing?
4. **Measurements:** Integrate with Apple Health for auto-import?
5. **Deep linking:** Support `trainer://calendar/2026-02-15` style URLs?
6. **Tablet support:** Different layout for iPad?

---

## Dependencies

This plan depends on:
- `2026-02-02-onboarding-flow.plan.md` - Onboarding screens
- `2026-01-23-personal-trainer-process-integration.plan.md` - Backend architecture

---

## Change Log

- 2026-02-02: Initial plan created
- 2026-02-02: Updated Home page design:
  - Simplified layout: stats blurb at top, clean middle, bottom CTA
  - AI Orb + Today's Workout button at bottom
  - Top bar: hamburger menu (left), + button (right)
  - Added Side Menu (1a) and Quick Actions Sheet (1b) sections
  - Added QuickActionsSheet.swift to file list
- 2026-02-02: Removed Preferences, replaced with User Memory:
  - Removed PreferencesView.swift (no longer needed)
  - Coach Memory now includes all user preferences, constraints, locations
  - Updated Coach Memory section to show category groupings
  - Renamed Settings > "Preferences" to "App Settings" (unit/voice/coach mode)
  - Updated file structure and verification checklist
