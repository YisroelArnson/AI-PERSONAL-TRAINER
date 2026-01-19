const { openai } = require('@ai-sdk/openai');
const { generateObject, streamObject } = require('ai');
const { z } = require('zod');
const { fetchAllUserData } = require('./fetchUserData.service');
const { formatDistributionForPrompt } = require('./exerciseDistribution.service');
const { PRESET_MUSCLES } = require('./muscleGoals.service');

// Valid muscles (16 preset) - matching the 4-type exercise system
const VALID_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Abs',
  'Lower Back', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves',
  'Trapezius', 'Abductors', 'Adductors', 'Forearms', 'Neck'
];

// Group types for circuits, supersets, etc.
const GROUP_TYPES = ['circuit', 'superset', 'giant_set', 'warmup', 'cooldown', 'sequence'];

// Exercise types (4 core types)
const EXERCISE_TYPES = ['reps', 'hold', 'duration', 'intervals'];

// Legacy Zod schema for exercise recommendations output format (kept for backward compatibility)
const ExerciseRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      exercise_name: z.string(),
      sets: z.number().int().positive(),
      reps: z.array(z.number().int().positive()),
      load_kg_each: z.array(z.number().nonnegative()),
      muscles_utilized: z.array(
        z.object({
          muscle: z.string(),
          share: z.number().min(0).max(1)
        })
      ).refine(
        (muscles) => {
          if (muscles.length === 0) return true; // Allow empty array
          const totalShare = muscles.reduce((sum, m) => sum + m.share, 0);
          return Math.abs(totalShare - 1.0) < 0.01; // Allow for small floating point errors
        },
        { message: "Muscle shares must add up to 1.0" }
      ),
      goals_addressed: z.array(
        z.object({
          goal: z.string(),
          share: z.number().min(0).max(1)
        })
      ).refine(
        (goals) => {
          if (goals.length === 0) return true; // Allow empty array
          const totalShare = goals.reduce((sum, g) => sum + g.share, 0);
          return Math.abs(totalShare - 1.0) < 0.01; // Allow for small floating point errors
        },
        { message: "Goal shares must add up to 1.0" }
      ),
      reasoning: z.string()
    })
  )
});


/**
 * Creates a dynamic Zod schema for exercise recommendations based on valid muscles and goals
 * Uses the 4-type exercise system: reps, hold, duration, intervals
 * @param {Array<string>} validMuscles - List of valid muscle names
 * @param {Array<string>} validGoals - List of valid goal names
 * @returns {Object} Zod schema for individual exercise
 */
