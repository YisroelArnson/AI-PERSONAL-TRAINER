# Onboarding Flow Overhaul — Smooth, Unified Experience

## Overview

Comprehensive overhaul of the 15-phase onboarding flow to feel like a single cohesive journey rather than a sequence of disconnected screens. This plan addresses 7 architectural issues identified in the [onboarding flow research](../../shared/research/2026-02-04-onboarding-flow-architecture.md).

## Current State Analysis

The onboarding is a 15-phase linear sequence where each phase is a completely independent SwiftUI view with its own orb variant, layout, and interaction pattern. Transitions are all identical `.easeInOut(0.3)` crossfades. The orb (the app's identity element) jumps between 50px-120px across screens with no visual continuity. Draft and review screens are split into pairs requiring unnecessary taps. There's no global progress indicator.

### Key Discoveries:
- Every view has its own hand-crafted orb: WelcomeView (120px pulsing), MicPermissionView (100px + mic icon), IntakeView (80px via AIOrb), AssessmentPromptView (100px + clipboard), NameCollectionView (100px + ProgressView), GoalDraftView (50px top-left), OnboardingSuccessView (120px + checkmark)
- `OnboardingCoordinatorView` wraps a `NavigationStack` with a flat `switch` — no shared persistent elements
- GoalDraftView and GoalFullReviewView are separate phases where draft shows typewriter → card → "Review & Edit" button, then review shows same card but editable. Same pattern for Program
- IntakeView shows "Continue" button when conversation completes, requiring manual tap
- AssessmentPromptView is a full-screen interruption just to ask "want to do assessment?"
- GoalFullReviewView:180 and ProgramFullReviewView:348 gate mic button on `onboardingStore.state.microphoneEnabled == true`

## Desired End State

After this overhaul:
- **11 phases** (down from 15): welcome, auth, authVerification, intake, assessment, nameCollection, goalReview, programReview, notificationPermission, success, complete
- A **shared orb** lives in the coordinator and smoothly animates size/position between phases
- A **global progress bar** at the top shows overall onboarding completion
- **Directional slide transitions** (forward = slide left, backward = slide right) replace the uniform crossfade
- **Goal and Program screens** each combine draft + review into a single view with a typewriter intro that seamlessly reveals the editable card
- **Intake auto-advances** with an inline assessment decision (no separate Continue button or AssessmentPromptView)
- **Mic permission** is requested lazily on first mic tap, not via a dedicated screen
- Mic buttons in GoalFullReviewView and ProgramFullReviewView are always shown with lazy permission
- **Navigation bar uses ThinTopBar** — matching the main app's nav style (60pt height, 20pt semibold icons, 14pt center text) instead of the current `OnboardingBackButton` toolbar approach

### Verification:
- Build succeeds
- Full onboarding flow works end-to-end with 11 phases
- Orb animates smoothly between all screens
- Progress bar advances correctly through phases
- Forward/backward transitions are directional slides
- Goal/Program each show as single screen (typewriter intro → editable card)
- Intake auto-advances to assessment decision
- Mic permission requested lazily everywhere

## What We're NOT Doing

- Not changing the auth flow (email + OTP stays the same)
- Not changing the backend API calls or data models
- Not changing the notification permission flow (keeps dedicated screen)
- Not changing the success/celebration screen
- Not implementing backend-driven onboarding (phase ordering stays client-side)
- Not changing the content/copy of any screens (just structure and transitions)

## Implementation Approach

Work in 8 phases, each leaving the app in a buildable/testable state. Phase 1 handles structural changes (phase enum, merged views). Phases 2-3 handle shared visual components (orb, progress bar). Phase 4 replaces the nav bar with ThinTopBar. Phase 5 handles directional transitions. Phases 6-7 handle intake auto-advance and lazy mic. Phase 8 is cleanup.

---

## Phase 1: Restructure Phase Enum + Merge Draft/Review Screens

### Overview
Reduce phases from 15 to 11. Remove `microphonePermission`, `assessmentPrompt`, `goalDraft`, `programDraft`. Merge goal draft+review and program draft+review into single views.

### Changes Required:

#### 1. OnboardingModels.swift — Update phase enum
**File**: `AI Personal Trainer App/AI Personal Trainer App/Models/OnboardingModels.swift`

Remove four cases from `OnboardingPhase`:
- `.microphonePermission` (lazy permission instead)
- `.assessmentPrompt` (inline into intake completion)
- `.goalDraft` (merged into `.goalReview`)
- `.programDraft` (merged into `.programReview`)

Update `displayTitle` for all remaining cases. Update `previousPhase` computed property:
- `.intake` previous → `nil` (no back navigation from intake — user is authenticated, going back to auth makes no sense)
- `.assessment` previous → `.intake`
- `.nameCollection` previous → `.intake` (since assessment may be skipped)
- `.goalReview` previous → `.nameCollection`
- `.programReview` previous → `.goalReview`

Update `requiresBackConfirmation` — remove `.goalReview` and `.programReview` since they now include the draft intro phase.

Update `hideBackButton` — add `.intake` to the list. Once authenticated, there's no reason to navigate back to auth. Users who want to start over can log out.

#### 2. OnboardingStore.swift — Update navigation methods
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift`

- `completeAuth()` (line 123): transition to `.intake` instead of `.microphonePermission`
- `completeIntake()` (line 214): transition to `.nameCollection` instead of `.assessmentPrompt`. Add parameter `withAssessment: Bool` — if true, transition to `.assessment` instead
- Remove `skipAssessment()` method — assessment decision is now inline
- `completeAssessment()` (line 173): still transitions to `.nameCollection` (no change)
- Remove `completeGoalDraft()` (line 225) — no longer needed
- Remove `completeProgramDraft()` (line 237) — no longer needed
- `approveGoals()` (line 230): transition to `.programReview` instead of `.programDraft`
- `advanceToNextPhase()` (line 78): update to skip removed phases. The `assessmentSkipped` logic for skipping `.assessment` stays, but remove the `.assessmentPrompt` and `.goalDraft`/`.programDraft` skipping since those phases no longer exist

Add `navigationDirection` published property:
```swift
enum NavigationDirection { case forward, backward }
@Published var navigationDirection: NavigationDirection = .forward
```

Update `advanceToNextPhase()` and `goToPreviousPhase()` to set this before changing phase.

#### 3. Create GoalReviewView (merged draft + review)
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/GoalReviewView.swift` (new file, replaces GoalDraftView + GoalFullReviewView)

This single view has two stages:
1. **Intro stage**: Small orb top-left, typewriter text "Based on what you've told me, here's what I'm thinking, {name}...", then goal card fades in (from current GoalDraftView)
2. **Review stage**: After typewriter + card appear, automatically transition to showing the edit input section and "Approve Goals" button (from current GoalFullReviewView). No separate "Review & Edit" button needed — the card smoothly reveals as editable.

Key behavior:
- On appear: if `goalStore.contract` is nil, show loading state
- Typewriter plays, then card appears with edit section visible
- User can edit and approve in one screen
- "Approve Goals" calls `goalStore.approve()` then `onboardingStore.approveGoals()`

#### 4. Create ProgramReviewView (merged draft + review)
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/ProgramReviewView.swift` (new file, replaces ProgramDraftView + ProgramFullReviewView)

Same pattern as GoalReviewView:
1. **Intro stage**: Typewriter "Now let me build your personalized training program, {name}...", program loads in background
2. **Review stage**: Card appears with all program details + edit section + "Activate Program" button

On appear: calls `programStore.draft()` if program is nil. Typewriter plays while program generates.

#### 5. OnboardingCoordinatorView.swift — Update routing
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/OnboardingCoordinatorView.swift`

Remove cases: `.microphonePermission`, `.assessmentPrompt`, `.goalDraft`, `.programDraft`
Update `.intake` to pass `isMicrophoneEnabled: true` (always)
Route `.goalReview` → `GoalReviewView()` (new merged view)
Route `.programReview` → `ProgramReviewView()` (new merged view)
Remove the back button toolbar from the `.intake` case (lines 40-53 in current coordinator) — intake should have no back navigation

#### 6. Delete old files
- Delete `MicrophonePermissionView.swift`
- Delete `AssessmentPromptView.swift`
- Delete `GoalDraftView.swift`
- Delete `ProgramDraftView.swift`
- Delete `GoalFullReviewView.swift`
- Delete `ProgramFullReviewView.swift`

#### 7. Update Xcode project file
Remove deleted files from the Xcode project build phases if needed (SwiftUI files in the target directory are usually auto-included, but verify).

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds
- [x] No references to removed phases in switch statements
- [x] No dangling references to deleted view files

#### Manual Verification:
- [ ] Full onboarding flow works with 11 phases
- [ ] Goal screen shows typewriter intro → editable card → approve button (single screen)
- [ ] Program screen shows typewriter intro → editable card → activate button (single screen)
- [ ] Assessment decision still works (tested in Phase 5)

**Implementation Note**: After completing this phase, pause for manual testing before proceeding.

---

## Phase 2: Shared Persistent Orb in Coordinator

### Overview
Create a single orb component that lives in `OnboardingCoordinatorView` and animates its size, position, and icon between phases. Individual views no longer render their own orbs.

### Changes Required:

#### 1. Create OnboardingOrbView shared component
**File**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/OnboardingOrbView.swift` (new)

A reusable orb that accepts:
- `size: CGFloat` — the diameter
- `icon: String?` — optional SF Symbol to overlay (e.g., "checkmark", "clipboard.fill")
- `isLoading: Bool` — whether to show pulsing/loading state
- `alignment: OrbAlignment` — `.center`, `.topLeading`, `.top`

Uses the existing orb gradient pattern from `AppTheme.Gradients.orb` with cloud layers. Renders glow, main orb body, optional icon, and optional ProgressView when loading.

```swift
struct OnboardingOrbView: View {
    let size: CGFloat
    var icon: String? = nil
    var isLoading: Bool = false

    var body: some View {
        ZStack {
            // Outer glow (proportional to size)
            Circle()
                .fill(RadialGradient(...))
                .frame(width: size * 1.6, height: size * 1.6)

            // Main orb body (same gradient pattern used everywhere)
            ZStack {
                Circle().fill(AppTheme.Gradients.orb)
                // Cloud layers...

                // Optional icon
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: size * 0.3, weight: .medium))
                        .foregroundColor(AppTheme.Colors.orbSkyDeep.opacity(0.6))
                }

                // Loading indicator
                if isLoading {
                    ProgressView()
                        .scaleEffect(size / 80)
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(...)
        }
    }
}
```

#### 2. Create OnboardingOrbConfig for per-phase orb settings
**File**: `AI Personal Trainer App/AI Personal Trainer App/Models/OnboardingModels.swift` (add to existing)

Add computed property on `OnboardingPhase`:
```swift
struct OrbConfig {
    let size: CGFloat
    let icon: String?
    let alignment: OrbAlignment
}

