---
date: 2026-02-10T12:00:00-05:00
researcher: Claude
git_commit: e09aff92d809f34d3370c370a5401a352c536fb8
branch: claude/refactor-onboarding-flow-kEgGX
repository: AI-PERSONAL-TRAINER
topic: "PostHog Analytics Integration Research"
tags: [research, analytics, posthog, ios, nodejs, tracking]
status: complete
last_updated: 2026-02-10
last_updated_by: Claude
---

# Research: PostHog Analytics Integration

**Date**: 2026-02-10T12:00:00-05:00
**Researcher**: Claude
**Git Commit**: e09aff92d809f34d3370c370a5401a352c536fb8
**Branch**: claude/refactor-onboarding-flow-kEgGX
**Repository**: AI-PERSONAL-TRAINER

## Research Question

How to implement PostHog analytics in the AI Personal Trainer app, covering both the iOS frontend and Node.js backend?

## Summary

The AI Personal Trainer app has **no existing analytics SDK** - this is a greenfield opportunity. The app consists of:
- **iOS Frontend**: Swift/SwiftUI app using Supabase for auth/data, with 115 Swift files organized in a clean MVVM-style structure
- **Node.js Backend**: Express.js API with custom observability logging to Supabase and Sentry for errors

PostHog integration would require:
1. **iOS**: Add `posthog-ios` via SPM, initialize in app entry point, track events in stores/views
2. **Backend**: Add `posthog-node` via npm, create wrapper service, track server-side events

## Detailed Findings

### Current Analytics State

| Component | Current State | Existing Tools |
|-----------|--------------|----------------|
| iOS App | No analytics SDK | Debug print statements only |
| Backend | Custom observability | Sentry (errors), Custom session logging to Supabase |

The backend has a sophisticated custom observability system that logs:
- Session lifecycle events
- LLM token usage and costs
- Tool calls and results
- User messages

However, this data is stored in Supabase tables (`agent_sessions`, `agent_session_events`) and lacks:
- Real-time dashboards
- User funnels and retention analysis
- Feature flag management
- A/B testing capabilities

---

### iOS App Architecture

**Entry Point**: `AI_Personal_Trainer_AppApp.swift`

**Key State Stores** (ideal for event tracking):
- `UserDataStore` - User profile, authentication
- `OnboardingStore` - Onboarding progress (19 screens)
- `WorkoutSessionStore` - Active workout tracking
- `TrainingProgramStore` - Program management
- `ExerciseStore` - Exercise library

**Main Screens**:
| Screen | View File | Key Events to Track |
|--------|-----------|---------------------|
| Home | `Features/Home/HomeView.swift` | App open, AI message views |
| Stats | `Features/Stats/StatsView.swift` | History views, analytics engagement |
| Locations | `Features/Locations/` | Location CRUD operations |
| Trainer | `Features/Trainer/TrainerJourneyView.swift` | Goal/program interactions |
| Assistant | `Features/Assistant/AssistantView.swift` | AI chat sessions |
| Onboarding | `Features/Onboarding/` | Funnel progression (19 steps) |

**Dependencies** (via SPM):
- `supabase-swift` v2.30.0 (only major dependency)
- No existing analytics packages

---

### Backend Architecture

**Framework**: Express.js v5.1.0

**Key Services for Event Tracking**:
- `agentLoop.service.js` - AI agent execution
- `sessionObservability.service.js` - Existing event logging
- `trainerGoals.service.js` - Goal generation
- `trainerProgram.service.js` - Program generation
- `trainerWorkouts.service.js` - Workout management

**Existing Observability** (`BACKEND/services/observability/`):
- `logger.service.js` - Structured logging
- `metrics.service.js` - Metrics aggregation
- Custom Supabase-based event storage

---

### PostHog iOS SDK Integration

