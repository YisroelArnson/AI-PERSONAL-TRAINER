# Onboarding Bug Fix Plan

Each issue below includes: what's wrong, how a user hits it, and the specific fix.

---

## 1. Returning user login with no network silently drops into empty main app

**Problem:** `OnboardingStore.completeLogin()` (line 247-250) catches any `fetchJourneyState()` error and sets `phase = .complete`. A returning user on poor WiFi gets teleported into MainAppView with zero data — no program, no goals, empty dashboard.

**How a user hits it:** Tap "Log in", verify OTP on cellular, then lose signal. Or have a momentary server outage.

**Fix in `OnboardingStore.swift`:**
- Replace the catch block with a retry + error state pattern:
```swift
func completeLogin() async {
    navigationDirection = .forward
    isLoading = true
    errorMessage = nil

    do {
        let journey = try await apiService.fetchJourneyState()

        if journey.programStatus == "active" {
            state.currentPhase = .complete
        } else if journey.goalsStatus == "complete" {
            state.currentPhase = .programReview
        } else if journey.intakeStatus == "complete" {
            Task { await GoalContractStore.shared.fetchGoalOptions() }
            state.currentPhase = .processOverview
        } else {
            isReturningLogin = false
            state.currentStep = OnboardingScreens.introCount
            state.currentPhase = .intake
        }
    } catch {
        // Show error instead of assuming complete
        errorMessage = "Couldn't connect. Please check your connection and try again."
        isLoading = false
        isReturningLogin = false
        await saveAndSync()
        return  // Stay on current phase — don't transition
    }

    isLoading = false
    isReturningLogin = false
    await saveAndSync()
}
```
- In `OTPVerificationView.swift`, after `completeAuth()` returns, check `onboardingStore.errorMessage` and show it if present, along with a "Retry" button that calls `completeAuth()` again.

---

## 2. Goal generation is fire-and-forget — failure leaves user stuck

**Problem:** `OnboardingStore.completeAuth()` (line 218) fires `Task { await GoalContractStore.shared.fetchGoalOptions() }` and immediately advances to `.processOverview`. If that background task fails, the user reaches GoalReviewView with empty options and only sees an error if `goalStore.errorMessage` is set.

**How a user hits it:** Backend is slow or returns 500 during goal generation. User taps through ProcessOverview, arrives at GoalReview, sees "Couldn't load goal options" error.

**Fix:** This is actually partially handled — GoalReviewView (line 44-47) already re-fetches if options are empty:
```swift
.task {
    if goalStore.goalOptions.isEmpty && !goalStore.isLoading {
        await goalStore.fetchGoalOptions()
    }
}
```
And it has an error state with retry (line 70-83). **The existing fallback is decent.** The improvement is:
- In `GoalContractStore.fetchGoalOptions()`, add a single automatic retry with 2s delay before surfacing the error:
```swift
func fetchGoalOptions() async {
    isLoading = true
    errorMessage = nil
    do {
        let response = try await apiService.generateGoalOptions()
        goalOptions = response.options
    } catch {
        // Retry once after 2 seconds
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        do {
            let response = try await apiService.generateGoalOptions()
            goalOptions = response.options
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    isLoading = false
}
```

---

## 3. Program activation has no error handling — user gets stuck on button

**Problem:** `ProgramReviewView.activateProgram()` (line 142-151) chains `programStore.approve()`, `programStore.activate()`, and `onboardingStore.activateProgram()` with no error checks. If `approve()` or `activate()` fails, `programStore.errorMessage` gets set inside those stores, but `ProgramReviewView` doesn't check it after activation. The button just stops spinning and nothing happens.

**How a user hits it:** Network blip during program activation. Button spins, stops, and nothing happens. No error message visible.

**Fix in `ProgramReviewView.swift`:**
```swift
private func activateProgram() {
    Haptic.medium()
    isActivating = true
    Task {
        await programStore.approve()

        // Check if approve failed
        guard programStore.errorMessage == nil else {
            isActivating = false
            return
        }

        await programStore.activate()

        // Check if activate failed
        guard programStore.errorMessage == nil else {
            isActivating = false
            return
        }

        await onboardingStore.activateProgram()
        isActivating = false
    }
}
```
The view already has an `errorState` (line 65-78) that shows when `programStore.errorMessage` is set and `program` is non-nil. But it only renders when `program == nil`. Add a second error display for activation failures:
```swift
// After the activate button, add:
if let error = programStore.errorMessage, programStore.program != nil {
    Text(error)
        .font(.system(size: 14))
        .foregroundColor(AppTheme.Colors.danger)
        .padding(.top, AppTheme.Spacing.md)
        .multilineTextAlignment(.center)
}
```

