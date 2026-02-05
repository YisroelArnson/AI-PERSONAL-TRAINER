# Remove Microphone Permission Screen — Lazy Permission Request

## Overview

Remove the dedicated microphone permission screen (phase 4) from onboarding and instead request microphone permission lazily when the user first taps the mic button. If permission is denied, show a slashed mic icon; tapping the slashed mic re-offers the permission prompt (or directs to Settings if permanently denied).

## Current State Analysis

The onboarding flow has 15 phases. Phase 4 (`microphonePermission`) is a full-screen `MicrophonePermissionView` that:
- Requests `AVAudioApplication.requestRecordPermission` upfront
- Stores result in `OnboardingState.microphoneEnabled`
- Offers "I'll Type Instead" to skip

The stored `microphoneEnabled` boolean flows into `IntakeView` via `IntakeViewConfiguration.isMicrophoneEnabled`, which controls whether the mic button is visible at all (`showMicrophone` parameter).

### Key Discoveries:
- `OnboardingStore.completeAuth()` (line 124) transitions to `.microphonePermission`
- `OnboardingCoordinatorView` (line 25-26) routes `.microphonePermission` → `MicrophonePermissionView`
- `IntakeView` line 263: `showMicrophone: configuration.isMicrophoneEnabled` hides mic entirely if permission wasn't granted
- `SpeechManager.startListening()` requests **speech recognition** authorization but does NOT request **microphone** permission — it assumes mic permission was already granted
- `IntakeViewConfiguration` has `isMicrophoneEnabled` field that gates mic visibility

## Desired End State

- The `microphonePermission` phase is removed from onboarding (14 phases instead of 15)
- After auth verification, the user goes directly to intake
- The mic button is **always visible** in IntakeView
- First mic tap → system permission prompt appears
- If permission granted → recording starts normally
- If permission denied → mic icon changes to `mic.slash.fill` (slashed)
- Tapping slashed mic → re-request permission (system prompt if not yet permanently denied, or alert with Settings link if permanently denied)
- `OnboardingState.microphoneEnabled` is updated reactively based on actual permission status

### Verification:
- Build succeeds with no errors
- Onboarding skips from auth verification directly to intake
- Mic button visible in intake regardless of prior permission state
- Tapping mic requests permission on first use
- Denied permission shows slashed mic icon
- Tapping slashed mic re-offers permission

## What We're NOT Doing

- Not removing `MicrophonePermissionView.swift` file (will delete it to keep codebase clean)
- Not changing notification permission flow (that stays as a dedicated screen)
- Not changing SpeechManager's speech recognition authorization (that already works lazily)
- Not adding mic permission handling outside of IntakeView (other screens can be handled later if needed)

## Implementation Approach

Remove the phase from the enum and all routing, then make the mic button in IntakeView always visible with lazy permission handling. The key insight is that `SpeechManager.startListening()` is the right place to add mic permission checking since it's the single entry point for all audio recording.

---

## Phase 1: Remove Microphone Permission Phase from Onboarding

### Overview
Remove the `.microphonePermission` case from the phase enum, update all navigation logic, and remove the coordinator routing.

### Changes Required:

#### 1. OnboardingModels.swift — Remove phase from enum
**File**: `AI Personal Trainer App/AI Personal Trainer App/Models/OnboardingModels.swift`

Remove `.microphonePermission` from the `OnboardingPhase` enum (line 9), its `displayTitle` case (line 28), and update `previousPhase` logic. The `previousPhase` for `.intake` should now return `.authVerification` (which will then skip back to `.auth` via the existing skip logic on line 54).

Also remove `.microphonePermission` from `hideBackButton` if it's there (it's not currently, but verify).

#### 2. OnboardingStore.swift — Update completeAuth() transition
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift`

Change `completeAuth()` (line 123-126) to transition to `.intake` instead of `.microphonePermission`.

Keep `setMicrophonePermission()` method — it's still useful for tracking state, but it will now be called from IntakeView when permission is granted/denied lazily.

#### 3. OnboardingCoordinatorView.swift — Remove routing case, always enable mic
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/OnboardingCoordinatorView.swift`

- Remove the `.microphonePermission` case (lines 25-26)
- Change `IntakeView` configuration: set `isMicrophoneEnabled: true` always (line 34)

#### 4. Delete MicrophonePermissionView.swift
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/MicrophonePermissionView.swift`

Delete this file entirely — it's no longer referenced.

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `xcodebuild -project "AI Personal Trainer App.xcodeproj" -scheme "AI Personal Trainer App" -destination "id=00008120-001215180132201E" -configuration Debug build`
- [ ] No references to `.microphonePermission` in routing code
- [ ] No references to `MicrophonePermissionView` in coordinator

#### Manual Verification:
- [ ] After OTP verification, user lands directly on intake screen
- [ ] Back button from intake navigates to auth (not mic permission)

---

## Phase 2: Lazy Microphone Permission in IntakeView

### Overview
Make the mic button always visible. On tap, check mic permission status. Request if needed. Show slashed mic if denied.

### Changes Required:

#### 1. SpeechManager.swift — Add microphone permission request
**File**: `AI Personal Trainer App/AI Personal Trainer App/Core/Voice/SpeechManager.swift`

Add a new published property `microphoneDenied` and a method to check/request microphone permission before starting listening. Modify `startListening()` to request mic permission first (before speech recognition auth).

```swift
@Published var microphoneDenied = false

func startListening() async {
    guard !isListening else { return }
    guard let speechRecognizer else {
        errorMessage = "Speech recognition is unavailable."
        return
    }

    // Check/request microphone permission first
    let micGranted = await requestMicrophonePermission()
    guard micGranted else {
        microphoneDenied = true
        return
    }
    microphoneDenied = false

    // ... rest of existing startListening code ...
}

