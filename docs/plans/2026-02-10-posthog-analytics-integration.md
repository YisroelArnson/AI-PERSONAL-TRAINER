# PostHog Analytics Integration - Implementation Plan

## Overview

Integrate PostHog analytics to track:
1. **iOS Onboarding Funnel** - 26 screens across 10 sections (conversion tracking)
2. **Backend Agent Sessions** - Session lifecycle events
3. **Backend LLM Usage** - Token counts, costs, cache performance

## Current State Analysis

### iOS App
- **Entry point**: `AI_Personal_Trainer_AppApp.swift` (minimal, just loads `AppView`)
- **Onboarding state**: `OnboardingStore.swift` manages all onboarding transitions
- **Screen definitions**: `OnboardingScreenData.swift` defines 26 screens (3 intro + 22 questions + 1 complete)
- **No existing analytics** - clean slate

### Backend
- **Already has robust observability**: `sessionObservability.service.js` logs to Supabase
- **Token/cost tracking exists**: `logLLMResponse()` calculates tokens, cached tokens, and cost
- **Session management exists**: `createSession()`, `endSession()` with totals
- **Just need to add PostHog** as an additional destination alongside Supabase

## Desired End State

After implementation:
1. PostHog dashboard shows onboarding funnel with drop-off at each step
2. PostHog tracks every agent session with duration, token count, cost
3. PostHog aggregates LLM usage metrics (model, tokens, cache hit rate, cost)
4. Users are identified by Supabase user ID across iOS and backend

### Verification
- [ ] PostHog Live Events shows iOS onboarding events
- [ ] PostHog Live Events shows backend agent session events
- [ ] PostHog Insights can create onboarding funnel visualization
- [ ] PostHog Insights can show LLM cost over time

## What We're NOT Doing

- Session replay (adds app size, not needed initially)
- Feature flags (can add later)
- Screen auto-capture (manual tracking for better control)
- GDPR consent flow (assuming US users / personal use)
- Tracking workout events, location events, profile events (future phases)

## Implementation Approach

1. Create PostHog account and get API key
2. Add SDKs to both iOS and backend
3. Create wrapper services for clean abstraction
4. Add tracking calls at key points
5. Verify events in PostHog dashboard

---

## Phase 1: PostHog Account Setup

### Overview
Create PostHog account and obtain API credentials.

### Steps

