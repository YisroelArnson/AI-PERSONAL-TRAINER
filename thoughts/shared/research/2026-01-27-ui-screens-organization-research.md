# UI Screens & Organization Research

*Created: January 27, 2026*

## Purpose

This document analyzes all UI screens needed for the AI Personal Trainer app—both current and planned—and proposes a smart, intuitive grouping strategy for front-end organization.

---

## Part 1: Current State (What Exists Now)

### Current Navigation Architecture

The app uses a **side drawer navigation** pattern (ChatGPT-style) with 4 main destinations:

| Destination | View | Purpose |
|-------------|------|---------|
| **Home** | `HomeView` | Active workout execution (card stack of exercises) |
| **Stats** | `StatsView` | Workout history and completed exercises |
| **Preferences** | `InfoView` | Goals, equipment, locations, user preferences |
| **Profile** | `ProfileView` | App settings (units, auto-refresh, location detection) |

**Additional global elements:**
- **Floating AI Button** → Opens `AssistantOverlayView` (always accessible)
- **Side Drawer** → `SideDrawerView` (swipe from left edge)

### Current Screen Inventory (34 Views)

| Category | Screen/View | Type | Purpose |
|----------|-------------|------|---------|
| **Auth** | `AuthView` | Full screen | Email/OTP authentication |
| **Root** | `AppView` | Container | Auth state routing |
| **Root** | `MainAppView` | Container | Drawer + content + overlay |
| **Home** | `HomeView` | Full page | Exercise card stack |
| **Home** | `RefreshModalView` | Sheet | Get new exercises |
| **Home** | `ExerciseCard` | Component | Exercise container card |
| **Home** | `StrengthExerciseView` | Component | Reps/weight exercises |
| **Home** | `IsometricExerciseView` | Component | Hold exercises |
| **Home** | `DurationExerciseView` | Component | Cardio/continuous |
| **Home** | `IntervalsExerciseView` | Component | HIIT/interval |
| **Home** | `GlowingOrbButton` | Component | Complete exercise action |
| **Stats** | `StatsView` | Full page | History list with filters |
| **Stats** | `ExerciseDetailSheet` | Sheet | Completed exercise detail |
| **Preferences** | `InfoView` | Full page | Preferences hub |
| **Preferences** | `CategoryGoalsSection` | Section | Category goal cards |
| **Preferences** | `MuscleGoalsSection` | Section | Muscle goal cards |
| **Preferences** | `ActivePreferencesSection` | Section | Equipment, injuries, etc. |
| **Preferences** | `AddPreferenceSheet` | Sheet | Add new preference |
| **Preferences** | `PreferenceManagerView` | Sheet | Edit existing preference |
| **Preferences** | `CategoryGoalSetterView` | Sheet | Set category goals |
| **Preferences** | `CategoryGoalsAIAssistSheet` | Sheet | AI-assisted goal setting |
| **Preferences** | `MuscleGoalSetterView` | Sheet | Set muscle goals |
| **Preferences** | `MuscleGoalsAIAssistSheet` | Sheet | AI-assisted goal setting |
| **Preferences** | `LocationsListSheet` | Sheet | Manage locations |
| **Preferences** | `LocationEditorView` | Sheet | Edit single location |
| **Preferences** | `LocationMapPickerView` | Sheet | Map-based location pick |
| **Profile** | `ProfileView` | Full page | App settings |
| **Assistant** | `AssistantOverlayView` | Overlay | Global AI chat |
| **Assistant** | `FloatingMessageStack` | Component | Message list |
| **Assistant** | `ChatInputBar` | Component | User text input |
| **Assistant** | `MessageBubble` | Component | Chat message |
| **Assistant** | `ArtifactCard` | Component | Workout/structured response |
| **Assistant** | `QuestionOptionsView` | Component | Quick response buttons |
| **Shared** | `SideDrawerView` | Drawer | Navigation menu |

---

## Part 2: Planned Features (From Process Integration Plan)

The plan introduces 6 trainer journey phases that each require dedicated UIs:

### Phase A — Intake (Initial Consultation)
**UI Type:** Conversational interview with voice-first input

