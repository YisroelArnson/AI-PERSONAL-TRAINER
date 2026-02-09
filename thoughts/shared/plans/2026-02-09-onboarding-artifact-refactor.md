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
IntroHero → IntroNarration → IntroCTA("Get Started") →
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
| `introHero` | 1 | Large centered orb, tagline below, tap to advance |
| `introNarration` | 1 | Small orb left-aligned, emits text lines word-by-word, auto-advances |
| `introCTA` | 1 | Centered orb, headline, "Get Started" button |
| `textInput` | name | Keyboard input, auto-focus |
| `stepper` | age, height, weight | +/- buttons, large centered value |
| `simpleSelect` | gender | Rectangular option buttons |
| `voice` | 16 screens | Mic + textarea + optional pills |
| `guidedVoice` | goals, physicalBaseline | Mic + textarea + sub-prompt bullets |
| `complete` | 1 | Orb + personalized message + CTA |

### Section Labels (for segmented progress bar)
ABOUT YOU, YOUR GOALS, TRAINING HISTORY, BODY METRICS, FITNESS BASELINE, HEALTH, LIFESTYLE, EQUIPMENT, PREFERENCES, ALMOST DONE

### Verification
- The onboarding opens to the hero screen with large centered orb and "Meet your pocket-sized personal trainer."
- Tapping advances to the narration screen where the orb shrinks, moves left, and emits 4 lines of text word-by-word
- After narration completes, the orb returns to center with "Get Started" button
- Tapping "Get Started" proceeds through ~22 structured question screens
- Progress bar is segmented by section, fills proportionally
- Top bar shows animated section label transitions and back button
- Voice screens show mic button that expands into waveform pill when recording
- Pills are horizontally scrollable for quick-select answers
- All answers stored locally (no backend calls)
- Complete screen shows "Create my program" CTA
- Auth screen appears AFTER intake complete
- After auth + OTP, intake data syncs to backend
- GoalReview shows LLM-generated goal *options* as tappable cards; user can select, suggest changes via voice/text, iterate, and confirm
- ProgramReview shows the full program as scrollable markdown with mic + text input for suggesting edits
- Flow: GoalReview (options) → ProgramReview (markdown) → NotificationPermission → Success

## What We're NOT Doing

1. **Changing the main app experience** - `AppView.swift`'s `isOnboardingComplete` check remains unchanged.
2. **Changing SpeechManager** - The existing speech recognition service works as-is.
3. **Keeping the old conversational intake** - The LLM-driven chat intake (`IntakeView`, `IntakeSessionStore`, streaming SSE endpoints) will be removed entirely. The structured onboarding flow replaces it for all use cases — if a user needs to redo their intake, they retake the onboarding screens.

## What We ARE Changing on the Backend

1. **New intake submission endpoint** - Replace the streaming conversation endpoints with a single `POST /trainer/intake/submit` that accepts the structured `LocalIntakeData` JSON and stores it directly.
2. **New goal options endpoint** - Replace single-goal `POST /trainer/goals/draft` with `POST /trainer/goals/options` that returns 3-4 concrete goal options. Edit endpoint regenerates the options list. New confirm endpoint locks in the selected option.
3. **Program markdown** - Update `POST /trainer/programs/draft` (and edit) to return a `program_markdown` field alongside the existing structured JSON.
4. **Schema updates** - Update `trainer_intake_summaries` table to store structured intake fields directly (not just a summary blob). Remove or archive the streaming-related tables (`trainer_intake_events`, `trainer_intake_checklist`).
5. **Remove streaming endpoints** - Remove `POST /sessions/:id/answers` (SSE streaming), `POST /sessions/:id/confirm`, and related conversational infrastructure.

## Implementation Approach

The refactor is organized into 11 phases, each producing a testable milestone. We build bottom-up: data models first, then shared components, then screen types, then coordinators, then auth relocation, then **backend changes** (schema + new endpoints), then goal review redesign, then program review redesign, then post-auth wiring, then cleanup.

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
Build a 3-screen intro sequence that introduces the app's value proposition through an animated orb "narrator" pattern. The orb is the central character — it appears large, shrinks to narrate, then returns to center with a CTA.

