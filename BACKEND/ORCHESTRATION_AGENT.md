# Orchestration Agent

The Orchestration Agent is the central component that processes user requests and calls appropriate tools to fulfill their fitness-related needs.

## Overview

The agent follows this flow:
1. User speaks or types a command
2. Text is sent to the `/agent/chat` endpoint
3. Agent processes the request using GPT-4 with tool calling capabilities
4. LLM either responds directly or calls one or more tools
5. Tool results are processed and a final response is sent back

## API Endpoints

### POST /agent/chat
Main endpoint for processing user requests with tool calling.

**Request Body:**
```json
{
  "message": "Give me 5 exercises for my glutes",
  "useTools": true
}
```

**Response:**
```json
{
  "success": true,
  "response": "Here are 5 great glute exercises for you...",
  "toolCalls": [...],
  "toolResults": [...],
  "usage": {...},
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### POST /agent/simple
Simple text responses without tool calling.

### GET /agent/health
Health check endpoint.

### GET /agent/tools
Get information about available tools.

## Available Tools

### 1. Request Exercises (`request_exercises`)
Get exercise recommendations based on user preferences.

**Parameters:**
- `muscle_groups`: Array of target muscle groups
- `exercise_count`: Number of exercises (default: 5)
- `workout_type`: Type of workout (HIIT, strength, cardio)
- `difficulty`: Difficulty level
- `duration`: Workout duration in minutes
- `equipment`: Available equipment

### 2. Log Exercise (`log_exercise`)
Log a completed exercise with details.

**Parameters:**
- `exercise_name`: Name of the exercise
- `sets`: Number of sets
- `reps`: Repetitions per set
- `weight`: Weight used
- `duration`: Duration in seconds
- `notes`: Additional notes

### 3. Start Timer (`start_timer`)
Start a timer or interval training session.

**Parameters:**
- `type`: "single_timer" or "interval"
- `duration`: Duration for single timer
- `work_duration`: Work interval duration
- `rest_duration`: Rest interval duration
- `rounds`: Number of rounds
- `intervals`: Custom interval sequence

### 4. Parse Preference (`parse_preference`)
Parse and store user preferences or dislikes.

**Parameters:**
- `preference_type`: "like", "dislike", "goal", or "restriction"
- `content`: The preference content
- `exercises`: Specific exercises mentioned
- `muscle_groups`: Muscle groups mentioned
- `workout_types`: Workout types mentioned

### 5. Adjust Exercise (`adjust_exercise`)
Adjust parameters of logged exercises.

**Parameters:**
- `adjustment_type`: What to adjust (reps, sets, weight, etc.)
- `new_value`: New value for the adjustment
- `exercise_id`: ID of specific exercise to adjust

### 6. Answer Question (`answer_question`)
Answer fitness-related questions with expert knowledge.

**Parameters:**
- `question`: The fitness question
- `category`: Question category (form, injury, nutrition, etc.)
- `exercise_name`: Specific exercise mentioned

## Example Usage

```javascript
// Request exercises
"Give me 5 exercises to work on my glutes"

// Log exercise
"I just did 3 sets of 10 pushups with 15 pounds"

// Start timer
"Set an interval for 30 seconds work, 10 seconds rest, for 8 rounds"

// Parse preference
"I don't like burpees, give me HIIT exercises today"

// Adjust exercise
"Change my last set to 12 reps instead of 10"

// Answer question
"How do I do a proper squat? My knee hurts during squats, should I stop?"
```

## Testing

Run the test script to verify the agent is working:

```bash
node test-agent.js
```

## Configuration

Make sure to set the following environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key for GPT-4 access

## Implementation Status

✅ **Completed:**
- Tool definitions with Zod schemas
- Tool implementations (boilerplate)
- Orchestration agent service
- API endpoints and routes
- Integration with Express app

🚧 **TODO (Future Implementation):**
- Actual tool functionality implementation
- Database integration for logging and preferences
- Real-time timer functionality
- Integration with existing exercise recommendation system
- User context and memory between conversations
- Error handling and validation improvements