1. Go to [posthog.com](https://posthog.com) and sign up (free tier: 1M events/month)
2. Create a new project named "AI Personal Trainer"
3. Select **US Cloud** region (or EU if needed)
4. Copy the **API Key** (starts with `phc_`)
5. Note the **Host URL**: `https://us.i.posthog.com` (or `https://eu.i.posthog.com`)

### Success Criteria

#### Manual Verification:
- [ ] PostHog account created
- [ ] Project created with API key available
- [ ] API key saved securely (will add to code in Phase 2)

**Implementation Note**: Pause here to confirm account setup before proceeding.

---

## Phase 2: iOS SDK Setup

### Overview
Add PostHog iOS SDK and create analytics wrapper service.

### Changes Required:

#### 1. Add PostHog Package (Xcode)

In Xcode:
1. File → Add Package Dependencies
2. Enter URL: `https://github.com/PostHog/posthog-ios.git`
3. Select version: `3.0.0` or later
4. Add to target: "AI Personal Trainer App"

#### 2. Create Analytics Service
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/AnalyticsService.swift`

```swift
import Foundation
import PostHog

@MainActor
final class AnalyticsService {
    static let shared = AnalyticsService()

    private init() {}

    // MARK: - Setup

    func configure() {
        let config = PostHogConfig(apiKey: "phc_YOUR_API_KEY_HERE")
        config.host = "https://us.i.posthog.com"
        config.captureApplicationLifecycleEvents = true
        config.captureScreenViews = false // We'll track manually
        #if DEBUG
        config.debug = true
        #endif
        PostHogSDK.shared.setup(config)
    }

    // MARK: - User Identification

    func identify(userId: String, properties: [String: Any] = [:]) {
        PostHogSDK.shared.identify(userId, userProperties: properties)
    }

    func reset() {
        PostHogSDK.shared.reset()
    }

    // MARK: - Event Tracking

    func track(_ event: String, properties: [String: Any] = [:]) {
        PostHogSDK.shared.capture(event, properties: properties)
    }

    // MARK: - Screen Tracking

    func screen(_ name: String, properties: [String: Any] = [:]) {
        PostHogSDK.shared.screen(name, properties: properties)
    }
}
```

#### 3. Initialize in App Entry Point
**File**: `AI Personal Trainer App/AI Personal Trainer App/AI_Personal_Trainer_AppApp.swift`

```swift
import SwiftUI
import PostHog

@main
struct AI_Personal_Trainer_AppApp: App {

    init() {
        AnalyticsService.shared.configure()
    }

    var body: some Scene {
        WindowGroup {
            AppView()
        }
    }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `xcodebuild -project "AI Personal Trainer App.xcodeproj" -scheme "AI Personal Trainer App" build`

#### Manual Verification:
- [ ] App launches without crash
- [ ] PostHog debug logs appear in Xcode console (if debug enabled)
- [ ] `Application Opened` event appears in PostHog Live Events

**Implementation Note**: Pause here for manual testing before proceeding.

---

## Phase 3: iOS Onboarding Funnel Tracking

### Overview
Track all onboarding steps to measure conversion funnel.

### Changes Required:

#### 1. Add Onboarding Event Methods to AnalyticsService
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/AnalyticsService.swift`

Add these methods to the `AnalyticsService` class:

```swift
// MARK: - Onboarding Events

func trackOnboardingStarted() {
    track("onboarding_started")
}

func trackOnboardingStepViewed(stepId: String, stepIndex: Int, section: String?, stepType: String) {
    track("onboarding_step_viewed", properties: [
        "step_id": stepId,
        "step_index": stepIndex,
        "section": section ?? "intro",
        "step_type": stepType
    ])
}

func trackOnboardingStepCompleted(stepId: String, stepIndex: Int, section: String?, stepType: String, inputMethod: String? = nil) {
    var props: [String: Any] = [
        "step_id": stepId,
        "step_index": stepIndex,
        "section": section ?? "intro",
        "step_type": stepType
    ]
    if let method = inputMethod {
        props["input_method"] = method // "voice" or "text"
    }
    track("onboarding_step_completed", properties: props)
}

func trackOnboardingPhaseCompleted(phase: String) {
    track("onboarding_phase_completed", properties: [
        "phase": phase
    ])
}

func trackOnboardingCompleted(totalSteps: Int, durationSeconds: Int?) {
    var props: [String: Any] = ["total_steps": totalSteps]
    if let duration = durationSeconds {
        props["duration_seconds"] = duration
    }
    track("onboarding_completed", properties: props)
}

func trackOnboardingAbandoned(lastStepId: String, lastStepIndex: Int, section: String?) {
    track("onboarding_abandoned", properties: [
        "last_step_id": lastStepId,
        "last_step_index": lastStepIndex,
        "section": section ?? "intro"
    ])
}
```

#### 2. Add Tracking Calls to OnboardingStore
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift`

Add import at top:
```swift
import Foundation
import SwiftUI
```

Add tracking property after existing properties (around line 12):
```swift
private var onboardingStartTime: Date?
```

Modify `init()` to track start (after loading state, around line 35):
```swift
private init() {
    // ... existing state loading code ...

    // Track onboarding start if not complete
    if state.currentPhase != .complete {
        onboardingStartTime = Date()
        AnalyticsService.shared.trackOnboardingStarted()
    }
}
```

Modify `goToNextStep()` to track step completion (around line 89):
```swift
func goToNextStep() async {
    // Track completion of current step before advancing
    let currentScreen = self.currentScreen
    AnalyticsService.shared.trackOnboardingStepCompleted(
        stepId: currentScreen.id,
        stepIndex: state.currentStep,
        section: currentScreen.label?.rawValue,
        stepType: currentScreen.type.rawValue
    )

    navigationDirection = .forward
    // ... rest of existing code ...
}
```

Add tracking when viewing new step. Modify `goToNextStep()` after `state.currentStep = nextStep`:
```swift
// Track viewing of new step
let newScreen = OnboardingScreens.all[nextStep]
AnalyticsService.shared.trackOnboardingStepViewed(
    stepId: newScreen.id,
    stepIndex: nextStep,
    section: newScreen.label?.rawValue,
    stepType: newScreen.type.rawValue
)
```

Modify `completeAuth()` to track phase (around line 200):
```swift
func completeAuth() async {
    AnalyticsService.shared.trackOnboardingPhaseCompleted(phase: "auth")
    // ... existing code ...
}
```

Modify `approveGoals()` to track phase (around line 300):
```swift
func approveGoals() async {
    AnalyticsService.shared.trackOnboardingPhaseCompleted(phase: "goals")
    // ... existing code ...
}
```

Modify `activateProgram()` to track phase (around line 308):
```swift
func activateProgram() async {
    AnalyticsService.shared.trackOnboardingPhaseCompleted(phase: "program")
    // ... existing code ...
}
```

Modify `completeOnboarding()` to track completion (around line 328):
```swift
func completeOnboarding() async {
    // Calculate duration
    var durationSeconds: Int? = nil
    if let startTime = onboardingStartTime {
        durationSeconds = Int(Date().timeIntervalSince(startTime))
    }

    AnalyticsService.shared.trackOnboardingCompleted(
        totalSteps: OnboardingScreens.all.count,
        durationSeconds: durationSeconds
    )

    navigationDirection = .forward
    state.currentPhase = .complete
    await saveAndSync()
}
```

#### 3. Track User Identification After Auth
**File**: `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift`

In `completeAuth()`, after successful auth, identify the user:
```swift
// After auth succeeds, identify user in analytics
if let userId = try? await supabase.auth.session.user.id.uuidString {
    AnalyticsService.shared.identify(userId: userId, properties: [
        "name": state.intakeData.name ?? ""
    ])
}
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds with no errors

#### Manual Verification:
- [ ] Start onboarding → see `onboarding_started` in PostHog
- [ ] Complete intro screens → see `onboarding_step_completed` events
- [ ] Complete auth → see `onboarding_phase_completed` with phase="auth"
- [ ] Complete full onboarding → see `onboarding_completed` event
- [ ] PostHog can create funnel from step_viewed events

**Implementation Note**: Pause here for full onboarding flow testing.

---

## Phase 4: Backend SDK Setup

### Overview
Add PostHog Node.js SDK and create service wrapper.

### Changes Required:

#### 1. Install Package
**Run in**: `BACKEND/`

```bash
npm install posthog-node
```

#### 2. Add Environment Variable
**File**: `BACKEND/.env`

Add:
```
POSTHOG_API_KEY=phc_YOUR_API_KEY_HERE
POSTHOG_HOST=https://us.i.posthog.com
```

#### 3. Create PostHog Service
**File**: `BACKEND/services/posthog.service.js`

```javascript
// BACKEND/services/posthog.service.js
// PostHog analytics service wrapper

const { PostHog } = require('posthog-node');
const dotenv = require('dotenv');

dotenv.config();

// Initialize PostHog client (lazy - only if API key is configured)
let posthog = null;

function getClient() {
  if (!posthog && process.env.POSTHOG_API_KEY) {
    posthog = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 20,
      flushInterval: 10000, // 10 seconds
    });
  }
  return posthog;
}

