# Onboarding Flow Implementation Plan

**Created:** 2026-02-02
**Updated:** 2026-02-02
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
Auth Screen (Terms/Privacy + email + OTP code)
    |
Microphone Permission (as intake begins)
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
Name Collection + Goal Loading (combined screen)
    |
Goal Draft + Full Review (approve/edit)
    |
Program Draft + Full Review (approve/activate)
    |
Notification Permission
    |
Success Screen (celebration + first workout preview)
    |
Main App (HomeView)
    |
Feature Tour (tooltips on first launch)
```

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Auth timing | After welcome, before intake |
| Auth method | OTP code (6-digit) preferred, magic link fallback |
| Legal compliance | Terms/Privacy checkbox required before auth submit |
| Welcome style | Animated monologue (no user input) |
| Skip allowed | No - must complete onboarding |
| Welcome length | Very short (5-10 sec) |
| Post-welcome | CTA button appears |
| Auth screen | Trainer-voiced |
| Microphone permission | Requested as intake begins |
| Intake transition | Trainer greets: "Great! Let's get to know you..." |
| Progress indicator | Within intake only (topic-based) |
| Trainer avatar | Glowing orb |
| Tone | Professional coach |
| CTA text | "Begin Your Journey" |
| Name collection | After intake, during goal loading |
| Assessment if skipped | Reminder after first week |
| Goal/Program approval | Full review screens with voice/text editing |
| Notification permission | After program activation, before success |
| Success screen | Celebration + first workout preview |
| Feature tour | Tooltips on HomeView first launch |
| Back navigation | Available on all screens (except welcome) |

---

## Screen-by-Screen Details

### 1. Welcome Screen
- **Visual:** Large glowing orb (pulsing gently) centered
- **Content:** Short professional coach monologue with word-by-word animation
- **Example text:** "I'm your AI personal trainer. Together, we'll build a program designed specifically for you."
- **Duration:** 5-10 seconds
- **Exit:** "Begin Your Journey" button fades in after monologue completes
- **Background:** Dark with subtle gradient
- **Navigation:** No back button (entry point)

### 2. Auth Screen
- **Visual:** Smaller orb at top
- **Content:** Trainer-voiced message: "Let's save your progress - what's your email?"
- **Input:**
  - Email field with validation (format, required)
  - Terms/Privacy checkbox (required): "I agree to the [Terms of Service] and [Privacy Policy]"
  - "Continue" button (disabled until valid email + checkbox)
- **Flow:**
  1. User enters email + accepts terms
  2. Supabase sends 6-digit OTP code (preferred) or magic link (fallback)
  3. User enters code on verification screen
- **Verification Screen:**
  - 6-digit code input with auto-advance
  - "Resend Code" link (enabled after 30s countdown)
  - "Use a different email" link
  - Clear error states for invalid/expired codes
- **Success:** Trainer confirmation, auto-advances to intake
- **Navigation:** Back button returns to Welcome

### 3. Microphone Permission (as Intake begins)
- **Visual:** Orb + permission explanation card
- **Trigger:** Shown immediately as intake screen loads, before conversation starts
- **Content:**
  - "I'd love to chat with you using voice - it makes this much more natural."
  - "You can also type if you prefer."
- **Options:**
  - "Enable Voice" → Request microphone permission → Start intake
  - "I'll Type Instead" → Start intake without mic
- **System prompt:** iOS microphone permission dialog appears if "Enable Voice" tapped
- **Navigation:** Back button returns to Auth

### 4. Intake
- **Visual:** Orb + conversational interface
- **Transition:** Trainer says "Great! Let's get to know you..."
- **Progress:** Topic-based indicator:
  1. **Goals** - What they want to achieve
  2. **Schedule** - Available days/times for training
  3. **Equipment** - Home gym, commercial gym, bodyweight only, etc.
  4. **Body Metrics** - Weight, height, body fat % (optional), body type
  5. **Injuries** - Current limitations or past injuries to work around
  6. **Preferences** - Exercise preferences, intensity comfort level
- **Body Metrics Details:**
  - Trainer asks conversationally: "Now let's talk about where you're starting from..."
  - Weight: "What's your current weight?" (with unit preference)
  - Height: "And your height?"
  - Body fat %: "Do you know your body fat percentage? No worries if not - we can skip this or estimate later."
  - Body type: Optional self-assessment or skip
  - Sensitive handling: Conversational tone softens potentially sensitive questions
- **No skip/dismiss:** Must complete all topics
- **Exit:** Auto-advances to Assessment Prompt on completion
- **Navigation:** Back button (with confirmation if mid-conversation)

### 5. Assessment Prompt
- **Visual:** Orb + decision card
- **Content:**
  - "I'd like to understand your current fitness level better."
  - "This takes about 5-10 minutes and helps me build a more personalized program."
- **Options:**
  - "Let's Do It" → Assessment
  - "Skip for Now" → Name Collection (with tracking for reminder)
- **Navigation:** Back button returns to Intake end state

### 6. Assessment (if chosen)
- **Visual:** Stepper UI with step progress
- **Content:** Movement tests, self-assessments per existing plan
- **No skip/exit:** Once started, must complete
- **Exit:** Auto-advances to Name Collection on completion
- **Navigation:** Back button (with confirmation about losing progress)

### 7. Name Collection + Goal Loading (NEW - combined screen)
- **Visual:** Orb (in "thinking" state) + name input + loading indicator
- **Timing:** Appears after intake/assessment while AI generates goal draft
- **Content:**
  - "While I'm putting together your personalized goals..."
  - "What should I call you?"
  - Single text field for first name
  - Loading indicator: "Creating your goal plan..." with subtle animation
- **Behavior:**
  - Name input is independent of loading
  - If loading finishes before name entered, wait for name
  - If name entered before loading, show "Almost ready..." state
  - Both must complete before advancing
- **Action:** "Continue" button (enabled when name entered + loading complete)
- **Navigation:** Back button returns to Assessment Prompt

### 8. Goal Draft
- **Visual:** Orb with typewriter intro + goal contract card
- **Transition:** "Based on what you've told me, here's what I'm thinking, [Name]..."
- **Content:** AI-drafted GoalContract displayed as readable summary
- **Action:** "Review & Edit" button
- **Navigation:** Back button returns to Name Collection

### 9. Goal Full Review
- **Visual:** Scrollable form with all goal fields
- **Input:** Voice or text for edit requests
- **Actions:** "Apply Edit" / "Approve"
- **Exit:** On approve, advances to Program Draft
- **Navigation:** Back button returns to Goal Draft

### 10. Program Draft
- **Visual:** Orb with typewriter intro + program overview card
- **Content:** Weekly schedule, session types, progression overview
- **Action:** "Review & Edit" button
- **Navigation:** Back button returns to Goal Review

### 11. Program Full Review
- **Visual:** Scrollable program details
- **Input:** Voice or text for edit requests
- **Actions:** "Apply Edit" / "Activate Program"
- **Exit:** On activate, advances to Notification Permission
- **Navigation:** Back button returns to Program Draft

### 12. Notification Permission (NEW)
- **Visual:** Orb + notification preview card
- **Timing:** After program activation, before success
- **Content:**
  - "I'd like to send you workout reminders and celebrate your wins with you."
  - Mock notification preview showing example reminder
- **Options:**
  - "Enable Notifications" → Request permission → Success screen
  - "Maybe Later" → Success screen (track for later prompt)
- **Navigation:** No back button (program already activated)

### 13. Success Screen (NEW)
- **Visual:** Celebration animation (confetti) + orb in excited state
- **Content:**
  - "You're all set, [Name]!"
  - "Your personalized program is ready."
  - First workout preview card:
    - Workout name/type
    - Scheduled date/time
    - Estimated duration
- **Action:** "Let's Get Started" → HomeView
- **Navigation:** No back button (completion screen)

### 14. Feature Tour (NEW - on HomeView)
- **Type:** Tooltip overlays on first HomeView load
- **Screens:** 3-4 tooltips highlighting key features:
  1. "Start your workout here" (workout card/button)
  2. "Track your progress" (stats/progress area)
  3. "Chat with me anytime" (chat/trainer access)
  4. "Adjust your program" (settings/program area)
- **Behavior:**
  - Each tooltip has "Next" and "Skip" options
  - Spotlight effect dims rest of screen
  - Stored in UserDefaults so only shown once
- **Skippable:** Yes, at any point

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
        .onAppear { checkFeatureTour() }
}
```