---

## 4. `syncWithBackend()` is a no-op — app relaunch doesn't restore correct phase

**Problem:** `OnboardingStore.syncWithBackend()` (line 53-55) just calls `saveLocally()`. When AppView calls it on authenticated relaunch (AppView.swift:40), it doesn't check the backend journey state. A user who made progress on another device or whose local state is stale gets stuck.

**How a user hits it:** Delete and reinstall app, or clear app data. Supabase session persists in keychain, app relaunches with `isAuthenticated = true` but `OnboardingState` is `.initial` from fresh UserDefaults. `syncWithBackend()` does nothing.

**Fix in `OnboardingStore.swift`:**
```swift
func syncWithBackend() async {
    // Only sync if user is mid-onboarding (not complete, not initial intro)
    guard state.currentPhase != .complete else {
        saveLocally()
        return
    }

    do {
        let journey = try await apiService.fetchJourneyState()

        if journey.programStatus == "active" {
            state.currentPhase = .complete
        } else if journey.goalsStatus == "complete" {
            state.currentPhase = .programReview
        } else if journey.intakeStatus == "complete" {
            // If local state is earlier than backend, advance
            if state.currentPhase.isEarlierThan(.processOverview) {
                Task { await GoalContractStore.shared.fetchGoalOptions() }
                state.currentPhase = .processOverview
            }
        }
        // If backend has no progress, keep local state as-is
    } catch {
        // Network error — just save locally, don't change state
    }

    saveLocally()
}
```
This requires adding a helper to `OnboardingPhase`:
```swift
func isEarlierThan(_ other: OnboardingPhase) -> Bool {
    let order: [OnboardingPhase] = [.intro, .intake, .intakeComplete, .auth, .authVerification, .processOverview, .goalReview, .programReview, .notificationPermission, .success, .complete]
    guard let selfIndex = order.firstIndex(of: self),
          let otherIndex = order.firstIndex(of: other) else { return false }
    return selfIndex < otherIndex
}
```

---

## 5. OTP timer never cancels — memory leak and broken countdown

**Problem:** `OTPVerificationView` (line 13) creates `Timer.publish(every: 1, ...).autoconnect()` as a stored property. This timer runs forever — even after the view is removed from the hierarchy. If the user navigates away and back, a new view is created with a new timer, but the old one is still firing.

**How a user hits it:** Go to OTP screen, tap "Use a different email", go back to auth, re-enter email, return to OTP. The countdown behaves erratically because the old timer instance may still be decrementing in the background.

**Fix in `OTPVerificationView.swift`:**
Replace the stored timer with a `TimelineView` approach, or use `onAppear`/`onDisappear`:
```swift
// Remove line 13 (private let timer = ...)

// Replace .onReceive(timer) block with:
.onAppear {
    startResendTimer()
}
.onDisappear {
    stopResendTimer()
}
```

Add timer state and management:
```swift
@State private var timerTask: Task<Void, Never>?

private func startResendTimer() {
    resendCountdown = 30
    canResend = false
    timerTask?.cancel()
    timerTask = Task {
        while resendCountdown > 0 {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            resendCountdown -= 1
        }
        canResend = true
    }
}

private func stopResendTimer() {
    timerTask?.cancel()
    timerTask = nil
}
```

Also call `startResendTimer()` in `resendCode()` after successful resend instead of manually resetting countdown.

---

## 6. Back from OTP doesn't preserve email

**Problem:** `OTPVerificationView.useDifferentEmail()` (line 192-198) clears `pendingEmail` then navigates to `.auth`. When OnboardingAuthView renders, the email field starts empty. If the user actually just wanted to go back (not change email), they have to retype.

**How a user hits it:** Realize they mistyped their email, tap "Use a different email", have to retype the whole thing.