/**
 * Capture an event
 * @param {string} distinctId - User ID
 * @param {string} event - Event name
 * @param {Object} properties - Event properties
 */
function capture(distinctId, event, properties = {}) {
  const client = getClient();
  if (!client) return;

  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      source: 'backend',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Identify a user
 * @param {string} distinctId - User ID
 * @param {Object} properties - User properties
 */
function identify(distinctId, properties = {}) {
  const client = getClient();
  if (!client) return;

  client.identify({
    distinctId,
    properties,
  });
}

/**
 * Shutdown PostHog (flush pending events)
 */
async function shutdown() {
  const client = getClient();
  if (client) {
    await client.shutdown();
  }
}

// =============================================================================
// AGENT SESSION EVENTS
// =============================================================================

/**
 * Track agent session started
 */
function trackAgentSessionStarted(userId, sessionId, metadata = {}) {
  capture(userId, 'agent_session_started', {
    session_id: sessionId,
    ...metadata,
  });
}

/**
 * Track agent session completed
 */
function trackAgentSessionCompleted(userId, sessionId, stats = {}) {
  capture(userId, 'agent_session_completed', {
    session_id: sessionId,
    duration_ms: stats.durationMs,
    total_tokens: stats.totalTokens,
    cached_tokens: stats.cachedTokens,
    cache_hit_rate: stats.cacheHitRate,
    total_cost_cents: stats.totalCostCents,
    iterations: stats.iterations,
    status: stats.status || 'completed',
  });
}

/**
 * Track agent session error
 */
function trackAgentSessionError(userId, sessionId, error) {
  capture(userId, 'agent_session_error', {
    session_id: sessionId,
    error_message: error,
  });
}

// =============================================================================
// LLM USAGE EVENTS
// =============================================================================

/**
 * Track LLM request
 */
function trackLLMRequest(userId, sessionId, model, estimatedTokens) {
  capture(userId, 'llm_request', {
    session_id: sessionId,
    model,
    estimated_tokens: estimatedTokens,
  });
}

/**
 * Track LLM response with token/cost details
 */
function trackLLMResponse(userId, sessionId, data) {
  capture(userId, 'llm_response', {
    session_id: sessionId,
    model: data.model,
    prompt_tokens: data.promptTokens,
    completion_tokens: data.completionTokens,
    cached_tokens: data.cachedTokens,
    cache_write_tokens: data.cacheWriteTokens,
    total_tokens: data.totalTokens,
    cost_cents: data.costCents,
    duration_ms: data.durationMs,
  });
}

module.exports = {
  capture,
  identify,
  shutdown,
  trackAgentSessionStarted,
  trackAgentSessionCompleted,
  trackAgentSessionError,
  trackLLMRequest,
  trackLLMResponse,
};
```

#### 4. Add Graceful Shutdown
**File**: `BACKEND/index.js`

Add at top with other requires:
```javascript
const posthog = require('./services/posthog.service');
```

Add before `app.listen()`:
```javascript
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, flushing analytics...');
  await posthog.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, flushing analytics...');
  await posthog.shutdown();
  process.exit(0);
});
```

### Success Criteria

#### Automated Verification:
- [ ] `npm install` succeeds
- [ ] Server starts without errors: `npm run dev`

#### Manual Verification:
- [ ] No errors in console related to PostHog
- [ ] Server responds to health check

**Implementation Note**: Pause here before integrating with observability.

---

## Phase 5: Backend Event Tracking

### Overview
Integrate PostHog tracking with existing session observability.

### Changes Required:

#### 1. Add PostHog to Session Observability
**File**: `BACKEND/services/sessionObservability.service.js`

Add import at top (after existing requires):
```javascript
const posthog = require('./posthog.service');
```

Modify `createSession()` to track (around line 100):
```javascript
async function createSession(userId, metadata = {}) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .insert({
      user_id: userId,
      metadata,
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;

  consoleLog(data.id, '🆕', `${colors.green}Session created${colors.reset}`);

  // Track in PostHog
  posthog.trackAgentSessionStarted(userId, data.id, metadata);

  return data;
}
```

Modify `endSession()` to track (around line 165, after calculating totals):
```javascript
async function endSession(sessionId, status = 'completed', errorMessage = null) {
  // ... existing totals calculation code ...

  // Update session (existing code)
  const { error } = await supabase
    .from('agent_sessions')
    .update({
      status,
      total_tokens: totalTokens,
      cached_tokens: cachedTokens,
      total_cost_cents: totalCostCents,
      updated_at: new Date().toISOString(),
      metadata: errorMessage
        ? { error: errorMessage }
        : { cache_write_tokens: cacheWriteTokens, cache_hit_rate: parseFloat(cacheHitRate) }
    })
    .eq('id', sessionId);

  if (error) throw error;

  // Get user ID for PostHog tracking
  const session = await getSession(sessionId);

  // Track in PostHog
  if (status === 'error') {
    posthog.trackAgentSessionError(session.user_id, sessionId, errorMessage);
  }
  posthog.trackAgentSessionCompleted(session.user_id, sessionId, {
    durationMs: totalDurationMs,
    totalTokens,
    cachedTokens,
    cacheHitRate: parseFloat(cacheHitRate),
    totalCostCents,
    status,
  });

  // ... existing console logging ...
}
```

Modify `logLLMResponse()` to track (around line 404, after calculating cost):
```javascript
async function logLLMResponse(sessionId, params) {
  // ... existing code up to cost calculation ...

  // Get session for user ID
  const session = await getSession(sessionId);

  // Track in PostHog
  posthog.trackLLMResponse(session.user_id, sessionId, {
    model,
    promptTokens: tokens.prompt,
    completionTokens: tokens.completion,
    cachedTokens: tokens.cached,
    cacheWriteTokens: tokens.cache_write,
    totalTokens: tokens.total,
    costCents,
    durationMs,
  });

  // ... rest of existing code (console logging, return) ...
}
```

### Success Criteria

#### Automated Verification:
- [ ] Server starts without errors
- [ ] No TypeScript/lint errors

#### Manual Verification:
- [ ] Send a chat message via iOS app or API
- [ ] See `agent_session_started` in PostHog Live Events
- [ ] See `llm_response` events with token counts
- [ ] See `agent_session_completed` with totals
- [ ] Verify cost_cents values are accurate

**Implementation Note**: Pause here for full integration testing.

---

## Phase 6: Verification & Dashboard Setup

### Overview
Verify all events are flowing and create initial PostHog dashboard.

### Steps

1. **Verify iOS Events**:
   - Fresh install app
   - Go through full onboarding
   - Check PostHog for all `onboarding_*` events

2. **Verify Backend Events**:
   - Send chat message
   - Check for `agent_session_*` and `llm_*` events
   - Verify token counts match console output

3. **Create Onboarding Funnel**:
   - In PostHog → Insights → New Insight → Funnel
   - Add steps: `onboarding_step_viewed` filtered by step_index 0, 1, 2, ...
   - Or use `onboarding_step_completed` for conversion

4. **Create LLM Usage Dashboard**:
   - Total tokens over time (sum of `llm_response.total_tokens`)
   - Cost over time (sum of `llm_response.cost_cents`)
   - Cache hit rate (avg of `agent_session_completed.cache_hit_rate`)
   - Sessions per day

### Success Criteria

#### Manual Verification:
- [ ] Onboarding funnel shows realistic conversion rates
- [ ] LLM dashboard shows token usage trends
- [ ] User identification works (same user across iOS and backend events)
- [ ] No duplicate events or missing events

---

## Testing Strategy

### Unit Tests
- N/A for this integration (analytics is fire-and-forget)

### Integration Tests
1. iOS: Run through onboarding, verify events in PostHog
2. Backend: Send API requests, verify events in PostHog

### Manual Testing Steps
1. Delete app and reinstall
2. Complete full onboarding flow
3. Verify all 26+ onboarding events appear in PostHog
4. Send a chat message
5. Verify agent session events appear
6. Check that user ID links iOS and backend events

## Performance Considerations

- PostHog iOS SDK batches events (minimal battery/network impact)
- PostHog Node.js SDK batches events with `flushAt: 20` and `flushInterval: 10000`
- Events are non-blocking (don't slow down main app/API)
- Graceful shutdown ensures events are flushed before server stops

## Migration Notes

- No database migrations needed
- No breaking changes to existing functionality
- PostHog is additive (existing Supabase logging continues)
- Can disable PostHog by removing `POSTHOG_API_KEY` env var

## References

- Research document: `thoughts/shared/research/2026-02-10-posthog-analytics-integration.md`
- PostHog iOS SDK: https://github.com/PostHog/posthog-ios
- PostHog Node.js SDK: https://www.npmjs.com/package/posthog-node
- OnboardingStore: `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift`
- Session Observability: `BACKEND/services/sessionObservability.service.js`
