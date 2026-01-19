const { openai } = require('@ai-sdk/openai');
const { generateObject } = require('ai');
const { z } = require('zod');

// ============================================
// ZOD SCHEMAS FOR INTERVAL TIMER DATA
// ============================================

// Phase types that can occur in an interval timer
const PhaseTypeEnum = z.enum([
  'work',       // Active exercise (reps, cardio, etc.)
  'rest',       // Rest between sets/rounds
  'hold',       // Isometric holds, stretches
  'transition' // Moving between exercises in circuits
]);

// Individual phase in the timer sequence
const PhaseSchema = z.object({
  phase_type: PhaseTypeEnum,
  duration_sec: z.number().int().positive(),
  cue: z.string().describe('Short motivational or instructional cue (e.g., "Go!", "Rest", "Hold steady")'),
  detail: z.string().nullable().describe('Additional context (e.g., "Rep 3 of 10", "Set 2", "30 seconds left")'),
  countdown: z.boolean().describe('Whether to display a countdown timer for this phase'),
  set_number: z.number().int().positive().nullable().optional().describe('For set-based exercises, which set this phase belongs to (1-indexed). Include on work phases and rest phases between sets.')
});

// Main interval timer data schema
const IntervalTimerSchema = z.object({
  exercise_name: z.string(),
  exercise_type: z.string(),
  total_duration_sec: z.number().int().positive(),
  phases: z.array(PhaseSchema).min(1)
});

// Batch response schema
const BatchIntervalSchema = z.object({
  intervals: z.array(IntervalTimerSchema)
});

// ============================================
// SYSTEM PROMPT FOR INTERVAL GENERATION
// ============================================

const INTERVAL_SYSTEM_PROMPT = `You are an expert fitness coach and workout timer designer. Your job is to create precise interval timer data for exercises.

EXERCISE TYPES (4 core types):
- reps: Set/rep based exercises (strength, bodyweight)
- hold: Isometric holds (planks, wall sits, static stretches)
- duration: Continuous activity (running, cycling, yoga flows)
- intervals: Work/rest cycles (HIIT, tabata)

GUIDELINES FOR PHASE GENERATION:

1. TYPE: reps (strength, bodyweight exercises):
   - Use simple pace: typically 3-6 seconds per rep depending on exercise complexity
   - Include rest between sets (use rest_sec field)
   - Add motivational cues at set starts and ends
   - Mark final set with encouraging "Final set!" type cues
   - IMPORTANT: Include set_number (1-indexed) on ALL work phases and rest phases
   - set_number should match which set the phase belongs to (e.g., all reps in set 1 have set_number: 1)

2. TYPE: hold (isometric, balance, static stretches):
   - Use "hold" phase type for active holds
   - Include encouraging checkpoints during long holds (e.g., at 10 sec, 20 sec)
   - Add form reminders in cues
   - Include set_number (1-indexed) on hold and rest phases
   - Mark the final hold specially
   - For flexibility/yoga flows, include breathing cues and transition phases

3. TYPE: duration (cardio, continuous effort):
   - Break into meaningful segments (warmup, main work, cooldown)
   - Add milestone cues (halfway, final stretch, etc.)
   - Keep phases longer (1-5 minutes each) rather than second-by-second
   - Include distance milestones if distance is provided

4. TYPE: intervals (HIIT, tabata):
   - Alternate work and rest phases based on rounds, work_sec, rest_sec
   - Include round numbers in details
   - Add intensity cues ("All out!", "Push it!", "Recovery")
   - Include a brief warmup/get-ready phase

CUE STYLE:
- Keep cues short and punchy (1-5 words)
- Be encouraging but not cheesy
- Include action words: "Go", "Push", "Hold", "Breathe", "Rest"
- Mark milestones: "Halfway!", "Final round!", "Almost there!"

DETAIL STYLE:
- Provide context: "Set 2 of 3", "Rep 5", "Round 3"
- Include time remaining for longer phases
- Be specific but concise`;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build a prompt for a single exercise based on its type
 * Uses the 4-type exercise system: reps, hold, duration, intervals
 * @param {Object} exercise - The exercise object
 * @returns {string} Formatted prompt for the LLM
 */
