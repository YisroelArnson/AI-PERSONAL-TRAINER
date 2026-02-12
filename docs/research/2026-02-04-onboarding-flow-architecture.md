---
date: 2026-02-04T12:00:00-05:00
researcher: Claude
git_commit: 335d88481164e3b376ccf029eb78c40704900afd
branch: pt-process-implementation
repository: AI-PERSONAL-TRAINER
topic: "Onboarding Flow Architecture - Step Transitions, API Calls, and UX Smoothness"
tags: [research, codebase, onboarding, intake, navigation, ux]
status: complete
last_updated: 2026-02-04
last_updated_by: Claude
---

# Research: Onboarding Flow Architecture

**Date**: 2026-02-04
**Researcher**: Claude
**Git Commit**: 335d884
**Branch**: pt-process-implementation
**Repository**: AI-PERSONAL-TRAINER

## Research Question
How does the onboarding flow work end-to-end? What triggers each step transition? What API calls happen at each step? Where does the flow feel disjointed, and how can it be improved?

## Summary

The onboarding flow is a 15-phase linear sequence managed by a singleton `OnboardingStore` and rendered through `OnboardingCoordinatorView` as a flat view-swap (not a navigation push). Each phase is a completely independent SwiftUI view with its own layout, orb variant, and interaction pattern. Transitions between phases are triggered by mutating `OnboardingStore.state.currentPhase` and are animated with a single `.easeInOut(duration: 0.3)` animation. The flow has **several architectural sources of disjointedness** identified below.

## Detailed Findings

### 1. The 15-Phase Flow

| # | Phase | View | User Action to Advance | API Call |
|---|-------|------|----------------------|----------|
| 1 | `.welcome` | `WelcomeView` | Tap "Begin Your Journey" | None |
| 2 | `.auth` | `OnboardingAuthView` | Enter email + accept terms + tap Continue | Supabase `signInWithOTP()` |
| 3 | `.authVerification` | `OTPVerificationView` | Enter 6-digit code | Supabase `verifyOTP()` |
| 4 | `.microphonePermission` | `MicrophonePermissionView` | Tap "Enable Voice" or "I'll Type Instead" | iOS `AVAudioApplication.requestRecordPermission` |
| 5 | `.intake` | `IntakeView` | Answer ~6-8 conversational questions, tap "Continue" | `POST /trainer/intake/sessions` (create), `POST .../answers` (SSE stream per answer), `POST .../confirm` (fire-and-forget) |
| 6 | `.assessmentPrompt` | `AssessmentPromptView` | Tap "Let's Do It" or "Skip for Now" | None |
| 7 | `.assessment` | `OnboardingAssessmentView` | Complete fitness tests | `POST /trainer/assessment/sessions`, `GET /trainer/assessment/steps`, `POST .../submit`, `POST .../complete` |
| 8 | `.nameCollection` | `NameCollectionView` | Enter name + wait for goal generation | `POST /trainer/goals/draft` (via GoalContractStore) |
| 9 | `.goalDraft` | `GoalDraftView` | Watch typewriter, tap "Review & Edit" | None (uses already-fetched data) |
| 10 | `.goalReview` | `GoalFullReviewView` | Edit goals, tap "Approve Goals" | `POST /trainer/goals/{id}/edit`, `POST .../approve` |
| 11 | `.programDraft` | `ProgramDraftView` | Watch typewriter, tap "Review" | `POST /trainer/programs/draft` |
| 12 | `.programReview` | `ProgramFullReviewView` | Edit program, tap "Activate Program" | `POST /trainer/programs/{id}/edit`, `POST .../approve`, `POST .../activate` |
| 13 | `.notificationPermission` | `NotificationPermissionView` | Tap "Enable" or "Skip" | iOS `UNUserNotificationCenter.requestAuthorization` |
| 14 | `.success` | `OnboardingSuccessView` | Tap "Get Started" | None |
| 15 | `.complete` | `EmptyView` | (auto-routes to MainAppView) | None |

### 2. Navigation Architecture

**File**: [OnboardingCoordinatorView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/OnboardingCoordinatorView.swift)

The coordinator wraps a `NavigationStack` with a `@ViewBuilder` that switches on `onboardingStore.state.currentPhase`. This means:
- **No push/pop navigation** - views are swapped in-place
- **Single animation** on the entire content: `.animation(.easeInOut(duration: 0.3), value: onboardingStore.state.currentPhase)` (line 9)
- **No shared transition context** - each view is a completely independent tree
- **No NavigationPath** - no programmatic navigation stack management

### 3. How Step Transitions Work

Every transition follows this pattern:
1. User action triggers a method on `OnboardingStore` (e.g., `completeIntake()`, `advanceToNextPhase()`, `skipAssessment()`)
2. The method sets `state.currentPhase = .<nextPhase>`
3. The `@Published state` triggers SwiftUI reactivity
4. `OnboardingCoordinatorView` re-evaluates the `switch` and renders a new view
5. The `.animation(.easeInOut(duration: 0.3))` modifier animates the swap