enum OrbAlignment {
    case center      // welcome, success
    case topCenter   // intake, nameCollection, assessment
    case topLeading  // goalReview, programReview
    case hidden      // auth, authVerification, notificationPermission, complete
}

var orbConfig: OrbConfig {
    switch self {
    case .welcome:
        return OrbConfig(size: 120, icon: nil, alignment: .center)
    case .auth, .authVerification:
        return OrbConfig(size: 0, icon: nil, alignment: .hidden)
    case .intake:
        return OrbConfig(size: 80, icon: nil, alignment: .topCenter)
    case .assessment:
        return OrbConfig(size: 100, icon: "clipboard.fill", alignment: .center)
    case .nameCollection:
        return OrbConfig(size: 100, icon: nil, alignment: .center)
    case .goalReview, .programReview:
        return OrbConfig(size: 50, icon: nil, alignment: .topLeading)
    case .notificationPermission:
        return OrbConfig(size: 100, icon: "bell.fill", alignment: .center)
    case .success:
        return OrbConfig(size: 120, icon: "checkmark", alignment: .center)
    case .complete:
        return OrbConfig(size: 0, icon: nil, alignment: .hidden)
    }
}
```

#### 3. OnboardingCoordinatorView.swift — Add persistent orb layer
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/OnboardingCoordinatorView.swift`