private func requestMicrophonePermission() async -> Bool {
    await withCheckedContinuation { continuation in
        AVAudioApplication.requestRecordPermission { granted in
            continuation.resume(returning: granted)
        }
    }
}
```

#### 2. IntakeView.swift — Update mic button and toggleRecording
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Intake/IntakeView.swift`

**Remove `showMicrophone` gating** — the mic button should always be visible.

**Update IntakeInputArea** to accept a `micDenied` binding and show `mic.slash.fill` when denied:
- When `micDenied` is true: show `mic.slash.fill` icon with a muted appearance
- On tap when denied: still call `onMicTap` which will re-trigger permission request via `SpeechManager.startListening()`

**Update IntakeViewConfiguration**: Remove `isMicrophoneEnabled` field (or keep it but ignore it for mic visibility).

Changes to `IntakeInputArea`:
- Replace `showMicrophone: Bool` parameter with `micDenied: Bool`
- Mic button is always shown
- Icon switches between `mic.fill` and `mic.slash.fill` based on `micDenied` and `isRecording`

```swift
// In IntakeInputArea
// Always show mic button
Button(action: onMicTap) {
    ZStack {
        Circle()
            .fill(isRecording ? Color.red.opacity(0.2) : AppTheme.Colors.surface)
            .frame(width: 50, height: 50)

        Image(systemName: micDenied ? "mic.slash.fill" : "mic.fill")
            .font(.system(size: 20, weight: .medium))
            .foregroundColor(
                isRecording ? Color(hex: "FF3B30") :
                micDenied ? AppTheme.Colors.tertiaryText :
                AppTheme.Colors.primaryText
            )
    }
}
.disabled(isLoading)
```

#### 3. IntakeViewConfiguration — Clean up isMicrophoneEnabled
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Intake/IntakeView.swift`

Remove `isMicrophoneEnabled` from `IntakeViewConfiguration` since mic visibility is no longer gated on prior permission. Update the `standalone` static var and all call sites.

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds
- [ ] No compilation warnings related to unused `isMicrophoneEnabled`

#### Manual Verification:
- [ ] Mic button visible in intake even with no prior permission
- [ ] Tapping mic triggers system permission prompt on first use
- [ ] Granting permission starts recording immediately
- [ ] Denying permission shows slashed mic icon (`mic.slash.fill`)
- [ ] Tapping slashed mic re-requests permission (or shows Settings prompt if permanently denied)
- [ ] After granting permission mid-session, mic works normally going forward

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 3: Handle Permanently Denied Permission

### Overview
On iOS, once a user denies a permission prompt, subsequent calls to `requestRecordPermission` return `false` immediately without showing a prompt. We need to detect this and offer to open Settings.

### Changes Required:

#### 1. SpeechManager.swift — Detect permanent denial
**File**: `AI Personal Trainer App/AI Personal Trainer App/Core/Voice/SpeechManager.swift`

Check `AVAudioSession.sharedInstance().recordPermission` before requesting. If it's `.denied`, the user has permanently denied it and we should signal that Settings is needed.

```swift
@Published var needsSettingsForMic = false

private func requestMicrophonePermission() async -> Bool {
    let session = AVAudioSession.sharedInstance()

    switch session.recordPermission {
    case .granted:
        return true
    case .denied:
        // Previously denied — system won't show prompt again
        needsSettingsForMic = true
        microphoneDenied = true
        return false
    case .undetermined:
        // First time — system will show prompt
        let granted = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        return granted
    @unknown default:
        return false
    }
}
```

#### 2. IntakeView.swift — Show Settings alert when permanently denied
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Intake/IntakeView.swift`

Add an alert that appears when `speechManager.needsSettingsForMic` becomes true, offering to open Settings:

```swift
.alert("Microphone Access", isPresented: $showMicSettingsAlert) {
    Button("Open Settings") {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("Microphone access was previously denied. Enable it in Settings to use voice input.")
}
```

Reset `needsSettingsForMic` after showing the alert. When the user returns from Settings, check permission status again.

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds

#### Manual Verification:
- [ ] First tap on mic shows system permission prompt
- [ ] After denying, mic shows slashed icon
- [ ] Tapping slashed mic again shows "Open Settings" alert
- [ ] Opening Settings and granting permission, then returning to app, mic works normally

---

## Testing Strategy

### Manual Testing Steps:
1. Fresh install (no prior permissions) — tap mic in intake, see system prompt
2. Grant permission — recording starts, mic icon is normal
3. Fresh install — tap mic, deny permission — mic shows slash
4. Tap slashed mic — see Settings alert (if permanently denied) or re-prompt
5. Go to Settings, grant permission, return — mic works
6. Full onboarding flow — verify no mic permission screen appears between auth and intake
7. Back navigation from intake — goes to auth, not mic permission

## Code References

- [OnboardingModels.swift:5-84](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Models/OnboardingModels.swift) — Phase enum
- [OnboardingStore.swift:123-126](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Services/OnboardingStore.swift) — completeAuth() transition
- [OnboardingCoordinatorView.swift:25-38](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/OnboardingCoordinatorView.swift) — Phase routing and IntakeView config
- [IntakeView.swift:256-267](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Intake/IntakeView.swift) — Input area with mic gating
- [IntakeView.swift:310-321](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Intake/IntakeView.swift) — toggleRecording
- [IntakeView.swift:526-588](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Intake/IntakeView.swift) — IntakeInputArea component
- [SpeechManager.swift:25-77](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Core/Voice/SpeechManager.swift) — startListening
- [MicrophonePermissionView.swift](AI%20Personal%20Trainer%20App/AI%20Personal%20Trainer%20App/Features/Onboarding/MicrophonePermissionView.swift) — To be deleted
