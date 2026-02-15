Things to figure out:

- [ ]  LLM usage price tracking per user

# Functionality of app in pillars

## Personalized exercise recommendation engine

### The goal 🎯

Generate exercises that are highly personalized, effective, and optimal. That means recommending the right exercise at the right time. As well, the goal is to recommend personalized, effective, and optimal weight and reps. 

- Prompts
    
    System prompt
    
    ```json
    You are an AI personal trainer. Your job is to generate the next set of exercises for the user. 
    You must return recommendations that are:
    - Personalized to the user’s stats, goals, and history
    - Effective for progression over time
    - Optimal for the user’s current preferences, equipment, and constraints
    IMPORTANT: If the user explicitly requests something, this preference OVERRIDES all other long-term goals and history. Always listen to explicit user preferences first.
    Always return your answer in strict JSON format. Do not include extra commentary outside the JSON.
    ```
    
    Process rules for the model
    
    ```json
    Follow this process each time:
    1. Check for explicit user preferences in the current data. If present, ignore long-term category/muscle goals and satisfy the preference fully.
    2. If no overriding preference is present, analyze the user’s goals, history, equipment, and constraints.
    3. Follow the bias signals which category or muscle groups are most under-target or most relevant when recommending exercises.
    	3a. When labeling the goals_addressed and muscles_utilized, only select from the provided user's exercise categories and muscles. Do NOT make up your own categories or muscles. For goals_addressed, assign shares that add up to 1.0 representing how much each goal is addressed by this exercise.
    4. Select exercises that match available equipment and respect pain/avoid preferences. And consider most recently completed exercises when recommending new exercises.
    5. Apply progression logic using the user’s workout history (increase load/reps slightly if appropriate).
    6. Choose the most relevant exercises for the user’s available time and preferences.
    7. For each exercise, explain the reasoning in 1 sentence.
    8. Return results as a JSON array of exercise objects (see format).
    ```
    
    Output Format
    
    ```json
    {
      "recommendations": [
        {
          "exercise_name": "",
          "sets": 0,
          "reps": [],
          "load_kg_each": [],
          "muscles_utilized": [{"muscle": "", "share": 0.5}], //Which muscles were utilized. Share must add up to 1.
          "goals_addressed": [{"goal": "", "share": 0.5}], //Which of the user goals does this exercise fit into and their shares. Share must add up to 1.
          "reasoning": "" //Why was this exercise recommended?
        }
      ]
    }
    ```
    
    User Data payload
    
    ```json
    {
      "goals": {
        "categories_and_weights": [
          {"category": "strength", "weight": 0.5},
          {"category": "cardio", "weight": 0.4},
          {"category": "stability", "weight": 0.1}
        ],
        "muscle_groups_and_weights": {
          "glutes": 0.125, "hamstrings": 0.125, "chest": 0.125, "back": 0.125,
          "shoulders": 0.125, "triceps": 0.125, "biceps": 0.125, "abs": 0.125
        }
        "bias_signals": {
    	    "categories_bias_signal": ["strength": "+0.25", "cardio": "-0.1", "stability": "+0.1"],
    	    "muscle_bias_signal": ["glutes": "+0.2", "shoulder": "-4.5", "biceps": "-0.1"]
        }
      },
      
      "current_equipment": [""],
    
      "preferences": [
    	  {"type": "timing constraint", "permanent": "false", "expiration": "09/09/2025:5:30", "user_command": "I only have 20 minutes", "instructions": "limit exercise recommendations to fit the 20 minute time window"}
      ],
      "user_profile": {
        "sex": "male", "dob": "1995-01-15", "height_cm": 178, "weight_kg": 76.0
      },
      "workout_history": [
        {
          "date": "2025-08-25",
          "exercises": [
            {"exercise_name": "Dumbbell Bench Press", "sets": 3, "reps": [10,10,8], "load_kg_each": [24,24,26]}
          ]
        },
        {
          "date": "2025-08-23",
          "exercises": [
            {"exercise_name": "Pull-ups", "sets": 3, "reps": [8,7,6], "load_kg_each": [0,0,0]}
          ]
        }
      ]
    }
    ```
    

Intakes user data:

- category goals (i.e strength, cardio, yoga)
    
    Whatever the user defines. 
    
    An example:
    
    - 50% strength: exercises that build muscles
    - 40% Cardio: exercises that get the heart going, like running.
    - 10% Stability: exercises that build stability, like one leg balancing.
    
    Peter aria’s example:
    
    - 15% Stability & Mobility (foundation): exercises that make you hard to injure by improving joint control and usable range.
    Examples: single-leg balance with reach, Pallof press/anti-rotation, CARS, Copenhagen plank, shoulder ER, farmer carry.
    - 45% Strength (capacity): compound lifts across hinge/squat/push/pull/carry/lunge patterns with progressive overload.
    Examples: deadlift/KB hinge, squat/split squat, pull-ups/rows, bench/OHP, carries.
    - 20% Aerobic Efficiency — Zone 2: steady, easy-to-moderate work that you can sustain while speaking in full sentences; builds mitochondrial/metabolic health.
    Examples: brisk incline walk, cycling, rowing, easy jog, rucking.
    - 20% Aerobic Power — VO₂ max: short, very hard intervals to raise your ceiling for work and longevity markers.
    Examples: 4×4-min or 6×3-min hard intervals on bike/rower/run with easy recoveries; hill sprints.
    
     
    
- Muscle goals (upper body)
    
    ```json
    {
    "abs": 0.0625,
    "back": 0.0625,
    "biceps": 0.0625,
    "chest": 0.0625,
    "glutes": 0.0625,
    "hamstrings": 0.0625,
    "quadriceps": 0.0625,
    "shoulders": 0.0625,
    "triceps": 0.0625,
    "lower_back": 0.0625,
    "calves": 0.0625,
    "trapezius": 0.0625,
    "abductors": 0.0625,
    "adductors": 0.0625,
    "forearms": 0.0625,
    "neck": 0.0625
    }
    ```
    
- Preferences (I.e I only have 15 minutes, I’m feeling tired today)
- Body stats
- Workout history (last 10)
- Available equipment
- Relevant workout history

Caching: cache a user context compilation (user data package) for 15-30 minutes so that it doesn’t need to be rerun. Delete from cache when recommendations are updated or exercises are completely.

Outputs recommended exercises (zod object passed into LLM):

```json
{
  "exercise_name": "Barbell Bench Press",
  "aliases": ["bb_bench_press"],
  "duration_min": 0,
  
  // For rep-based exercises
  "reps": [8, 8, 6, 6],
  "load_kg_each": [80, 80, 85, 85],
  
  // For Runs
  "distance_km": 0, 
  
  
  // For interval exercises like HIIT
  "intervals": [ 
	  {"work_sec": 30}, {"rest_sec": 60}
  ]
  "rounds": 10,
  
  
  "muscles_utilized": [
    { "muscle": "chest", "share": 0.5 },
    { "muscle": "triceps", "share": 0.3 },
    { "muscle": "shoulders", "share": 0.2 }
  ],
  
  "goals_addressed": [
    { "goal": "Strength", "share": 0.8 },
    { "goal": "Muscle Building", "share": 0.2 }
  ],
  "reasoning": "Recommended because chest and triceps are under target this week (+0.2 bias). Progressed safely from last session at 75–80kg.",
	"equiptment": ["barbell", "bench"],
	"RPE": 5,
	//Optional for better search matching: exact match or related exercises
	"movement_pattern": [
			"squat",        // knee-dominant lower body
			"hinge",        // hip-dominant lower body
			"push",         // horizontal + vertical push
			"pull",         // horizontal + vertical pull
			"carry",        // loaded carries, farmer walks
			"rotation_core",// rotation + anti-rotation + stability
			"isolation",    // single-joint accessory (curls, raises, calf raises)
			"conditioning"  // steady-state cardio + intervals
	],
	"exercise_description": "",
	"body_region": "upper"
}
```

### **Weight recommendations and progression**

