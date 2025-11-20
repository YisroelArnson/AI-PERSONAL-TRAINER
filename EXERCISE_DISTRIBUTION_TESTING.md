# Exercise Distribution Tracking System - Testing Guide

## Overview
This document provides a comprehensive testing guide for the incremental exercise distribution tracking system.

## Prerequisites

### 1. Database Setup
Run the SQL schema in your Supabase SQL editor:

```bash
# File location: BACKEND/database/exercise_distribution_tracking_schema.sql
```

Copy and paste the entire contents into Supabase SQL Editor and execute.

### 2. Backend Setup
Ensure your backend server is running:

```bash
cd BACKEND
node index.js
```

### 3. iOS App
Build and run the iOS app on simulator or device.

## Test Scenarios

### Test 1: Initial Tracking Setup

**Objective**: Verify that tracking is automatically created when first exercise is logged.

**Steps**:
1. Create a new test user or use existing user with no tracking data
2. Set category goals (e.g., 30% Cardio, 70% Strength)
3. Set muscle goals (e.g., 25% Chest, 30% Legs, 20% Back, 25% Arms)
4. Log a strength exercise targeting chest (e.g., Push-ups)
5. Check distribution metrics

**Expected Results**:
- Tracking record is automatically created
- `total_exercises_count` = 1
- `category_totals` shows "Strength" with accumulated share value
- `muscle_totals` shows muscles with their share values
- Distribution metrics show current vs target percentages

**API Endpoint to Test**:
```bash
GET /exercises/distribution/:userId
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "trackingSince": "2025-11-16T10:00:00Z",
    "totalExercises": 1,
    "categories": {
      "Strength": {
        "target": 0.70,
        "actual": 1.00,
        "debt": -0.30,
        "totalShare": 1.0
      },
      "Cardio": {
        "target": 0.30,
        "actual": 0.00,
        "debt": 0.30,
        "totalShare": 0.0
      }
    },
    "muscles": {
      "Chest": {
        "target": 0.25,
        "actual": 0.60,
        "debt": -0.35,
        "totalShare": 0.6
      },
      "Triceps": {
        "target": 0.25,
        "actual": 0.40,
        "debt": -0.15,
        "totalShare": 0.4
      }
    },
    "hasData": true
  }
}
```

### Test 2: Incremental Updates

**Objective**: Verify that each new exercise incrementally updates the tracking.

**Steps**:
1. Log first exercise: Barbell Squat (Strength, targets Legs/Glutes)
2. Check tracking - should show 1 exercise
3. Log second exercise: Running (Cardio, targets Legs)
4. Check tracking - should show 2 exercises with updated totals
5. Log third exercise: Bench Press (Strength, targets Chest/Triceps)
6. Check tracking - should show 3 exercises

**Expected Results**:
- `total_exercises_count` increments by 1 each time
- Category totals accumulate correctly (weighted by share)
- Muscle totals accumulate correctly (weighted by share)
- Debt calculations update dynamically
- Under-represented categories/muscles show positive debt
- Over-represented categories/muscles show negative debt

**Performance Check**:
- Each update should be O(1) - single UPDATE query
- Check server logs for query time (should be < 50ms)

### Test 3: Multi-Category Exercises

**Objective**: Verify that exercises addressing multiple categories split credit correctly.

**Steps**:
1. Log a HIIT exercise with `goals_addressed`:
   ```json
   [
     {"goal": "Cardio", "share": 0.6},
     {"goal": "Strength", "share": 0.4}
   ]
   ```
2. Check tracking totals

**Expected Results**:
- Cardio total increases by 0.6
- Strength total increases by 0.4
- Total shares sum correctly
- Distribution percentages reflect the split

### Test 4: Goal Reset

**Objective**: Verify that updating goals resets the tracking.

**Steps**:
1. Log 5 exercises with current goals
2. Check distribution - should show 5 exercises tracked
3. Update category goals (change percentages or add/remove categories)
4. Check distribution immediately after

