# Personalized Weight Recommendation System with Exercise Matching

## Overview

This document outlines the enhanced weight recommendation system that solves the critical exercise naming inconsistency problem while providing accurate, personalized weight recommendations for the AI Personal Trainer app.

## The Core Problem: Exercise Naming Inconsistency

The AI generates exercises with inconsistent naming conventions:
- "Bulgarian Split Squat" vs "Split Squat" vs "Rear Foot Elevated Split Squat"
- "Dumbbell Bicep Curl" vs "Bicep Curl" vs "DB Curl"
- "Barbell Bench Press" vs "Bench Press" vs "BB Press"

This inconsistency makes it impossible to track the same exercise over time, preventing accurate weight predictions and progression tracking.

## Solution: Multi-Layered Exercise Matching System

### 1. Exercise Normalization Engine

#### Canonical Exercise Library
A comprehensive database of standardized exercises with multiple aliases and intelligent matching capabilities.

```sql
CREATE TABLE exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name VARCHAR(255) NOT NULL,     -- "Barbell Back Squat"
  category VARCHAR(100),                     -- "Compound", "Isolation"
  primary_muscle VARCHAR(100),               -- "Quadriceps"
  secondary_muscles JSONB,                   -- ["Glutes", "Hamstrings"]
  equipment_needed JSONB,                    -- ["Barbell", "Squat Rack"]
  movement_pattern VARCHAR(100),             -- "Push", "Pull", "Squat", "Hinge"
  difficulty_level VARCHAR(50),              -- "Beginner", "Intermediate", "Advanced"
  aliases JSONB,                             -- ["Back Squat", "BB Squat", "Squat"]
  strength_standards JSONB,                  -- {beginner: 0.8, intermediate: 1.2, advanced: 1.6}
  muscle_groups JSONB,                       -- {primary: "Quads", secondary: ["Glutes"], stabilizers: ["Core"]}
  mechanics VARCHAR(100),                    -- "Compound", "Isolation"
  force_type VARCHAR(50),                    -- "Push", "Pull", "Static"
  experience_modifier DECIMAL(3,2),          -- Multiplier for weight calculations
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Sample Exercise Library Entries
```json
{
  "canonical_name": "Barbell Back Squat",
  "category": "Compound",
  "primary_muscle": "Quadriceps",
  "secondary_muscles": ["Glutes", "Hamstrings", "Core"],
  "equipment_needed": ["Barbell", "Squat Rack"],
  "movement_pattern": "Squat",
  "difficulty_level": "Intermediate",
  "aliases": ["Back Squat", "BB Squat", "Squat", "Barbell Squat"],
  "strength_standards": {
    "beginner": 0.8,
    "intermediate": 1.2,
    "advanced": 1.6,
    "elite": 2.0
  }
}
```

### 2. Enhanced Database Schema for Exercise Tracking

#### Exercise Performance with Canonical Mapping
```sql
CREATE TABLE exercise_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_user(user_id),
  exercise_library_id UUID REFERENCES exercise_library(id),
  original_exercise_name VARCHAR(255),      -- AI's original name
  canonical_exercise_name VARCHAR(255),     -- Normalized name
  best_weight_kg DECIMAL(5,2),
  best_reps INTEGER,
  estimated_1rm DECIMAL(5,2),
  last_performed DATE,
  total_sessions INTEGER DEFAULT 0,
  average_reps_performed DECIMAL(4,1),
  progression_rate DECIMAL(4,2),            -- Weight increase per week
  performance_trend VARCHAR(20),            -- 'improving', 'stable', 'declining'
  confidence_score DECIMAL(3,2),            -- Data reliability score
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Exercise Name Mapping History
```sql
CREATE TABLE exercise_name_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_exercise_name VARCHAR(255) NOT NULL,
  exercise_library_id UUID REFERENCES exercise_library(id),
  confidence_score DECIMAL(3,2),
  user_context JSONB,                       -- Equipment, muscles targeted, etc.
  mapping_method VARCHAR(50),               -- "exact_match", "fuzzy_match", "ml_classification"
  user_feedback JSONB,                      -- User confirmation/correction
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Workout History with Exercise Mapping
```sql
CREATE TABLE workout_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_user(user_id),
  workout_date TIMESTAMP DEFAULT NOW(),
  exercises_completed JSONB,                -- [{exercise_library_id, original_name, sets, reps, weight, rpe}]
  total_volume INTEGER,                     -- Total weight moved
  workout_duration INTEGER,                 -- Minutes
  fatigue_level INTEGER CHECK (fatigue_level BETWEEN 1 AND 10),
  recovery_days_needed INTEGER,
  mapping_accuracy_score DECIMAL(3,2),      -- How well exercises were mapped
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Real-Time Exercise Classification System