Add the orb as a layer **above** the phase content in a ZStack. The orb reads its config from `onboardingStore.state.currentPhase.orbConfig` and animates changes.

```swift
var body: some View {
    NavigationStack {
        ZStack {
            // Phase content (below)
            currentPhaseView

            // Persistent orb (above, animates between phases)
            if onboardingStore.state.currentPhase.orbConfig.alignment != .hidden {
                OnboardingOrbView(
                    size: onboardingStore.state.currentPhase.orbConfig.size,
                    icon: onboardingStore.state.currentPhase.orbConfig.icon,
                    isLoading: orbIsLoading
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity,
                       alignment: orbFrameAlignment)
                .padding(orbPadding)
                .animation(.spring(response: 0.5, dampingFraction: 0.8),
                          value: onboardingStore.state.currentPhase)
                .allowsHitTesting(false) // Don't block touches
            }
        }
    }
}
```

The `orbIsLoading` computed property checks relevant store states (e.g., `intakeStore.isLoading`, `onboardingStore.isGoalLoading`).

#### 4. Remove orbs from individual phase views
Remove the orb rendering code from:
- WelcomeView (`welcomeOrb`, `orbSize` property, lines 80-172)
- IntakeView (`AIOrb` usage, line 134)
- NameCollectionView (`thinkingOrb`, lines 95-160)
- OnboardingSuccessView (`successOrb`, lines 76-139)
- GoalReviewView (the `smallOrb` — carried over from GoalDraftView)
- ProgramReviewView (the `smallOrb` — carried over from ProgramDraftView)
- NotificationPermissionView (`notificationOrb`, lines 58-120)