- Other implementations
    
    **list of last exercises**
    
    Last 30 exercises - compressed version: exercise name, weight and reps / distance / time (run 1.5 miles in 20 minutes) (burpees 20 reps)
    
    Feed this data into LLM to guide weight recommendations 
    
    **List of user RPE data**
    
    Prompt user visually and user can answer with voice about RPE of exercise just completed. Save that signal in the weights profile. Keep a rotating list of 30 items. User says run was too hard, save signal of run data and a note to decrease length or pace on next recommendation. 
    
    User does back machine at x weight and reps. User reports it was too easy. Save signal to increase. 
    
    Don’t save exercises where user didn’t give rpe feedback. 
    
    Feed this data into LLM to guide weight recommendations
    
    **Canonical list of exercises**
    
    I can save each exercise with canonical id and look up history of that exercise and compute with a formula whether I should increase weight or decrease. 
    
    **search past exercise with hybrid search**
    
    Search with fuzzy search and vector search through past user exercises. Search with the current exercise name, and rank search results. Then analyze those exercises to recommend a weight for current exercise. 
    
    **Primary movement patterns**
    •	Hip Hinge: Deadlifts, Romanian deadlifts, good mornings, hip thrusts
    •	Knee Dominant: Squats, lunges, step-ups, leg press
    •	Vertical Push: Overhead press, push press, handstand push-ups
    •	Vertical Pull: Pull-ups, chin-ups, lat pulldowns
    •	Horizontal Push: Bench press, push-ups, dumbbell press
    •	Horizontal Pull: Rows, face pulls, reverse flies
    •	Loaded Carry: Farmer’s walks, suitcase carries, overhead carries
    •	Rotational: Wood chops, Russian twists, anti-rotation planks
    Secondary Classifications:
    •	Unilateral vs bilateral
    •	Compound vs isolation
    •	Free weight vs machine vs bodyweight
    •	Concentric emphasis vs eccentric emphasis
    
    Save exercises into this structure, slotting in an exercise into its corresponding movement. Save past 5 exercises per movement pattern. Feed that into LLM to guide weight recommendations. 
    
    If user reports too heavy or light, adjust the exercise and save it with updated weights. 
    
    Must label exercises into one of these movement patterns. 
    
- Prompt for getting weights and reps from LLM
    
    System prompt
    
    ```json
    You are an AI personal trainer. Your job is to generate the appropriate weights, reps, and sets for the next exercise the user should perform. 
    You must use the user’s past history of this exercise (or related exercises) to make safe and progressive recommendations.
    Always return the result in strict JSON format.
    ```
    
    Rules
    
    ```json
    1. If the user has performed this exact exercise recently:
       - If the same weight was used across multiple sessions, increase the weight slightly (safe progression).
       - If performance (reps or sets) has decreased, maintain or slightly reduce weight.
    2. If the user has not done this exercise in a long time:
       - Decrease the weight by ~5–10% for safety, and suggest rebuilding progression.
    3. If there is no exact history:
       - Use related exercises (similar movement pattern, muscles used, equipment) to estimate appropriate load and reps.
    4. If there is no history at all:
       - Use default beginner-safe recommendations based on user stats (weight, sex, experience).
    5. Incorporate RPE (Rate of Perceived Exertion) or RIR (Reps in Reserve) feedback if provided:
       - If last RPE was high (9–10), lower the load or reps.
       - If last RPE was moderate (6–7), progress slightly.
    6. Always respect explicit user preferences (e.g., "lower load today") over progression rules.
    7. Respect user settings:
       - If weight progression is OFF, keep weight the same as last recorded session.
    ```
    
    Inputs injected into prompt
    
    ```json
    {
      "recommended_exercise": {
        "id": "bb_bench_press",
        "name": "Barbell Bench Press",
        "muscles_used": ["chest","triceps","shoulders"],
        "movement_pattern": "push_horizontal"
      },
      "exercise_history_results": [
        {
          "date": "2025-08-10",
          "sets": 4,
          "reps": [8, 8, 6, 6],
          "load_kg_each": [80, 80, 85, 85],
          "rpe": [7, 7, 8, 9]
        },
        {
          "date": "2025-07-28",
          "sets": 3,
          "reps": [10, 9, 8],
          "load_kg_each": [75, 75, 75],
          "rpe": [6, 7, 8]
        }
      ],
      //or this if exercise history is not available
      "related_exercise_history": [
        {
          "exercise": "Dumbbell Bench Press",
          "sets": 3,
          "reps": [12, 10, 10],
          "load_kg_each": [30, 32, 32],
          "date": "2025-07-05"
        }
      ],
      "user_profile": {
        "sex": "male",
        "weight_kg": 76,
        "experience_level": "intermediate",
        "preferences": ["lower load today"],
        "progression_enabled": true
      }
    }
    ```
    
    Output format
    
    ```json
    {
      "exercise_id": "bb_bench_press",
      "exercise_name": "Barbell Bench Press",
      "sets": 4,
      "reps": [8, 8, 8, 8],
      "load_kg_each": [82.5, 82.5, 82.5, 82.5],
      "reasoning": "Progressed from last session at 80–85 kg with consistent reps. Applied small increase while respecting preference to keep load moderate."
    }
    ```
    

