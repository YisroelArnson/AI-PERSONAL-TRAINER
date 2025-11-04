# Example Prompt Output - What the AI Actually Sees

## Overview
This document shows actual examples of what the formatted user data looks like when sent to the AI model.

---

## Example 1: Intermediate User - Chest/Back Focus

### System Prompt (sent to AI)
```
You are an elite AI personal trainer specializing in exercise programming and progressive overload. Your recommendations must be scientifically sound, highly personalized, and optimally timed.

CORE PRINCIPLES:
1. PERSONALIZATION: Every recommendation must align with the user's specific goals, with exercise selection heavily influenced by their category and muscle group priorities
2. PROGRESSION: Apply conservative progressive overload (5-10% increases) only when the user has successfully completed previous sessions
3. RECOVERY: Respect muscle recovery by analyzing the last 7 days of training history
4. MOVEMENT PATTERNS: Use similar exercises within movement patterns to inform weight recommendations
5. EXERCISE SELECTION: Choose exercises that match the user's goals - prioritize compound movements for strength goals, include isolation for hypertrophy goals
6. REP RANGES: Apply goal-appropriate rep ranges - Strength (1-5), Hypertrophy (6-12), Endurance (12+), with mixed ranges for different exercise types

STRICT REQUIREMENTS:
- ONLY recommend exercises with available equipment - no substitutions or alternatives
- Generate EXACTLY the requested number of exercises
- Ensure muscles_utilized shares sum to 1.0
- Use ONLY the categories and muscles from the user's profile
- Respect ALL temporary preferences as absolute overrides
- Choose appropriate exercise_type for each exercise (strength, cardio_distance, cardio_time, hiit, circuit, flexibility, yoga, bodyweight, isometric, balance, sport_specific)
```