function buildExercisePrompt(exercise) {
  const { exercise_type, exercise_name } = exercise;

  let specificInstructions = '';
  let exerciseDetails = `Exercise: ${exercise_name}\nType: ${exercise_type}\n`;

  switch (exercise_type) {
    case 'reps':
      // Set/rep based exercises (strength, bodyweight)
      exerciseDetails += `Sets: ${exercise.sets || 3}\n`;
      exerciseDetails += `Reps per set: ${JSON.stringify(exercise.reps || [10, 10, 10])}\n`;
      if (exercise.load_each) {
        exerciseDetails += `Load per set: ${JSON.stringify(exercise.load_each)} ${exercise.load_unit || 'kg'}\n`;
      }
      exerciseDetails += `Rest between sets: ${exercise.rest_sec || 60} seconds\n`;
      specificInstructions = `
Generate interval data for this rep-based exercise:
- Use 3-5 seconds per rep (controlled tempo, slower for weighted)
- Include rest phases between sets
- Add encouraging cues at the start and end of each set
- Mark the final set specially
- Include set_number on all work and rest phases`;
      break;

    case 'hold':
      // Isometric holds (planks, wall sits, static stretches, balance)
      exerciseDetails += `Sets: ${exercise.sets || 3}\n`;
      exerciseDetails += `Hold duration per set: ${JSON.stringify(exercise.hold_sec || [30, 30, 30])} seconds\n`;
      exerciseDetails += `Rest between holds: ${exercise.rest_sec || 30} seconds\n`;
      specificInstructions = `
Generate interval data for this hold exercise:
- Use "hold" phase type for active holds
- Add encouraging checkpoints during long holds (e.g., at 10 sec, 20 sec)
- Include form reminder cues ("Keep breathing", "Stay steady")
- Mark the final hold specially
- Include set_number on all hold and rest phases`;
      break;

    case 'duration':
      // Continuous effort (cardio, yoga flows)
      exerciseDetails += `Duration: ${exercise.duration_min || 20} minutes\n`;
      if (exercise.distance) {
        exerciseDetails += `Distance: ${exercise.distance} ${exercise.distance_unit || 'km'}\n`;
      }
      if (exercise.target_pace) {
        exerciseDetails += `Target pace: ${exercise.target_pace}\n`;
      }
      specificInstructions = `
Generate interval data for this duration-based exercise:
- Include warmup phase (1-2 minutes)
- Break the main work into 3-5 meaningful segments with milestone cues
- Add a cooldown phase
- Use encouraging cues at key time/distance milestones
- Add milestone cues (halfway, final stretch, etc.)`;
      break;

    case 'intervals':
      // Work/rest cycles (HIIT, tabata)
      exerciseDetails += `Rounds: ${exercise.rounds || 8}\n`;
      exerciseDetails += `Work interval: ${exercise.work_sec || 20} seconds\n`;
      exerciseDetails += `Rest interval: ${exercise.rest_sec || 10} seconds\n`;
      specificInstructions = `
Generate interval data for this interval exercise:
- Create alternating work/rest phases for each round
- Include a brief warmup/get-ready phase (5-10 seconds)
- Mark round numbers in detail field ("Round 1 of 8")
- Use high-energy cues for work phases ("Go!", "Push it!", "All out!")
- Use recovery cues for rest phases ("Breathe", "Recovery", "30 seconds")`;
      break;

    default:
      // Fallback for any unknown types
      specificInstructions = `
Generate appropriate interval data for this exercise:
- Analyze the exercise type and create sensible phases
- Include warmup if duration > 5 minutes
- Add rest phases as appropriate
- Use encouraging, action-oriented cues`;
  }

  return `${exerciseDetails}\n${specificInstructions}`;
}

/**
 * Calculate estimated total duration for an exercise
 * Uses the 4-type exercise system: reps, hold, duration, intervals
 * @param {Object} exercise - The exercise object
 * @returns {number} Estimated duration in seconds
 */