**Hybrid search exercise history**

High Level:

1. Take recommended exercise name and do a search of user’s exercise history
2. rank results
3. Feed back into LLM and ask to generate exercise weights and reps. 
    1. Give rules: if user has done multiple of this exercise at same weight, increase by a safe amount. If user has not done this exercise in a long time, decrease weight. 
4. If no past history of this exact exercise, run a related-exercise search that finds exercise by movement pattern, muscles used, etc. and feed into LLM and ask to generate weights and reps
5. If no related exercises, keep initial recommended weights.

[User can turn off weight progression in settings. If off, AI will simply keep weight the same as the last time this exercise was done. if no history, will auto generate based on user data.]

POST /recommend/weights
body: { user_id, target_exercise, user_overrides }

1. normalize target: name_key, pattern/muscles/equipment (from LLM or heuristic)
2. fetch history windows (last 120 days) with three queries:
A exact, B feature-constrained fuzzy, C optional vector
3. rank and take top K
4. compute progression band (deterministic)?? Maybe 
5. call LLM with compact payload (or apply band directly)
6. return JSON { sets, reps[], load_kg_each[], reasoning, trace: {picked_from: 'exact'|'related', top_names: [...]} }

Postgress implementation

```sql
WITH q AS (
  SELECT
    el.*,
    similarity(el.name_key, $2) AS sim,
    (CASE WHEN el.movement_pattern = $3 THEN 1 ELSE 0 END) +
    (CASE WHEN el.primary_muscles && $4::text[] THEN 1 ELSE 0 END) +
    (CASE WHEN el.equipment && $5::text[] THEN 1 ELSE 0 END) AS feat_hits,
    EXTRACT(EPOCH FROM (now() - el.date))/86400.0 AS days_since
  FROM exercise_logs el
  WHERE el.user_id = $1
    AND (el.name_key = $2 OR el.name_key % $2 OR el.movement_pattern = $3
         OR el.primary_muscles && $4::text[] OR el.equipment && $5::text[])
)
SELECT *,
  (0.45*sim
   + 0.20*(feat_hits/3.0)
   + 0.20*exp(-GREATEST(days_since,0)/21.0)
   + 0.15*CASE WHEN (rpe IS NOT NULL OR volume_kg IS NOT NULL OR one_rm_est IS NOT NULL) THEN 1 ELSE 0.5 END
  ) AS rank_score
FROM q
ORDER BY rank_score DESC, date DESC
LIMIT 12;
```

---

# Future features

### Setting specific goals

a user can write a goal that they have in natural language. 

A plan can be created by AI and approved by the user. That plan can be given to the LLM recommendation engine to guide which exercises to recommend. 

For example, “I want to run a 5k in 6 months”

AI can generate a plan for the next 6 months, with specific and practical exercises to recommend each week or each month. Those specific instructions can be added to the prompt at specific time intervals. 

So week one could say “recommend short runs of distance half a mile”

Week 6 could be “recommend runs at 3 miles”. 

Each practical instruction will get added at specific time intervals.

“I want to lose 20 pounds in 1 year” 

Maybe this is only for self-guided mode. Although it could work in ultra guided mode because it will simply add the instructions into the prompt. 

---

User can choose between ultra guided personal trainer mode and self-guided mode. 

### Ultra guided personal trainer mode

User only inputs stats and goals and preferences. 

The app automatically generates user exercise whenever they open the app. No workout plans. No schedule. Just open and go.

> Ultra-Guided Personal Trainer Mode
> 
> 
> In this mode the user doesn’t need to plan or schedule anything. Each time they open the app, it instantly generates the best next workout or exercise session based on their stats, goals, workout history, available equipment, and current preferences (like time, location, or aches/pains). The user simply taps “Start” and follows along. They can make quick adjustments, such as swapping an exercise, shortening the session, or telling the app about a limitation (“no knee stress today”), and the system immediately adapts. There is no long-term program to follow—the experience is fluid, reactive, and designed for people who just want to be told exactly what to do right now.
> 

 

### Self guided mode

User works with AI to develop a workout plan. It is set and persistent. All the ai does is recommend progression or adjust the workout based on temporary preferences or new permanent preferences. 