function createIndividualExerciseSchema(validMuscles, validGoals) {
  // Create enums for validation if lists are provided
  const MuscleEnum = validMuscles && validMuscles.length > 0
    ? z.enum(validMuscles)
    : z.string();

  const GoalEnum = validGoals && validGoals.length > 0
    ? z.enum(validGoals)
    : z.string();

  // Group schema for circuits, supersets, etc.
  const ExerciseGroupSchema = z.object({
    id: z.string().describe('Unique group identifier (e.g., "circuit-1", "superset-a")'),
    type: z.enum(GROUP_TYPES).describe('How to execute the group'),
    position: z.number().int().positive().describe('Order within group (1-indexed)'),
    name: z.string().optional().describe('Display name (set on first exercise only)'),
    rounds: z.number().int().positive().optional().describe('Times to repeat group (set on first exercise only)'),
    rest_between_rounds_sec: z.number().int().nonnegative().optional().describe('Rest after completing group')
  }).nullable().optional();

  // Base schema for common exercise properties with dynamic validation
  const BaseExerciseSchema = z.object({
    // Identity & ordering
    exercise_name: z.string(),
    order: z.number().int().positive().describe('Position in workout (1-indexed)'),

    // Grouping (optional - for circuits, supersets, etc.)
    group: ExerciseGroupSchema,

    // Metadata
    muscles_utilized: z.array(
      z.object({
        muscle: MuscleEnum,
        share: z.number().min(0).max(1)
      })
    ).refine(
      (muscles) => {
        if (muscles.length === 0) return true;
        const totalShare = muscles.reduce((sum, m) => sum + m.share, 0);
        return Math.abs(totalShare - 1.0) < 0.05;
      },
      { message: "Muscle shares must add up to approximately 1.0" }
    ),
    goals_addressed: z.array(
      z.object({
        goal: GoalEnum,
        share: z.number().min(0).max(1)
      })
    ).refine(
      (goals) => {
        if (goals.length === 0) return true;
        const totalShare = goals.reduce((sum, g) => sum + g.share, 0);
        return Math.abs(totalShare - 1.0) < 0.05;
      },
      { message: "Goal shares must add up to approximately 1.0" }
    ),
    reasoning: z.string().max(300).describe('Brief explanation for this exercise selection'),
    exercise_description: z.string().optional().describe('Instructions on how to perform the exercise'),
    equipment: z.array(z.string()).optional().describe('Equipment needed')
  });

  // 4-type exercise schema using discriminated union
  return z.discriminatedUnion("exercise_type", [
    // Type: reps - Count repetitions across sets (strength, bodyweight)
    BaseExerciseSchema.extend({
      exercise_type: z.literal("reps"),
      sets: z.number().int().positive().describe('Number of sets'),
      reps: z.array(z.number().int().positive()).describe('Target reps per set'),
      load_each: z.array(z.number().nonnegative()).nullable().optional().describe('Weight per set (null for bodyweight)'),
      load_unit: z.enum(['lbs', 'kg']).nullable().optional().describe('Weight unit'),
      rest_sec: z.number().int().nonnegative().describe('Rest between sets in seconds')
    }),

    // Type: hold - Hold positions for time (isometric, balance, static stretches)
    BaseExerciseSchema.extend({
      exercise_type: z.literal("hold"),
      sets: z.number().int().positive().describe('Number of sets'),
      hold_sec: z.array(z.number().int().positive()).describe('Hold duration per set in seconds'),
      rest_sec: z.number().int().nonnegative().describe('Rest between sets in seconds')
    }),

    // Type: duration - Continuous effort (cardio, yoga flows)
    BaseExerciseSchema.extend({
      exercise_type: z.literal("duration"),
      duration_min: z.number().positive().describe('Total duration in minutes'),
      distance: z.number().positive().nullable().optional().describe('Target distance (optional)'),
      distance_unit: z.enum(['km', 'mi']).nullable().optional().describe('Distance unit'),
      target_pace: z.string().nullable().optional().describe('Target pace (e.g., "5:30/km")')
    }),

    // Type: intervals - Work/rest cycles (HIIT, tabata)
    BaseExerciseSchema.extend({
      exercise_type: z.literal("intervals"),
      rounds: z.number().int().positive().describe('Number of rounds'),
      work_sec: z.number().int().positive().describe('Work interval in seconds'),
      rest_sec: z.number().int().nonnegative().describe('Rest interval in seconds')
    })
  ]);
}

// Placeholder for static export (will be dynamic in usage)
const IndividualExerciseSchema = createIndividualExerciseSchema([], []);
const TypedExerciseRecommendationSchema = z.object({
  recommendations: z.array(IndividualExerciseSchema)
});

/**
 * Helper function to calculate relative time from a date
 * Handles future dates (for expiration) and past dates (for history)
 * @param {string} dateString - ISO date string
 * @returns {string} Human-readable relative time
 */
function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date - now; // Future dates are positive, past are negative
  const absDiffMs = Math.abs(diffMs);

  const diffMinutes = Math.floor(absDiffMs / (1000 * 60));
  const diffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  // For past dates (history)
  if (diffMs < 0) {
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes === 1) return '1 minute ago';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffWeeks === 1) return '1 week ago';
    if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
    if (diffMonths === 1) return '1 month ago';
    return `${diffMonths} months ago`;
  }

  // For future dates (expiration)
  if (diffMinutes < 1) return 'in less than a minute';
  if (diffMinutes === 1) return 'in 1 minute';
  if (diffMinutes < 60) return `in ${diffMinutes} minutes`;
  if (diffHours === 1) return 'in 1 hour';
  if (diffHours < 24) return `in ${diffHours} hours`;
  if (diffDays === 0) return 'later today';
  if (diffDays === 1) return 'in 1 day';
  if (diffDays < 7) return `in ${diffDays} days`;
  if (diffWeeks === 1) return 'in 1 week';
  if (diffWeeks < 4) return `in ${diffWeeks} weeks`;
  if (diffMonths === 1) return 'in 1 month';
  return `in ${diffMonths} months`;
}