### Screen Flow & Animation Choreography

#### Screen 1: Hero Reveal (`introHero`)
**Layout:** Centered, minimal, dramatic.
- Large orb (140pt) centered vertically, breathing animation (scale 1.0 ↔ 1.06, 4s cycle) with blue glow
- After 0.5s delay, tagline fades up below the orb:
  > **"Meet your pocket-sized personal trainer."**
- Style: 28pt, bold, primaryText, centered, max-width ~280px
- Subtle background glow: radial gradient centered, dodger blue at ~6% opacity
- "Tap to continue" hint at bottom (13pt, tertiaryText), fades in after 1.2s
- **Tap anywhere to advance**

#### Screen 2: Orb Narration (`introNarration`)
**Layout:** The orb becomes a narrator — it shrinks, moves to the left margin, and "emits" lines of text.

**Animation sequence (all choreographed, no user interaction needed):**
1. **Orb transition** (0.6s spring): Orb shrinks from 140pt → 32pt, moves from center to left-aligned position (x: 28px, y: first line baseline). Glow reduces proportionally.
2. **Line 1 appears** (after 0.8s): Whole words fade in one-at-a-time (0.08s gap between words, each word fades from opacity 0→1 over 0.25s — NOT character-by-character):
   > "I make getting in shape simple."
3. **Orb moves down** (0.4s ease) to next line position
4. **Line 2 appears** (same word-by-word fade-in):
   > "I'll build a workout plan around your life, your goals, and your body."
5. **Orb moves down** to next line position
6. **Line 3 appears** (same word-by-word fade-in):
   > "As you progress, I adapt — so your plan always fits."
7. **Orb moves down** to next line position
8. **Line 4 appears** (same word-by-word fade-in):
   > "And when you're training, I'm right there to guide every rep."
9. **Pause** 0.8s after last word
10. **Auto-advance** to Screen 3

**Text animation detail (important):**
- This is a **word fade-in** effect, not a typewriter/character effect. Each whole word appears at once by fading from invisible to visible.
- The existing `TypewriterTextView` component already works this way (despite its misleading name) — it splits text on spaces and fades each word's opacity 0→1 sequentially with `wordDelay` between them.
- For the narration screen, we reuse/adapt this pattern but chain it line-by-line: each line's `onComplete` callback triggers the orb moving down and the next line starting.
- The component could be renamed to `WordFadeTextView` during cleanup for clarity.

