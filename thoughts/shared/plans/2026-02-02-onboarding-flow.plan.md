# Onboarding Flow Implementation Plan

**Created:** 2026-02-02
**Status:** Draft
**Context:** New user onboarding experience from welcome through program activation

---

## Overview

Design and implement a new onboarding flow that guides users through authentication, intake, optional assessment, goal setting, and program activation before accessing the main app.

---

## User Flow

```
Welcome Screen (5-10 sec animated monologue)
    |
"Begin Your Journey" CTA
    |
Auth Screen (trainer-voiced: "Let's save your progress...")
    |
Intake (conversational, topic-based progress)
    |
Assessment Prompt (optional - explain benefit + time)
    |                        |
   Yes                      No
    |                        |
Assessment            Skip (reminder after 1 week)
    |                        |
    +------------------------+
    |
Goal Draft + Full Review (approve/edit)
    |
Program Draft + Full Review (approve/activate)
    |
Main App (HomeView)
```

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Auth timing | After welcome, before intake |
| Welcome style | Animated monologue (no user input) |
| Skip allowed | No - must complete onboarding |
| Welcome length | Very short (5-10 sec) |
| Post-welcome | CTA button appears |
| Auth screen | Trainer-voiced |
| Intake transition | Trainer greets: "Great! Let's get to know you..." |
| Progress indicator | Within intake only (topic-based) |
| Trainer avatar | Glowing orb |
| Tone | Professional coach |
| CTA text | "Begin Your Journey" |
| Assessment if skipped | Reminder after first week |
| Goal/Program approval | Full review screens with voice/text editing |

---

## Screen-by-Screen Details

### 1. Welcome Screen
- **Visual:** Large glowing orb (pulsing gently) centered
- **Content:** Short professional coach monologue with word-by-word animation
- **Example text:** "I'm your AI personal trainer. Together, we'll build a program designed specifically for you."
- **Duration:** 5-10 seconds
- **Exit:** "Begin Your Journey" button fades in after monologue completes
- **Background:** Dark with subtle gradient

### 2. Auth Screen
- **Visual:** Smaller orb at top
- **Content:** Trainer-voiced message: "Let's save your progress - what's your email?"
- **Input:** Email field + "Send Magic Link" button
- **Flow:** Uses existing Supabase OTP (magic link)
- **Success:** Trainer confirmation, auto-advances to intake

### 3. Intake
- **Visual:** Orb + conversational interface
- **Transition:** Trainer says "Great! Let's get to know you..."
- **Progress:** Topic-based indicator (Goals, Schedule, Equipment, Injuries, Preferences)
- **No skip/dismiss:** Must complete
- **Exit:** Auto-advances to Assessment Prompt on completion

### 4. Assessment Prompt
- **Visual:** Orb + decision card
- **Content:**
  - "I'd like to understand your current fitness level better."
  - "This takes about 5-10 minutes and helps me build a more personalized program."
- **Options:**
  - "Let's Do It" → Assessment
  - "Skip for Now" → Goals (with tracking for reminder)

### 5. Assessment (if chosen)
- **Visual:** Stepper UI with step progress
- **Content:** Movement tests, self-assessments per existing plan
- **No skip/exit:** Once started, must complete
- **Exit:** Auto-advances to Goal Draft on completion

### 6. Goal Draft
- **Visual:** Orb with typewriter intro + goal contract card
- **Transition:** "Based on what you've told me, here's what I'm thinking..."
- **Content:** AI-drafted GoalContract displayed as readable summary
- **Action:** "Review & Edit" button

### 7. Goal Full Review
- **Visual:** Scrollable form with all goal fields
- **Input:** Voice or text for edit requests
- **Actions:** "Apply Edit" / "Approve"
- **Exit:** On approve, advances to Program Draft

### 8. Program Draft
- **Visual:** Orb with typewriter intro + program overview card
- **Content:** Weekly schedule, session types, progression overview
- **Action:** "Review & Edit" button

### 9. Program Full Review
- **Visual:** Scrollable program details
- **Input:** Voice or text for edit requests
- **Actions:** "Apply Edit" / "Approve" / "Activate & Start"
- **Exit:** On activate, completes onboarding → MainAppView

