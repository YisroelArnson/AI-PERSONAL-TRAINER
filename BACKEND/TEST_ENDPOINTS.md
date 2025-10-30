# API Endpoints Testing Guide

## Exercise Logging Endpoints

### 1. Log a Completed Exercise

**Endpoint**: `POST /exercises/log/:userId`

**Headers**:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Example Request - Strength Exercise**:
```json
{
  "exercise_name": "Barbell Bench Press",
  "exercise_type": "strength",
  "aliases": ["bb_bench_press"],
  "sets": 4,
  "reps": [8, 8, 6, 6],
  "load_kg_each": [80, 80, 85, 85],
  "rest_seconds": 90,
  "muscles_utilized": [
    { "muscle": "chest", "share": 0.5 },
    { "muscle": "triceps", "share": 0.3 },
    { "muscle": "shoulders", "share": 0.2 }
  ],
  "goals_addressed": ["strength", "upper_body"],
  "reasoning": "Chest and triceps workout",
  "equipment": ["barbell", "bench"],
  "movement_pattern": ["push"],
  "body_region": "upper"
}
```

**Example Request - Cardio Distance**:
```json
{
  "exercise_name": "5K Run",
  "exercise_type": "cardio_distance",
  "distance_km": 5.0,
  "duration_min": 25,
  "target_pace": "5:00/km",
  "muscles_utilized": [
    { "muscle": "legs", "share": 0.7 },
    { "muscle": "core", "share": 0.3 }
  ],
  "goals_addressed": ["cardio", "endurance"],
  "reasoning": "Cardiovascular training"
}
```

**Example Request - HIIT**:
```json
{
  "exercise_name": "HIIT Circuit",
  "exercise_type": "hiit",
  "rounds": 10,
  "intervals": [
    { "work_sec": 30 },
    { "rest_sec": 60 }
  ],
  "total_duration_min": 20,
  "muscles_utilized": [
    { "muscle": "full_body", "share": 1.0 }
  ],
  "goals_addressed": ["cardio", "fat_loss"],
  "reasoning": "High intensity interval training"
}
```

**Success Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "user_id": "user-uuid",
    "exercise_name": "Barbell Bench Press",
    "exercise_type": "strength",
    "performed_at": "2025-10-26T10:30:00Z",
    "created_at": "2025-10-26T10:30:00Z",
    ...
  },
  "timestamp": "2025-10-26T10:30:00Z"
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": "Exercise name and type are required",
  "timestamp": "2025-10-26T10:30:00Z"
}
```

### 2. Get Workout History

**Endpoint**: `GET /exercises/history/:userId`

**Query Parameters** (all optional):
- `limit` - Number of records to return (default: 50)
- `startDate` - Filter by start date (ISO 8601 format)
- `endDate` - Filter by end date (ISO 8601 format)

**Headers**:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Example Request**:
```
GET /exercises/history/user-uuid?limit=20&startDate=2025-10-01T00:00:00Z
```

**Success Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "user_id": "user-uuid",
      "exercise_name": "Barbell Bench Press",
      "exercise_type": "strength",
      "performed_at": "2025-10-26T10:30:00Z",
      "sets": 4,
      "reps": [8, 8, 6, 6],
      "load_kg_each": [80, 80, 85, 85],
      "muscles_utilized": [...],
      ...
    },
    ...
  ],
  "count": 20,
  "timestamp": "2025-10-26T10:30:00Z"
}
```

## Testing with cURL

### Log Exercise
```bash
curl -X POST http://localhost:3000/exercises/log/YOUR_USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exercise_name": "Barbell Bench Press",
    "exercise_type": "strength",
    "sets": 4,
    "reps": [8, 8, 6, 6],
    "load_kg_each": [80, 80, 85, 85],
    "muscles_utilized": [
      { "muscle": "chest", "share": 0.5 },
      { "muscle": "triceps", "share": 0.3 },
      { "muscle": "shoulders", "share": 0.2 }
    ],
    "goals_addressed": ["strength"],
    "reasoning": "Test workout"
  }'
```