> Self-Guided Mode
> 
> 
> In this mode the user works with the AI to build a persistent workout plan or block (e.g., a 6-week 3-day split). The plan is stored and followed over time, giving the user structure and consistency while still allowing the AI to handle load progression, weekly adjustments, and smart substitutions when needed. The user can edit the plan, swap exercises, or reorder sessions, but the overall program remains intact. The app tracks adherence and progress across the block, highlights trends, and proposes refinements for the next cycle. This mode is for users who want to feel in control of a long-term plan while still benefiting from AI-driven guidance and progression.
> 

I am imagining the user can go into an interface where they can create a custom schedule. So that would look like picking a weekly schedule and writing a description for what kind of exercises they want to do on that day. 

They can also choose a 3 day split, or 5 day split, and set what each day is. 

Basically they can literally write whatever they want for that day. A day could be: “A 60 minute exercise focused on glutes and hamstrings, doing drop sets using gym leg equiptment” or “A HIIT training at a track, doing a mix of sprints and calistenics”.

Whatever they want, they can set and schedule. A VERY simple calender interface can show them what they have planned, and when they open the app, they will see exercises that match their description.

They can also pick from presets, like “3 day full body split” or “Peter Atia” well rounded. We can make a marketplace where people can design exercise plans and share them. 

I am building the infrastructure for people to tell an AI personal trainer what to do.

## Personalization layer

Runs after each exercise logged:

<aside>

Calculate user work out history and guide recommendation engine to better recommend exercise

- Calculate past exercises and update bias signals to match weights of category goals and muscles
</aside>

Runs periodically:

<aside>

analyze work out history and generate recommendation instructions to feed into prompt. 

- user has been doing a lot of high weighted exercise, recommend a bit lower weight until 09/09/2025 (3 days from now).
</aside>

## User command interface

## Orchestration agent

This is the first stop that user’s commands / requests arrive at. This part of the backend parses the request, and calls the appropriate actions (tools).

High level overview:

1. user speaks to app or types out command
2. Text is transcribed (locally) and sent to API
3. “agent” receives transcription of user request and processes it: this means that the request is passed to an LLM along with available tools to call
4. LLM responds with either a text response to the user without calling any tools, which is sent back directly, or calls a tool, or multiple tools if needed.
5. Tools are called and actions are performed. Responses from tools are passed back to LLM, which processes that data, and sends back a text response, or calls another tool. 

Tools:

1. Request exercises (”Give me 5 exercises to work on my glutes”)
2. Log exercise (”I just did 5 pushups”)
3. Start timer/interval (”Set an interval for 5 seconds, followed by 2 seconds, followed by 3 seconds, for 10 rounds”)
4. Parse preference (”I don’t like burpees”, “Give me HIIT exercises today”)
5. Adjust current exercise (”Change last set to 10 reps instead of 15”).
6. Answer question (”How to do a squat”, “my knee is hurting from squats, should I stop?”)

We will use the Vercel AI-sdk for this.

### Add preference

User can tell the PT a preference that they have. The preference can be permanent, and will always be provided to the LLM recommending exercises until the user deletes it. Other preferences are temporary and have an expiration date. 

Some examples:

- I don’t like burpees (P)
- I want to do HIIT exercise now (T; expires at end of session)
- I am feeling tired today (T)
- My knees is hurting recently (T)
- I have a bad back (P)
- For the next 2 weeks I want to recovery exercises for my shoulder surgery (T)

## Timers

Auto generates timers for current workout. Also can generate specific timers for upon user request. 

Example:

- A timer that is 5 seconds, then 2 seconds, then 4 seconds, for 10 times.
- Set a 60 seconds timer

### How to do exercise info

A box for info on how to do Current exercise shows up automatically or there is a ! With a circle button that users can easily click to see. Or user can voice ask, how do I do this exercise. 

### Voice control commands

- Start / pause workout
- Skip exercise

## Sessions

intuitive, behind the scenes session creation. A session is started when a user indicates that they are starting exercise. That could be a voice or text command, a timer, or a logged exercise. 

# **Recommended MVP approach**

# **Data model**

- sessions
    - id, user_id
    - mode (ultra_guided | self_guided | freeform)
    - start_at, end_at (nullable until closed)
    - location_id (optional), notes (optional)
    - perceived_effort (1–10, optional), tags (array: "run", "push_day", etc.)
- exercise_logs
    - add session_id (nullable for legacy logs)

# **When a session starts**

Start a session the first time one of these happens:

