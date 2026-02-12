# Implementation Plan: Sign in with Apple & Google via Supabase

## Current State

The app currently uses **email OTP authentication** via Supabase. The onboarding flow goes:

```
Intro screens → Intake questions → Auth (email entry) → OTP Verification → Post-auth flow
```

Key existing files:
- `AI_Personal_Trainer_AppApp.swift` — App entry point (no `onOpenURL` handler yet)
- `supabase.swift` — Supabase client (`pemfkuhbiwtnjsarwroz.supabase.co`)
- `OnboardingAuthView.swift` — Current email + OTP sign-in UI
- `OTPVerificationView.swift` — OTP code verification
- `OnboardingCoordinatorView.swift` — Routes `.auth` phase to `OnboardingAuthView`
- `OnboardingStore.swift` — Manages auth state, phase transitions
- `AppView.swift` — Listens to `supabase.auth.authStateChanges` (works with all auth methods)
- `Info.plist` — Already has `com.aipersonaltrainer` URL scheme registered

**Bundle ID:** `AI-PT-ORG.AI-Personal-Trainer-App`
**Supabase Project:** `pemfkuhbiwtnjsarwroz`

---

## Recommended Approach: Native ID Tokens (not browser OAuth)

Use native Apple/Google SDKs to get ID tokens, then pass them to Supabase via `signInWithIdToken()`. This provides a fully native UX with no browser popup.

---

## Phase 1: External Service Configuration (Manual — Not Code)

### 1A. Apple Developer Console

1. Go to **Certificates, Identifiers & Profiles → Identifiers**
2. Find the App ID for `AI-PT-ORG.AI-Personal-Trainer-App`
3. Enable the **"Sign in with Apple"** capability (checkbox)
4. That's it for native-only — no Services ID or signing key needed

### 1B. Google Cloud Console

1. Go to **Google Cloud Console → APIs & Services → Credentials** (or the newer Auth Platform → Clients)
2. Create **two** OAuth Client IDs:

   **Web Application Client:**
   - Type: Web application
   - Authorized redirect URI: `https://pemfkuhbiwtnjsarwroz.supabase.co/auth/v1/callback`
   - Save the **Client ID** and **Client Secret**

   **iOS Client:**
   - Type: iOS
   - Bundle ID: `AI-PT-ORG.AI-Personal-Trainer-App`
   - Team ID: (from Apple Developer portal)
   - Save the **iOS Client ID** (format: `XXXX.apps.googleusercontent.com`)

3. Configure the **OAuth consent screen** with scopes: `openid`, `email`, `profile`

### 1C. Supabase Dashboard

Go to `https://supabase.com/dashboard/project/pemfkuhbiwtnjsarwroz/auth/providers`

**Apple Provider:**
1. Enable Apple
2. In "Client IDs (for native sign in)", add: `AI-PT-ORG.AI-Personal-Trainer-App`

**Google Provider:**
1. Enable Google
2. Set **Client ID** = the Web Client ID
3. Set **Client Secret** = the Web Client Secret
4. In **Authorized Client IDs**, enter both IDs comma-separated: `WEB_CLIENT_ID,IOS_CLIENT_ID` (web first)
5. **Enable "Skip nonce check"** — required for iOS (Google's SDK doesn't support nonces)

---

## Phase 2: Xcode Project Configuration

### 2A. Add "Sign in with Apple" Capability

In Xcode → project target → **Signing & Capabilities** → click **"+ Capability"** → add **Sign in with Apple**

### 2B. Add GoogleSignIn-iOS Package

In Xcode → **File → Add Package Dependencies** → enter:
```
https://github.com/google/GoogleSignIn-iOS
```

### 2C. Update Info.plist

Add the Google reversed client ID as a URL scheme (needed for Google Sign-In callback):

```xml
<!-- Add to the existing CFBundleURLTypes array -->
<dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
        <string>com.googleusercontent.apps.YOUR_IOS_CLIENT_ID_REVERSED</string>
    </array>
</dict>
```

Also add the Google client ID for the SDK:
```xml
<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
```

---

## Phase 3: Code Changes

### 3A. Handle Google URL callback in the App entry point