Each view should leave space for where the orb will be (via padding/spacer) but not render it.

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds
- [x] No orb rendering code remaining in individual phase views (except the shared component)

#### Manual Verification:
- [ ] Orb smoothly animates size when transitioning between phases (e.g., 120px welcome → hidden on auth → 80px on intake)
- [ ] Orb smoothly moves position (center → top → top-left → center)
- [ ] Orb icons change appropriately (none → clipboard → bell → checkmark)
- [ ] Orb shows loading state when appropriate (intake loading, goal generation)
- [ ] Orb doesn't block touch targets on any screen

**Implementation Note**: This phase is the most visually impactful. Pause for manual review.

---

## Phase 3: Global Progress Bar

### Overview
Add a thin progress bar at the top of `OnboardingCoordinatorView` that shows overall onboarding completion percentage.

### Changes Required:

#### 1. Add progress mapping to OnboardingPhase
**File**: `AI Personal Trainer App/AI Personal Trainer App/Models/OnboardingModels.swift`

Add computed property:
```swift
var progressPercent: CGFloat {
    switch self {
    case .welcome: return 0.0
    case .auth: return 0.05
    case .authVerification: return 0.10
    case .intake: return 0.20
    case .assessment: return 0.40
    case .nameCollection: return 0.50
    case .goalReview: return 0.60
    case .programReview: return 0.75
    case .notificationPermission: return 0.90
    case .success: return 1.0
    case .complete: return 1.0
    }
}
```

#### 2. Add OnboardingProgressBar component
**File**: `AI Personal Trainer App/AI Personal Trainer App/Shared/Components/OnboardingProgressBar.swift` (new)

Thin (3px) bar at the top of the screen. Uses the same style as `IntakeProgressBarView` but for the global flow. Hidden on `.welcome` and `.complete`.

```swift
struct OnboardingProgressBar: View {
    let progress: CGFloat

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(AppTheme.Colors.surface)
                    .frame(height: 3)

                RoundedRectangle(cornerRadius: 1.5)
                    .fill(AppTheme.Colors.primaryText.opacity(0.4))
                    .frame(width: geometry.size.width * min(progress, 1.0), height: 3)
                    .animation(.easeOut(duration: 0.4), value: progress)
            }
        }
        .frame(height: 3)
    }
}
```

#### 3. OnboardingCoordinatorView.swift — Add progress bar
Place the progress bar at the very top of the VStack, above the orb and phase content.

```swift
VStack(spacing: 0) {
    // Global progress bar (hidden on welcome and complete)
    if ![.welcome, .complete].contains(onboardingStore.state.currentPhase) {
        OnboardingProgressBar(
            progress: onboardingStore.state.currentPhase.progressPercent
        )
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // ... rest of content
}
```

#### 4. IntakeView — Remove or adjust local progress bar
The IntakeView already has `IntakeProgressBarView` for conversation progress. Keep it as a secondary/detail indicator, but reduce its visual weight since the global bar now shows overall progress.

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds

#### Manual Verification:
- [ ] Progress bar visible on all screens except welcome and complete
- [ ] Progress bar advances as user moves through onboarding
- [ ] Progress bar animates smoothly
- [ ] Doesn't conflict with IntakeView's local progress bar

---

## Phase 4: Replace Navigation Toolbar with ThinTopBar

### Overview
Replace the `NavigationStack` toolbar + `OnboardingBackButton` pattern with the app's standard `ThinTopBar` component. This makes onboarding navigation feel consistent with the rest of the app.