1. User logs the first exercise of the day (voice or tap), or
2. The app begins a guided block (timer/interval started).
3. Any voice request is made

Implementation: on first qualifying event, create sessions row; attach session_id to all subsequent logs.

# **When a session ends**

Close the current session when any of these are true:

- Inactivity gap: no logs or timers for ≥ 20 minutes (configurable).
- Explicit end: user taps “End workout.”

If the user returns within 1 hour  after an auto-close, offer a lightweight toast: “Resume last session?” If accepted, re-open (adjust end_at); else start a new one.

# **How to decide if a log belongs to an existing session vs a new one**

Rule-of-thumb algorithm (server-side):

getOpenSession(user):

s = latest session where end_at IS NULL

if s exists: return s

// else no open session

s = latest session where now() - end_at <= RESUME_WINDOW (e.g., 10 min)

if s exists and now() - last_log_time(s) <= RESUME_WINDOW: return s

return null

attachLog(user, log):

s = getOpenSession(user)

if s is null:

// Look-back: if no session in last 20 min → new

if last_log_time(user) and now() - last_log_time(user) < INACTIVITY_GAP:

// merge case—rare; start new anyway for simplicity in MVP

s = createSession(user, start_at=now())

log.session_id = s.id

upsert log

// heartbeat: update s.end_at = null (still open)

Background job (every few minutes):

- Find sessions with last activity ≥ INACTIVITY_GAP and end_at IS NULL → set end_at = last_activity_at.

# **Edge cases to cover**

- Multiple micro-sessions same day: the gap rule will naturally split them.
- Accidental long gap mid-workout (phone call, commute): the resume toast fixes UX.
- Timers running without new logs: treat active timers as activity.
- Manual edits: allow moving a log to another session (long-press → “Move to…”).
- Delete/undo: if removing the only log in an open session, auto-delete that session.
- Free run / cardio-only: starting a run timer creates/attaches a session even if no rep-based logs yet.

# **Config knobs (sane defaults)**

- INACTIVITY_GAP_MIN = 20
- RESUME_WINDOW_MIN = 10
- HARD_ROLLOVER_HOUR = 3
Expose in server config; let power users tweak later in Settings.

# **Bonus (nice-to-have, not required for MVP)**

- Session labels (auto): infer "push", "pull", "legs", "zone2" from exercise mix.
- Session summary: upon close, write a compact rollup row (total_volume, duration_min, hr_avg if available, category_mix, muscle_mix).
- Merging UI: if two sessions within 30 min and same location, offer “Merge?” in history.

# Structure of app

## Front end

## Pages

### Home page

Very clean and simple. Button on top left to open profile page and button on top left that has a ! In it that opens info page. 

An orb that represents the PT and indicates when listening and thinking. This is in the top right. 

<aside>
🔇

A button on bottom right to adjust response format (vibrate, tone, voice once implemented in later version).

</aside>

<aside>
📍

**Current** **location** is displayed in small text in a box on the top middle. Tapping on this open location page.

</aside>

<aside>
🏋️

**Current** **exercise** is displayed in a box in the middle and timers are also displayed in the middle. 

Instructions and pictures of how to do an exercise will also be displayed in the middle when needed. 

Next and previous exercises can be scrolled through and are above and below current exercise, kind of faded and smaller. 

if you change reps/loads, a tiny in‑set editor appears; otherwise default logs as prescribed

Why this (tap to expand) feature can be displayed in small text under the exercise: “Under target for Zone 2 this week (+0.28 bias). Last trained glutes 4 days ago.” Add the above feature where it explains the logic as to why it chose this exercise so user can see where it’s coming from. It could be based on an outdated preference that they would want to adjust or cancel. 

</aside>

RPE can be easily captured with voice (”Hey FitBot, RPE 8 on that last / this exercise”), or with a easy scrollable number box (1-10). This data is stored in exercise.

Also can have some pills at the bottom that are auto generated based on context and that user can easily click to do that action. For example, “too heavy” pill would decrease weights. Or “swap exercise” would find something else. 

 

<aside>
⌨️

Bottom middle has a floating text box that when tapped expands horizontally. 

</aside>

### Info page

Can see goals, muscle goals, current active preferences, preview of exercise history with button to open exercise timeline. 

You can adjust the above on this page.

User can open category goal setter page from here. 

User can open muscle goal setter page from here. 

### Profile page

This contains personal data, settings, and misc. 