---

## Architecture

### Current Routing (AppView.swift)
```
NOT authenticated → AuthView()
Authenticated → MainAppView()
```

### New Routing
```swift
if !onboardingStore.state.hasStartedOnboarding {
    WelcomeView()
} else if !isAuthenticated {
    OnboardingAuthView()
} else if !onboardingStore.isOnboardingComplete {
    OnboardingCoordinatorView()
} else {
    MainAppView()
}
```

---

## New Files to Create

### Views (`/Features/Onboarding/`)

| File | Purpose |
|------|---------|
| `WelcomeView.swift` | Glowing orb + animated monologue + CTA |
| `OnboardingAuthView.swift` | Trainer-voiced email input + OTP |
| `OnboardingCoordinatorView.swift` | Routes between onboarding phases |
| `OnboardingIntakeView.swift` | Wraps intake with no-skip, auto-advance |
| `AssessmentPromptView.swift` | Optional assessment decision |
| `OnboardingAssessmentView.swift` | Wraps assessment with auto-advance |
| `GoalDraftView.swift` | Shows AI-drafted goal contract |
| `GoalFullReviewView.swift` | Full edit/approve for goals |
| `ProgramDraftView.swift` | Shows AI-drafted program |
| `ProgramFullReviewView.swift` | Full edit/activate for program |

### Components (`/Shared/Components/`)

| File | Purpose |
|------|---------|
| `TypewriterTextView.swift` | Word-by-word text animation |
| `TrainerMessageBubble.swift` | Consistent trainer message styling |

### Models & Services

| File | Purpose |
|------|---------|
| `/Models/OnboardingModels.swift` | `OnboardingPhase` enum, `OnboardingState` struct |
| `/Services/OnboardingStore.swift` | State management, persistence, backend sync |

---

## Files to Modify

| File | Changes |
|------|---------|
| `AppView.swift` | Add 4-way routing based on auth + onboarding state |
| `JourneyModels.swift` | Add `onboardingPhase`, `assessmentSkipped`, `assessmentSkippedAt` |
| `APIService.swift` | Add endpoint to update onboarding state |

---

## State Management

### OnboardingState Model

```swift
enum OnboardingPhase: String, Codable, CaseIterable {
    case welcome = "welcome"
    case auth = "auth"
    case intake = "intake"
    case assessmentPrompt = "assessment_prompt"
    case assessment = "assessment"
    case goalDraft = "goal_draft"
    case goalReview = "goal_review"
    case programDraft = "program_draft"
    case programReview = "program_review"
    case complete = "complete"
}

struct OnboardingState: Codable {
    var currentPhase: OnboardingPhase
    var hasStartedOnboarding: Bool
    var assessmentSkipped: Bool
    var assessmentSkippedAt: Date?
    var intakeSessionId: String?
    var assessmentSessionId: String?
    var goalContractId: String?
    var programId: String?
    var updatedAt: Date

    static var initial: OnboardingState {
        OnboardingState(
            currentPhase: .welcome,
            hasStartedOnboarding: false,
            assessmentSkipped: false,
            assessmentSkippedAt: nil,
            intakeSessionId: nil,
            assessmentSessionId: nil,
            goalContractId: nil,
            programId: nil,
            updatedAt: Date()
        )
    }
}
```

### OnboardingStore

```swift
@MainActor
final class OnboardingStore: ObservableObject {
    static let shared = OnboardingStore()

    @Published var state: OnboardingState
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let userDefaultsKey = "onboarding_state"

    // Persistence: UserDefaults pre-auth, backend sync post-auth
    func saveLocally() { ... }
    func syncWithJourneyState() async { ... }

    // Navigation
    func advanceToNextPhase() async { ... }
    func skipAssessment() async { ... }

    // Computed
    var isOnboardingComplete: Bool { state.currentPhase == .complete }
    var shouldShowAssessmentReminder: Bool { ... }
}
```

### Persistence Strategy