| Screen | Type | Purpose |
|--------|------|---------|
| `IntakeFlowView` | Full flow | Interview flow container |
| `IntakeFocusPromptCanvas` | Screen | Single question focus view |
| `IntakeVoiceInputPanel` | Component | Push-to-talk + transcription |
| `IntakeProgressBar` | Component | Topic-based progress |
| `IntakeSummaryReview` | Screen | Review/edit generated summary |
| `IntakeQuickChips` | Component | "Skip", "Not sure", etc. |

### Phase B — Assessment (Physical Baseline)
**UI Type:** Stepper-based flow with tests, timers, and voice answers

| Screen | Type | Purpose |
|--------|------|---------|
| `AssessmentFlowView` | Full flow | Assessment container |
| `AssessmentStepCard` | Screen | Individual test step |
| `AssessmentTimerView` | Component | Timer for holds/intervals |
| `AssessmentResultInput` | Component | Reps/duration/pain input |
| `AssessmentBaselineReview` | Screen | Review baseline summary |
| `AssessmentPainReporter` | Component | Always-visible pain shortcut |

### Phase C — Goal Setting
**UI Type:** Auto-draft + voice edits

| Screen | Type | Purpose |
|--------|------|---------|
| `GoalContractView` | Full flow | Goal setting container |
| `GoalDraftCard` | Screen | System-generated goal contract |
| `GoalEditOverlay` | Component | Voice edit interface |
| `GoalChangeHighlight` | Component | Visual diff of changes |

### Phase D — Program Design
**UI Type:** Program summary + Q&A + edits

| Screen | Type | Purpose |
|--------|------|---------|
| `ProgramDesignView` | Full flow | Program review container |
| `ProgramSummaryCard` | Screen | Weekly schedule, progressions |
| `ProgramWeekPreview` | Component | Week grid visualization |
| `ProgramQAPanel` | Component | Ask questions about plan |
| `ProgramEditOverlay` | Component | Voice edit interface |

### Phase E — Daily Coaching & Execution
**UI Type:** Workout runner with coach integration

| Screen | Type | Purpose |
|--------|------|---------|
| `TodayView` | Screen | Today's session overview (replaces/enhances Home) |
| `ReadinessCheckModal` | Sheet | Quick pre-workout check |
| `WorkoutRunnerView` | Full flow | Exercise execution (enhanced Home) |
| `CoachOverlay` | Component | Contextual coaching cues |
| `ExerciseSwapSheet` | Sheet | Swap/modify exercise |
| `PainModificationSheet` | Sheet | Handle pain during workout |
| `WorkoutSummaryView` | Screen | End-of-workout recap |
| `SessionReflectionView` | Component | Quick RPE/satisfaction input |
| `CoachModeToggle` | Component | Quiet vs Ringer mode |
| `VoiceCommandIndicator` | Component | Voice input feedback |

### Phase F — Monitoring & Adjustment
**UI Type:** Background + periodic check-ins

| Screen | Type | Purpose |
|--------|------|---------|
| `WeeklyReportView` | Screen | Weekly summary card |
| `ProgramChangesReview` | Screen | Review major adjustments |
| `CheckinFlowView` | Full flow | Weekly/monthly check-in |
| `ProgressChartsView` | Screen | Goal metric charts |

### Cross-Phase Screens (New in Plan)

| Screen | Type | Purpose |
|--------|------|---------|
| `CalendarView` | Full page | Weekly/monthly session schedule |
| `MeasurementsView` | Full page | Weight/waist/height tracking |
| `CoachMemoryView` | Full page | View/edit what coach remembers |
| `UserDataHubView` | Full page | Central access to all user data |
| `TrainerSetupBanner` | Component | "Continue setup" CTA |

---

## Part 3: Total Screen Count Analysis

### Summary by Category

| Category | Current | New | Total |
|----------|---------|-----|-------|
| Auth | 1 | 0 | 1 |
| Root/Navigation | 2 | 0 | 2 |
| Home/Today | 8 | 6 | 14 |
| Stats/History | 2 | 0 | 2 |
| Preferences/Info | 12 | 0 | 12 |
| Profile/Settings | 1 | 4 | 5 |
| Assistant | 6 | 2 | 8 |
| Intake Flow | 0 | 6 | 6 |
| Assessment Flow | 0 | 6 | 6 |
| Goal Setting | 0 | 4 | 4 |
| Program Design | 0 | 5 | 5 |
| Monitoring | 0 | 4 | 4 |
| **TOTAL** | **32** | **37** | **~69** |

---

## Part 4: Smart Grouping Strategy

