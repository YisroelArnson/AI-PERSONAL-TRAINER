# Exercise Distribution Tracking - Quick Start Guide

## 🚀 Deploy in 3 Steps

### Step 1: Database Setup (2 minutes)

1. Open your Supabase dashboard
2. Go to **SQL Editor**
3. Create new query
4. Copy and paste the contents of `BACKEND/database/exercise_distribution_tracking_schema.sql`
5. Click **Run**

**Verify**: Check that the `exercise_distribution_tracking` table appears in your database.

### Step 2: Backend Deployment (1 minute)

The backend code is already integrated. Just restart your server:

```bash
cd BACKEND
node index.js
```

**Verify**: You should see:
```
Server running on port 3000
```

Test the endpoint:
```bash
curl http://localhost:3000/
```

### Step 3: iOS Deployment (2 minutes)

1. Open the iOS project in Xcode
2. Build and run (⌘R)

**Verify**: Open any goal setter view and save goals. Check Xcode console for:
```
✅ Successfully reset distribution tracking
```

## ✅ That's It!

The system is now live and will:
- ✅ Automatically track exercise distribution when users log exercises
- ✅ Calculate debt metrics to guide AI recommendations
- ✅ Reset tracking when users update their goals
- ✅ Influence AI to prioritize under-represented categories/muscles

## 🧪 Quick Test

1. **Set Goals** in the iOS app:
   - Category goals: 30% Cardio, 70% Strength
   - Muscle goals: 25% Chest, 30% Legs, 25% Back, 20% Arms

2. **Log Exercises**:
   - Log 3 strength exercises (e.g., push-ups, squats, pull-ups)
   - Log 0 cardio exercises

3. **Request Recommendations**:
   - Tap the home page to get recommendations
   - AI should recommend more cardio due to positive debt

4. **Check Backend Logs**:
   - Look for: `Successfully updated tracking for user X: Y exercises tracked`
   - Look for: Distribution status in the prompt

## 📊 View Distribution Data

### In Database
```sql
SELECT * FROM exercise_distribution_tracking 
WHERE user_id = 'YOUR_USER_ID';
```

### Via API
```bash
curl -X GET "http://localhost:3000/exercises/distribution/YOUR_USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Expected Response
```json
{
  "success": true,
  "data": {
    "trackingSince": "2025-11-16T10:00:00Z",
    "totalExercises": 3,
    "categories": {
      "Strength": {
        "target": 0.70,
        "actual": 1.00,
        "debt": -0.30,
        "totalShare": 3.0
      },
      "Cardio": {
        "target": 0.30,
        "actual": 0.00,
        "debt": 0.30,
        "totalShare": 0.0
      }
    },
    "hasData": true
  }
}
```

## 🔍 Troubleshooting

### Issue: "Table does not exist"
**Solution**: Run the SQL schema in Supabase

### Issue: Tracking not updating
**Solution**: Check backend logs for errors. Ensure server is running.

### Issue: iOS reset call fails
**Solution**: 
- Check network connectivity
- Verify API base URL in `APIService.swift`
- Check authentication token is valid

### Issue: Distribution not in AI prompt
**Solution**: 
- Ensure user has set goals
- Ensure user has logged at least one exercise
- Check `fetchAllUserData` includes `exerciseDistribution: true`

## 📚 More Information

- **Full Testing Guide**: See `EXERCISE_DISTRIBUTION_TESTING.md`
- **Implementation Details**: See `EXERCISE_DISTRIBUTION_IMPLEMENTATION_SUMMARY.md`
- **System Design**: See `exercise-distribution.plan.md`

## 🎯 Success Indicators

After deployment, you should see:

✅ **Backend Logs**:
```
Successfully updated tracking for user abc123: 5 exercises tracked
```

✅ **iOS Logs**:
```
✅ Category goals saved successfully
✅ Successfully reset distribution tracking
```

✅ **Database**:
- New records in `exercise_distribution_tracking` table
- `category_totals` and `muscle_totals` populated

✅ **AI Behavior**:
- Distribution status appears in prompts
- Under-represented categories get more recommendations

## 🚨 Important Notes

1. **Existing Users**: Tracking starts fresh from deployment. Old exercises remain in history but don't affect initial distribution.

2. **Performance**: Each exercise log updates tracking in O(1) time - no performance impact even with thousands of exercises.

3. **Goal Updates**: Whenever users update their goals, tracking automatically resets.

4. **Backward Compatible**: Works with existing `goals_addressed` format (array of strings).

5. **Graceful Errors**: If tracking fails, exercise logging still succeeds. Users won't experience disruptions.

## 📞 Support

If you encounter issues:
1. Check backend logs
2. Check database for tracking records
3. Verify API endpoints are accessible
4. Review `EXERCISE_DISTRIBUTION_TESTING.md` for detailed troubleshooting

---

**Deployment Time**: ~5 minutes
**Performance Impact**: Zero (O(1) updates)
**User Impact**: Seamless (automatic tracking)
**Value**: Better balanced, goal-aligned exercise recommendations