**Text styling:**
- Each line: 17pt, regular weight, secondaryText color, left-aligned, 1.6 line height
- Lines are spaced ~32px apart vertically
- The orb sits to the left of each line as it types, acting as a cursor/narrator
- Lines remain visible after appearing (they don't fade out)
- Subtle background glow: offset left, lighter blue at ~5% opacity

**Implementation detail:**
- Reuse the existing `TypewriterTextView` component (which already does word-by-word fade-in, not character-by-character — each word fades from opacity 0→1 as a unit)
- Orb position animated with `.matchedGeometryEffect` or explicit offset animation
- Each line triggers after the previous completes (callback chaining via `onComplete`)
- The orb's vertical position tracks `lineIndex * lineSpacing`
- User CAN tap to skip ahead to Screen 3 at any time

#### Screen 3: Call to Action (`introCTA`)
**Layout:** Orb returns to center, clean CTA.

**Animation:**
1. **Orb transition** (0.6s spring): Orb grows from 32pt → 56pt, moves from left position back to center. Settle animation (scale 1.04 → 1.0, then gentle float).
2. **Headline fades up** (0.5s, 0.3s delay):
   > **"Let's build your program."**
   - Style: 28pt, bold, primaryText, centered
3. **Subtext fades up** (0.5s, 0.5s delay):
   > "I'll ask some questions — talk or type. The more I know, the better your plan."
   - Style: 16pt, regular, secondaryText, centered, max-width 280px
4. **"Get Started" button fades up** (0.3s, 0.8s delay):
   - Full-width pill button, accent background, 16pt semibold, dark text
   - Centered at bottom with 40px bottom padding

- Subtle background glow: centered, subtle blue at ~5% opacity
- **Tap button to advance to intake questions**

### Changes Required:

#### 1. New File: `IntroHeroView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/IntroHeroView.swift`

```swift
struct IntroHeroView: View {
    let onNext: () -> Void

    @State private var showTagline = false
    @State private var showHint = false

    // - Large orb (140pt) with orbBreathe animation
    // - Tagline fades up after 0.5s
    // - "Tap to continue" fades in after 1.2s
    // - Entire screen is tappable
}
```

#### 2. New File: `IntroNarrationView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/IntroNarrationView.swift`

```swift
struct IntroNarrationView: View {
    let onNext: () -> Void

    @State private var orbPosition: CGPoint = .center  // Animates to left, then down per line
    @State private var orbSize: CGFloat = 140           // Shrinks to 32
    @State private var currentLine: Int = 0             // 0-3, tracks which line is animating
    @State private var lineCompleted: [Bool] = [false, false, false, false]

    static let lines = [
        "I make getting in shape simple.",
        "I'll build a workout plan around your life, your goals, and your body.",
        "As you progress, I adapt — so your plan always fits.",
        "And when you're training, I'm right there to guide every rep.",
    ]

    // Animation choreography:
    // 1. onAppear: animate orb to (x:28, y:firstLineY), shrink to 32pt
    // 2. After 0.8s: start TypewriterTextView for line 0
    // 3. On line 0 complete: animate orb y to line 1 position, start line 1
    // 4. Repeat for lines 2, 3
    // 5. After line 3 complete + 0.8s pause: call onNext()
    //
    // Tap anywhere: skip to onNext() immediately
}
```

#### 3. New File: `IntroCTAView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/Screens/IntroCTAView.swift`

```swift
struct IntroCTAView: View {
    let onNext: () -> Void

    @State private var showHeadline = false
    @State private var showSubtext = false
    @State private var showButton = false

    // - Orb (56pt) centered, settle → float animation
    // - Headline: "Let's build your program." fades up
    // - Subtext: "I'll ask some questions..." fades up
    // - "Get Started" pill button fades up
    // - Button tap calls onNext
}
```

#### 4. Update `OnboardingScreenData.swift` (Phase 1)
The intro section of the SCREENS array changes from 4 entries to 3:

```swift
// Intro screens (no label, no progress bar)
OnboardingScreen(id: "introHero", type: .introHero),
OnboardingScreen(id: "introNarration", type: .introNarration),
OnboardingScreen(id: "introCTA", type: .introCTA),
```

Add new screen types to the enum:
```swift
enum OnboardingScreenType: String, Codable {
    case introHero
    case introNarration
    case introCTA
    case textInput
    case stepper
    case simpleSelect
    case voice
    case guidedVoice
    case complete
}
```

**Orb animations to implement:**
- `orbBreathe` - scale 1.0 ↔ 1.06 with expanding glow shadow (4s cycle, used on hero screen)
- `orbFloat` - scale 1.0 ↔ 1.04 with gentle shadow (4s cycle, used on CTA screen after settle)
- `orbSettle` - scale 1.04 → 1.0 (one-shot, used when orb returns to center on CTA screen)

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with all 3 intro screen views
- [ ] Preview renders for each intro screen

#### Manual Verification:
- [ ] Hero: large orb breathing, tagline fades up after delay, "Tap to continue" hint appears
- [ ] Narration: orb shrinks and moves left smoothly (spring animation)
- [ ] Narration: lines appear word-by-word in sequence, orb tracks downward with each line
- [ ] Narration: text is readable and well-spaced
- [ ] Narration: tapping skips to CTA screen
- [ ] Narration: auto-advances after all 4 lines complete
- [ ] CTA: orb grows and returns to center with settle animation
- [ ] CTA: headline, subtext, and button stagger in
- [ ] CTA: "Get Started" button advances to first intake question
- [ ] Transitions between all 3 screens feel smooth and connected (the orb's journey feels continuous)

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

## Phase 7: Backend Changes (Schema + Endpoints)

### Overview
Update the backend to support the new structured intake flow, goal options, and markdown programs. Remove the old streaming conversational intake infrastructure.

### Changes Required:

#### 1. Schema Migration: `trainer_intake_summaries`
**Path**: `BACKEND/database/trainer_intake_schema.sql` (or new migration file)

Replace the current `summary_json` blob with structured columns matching `LocalIntakeData`:

```sql
-- New table: trainer_structured_intake
CREATE TABLE trainer_structured_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- About You
    name TEXT,
    age INTEGER,
    gender TEXT,

    -- Goals
    goals TEXT,
    timeline TEXT,

    -- Training History
    experience_level TEXT,
    frequency TEXT,
    current_routine TEXT,
    past_attempts TEXT,
    hobby_sports TEXT,

    -- Body Metrics
    height_inches INTEGER,
    weight_lbs INTEGER,
    body_comp TEXT,

    -- Fitness Baseline
    physical_baseline TEXT,
    mobility TEXT,

    -- Health
    injuries TEXT,
    health_nuances TEXT,
    supplements TEXT,

    -- Lifestyle
    activity_level TEXT,
    sleep TEXT,
    nutrition TEXT,

    -- Equipment
    environment TEXT,

    -- Preferences
    movement_prefs TEXT,
    coaching_style TEXT,
    anything_else TEXT,

    -- Metadata
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'processing', 'processed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (same pattern as existing tables)
ALTER TABLE trainer_structured_intake ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own intake" ON trainer_structured_intake
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own intake" ON trainer_structured_intake
    FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### 2. New Endpoint: `POST /trainer/intake/submit`
**Path**: `BACKEND/routes/trainerIntake.routes.js`, `BACKEND/controllers/trainerIntake.controller.js`, `BACKEND/services/trainerIntake.service.js`

Accepts the structured intake data and stores it:

```javascript
// Controller
async function submitStructuredIntake(req, res) {
    const userId = req.user.id;
    const intakeData = req.body; // LocalIntakeData JSON

    // Validate required fields (name at minimum)
    // Insert into trainer_structured_intake
    // Return { success: true, intakeId: "..." }
}
```

#### 3. Update Goal Endpoints: Options-Based Flow
**Path**: `BACKEND/services/trainerGoals.service.js`, `BACKEND/controllers/trainerGoals.controller.js`

**`POST /trainer/goals/options`** (new):
- Reads the user's `trainer_structured_intake` data
- Generates 3-4 concrete goal options via Claude
- Returns `{ success: true, options: [{ id, summary, detail }] }`

**`POST /trainer/goals/options/edit`** (new):
- Accepts `{ instruction: "user feedback text" }`
- Regenerates the options list incorporating the feedback
- Returns updated options array

**`POST /trainer/goals/options/:optionId/confirm`** (new):
- Locks in the selected option as the user's goal contract
- Creates a `trainer_goal_contracts` row from the selected option
- Returns the confirmed goal contract

#### 4. Update Program Endpoints: Markdown Response
**Path**: `BACKEND/services/trainerProgram.service.js`

Update `draftProgram()` to also generate and return a markdown representation:

```javascript
async function draftProgram(userId) {
    // ... existing logic to generate program_json ...

    // Also generate markdown version
    const programMarkdown = generateProgramMarkdown(programJson);
    // Or: ask Claude to generate both JSON + markdown in one call

    // Store both in trainer_programs table
    // Return { ...existing, program_markdown: programMarkdown }
}
```

Add `program_markdown TEXT` column to `trainer_programs` table.

#### 5. Remove Old Streaming Infrastructure
- Remove `POST /sessions/:id/answers` (SSE streaming endpoint)
- Remove `POST /sessions/:id/confirm` (old confirm)
- Remove `POST /sessions/:id/edit` (old edit)
- Remove `generateNextQuestion()` from intake service
- Remove `synthesizeSummary()` from intake service
- Keep `POST /sessions` for backward compat or remove entirely
- Archive/drop `trainer_intake_events` and `trainer_intake_checklist` tables (or leave for historical data)

#### 6. Update iOS `APIService.swift`
Add new endpoints to match:

```swift
// New intake submission
func submitStructuredIntake(_ data: LocalIntakeData) async throws -> IntakeSubmitResponse

// New goal options
func fetchGoalOptions() async throws -> GoalOptionsResponse
func editGoalOptions(instruction: String) async throws -> GoalOptionsResponse
func confirmGoalOption(optionId: String) async throws -> GoalContractResponse

// Updated program (now includes markdown)
// Existing draftTrainingProgram() already works, just decode the new field
```

### Success Criteria:

#### Automated Verification:
- [ ] Schema migration runs cleanly
- [ ] `POST /trainer/intake/submit` accepts structured data and returns intakeId
- [ ] `POST /trainer/goals/options` returns 3-4 options array
- [ ] `POST /trainer/goals/options/edit` regenerates options with feedback
- [ ] `POST /trainer/goals/options/:id/confirm` creates goal contract
- [ ] `POST /trainer/programs/draft` returns `program_markdown` field
- [ ] Old streaming endpoints removed or return 410 Gone

#### Manual Verification:
- [ ] Structured intake data persists correctly in new table
- [ ] Goal options are diverse and relevant to the intake data
- [ ] Program markdown renders correctly when viewed as text
- [ ] No regressions in program generation quality

**Implementation Note**: Backend changes can be developed in parallel with frontend phases 1-6. The frontend can use mock data until these endpoints are ready.

---

## Phase 8: Goal Review Redesign

### Overview
Replace the current card-based `GoalReviewView` with a new interactive goal selection screen. The LLM generates a list of concrete, specific goal *options* based on the user's vague intake data. The user can tap an option, or use voice/text to request changes. The LLM regenerates options based on feedback. The user iterates until they find the right goal and confirm.

### Design

The Goal Review screen has three zones:

**Top zone: Goal Options**
- The backend returns a list of 3-4 concrete goal options (e.g., "Lose 15lbs in 12 weeks", "Build lean muscle with 4x/week strength training", "Run a sub-25:00 5K by summer")
- Each option is a tappable card/button (full width, surface background, rounded)
- Selected option gets accent background highlight
- When the LLM regenerates options after user feedback, the list updates with a smooth transition
- Loading state: skeleton/shimmer cards while LLM generates options

**Middle zone: Scrollable content**
- If an option is selected, show a brief expansion/detail of what that goal entails (optional)
- The selected goal is visually distinct

**Bottom zone: Input bar (persistent)**
- Mic button (left) — same pattern as intake voice screens (circle → expanding waveform pill when recording)
- Text input field (center) — "Suggest changes..." placeholder
- When user submits text/voice feedback, it sends an edit instruction to `GoalContractStore.edit()` which regenerates the options
- "Confirm" button appears (right side or below) only when an option is selected

### Changes Required:

#### 1. Backend API Changes
The current `POST /trainer/goals/draft` returns a single `GoalContract` with one primary + one secondary goal. This needs to change to return **multiple goal options**. Two approaches:

**Option A (preferred)**: Update the draft endpoint to return a list of goal options:
```json
{
  "success": true,
  "options": [
    { "id": "opt_1", "summary": "Lose 15lbs in 12 weeks", "detail": "..." },
    { "id": "opt_2", "summary": "Build lean muscle 4x/week", "detail": "..." },
    { "id": "opt_3", "summary": "Improve endurance for hiking", "detail": "..." }
  ]
}
```

**Option B**: Keep the current single-goal draft, but add a new endpoint `POST /trainer/goals/options` that generates multiple options.

The `edit` endpoint becomes: user sends feedback text, backend regenerates the list of options.

#### 2. New Model: `GoalOption`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Models/GoalModels.swift`

```swift
struct GoalOption: Codable, Identifiable {
    let id: String
    let summary: String      // Short display text (1 line)
    let detail: String?      // Optional expanded detail
}

struct GoalOptionsResponse: Codable {
    let success: Bool
    let options: [GoalOption]
}
```

#### 3. Update `GoalContractStore.swift`
Add support for multiple options:

```swift
@Published var goalOptions: [GoalOption] = []
@Published var selectedOptionId: String?

func draftOptions() async {
    // Calls backend to generate goal options from intake data
}

func editOptions(instruction: String) async {
    // Sends user feedback, backend regenerates options
}

func confirmGoal(optionId: String) async {
    // Confirms the selected option, backend creates the final GoalContract
}
```

#### 4. Rewrite `GoalReviewView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/GoalReviewView.swift`

```swift
struct GoalReviewView: View {
    @StateObject private var goalStore = GoalContractStore.shared
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var speechManager = SpeechManager()

    @State private var feedbackText = ""
    @State private var isRecording = false

    var body: some View {
        VStack(spacing: 0) {
            // Scrollable goal options
            ScrollView {
                VStack(spacing: 12) {
                    // Header
                    Text("Which goal feels right?")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 20)
                        .padding(.top, 24)

                    Text("Based on what you told me, here are some directions we could take.")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .padding(.horizontal, 20)

                    // Loading state
                    if goalStore.isLoading && goalStore.goalOptions.isEmpty {
                        ForEach(0..<3, id: \.self) { _ in
                            ShimmerCard()  // Placeholder skeleton
                        }
                    }

                    // Goal option cards
                    ForEach(goalStore.goalOptions) { option in
                        GoalOptionCard(
                            option: option,
                            isSelected: goalStore.selectedOptionId == option.id,
                            onTap: { goalStore.selectedOptionId = option.id }
                        )
                    }
                }
                .padding(.bottom, 120) // Space for bottom bar
            }

            // Bottom input bar
            GoalInputBar(
                feedbackText: $feedbackText,
                isRecording: $isRecording,
                hasSelection: goalStore.selectedOptionId != nil,
                isLoading: goalStore.isLoading,
                onMic: toggleRecording,
                onSend: submitFeedback,
                onConfirm: confirmGoal
            )
        }
    }
}
```

#### 5. New Component: `GoalOptionCard`
```swift
struct GoalOptionCard: View {
    let option: GoalOption
    let isSelected: Bool
    let onTap: () -> Void

    // Full width card with:
    // - summary text (16pt, bold)
    // - optional detail text (14pt, secondaryText, 2 line limit)
    // - Selected: accent border or accent background
    // - Unselected: surface background
    // - Tap animation (scale spring)
    // - Large corner radius, 16px padding
}
```

#### 6. New Component: `GoalInputBar`
```swift
struct GoalInputBar: View {
    // Mic button (left) — same pattern as VoiceBottomBar
    // TextField "Suggest changes..." (center)
    // Send button (appears when text is present) — sends feedback
    // Confirm button (appears when option is selected and no text) — confirms selection
    // Layout: same bottom padding pattern as VoiceBottomBar (12px top, 20px sides, 32px bottom)
}
```

#### 7. Update goal generation trigger
Move `GoalContractStore.draftOptions()` call to `OnboardingStore.completeAuth()`:

```swift
func completeAuth() async {
    navigationDirection = .forward
    await syncIntakeToBackend()

    // Start goal option generation in background
    Task { await GoalContractStore.shared.draftOptions() }

    state.currentPhase = .goalReview
    await saveAndSync()
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with new GoalReviewView and models
- [ ] GoalOption model encodes/decodes correctly
- [ ] GoalContractStore has draftOptions/editOptions/confirmGoal methods

#### Manual Verification:
- [ ] Goal options appear after auth (loading state visible briefly)
- [ ] 3-4 goal option cards render correctly
- [ ] Tapping an option selects it (visual highlight)
- [ ] Typing feedback and sending regenerates the options
- [ ] Voice feedback works (mic → waveform → stop → text sent)
- [ ] Confirm button only appears when an option is selected
- [ ] Confirming advances to program review

**Implementation Note**: This phase requires backend API changes. If the backend isn't ready, mock the response with hardcoded options for frontend development.

---

## Phase 9: Program Review Redesign

### Overview
Replace the current multi-card `ProgramReviewView` with a clean markdown-rendered full-page view. The backend returns the program as markdown text. The user scrolls through it and can suggest edits via voice or text.

### Design

**Full-page scrollable markdown view:**
- The program is returned from the backend as a markdown string
- Rendered natively in SwiftUI using `AttributedString` markdown parsing or a lightweight markdown renderer
- Clean typography matching the app theme (dark background, white text)
- Headings, bullet lists, bold/italic, horizontal rules all render correctly
- Full bleed — content goes edge to edge with standard horizontal padding (20px)

**Bottom input bar (persistent, overlays bottom of scroll):**
- Same pattern as GoalInputBar: mic button (left) + text field (center) + send button
- "Suggest changes..." placeholder
- When user submits feedback, the backend regenerates the program markdown
- Loading state: show spinner/shimmer while regenerating
- "Activate Program" button appears below the input bar (or replaces it when user hasn't typed)

### Changes Required:

#### 1. Backend API Changes
The current `POST /trainer/programs/draft` returns a structured `TrainingProgramDetail` JSON object. Change it to return markdown:

**Option A (preferred)**: Add a `markdown` field to the response alongside the existing structured data:
```json
{
  "success": true,
  "program": {
    "id": "...",
    "status": "draft",
    "version": 1,
    "program_json": { ... },
    "program_markdown": "# Your Training Program\n\n## Overview\n..."
  }
}
```

**Option B**: Return only markdown (simpler but loses structured data for future use).

The `edit` endpoint: user sends feedback text, backend regenerates the markdown.

#### 2. Update `ProgramModels.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Models/ProgramModels.swift`

```swift
struct TrainingProgram: Codable, Identifiable {
    let id: String
    let status: String
    let version: Int
    let program: TrainingProgramDetail
    let programMarkdown: String?  // NEW: markdown representation

    enum CodingKeys: String, CodingKey {
        case id, status, version
        case program = "program_json"
        case programMarkdown = "program_markdown"
    }
}
```

#### 3. Rewrite `ProgramReviewView.swift`
**Path**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/ProgramReviewView.swift`

```swift
struct ProgramReviewView: View {
    @StateObject private var programStore = TrainingProgramStore.shared
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var speechManager = SpeechManager()

    @State private var feedbackText = ""
    @State private var isRecording = false
    @State private var isActivating = false

    var body: some View {
        ZStack(alignment: .bottom) {
            // Full-page scrollable markdown
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if programStore.isLoading && programStore.program == nil {
                        // Loading state
                        ProgramLoadingView()
                    } else if let markdown = programStore.program?.programMarkdown {
                        // Render markdown
                        MarkdownContentView(markdown: markdown)
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                            .padding(.bottom, 160) // Space for bottom bar
                    } else if let error = programStore.errorMessage {
                        OnboardingErrorCard(
                            title: "Couldn't load your program",
                            message: error,
                            primaryActionTitle: "Retry"
                        ) { draftProgram() }
                    }
                }
            }

            // Bottom bar: input + activate
            VStack(spacing: 12) {
                // Edit input bar
                ProgramInputBar(
                    feedbackText: $feedbackText,
                    isRecording: $isRecording,
                    isLoading: programStore.isLoading,
                    onMic: toggleRecording,
                    onSend: submitFeedback
                )

                // Activate button
                if programStore.program != nil {
                    Button(action: activateProgram) {
                        HStack {
                            if isActivating {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                                    .scaleEffect(0.8)
                            } else {
                                Text("Activate Program")
                            }
                        }
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.lg)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.large)
                    }
                    .disabled(isActivating)
                    .padding(.horizontal, 20)
                }
            }
            .padding(.bottom, AppTheme.Spacing.xxxl)
            .background(
                LinearGradient(
                    colors: [AppTheme.Colors.background.opacity(0), AppTheme.Colors.background],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 120)
                .offset(y: -60)
            )
        }
        .onAppear { draftProgram() }
    }
}
```

#### 4. New Component: `MarkdownContentView`
```swift
struct MarkdownContentView: View {
    let markdown: String

    var body: some View {
        // Parse markdown using AttributedString(markdown:) or a custom parser
        // Render with proper theme styling:
        //   - H1: 28pt, bold, primaryText, 24px bottom margin
        //   - H2: 22pt, semibold, primaryText, 20px bottom margin
        //   - H3: 18pt, semibold, primaryText, 16px bottom margin
        //   - Body: 15pt, regular, secondaryText, 1.6 line height
        //   - Bold: primaryText color
        //   - Bullets: 5px dot, 14pt, secondaryText
        //   - Horizontal rules: 1px divider
        //   - Proper spacing between sections
    }
}
```

#### 5. New Component: `ProgramInputBar`
```swift
struct ProgramInputBar: View {
    // Same pattern as GoalInputBar but without confirm button
    // Mic button (left) + TextField (center) + Send button (right, when text present)
    // Padding: 12px top, 20px sides
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with new ProgramReviewView
- [ ] TrainingProgram model decodes markdown field correctly
- [ ] MarkdownContentView renders test markdown strings

#### Manual Verification:
- [ ] Program loads as scrollable markdown after goal confirmation
- [ ] Markdown renders correctly: headings, bullets, bold, horizontal rules
- [ ] Typography matches app theme (dark bg, white/gray text)
- [ ] Voice feedback works (mic → waveform → stop → text sent)
- [ ] Text feedback regenerates the program (loading state shown)
- [ ] "Activate Program" button works and advances to notification permission
- [ ] Scrolling is smooth even with long programs

**Implementation Note**: Markdown rendering can use SwiftUI's native `Text(AttributedString(markdown:))` for simple cases, or a library like `MarkdownUI` for richer rendering. Start with native and evaluate.

---

## Phase 10: Post-Auth Flow Connection & Name Updates

### Overview
Connect the full post-auth pipeline and update all references to userName.

### Changes Required:

#### 1. Update goal generation trigger
Move `GoalContractStore.draftOptions()` call to `OnboardingStore.completeAuth()` (already described in Phase 8).

#### 2. Update OnboardingSuccessView
- `userName` now reads from `onboardingStore.state.intakeData.name`

#### 3. Wire up the full post-auth flow
```
Auth → OTP → syncIntakeToBackend() → goalReview (options load) →
user confirms goal → programReview (markdown loads) →
user activates → notificationPermission → success → complete
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds with all post-auth flow changes
- [ ] No references to removed `NameCollectionView` in active code paths

#### Manual Verification:
- [ ] Full end-to-end flow: Intro → Intake → Auth → GoalReview → ProgramReview → Notifications → Success → Main App
- [ ] Goals generate as selectable options using synced intake data
- [ ] Program generates as markdown after goal confirmation
- [ ] User's name appears correctly on complete, GoalReview, ProgramReview, and Success screens

**Implementation Note**: This is the critical integration phase. After completion, test the entire flow end-to-end before proceeding to cleanup.

---

## Phase 11: Cleanup & Polish

### Overview
Remove deprecated code, clean up unused files, and ensure the codebase is tidy.

### Changes Required:

#### 1. Remove files no longer used:
- `WelcomeView.swift` - Replaced by IntroScreenView
- `NameCollectionView.swift` - Name now collected as first intake question
- `OnboardingAssessmentView.swift` - Assessment removed from onboarding
- `IntakeView.swift` - Conversational chat intake fully removed (onboarding screens replace it for all use cases; retake = redo onboarding screens)
- `IntakeSessionStore.swift` - Streaming intake store no longer needed
- `IntakeModels.swift` - Old intake session/summary models (replaced by `LocalIntakeData`)
- Old `OnboardingProgressBar.swift` - Replaced by SegmentedProgressBar
- Old `GoalReviewView.swift` card-based layout code - Fully replaced by option-selection design
- Old `ProgramReviewView.swift` multi-card layout code - Fully replaced by markdown view

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