### Problem: The Current 4-Tab Model Won't Scale

The current 4-destination drawer (Home, Stats, Preferences, Profile) works for the MVP but won't accommodate:
- Trainer journey phases (Intake → Assessment → Goals → Program)
- Calendar management
- Progress monitoring
- User data management (measurements, memory, reports)

### Proposed Solution: Feature-Based Information Architecture

I recommend organizing the app into **5 primary domains** based on user mental models:

---

### Domain 1: **TODAY** (Primary Action Zone)
*"What should I do right now?"*

**Screens included:**
- `TodayView` (landing page) — Today's session intent, start CTA, readiness
- `WorkoutRunnerView` — Exercise execution (current Home card stack)
- `ReadinessCheckModal` — Pre-workout quick check
- `ExerciseSwapSheet` — Mid-workout modifications
- `PainModificationSheet` — Handle pain safely
- `WorkoutSummaryView` — End-of-workout recap
- `CoachOverlay` — Contextual coaching cues
- `RefreshModalView` — Quick workout request

**Why:** This is where users spend 90% of active time. It should be instant to access and friction-free.

---

### Domain 2: **PLAN** (Program & Calendar)
*"What's my training plan?"*

**Screens included:**
- `CalendarView` — Weekly/monthly view of planned sessions
- `ProgramSummaryView` — Current active program details
- `PlannedSessionDetailView` — Individual session intent
- `ProgramQAPanel` — Ask questions about the plan
- (Editing flows link from here)

**Why:** Users want to see ahead, reschedule sessions, and understand the program logic.

---

### Domain 3: **PROGRESS** (History & Monitoring)
*"How am I doing?"*

**Screens included:**
- `StatsView` — Workout history (current)
- `WeeklyReportView` — Weekly summary
- `ProgressChartsView` — Goal metrics over time
- `MeasurementsView` — Weight/waist/height trends
- `ExerciseDetailSheet` — Completed exercise detail

**Why:** Users need feedback loops to stay motivated and see results.

---

### Domain 4: **PROFILE** (Identity & Preferences)
*"Who am I to the coach?"*

**Screens included:**
- `UserDataHubView` — Central access point
- `InfoView` — Goals, equipment, locations (current)
- `CoachMemoryView` — What the coach remembers
- `PreferenceManagerView` — Edit preferences
- `LocationsListSheet` — Manage locations
- All goal-setting sheets

**Why:** Users need control over their data and the ability to correct/update what the system knows.

---

### Domain 5: **SETTINGS** (App Configuration)
*"How does the app work?"*

**Screens included:**
- `ProfileView` — Units, auto-refresh, location detection (current)
- `NotificationSettingsView` — Notification preferences
- `AccountView` — Auth, logout, data export
- `TrainerSetupView` — Redo intake/assessment

**Why:** Technical settings separate from personal data to avoid confusion.

---

### Special: **SETUP FLOW** (Trainer Journey)
*Onboarding/re-onboarding flow*

This is a **linear flow**, not a navigation destination. Accessed via:
- First-run onboarding
- "Continue Setup" banner
- Settings → "Redo Trainer Setup"

**Screens:**
- `IntakeFlowView` (Phase A)
- `AssessmentFlowView` (Phase B)
- `GoalContractView` (Phase C)
- `ProgramDesignView` (Phase D)

**Why:** These are one-time or rare flows that shouldn't clutter daily navigation.

---

### Special: **ASSISTANT** (Global Overlay)
*Always accessible via floating button*

**Screens:**
- `AssistantOverlayView`
- All assistant components

**Why:** The coach should be available anywhere, anytime—not a navigation destination.

---

## Part 5: Recommended Navigation Pattern

### Option A: Adaptive Tab Bar (Recommended)