#### Core Classification Algorithm
```javascript
async function classifyAndNormalizeExercise(aiExercise, userContext) {
  const { name, muscles_targeted, equipment_needed, movement_pattern } = aiExercise;
  
  // Step 1: Try exact match with aliases
  let exerciseMatch = await findExactMatch(name);
  
  // Step 2: Fuzzy string matching with threshold
  if (!exerciseMatch) {
    exerciseMatch = await findFuzzyMatch(name, 0.8);
  }
  
  // Step 3: Context-based classification using muscle groups and equipment
  if (!exerciseMatch) {
    exerciseMatch = await classifyByContext({
      name: name,
      primaryMuscle: muscles_targeted?.[0],
      secondaryMuscles: muscles_targeted?.slice(1) || [],
      equipment: equipment_needed || [],
      movementPattern: movement_pattern,
      userContext: userContext
    });
  }
  
  // Step 4: Machine learning classification for ambiguous cases
  if (!exerciseMatch) {
    exerciseMatch = await mlClassifyExercise(aiExercise);
  }
  
  // Step 5: Create new entry if no confident match found
  if (!exerciseMatch || exerciseMatch.confidence < 0.6) {
    exerciseMatch = await createNewExerciseEntry(aiExercise, userContext);
  }
  
  return {
    canonicalId: exerciseMatch.id,
    canonicalName: exerciseMatch.canonical_name,
    confidence: exerciseMatch.confidence_score || 0.95,
    mappingMethod: exerciseMatch.mapping_method,
    primaryMuscle: exerciseMatch.primary_muscle,
    equipment: exerciseMatch.equipment_needed
  };
}
```

#### Fuzzy Matching Implementation
```javascript
function calculateStringSimilarity(str1, str2) {
  // Levenshtein distance with Jaccard similarity for word overlap
  const levDistance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  const levSimilarity = 1 - (levDistance / maxLength);
  
  // Jaccard similarity for word sets
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const jaccardSimilarity = intersection.size / union.size;
  
  // Weighted combination
  return (levSimilarity * 0.6) + (jaccardSimilarity * 0.4);
}

async function findFuzzyMatch(exerciseName, threshold = 0.8) {
  const allExercises = await getAllExercises();
  let bestMatch = null;
  let bestScore = 0;
  
  // Check against canonical names
  for (const exercise of allExercises) {
    const similarity = calculateStringSimilarity(exerciseName, exercise.canonical_name);
    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = exercise;
    }
  }
  
  // Check against aliases if no good canonical match
  if (!bestMatch) {
    for (const exercise of allExercises) {
      for (const alias of exercise.aliases || []) {
        const similarity = calculateStringSimilarity(exerciseName, alias);
        if (similarity > bestScore && similarity >= threshold) {
          bestScore = similarity;
          bestMatch = exercise;
        }
      }
    }
  }
  
  return bestMatch ? { ...bestMatch, confidence_score: bestScore, mapping_method: 'fuzzy_match' } : null;
}
```

#### Context-Based Classification
```javascript
async function classifyByContext(exerciseContext) {
  const { name, primaryMuscle, secondaryMuscles, equipment, movementPattern } = exerciseContext;
  
  // Build query based on available context
  const candidates = await findExercisesByContext({
    primaryMuscle,
    equipment: equipment?.[0], // Use first equipment item
    movementPattern
  });
  
  if (candidates.length === 0) return null;
  
  // Score candidates based on context similarity
  const scoredCandidates = candidates.map(candidate => {
    let score = 0;
    
    // Primary muscle match (40% weight)
    if (candidate.primary_muscle === primaryMuscle) score += 0.4;
    
    // Equipment match (30% weight)
    if (equipment?.some(eq => candidate.equipment_needed.includes(eq))) score += 0.3;
    
    // Movement pattern match (20% weight)
    if (candidate.movement_pattern === movementPattern) score += 0.2;
    
    // Secondary muscle overlap (10% weight)
    const secondaryOverlap = (candidate.secondary_muscles || [])
      .filter(muscle => secondaryMuscles.includes(muscle)).length;
    score += (secondaryOverlap / Math.max(secondaryMuscles.length, 1)) * 0.1;
    
    return { ...candidate, confidence_score: score, mapping_method: 'context_classification' };
  });
  
  // Return best match if confidence is high enough
  const bestMatch = scoredCandidates.sort((a, b) => b.confidence_score - a.confidence_score)[0];
  return bestMatch.confidence_score >= 0.7 ? bestMatch : null;
}
```

### 4. Weight Prediction Algorithm with Exercise Matching

