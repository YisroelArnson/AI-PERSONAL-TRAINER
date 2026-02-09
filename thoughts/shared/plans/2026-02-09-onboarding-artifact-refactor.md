# Onboarding Artifact Refactor Implementation Plan

## Overview

Refactor the entire onboarding flow from an LLM-driven conversational chat to a structured, screen-by-screen intake that matches the JSX artifact in `documents/onboarding-ui-artifact.jsx`. Authentication moves from early in the flow to after all intake questions are answered. No LLM calls are made until the user signs up.

## Current State Analysis

### Current Flow
```
Welcome → Auth → OTP → Intake (LLM chat) → Assessment → NameCollection → GoalReview → ProgramReview → NotificationPermission → Success → Complete
```

**Key files:**
- `OnboardingCoordinatorView.swift` - Phase-based router
- `OnboardingStore.swift` - Singleton state manager with 11-case `OnboardingPhase` enum
- `OnboardingModels.swift` - Phase enum, `OnboardingState`, `OrbConfig`
- `WelcomeView.swift` - Single welcome screen with typewriter text
- `OnboardingAuthView.swift` - Email input + terms agreement (phase 2)
- `OTPVerificationView.swift` - OTP code verification (phase 3)
- `IntakeView.swift` - LLM-driven conversational chat with streaming
- `IntakeSessionStore.swift` - Backend-connected streaming intake service
- `OnboardingAssessmentView.swift` - Optional fitness assessment
- `NameCollectionView.swift` - Name input + triggers LLM goal generation
- `GoalReviewView.swift` - LLM-generated goals, editable
- `ProgramReviewView.swift` - LLM-generated program, editable
- `NotificationPermissionView.swift` - Push notification request
- `OnboardingSuccessView.swift` - Completion with confetti

### Problems with Current Flow
1. Auth happens too early (screen 2) creating friction before value demonstration
2. Intake uses LLM streaming chat requiring backend, auth, and network connectivity
3. Single welcome screen doesn't establish the AI trainer personality
4. No structured data collection - the LLM extracts information from conversation
5. Limited question coverage compared to the artifact's 22+ structured questions

## Desired End State

### New Flow
```
Intro1 → Intro2 → Intro3 → Intro4("Begin") →
Name → Age → Gender → Goals → Timeline → ExperienceLevel → Frequency →
CurrentRoutine → PastAttempts → HobbySports → Height → Weight → BodyComp →
PhysicalBaseline → Mobility → Injuries → HealthNuances → Supplements →
ActivityLevel → Sleep → Nutrition → Environment → MovementPrefs →
CoachingStyle → AnythingElse → Complete →
Auth → OTP → [Sync intake to backend] → GoalReview → ProgramReview →
NotificationPermission → Success → Complete
```

### Screen Types (matching artifact)
| Type | Screens | UI Pattern |
|------|---------|------------|
| `intro` | 4 unique layouts | Tap-to-advance, orb animations, staggered text |
| `textInput` | name | Keyboard input, auto-focus |
| `stepper` | age, height, weight | +/- buttons, large centered value |
| `simpleSelect` | gender | Rectangular option buttons |
| `voice` | 16 screens | Mic + textarea + optional pills |
| `guidedVoice` | goals, physicalBaseline | Mic + textarea + sub-prompt bullets |
| `complete` | 1 | Orb + personalized message + CTA |

### Section Labels (for segmented progress bar)
ABOUT YOU, YOUR GOALS, TRAINING HISTORY, BODY METRICS, FITNESS BASELINE, HEALTH, LIFESTYLE, EQUIPMENT, PREFERENCES, ALMOST DONE

### Verification
- The onboarding opens to intro screen 1 with large orb and "I'm your trainer."
- Tapping advances through all 4 intro screens with unique layouts
- After "Begin", user proceeds through ~22 structured question screens
- Progress bar is segmented by section, fills proportionally
- Top bar shows animated section label transitions and back button
- Voice screens show mic button that expands into waveform pill when recording
- Pills are horizontally scrollable for quick-select answers
- All answers stored locally (no backend calls)
- Complete screen shows "Create my program" CTA
- Auth screen appears AFTER intake complete
- After auth + OTP, intake data syncs to backend
- Program generation triggers after sync
- GoalReview → ProgramReview → NotificationPermission → Success flow unchanged