### User Prompt (sent to AI)
```
USER PROFILE:
BODY STATS: 28-year-old male, 180cm, 75kg, 15% body fat

TOP CATEGORY GOALS (by priority score): Muscle Building (score: 8.0), Strength (score: 7.0)
TOP MUSCLE TARGETS (by priority score): Chest (score: 4.0), Back (score: 3.5), Shoulders (score: 2.5), Arms (score: 2.0)

PRIMARY GOALS: Muscle Building (0.8), Strength (0.7)
SECONDARY GOALS: Athletic Performance (0.4)

HIGH PRIORITY MUSCLES: Chest (0.8), Back (0.7)
MEDIUM PRIORITY MUSCLES: Shoulders (0.5), Arms (0.4)
LOW PRIORITY MUSCLES: Legs (0.2)

LOCATION: Home Gym with equipment: Barbell (Free Weights): 5kg, 10kg, 15kg, 20kg, Dumbbells (Free Weights): 5kg, 10kg, 15kg, 20kg, 25kg, 30kg, Bench (Bench), Pull-up Bar (Pull-up Bar), Yoga Mat (Fitness Accessory)

MOVEMENT PATTERN ANALYSIS (Last 7 Days):
  - PUSH: Bench Press (80.0kg, volume: 1920kg, 2 days ago); Overhead Press (50.0kg, volume: 1050kg, 4 days ago); Incline Dumbbell Press (32.5kg, volume: 1560kg, 5 days ago)
  - PULL: Bent-Over Row (70.0kg, volume: 1680kg, 2 days ago); Pull-ups (bodyweight, 3 days ago); Lat Pulldown (60.0kg, volume: 1440kg, 5 days ago)
  - HINGE: Deadlift (120.0kg, volume: 1800kg, 4 days ago); Romanian Deadlift (80.0kg, volume: 960kg, 6 days ago)
  - ISOLATION: Bicep Curls (15.0kg, volume: 360kg, 3 days ago); Tricep Extensions (12.0kg, volume: 288kg, 3 days ago)

RECOVERY STATUS:
  READY: Chest (volume: 3480kg), Triceps (volume: 1248kg), Back (volume: 3120kg), Lats (volume: 1440kg), Biceps (volume: 360kg), Shoulders (volume: 1575kg)
  RECOVERING: Legs (20h remaining), Glutes (20h remaining), Hamstrings (20h remaining)

FREQUENT EXERCISES (consider variation): Bench Press (4x), Pull-ups (3x)

RECENT WORKOUT HISTORY (for progression):
  - Bench Press: 3 sets, 8,8,7 reps, 80kg (2 days ago)
  - Bent-Over Row: 3 sets, 8,8,8 reps, 70kg (2 days ago)
  - Pull-ups: 3 sets, 10,9,8 reps (3 days ago)
  - Bicep Curls: 3 sets, 12,12,10 reps, 15kg (3 days ago)
  - Tricep Extensions: 3 sets, 12,12,10 reps, 12kg (3 days ago)
  - Deadlift: 3 sets, 5,5,5 reps, 120kg (4 days ago)
  - Overhead Press: 3 sets, 8,7,6 reps, 50kg (4 days ago)
  - Incline Dumbbell Press: 3 sets, 10,9,8 reps, 32.5kg (5 days ago)
  - Lat Pulldown: 3 sets, 10,10,9 reps, 60kg (5 days ago)
  - Romanian Deadlift: 3 sets, 10,10,8 reps, 80kg (6 days ago)

EXERCISE RECOMMENDATION PROCESS:

1. ANALYZE GOALS
   - Calculate priority scores: (category_weight × 10) + (muscle_weight × 5)
   - Identify top 3 categories and top 5 muscles by priority score
   - Ensure 70% of exercises directly address high-priority goals

2. ASSESS RECENT TRAINING (Last 7 Days)
   - Map each completed exercise to its movement patterns
   - Calculate volume load per muscle group
   - Identify muscles ready for training (48+ hours recovery for large muscles, 24+ hours for small muscles)
   - Flag any exercises performed 3+ times (consider variation)

3. MOVEMENT PATTERN ANALYSIS
   For weight recommendations:
   - Group exercises by pattern: squat, hinge, push, pull, carry, rotation_core, isolation, conditioning, plyometric, balance, flexibility, yoga
   - Find the 3 most recent similar exercises in the same movement pattern
   - Calculate average working weight and performance trend
   - Apply progression logic based on pattern performance

4. EXERCISE SELECTION CRITERIA
   Priority order:
   a) Addresses highest-priority goals (category and muscle weights)
   b) Targets recovered muscles (check last 7 days)
   c) Matches available equipment exactly (strict - no substitutions)
   d) Provides movement pattern variety across the session
   e) Hasn't been performed in last 2 sessions (unless specifically requested)

5. LOAD AND REP ASSIGNMENT
   - For familiar exercises: Use last performance + 5-10% if completed successfully
   - For new exercises in familiar patterns: Use movement pattern data from similar exercises
   - For unfamiliar patterns: Start conservative (bodyweight or 40-50% estimated capacity based on user stats)
   - Apply rep ranges based on primary goal and exercise type
   - Include rest periods: Heavy (3-5 min), Moderate (90-120s), Light (60-90s)

6. FINAL VALIDATION
   - Verify total volume is appropriate for user's experience level
   - Ensure balanced muscle group distribution across the session
   - Confirm exercise order follows: compound → accessory → isolation
   - Add clear reasoning for each selection (1-2 sentences max explaining goal alignment and progression)

DECISION HIERARCHY (most important first):
1. TEMPORARY PREFERENCES - Override everything else (session-specific needs with expiration or one-time use)
2. EXPLICIT REQUESTS - Any specific request in the current interaction
3. PERMANENT PREFERENCES - Long-term restrictions and preferences (no expiration)
4. GOALS & MUSCLES - Priority based on weights (higher weight = higher priority)
5. WORKOUT HISTORY - Use for progression, recovery assessment, and variety

Generate exactly 6 exercises.
```

### Expected AI Response
The AI would generate exercises like:

1. **Weighted Pull-ups** (compound pull - variation from frequent bodyweight pull-ups)
   - 3 sets, 8-6 reps, 5-10kg added weight
   - Targets: Back (0.6), Lats (0.25), Biceps (0.15)
   - Reasoning: "High-priority back (score: 3.5) fully recovered. Variation from frequent bodyweight pull-ups with added weight for progressive overload."

2. **Dumbbell Bench Press** (compound push - variation from frequent barbell bench)
   - 3 sets, 8-8-6 reps, 35kg each
   - Targets: Chest (0.7), Triceps (0.2), Shoulders (0.1)
   - Reasoning: "Top-priority chest (score: 4.0) fully recovered. Dumbbell variation from frequent barbell bench, 5% progression from 80kg barbell equivalent."