**Fix in `OTPVerificationView.swift`:** Don't clear the email — let auth view pre-fill it:
```swift
private func useDifferentEmail() {
    // Don't clear pending email — let auth view pre-fill it
    code = ""
    errorMessage = nil
    Task {
        await onboardingStore.setPhase(.auth)
    }
}
```

In `OnboardingAuthView.swift`, pre-fill the email field on appear:
```swift
.onAppear {
    if let pending = onboardingStore.state.pendingEmail, email.isEmpty {
        email = pending
    }
}
```

---

## 7. Notification permission granted but never registers for remote notifications

**Problem:** `NotificationPermissionView.requestNotificationPermission()` (line 135-143) calls `UNUserNotificationCenter.current().requestAuthorization()` but never calls `UIApplication.shared.registerForRemoteNotifications()`. The OS-level permission is granted, but the app never gets an APNs token, so push notifications won't be delivered.

**How a user hits it:** Every user who taps "Enable Notifications" during onboarding. They think they'll get workout reminders but never do.

**Fix in `NotificationPermissionView.swift`:**
```swift
private func requestNotificationPermission() {
    Haptic.medium()
    isRequestingPermission = true

    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
        DispatchQueue.main.async {
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
            isRequestingPermission = false
            Task {
                await onboardingStore.setNotificationPermission(granted)
                await onboardingStore.setPhase(.success)
            }
        }
    }
}
```

---

## 8. GoalReviewView: confirmSelection() silently fails if contract is nil

**Problem:** `GoalReviewView.confirmSelection()` (line 247-258) calls `goalStore.selectOption(option)`, then checks `if goalStore.contract != nil`. If the API call inside `selectOption` fails, `contract` stays nil and the `if` block is skipped. `isSelecting` goes back to false, the button re-enables, but the user sees no error.

**How a user hits it:** Select a goal, tap "Continue with this goal", backend returns error. Button stops spinning, nothing happens, no message.

**Fix in `GoalReviewView.swift`:**
```swift
private func confirmSelection() {
    guard let option = selectedOption else { return }
    Haptic.medium()
    isSelecting = true
    Task {
        await goalStore.selectOption(option)
        if let contract = goalStore.contract {
            onboardingStore.setGoalContractId(contract.id)
            await onboardingStore.approveGoals()
        } else {
            // Show error — selectOption failed
            // goalStore.errorMessage is already set by selectOption()
            Haptic.error()
        }
        isSelecting = false
    }
}
```

Add an error banner below the confirm button that shows `goalStore.errorMessage` when it's set while options are loaded:
```swift
if selectedOption != nil, let error = goalStore.errorMessage {
    Text(error)
        .font(.system(size: 14))
        .foregroundColor(AppTheme.Colors.danger)
        .padding(.horizontal, AppTheme.Spacing.xxl)
        .multilineTextAlignment(.center)
}
```

---

## 9. Resend OTP uses `shouldCreateUser: true` even for returning users

**Problem:** `OTPVerificationView.resendCode()` (line 177-180) hardcodes `shouldCreateUser: true`. For returning users (`isReturningLogin`), this should be `false`. If Supabase is strict about this, the resend could fail for returning users.

**How a user hits it:** Returning user doesn't get OTP email, taps "Resend Code". The resend call uses `shouldCreateUser: true` which may conflict with the original `shouldCreateUser: false` call.

**Fix in `OTPVerificationView.swift`:**
```swift
private func resendCode() {
    guard let email = onboardingStore.state.pendingEmail else { return }

    isLoading = true
    errorMessage = nil

    Task {
        do {
            try await supabase.auth.signInWithOTP(
                email: email,
                shouldCreateUser: !onboardingStore.isReturningLogin
            )
            canResend = false
            resendCountdown = 30
        } catch {
            errorMessage = "Failed to resend code. Please try again."
        }
        isLoading = false
    }
}
```

---

## 10. Success screen shows workout card even if program wasn't activated