**Expected Results**:
- Tracking record is deleted and recreated
- `total_exercises_count` = 0
- `category_totals` = {}
- `muscle_totals` = {}
- `tracking_started_at` is updated to current timestamp
- Old exercise data in `workout_history` remains intact

**iOS Flow**:
- CategoryGoalSetterView calls `APIService().resetDistributionTracking()` after saving
- MuscleGoalSetterView calls `APIService().resetDistributionTracking()` after saving
- Check Xcode console for success message: "✅ Successfully reset distribution tracking"

### Test 5: AI Recommendation Integration

**Objective**: Verify that distribution metrics are included in AI recommendations.

**Steps**:
1. Log 5 strength exercises (0 cardio exercises)
2. With goals set to 30% cardio, 70% strength
3. Request exercise recommendations
4. Check backend logs for prompt content

**Expected Results**:
- Distribution status appears in the formatted user data
- Shows "GOAL DISTRIBUTION STATUS" section
- Shows under-represented categories (Cardio: NEEDS +30%)
- Shows over-represented categories (Strength: OVER by 30%)
- AI recommendations prioritize cardio exercises due to positive debt

**Prompt Format Check**:
```
GOAL DISTRIBUTION STATUS (tracking since Nov 16):
  Total exercises tracked: 5

  CATEGORY DISTRIBUTION:
    UNDER-REPRESENTED (need more):
      - Cardio: TARGET 30%, ACTUAL 0% → NEEDS +30%
    OVER-REPRESENTED (reduce):
      - Strength: TARGET 70%, ACTUAL 100% → OVER by 30%

  MUSCLE DISTRIBUTION:
    UNDER-REPRESENTED (need more):
      - Back: TARGET 30%, ACTUAL 10% → NEEDS +20%
```

### Test 6: Priority Scoring

**Objective**: Verify that debt influences AI exercise selection.

**Steps**:
1. Set goals: 20% Cardio, 80% Strength
2. Log 10 strength exercises, 0 cardio
3. Request 5 exercise recommendations
4. Count how many are cardio vs strength

**Expected Results**:
- Due to high cardio debt (+20%), AI should recommend more cardio
- Priority formula applies: base_priority + (category_debt × 15) + (muscle_debt × 10)
- Exercises targeting under-represented categories/muscles are strongly favored
- At least 1-2 of the 5 exercises should be cardio to balance distribution

### Test 7: Backward Compatibility

**Objective**: Verify system handles old format `goals_addressed` (array of strings).

**Steps**:
1. Manually log exercise with old format using API:
   ```json
   {
     "goals_addressed": ["Strength", "Hypertrophy"]
   }
   ```
2. Check tracking updates correctly

**Expected Results**:
- System treats each string as 1.0 share
- Tracking accumulates correctly
- No errors in logs

### Test 8: Edge Cases

#### 8.1 Empty Goals
**Steps**: User has no category/muscle goals set
**Expected**: Distribution metrics return empty with `hasData: false`

#### 8.2 Zero Exercises
**Steps**: Check distribution before logging any exercises
**Expected**: All actuals are 0, all debts equal target weights

#### 8.3 Disabled Goals
**Steps**: Disable some goals (set `enabled: false`)
**Expected**: Only enabled goals appear in distribution metrics

#### 8.4 Multiple Resets
**Steps**: Reset tracking multiple times in succession
**Expected**: Each reset clears and recreates successfully

### Test 9: Performance Testing

**Objective**: Verify O(1) performance at scale.

**Steps**:
1. Log 100 exercises sequentially
2. Measure time for each tracking update
3. Compare early updates vs later updates

**Expected Results**:
- Update time should be consistent regardless of total exercise count
- Each update: < 100ms (including network)
- Database query time: < 50ms
- No degradation with more historical exercises

**Monitoring**:
```javascript
// Backend logs should show:
console.log(`Successfully updated tracking for user ${userId}: ${totalExercises} exercises tracked`);
```

### Test 10: Error Handling

**Objective**: Verify graceful error handling.

**Steps**:
1. Log exercise when backend is down
2. Log exercise with invalid data
3. Reset tracking when backend is down
4. Check that app doesn't crash and logs warnings