**File:** `AI_Personal_Trainer_AppApp.swift`

Add an `onOpenURL` handler so Google Sign-In can receive its callback:

```swift
import SwiftUI
import GoogleSignIn

@main
struct AI_Personal_Trainer_AppApp: App {
    var body: some Scene {
        WindowGroup {
            AppView()
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
```

### 3B. Create an `AuthService` to encapsulate Apple & Google sign-in logic

**New file:** `Services/Auth/AuthService.swift`

This service handles both Apple and Google sign-in, returning a Supabase session. It keeps the view layer clean.

```swift
import Foundation
import AuthenticationServices
import GoogleSignIn
import Supabase

@MainActor
final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Sign in with Apple

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        isLoading = true
        errorMessage = nil

        do {
            let authorization = try result.get()
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let idTokenData = credential.identityToken,
                  let idToken = String(data: idTokenData, encoding: .utf8) else {
                errorMessage = "Could not retrieve Apple ID token"
                isLoading = false
                return
            }

            try await supabase.auth.signInWithIdToken(
                credentials: .init(provider: .apple, idToken: idToken)
            )

            // Apple only provides the name on the FIRST sign-in — capture it now
            if let fullName = credential.fullName {
                let parts = [fullName.givenName, fullName.middleName, fullName.familyName]
                    .compactMap { $0 }
                let name = parts.joined(separator: " ")
                if !name.isEmpty {
                    try await supabase.auth.update(
                        user: UserAttributes(
                            data: [
                                "full_name": .string(name),
                                "first_name": .string(fullName.givenName ?? ""),
                                "last_name": .string(fullName.familyName ?? ""),
                            ]
                        )
                    )
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Sign in with Google

    func signInWithGoogle(presenting viewController: UIViewController) async {
        isLoading = true
        errorMessage = nil

        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: viewController)

            guard let idToken = result.user.idToken?.tokenString else {
                errorMessage = "Could not retrieve Google ID token"
                isLoading = false
                return
            }

            try await supabase.auth.signInWithIdToken(
                credentials: .init(
                    provider: .google,
                    idToken: idToken,
                    accessToken: result.user.accessToken.tokenString
                )
            )
        } catch {
            if (error as NSError).code == GIDSignInError.canceled.rawValue {
                // User cancelled — not an error
            } else {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }
}
```

### 3C. Update `OnboardingAuthView.swift` — Add Apple & Google buttons

Modify the existing auth view to add social sign-in buttons above the email input. The layout becomes:

```
"Let's save your progress"

[  Sign in with Apple  ]     ← native SignInWithAppleButton
[  Continue with Google ]    ← custom button

──── or continue with email ────

[ Email input field ]
[ Terms checkbox ]           ← only for new signups
[ Continue button ]
```

Key changes:
- Add `@StateObject private var authService = AuthService.shared`
- Add a `SignInWithAppleButton` (from `AuthenticationServices`)
- Add a custom Google sign-in button that calls `authService.signInWithGoogle()`
- Add an "or" divider between social buttons and the email field
- When social sign-in succeeds, `authStateChanges` in `AppView.swift` fires automatically — no manual phase transition needed from here
- For new users (not returning login), terms acceptance should still be required before social sign-in is allowed

### 3D. Handle post-social-sign-in onboarding flow

The existing `AppView.swift` already listens to `authStateChanges` and calls `userDataStore.loadAllUserData()` + `onboardingStore.syncWithBackend()` on sign-in. This works for social auth too.

However, the current onboarding flow assumes email OTP where the user goes through:
```
Auth (email) → OTP Verification → completeAuth() → next phases
```

For social sign-in, the user skips OTP verification entirely. We need to handle the transition:

**Option A (Simpler):** After a successful social sign-in, call `onboardingStore.completeAuth()` directly from `OnboardingAuthView`. The `authStateChanges` listener in `AppView` handles session state, and `completeAuth()` handles the onboarding phase transition.

**Option B:** Add a listener in `OnboardingCoordinatorView` or `OnboardingAuthView` that detects when `authStateChanges` fires `.signedIn` while in the `.auth` phase, and automatically advances. This is more robust but adds complexity.