### Supabase OTP Configuration
Supabase supports email OTP (one-time password) via `signInWithOtp()`:
```swift
// Preferred: 6-digit code
try await supabase.auth.signInWithOtp(
    email: email,
    options: .init(
        shouldCreateUser: true
    )
)

// Verify code
try await supabase.auth.verifyOTP(
    email: email,
    token: code,
    type: .email
)
```

**Note:** Supabase email templates can be configured in Dashboard > Authentication > Email Templates to send a 6-digit code instead of a magic link.

---

## New Files to Create

### Views (`/Features/Onboarding/`)

| File | Purpose |
|------|---------|
| `WelcomeView.swift` | Glowing orb + animated monologue + CTA |
| `OnboardingAuthView.swift` | Email input + Terms/Privacy + OTP verification |
| `OTPVerificationView.swift` | 6-digit code entry with resend logic |
| `OnboardingCoordinatorView.swift` | Routes between onboarding phases |
| `MicrophonePermissionView.swift` | Voice permission prompt before intake |
| `OnboardingIntakeView.swift` | Wraps intake with no-skip, auto-advance |
| `AssessmentPromptView.swift` | Optional assessment decision |
| `OnboardingAssessmentView.swift` | Wraps assessment with auto-advance |
| `NameCollectionView.swift` | Name input + goal loading combined |
| `GoalDraftView.swift` | Shows AI-drafted goal contract |
| `GoalFullReviewView.swift` | Full edit/approve for goals |
| `ProgramDraftView.swift` | Shows AI-drafted program |
| `ProgramFullReviewView.swift` | Full edit/activate for program |
| `NotificationPermissionView.swift` | Push notification permission prompt |
| `OnboardingSuccessView.swift` | Celebration + first workout preview |