**Package**: [posthog-ios](https://github.com/PostHog/posthog-ios) (v3.40.0)

**Installation** (Swift Package Manager):
```swift
// Package.swift or Xcode > Add Package
.package(url: "https://github.com/PostHog/posthog-ios.git", from: "3.0.0")
```

**Initialization** (`AI_Personal_Trainer_AppApp.swift`):
```swift
import PostHog

@main
struct AI_Personal_Trainer_AppApp: App {
    init() {
        let config = PostHogConfig(apiKey: "phc_YOUR_API_KEY")
        config.host = "https://us.i.posthog.com" // or eu.i.posthog.com
        config.captureApplicationLifecycleEvents = true
        config.captureScreenViews = false // Manual for better control
        config.debug = true // Disable in production
        PostHogSDK.shared.setup(config)
    }

    var body: some Scene {
        WindowGroup {
            AppView()
        }
    }
}
```

**User Identification** (`UserDataStore.swift`):
```swift
func identifyUser(userId: String, email: String?) {
    PostHogSDK.shared.identify(userId, userProperties: [
        "email": email ?? "",
        "created_at": ISO8601DateFormatter().string(from: Date())
    ])
}
```

**Event Tracking Examples**:
```swift
// Screen view
PostHogSDK.shared.screen("Home")

// Custom event
PostHogSDK.shared.capture("workout_started", properties: [
    "workout_type": "strength",
    "exercise_count": 5
])

// With user properties update
PostHogSDK.shared.capture("onboarding_completed", properties: [
    "$set": ["onboarding_completed": true]
])
```

**Session Replay** (optional):
```swift
config.sessionReplay = true
config.sessionReplayConfig.maskAllTextInputs = true
config.sessionReplayConfig.maskAllImages = false
config.sessionReplayConfig.screenshotMode = true // Required for SwiftUI
```

---

### PostHog Node.js SDK Integration

**Package**: [posthog-node](https://www.npmjs.com/package/posthog-node) (v5.24.11)

**Installation**:
```bash
npm install posthog-node
```

**Service Wrapper** (`BACKEND/services/posthog.service.js`):
```javascript
import { PostHog } from 'posthog-node';

const posthog = new PostHog('phc_YOUR_API_KEY', {
  host: 'https://us.i.posthog.com',
  flushAt: 20, // Batch size before sending
  flushInterval: 10000, // 10 seconds
});

export function captureEvent(distinctId, event, properties = {}) {
  posthog.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      source: 'backend',
      timestamp: new Date().toISOString(),
    },
  });
}

export function identifyUser(distinctId, properties) {
  posthog.identify({
    distinctId,
    properties,
  });
}

export function shutdownPosthog() {
  return posthog.shutdown();
}

export default posthog;
```

**Integration with Existing Observability** (`sessionObservability.service.js`):
```javascript
import { captureEvent } from './posthog.service.js';

// Add to existing logSessionEvent function
export async function logSessionEvent(sessionId, eventType, data, userId) {
  // Existing Supabase logging...

  // Add PostHog tracking
  if (userId) {
    captureEvent(userId, `agent_${eventType}`, {
      session_id: sessionId,
      ...data,
    });
  }
}
```

**Express Middleware** (`BACKEND/index.js`):
```javascript
import { shutdownPosthog } from './services/posthog.service.js';

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownPosthog();
  process.exit(0);
});
```

---

### Recommended Events to Track

#### iOS App Events

| Event | Properties | Location |
|-------|------------|----------|
| `app_opened` | `source`, `is_first_open` | Auto via SDK |
| `screen_viewed` | `screen_name` | Each view's `.onAppear` |
| `onboarding_step_completed` | `step_name`, `step_index` | `OnboardingStore` |
| `onboarding_completed` | `duration_seconds` | `OnboardingStore` |
| `workout_started` | `workout_id`, `exercise_count` | `WorkoutSessionStore` |
| `workout_completed` | `duration`, `exercises_done` | `WorkoutSessionStore` |
| `ai_message_sent` | `message_length`, `session_id` | `AssistantView` |
| `goal_created` | `goal_type`, `target_date` | `TrainerJourneyView` |
| `program_activated` | `program_id`, `week_count` | `TrainingProgramStore` |
| `location_added` | `has_equipment` | `LocationService` |

#### Backend Events

| Event | Properties | Location |
|-------|------------|----------|
| `agent_session_started` | `session_id`, `context_type` | `agentLoop.service.js` |
| `agent_session_completed` | `duration_ms`, `token_count`, `cost_cents` | `agentLoop.service.js` |
| `llm_request` | `model`, `tokens_in`, `tokens_out` | `agentLoop.service.js` |
| `tool_executed` | `tool_name`, `duration_ms`, `success` | `agentLoop.service.js` |
| `goal_generated` | `user_id`, `goal_type` | `trainerGoals.service.js` |
| `program_generated` | `user_id`, `week_count` | `trainerProgram.service.js` |
| `intake_submitted` | `user_id`, `field_count` | `trainerIntake.service.js` |
| `assessment_completed` | `user_id`, `score` | `trainerAssessment.service.js` |

---

### Implementation Plan

#### Phase 1: Core Setup (1-2 hours)
1. Create PostHog account at [posthog.com](https://posthog.com)
2. Add `posthog-ios` to iOS app via SPM
3. Add `posthog-node` to backend via npm
4. Initialize SDKs in both apps
5. Set up user identification flow

#### Phase 2: iOS Event Tracking (2-3 hours)
1. Create `AnalyticsService.swift` wrapper
2. Add screen tracking to main views
3. Track onboarding funnel
4. Track workout lifecycle events
5. Track AI assistant interactions

#### Phase 3: Backend Event Tracking (1-2 hours)
1. Create `posthog.service.js` wrapper
2. Integrate with existing `sessionObservability.service.js`
3. Track agent session events
4. Track API endpoint usage

#### Phase 4: Dashboards & Funnels (1 hour)
1. Create onboarding funnel in PostHog
2. Set up retention cohorts
3. Create workout engagement dashboard
4. Set up alerts for errors/anomalies

---

### Key Files to Modify

**iOS App**:
- `AI Personal Trainer App/AI Personal Trainer App/AI_Personal_Trainer_AppApp.swift` - Initialize SDK
- `AI Personal Trainer App/AI Personal Trainer App/Services/UserDataStore.swift` - User identification
- `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift` - Onboarding events
- `AI Personal Trainer App/AI Personal Trainer App/Services/WorkoutSessionStore.swift` - Workout events
- `AI Personal Trainer App/AI Personal Trainer App/App/AppView.swift` - Screen tracking
- Create: `AI Personal Trainer App/AI Personal Trainer App/Services/AnalyticsService.swift`

**Backend**:
- `BACKEND/package.json` - Add dependency
- `BACKEND/index.js` - Initialize and shutdown
- `BACKEND/services/sessionObservability.service.js` - Integrate tracking
- Create: `BACKEND/services/posthog.service.js`

---

## Code References

- `AI Personal Trainer App/AI Personal Trainer App/AI_Personal_Trainer_AppApp.swift` - App entry point
- `AI Personal Trainer App/AI Personal Trainer App/Services/UserDataStore.swift` - User state management
- `AI Personal Trainer App/AI Personal Trainer App/Services/OnboardingStore.swift` - Onboarding state
- `BACKEND/services/sessionObservability.service.js` - Existing observability
- `BACKEND/services/observability/metrics.service.js` - Metrics aggregation
- `BACKEND/index.js` - Server entry point

## Architecture Insights

1. **iOS App Uses MVVM-style Architecture**: State stores (`*Store.swift`) are the natural places to add event tracking, as they already manage state transitions.

2. **Backend Has Existing Observability Pattern**: The `sessionObservability.service.js` already captures the right events - PostHog can be layered on top rather than replacing it.

3. **Supabase Authentication**: Both iOS and backend use Supabase auth, so user IDs are consistent across platforms. Use `user.id` from Supabase as the PostHog `distinctId`.

4. **No Existing Analytics Conflicts**: Clean integration without needing to migrate or reconcile with existing systems.

## External Resources

- [PostHog iOS SDK](https://github.com/PostHog/posthog-ios)
- [PostHog Node.js SDK](https://www.npmjs.com/package/posthog-node)
- [PostHog Documentation](https://posthog.com/docs)
- [Swift Package Index - PostHog](https://swiftpackageindex.com/PostHog/posthog-ios)

## Open Questions

1. **Self-hosted vs Cloud**: Will you use PostHog Cloud or self-host? Cloud is recommended for simplicity.
2. **Session Replay**: Do you want iOS session replay? It adds ~2-5% app size but provides valuable debugging.
3. **Feature Flags**: Planning to use PostHog for feature flags? Would require additional integration.
4. **GDPR/Privacy**: Need opt-in consent flow before tracking? PostHog supports opt-out.
5. **Event Volume**: With heavy AI usage, token tracking events could be high volume - consider sampling or aggregation.