- **Pre-auth:** Store in UserDefaults (survives app restart)
- **Post-auth:** Sync with backend `/trainer/journey` endpoint
- **Resume:** Load from UserDefaults on launch, sync with backend if authenticated, use most recent

---

## Assessment Reminder Logic

When user skips assessment:
```swift
func skipAssessment() async {
    state.assessmentSkipped = true
    state.assessmentSkippedAt = Date()
    state.currentPhase = .goalDraft
    await saveAndSync()
}
```

Reminder trigger (in HomeView):
```swift
var shouldShowAssessmentReminder: Bool {
    guard state.assessmentSkipped,
          let skippedAt = state.assessmentSkippedAt else { return false }
    let daysSinceSkip = Calendar.current.dateComponents([.day], from: skippedAt, to: Date()).day ?? 0
    return daysSinceSkip >= 7 && !hasCompletedAssessmentSince(skippedAt)
}
```

Reminder options:
- "Complete Assessment Now"
- "Remind Me Later" (snooze 3 days)
- "I'll Skip It" (dismiss permanently)

---

## Reusable Components

From existing codebase:
- `AIOrb` - glowing orb animation
- `IntakeSessionStore` - intake state management
- `AssessmentSessionStore` - assessment state management
- `GoalContractStore` - goal drafting/editing (if exists, or create)
- `TrainingProgramStore` - program drafting/activation
- `SpeechRecognizer` - voice input

---

## Implementation Phases

### Phase 1: Foundation
- Create `OnboardingModels.swift`
- Create `OnboardingStore.swift`
- Create `TypewriterTextView.swift`
- Create `WelcomeView.swift`

### Phase 2: Auth Flow
- Create `OnboardingAuthView.swift`
- Modify `AppView.swift` routing
- Test Welcome → Auth flow

### Phase 3: Intake Integration
- Create `OnboardingIntakeView.swift`
- Create `OnboardingCoordinatorView.swift`
- Add topic-based progress indicator

### Phase 4: Assessment Path
- Create `AssessmentPromptView.swift`
- Create `OnboardingAssessmentView.swift`
- Implement skip tracking

### Phase 5: Goals Flow
- Create `GoalDraftView.swift`
- Create `GoalFullReviewView.swift`

### Phase 6: Program Flow
- Create `ProgramDraftView.swift`
- Create `ProgramFullReviewView.swift`
- Complete onboarding → MainApp transition

### Phase 7: Polish
- Resume logic
- Backend sync
- Assessment reminder
- Error handling
- Animation polish

---

## Verification Checklist

1. **Fresh user flow:** App launch → Welcome → Auth → Intake → Assessment prompt → (Yes/No) → Goals → Program → HomeView
2. **Resume flow:** Close app mid-intake → Reopen → Resume from last point
3. **Skip assessment:** Choose "Skip" → Goals → Program → HomeView → After 7 days, see reminder
4. **Returning user (completed):** Already completed onboarding → Goes straight to HomeView
5. **Returning user (incomplete):** Started but didn't finish → Resumes from correct phase

---

## File Structure

```
/Features/Onboarding/
  ├── WelcomeView.swift
  ├── OnboardingAuthView.swift
  ├── OnboardingCoordinatorView.swift
  ├── OnboardingIntakeView.swift
  ├── AssessmentPromptView.swift
  ├── OnboardingAssessmentView.swift
  ├── GoalDraftView.swift
  ├── GoalFullReviewView.swift
  ├── ProgramDraftView.swift
  └── ProgramFullReviewView.swift

/Shared/Components/
  ├── TypewriterTextView.swift
  └── TrainerMessageBubble.swift

/Models/
  └── OnboardingModels.swift

/Services/
  └── OnboardingStore.swift
```

---

## Open Questions

1. **Welcome message copy:** What exact words should the trainer say in the 5-10 second monologue?
2. **Goal/Program stores:** Do `GoalContractStore` and `TrainingProgramStore` exist with draft/edit/approve methods, or do they need to be created?
3. **Backend endpoints:** Are `/trainer/goals/*` and `/trainer/programs/*` endpoints ready, or is that part of this work?

---

## Change Log

- 2026-02-02: Initial plan created based on design session