**Key transition methods** in [OnboardingStore.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/OnboardingStore.swift):
- `startOnboarding()` (line 72) - welcome → auth
- `completeAuth()` (line 123) - authVerification → microphonePermission
- `advanceToNextPhase()` (line 78) - generic linear advance
- `completeIntake()` (line 214) - intake → assessmentPrompt (with explicit `objectWillChange.send()`)
- `skipAssessment()` (line 166) - assessmentPrompt → nameCollection (skips assessment)
- `completeAssessment()` (line 173) - assessment → nameCollection
- `completeGoalDraft()` (line 225) - goalDraft → goalReview
- `approveGoals()` (line 230) - goalReview → programDraft
- `completeProgramDraft()` (line 237) - programDraft → programReview
- `activateProgram()` (line 242) - programReview → notificationPermission
- `completeOnboarding()` (line 249) - success → complete

### 4. API Call Details by Phase

#### Phase 5: Intake (Heaviest API Usage)
- **Session creation**: `POST /trainer/intake/sessions` - Creates or resumes an intake session, returns initial prompt from Claude
- **Answer streaming**: `POST /trainer/intake/sessions/{id}/answers` - SSE stream sending events: `assistant_message`, `checklist`, `progress`, `conversation_complete`, `safety_flag`, `done`
- **Confirmation**: `POST /trainer/intake/sessions/{id}/confirm` - Fire-and-forget call (60s timeout) that synthesizes conversation into structured summary via Claude
- **LLM**: Claude Haiku 4.5 for fast Q&A analysis

#### Phase 8: Name Collection + Goal Draft
- **Goal drafting**: `POST /trainer/goals/draft` - Called on view appear via `GoalContractStore.draft()`
- Goal generation happens in background while user enters their name
- Button disabled until both name entered AND goals loaded (`canContinue` guard)

#### Phase 10-12: Goal Review → Program
- **Goal edit**: `POST /trainer/goals/{id}/edit`
- **Goal approve**: `POST /trainer/goals/{id}/approve`
- **Program draft**: `POST /trainer/programs/draft`
- **Program edit/approve/activate**: `POST /trainer/programs/{id}/edit`, `/approve`, `/activate`

### 5. Dual Routing Layer Problem

**File**: [AppView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/App/AppView.swift) (lines 16-31)

There are **two independent routing decisions**:

1. **AppView** decides between `WelcomeView`, `OnboardingCoordinatorView`, and `MainAppView` based on `hasStartedOnboarding`, `isAuthenticated`, and `isOnboardingComplete`
2. **OnboardingCoordinatorView** decides which phase view to show based on `currentPhase`

This creates a jarring moment: when `WelcomeView` calls `startOnboarding()`, the user transitions from `WelcomeView` (rendered directly by AppView) to `OnboardingCoordinatorView` (which shows `OnboardingAuthView`). But `OnboardingCoordinatorView` also has `.welcome` in its switch case (line 16-17), creating a dead code path.

Similarly, after OTP verification, `completeAuth()` sets phase to `.microphonePermission`, but the transition from unauthenticated → authenticated also triggers AppView to re-evaluate, potentially causing a double-render.

## Architecture Insights: Sources of Disjointedness

### Issue 1: Abrupt View Swaps (No Shared Visual Continuity)
Every phase is a completely independent view hierarchy. The orb appears in different sizes, positions, and styles on each screen:
- **WelcomeView**: 120px pulsing orb, centered
- **MicrophonePermissionView**: 100px orb with mic icon, centered
- **IntakeView**: 80px orb, fixed at top
- **AssessmentPromptView**: 100px orb with clipboard icon
- **NameCollectionView**: 100px pulsing orb with ProgressView
- **GoalDraftView**: 50px orb, top-left aligned

There is no visual element that persists across transitions. The orb — the app's central identity element — jumps around in size and position, breaking continuity.

### Issue 2: Mixed Interaction Paradigms
The flow switches between fundamentally different interaction modes without transition:
- **Static screens** (Welcome, MicPermission, AssessmentPrompt, Notifications) - centered content, big buttons
- **Conversational screen** (Intake) - chat-like Q&A with streaming, progress bar, input field
- **Form screens** (NameCollection) - text input with loading
- **Card review screens** (GoalDraft, GoalReview, ProgramDraft, ProgramReview) - scrollable cards with edit capability
- **Celebration screen** (Success) - confetti, animations

Each mode has its own layout structure. The switch between "answering conversational questions" → "static assessment prompt screen" → "enter your name form" feels like three different apps.

### Issue 3: Unnecessary Manual Button Presses
Several transitions require an explicit button tap that doesn't add value:
- **Intake → AssessmentPrompt**: After intake completes, user must tap "Continue" button. This is a manual step where the app could auto-advance with a brief summary/transition.
- **GoalDraft → GoalReview**: User watches typewriter, then taps "Review & Edit". The draft and review could be combined.
- **ProgramDraft → ProgramReview**: Same pattern — typewriter then manual tap to review.