## What We're NOT Doing

1. **Changing the backend intake API** - We store data locally and sync it after auth. The backend intake endpoints remain available for future use but the onboarding no longer streams through them.
2. **Modifying GoalReview or ProgramReview views** - These post-auth screens stay as-is.
3. **Changing the main app experience** - `AppView.swift`'s `isOnboardingComplete` check remains unchanged.
4. **Removing IntakeView entirely** - It can stay for standalone use (settings re-intake). We just stop using it in onboarding.
5. **Changing SpeechManager** - The existing speech recognition service works as-is.
6. **Backend schema migrations** - We sync intake data as a JSON blob to the existing `trainer_intake_summaries` table. Schema changes are out of scope.

## Implementation Approach

The refactor is organized into 8 phases, each producing a testable milestone. We build bottom-up: data models first, then shared components, then screen types, then the coordinator, then auth relocation, then post-auth sync, then cleanup.

---

## Phase 1: Data Models & State Management

### Overview
Define the new screen data model, section system, local intake storage, and refactored phase enum. This is the foundation everything else builds on.

### Changes Required:

#### 1. New File: `OnboardingScreenData.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Models/OnboardingScreenData.swift`

Define the screen configuration model (Swift equivalent of the artifact's `SCREENS` array):

```swift
import Foundation

// MARK: - Screen Types

enum OnboardingScreenType: String, Codable {
    case intro
    case textInput
    case stepper
    case simpleSelect
    case voice
    case guidedVoice
    case complete
}

// MARK: - Section Labels

enum OnboardingSection: String, CaseIterable {
    case aboutYou = "ABOUT YOU"
    case yourGoals = "YOUR GOALS"
    case trainingHistory = "TRAINING HISTORY"
    case bodyMetrics = "BODY METRICS"
    case fitnessBaseline = "FITNESS BASELINE"
    case health = "HEALTH"
    case lifestyle = "LIFESTYLE"
    case equipment = "EQUIPMENT"
    case preferences = "PREFERENCES"
    case almostDone = "ALMOST DONE"
}

// MARK: - Screen Definition

struct OnboardingScreen: Identifiable {
    let id: String
    let type: OnboardingScreenType

    // Intro screens
    var headline: String?
    var body: String?
    var orbSize: CGFloat?
    var cta: String?

    // Question screens
    var label: OnboardingSection?
    var question: String?
    var sub: String?
    var placeholder: String?
    var field: String?

    // Stepper
    var min: Int?
    var max: Int?
    var initial: Int?
    var unit: String?
    var displayFn: ((Int) -> String)?

    // Select
    var options: [String]?

    // Voice / Guided Voice
    var pills: [String]?
    var prompts: [String]?
}
```

Then define the full `SCREENS` array as a static constant matching the artifact's 30 screens exactly (4 intro + 22 questions + 1 complete + padding).

#### 2. New File: `LocalIntakeData.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Models/LocalIntakeData.swift`

Local storage for all intake answers before auth:

```swift
struct LocalIntakeData: Codable {
    var name: String?
    var age: Int?
    var gender: String?
    var goals: String?
    var timeline: String?
    var experienceLevel: String?
    var frequency: String?
    var currentRoutine: String?
    var pastAttempts: String?
    var hobbySports: String?
    var height: Int?
    var weight: Int?
    var bodyComp: String?
    var physicalBaseline: String?
    var mobility: String?
    var injuries: String?
    var healthNuances: String?
    var supplements: String?
    var activityLevel: String?
    var sleep: String?
    var nutrition: String?
    var environment: String?
    var movementPrefs: String?
    var coachingStyle: String?
    var anythingElse: String?

    // Helper to get/set by field name string
    subscript(field: String) -> Any? { ... }
}
```

#### 3. Refactor `OnboardingModels.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Models/OnboardingModels.swift`

Change `OnboardingPhase` to reflect the new macro-level flow:

```swift
enum OnboardingPhase: String, Codable, CaseIterable {
    case intro = "intro"              // 4 intro screens
    case intake = "intake"            // 22 structured question screens
    case intakeComplete = "intake_complete"  // "Create my program" screen
    case auth = "auth"                // Email entry
    case authVerification = "auth_verification"  // OTP
    case goalReview = "goal_review"   // LLM-generated goals (post-auth)
    case programReview = "program_review"  // LLM-generated program
    case notificationPermission = "notification_permission"
    case success = "success"
    case complete = "complete"
}
```

Update `OnboardingState` to include:
- `var intakeData: LocalIntakeData` (replaces body metrics fields)
- `var currentStep: Int` (step index within intro/intake phases)
- Remove `assessmentSkipped`, `assessmentSkippedAt`, `assessmentSessionId` (assessment removed)
- Keep auth fields, session IDs, notification fields

#### 4. Refactor `OnboardingStore.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift`

Add step-based navigation within the intake phase:

```swift
// New properties
@Published var currentStep: Int = 0

// Computed
var currentScreen: OnboardingScreen { OnboardingScreens.all[currentStep] }
var isInIntro: Bool { currentScreen.type == .intro }
var isInIntake: Bool { state.currentPhase == .intake }

// Step navigation
func goToNextStep() { ... }
func goToPreviousStep() { ... }

// Intake data
func setIntakeField(_ field: String, value: Any) { ... }
func getIntakeField(_ field: String) -> Any? { ... }

// Sync after auth
func syncIntakeToBackend() async { ... }
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with no errors after model changes
- [ ] `LocalIntakeData` encodes/decodes correctly (unit test)
- [ ] `OnboardingScreen` array has correct count (30 screens)
- [ ] `OnboardingPhase` migration handles old phase values via custom decoder

#### Manual Verification:
- [ ] Existing app still launches (no regression from model changes)

---

## Phase 2: Shared UI Components

### Overview
Build the reusable UI components that multiple screen types need: segmented progress bar, top bar with animated labels, voice bottom bar with waveform, pills row, and chevron button.

### Changes Required:

#### 1. New File: `SegmentedProgressBar.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/SegmentedProgressBar.swift`

Segmented progress bar matching the artifact's `SegmentedProgress` component:

```swift
struct SegmentedProgressBar: View {
    let currentStep: Int  // Current step index (within intake screens only)

    // Computes sections from OnboardingScreens, renders one segment per section
    // Each segment fills proportionally based on how far through that section we are
    // 4px gap between segments, 3pt height, rounded ends
    // Fill color: AppTheme.Colors.primaryText
    // Background: AppTheme.Colors.surface
    // Animated width transitions: 0.4s cubic-bezier
}
```

#### 2. New File: `OnboardingTopBar.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/OnboardingTopBar.swift`

Top bar with animated section label transitions (matching artifact's `TopBar`):

```swift
struct OnboardingTopBar: View {
    let label: String?
    let previousLabel: String?
    let showBack: Bool
    let onBack: () -> Void

    // 44pt height, 20px horizontal padding
    // Back chevron (left side) - 36x36 hit target, fades opacity
    // Center: section label with crossfade animation when label changes
    // Label style: 12pt, weight 500, uppercase, letter-spacing 0.05em, tertiaryText color
    // 36px spacer on right for balance
}
```

#### 3. New File: `VoiceBottomBar.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/VoiceBottomBar.swift`

Mic button that expands to waveform pill when recording (matching artifact's `VoiceBottomBar`):

```swift
struct VoiceBottomBar: View {
    let recording: Bool
    let hasAnswer: Bool
    let onMic: () -> Void
    let onNext: () -> Void

    // Padding: 12px top, 20px sides, 32px bottom
    // When idle: circular mic button (52pt) + flex spacer + ChevronButton
    // When recording: mic expands to pill shape with waveform visualization
    //   - pill has red tint background, red square stop icon, animated waveform bars
    //   - ChevronButton hidden during recording
}
```

#### 4. New File: `WaveformView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/WaveformView.swift`

Animated waveform bars (matching artifact's `Waveform`):

```swift
struct WaveformView: View {
    let active: Bool

    // 20 bars, 3px width, 2px border radius
    // When active: random heights (6-20px), animated with staggered timing
    // When inactive: all bars 4px height, tertiaryText color
    // Active color: danger (red)
}
```

#### 5. New File: `ChevronButton.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/ChevronButton.swift`

Right-arrow pill button for advancing (matching artifact's `ChevronButton`):

```swift
struct ChevronButton: View {
    let enabled: Bool
    let action: () -> Void

    // 88x52pt, pill radius (26pt)
    // Enabled: white background, dark chevron
    // Disabled: surface background, tertiaryText chevron
    // Right-pointing chevron icon (9 18l6-6-6-6)
}
```

#### 6. New File: `PillsRow.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/PillsRow.swift`

Horizontally scrollable quick-select pills (matching artifact's `PillsRow`):

```swift
struct PillsRow: View {
    let pills: [String]
    let selected: String?
    let onSelect: (String) -> Void

    // Horizontal ScrollView, 8px gap, 20px horizontal padding
    // Each pill: 9px vertical, 16px horizontal padding
    // Selected: accent background, dark text
    // Unselected: surface background, secondaryText
    // Pill radius, 13pt font, weight 500
    // Hidden scrollbar
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with all new components
- [ ] Preview providers render correctly for each component

#### Manual Verification:
- [ ] SegmentedProgressBar shows correct number of segments and fills
- [ ] OnboardingTopBar animates label transitions smoothly
- [ ] VoiceBottomBar mic button expands/contracts with recording state
- [ ] WaveformView bars animate with random heights
- [ ] PillsRow scrolls horizontally, selection highlights correctly
- [ ] ChevronButton enables/disables visually

---

## Phase 3: Intro Screens

### Overview
Build the 4 unique intro screen layouts that replace the current single `WelcomeView`. Each has distinct orb placement, text layout, and animation timing.

### Changes Required:

#### 1. New File: `IntroScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/IntroScreenView.swift`

Four unique layouts matching the artifact's `IntroScreen`:

```swift
struct IntroScreenView: View {
    let screen: OnboardingScreen
    let step: Int
    let onNext: () -> Void

    // Tap-to-advance on the entire screen
    // Each screen has a unique background glow gradient
    // Staggered animation: elements fade up with increasing delays

    // Screen 1 (intro1): Large orb (140pt) centered, breathing animation,
    //   "I'm your trainer." below, "Tap to continue" at bottom
    //
    // Screen 2 (intro2): Small orb (36pt) top-left, headline left-aligned,
    //   body text as 4 separate lines staggering in, "Tap to continue"
    //
    // Screen 3 (intro3): Medium orb (64pt) centered, pulsing animation,
    //   centered headline + two body paragraphs, "Tap to continue"
    //
    // Screen 4 (intro4): Medium orb (56pt) centered, settle animation,
    //   centered headline + body, "Begin" button at bottom
}
```

**Orb animations to implement:**
- `orbBreathe` - scale 1.0 ↔ 1.06 with glow expansion (4s cycle)
- `orbFloat` - scale 1.0 ↔ 1.04 with gentle shadow (4s cycle)
- `orbPulseActive` - scale 1.0 → 1.08 → 0.97 → 1.0 (2s cycle)
- `orbSettle` - scale 1.04 → 1.0 then transition to orbFloat

**Background glow colors** (radial gradients at ~6-8% opacity):
- Screen 1: center, dodger blue
- Screen 2: offset left, lighter blue
- Screen 3: offset right, cyan-blue
- Screen 4: center, subtle blue

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with IntroScreenView
- [ ] Preview renders all 4 screen variants

#### Manual Verification:
- [ ] Screen 1: large orb breathing, headline fades up after delay
- [ ] Screen 2: small orb top-left, body lines stagger in sequentially
- [ ] Screen 3: orb pulsing, text centered, two-paragraph layout
- [ ] Screen 4: orb settles, "Begin" button visible
- [ ] All screens advance on tap
- [ ] Background glows are subtle and visible on dark background

---

## Phase 4: Intake Screen Types

### Overview
Build the 6 screen type views that handle all intake questions. Each matches the corresponding component in the artifact.

### Changes Required:

#### 1. New File: `TextInputScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/TextInputScreenView.swift`

```swift
struct TextInputScreenView: View {
    let screen: OnboardingScreen
    let value: String
    let onChange: (String, String) -> Void
    let onNext: () -> Void

    // Vertically centered content
    // Question: 28pt, bold, primaryText
    // TextField: full width, 16px padding, surface background, medium corner radius
    //   - 18pt, weight 500, auto-focus after 300ms
    //   - Enter key submits
    // SimpleBottomBar at bottom (just ChevronButton, right-aligned)
}
```

#### 2. New File: `StepperScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/StepperScreenView.swift`

```swift
struct StepperScreenView: View {
    let screen: OnboardingScreen
    let value: Int?
    let onChange: (String, Int) -> Void
    let onNext: () -> Void

    // Question at top: 28pt, bold
    // Centered: - button (52pt circle, surface) | value (56pt, bold) | + button
    // Value display uses displayFn if provided (e.g., height: 5'8")
    // Unit label below value: 13pt, tertiaryText, uppercase
    // SimpleBottomBar at bottom (always enabled since stepper has default value)
}
```

#### 3. New File: `SimpleSelectScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/SimpleSelectScreenView.swift`

```swift
struct SimpleSelectScreenView: View {
    let screen: OnboardingScreen
    let value: String?
    let onChange: (String, String) -> Void
    let onNext: () -> Void

    // Question: 28pt, bold, 8px margin bottom
    // Sub text (if present): 15pt, secondaryText
    // Centered vertically: column of option buttons
    //   - Full width, 16px vertical / 20px horizontal padding, left-aligned
    //   - Selected: accent background, dark text
    //   - Unselected: surface background, primaryText
    //   - large corner radius, 16pt, weight 500
    //   - 8px gap between options
    // SimpleBottomBar (enabled when value selected)
}
```

#### 4. New File: `VoiceScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/VoiceScreenView.swift`

```swift
struct VoiceScreenView: View {
    let screen: OnboardingScreen
    @Binding var value: String
    let onChange: (String, String) -> Void
    let onNext: () -> Void

    @StateObject private var speechManager = SpeechManager()
    @State private var isRecording = false
    @State private var text = ""

    // Question: 32pt, bold, 12px margin bottom
    // Sub text: 15pt, secondaryText
    // Textarea: transparent background, 18pt, placeholder "Speak or type..."
    //   - Flex-grows to fill space
    //   - margin-top 28px from sub text
    // PillsRow: shown when no answer and not recording
    // VoiceBottomBar: mic + chevron
    //
    // Mic behavior:
    //   - Tap to start recording → clears text, starts SpeechManager
    //   - Tap to stop → stops SpeechManager, keeps transcribed text
    //   - Pill tap → sets text, stops recording
    //   - Text editing → updates field directly
}
```

#### 5. New File: `GuidedVoiceScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/GuidedVoiceScreenView.swift`

```swift
struct GuidedVoiceScreenView: View {
    // Same as VoiceScreenView but with sub-prompts rendered as bullet list
    // Question: 32pt, bold, 20px margin bottom
    // Prompts: rendered as bullet points (5px dot + 15pt secondaryText)
    //   - 14px vertical gap between prompts
    //   - 12px gap from dot to text
    // Textarea below prompts
    // PillsRow + VoiceBottomBar same as VoiceScreenView
}
```

#### 6. New File: `IntakeCompleteScreenView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/IntakeCompleteScreenView.swift`

```swift
struct IntakeCompleteScreenView: View {
    let userName: String?
    let onCreateProgram: () -> Void
    let onStartOver: () -> Void

    // Centered vertically:
    //   - Orb (100pt)
    //   - "Got it, {name}." - 28pt, bold
    //   - "I have everything I need..." - 16pt, secondaryText
    // Bottom:
    //   - "Create my program" button (full width, accent, pill radius)
    //   - "Start over" link (transparent, secondaryText) -- optional, for dev/testing
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with all 6 screen type views
- [ ] Preview providers render for each screen type

#### Manual Verification:
- [ ] TextInput auto-focuses, Enter key advances
- [ ] Stepper +/- buttons increment/decrement within min/max bounds
- [ ] Stepper displays height in feet/inches format for height field
- [ ] SimpleSelect highlights selected option, enables chevron
- [ ] Voice screen records speech, transcription appears in textarea
- [ ] Voice pills populate textarea on tap
- [ ] GuidedVoice shows bullet sub-prompts above textarea
- [ ] Complete screen shows personalized message with user's name

---

## Phase 5: Intake Coordinator & Main Coordinator Refactor

### Overview
Build the new `IntakeCoordinatorView` that drives step-based navigation within the intake phase, and refactor `OnboardingCoordinatorView` to use the new phase/step system.

### Changes Required:

#### 1. New File: `IntakeCoordinatorView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/IntakeCoordinatorView.swift`

This view manages navigation through all 30 screens (4 intro + 22 questions + 1 complete + transition screens):

```swift
struct IntakeCoordinatorView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    var body: some View {
        VStack(spacing: 0) {
            // Top bar (hidden during intro screens)
            if !onboardingStore.isInIntro && currentScreen.type != .complete {
                OnboardingTopBar(...)
                SegmentedProgressBar(currentStep: adjustedStep)
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
            }

            // Screen content (keyed by step for transition animation)
            currentScreenView
                .id(onboardingStore.currentStep)
                .transition(slideTransition)
        }
    }

    @ViewBuilder
    private var currentScreenView: some View {
        switch currentScreen.type {
        case .intro: IntroScreenView(...)
        case .textInput: TextInputScreenView(...)
        case .stepper: StepperScreenView(...)
        case .simpleSelect: SimpleSelectScreenView(...)
        case .voice: VoiceScreenView(...)
        case .guidedVoice: GuidedVoiceScreenView(...)
        case .complete: IntakeCompleteScreenView(...)
        }
    }
}
```

#### 2. Refactor `OnboardingCoordinatorView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/OnboardingCoordinatorView.swift`

Simplify to handle macro phases:

```swift
@ViewBuilder
private var currentPhaseView: some View {
    switch onboardingStore.state.currentPhase {
    case .intro, .intake, .intakeComplete:
        IntakeCoordinatorView()  // Handles all intro + intake + complete screens

    case .auth:
        OnboardingAuthView()

    case .authVerification:
        OTPVerificationView()

    case .goalReview:
        GoalReviewView()

    case .programReview:
        ProgramReviewView()

    case .notificationPermission:
        NotificationPermissionView()

    case .success:
        OnboardingSuccessView()

    case .complete:
        EmptyView()
    }
}
```

Remove the orb overlay from the coordinator (intro screens manage their own orbs, intake screens don't show one). Remove the old `ThinTopBar` and `OnboardingProgressBar` usage for intro/intake phases.

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with both coordinator views
- [ ] No references to removed phases (assessment, welcome)

#### Manual Verification:
- [ ] App launches to intro screen 1
- [ ] Can tap through all 4 intro screens
- [ ] "Begin" on screen 4 transitions to name input
- [ ] Can navigate forward through all 22 intake questions
- [ ] Back button works and goes to previous screen
- [ ] Section labels animate when crossing section boundaries
- [ ] Progress bar segments fill correctly per section
- [ ] Complete screen appears after last question
- [ ] "Create my program" advances to auth screen

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the full intro → intake → complete flow works correctly before proceeding to Phase 6.

---

## Phase 6: Auth Flow Relocation

### Overview
Move authentication to after intake completion. After OTP verification, sync local intake data to the backend.

### Changes Required:

#### 1. Modify `OnboardingAuthView.swift`
- Update the trainer message from "Let's save your progress — what's your email?" to something like "Let's create your account so I can build your program."
- Keep all existing functionality (email input, terms checkbox, OTP send)
- On successful OTP send, still navigate to `.authVerification`

#### 2. Modify `OTPVerificationView.swift`
- After successful verification, call `onboardingStore.completeAuth()` which now advances to `.goalReview` (instead of `.intake`)
- Add intake data sync: after auth completes, trigger `onboardingStore.syncIntakeToBackend()`

#### 3. Update `OnboardingStore.swift` - Auth completion
```swift
func completeAuth() async {
    navigationDirection = .forward

    // Sync local intake data to backend now that user is authenticated
    await syncIntakeToBackend()

    // Start goal generation in background
    await startGoalGeneration()

    // Move to goal review
    state.currentPhase = .goalReview
    await saveAndSync()
}
```

#### 4. Implement `syncIntakeToBackend()` in `OnboardingStore.swift`
Convert `LocalIntakeData` to the format expected by the backend API:

```swift
func syncIntakeToBackend() async {
    // Option A: Create intake session + submit all answers as a batch
    // Option B: POST a pre-built summary directly to the intake summary endpoint
    //
    // Recommended: Option B - POST the local data as a pre-built summary
    // to /trainer/intake/sessions/{id}/summary or a new endpoint.
    // This avoids needing to simulate a conversation.

    // Fallback: store locally and retry later if sync fails
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with auth flow changes
- [ ] No compilation errors in OTPVerificationView or OnboardingAuthView

#### Manual Verification:
- [ ] After completing intake, auth screen appears (not before)
- [ ] Email + OTP flow works as before
- [ ] After OTP verification, intake data syncs to backend
- [ ] Goal generation starts automatically after auth
- [ ] GoalReview screen appears with generated goals

**Implementation Note**: After completing this phase, pause for manual confirmation that the auth → sync → goal generation pipeline works end-to-end.

---

## Phase 7: Post-Auth Flow Connection

### Overview
Connect the post-auth flow: goal generation uses local intake data, program generation works as before, and the full flow completes successfully.

### Changes Required:

#### 1. Update goal generation trigger
The `GoalContractStore.draft()` call currently happens in `NameCollectionView`. Move it to after auth completion:

```swift
// In OnboardingStore.completeAuth():
// After sync, trigger goal draft
Task {
    await GoalContractStore.shared.draft()
    if let goalId = GoalContractStore.shared.contract?.id {
        setGoalContractId(goalId)
    }
}
```

#### 2. Update GoalReviewView
- Remove the `NameCollectionView` dependency (name is already in `LocalIntakeData`)
- `userName` now reads from `onboardingStore.state.intakeData.name`
- Goal generation may still be loading when GoalReview appears (show loading state)

#### 3. Update ProgramReviewView
- Ensure it still drafts program after goals are approved
- `userName` reads from `onboardingStore.state.intakeData.name`

#### 4. Update OnboardingSuccessView
- `userName` reads from `onboardingStore.state.intakeData.name`

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with all post-auth flow changes
- [ ] No references to removed `NameCollectionView` in active code paths

#### Manual Verification:
- [ ] Full end-to-end flow: Intro → Intake → Auth → GoalReview → ProgramReview → Notifications → Success → Main App
- [ ] Goals generate correctly using synced intake data
- [ ] Program generates correctly using approved goals
- [ ] User's name appears correctly on GoalReview, ProgramReview, and Success screens

**Implementation Note**: This is the critical integration phase. After completion, test the entire flow end-to-end before proceeding to cleanup.

---

## Phase 8: Cleanup & Polish

### Overview
Remove deprecated code, clean up unused files, and ensure the codebase is tidy.

### Changes Required:

#### 1. Remove or deprecate files no longer used in onboarding:
- `WelcomeView.swift` - Replaced by IntroScreenView
- `NameCollectionView.swift` - Name now collected as first intake question
- `OnboardingAssessmentView.swift` - Assessment removed from onboarding
- Old `OnboardingProgressBar.swift` - Replaced by SegmentedProgressBar (keep if used elsewhere)

#### 2. Clean up `OnboardingModels.swift`:
- Remove `IntakeTopic` enum (replaced by `OnboardingSection`)
- Remove assessment-related fields from `OnboardingState`
- Remove old phase migration mappings that reference removed phases

#### 3. Clean up `OnboardingStore.swift`:
- Remove `completeIntake(withAssessment:)` method
- Remove `completeAssessment()` method
- Remove assessment-related computed properties
- Simplify `startOnboarding()` to go to `.intro` phase

#### 4. Update `IntakeView.swift`:
- Remove onboarding context support if no longer needed
- Keep standalone mode for settings-based re-intake

#### 5. Animation Polish:
- Ensure all transitions match artifact timing (0.3-0.6s ease)
- Verify orb animations match the 4 intro screen specs
- Confirm staggered text reveals use correct delay intervals
- Test section label crossfade animation

### Success Criteria:

#### Automated Verification:
- [ ] Project builds cleanly with no warnings about unused code
- [ ] No dead code references to removed files
- [ ] All SwiftUI previews render

#### Manual Verification:
- [ ] Complete end-to-end onboarding flow works
- [ ] All animations are smooth at 60fps
- [ ] Voice recording works correctly throughout
- [ ] Back navigation works at every step
- [ ] Progress bar accurately reflects position
- [ ] No visual glitches during screen transitions
- [ ] App handles interruptions gracefully (backgrounding, phone calls)

---

## Testing Strategy

### Unit Tests:
- `LocalIntakeData` serialization/deserialization
- `OnboardingScreen` array integrity (correct count, no missing fields)
- `OnboardingStore` step navigation (bounds checking, section detection)
- `OnboardingPhase` migration from old values

### Integration Tests:
- Full flow from intro through intake complete
- Auth → sync → goal generation pipeline
- State persistence across app restarts

### Manual Testing Steps:
1. Fresh install: verify intro screen 1 appears
2. Tap through all 4 intro screens, verify each layout
3. Complete all 22 intake questions using:
   - Keyboard input (name)
   - Stepper controls (age, height, weight)
   - Selection buttons (gender)
   - Voice recording (at least 3 questions)
   - Quick-select pills (at least 3 questions)
   - Typed text in textarea (at least 3 questions)
4. Verify progress bar fills correctly across sections
5. Navigate backward through multiple sections
6. Complete intake and verify complete screen
7. Sign up with email, verify OTP
8. Verify goal generation starts automatically
9. Review and approve goals
10. Review and activate program
11. Handle notification permission
12. Verify success screen and transition to main app
13. Kill and relaunch app mid-onboarding - verify state restoration

## Performance Considerations

- **Local-first storage** eliminates network latency during intake (major UX improvement)
- **Step-based rendering** only instantiates one screen view at a time
- **Speech recognition** should be lazy-initialized (only when mic is tapped)
- **Orb animations** use SwiftUI's built-in animation system (GPU-accelerated)
- **Memory**: no large conversation transcript to hold in memory
- **Battery**: no persistent network connections during intake

## Migration Notes

### UserDefaults State Migration
The `OnboardingState` struct is changing significantly. Users mid-onboarding will need migration:

1. If `currentPhase` decodes to an old value (`welcome`, `assessment`, etc.), reset to `.intro`
2. Old body metrics fields (`weightKg`, `heightCm`, etc.) should map to new `LocalIntakeData` fields
3. Auth-related fields (`pendingEmail`, `agreedToTermsAt`) remain unchanged
4. Add a `stateVersion` field to detect when migration is needed

### Backend Compatibility
- The backend intake endpoints (`/trainer/intake/sessions/*`) remain unchanged
- A new sync endpoint or adaptation of the existing confirm endpoint will accept the structured `LocalIntakeData`
- Goal and program generation endpoints are unchanged - they receive intake summary data

## References

- Artifact: `documents/onboarding-ui-artifact.jsx`
- Current onboarding plan: `thoughts/shared/plans/2026-02-02-onboarding-flow.plan.md`
- Previous overhaul plan: `thoughts/shared/plans/2026-02-04-onboarding-flow-overhaul.md`
- Architecture research: `thoughts/shared/research/2026-02-04-onboarding-flow-architecture.md`
- Intake architecture: `thoughts/shared/research/2026-02-01-intake-and-logging-architecture.md`
- Database schema: `BACKEND/database/trainer_intake_schema.sql`