#### Intelligent Weight Recommendation System
```javascript
async function getWeightRecommendationWithConfidence(userId, aiExercise) {
  // Classify the exercise first
  const classification = await classifyAndNormalizeExercise(aiExercise);
  
  // Route based on confidence level
  if (classification.confidence >= 0.9) {
    // High confidence - use direct historical data
    return await getDirectWeightRecommendation(userId, classification.canonicalId);
  } else if (classification.confidence >= 0.7) {
    // Medium confidence - use similar exercises with adjustment
    return await getSimilarBasedRecommendation(userId, classification, 0.9);
  } else {
    // Low confidence - use conservative profile-based estimate
    return await getConservativeEstimate(userId, classification);
  }
}

async function getDirectWeightRecommendation(userId, exerciseLibraryId) {
  // Get user's historical performance for this exact exercise
  const performance = await getExercisePerformance(userId, exerciseLibraryId);
  
  if (!performance || performance.total_sessions < 3) {
    // Not enough data - use strength standards
    return await getStrengthStandardBasedEstimate(userId, exerciseLibraryId);
  }
  
  // Use progression-adjusted recommendation
  const baseWeight = performance.estimated_1rm * 0.8; // 80% of 1RM for working sets
  const progressionFactor = 1 + (performance.progression_rate || 0) * 0.025; // 2.5% weekly
  
  return {
    recommendedWeight: Math.round(baseWeight * progressionFactor),
    confidence: 0.95,
    dataSource: 'direct_history',
    sessions: performance.total_sessions,
    progressionRate: performance.progression_rate
  };
}

async function getSimilarBasedRecommendation(userId, classification, adjustmentFactor = 0.9) {
  // Find similar exercises based on muscle groups, equipment, and movement pattern
  const similarExercises = await findSimilarExercises({
    primaryMuscle: classification.primaryMuscle,
    equipment: classification.equipment,
    movementPattern: classification.movementPattern,
    userId: userId
  });
  
  if (similarExercises.length === 0) {
    return await getStrengthStandardBasedEstimate(userId, classification.canonicalId);
  }
  
  // Calculate weighted average based on similarity
  let totalWeight = 0;
  let totalSimilarity = 0;
  
  for (const exercise of similarExercises) {
    const similarity = exercise.similarity_score;
    const performance = exercise.user_performance;
    
    if (performance && performance.estimated_1rm) {
      totalWeight += performance.estimated_1rm * similarity;
      totalSimilarity += similarity;
    }
  }
  
  if (totalSimilarity === 0) {
    return await getStrengthStandardBasedEstimate(userId, classification.canonicalId);
  }
  
  const average1RM = totalWeight / totalSimilarity;
  const recommendedWeight = Math.round(average1RM * 0.8 * adjustmentFactor);
  
  return {
    recommendedWeight,
    confidence: 0.75,
    dataSource: 'similar_exercises',
    similarExercisesCount: similarExercises.length,
    primaryMuscle: classification.primaryMuscle
  };
}
```

### 5. Enhanced AI Prompt for Exercise Consistency

#### Standardized Exercise Generation Prompt
```
Generate exactly {{EXERCISE_COUNT}} exercises using these STANDARDIZED EXERCISE NAMES:

STANDARD NAMES TO USE:
Lower Body:
- "Barbell Back Squat" (not "squat", "back squat")
- "Barbell Front Squat" (not "front squat")
- "Bulgarian Split Squat" (not "split squat", "rear foot elevated")
- "Romanian Deadlift" (not "RDL", "stiff leg deadlift")
- "Conventional Deadlift" (not "deadlift")

Upper Body Push:
- "Barbell Bench Press" (not "bench press", "chest press")
- "Dumbbell Bench Press"
- "Overhead Press" (not "shoulder press", "military press")
- "Incline Dumbbell Press"

Upper Body Pull:
- "Pull-up" (not "chin-up", "lat pulldown")
- "Barbell Row" (not "bent over row")
- "Dumbbell Row"
- "Face Pull"

Arms:
- "Dumbbell Bicep Curl" (not "curl", "bicep curl")
- "Barbell Bicep Curl"
- "Tricep Extension" (not "overhead extension")
- "Tricep Pushdown"

FOR EACH EXERCISE, PROVIDE:
{
  "name": "USE_STANDARD_NAME_EXACTLY",
  "sets": 3,
  "reps": [12, 12, 12],
  "duration_min": 0,
  "load_kg_each": [0, 0, 0],
  "reasoning": "Brief explanation",
  "muscles_targeted": ["primary", "secondary1", "secondary2"],
  "equipment_needed": ["equipment1", "equipment2"],
  "movement_pattern": "Push/Pull/Squat/Hinge/Carry",
  "difficulty_level": "Beginner/Intermediate/Advanced"
}

MATCH EXERCISES TO USER DATA:
{{SECTIONS}}

OUTPUT ONLY VALID JSON. USE STANDARD NAMES EXACTLY AS LISTED.
```

### 6. Confidence-Based Weight Recommendations