### Components (`/Shared/Components/`)

| File | Purpose |
|------|---------|
| `TypewriterTextView.swift` | Word-by-word text animation |
| `TrainerMessageBubble.swift` | Consistent trainer message styling |
| `OTPCodeField.swift` | 6-digit code input with auto-advance |
| `OnboardingBackButton.swift` | Reusable back navigation with confirmation |
| `NotificationPreviewCard.swift` | Mock notification for permission screen |
| `FirstWorkoutPreviewCard.swift` | Workout card for success screen |
| `FeatureTourOverlay.swift` | Tooltip spotlight overlay system |
| `LegalDocumentSheet.swift` | In-app Safari for Terms/Privacy |

### Models & Services

| File | Purpose |
|------|---------|
| `/Models/OnboardingModels.swift` | `OnboardingPhase` enum, `OnboardingState` struct |
| `/Services/OnboardingStore.swift` | State management, persistence, backend sync |
| `/Services/FeatureTourManager.swift` | Tracks tour completion state |

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
    case authVerification = "auth_verification"
    case microphonePermission = "microphone_permission"
    case intake = "intake"
    case assessmentPrompt = "assessment_prompt"
    case assessment = "assessment"
    case nameCollection = "name_collection"
    case goalDraft = "goal_draft"
    case goalReview = "goal_review"
    case programDraft = "program_draft"
    case programReview = "program_review"
    case notificationPermission = "notification_permission"
    case success = "success"
    case complete = "complete"
}

struct OnboardingState: Codable {
    var currentPhase: OnboardingPhase
    var hasStartedOnboarding: Bool

    // Auth
    var pendingEmail: String?           // Email awaiting verification
    var agreedToTermsAt: Date?          // When user accepted Terms/Privacy

    // User info
    var userName: String?               // Collected during goal loading

    // Body metrics (collected during intake)
    var weightKg: Double?               // Weight in kg (converted from user's preferred unit)
    var heightCm: Double?               // Height in cm (converted from user's preferred unit)
    var bodyFatPercentage: Double?      // Optional - user may not know
    var bodyType: String?               // Optional self-assessment

    // Permissions
    var microphoneEnabled: Bool?        // nil = not asked, true/false = response
    var notificationsEnabled: Bool?     // nil = not asked, true/false = response
    var notificationsSkippedAt: Date?   // For "Maybe Later" follow-up

    // Assessment
    var assessmentSkipped: Bool
    var assessmentSkippedAt: Date?

    // Session IDs
    var intakeSessionId: String?
    var assessmentSessionId: String?
    var goalContractId: String?
    var programId: String?

    var updatedAt: Date