function estimateDuration(exercise) {
  const { exercise_type } = exercise;

  switch (exercise_type) {
    case 'reps': {
      // Set/rep based exercises
      const sets = exercise.sets || 3;
      const reps = exercise.reps || [10];
      const avgReps = reps.reduce((a, b) => a + b, 0) / reps.length;
      // Weighted exercises: 5 sec/rep, bodyweight: 4 sec/rep
      const repTime = exercise.load_each ? 5 : 4;
      const restTime = exercise.rest_sec || 60;
      return Math.round(sets * avgReps * repTime + (sets - 1) * restTime);
    }

    case 'hold': {
      // Isometric holds
      const sets = exercise.sets || 3;
      const holds = exercise.hold_sec || [30];
      const avgHold = holds.reduce((a, b) => a + b, 0) / holds.length;
      const restTime = exercise.rest_sec || 30;
      return Math.round(sets * avgHold + (sets - 1) * restTime);
    }

    case 'duration':
      // Continuous effort
      return (exercise.duration_min || 20) * 60;

    case 'intervals': {
      // Work/rest cycles
      const rounds = exercise.rounds || 8;
      const workSec = exercise.work_sec || 20;
      const restSec = exercise.rest_sec || 10;
      return rounds * (workSec + restSec) + 10; // +10 for warmup
    }

    default:
      return 300; // Default 5 minutes
  }
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Generates interval timer data for a single exercise using LLM
 * @param {Object} exercise - The exercise object with type-specific fields
 * @returns {Promise<Object>} Interval timer data
 */
async function generateExerciseIntervals(exercise) {
  try {
    if (!exercise || !exercise.exercise_name || !exercise.exercise_type) {
      throw new Error('Exercise must have exercise_name and exercise_type');
    }

    const exercisePrompt = buildExercisePrompt(exercise);
    const estimatedDuration = estimateDuration(exercise);

    const userPrompt = `
${exercisePrompt}

Estimated total duration: approximately ${estimatedDuration} seconds

Generate the interval timer data with phases that add up to approximately this duration.
Ensure each phase has:
- phase_type: one of "work", "rest", "hold", "transition", "warmup", "cooldown"
- duration_sec: positive integer
- cue: short motivational/instructional text
- detail: context string or null
- countdown: boolean (true for most phases)
`;

    console.log(`Generating intervals for: ${exercise.exercise_name} (${exercise.exercise_type})`);

    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      system: INTERVAL_SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: IntervalTimerSchema,
      temperature: 0.6,
    });

    console.log(`Successfully generated ${result.object.phases.length} phases for ${exercise.exercise_name}`);

    return {
      success: true,
      data: result.object,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error generating exercise intervals:', error);

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

/**
 * Generates interval timer data for multiple exercises in parallel
 * @param {Array<Object>} exercises - Array of exercise objects
 * @returns {Promise<Object>} Batch interval timer data
 */
async function generateBatchIntervals(exercises) {
  try {
    if (!Array.isArray(exercises) || exercises.length === 0) {
      throw new Error('Exercises must be a non-empty array');
    }

    console.log(`Generating intervals for ${exercises.length} exercises in parallel`);

    // Generate intervals for all exercises in parallel
    const results = await Promise.all(
      exercises.map(exercise => generateExerciseIntervals(exercise))
    );

    // Separate successful and failed results
    const successful = [];
    const failed = [];

    results.forEach((result, index) => {
      if (result.success) {
        successful.push(result.data);
      } else {
        failed.push({
          exercise_name: exercises[index].exercise_name,
          error: result.error
        });
      }
    });

    console.log(`Batch complete: ${successful.length} successful, ${failed.length} failed`);

    return {
      success: true,
      data: {
        intervals: successful,
        failed: failed.length > 0 ? failed : undefined
      },
      metadata: {
        total: exercises.length,
        successful: successful.length,
        failed: failed.length
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error generating batch intervals:', error);

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  generateExerciseIntervals,
  generateBatchIntervals,
  IntervalTimerSchema,
  BatchIntervalSchema,
  PhaseSchema,
  PhaseTypeEnum
};