### Current Problem
Onboarding uses `NavigationStack` with `.navigationBarBackButtonHidden(true)` and custom `OnboardingBackButton` toolbar items. This creates a different look from the main app which uses `ThinTopBar` (60pt height, 20pt semibold icon, no "Back" text). The `OnboardingBackButton` has 16pt icon + "Back" text label — visually distinct from the rest of the app.

### Changes Required:

#### 1. OnboardingCoordinatorView.swift — Remove NavigationStack, add ThinTopBar
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/OnboardingCoordinatorView.swift`

Replace the `NavigationStack` wrapper with a plain `VStack`. Add `ThinTopBar` at the top of the coordinator layout, driven by the current phase:

```swift
var body: some View {
    VStack(spacing: 0) {
        // ThinTopBar (hidden on welcome, success, complete)
        if shouldShowTopBar {
            ThinTopBar(
                leftIcon: "chevron.left",
                leftAction: { Task { await onboardingStore.goToPreviousPhase() } },
                centerText: onboardingStore.state.currentPhase.displayTitle
            )
        }

        // Global progress bar
        if shouldShowProgressBar {
            OnboardingProgressBar(...)
        }

        // Phase content
        currentPhaseView
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private var shouldShowTopBar: Bool {
    let phase = onboardingStore.state.currentPhase
    return !phase.hideBackButton // hides on welcome, intake, notificationPermission, success, complete
}
```

This means:
- **No NavigationStack** — the coordinator manages its own layout directly
- **ThinTopBar** appears when the phase allows back navigation
- Center text shows the phase's `displayTitle`
- Left chevron calls `goToPreviousPhase()`
- Phases that hide the back button get no top bar at all (more screen real estate)

#### 2. Remove .navigationBarBackButtonHidden and .toolbar from all phase views
Strip out the navigation toolbar code from every onboarding view. Since the coordinator now owns the top bar, individual views don't need to manage it:

- NameCollectionView (lines 78-87): remove `.navigationBarBackButtonHidden(true)` and `.toolbar { ... }`
- GoalReviewView (new merged view): don't add toolbar code
- ProgramReviewView (new merged view): don't add toolbar code
- OnboardingAssessmentView: remove toolbar code
- NotificationPermissionView: already has no back button
- WelcomeView / OnboardingSuccessView: already have no back button

#### 3. Handle confirmation dialogs
The current `OnboardingBackButton` supports `requiresConfirmation` for phases like intake and assessment. Since we're removing the per-view toolbar, add confirmation logic to the coordinator's back action:

```swift
@State private var showBackConfirmation = false

private func handleBack() {
    if onboardingStore.state.currentPhase.requiresBackConfirmation {
        showBackConfirmation = true
    } else {
        Task { await onboardingStore.goToPreviousPhase() }
    }
}

// Add alert modifier to the coordinator
.alert("Go Back?", isPresented: $showBackConfirmation) {
    Button("Stay", role: .cancel) {}
    Button("Go Back", role: .destructive) {
        Task { await onboardingStore.goToPreviousPhase() }
    }
} message: {
    Text("Your progress on this screen may not be saved.")
}
```

#### 4. OnboardingBackButton.swift — Can be deleted or left for other uses
Since onboarding no longer uses it, consider deleting `OnboardingBackButton.swift` and `OnboardingBackButtonModifier` if they're not used elsewhere.

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds
- [ ] No `NavigationStack` in `OnboardingCoordinatorView`
- [ ] No `.toolbar` or `.navigationBarBackButtonHidden` in onboarding views

#### Manual Verification:
- [ ] Back button matches main app style (20pt chevron, no "Back" text, 60pt bar height)
- [ ] Center text shows phase title
- [ ] Back button hidden on welcome, intake, notification, success, complete screens
- [ ] Confirmation dialog still appears when backing out of assessment
- [ ] No double navigation bars or visual artifacts

---

## Phase 5: Directional Slide Transitions

> Note: Phase numbering shifted — directional transitions was previously Phase 4.

### Overview
Replace the uniform crossfade with directional slide transitions. Forward navigation slides content left (new content enters from right). Backward navigation slides content right (previous content enters from left).

### Changes Required:

#### 1. OnboardingStore.swift — Track navigation direction
Already added `navigationDirection` in Phase 1. Ensure it's set in all navigation methods:

```swift
func advanceToNextPhase() async {
    navigationDirection = .forward
    // ... existing logic
}

func goToPreviousPhase() async {
    navigationDirection = .backward
    // ... existing logic
}

// Also set .forward in: completeAuth(), completeIntake(), completeAssessment(),
// approveGoals(), activateProgram(), completeOnboarding()
```

#### 2. OnboardingCoordinatorView.swift — Replace animation with asymmetric transition
Replace the current `.animation(.easeInOut(duration: 0.3), value: ...)` with a custom transition. Since Phase 4 removed the `NavigationStack`, this applies to the coordinator's VStack layout:

```swift
// In the coordinator's phase content area:
currentPhaseView
    .id(onboardingStore.state.currentPhase)
    .transition(phaseTransition)
    .animation(.easeInOut(duration: 0.35), value: onboardingStore.state.currentPhase)

private var phaseTransition: AnyTransition {
    switch onboardingStore.navigationDirection {
    case .forward:
        return .asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal: .move(edge: .leading).combined(with: .opacity)
        )
    case .backward:
        return .asymmetric(
            insertion: .move(edge: .leading).combined(with: .opacity),
            removal: .move(edge: .trailing).combined(with: .opacity)
        )
    }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds

#### Manual Verification:
- [ ] Tapping "Continue" / advancing slides content from right to left
- [ ] Tapping back button slides content from left to right
- [ ] The orb animates independently of the slide (smooth, not jarring)
- [ ] No visual glitches during transitions

---

## Phase 6: Intake Auto-Advance + Inline Assessment Decision

### Overview
When the intake conversation completes, instead of showing a "Continue" button, show an inline assessment decision card. The user either taps "Quick Assessment" or "Skip & Continue" — no separate AssessmentPromptView screen.

### Changes Required:

#### 1. IntakeView.swift — Replace Continue button with assessment decision
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Intake/IntakeView.swift`

When `intakeStore.isComplete` becomes true, instead of showing `IntakeContinueButton`, show an `IntakeCompletionView` inline:

```swift
if intakeStore.isComplete {
    IntakeCompletionView(
        onAssessment: {
            // Go to assessment
            Task {
                await onboardingStore.completeIntake(withAssessment: true)
            }
        },
        onSkip: {
            // Skip to name collection
            Task {
                await onboardingStore.completeIntake(withAssessment: false)
            }
        },
        isOnboarding: configuration.context == .onboarding
    )
}
```

#### 2. Create IntakeCompletionView component
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Intake/IntakeView.swift` (add as component within the file)

This replaces both the Continue button and the AssessmentPromptView:

```swift
struct IntakeCompletionView: View {
    let onAssessment: () -> Void
    let onSkip: () -> Void
    let isOnboarding: Bool

    var body: some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            // Assessment option card (only in onboarding)
            if isOnboarding {
                VStack(spacing: AppTheme.Spacing.md) {
                    Text("Quick Assessment?")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("A 5-10 minute assessment helps me build a more personalized program.")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)

                    HStack(spacing: AppTheme.Spacing.md) {
                        // Skip button
                        Button(action: onSkip) {
                            Text("Skip")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                        }

                        // Assessment button
                        Button(action: onAssessment) {
                            Text("Let's Do It")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.background)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.primaryText)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                    }
                }
                .padding(AppTheme.Spacing.xl)
                .background(AppTheme.Colors.surface.opacity(0.5))
                .cornerRadius(AppTheme.CornerRadius.large)
            } else {
                // Standalone: simple continue
                Button(action: onSkip) {
                    HStack {
                        Text("Continue")
                            .font(.system(size: 17, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(AppTheme.Colors.background)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(AppTheme.Colors.accent)
                    .cornerRadius(12)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }
}
```

#### 3. OnboardingStore.swift — Update completeIntake
```swift
func completeIntake(withAssessment: Bool = false) async {
    if withAssessment {
        state.currentPhase = .assessment
    } else {
        state.assessmentSkipped = true
        state.assessmentSkippedAt = Date()
        state.currentPhase = .nameCollection
    }
    navigationDirection = .forward
    objectWillChange.send()
    await saveAndSync()
}
```

#### 4. Delete IntakeContinueButton
Remove the `IntakeContinueButton` struct from IntakeView.swift since it's replaced by `IntakeCompletionView`.

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds
- [ ] No references to `AssessmentPromptView` or `.assessmentPrompt`

#### Manual Verification:
- [ ] When intake conversation completes, assessment decision card appears inline at the bottom
- [ ] Tapping "Let's Do It" goes to assessment
- [ ] Tapping "Skip" goes to name collection
- [ ] In standalone mode, just shows Continue button (no assessment option)
- [ ] The inline card animates in smoothly

**Implementation Note**: Pause for manual testing after this phase.

---

## Phase 7: Lazy Microphone Permission

### Overview
Remove the dedicated mic permission screen. Request mic permission lazily when user taps the mic button anywhere in the app. Show slashed mic when denied.

### Changes Required:

#### 1. SpeechManager.swift — Add mic permission handling
**File**: `AI Personal Trainer App/AI Personal Trainer App/Core/Voice/SpeechManager.swift`

Add published properties and mic permission request logic:

```swift
@Published var microphoneDenied = false
@Published var needsSettingsForMic = false

func startListening() async {
    guard !isListening else { return }
    guard let speechRecognizer else {
        errorMessage = "Speech recognition is unavailable."
        return
    }

    // Check/request mic permission first
    let micGranted = await requestMicrophonePermission()
    guard micGranted else {
        microphoneDenied = true
        return
    }
    microphoneDenied = false
    needsSettingsForMic = false

    // ... rest of existing startListening code (lines 31-76)
}

private func requestMicrophonePermission() async -> Bool {
    let session = AVAudioSession.sharedInstance()

    switch session.recordPermission {
    case .granted:
        return true
    case .denied:
        needsSettingsForMic = true
        return false
    case .undetermined:
        return await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    @unknown default:
        return false
    }
}
```

#### 2. IntakeView.swift — Always show mic, handle denied state
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Intake/IntakeView.swift`

Remove `isMicrophoneEnabled` from `IntakeViewConfiguration`. Always show mic button. Add Settings alert.

Update `IntakeInputArea`:
- Remove `showMicrophone` parameter, replace with `micDenied: Bool`
- Mic button always visible
- Show `mic.slash.fill` when denied, `mic.fill` when normal

Add Settings alert to IntakeView body:
```swift
@State private var showMicSettingsAlert = false

// In body:
.onChange(of: speechManager.needsSettingsForMic) { _, needsSettings in
    if needsSettings {
        showMicSettingsAlert = true
        speechManager.needsSettingsForMic = false
    }
}
.alert("Microphone Access", isPresented: $showMicSettingsAlert) {
    Button("Open Settings") {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("Enable microphone access in Settings to use voice input.")
}
```

#### 3. GoalReviewView + ProgramReviewView — Update mic gating
In the merged review views (created in Phase 1), the edit input sections currently check `onboardingStore.state.microphoneEnabled == true` to show the mic button. Change these to always show the mic button with lazy permission handling (same pattern as IntakeView).

#### 4. OnboardingCoordinatorView.swift — Remove isMicrophoneEnabled from IntakeView config
Change the IntakeView configuration to remove `isMicrophoneEnabled`:
```swift
IntakeView(configuration: IntakeViewConfiguration(
    context: .onboarding,
    onComplete: { ... },
    sessionIdCallback: { ... }
))
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds
- [ ] No references to `isMicrophoneEnabled` or `showMicrophone`

#### Manual Verification:
- [ ] Mic button visible on intake screen without prior permission
- [ ] Tapping mic requests permission via system prompt
- [ ] Granting starts recording
- [ ] Denying shows `mic.slash.fill`
- [ ] Tapping slashed mic again: shows system prompt (if undetermined) or Settings alert (if denied)
- [ ] Mic buttons on goal/program review screens also work with lazy permission

---

## Phase 8: Cleanup + Polish

### Overview
Remove dead code, verify all transitions are smooth, ensure no regressions.

### Changes Required:

#### 1. Remove dead code
- Remove `setMicrophonePermission()` calls that were in old mic permission flow
- Remove any references to deleted views in previews or tests
- Remove `AIOrb` struct from IntakeView.swift (replaced by shared `OnboardingOrbView`)
- Clean up unused imports

#### 2. Verify GoalReviewView and ProgramReviewView mic button
Ensure mic buttons in edit input sections use the same lazy permission pattern.

#### 3. Update OnboardingState
Consider whether `microphoneEnabled` field in `OnboardingState` is still needed. It could be kept for tracking purposes but shouldn't gate any UI. Alternatively, just check `AVAudioSession.sharedInstance().recordPermission` at runtime.

#### 4. Handle existing users mid-onboarding
Users who saved state with old phase names (e.g., `.microphonePermission`, `.goalDraft`) need migration. Add a migration step in `OnboardingStore.init()`:

```swift
private func migratePhaseIfNeeded() {
    // Map removed phases to nearest valid phase
    switch state.currentPhase {
    case .microphonePermission:
        state.currentPhase = .intake
    case .assessmentPrompt:
        state.currentPhase = .nameCollection
    case .goalDraft:
        state.currentPhase = .goalReview
    case .programDraft:
        state.currentPhase = .programReview
    default:
        break
    }
}
```

Note: Since we're removing cases from the enum, the JSON decoder will fail for old phase values. We need to handle this in the `OnboardingState` Codable conformance — add a custom `init(from decoder:)` that maps old raw values to new phases, or keep the old raw values in the enum as deprecated aliases.

**Better approach**: Keep the old raw string values in a migration map and handle them in the OnboardingStore init:

```swift
private init() {
    if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
       let savedState = try? JSONDecoder().decode(OnboardingState.self, from: data) {
        self.state = savedState
        migratePhaseIfNeeded()
    } else {
        self.state = OnboardingState.initial
    }
}
```

For the Codable issue, add custom decoding to `OnboardingPhase`:
```swift
init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    let rawValue = try container.decode(String.self)

    switch rawValue {
    case "microphone_permission": self = .intake
    case "assessment_prompt": self = .nameCollection
    case "goal_draft": self = .goalReview
    case "program_draft": self = .programReview
    default:
        guard let phase = OnboardingPhase(rawValue: rawValue) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown phase: \(rawValue)"))
        }
        self = phase
    }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds with zero warnings
- [ ] No references to removed phases except in migration code

#### Manual Verification:
- [ ] Full end-to-end onboarding flow works smoothly
- [ ] Existing users with saved state can resume onboarding (migration works)
- [ ] Back navigation works correctly at every phase
- [ ] No visual glitches or jarring transitions anywhere

---

## Testing Strategy

### Manual Testing Steps:
1. **Fresh install**: Complete full onboarding end-to-end. Verify all 11 phases, smooth transitions, orb animation, progress bar
2. **Assessment path**: Choose "Let's Do It" at inline assessment decision. Verify assessment → name collection flow
3. **Skip assessment path**: Choose "Skip" at inline decision. Verify intake → name collection
4. **Back navigation**: Test back button at every phase. Verify directional slide (right slide on back)
5. **Mic permission**: Test grant, deny, and permanently-denied flows
6. **Goal editing**: Test editing goals on the merged goal review screen
7. **Program editing**: Test editing program on the merged program review screen
8. **Migration**: Save state at an old phase (if possible), update app, verify migration
9. **Kill and resume**: Kill app mid-onboarding, reopen, verify state resumes correctly

## Performance Considerations

- The shared orb uses `.animation(.spring(...))` which is GPU-accelerated — should be smooth
- Directional transitions use `.move(edge:)` which is also GPU-composited
- The merged draft/review views reduce the total number of view swaps, improving perceived performance
- Progress bar animation is lightweight (single rectangle width change)

## Code References

- [OnboardingCoordinatorView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/OnboardingCoordinatorView.swift) — Main coordinator routing
- [OnboardingStore.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/OnboardingStore.swift) — Phase management, navigation
- [OnboardingModels.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Models/OnboardingModels.swift) — Phase enum, state struct
- [IntakeView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Intake/IntakeView.swift) — Intake conversation + input area
- [SpeechManager.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Core/Voice/SpeechManager.swift) — Audio recording + speech recognition
- [WelcomeView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/WelcomeView.swift) — Welcome screen with 120px orb
- [GoalDraftView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/GoalDraftView.swift) — To be merged into GoalReviewView
- [GoalFullReviewView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/GoalFullReviewView.swift) — To be merged into GoalReviewView
- [ProgramDraftView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/ProgramDraftView.swift) — To be merged into ProgramReviewView
- [ProgramFullReviewView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/ProgramFullReviewView.swift) — To be merged into ProgramReviewView
- [AssessmentPromptView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/AssessmentPromptView.swift) — To be replaced by inline decision
- [MicrophonePermissionView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/MicrophonePermissionView.swift) — To be deleted
- [AppTheme.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Core/Theme/AppTheme.swift) — Orb gradient and color definitions
- [AppView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/App/AppView.swift) — Top-level routing (no changes needed)