- List of settings
    - Auto-weight-progression: on/off, when on, AI will progress weights on its own at a healthy and safe pace. When off, weights will on progress when user prompts for weight increase / decrease. Otherwise, exercise will load with previous weight.
    - 

### Category goal setter page

The user can go in here and write their exercise category goals. They can add, remove goals, and adjust the weights. They can also select from presets. 

### Muscle goal setter page

Users can set and change the weights for muscles that they want to target. 

### Locations page

This page display different locations that the user has saved. They are auto-selected based on GPS data, meaning when the user opens the app it check where the user is and sets the location accordingly. User can turn off GPS location auto-selecting from here.

The user can manually select the location. 

Locations have different data, like a description of the space to feed into the AI. 

Also available equipment. This is a list of equipment that the user has access to. 

I am imagining that the user can select equipment from a list of common equipment, being as specific as the specific weights of dumb bells or kettle bells they have.

The user can also tap a speaker button and verbally tell the app what equipment they have. 

[FUTURE FEATURE: Or even take pictures of the equipment and AI will extract and list].

## Functionality

### Auth

- [x]  User register
- [x]  User login and sessions, accessing log-in only pages.

### voice transcription

User speech is transcribed and fed into LLM orchestrator. 

Transcription is done locally.

To limit cost, App only listens to user after trigger is said (“hey Fitbot”)

If possible to run local model for parsing and orchestration, that may be ideal. But otherwise we’ll have to send it to api. 

A TTS model that can read responses from API to user with voice, if voice setting is currently active. 

App should be able to listen even if screen is off. 

- [ ]  Find and setup local transcription model
- [ ]  Find a text to speech model for responses

## Database

Exercise data model

```json
{
  "exercise_name": "Barbell Bench Press",
  "aliases": ["bb_bench_press"],
  "duration_min": 0,
  "performed_at": "timestampz",
  
  //ONE OF THE FOLLOWING EXERCISE STRUCTURES
  // 1. For rep-based exercises
  "reps": [8, 8, 6, 6],
  "load_kg_each": [80, 80, 85, 85],
  
  // 2. For Runs
  "distance_km": 0, 
  
  // 3. For interval exercises like HIIT
  "intervals": [ 
	  {"work_sec": 30}, {"rest_sec": 60}
  ]
  "rounds": 10,
  
  
  "muscles_utilized": [
    { "muscle": "chest", "share": 0.5 },
    { "muscle": "triceps", "share": 0.3 },
    { "muscle": "shoulders", "share": 0.2 }
  ],
  
  "goals_addressed": [
    { "goal": "Strength", "share": 0.8 },
    { "goal": "Muscle Building", "share": 0.2 }
  ],
  "reasoning": "Recommended because chest and triceps are under target this week (+0.2 bias). Progressed safely from last session at 75–80kg.",
	"equiptment": ["barbell", "bench"],
	"RPE": 5,
	//Optional for better search matching: exact match or related exercises
	"movement_pattern": [
			"squat",        // knee-dominant lower body
			"hinge",        // hip-dominant lower body
			"push",         // horizontal + vertical push
			"pull",         // horizontal + vertical pull
			"carry",        // loaded carries, farmer walks
			"rotation_core",// rotation + anti-rotation + stability
			"isolation",    // single-joint accessory (curls, raises, calf raises)
			"conditioning"  // steady-state cardio + intervals
	],
	"exercise_description": "",
	"body_region": "upper",
	"search_string": "" //concatination of importa
	"embedding": "",
	"name_key_normalized": "",

}
```