Replace the side drawer with a **bottom tab bar** that shows 4-5 primary domains:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    [MAIN CONTENT]                       │
│                                                         │
│                                                         │
├──────────┬──────────┬──────────┬──────────┬────────────┤
│  TODAY   │   PLAN   │ PROGRESS │ PROFILE  │  [Coach]   │
│    🏠    │    📅    │    📊    │    👤    │     💬     │
└──────────┴──────────┴──────────┴──────────┴────────────┘
```

**Benefits:**
- Thumb-accessible on all devices
- Clear visual hierarchy
- Industry-standard pattern
- Each domain can have internal navigation stacks
- Coach button integrates naturally

**Trade-off:** Less room for items (max 5), but forces prioritization.

---

### Option B: Enhanced Side Drawer (If Keeping Current Pattern)

Keep the drawer but reorganize with clear sections:

```
┌─────────────────────────────┐
│  AI Personal Trainer        │
│  ───────────────────────    │
│                             │
│  TODAY                      │
│    ⚡ Today's Workout       │
│    📝 Quick Workout         │
│                             │
│  PLAN                       │
│    📅 Calendar              │
│    📋 My Program            │
│                             │
│  PROGRESS                   │
│    📊 Stats                 │
│    📈 Weekly Report         │
│    ⚖️ Measurements          │
│                             │
│  PROFILE                    │
│    🎯 Goals & Preferences   │
│    🧠 Coach Memory          │
│    ⚙️ Settings              │
│                             │
│  ───────────────────────    │
│  [ Continue Trainer Setup ] │
│  ───────────────────────    │
│                             │
│  [ Sign Out ]               │
└─────────────────────────────┘
```

**Benefits:**
- More items can be shown
- Section headers provide organization
- Familiar pattern for current users

**Trade-off:** Requires extra tap to access (hidden behind gesture).

---

## Part 6: Implementation Priority

### Phase 1: Enhance Today Experience
1. Transform `HomeView` → `TodayView` with session intent
2. Add `ReadinessCheckModal`
3. Add `WorkoutSummaryView`
4. Add `CoachModeToggle`

### Phase 2: Add Planning Layer
1. Create `CalendarView`
2. Create `ProgramSummaryView`
3. Link calendar events to workouts

### Phase 3: Expand Progress Tracking
1. Create `MeasurementsView`
2. Create `WeeklyReportView`
3. Create `ProgressChartsView`

### Phase 4: Build Setup Flows
1. `IntakeFlowView` (full flow)
2. `AssessmentFlowView` (full flow)
3. `GoalContractView`
4. `ProgramDesignView`

### Phase 5: User Data Management
1. Create `UserDataHubView`
2. Create `CoachMemoryView`
3. Enhance `InfoView` organization

---

## Part 7: Folder Structure Recommendation

Align folder structure with domains:

```
Features/
├── Today/                    # Domain: Today
│   ├── TodayView.swift
│   ├── WorkoutRunner/
│   │   ├── WorkoutRunnerView.swift
│   │   └── Components/
│   │       ├── ExerciseCard.swift
│   │       ├── StrengthExerciseView.swift
│   │       ├── IsometricExerciseView.swift
│   │       ├── DurationExerciseView.swift
│   │       ├── IntervalsExerciseView.swift
│   │       └── GlowingOrbButton.swift
│   ├── ReadinessCheck/
│   ├── WorkoutSummary/
│   └── Modifications/        # Swap, Pain sheets
│
├── Plan/                     # Domain: Plan
│   ├── CalendarView.swift
│   ├── ProgramSummary/
│   └── SessionDetail/
│
├── Progress/                 # Domain: Progress
│   ├── StatsView.swift
│   ├── WeeklyReport/
│   ├── Measurements/
│   └── Charts/
│
├── Profile/                  # Domain: Profile
│   ├── UserDataHub/
│   ├── GoalsAndPreferences/  # Current Info folder
│   ├── CoachMemory/
│   └── Locations/
│
├── Settings/                 # Domain: Settings
│   └── ProfileView.swift     # Renamed to SettingsView.swift
│
├── TrainerSetup/             # Linear setup flow
│   ├── Intake/
│   ├── Assessment/
│   ├── GoalSetting/
│   └── ProgramDesign/
│
├── Assistant/                # Global overlay
│   └── (current structure)
│
└── Auth/
    └── AuthView.swift
```

---

## Summary

| Question | Answer |
|----------|--------|
| **How many screens total?** | ~69 screens (32 current + 37 new) |
| **How many domains?** | 5 primary domains + 1 setup flow + 1 global overlay |
| **Recommended navigation?** | Bottom tab bar with 5 tabs (Today, Plan, Progress, Profile, Coach) |
| **Key principle?** | Organize by user intent ("What am I trying to do?") not by data type |

The goal is to make daily usage (Today, Coach) instant and friction-free, while keeping planning, progress tracking, and profile management clearly organized and discoverable.