3. **Single-Arm Dumbbell Row** (pull accessory)
   - 3 sets, 10-10-9 reps, 30kg
   - Targets: Back (0.5), Lats (0.3), Biceps (0.2)
   - Reasoning: "Continues high-priority back emphasis with unilateral movement for balance. Progressive overload from 70kg bent-over row."

4. **Dumbbell Shoulder Press** (push accessory)
   - 3 sets, 8-7-6 reps, 25kg each
   - Targets: Shoulders (0.7), Triceps (0.2), Upper Chest (0.1)
   - Reasoning: "Medium-priority shoulders (score: 2.5) recovered. Progression from 50kg overhead press performance."

5. **Chest Flyes** (isolation - push variety)
   - 3 sets, 12-12-10 reps, 15kg each
   - Targets: Chest (0.85), Shoulders (0.15)
   - Reasoning: "Isolation for top-priority chest after compound work. Hypertrophy rep range for muscle building goal."

6. **Face Pulls** (isolation - pull for shoulder health)
   - 3 sets, 15-15-12 reps, 10kg
   - Targets: Rear Delts (0.6), Upper Back (0.3), Shoulders (0.1)
   - Reasoning: "Balances heavy pressing volume with rear delt work. Supports athletic performance goal with shoulder health focus."

**Order**: Compound pull → Compound push → Accessory pull → Accessory push → Isolation push → Isolation pull (properly ordered)

---

## Example 2: Beginner User - No History

### User Prompt (sent to AI)
```
USER PROFILE:
BODY STATS: 22-year-old female, 165cm, 60kg

TOP CATEGORY GOALS (by priority score): Weight Loss (score: 9.0), General Fitness (score: 5.0)
TOP MUSCLE TARGETS (by priority score): Full Body (score: 3.0)

PRIMARY GOALS: Weight Loss (0.9)
SECONDARY GOALS: General Fitness (0.5)

HIGH PRIORITY MUSCLES: Full Body (0.6)
MEDIUM PRIORITY MUSCLES: Core (0.4), Legs (0.3)

LOCATION: Commercial Gym with equipment: Full range - Barbells, Dumbbells (5-50kg), Cable Machines, Leg Press, Smith Machine, Cardio Equipment, Resistance Bands, Kettlebells

PERMANENT PREFERENCES (always apply):
  - Prefer circuit-style workouts for weight loss efficiency
  - Avoid heavy barbell work due to lack of experience

[No workout history - first session]

[Process rules same as above...]

Generate exactly 5 exercises.
```

### Expected AI Response
1. **Bodyweight Squats** (compound - safe beginner)
   - 3 sets, 15-15-12 reps
   - Targets: Legs (0.6), Glutes (0.3), Core (0.1)
   - Reasoning: "Safe beginner compound for legs. Establishes movement pattern before adding load. Supports weight loss with metabolic demand."

2. **Dumbbell Romanian Deadlift** (compound hinge - light)
   - 3 sets, 12-12-10 reps, 8kg each
   - Targets: Hamstrings (0.5), Glutes (0.3), Lower Back (0.2)
   - Reasoning: "Conservative 40% capacity start for hinge pattern. Full body engagement supports weight loss goal."

3. **Push-ups** (compound push - bodyweight)
   - 3 sets, 10-8-6 reps (or knee push-ups)
   - Targets: Chest (0.5), Triceps (0.3), Shoulders (0.2)
   - Reasoning: "Bodyweight compound for upper body strength foundation. Scalable difficulty respects beginner status."

4. **Dumbbell Rows** (compound pull)
   - 3 sets, 12-12-10 reps, 8kg each
   - Targets: Back (0.6), Biceps (0.25), Rear Delts (0.15)
   - Reasoning: "Establishes pull pattern with conservative load. Balances push movements for general fitness."

5. **Plank Hold** (isometric core)
   - 3 sets, 30-25-20 seconds
   - Targets: Core (0.7), Shoulders (0.2), Glutes (0.1)
   - Reasoning: "Core stability foundation. Safe for beginners and supports overall strength development."

**Order**: Legs → Posterior chain → Push → Pull → Core (logical beginner progression)

---

## Example 3: Advanced User with Temporary Preference