### Get Workout History
```bash
curl -X GET http://localhost:3000/exercises/history/YOUR_USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Workout History with Filters
```bash
curl -X GET "http://localhost:3000/exercises/history/YOUR_USER_ID?limit=10&startDate=2025-10-01T00:00:00Z" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Testing with Postman

### Setup Collection

1. Create a new collection called "AI Personal Trainer"
2. Add environment variables:
   - `base_url`: http://localhost:3000
   - `user_id`: Your user UUID
   - `auth_token`: Your JWT token

### Add Requests

#### 1. Log Strength Exercise
- Method: POST
- URL: `{{base_url}}/exercises/log/{{user_id}}`
- Headers:
  - Authorization: Bearer {{auth_token}}
  - Content-Type: application/json
- Body (raw JSON): Use strength example above

#### 2. Log Cardio Exercise
- Method: POST
- URL: `{{base_url}}/exercises/log/{{user_id}}`
- Headers: Same as above
- Body (raw JSON): Use cardio example above

#### 3. Log HIIT Exercise
- Method: POST
- URL: `{{base_url}}/exercises/log/{{user_id}}`
- Headers: Same as above
- Body (raw JSON): Use HIIT example above

#### 4. Get Workout History
- Method: GET
- URL: `{{base_url}}/exercises/history/{{user_id}}`
- Headers:
  - Authorization: Bearer {{auth_token}}
- Params:
  - limit: 20
  - startDate: 2025-10-01T00:00:00Z

## Common Issues

### 401 Unauthorized
- Check that your JWT token is valid
- Verify token is not expired
- Ensure Bearer prefix is included

### 400 Bad Request
- Verify required fields are present (exercise_name, exercise_type, muscles_utilized)
- Check JSONB fields are properly formatted arrays
- Ensure user_id in URL matches authenticated user

### 500 Internal Server Error
- Check backend server logs
- Verify database table exists
- Check Supabase connection

## Getting JWT Token

### From iOS App
The iOS app automatically handles authentication. The token is retrieved from:
```swift
let session = try await supabase.auth.session
let token = session.accessToken
```

### For Manual Testing
1. Sign in to your app
2. Use browser dev tools to intercept API calls
3. Copy the Authorization header value
4. Or use Supabase auth.signIn() to get a token

## Validation Rules

### Required Fields
- `exercise_name`: String, not empty
- `exercise_type`: String, one of the valid types
- `muscles_utilized`: Array, shares must sum to 1.0

### Exercise Types
Valid types: strength, cardio_distance, cardio_time, hiit, circuit, flexibility, yoga, bodyweight, isometric, plyometric, balance, sport_specific

### JSONB Format
Arrays in JSONB must be valid JSON:
```json
"reps": [8, 8, 6, 6]
"muscles_utilized": [{"muscle": "chest", "share": 0.5}]
```

### RPE (Rate of Perceived Exertion)
If provided, must be between 1 and 10.

## Testing Checklist

Backend Testing:
- [ ] Server starts without errors
- [ ] POST /exercises/log creates record in database
- [ ] GET /exercises/history returns records
- [ ] Authentication middleware works
- [ ] RLS policies prevent cross-user access
- [ ] All exercise types can be logged
- [ ] JSONB fields properly stored and retrieved
- [ ] Timestamps auto-populate
- [ ] Indexes improve query performance

iOS App Testing:
- [ ] App fetches recommendations on launch
- [ ] Exercise cards display correctly
- [ ] Completion button appears on current card
- [ ] Completion logs exercise to backend
- [ ] Success feedback shows
- [ ] Card removes from list
- [ ] Carousel scrolls to next exercise
- [ ] Refresh modal works
- [ ] Loading states display
- [ ] Error handling works

---

**Server URL**: Update in `APIService.swift` if testing on device:
```swift
private let baseURL = "http://YOUR_LOCAL_IP:3000"
```

**Database**: Make sure to run the SQL schema creation script first!