**Problem:** `OnboardingSuccessView.firstWorkoutCard` (line 80) reads `programStore.program?.program` without verifying the program was actually activated. If activation failed silently (Issue #3), or this is a returning user who skipped program setup, the card either shows stale data or the "Ready when you are!" fallback.

**How a user hits it:** Program activation fails (network error), but phase still advances to `.success` if `onboardingStore.activateProgram()` was called. User sees success screen with "Ready when you are!" which is confusing.

**Fix:** This is mostly addressed by fixing Issue #3 (program activation error handling). With that fix, users won't reach the success screen unless activation succeeded. The "Ready when you are!" fallback is fine as a defensive measure for edge cases.

No code change needed here beyond Issue #3.

---

## 11. Confetti animation doesn't respect Reduce Motion accessibility setting

**Problem:** `ConfettiView` (line 178-215) generates 50 animated particles without checking `UIAccessibility.isReduceMotionEnabled`. Users with vestibular disorders or motion sensitivity will experience discomfort.

**How a user hits it:** Any user with "Reduce Motion" enabled in iOS Settings reaches the success screen.

**Fix in `OnboardingSuccessView.swift`:**
```swift
struct ConfettiView: View {
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @State private var confettiPieces: [ConfettiPiece] = []

    var body: some View {
        if reduceMotion {
            EmptyView()
        } else {
            GeometryReader { geo in
                ZStack {
                    ForEach(confettiPieces) { piece in
                        ConfettiPieceView(piece: piece)
                    }
                }
                .onAppear {
                    generateConfetti(in: geo.size)
                }
            }
        }
    }
    // ... rest unchanged
}
```

---

## 12. Email regex rejects valid email addresses

**Problem:** `OnboardingAuthView` (line 14-17) uses regex `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$` which rejects valid emails containing apostrophes (`o'brien@gmail.com`), ampersands, or other RFC 5322 valid characters.

**How a user hits it:** Any user whose email contains an apostrophe or other special character can't sign up.

**Fix in `OnboardingAuthView.swift`:**
Use a more permissive regex that covers common real-world emails:
```swift
private var isValidEmail: Bool {
    let emailRegex = #"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"#
    return email.range(of: emailRegex, options: .regularExpression) != nil
}
```
This accepts anything with: `non-whitespace-non-@` + `@` + `non-whitespace-non-@` + `.` + `2+ chars`. It catches typos (missing domain, missing @) while not rejecting valid special characters. Supabase handles the real validation server-side.

---

## 13. Resume gate only triggers on cold launch, not foreground

**Problem:** `OnboardingStore.init()` (line 33-37) checks whether to show the resume gate. But since OnboardingStore is a singleton (`@StateObject` in AppView), `init()` only runs once per app lifecycle. If user backgrounds and foregrounds, the gate doesn't reappear.

**How a user hits it:** Start intake, background the app for a while, come back. No resume gate — they're just wherever they left off, which is fine. This is actually a non-issue since the state is preserved in memory.

**Fix:** No change needed. The resume gate is designed for cold launches (app killed + restarted), not foregrounding. The current behavior is correct — when the app foregrounds, the view is exactly where the user left it. The resume gate is only needed after a cold start when the user might have forgotten where they were.

---

## 14. Legal document URLs are placeholders

**Problem:** `OnboardingAuthView.swift` (line 84, 90) links to `https://example.com/terms` and `https://example.com/privacy`. These are placeholder URLs.

**How a user hits it:** Tap "Terms of Service" or "Privacy Policy" links during signup. Sees example.com.

**Fix:** Replace with actual URLs once they exist. Flag this as a pre-launch requirement.

---

## Summary — Priority Order

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Login network failure → empty app | **Critical** | Medium |
| 3 | Program activation no error handling | **High** | Small |
| 7 | Notifications never registered for remote | **High** | Small |
| 8 | Goal selection fails silently | **High** | Small |
| 9 | Resend OTP uses wrong shouldCreateUser | **High** | Small |
| 5 | OTP timer memory leak | **Medium** | Medium |
| 4 | syncWithBackend is a no-op | **Medium** | Medium |
| 6 | Back from OTP loses email | **Medium** | Small |
| 2 | Goal generation fire-and-forget | **Medium** | Small |
| 12 | Email regex too strict | **Medium** | Small |
| 11 | Confetti ignores Reduce Motion | **Low** | Small |
| 10 | Success screen shows workout without checking activation | **Low** | None (fixed by #3) |
| 13 | Resume gate only on cold launch | **Low** | None (works as designed) |
| 14 | Placeholder legal URLs | **Low** | Small |