### User Prompt (sent to AI)
```
USER PROFILE:
BODY STATS: 35-year-old male, 175cm, 82kg, 12% body fat

TOP CATEGORY GOALS (by priority score): Strength (score: 9.0), Powerlifting (score: 8.0)
TOP MUSCLE TARGETS (by priority score): Legs (score: 4.5), Back (score: 4.0), Chest (score: 3.5)

PRIMARY GOALS: Strength (0.9), Powerlifting (0.8)
SECONDARY GOALS: Muscle Building (0.5)

HIGH PRIORITY MUSCLES: Legs (0.9), Back (0.8), Chest (0.7)

LOCATION: Powerlifting Gym with equipment: Competition Barbells, Power Rack, Calibrated Plates (1.25kg-25kg), Specialty Bars (Safety Bar, Swiss Bar), Chains, Bands, GHD, Reverse Hyper

TEMPORARY PREFERENCES (override all other goals - will expire or be deleted):
  - Deload week - reduce weight by 30% and volume by 40% [expires: in 4 days]

MOVEMENT PATTERN ANALYSIS (Last 7 Days):
  - SQUAT: Back Squat (180.0kg, volume: 5400kg, 3 days ago); Pause Squat (160.0kg, volume: 2400kg, 5 days ago)
  - HINGE: Deadlift (220.0kg, volume: 4400kg, 4 days ago); Deficit Deadlift (200.0kg, volume: 2400kg, 6 days ago)
  - PUSH: Bench Press (140.0kg, volume: 4200kg, 2 days ago); Close-Grip Bench (120.0kg, volume: 2880kg, 5 days ago)

RECOVERY STATUS:
  READY: Legs (volume: 7800kg), Back (volume: 6800kg), Chest (volume: 7080kg)
  [All major muscle groups recovered but DELOAD WEEK active]

RECENT WORKOUT HISTORY (for progression):
  [Last 10 workouts showing heavy loads and high volume...]

[Process rules same as above...]

Generate exactly 4 exercises.
```

### Expected AI Response
The AI **must respect** the temporary deload preference:

1. **Back Squat** (deload - compound)
   - 3 sets, 5-5-5 reps, 125kg (30% reduction from 180kg)
   - Rest: 3 minutes
   - Targets: Legs (0.6), Glutes (0.25), Core (0.15)
   - Reasoning: "DELOAD WEEK: 30% load reduction from 180kg working weight, 40% volume reduction (3 sets vs 5 sets). Maintains movement pattern quality while recovering."

2. **Bench Press** (deload - compound)
   - 2 sets, 5-5 reps, 100kg (30% reduction from 140kg)
   - Rest: 3 minutes
   - Targets: Chest (0.6), Triceps (0.25), Shoulders (0.15)
   - Reasoning: "DELOAD WEEK: Reduced to 100kg (from 140kg) and 2 sets. Prioritizes recovery while maintaining technique for powerlifting."

3. **Romanian Deadlift** (deload - hinge accessory)
   - 2 sets, 8-8 reps, 100kg (lighter than normal 220kg deadlifts)
   - Rest: 2 minutes
   - Targets: Hamstrings (0.5), Glutes (0.3), Lower Back (0.2)
   - Reasoning: "DELOAD WEEK: Light accessory work for posterior chain. Maintains hinge pattern without heavy loading stress."

4. **Band Pull-Aparts** (recovery/mobility)
   - 3 sets, 20-20-20 reps, light band
   - Rest: 60 seconds
   - Targets: Rear Delts (0.6), Upper Back (0.3), Shoulders (0.1)
   - Reasoning: "DELOAD WEEK: High-rep recovery work for shoulder health. Supports powerlifting longevity without adding training stress."

**Order**: Squat → Bench → Hinge → Upper back mobility (deload-appropriate progression)

**Key**: Even though user's goals are strength/powerlifting with high priority, the TEMPORARY PREFERENCE for deload **overrides everything**, and the AI reduces weight/volume exactly as requested.

---

## Example 4: User with Equipment Limitations

