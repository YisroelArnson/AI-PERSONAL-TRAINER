# OAuth Implementation Plan: Google & Apple Sign-In

## Overview

Add Google and Apple Sign-In to the AI Personal Trainer app alongside the existing email OTP authentication.

---

## Part A: External Configuration (Do This First)

### Step 1: Apple Developer Portal Setup

**URL**: https://developer.apple.com/account

1. **Get Your Team ID**
   - Sign in to Apple Developer Console
   - Click your name in upper-right corner
   - Copy the 10-character Team ID

2. **Enable Sign in with Apple on App ID**
   - Go to: Certificates, Identifiers & Profiles > Identifiers
   - Find `AI-PT-ORG.AI-Personal-Trainer-App`
   - Click to edit > Enable "Sign in with Apple" checkbox
   - Select "Enable as a primary App ID"
   - Save

3. **Create Services ID** (for web-based OAuth flow)
   - Go to: Identifiers > Click "+" > Select "Services IDs" > Continue
   - Description: `AI Personal Trainer Sign In`
   - Identifier: `com.aipersonaltrainer.signin`
   - Click Register, then click the new Services ID to configure
   - Check "Sign in with Apple" > Click Configure
   - Primary App ID: Select your app
   - Domains: `pemfkuhbiwtnjsarwroz.supabase.co`
   - Return URLs: `https://pemfkuhbiwtnjsarwroz.supabase.co/auth/v1/callback`
   - Save and Continue

4. **Create Signing Key**
   - Go to: Keys > Click "+"
   - Key Name: `AI Personal Trainer Auth`
   - Check "Sign in with Apple" > Configure > Select your Primary App ID
   - Register > Download the `.p8` file (SAVE THIS - only downloadable once!)
   - Note the **Key ID** shown

### Step 2: Google Cloud Console Setup

**URL**: https://console.cloud.google.com

1. **Create/Select Project**
   - Create new project or use existing one for your app

2. **Configure OAuth Consent Screen**
   - Go to: APIs & Services > OAuth consent screen
   - User Type: External > Create
   - App name: `AI Personal Trainer`
   - User support email: Your email
   - Authorized domains: Add `supabase.co`
   - Developer contact email: Your email
   - Save and Continue through scopes (defaults are fine)
   - Add test users if in testing mode

3. **Create Web OAuth Credentials** (for Supabase)
   - Go to: APIs & Services > Credentials > Create Credentials > OAuth client ID
   - Application type: **Web application**
   - Name: `AI Personal Trainer - Supabase`
   - Authorized redirect URIs: `https://pemfkuhbiwtnjsarwroz.supabase.co/auth/v1/callback`
   - Create > Copy **Client ID** and **Client Secret**

4. **Create iOS OAuth Credentials** (optional, for native)
   - Create another OAuth client ID
   - Application type: **iOS**
   - Name: `AI Personal Trainer - iOS`
   - Bundle ID: `AI-PT-ORG.AI-Personal-Trainer-App`
   - Create

### Step 3: Supabase Dashboard Configuration

**URL**: https://supabase.com/dashboard/project/pemfkuhbiwtnjsarwroz

1. **Configure Apple Provider**
   - Go to: Authentication > Providers > Apple
   - Toggle ON
   - Client ID: `com.aipersonaltrainer.signin` (your Services ID)
   - Secret Key: Generate using Supabase's tool with your `.p8` file contents, Key ID, and Team ID
   - Save

2. **Configure Google Provider**
   - Go to: Authentication > Providers > Google
   - Toggle ON
   - Client ID: Paste the Web client ID from Google
   - Client Secret: Paste the Web client secret from Google
   - Save

3. **Add Redirect URL**
   - Go to: Authentication > URL Configuration
   - Under "Redirect URLs", add: `com.aipersonaltrainer://login-callback`
   - Save

---

## Part B: iOS Code Implementation

### Step 1: Create OAuth Service
**New file**: `Services/Auth/OAuthService.swift`

Create a service to handle Google and Apple OAuth flows using Supabase's `signInWithOAuth` method.

```swift
// Key methods:
// - signInWithApple() -> Uses supabase.auth.signInWithOAuth(provider: .apple)
// - signInWithGoogle() -> Uses supabase.auth.signInWithOAuth(provider: .google)
// - handleOAuthCallback(url:) -> Uses supabase.auth.session(from: url)
```

### Step 2: Create Social Sign-In Button Components
**New file**: `Shared/Components/SocialSignInButtons.swift`

- `AppleSignInButton` - Black button with Apple logo
- `GoogleSignInButton` - White/outlined button with Google logo
- `OrDivider` - "or" text between social buttons and email input

### Step 3: Update OnboardingAuthView
**File**: `AI Personal Trainer App/AI Personal Trainer App/Features/Onboarding/OnboardingAuthView.swift`

Changes:
1. Add `@StateObject` for OAuthService
2. Add social sign-in buttons above email input
3. Add `OrDivider` between social buttons and email field
4. Add `onOpenURL` handler for OAuth callbacks
5. Add methods: `signInWithApple()`, `signInWithGoogle()`, `handleOAuthCallback()`

**UI Layout**:
```
[Apple Logo] Continue with Apple    <- Primary (Apple guidelines)
[G Logo] Continue with Google
        ---- or ----
[Email input field]
[Terms checkbox]
[Continue button]                   <- Only for email flow
```

### Step 4: Update App Entry Point
**File**: `AI Personal Trainer App/AI Personal Trainer App/AI_Personal_Trainer_AppApp.swift`

Add `onOpenURL` handler at app level as fallback for OAuth callbacks.

### Step 5: Add Sign in with Apple Capability (Xcode)
- Open project in Xcode
- Target > Signing & Capabilities > + Capability > Sign in with Apple
- This creates the entitlements file automatically

### Step 6: Update Info.plist (if needed)
**File**: `AI Personal Trainer App/AI-Personal-Trainer-App-Info.plist`

The existing URL scheme `com.aipersonaltrainer` should work. May need to add Google's reversed client ID scheme.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `Services/Auth/OAuthService.swift` | Create |
| `Shared/Components/SocialSignInButtons.swift` | Create |
| `Features/Onboarding/OnboardingAuthView.swift` | Modify |
| `AI_Personal_Trainer_AppApp.swift` | Modify |
| `AI Personal Trainer App.entitlements` | Create (via Xcode) |

---

## Verification & Testing

1. **Build and deploy** to physical iPhone (OAuth requires real device)
2. **Test Apple Sign-In**:
   - Tap Apple button > Apple sheet appears > Authenticate > Redirects back > Session established > Moves to microphone permission phase
3. **Test Google Sign-In**:
   - Tap Google button > Safari opens > Authenticate > Redirects back > Session established > Moves to microphone permission phase
4. **Test Email OTP** (regression):
   - Existing flow still works unchanged
5. **Edge cases**:
   - Cancel OAuth flow mid-way
   - Network errors during OAuth
   - User already exists with different provider

---

## Important Notes

- **Apple requires 6-month key rotation** for OAuth flows - set a calendar reminder
- **Apple only provides user's full name on first sign-in** - may need to prompt later
- **No backend changes needed** - Supabase handles OAuth token exchange
- **Physical device required** for testing - Apple Sign-In doesn't work in simulator