- Backend propose file structure
    
    ```json
    **aipt-backend/
    ├─ package.json
    ├─ .env                      # SUPABASE_URL, DB_URL, OPENAI_API_KEY, etc.
    ├─ src/
    │  ├─ server.js              # bootstraps HTTP server
    │  ├─ app.js                 # express app wiring (routes/middleware)
    │  ├─ config/
    │  │  ├─ env.js              # loads & validates env vars
    │  │  ├─ db.js               # pg Pool; exports query()
    │  │  └─ supabaseAuth.js     # JWKS verifier (jose) for Supabase JWTs
    │  ├─ middleware/
    │  │  ├─ auth.js             # requireAuth middleware (uses supabaseAuth.js)
    │  │  ├─ errorHandler.js     # central error handler
    │  │  └─ requestLogger.js    # tiny req log (morgan/winston optional)
    │  ├─ routes/
    │  │  ├─ index.js            # mounts all route modules
    │  │  ├─ health.routes.js    # /health
    │  │  ├─ auth.routes.js      # (optional) token introspection, session debug
    │  │  ├─ user.routes.js      # CRUD profile/body stats/goals
    │  │  ├─ plan.routes.js      # self-guided plans (create/update/fetch)
    │  │  ├─ recommend.routes.js # ultra-guided “next exercise now”
    │  │  ├─ prefs.routes.js     # current/permanent preferences endpoints
    │  │  ├─ timers.routes.js    # generate timers / start/stop timers
    │  │  └─ analytics.routes.js # NL→SQL queries and canned analytics
    │  ├─ controllers/
    │  │  ├─ user.controller.js
    │  │  ├─ plan.controller.js
    │  │  ├─ recommend.controller.js
    │  │  ├─ prefs.controller.js
    │  │  ├─ timers.controller.js
    │  │  └─ analytics.controller.js
    │  ├─ services/
    │  │  ├─ user.service.js     # reads/writes Postgres
    │  │  ├─ plan.service.js     # persistent plans (blocks), sessions
    │  │  ├─ recommend.service.js# composes LLM + scoring + constraints
    │  │  ├─ prefs.service.js    # permanent/current prefs, TTL cleanup
    │  │  ├─ timers.service.js   # timer JSON generation + storage
    │  │  └─ analytics.service.js# NL→SQL, guardrails, canned stats
    │  ├─ ai/
    │  │  ├─ orchestrator.js     # “agent” that decides which tool(s) to call
    │  │  ├─ tools/
    │  │  │  ├─ parsePrefs.tool.js     # parses user NL → condition/preference JSON
    │  │  │  ├─ genExercise.tool.js    # returns 1..N exercise JSON (prompted)
    │  │  │  ├─ genTimer.tool.js       # from exercise or free-form query
    │  │  │  └─ classifyCategory.tool.js # tag exercise into user categories
    │  │  ├─ prompts/
    │  │  │  ├─ system.txt
    │  │  │  ├─ gen_exercise.txt
    │  │  │  ├─ parse_prefs.txt
    │  │  │  └─ gen_timer.txt
    │  │  └─ llmClient.js        # thin wrapper for OpenAI/Anthropic etc.
    │  ├─ analytics/
    │  │  ├─ nl2sql/
    │  │  │  ├─ translator.js    # LLM → SQL with allowlisted templates
    │  │  │  └─ templates/       # vetted SQL templates/snippets
    │  │  └─ queries/            # canned reports (weekly mix, muscle heatmap)
    │  ├─ models/                # SQL strings or query builders (if not using ORM)
    │  │  ├─ user.model.js
    │  │  ├─ sessions.model.js
    │  │  ├─ exercises.model.js
    │  │  ├─ goals.model.js
    │  │  └─ catalogs.model.js
    │  ├─ utils/
    │  │  ├─ validators.js       # zod/yup JOI, id guards, payload validation
    │  │  ├─ scoring.js          # muscle-score & category bias math
    │  │  └─ time.js             # date windows, ISO helpers
    │  ├─ jobs/
    │  │  └─ rollups.job.js      # daily rollup for activity maps (cron)
    │  └─ tests/                 # supertest/jest for handlers/services
    └─ README.md**
    ```



<!-- # AI Personal Trainer Backend API

A simple Express.js API server for the AI Personal Trainer application.

## Features

- 🚀 Express.js server with modern middleware
- 🔒 Security headers with Helmet
- 🌐 CORS enabled for cross-origin requests
- 📝 Request logging
- 🏥 Health check endpoint
- 🎯 Basic API structure for users and workouts
- ⚡ Error handling and 404 responses

## Quick Start

### Install Dependencies
```bash
npm install
```

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port 3000 (or the PORT environment variable if set).

## API Endpoints

### Health Check
- **GET** `/health` - Server health status

### Root
- **GET** `/` - API information and available endpoints

### Users
- **GET** `/api/users` - Get users (placeholder)

### Workouts
- **GET** `/api/workouts` - Get workouts (placeholder)

## Environment Variables

- `PORT` - Server port (default: 3000)

## Project Structure

```
BACKEND/
├── index.js          # Main server file
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

## Next Steps

1. Add database connection (Supabase is already configured)
2. Implement user authentication
3. Add workout management endpoints
4. Set up proper data models
5. Add validation middleware
6. Implement rate limiting

## Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (to be implemented) -->