**Recommendation:** Option A — call `completeAuth()` after social sign-in succeeds.

In `OnboardingAuthView`, after the `signInWithIdToken` calls succeed:

```swift
// After successful Apple/Google sign-in:
await onboardingStore.completeAuth()
```

### 3E. Terms acceptance for social sign-in (new users only)

For new users, Apple App Store guidelines require terms acceptance before account creation. Two approaches:

**Approach 1:** Require the terms checkbox to be checked before enabling the social sign-in buttons (for new signups). This is the simplest and aligns with the current UX.

**Approach 2:** Show terms acceptance in a sheet/modal when the user taps a social button.

**Recommendation:** Approach 1 — disable the Apple/Google buttons until terms are accepted (for new users). For returning logins, they're always enabled.

---

## Phase 4: Backend Considerations

### No backend changes required

The backend `auth.js` middleware uses `supabase.auth.getClaims()` to verify JWTs. Supabase issues the same JWT format regardless of the sign-in method (OTP, Apple, Google). The middleware extracts `id`, `email`, `role`, etc. from the JWT claims — these are all populated by Supabase for social sign-ins too.

The `provider` field in `app_metadata` will differ (`apple`, `google`, vs `email`), but the middleware doesn't check this.

### Optional: Store provider info

If you want to track which provider users signed up with, you can read `session.user.appMetadata["provider"]` on the client side and store it in user settings. This is not required for functionality.

---

## Phase 5: Testing

### 5A. Apple Sign-In
- Must test on a **real device** (simulators don't support native Apple Sign-In)
- First sign-in provides the user's name; subsequent sign-ins do not
- To re-test first-sign-in: Settings → Apple ID → Sign-In & Security → Apps Using Apple ID → Stop Using → sign in again

### 5B. Google Sign-In
- Can partially test on simulator, but full flow works best on device
- Verify the reversed client ID URL scheme is correct
- Test cancellation flow (user dismisses Google sign-in sheet)

### 5C. Edge Cases to Test
- Same email used for Apple and Google (Supabase links accounts by default)
- User who previously signed up via email OTP, now signs in with Apple/Google using the same email
- Network failure during `signInWithIdToken`
- User cancels Apple/Google sign-in dialog
- Returning user flow (social sign-in should detect existing account and skip intake)

---

## Summary of All File Changes

| File | Change |
|------|--------|
| `AI_Personal_Trainer_AppApp.swift` | Add `import GoogleSignIn` + `.onOpenURL` handler |
| `Info.plist` | Add Google reversed client ID URL scheme + `GIDClientID` key |
| **New:** `Services/Auth/AuthService.swift` | Apple & Google sign-in logic encapsulated |
| `OnboardingAuthView.swift` | Add Apple/Google buttons, divider, terms gating |
| Xcode project | Add "Sign in with Apple" capability + `GoogleSignIn-iOS` SPM package |

No backend code changes needed.

---

## Dependencies

| Dependency | Source | Notes |
|-----------|--------|-------|
| `AuthenticationServices` | Built into iOS | No package needed, just `import` |
| `GoogleSignIn-iOS` | SPM: `https://github.com/google/GoogleSignIn-iOS` | New dependency |
| `supabase-swift` | Already in project | Already supports `signInWithIdToken` |

---

## Gotchas & Important Notes

1. **Apple only gives the user's name once.** Capture it on first sign-in and store via `supabase.auth.update(user:)`. If missed, the user must revoke and re-authorize.

2. **Google requires "Skip nonce check" enabled** in Supabase dashboard. Without it: `"Passed nonce and nonce in id_token must align."`

3. **App Store requires Sign in with Apple** if you offer any third-party social login (Google). So both must be implemented together.

4. **No secret key rotation** is needed for native Apple sign-in (the `.p8` key is only for server-side/web OAuth flows).

5. **Email linking:** If a user signs in with Apple (email: foo@gmail.com) and later with Google (same email), Supabase links them to the same account by default.

6. **Simulator limitations:** Apple Sign-In does not work on iOS Simulator. Google partially works but is unreliable. Test on real devices.