#### Recommendation Confidence Levels
```javascript
const ConfidenceLevels = {
  HIGH: {
    min: 0.9,
    description: "Based on direct historical data",
    weightAdjustment: 1.0,
    progressionRate: "Normal"
  },
  MEDIUM: {
    min: 0.7,
    description: "Based on similar exercises",
    weightAdjustment: 0.9,
    progressionRate: "Conservative"
  },
  LOW: {
    min: 0.5,
    description: "Based on strength standards",
    weightAdjustment: 0.8,
    progressionRate: "Very conservative"
  },
  MINIMAL: {
    min: 0.0,
    description: "Based on user profile only",
    weightAdjustment: 0.7,
    progressionRate: "Ultra conservative"
  }
};

function getConfidenceLevel(confidenceScore) {
  for (const [level, config] of Object.entries(ConfidenceLevels)) {
    if (confidenceScore >= config.min) return level;
  }
  return 'MINIMAL';
}
```

#### User Feedback Integration
```javascript
async function collectWeightFeedback(userId, exerciseLibraryId, feedback) {
  // Log the feedback
  await logWeightFeedback({
    user_id: userId,
    exercise_library_id: exerciseLibraryId,
    recommended_weight: feedback.recommendedWeight,
    actual_weight_used: feedback.actualWeight,
    accuracy_rating: feedback.accuracyRating, // 1-5
    rpe: feedback.rpe, // Rate of perceived exertion
    confidence_at_time: feedback.confidence,
    notes: feedback.notes
  });
  
  // Adjust exercise-specific multipliers
  if (feedback.accuracyRating <= 2) {
    // Too heavy - reduce future recommendations
    await adjustExerciseMultiplier(userId, exerciseLibraryId, 0.95);
  } else if (feedback.accuracyRating >= 4) {
    // Too light - increase future recommendations  
    await adjustExerciseMultiplier(userId, exerciseLibraryId, 1.05);
  }
  
  // Update mapping confidence if this was a low-confidence match
  if (feedback.confidence < 0.8 && feedback.accuracyRating >= 4) {
    await improveMappingConfidence(exerciseLibraryId, feedback.originalName);
  }
}
```

## Implementation Timeline

### Phase 1: Foundation (Weeks 1-2)
- [ ] Build exercise library with 200+ exercises and aliases
- [ ] Implement basic string matching algorithms
- [ ] Create exercise classification service
- [ ] Add canonical mapping to database schema

### Phase 2: Intelligence Layer (Weeks 3-4)
- [ ] Implement fuzzy matching with confidence scoring
- [ ] Add context-based classification (muscles, equipment)
- [ ] Create weight prediction fallback algorithms
- [ ] Build exercise similarity scoring

### Phase 3: Integration (Weeks 5-6)
- [ ] Enhance AI prompts with standardized naming
- [ ] Add classification to recommendation pipeline
- [ ] Implement confidence-based weight recommendations
- [ ] Create user feedback collection system

### Phase 4: Machine Learning (Weeks 7-8)
- [ ] Train ML models on mapping history
- [ ] Implement collaborative filtering
- [ ] Add automatic alias discovery
- [ ] Create mapping accuracy analytics

### Phase 5: Optimization (Weeks 9-10)
- [ ] A/B testing for algorithm effectiveness
- [ ] User-specific model training
- [ ] Advanced similarity algorithms
- [ ] Performance monitoring dashboard

## Key Benefits

1. **Accurate Historical Tracking**: Consistent exercise identification across all sessions
2. **Intelligent Weight Predictions**: Even for new exercise variations
3. **Confidence Transparency**: Users understand recommendation reliability
4. **Continuous Learning**: System improves with each user interaction
5. **Scalable Architecture**: Handles new exercises automatically
6. **Fallback Safety**: Conservative estimates when confidence is low

## Performance Metrics

### Exercise Matching Accuracy
- **Target**: 95%+ correct classification for common exercises
- **Fuzzy Matching**: 85%+ accuracy with 0.8 similarity threshold
- **Context Classification**: 80%+ accuracy for ambiguous cases
- **User Feedback**: 90%+ positive confirmation rate

### Weight Recommendation Accuracy
- **High Confidence**: 90%+ rated "just right" (4-5/5)
- **Medium Confidence**: 80%+ rated "just right"
- **Low Confidence**: 70%+ rated "acceptable" (3-5/5)
- **Progression Rate**: Average 2.5% weekly increase for consistent users

### System Performance
- **Classification Speed**: <100ms per exercise
- **Database Queries**: <50ms for complex similarity searches
- **Weight Calculation**: <200ms total recommendation time
- **ML Model Inference**: <300ms for complex classifications

This comprehensive system transforms exercise naming inconsistency from a major blocker into an intelligent classification engine that improves over time while providing accurate, personalized weight recommendations.