### Issue 4: No Progress Indicator Across the Full Onboarding
Each phase has its own progress indicator (or none at all). There's no global progress bar showing "you're 60% through onboarding." The `IntakeView` has its own progress bar for conversation topics, but it disappears when moving to the next phase.

### Issue 5: Loading States Feel Disconnected
- **NameCollectionView** (line 52-66): Shows a ProgressView with "Creating your goal plan..." while goals generate. But the user has no context for what's happening or how long it will take.
- **Intake confirm**: Fire-and-forget with no user-facing feedback. The `isConfirming` state shows "Finishing up..." text (IntakeView line 174-178), but the user has already moved on.
- **GoalDraftView**: If goals haven't loaded yet, shows "Loading goals..." inside the card (line 172-176), which feels like a broken state.

### Issue 6: Transition Animation is Uniform and Basic
All transitions use the same `.easeInOut(duration: 0.3)` on the entire content. This creates a generic crossfade that:
- Doesn't communicate direction (forward/backward)
- Doesn't draw attention to what changed
- Makes every transition feel the same regardless of significance

### Issue 7: The Assessment Fork Creates Confusion
The flow branches at assessment:
- **Take assessment**: intake → assessmentPrompt → assessment → nameCollection
- **Skip assessment**: intake → assessmentPrompt → nameCollection

The `advanceToNextPhase()` method (line 86-90) silently skips `.assessment` if `assessmentSkipped` is true, but this branching is invisible to the user. The assessment prompt itself is a full-screen interruption in the flow.

## Improvement Recommendations

### High Impact: Shared Persistent Orb
Create a single orb component that lives outside the phase view hierarchy (in the coordinator) and animates its size/position with `matchedGeometryEffect` between phases. This would give visual continuity as the "AI trainer" guides you through each step.

### High Impact: Merge Draft + Review Screens
Combine GoalDraftView/GoalFullReviewView into a single view with a reveal animation. Same for ProgramDraft/ProgramReview. The typewriter intro can play while content loads, then seamlessly reveal the editable card — eliminating two unnecessary taps.

### High Impact: Global Progress Indicator
Add a thin progress bar at the very top of `OnboardingCoordinatorView` that maps `currentPhase` to a percentage. This gives users a sense of where they are in the full journey.

### Medium Impact: Directional Transitions
Replace the uniform crossfade with directional slide transitions (slide left for forward, right for backward). This communicates progress direction and feels more intentional.

### Medium Impact: Auto-Advance from Intake
When intake conversation completes, instead of showing a "Continue" button, briefly show a summary/confirmation animation and auto-advance to the next phase after 1-2 seconds.

### Medium Impact: Inline Assessment Decision
Instead of a full-screen AssessmentPromptView, present the assessment option as an inline decision within the flow (e.g., a card within the intake completion screen), reducing the number of distinct screens.

### Lower Impact: Consistent View Structure
Standardize the layout template: orb position, content area, action buttons. Use a shared `OnboardingPhaseTemplate` view that accepts content and actions, ensuring every screen has the same visual skeleton.

## Code References

- [OnboardingCoordinatorView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/OnboardingCoordinatorView.swift) - Main coordinator, all phase routing
- [OnboardingStore.swift:78-93](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/OnboardingStore.swift) - Phase advancement logic
- [OnboardingStore.swift:214-221](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/OnboardingStore.swift) - Intake completion with explicit objectWillChange
- [OnboardingModels.swift:5-84](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Models/OnboardingModels.swift) - Phase enum with all 15 phases
- [OnboardingModels.swift:88-145](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Models/OnboardingModels.swift) - Full onboarding state struct
- [AppView.swift:16-31](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/App/AppView.swift) - Top-level routing decisions
- [IntakeView.swift:244-267](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Intake/IntakeView.swift) - Continue button vs input area toggle
- [IntakeSessionStore.swift:43-106](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/IntakeSessionStore.swift) - Answer submission with SSE streaming
- [IntakeSessionStore.swift:112-151](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/IntakeSessionStore.swift) - Confirm intake with retry logic
- [NameCollectionView.swift:177-193](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/NameCollectionView.swift) - Goal generation on appear
- [GoalDraftView.swift:100-112](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/GoalDraftView.swift) - Typewriter intro before showing card
- [WelcomeView.swift:191-203](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/WelcomeView.swift) - Welcome animation sequence

## Open Questions

1. **How long does goal generation typically take?** If it's fast (<3s), the NameCollectionView loading state may feel like a stutter. If it's slow (>10s), the user is stuck waiting.
2. **Is the assessment flow fully implemented?** The assessment steps/submission endpoints are defined but the view logic wasn't fully explored.
3. **Are there plans for backend-driven onboarding?** The current flow is entirely client-driven with hardcoded phases. A server-controlled flow could allow A/B testing of different sequences.
4. **What happens if the user kills the app mid-onboarding?** State is persisted to UserDefaults, but the singleton stores (IntakeSessionStore, GoalContractStore) are not persisted — only OnboardingState is. Resuming would re-create sessions from scratch.