/**
 * Formats user data into natural language for AI prompt
 * @param {Object} userData - Structured user data from fetchAllUserData
 * @returns {string} Natural language formatted user context
 */
function formatUserDataAsNaturalLanguage(userData) {
  let output = [];

  // User Settings (Unit Preferences) - Display first so LLM knows the context
  if (userData.userSettings) {
    const weightUnit = userData.userSettings.weight_unit || 'lbs';
    const distanceUnit = userData.userSettings.distance_unit || 'miles';
    output.push(`UNIT PREFERENCES: Weight in ${weightUnit}, Distance in ${distanceUnit}`);
    output.push(`IMPORTANT: All weights must be in ${weightUnit} and all distances must be in ${distanceUnit}. Use practical, commonly available weights (e.g., standard dumbbell increments).`);
    output.push('');
  }

  // Body Stats
  if (userData.bodyStats) {
    const bs = userData.bodyStats;
    const age = bs.dob ? Math.floor((new Date() - new Date(bs.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
    const ageStr = age ? `${age}-year-old ` : '';
    const sexStr = bs.sex || 'person';
    const heightStr = bs.height_cm ? `${bs.height_cm}cm` : '';
    const weightStr = bs.weight_kg ? `${bs.weight_kg}kg` : '';
    const bodyFatStr = bs.body_fat_pct ? `, ${bs.body_fat_pct}% body fat` : '';

    output.push(`BODY STATS: ${ageStr}${sexStr}, ${heightStr}, ${weightStr}${bodyFatStr}`);
  }

  // Calculate goal priority scores
  const goalPriorities = [];
  if (userData.userCategoryAndWeights) {
    userData.userCategoryAndWeights.forEach(c => {
      if (c.weight > 0) {
        goalPriorities.push({ name: c.category, score: c.weight * 10, type: 'category' });
      }
    });
  }
  if (userData.userMuscleAndWeight) {
    userData.userMuscleAndWeight.forEach(m => {
      if (m.weight > 0) {
        goalPriorities.push({ name: m.muscle, score: m.weight * 5, type: 'muscle' });
      }
    });
  }
  goalPriorities.sort((a, b) => b.score - a.score);

  // Display top priorities with calculated scores
  if (goalPriorities.length > 0) {
    const top10 = goalPriorities.slice(0, 10);
    const categories = top10.filter(g => g.type === 'category');
    const muscles = top10.filter(g => g.type === 'muscle');

    if (categories.length > 0) {
      output.push(`TOP CATEGORY GOALS (by priority score): ${categories.map(g => `${g.name} (score: ${g.score.toFixed(1)})`).join(', ')}`);
    }
    if (muscles.length > 0) {
      output.push(`TOP MUSCLE TARGETS (by priority score): ${muscles.map(m => `${m.name} (score: ${m.score.toFixed(1)})`).join(', ')}`);
    }
  }

  // Goals (Category Weights) - filter and prioritize
  if (userData.userCategoryAndWeights && userData.userCategoryAndWeights.length > 0) {
    const activeGoals = userData.userCategoryAndWeights.filter(c => c.weight > 0);
    if (activeGoals.length > 0) {
      const highPriority = activeGoals.filter(g => g.weight >= 0.7);
      const mediumPriority = activeGoals.filter(g => g.weight >= 0.3 && g.weight < 0.7);
      const lowPriority = activeGoals.filter(g => g.weight > 0 && g.weight < 0.3);

      if (highPriority.length > 0) {
        output.push(`PRIMARY GOALS: ${highPriority.map(g => `${g.category} (${g.weight})`).join(', ')}`);
      }
      if (mediumPriority.length > 0) {
        output.push(`SECONDARY GOALS: ${mediumPriority.map(g => `${g.category} (${g.weight})`).join(', ')}`);
      }
      if (lowPriority.length > 0) {
        output.push(`TERTIARY GOALS: ${lowPriority.map(g => `${g.category} (${g.weight})`).join(', ')}`);
      }
    }
  }

  // Muscles (Muscle Weights) - filter and prioritize
  if (userData.userMuscleAndWeight && userData.userMuscleAndWeight.length > 0) {
    const activeMuscles = userData.userMuscleAndWeight.filter(m => m.weight > 0);
    if (activeMuscles.length > 0) {
      const highPriority = activeMuscles.filter(m => m.weight >= 0.7);
      const mediumPriority = activeMuscles.filter(m => m.weight >= 0.3 && m.weight < 0.7);
      const lowPriority = activeMuscles.filter(m => m.weight > 0 && m.weight < 0.3);

      if (highPriority.length > 0) {
        output.push(`HIGH PRIORITY MUSCLES: ${highPriority.map(m => `${m.muscle} (${m.weight})`).join(', ')}`);
      }
      if (mediumPriority.length > 0) {
        output.push(`MEDIUM PRIORITY MUSCLES: ${mediumPriority.map(m => `${m.muscle} (${m.weight})`).join(', ')}`);
      }
      if (lowPriority.length > 0) {
        output.push(`LOW PRIORITY MUSCLES: ${lowPriority.map(m => `${m.muscle} (${m.weight})`).join(', ')}`);
      }
    }
  }

  // Location and Equipment
  if (userData.locations) {
    const loc = userData.locations;
    const nameStr = loc.name ? `${loc.name}` : 'Current location';

    // Format equipment array - now contains objects with metadata
    let equipmentStr = 'no specific equipment listed';
    if (loc.equipment && Array.isArray(loc.equipment) && loc.equipment.length > 0) {
      const equipmentParts = loc.equipment.map(eq => {
        if (typeof eq === 'string') {
          // Handle legacy string format
          return eq;
        } else if (typeof eq === 'object' && eq !== null) {
          // Format equipment object
          let eqStr = eq.name || 'Unknown equipment';

          // Add type if available
          if (eq.type) {
            const typeStr = eq.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            eqStr += ` (${typeStr})`;
          }

          // Add weight specifications for free weights
          if (eq.type === 'free_weights' && eq.weights && Array.isArray(eq.weights) && eq.weights.length > 0) {
            const weightsStr = eq.weights.map(w => `${w}${eq.unit || 'kg'}`).join(', ');
            eqStr += `: ${weightsStr}`;
          }

          // Add brand if available
          if (eq.brand) {
            eqStr += ` [${eq.brand}]`;
          }

          // Add notes if available
          if (eq.notes) {
            eqStr += ` - ${eq.notes}`;
          }

          return eqStr;
        }
        return String(eq);
      });
      equipmentStr = equipmentParts.join(', ');
    }

    // Add location description if available
    if (loc.description) {
      output.push(`LOCATION: ${nameStr} - ${loc.description}`);
      output.push(`EQUIPMENT AVAILABLE: ${equipmentStr}`);
    } else {
      output.push(`LOCATION: ${nameStr} with equipment: ${equipmentStr}`);
    }
  }

  // Preferences (separate temporary and permanent)
  // Temporary = has expire_time or delete_after_call=true (session-specific, override everything)
  // Permanent = no expire_time and delete_after_call=false/null (long-term restrictions)
  if (userData.preferences) {
    if (userData.preferences.temporary && userData.preferences.temporary.length > 0) {
      output.push(`TEMPORARY PREFERENCES (override all other goals - will expire or be deleted):`);
      userData.preferences.temporary.forEach(pref => {
        const guidance = pref.recommendations_guidance || pref.description;
        const expireInfo = pref.expire_time
          ? ` [expires: ${getRelativeTime(pref.expire_time)}]`
          : pref.delete_after_call ? ' [one-time use]' : '';
        output.push(`  - ${guidance}${expireInfo}`);
      });
      output.push(''); // Blank line separator
    }

    if (userData.preferences.permanent && userData.preferences.permanent.length > 0) {
      output.push(`PERMANENT PREFERENCES (always apply):`);
      userData.preferences.permanent.forEach(pref => {
        output.push(`  - ${pref.recommendations_guidance || pref.description}`);
      });
      output.push(''); // Blank line separator
    }
  }

  // Exercise Distribution Tracking (show debt to guide recommendations)
  if (userData.exerciseDistribution && userData.exerciseDistribution.hasData) {
    const distributionText = formatDistributionForPrompt(userData.exerciseDistribution);
    if (distributionText) {
      output.push(distributionText);
    }
  }

  // Workout History Analysis (last 7 days for recovery and patterns)
  if (userData.workoutHistory && userData.workoutHistory.length > 0) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentWorkouts = userData.workoutHistory.filter(w =>
      new Date(w.performed_at) >= sevenDaysAgo
    );

    // Movement Pattern Analysis
    const movementPatterns = {};
    const exerciseFrequency = {};
    const muscleVolumeLoad = {};
    const muscleLastWorked = {};

    recentWorkouts.forEach(workout => {
      // Track exercise frequency
      exerciseFrequency[workout.exercise_name] = (exerciseFrequency[workout.exercise_name] || 0) + 1;

      // Track movement patterns
      if (workout.movement_pattern && Array.isArray(workout.movement_pattern)) {
        workout.movement_pattern.forEach(pattern => {
          if (!movementPatterns[pattern]) {
            movementPatterns[pattern] = [];
          }

          let performanceStr = '';
          if (workout.load_kg_each && workout.sets && workout.reps) {
            const avgLoad = Array.isArray(workout.load_kg_each)
              ? workout.load_kg_each.reduce((a, b) => a + b, 0) / workout.load_kg_each.length
              : workout.load_kg_each;
            const totalReps = Array.isArray(workout.reps)
              ? workout.reps.reduce((a, b) => a + b, 0)
              : workout.reps * workout.sets;
            const volumeLoad = avgLoad * totalReps;
            performanceStr = `${avgLoad.toFixed(1)}kg, volume: ${volumeLoad.toFixed(0)}kg`;
          }

          movementPatterns[pattern].push({
            name: workout.exercise_name,
            date: workout.performed_at,
            performance: performanceStr
          });
        });
      }

      // Track muscle volume and last worked date
      if (workout.muscles_utilized && Array.isArray(workout.muscles_utilized)) {
        workout.muscles_utilized.forEach(mu => {
          const muscle = mu.muscle;
          const share = mu.share || 1;

          // Calculate volume load for this muscle
          if (workout.load_kg_each && workout.sets && workout.reps) {
            const avgLoad = Array.isArray(workout.load_kg_each)
              ? workout.load_kg_each.reduce((a, b) => a + b, 0) / workout.load_kg_each.length
              : workout.load_kg_each;
            const totalReps = Array.isArray(workout.reps)
              ? workout.reps.reduce((a, b) => a + b, 0)
              : workout.reps * workout.sets;
            const volumeLoad = avgLoad * totalReps * share;

            muscleVolumeLoad[muscle] = (muscleVolumeLoad[muscle] || 0) + volumeLoad;
          }

          // Track last time this muscle was worked
          const workoutDate = new Date(workout.performed_at);
          if (!muscleLastWorked[muscle] || workoutDate > new Date(muscleLastWorked[muscle])) {
            muscleLastWorked[muscle] = workout.performed_at;
          }
        });
      }
    });

    // Display Movement Pattern Summary
    const patternKeys = Object.keys(movementPatterns);
    if (patternKeys.length > 0) {
      output.push(`\nMOVEMENT PATTERN ANALYSIS (Last 7 Days):`);
      patternKeys.forEach(pattern => {
        const exercises = movementPatterns[pattern].slice(0, 3); // Show top 3 recent
        const exerciseList = exercises.map(e => {
          const timeAgo = getRelativeTime(e.date);
          return e.performance ? `${e.name} (${e.performance}, ${timeAgo})` : `${e.name} (${timeAgo})`;
        }).join('; ');
        output.push(`  - ${pattern.toUpperCase()}: ${exerciseList}`);
      });
    }

    // Display Recovery Status
    const now = new Date();
    const recoveryStatus = {
      ready: [],
      recovering: []
    };

    // Define large vs small muscle groups for recovery windows
    const largeMuscles = ['Chest', 'Back', 'Legs', 'Quadriceps', 'Hamstrings', 'Glutes', 'Lats'];

    Object.entries(muscleLastWorked).forEach(([muscle, lastDate]) => {
      const hoursSinceWork = (now - new Date(lastDate)) / (1000 * 60 * 60);
      const isLarge = largeMuscles.some(lm => muscle.toLowerCase().includes(lm.toLowerCase()));
      const recoveryWindow = isLarge ? 48 : 24;

      if (hoursSinceWork >= recoveryWindow) {
        const volumeStr = muscleVolumeLoad[muscle] ? ` (volume: ${muscleVolumeLoad[muscle].toFixed(0)}kg)` : '';
        recoveryStatus.ready.push(`${muscle}${volumeStr}`);
      } else {
        const hoursRemaining = Math.ceil(recoveryWindow - hoursSinceWork);
        recoveryStatus.recovering.push(`${muscle} (${hoursRemaining}h remaining)`);
      }
    });

    if (recoveryStatus.ready.length > 0 || recoveryStatus.recovering.length > 0) {
      output.push(`\nRECOVERY STATUS:`);
      if (recoveryStatus.ready.length > 0) {
        output.push(`  READY: ${recoveryStatus.ready.join(', ')}`);
      }
      if (recoveryStatus.recovering.length > 0) {
        output.push(`  RECOVERING: ${recoveryStatus.recovering.join(', ')}`);
      }
    }

    // Display exercises performed multiple times (consider variation)
    const frequentExercises = Object.entries(exerciseFrequency)
      .filter(([, count]) => count >= 3)
      .map(([name, count]) => `${name} (${count}x)`)
      .join(', ');

    if (frequentExercises) {
      output.push(`\nFREQUENT EXERCISES (consider variation): ${frequentExercises}`);
    }

    // Display full workout history for progression
    output.push(`\nRECENT WORKOUT HISTORY (for progression):`);
    userData.workoutHistory.slice(0, 15).forEach(workout => {
      const timeAgo = getRelativeTime(workout.performed_at);
      let detailsStr = '';

      if (workout.sets && workout.reps) {
        const repsStr = Array.isArray(workout.reps) ? workout.reps.join(',') : workout.reps;
        detailsStr = `${workout.sets} sets, ${repsStr} reps`;
        if (workout.load_kg_each) {
          const loadStr = Array.isArray(workout.load_kg_each) ? workout.load_kg_each[0] : workout.load_kg_each;
          detailsStr += `, ${loadStr}kg`;
        }
      } else if (workout.distance_km) {
        detailsStr = `${workout.distance_km}km`;
        if (workout.duration_min) {
          detailsStr += ` in ${workout.duration_min}min`;
        }
      } else if (workout.duration_min) {
        detailsStr = `${workout.duration_min}min`;
      } else if (workout.hold_duration_sec) {
        const holdStr = Array.isArray(workout.hold_duration_sec) ? workout.hold_duration_sec.join(',') : workout.hold_duration_sec;
        detailsStr = `held for ${holdStr}sec`;
      }

      output.push(`  - ${workout.exercise_name}: ${detailsStr} (${timeAgo})`);
    });
  }

  return output.join('\n');
}


// System prompt for the AI personal trainer
const SYSTEM_PROMPT = `You are an elite AI personal trainer specializing in exercise programming and progressive overload. Your recommendations must be scientifically sound, highly personalized, and optimally timed.

CORE PRINCIPLES:
1. PERSONALIZATION: Every recommendation must align with the user's specific goals, with exercise selection heavily influenced by their category and muscle group priorities
2. PROGRESSION: Apply conservative progressive overload (5-10% increases) only when the user has successfully completed previous sessions
3. RECOVERY: Respect muscle recovery by analyzing the last 7 days of training history
4. MOVEMENT PATTERNS: Use similar exercises within movement patterns to inform weight recommendations
5. EXERCISE SELECTION: Choose exercises that match the user's goals - prioritize compound movements for strength goals, include isolation for hypertrophy goals
6. REP RANGES: Apply goal-appropriate rep ranges - Strength (1-5), Hypertrophy (6-12), Endurance (12+), with mixed ranges for different exercise types

EXERCISE TYPES (4 core types):
- reps: Set/rep based exercises (strength, bodyweight). Fields: sets, reps[], load_each[] (optional), load_unit, rest_sec
- hold: Isometric holds (planks, wall sits, static stretches). Fields: sets, hold_sec[], rest_sec
- duration: Continuous activity (running, cycling, yoga flows). Fields: duration_min, distance (optional), distance_unit, target_pace (optional)
- intervals: Work/rest cycles (HIIT, tabata). Fields: rounds, work_sec, rest_sec

GROUPING (for circuits, supersets, etc.):
Use the optional "group" field instead of a separate type:
- group.type: circuit, superset, giant_set, warmup, cooldown, sequence
- group.id: Unique identifier (e.g., "superset-1")
- group.position: Order within the group (1-indexed)
- group.rounds: How many times to repeat the group

UNIT SYSTEM REQUIREMENTS:
- ALWAYS use the user's preferred unit system as specified in their UNIT PREFERENCES
- For weights: Use practical, commonly available increments (e.g., 5, 10, 15, 20, 25, 30, 35, 40, 45 lbs OR 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20 kg)
- For distances: Use standard increments (e.g., 0.5, 1, 1.5, 2, 3, 5 miles OR 1, 2, 3, 5, 10 km)
- NEVER mix units - if user prefers lbs, ALL weights must be in lbs; if user prefers km, ALL distances must be in km

STRICT REQUIREMENTS:
- ONLY recommend exercises with available equipment - no substitutions or alternatives
- Generate EXACTLY the requested number of exercises
- Ensure muscles_utilized shares sum to 1.0
- Use ONLY the exact muscle names from the standard list: Chest, Back, Shoulders, Biceps, Triceps, Abs, Lower Back, Quadriceps, Hamstrings, Glutes, Calves, Trapezius, Abductors, Adductors, Forearms, Neck
- Use ONLY the exact goal categories listed in the USER PROFILE (do not invent new goals)
- Respect ALL temporary preferences as absolute overrides
- Choose appropriate exercise_type for each exercise: reps, hold, duration, or intervals
- Include "order" field (1-indexed position in workout) for each exercise`;

// Process rules for the model
// Note: Temporary preferences are those with expire_time or delete_after_call=true
// Permanent preferences have no expire_time and delete_after_call=false/null
const PROCESS_RULES = `EXERCISE RECOMMENDATION PROCESS:

1. ANALYZE GOALS & DISTRIBUTION
   - Calculate base priority scores: (category_weight × 10) + (muscle_weight × 5)
   - Review distribution status if available to see which categories/muscles are under-represented
   - Apply debt bonus to priority: add (category_debt × 15) + (muscle_debt × 10) to priority scores
   - Categories/muscles with positive debt (under-represented) should be strongly prioritized
   - Identify top categories and muscles by final priority score (including debt bonus)
   - Ensure 70% of exercises directly address high-priority goals, with extra emphasis on under-represented ones

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
   a) Addresses highest-priority goals (category and muscle weights + distribution debt bonus)
   b) Prioritizes under-represented categories/muscles (those with positive debt in distribution tracking)
   c) Targets recovered muscles (check last 7 days)
   d) Matches available equipment exactly (strict - no substitutions)
   e) Provides movement pattern variety across the session
   f) Hasn't been performed in last 2 sessions (unless specifically requested)

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
4. DISTRIBUTION DEBT - Strongly prioritize under-represented categories/muscles to balance distribution
5. GOALS & MUSCLES - Priority based on weights (higher weight = higher priority)
6. WORKOUT HISTORY - Use for progression, recovery assessment, and variety`;

/**
 * Generates exercise recommendations using OpenAI (streaming version)
 * @param {string} userId - The user's UUID
 * @param {Object} requestData - Additional request data (exerciseCount, explicit preferences, etc.)
 * @returns {Object} Streaming exercise recommendations
 */
async function streamExerciseRecommendations(userId, requestData = {}) {
  try {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    // Fetch all user data
    const userData = await fetchAllUserData(userId);

    if (!userData.success) {
      throw new Error(`Failed to fetch user data: ${userData.error || 'Unknown error'}`);
    }

    // Extract exercise count from request data
    const exerciseCount = requestData.exerciseCount;

    // Format user data as natural language
    const formattedUserData = formatUserDataAsNaturalLanguage(userData.data);

    // Create exercise count instruction
    const exerciseCountInstruction = exerciseCount
      ? `Generate exactly ${exerciseCount} exercises.`
      : `Generate 3-8 exercises based on the user's goals and available time.`;

    // Create the user prompt with natural language formatted data
    const userPrompt = `
USER PROFILE:
${formattedUserData}

${requestData.explicitPreferences ? `\nEXPLICIT REQUEST: ${requestData.explicitPreferences}\n` : ''}

${PROCESS_RULES}

${exerciseCountInstruction}
    `;

    console.log('Streaming exercise recommendations for user:', userId);
    console.log('User prompt length:', userPrompt.length);

    // Extract valid goals from user data
    const validGoals = userData.data.userCategoryAndWeights
      ? userData.data.userCategoryAndWeights.map(g => g.category)
      : [];

    // Create dynamic schema with validation
    const DynamicExerciseSchema = createIndividualExerciseSchema(PRESET_MUSCLES, validGoals);

    // Generate structured output using Vercel AI SDK with streaming
    const result = streamObject({
      model: openai('gpt-4.1'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: DynamicExerciseSchema,
      output: 'array',
      temperature: 0.7,
      onError({ error }) {
        console.error('Streaming error:', error);
      }
    });

    return {
      success: true,
      elementStream: result.elementStream,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        requestData,
        userDataFetched: userData.success,
        streaming: true
      }
    };

  } catch (error) {
    console.error('Error streaming exercise recommendations:', error);

    return {
      success: false,
      error: error.message,
      userId,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

/**
 * Generates exercise recommendations using OpenAI (non-streaming version)
 * @param {string} userId - The user's UUID
 * @param {Object} requestData - Additional request data (exerciseCount, explicit preferences, etc.)
 * @returns {Object} Exercise recommendations
 */
async function generateExerciseRecommendations(userId, requestData = {}) {
  try {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    // Fetch all user data
    const userData = await fetchAllUserData(userId);

    if (!userData.success) {
      throw new Error(`Failed to fetch user data: ${userData.error || 'Unknown error'}`);
    }

    // Extract exercise count from request data
    const exerciseCount = requestData.exerciseCount;

    // Format user data as natural language
    const formattedUserData = formatUserDataAsNaturalLanguage(userData.data);

    // Create exercise count instruction
    const exerciseCountInstruction = exerciseCount
      ? `Generate exactly ${exerciseCount} exercises.`
      : `Generate 3-8 exercises based on the user's goals and available time.`;

    // Create the user prompt with natural language formatted data
    const userPrompt = `
USER PROFILE:
${formattedUserData}

${requestData.explicitPreferences ? `\nEXPLICIT REQUEST: ${requestData.explicitPreferences}\n` : ''}

${PROCESS_RULES}

${exerciseCountInstruction}
    `;

    console.log('Generating exercise recommendations for user:', userId);
    console.log('User prompt length:', userPrompt.length);

    // Extract valid goals from user data
    const validGoals = userData.data.userCategoryAndWeights
      ? userData.data.userCategoryAndWeights.map(g => g.category)
      : [];

    // Create dynamic schema with validation
    const DynamicExerciseSchema = createIndividualExerciseSchema(PRESET_MUSCLES, validGoals);
    const DynamicTypedSchema = z.object({
      recommendations: z.array(DynamicExerciseSchema)
    });

    // Generate structured output using Vercel AI SDK
    const result = await generateObject({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: DynamicTypedSchema,
      temperature: 0.7,
    });

    console.log('Successfully generated exercise recommendations');

    // Validate exercise count if specified
    const actualCount = result.object.recommendations.length;
    if (exerciseCount && actualCount !== exerciseCount) {
      console.warn(`Warning: Requested ${exerciseCount} exercises but got ${actualCount}`);
    }

    return {
      success: true,
      data: result.object,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        requestData,
        userDataFetched: userData.success,
        recommendationCount: actualCount,
        requestedCount: exerciseCount,
        countMismatch: exerciseCount ? actualCount !== exerciseCount : false
      }
    };

  } catch (error) {
    console.error('Error generating exercise recommendations:', error);

    // Provide more specific error messages
    let errorMessage = error.message;
    let errorDetails = null;

    if (error.name === 'AI_NoObjectGeneratedError' || error.name === 'NoObjectGeneratedError') {
      errorMessage = 'AI failed to generate valid exercise recommendations. This may be due to schema validation issues.';
      errorDetails = {
        type: 'schema_validation_error',
        originalError: error.message,
        suggestion: 'Try reducing the number of exercises requested or check for invalid movement patterns.'
      };
    } else if (error.name === 'AI_TypeValidationError') {
      errorMessage = 'Generated exercises did not match the expected format.';
      errorDetails = {
        type: 'type_validation_error',
        originalError: error.message,
        suggestion: 'The AI generated invalid data. Please try again.'
      };
    }

    return {
      success: false,
      error: errorMessage,
      errorDetails,
      userId,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

module.exports = {
  generateExerciseRecommendations,
  streamExerciseRecommendations,
  ExerciseRecommendationSchema,
  TypedExerciseRecommendationSchema,
  IndividualExerciseSchema,
  createIndividualExerciseSchema
};