### User Prompt (sent to AI)
```
USER PROFILE:
BODY STATS: 30-year-old female, 170cm, 68kg

TOP CATEGORY GOALS (by priority score): Muscle Building (score: 7.0), Athletic Performance (score: 6.0)
TOP MUSCLE TARGETS (by priority score): Glutes (score: 4.5), Legs (score: 3.5), Back (score: 3.0)

PRIMARY GOALS: Muscle Building (0.7), Athletic Performance (0.6)
SECONDARY GOALS: Strength (0.4)

HIGH PRIORITY MUSCLES: Glutes (0.9), Legs (0.7), Back (0.6)

LOCATION: Hotel Gym with equipment: Dumbbells (5-20kg only), Treadmill, Stationary Bike, Yoga Mat

PERMANENT PREFERENCES (always apply):
  - Focus on glute development

MOVEMENT PATTERN ANALYSIS (Last 7 Days):
  - SQUAT: Goblet Squat (20.0kg, volume: 600kg, 2 days ago)
  - HINGE: Dumbbell Romanian Deadlift (20.0kg, volume: 480kg, 3 days ago)
  - PUSH: Push-ups (bodyweight, 4 days ago)

RECOVERY STATUS:
  READY: Glutes (volume: 1080kg), Legs (volume: 600kg), Back (volume: 240kg), Chest (volume: 0kg)

[Process rules same as above...]

Generate exactly 5 exercises.
```

### Expected AI Response
AI must work with **only 5-20kg dumbbells**:

1. **Single-Leg Romanian Deadlift** (compound hinge - unilateral)
   - 3 sets, 10-10-8 reps each leg, 20kg
   - Targets: Glutes (0.5), Hamstrings (0.35), Core (0.15)
   - Reasoning: "Top-priority glutes (score: 4.5) with unilateral work to maximize difficulty despite limited weight. Progressive overload through instability and tempo."

2. **Bulgarian Split Squats** (compound squat - unilateral)
   - 3 sets, 12-10-8 reps each leg, 20kg
   - Targets: Glutes (0.45), Quads (0.35), Core (0.2)
   - Reasoning: "Glute emphasis with equipment limitations. Single-leg maximizes load demand with available 20kg dumbbells. Athletic performance carryover."

3. **Dumbbell Sumo Deadlift** (hinge - glute focus)
   - 4 sets, 15-12-10-8 reps, 20kg
   - Targets: Glutes (0.6), Adductors (0.25), Hamstrings (0.15)
   - Reasoning: "Sumo stance emphasizes glutes. High-rep progression compensates for light weight. Addresses primary glute focus goal."

4. **Single-Arm Dumbbell Row** (pull)
   - 3 sets, 12-12-10 reps each arm, 20kg
   - Targets: Back (0.6), Lats (0.25), Biceps (0.15)
   - Reasoning: "High-priority back work within equipment constraints. Unilateral for maximum overload with 20kg limit."

5. **Glute Bridge (Dumbbell Loaded)** (isolation - glute)
   - 4 sets, 20-18-15-12 reps, 20kg on hips
   - Targets: Glutes (0.85), Hamstrings (0.15)
   - Reasoning: "Direct glute isolation respecting permanent preference. High-rep compensates for limited weight. Finisher after compound work."

**Order**: Hinge → Squat → Hinge variation → Pull → Isolation (proper sequencing)

**Key**: AI **never suggests** barbells, heavy weights, or cable machines since they're not available. Instead, uses unilateral work, tempo, high reps, and instability to maximize limited equipment.

---

## Key Observations

### 1. Context Richness
The enhanced prompt provides:
- Quantified goal priorities (scores)
- Movement pattern history with volume loads
- Recovery status per muscle group
- Exercise frequency analysis
- Equipment constraints

### 2. AI Decision Quality
With this context, the AI can:
- Calculate appropriate weights from pattern history
- Respect recovery windows
- Provide variation when exercises are too frequent
- Work within strict equipment constraints
- Balance volume appropriately
- Explain every decision transparently

### 3. Prompt Length
- System prompt: ~350 tokens
- Process rules: ~500 tokens
- User data (with history): ~800-1200 tokens
- **Total**: ~1650-2050 tokens per request

This is reasonable for the quality improvement gained.

### 4. Consistency
Every recommendation now includes:
- Exercise name
- Specific sets/reps/weight
- Rest periods
- Muscle breakdown (sums to 1.0)
- Goals addressed
- Movement pattern(s)
- Equipment used
- Detailed reasoning (with score references)

---

## Conclusion

These examples demonstrate how the enhanced prompt system produces **intelligent, contextual, and well-reasoned** exercise recommendations that adapt to:
- User experience level (beginner → advanced)
- Current recovery status
- Equipment availability
- Temporary preferences (deload, injuries, etc.)
- Goal priorities
- Movement pattern history

The AI acts like a knowledgeable coach who **remembers everything** and **explains their reasoning** for every decision.