    static var initial: OnboardingState {
        OnboardingState(
            currentPhase: .welcome,
            hasStartedOnboarding: false,
            pendingEmail: nil,
            agreedToTermsAt: nil,
            userName: nil,
            weightKg: nil,
            heightCm: nil,
            bodyFatPercentage: nil,
            bodyType: nil,
            microphoneEnabled: nil,
            notificationsEnabled: nil,
            notificationsSkippedAt: nil,
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
    @Published var isGoalLoading: Bool = false  // For name collection screen

    private let userDefaultsKey = "onboarding_state"

    // Persistence: UserDefaults pre-auth, backend sync post-auth
    func saveLocally() { ... }
    func syncWithJourneyState() async { ... }

    // Navigation
    func advanceToNextPhase() async { ... }
    func goToPreviousPhase() async { ... }  // NEW: Back navigation
    func skipAssessment() async { ... }
    func skipNotifications() async { ... }  // NEW

    // Auth
    func setPendingEmail(_ email: String) { ... }
    func acceptTerms() { state.agreedToTermsAt = Date() }
    func clearPendingEmail() { state.pendingEmail = nil }

    // User info
    func setUserName(_ name: String) async { ... }

    // Permissions
    func setMicrophonePermission(_ granted: Bool) { ... }
    func setNotificationPermission(_ granted: Bool) { ... }

    // Goal loading coordination
    func startGoalGeneration() async { ... }  // Sets isGoalLoading = true
    var canProceedFromNameCollection: Bool {
        state.userName != nil && !isGoalLoading
    }

    // Computed
    var isOnboardingComplete: Bool { state.currentPhase == .complete }
    var shouldShowAssessmentReminder: Bool { ... }
    var shouldShowNotificationReminder: Bool { ... }  // NEW
}
```

### Back Navigation Logic

```swift
extension OnboardingStore {
    /// Returns to previous phase with optional confirmation
    func goToPreviousPhase() async {
        let phases = OnboardingPhase.allCases
        guard let currentIndex = phases.firstIndex(of: state.currentPhase),
              currentIndex > 0 else { return }

        // Some phases should skip back further
        var targetIndex = currentIndex - 1
        let targetPhase = phases[targetIndex]

        // Skip authVerification when going back (go to auth instead)
        if targetPhase == .authVerification {
            targetIndex -= 1
        }

        state.currentPhase = phases[targetIndex]
        await saveAndSync()
    }

    /// Phases that should show "unsaved data" confirmation
    var phasesWithUnsavedData: Set<OnboardingPhase> {
        [.intake, .assessment, .goalReview, .programReview]
    }
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
- Create `OnboardingBackButton.swift` (reusable back nav modifier)
- Create `WelcomeView.swift`

### Phase 2: Auth Flow
- Create `OnboardingAuthView.swift` (email + Terms/Privacy)
- Create `OTPVerificationView.swift` (6-digit code entry)
- Create `OTPCodeField.swift` (reusable component)
- Create `LegalDocumentSheet.swift` (in-app Safari)
- Configure Supabase email template for OTP code
- Modify `AppView.swift` routing
- Test Welcome → Auth → Verification flow

### Phase 3: Permissions + Intake
- Create `MicrophonePermissionView.swift`
- Create `OnboardingIntakeView.swift`
- Create `OnboardingCoordinatorView.swift`
- Add topic-based progress indicator
- Test microphone permission → intake flow

### Phase 4: Assessment Path
- Create `AssessmentPromptView.swift`
- Create `OnboardingAssessmentView.swift`
- Implement skip tracking

### Phase 5: Name Collection + Goals Flow
- Create `NameCollectionView.swift` (combined with goal loading)
- Create `GoalDraftView.swift`
- Create `GoalFullReviewView.swift`
- Implement goal loading coordination

### Phase 6: Program Flow
- Create `ProgramDraftView.swift`
- Create `ProgramFullReviewView.swift`

### Phase 7: Notification + Success
- Create `NotificationPermissionView.swift`
- Create `NotificationPreviewCard.swift`
- Create `OnboardingSuccessView.swift`
- Create `FirstWorkoutPreviewCard.swift`
- Add confetti/celebration animation

### Phase 8: Feature Tour
- Create `FeatureTourOverlay.swift`
- Create `FeatureTourManager.swift`
- Integrate with HomeView
- Define tooltip positions and content

### Phase 9: Polish
- Resume logic
- Backend sync
- Assessment reminder
- Notification reminder (for "Maybe Later")
- Error handling
- Animation polish
- Back navigation testing

---

## Verification Checklist

### Core Flows
1. **Fresh user flow:** App launch → Welcome → Auth → OTP → Microphone → Intake → Assessment prompt → (Yes/No) → Name + Loading → Goals → Program → Notifications → Success → HomeView → Feature Tour
2. **Resume flow:** Close app mid-intake → Reopen → Resume from last point
3. **Skip assessment:** Choose "Skip" → Name Collection → Goals → Program → ... → After 7 days, see reminder
4. **Skip notifications:** Choose "Maybe Later" → Success → HomeView → Track for later prompt
5. **Returning user (completed):** Already completed onboarding → Goes straight to HomeView (no tour)
6. **Returning user (incomplete):** Started but didn't finish → Resumes from correct phase

### Auth Edge Cases
7. **Invalid email:** Enter malformed email → See validation error, button disabled
8. **OTP resend:** Wait 30s → Resend link enabled → Tap → New code sent
9. **Wrong OTP:** Enter wrong code → See error → Can retry
10. **Expired OTP:** Code expires → See error with resend option
11. **Change email:** On verification screen → Tap "Use different email" → Return to email entry

### Permissions
12. **Microphone granted:** Tap "Enable Voice" → iOS prompt → Grant → Intake starts with voice
13. **Microphone denied:** Tap "Enable Voice" → iOS prompt → Deny → Intake starts, voice disabled
14. **Microphone skipped:** Tap "I'll Type Instead" → Intake starts, voice disabled
15. **Notifications granted:** Tap "Enable" → iOS prompt → Grant → Success screen
16. **Notifications denied/skipped:** Tap "Maybe Later" or deny → Success screen, track for reminder

### Back Navigation
17. **Back from Auth:** Tap back → Return to Welcome
18. **Back from Intake (mid-conversation):** Tap back → Confirmation dialog → Confirm → Back to microphone permission
19. **Back from Goal Review:** Tap back → Return to Goal Draft
20. **No back on Success:** Verify no back button appears

### Feature Tour
21. **First HomeView load:** See tooltip overlay → Can advance through 3-4 tips → Dismiss
22. **Tour skip:** Tap "Skip" at any point → Tour dismissed, marked complete
23. **Second HomeView load:** No tour shown (already completed)

---

## File Structure

```
/Features/Onboarding/
  ├── WelcomeView.swift
  ├── OnboardingAuthView.swift
  ├── OTPVerificationView.swift
  ├── OnboardingCoordinatorView.swift
  ├── MicrophonePermissionView.swift
  ├── OnboardingIntakeView.swift
  ├── AssessmentPromptView.swift
  ├── OnboardingAssessmentView.swift
  ├── NameCollectionView.swift
  ├── GoalDraftView.swift
  ├── GoalFullReviewView.swift
  ├── ProgramDraftView.swift
  ├── ProgramFullReviewView.swift
  ├── NotificationPermissionView.swift
  └── OnboardingSuccessView.swift

/Features/FeatureTour/
  ├── FeatureTourOverlay.swift
  └── FeatureTourStep.swift

/Shared/Components/
  ├── TypewriterTextView.swift
  ├── TrainerMessageBubble.swift
  ├── OTPCodeField.swift
  ├── OnboardingBackButton.swift
  ├── NotificationPreviewCard.swift
  ├── FirstWorkoutPreviewCard.swift
  └── LegalDocumentSheet.swift

/Models/
  └── OnboardingModels.swift

/Services/
  ├── OnboardingStore.swift
  └── FeatureTourManager.swift
```

---

## Open Questions

1. **Welcome message copy:** What exact words should the trainer say in the 5-10 second monologue?
2. **Goal/Program stores:** Do `GoalContractStore` and `TrainingProgramStore` exist with draft/edit/approve methods, or do they need to be created?
3. **Backend endpoints:** Are `/trainer/goals/*` and `/trainer/programs/*` endpoints ready, or is that part of this work?
4. **Terms/Privacy URLs:** What are the URLs for Terms of Service and Privacy Policy? (Need to host these)
5. **Supabase OTP template:** Need to configure Supabase email template to send 6-digit code format
6. **Feature tour content:** What are the exact 3-4 features to highlight? What copy for each tooltip?
7. **Celebration animation:** Use a package (ConfettiSwiftUI) or build custom?
8. **Notification reminder timing:** When to prompt users who chose "Maybe Later"? After first workout? After X days?

---

## Change Log

- 2026-02-02: Initial plan created based on design session
- 2026-02-02: Updated with reviewed additions:
  - Added Terms of Service / Privacy Policy to auth screen
  - Added OTP code verification (Supabase) as preferred auth method
  - Added microphone permission screen before intake
  - Added name collection combined with goal loading screen
  - Moved notification permission to after program activation
  - Added success/celebration screen with first workout preview
  - Added feature tour tooltips for HomeView
  - Added back navigation to all applicable screens
  - Updated phases, file structure, and verification checklist
- 2026-02-02: Added Body Metrics to intake flow:
  - New intake topic: Body Metrics (weight, height, body fat %, body type)
  - Conversational collection with sensitive handling
  - Body fat % and body type are optional
  - Added body metrics fields to OnboardingState model