**Expected Results**:
- Exercise logging doesn't fail if tracking update fails
- Console shows warning: "⚠️ Warning: Failed to reset distribution tracking"
- Goal saving succeeds even if reset fails
- User experience is not disrupted

## Database Queries for Manual Testing

### Check Current Tracking
```sql
SELECT * FROM exercise_distribution_tracking
WHERE user_id = 'YOUR_USER_ID';
```

### View Category Totals
```sql
SELECT 
  user_id,
  category_totals,
  total_exercises_count,
  tracking_started_at
FROM exercise_distribution_tracking
WHERE user_id = 'YOUR_USER_ID';
```

### View Muscle Totals
```sql
SELECT 
  user_id,
  muscle_totals,
  total_exercises_count,
  tracking_started_at
FROM exercise_distribution_tracking
WHERE user_id = 'YOUR_USER_ID';
```

### Check Recent Exercises
```sql
SELECT 
  exercise_name,
  goals_addressed,
  muscles_utilized,
  performed_at
FROM workout_history
WHERE user_id = 'YOUR_USER_ID'
ORDER BY performed_at DESC
LIMIT 10;
```

### Manually Reset Tracking
```sql
DELETE FROM exercise_distribution_tracking
WHERE user_id = 'YOUR_USER_ID';

INSERT INTO exercise_distribution_tracking (
  user_id,
  tracking_started_at,
  last_updated_at,
  total_exercises_count,
  category_totals,
  muscle_totals
) VALUES (
  'YOUR_USER_ID',
  NOW(),
  NOW(),
  0,
  '{}',
  '{}'
);
```

## API Testing with cURL

### Get Distribution Metrics
```bash
curl -X GET "http://localhost:3000/exercises/distribution/USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Reset Distribution Tracking
```bash
curl -X POST "http://localhost:3000/exercises/distribution/reset/USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Log Exercise (triggers automatic tracking update)
```bash
curl -X POST "http://localhost:3000/exercises/log/USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exercise_name": "Push-ups",
    "exercise_type": "bodyweight",
    "sets": 3,
    "reps": [10, 10, 10],
    "muscles_utilized": [
      {"muscle": "Chest", "share": 0.6},
      {"muscle": "Triceps", "share": 0.3},
      {"muscle": "Shoulders", "share": 0.1}
    ],
    "goals_addressed": [
      {"goal": "Strength", "share": 0.7},
      {"goal": "Endurance", "share": 0.3}
    ]
  }'
```

## Success Criteria

✅ All test scenarios pass
✅ Tracking updates in O(1) time
✅ Goal resets clear tracking correctly
✅ AI recommendations include distribution status
✅ Debt calculations influence exercise selection
✅ Error handling is graceful
✅ iOS app integrates seamlessly
✅ No performance degradation with scale
✅ Backward compatible with old data format

## Common Issues and Solutions

### Issue: Tracking not updating
**Solution**: Check that `exerciseLog.service.js` calls `updateTrackingIncrementally`

### Issue: Reset not working
**Solution**: Verify API endpoint is registered and authentication is valid

### Issue: Distribution metrics empty
**Solution**: Check that user has set category and muscle goals

### Issue: Debt calculations incorrect
**Solution**: Verify that totals are being accumulated correctly and shares sum to 1.0

### Issue: iOS reset call fails
**Solution**: Check network connectivity and API base URL configuration

## Monitoring and Logs

**Backend Logs to Watch**:
```
✅ Successfully updated tracking for user X: Y exercises tracked
✅ Successfully reset tracking for user X
⚠️ Failed to update distribution tracking: [error]
```

**iOS Logs to Watch**:
```
✅ Successfully reset distribution tracking
⚠️ Warning: Failed to reset distribution tracking: [error]
✅ Category goals saved successfully
✅ Muscle goals saved successfully
```

## Next Steps After Testing

1. Monitor production usage for performance
2. Collect user feedback on recommendation quality
3. Consider adding UI to display distribution metrics
4. Add analytics to track how often users hit their goals
5. Consider notifications when categories are severely under-represented

