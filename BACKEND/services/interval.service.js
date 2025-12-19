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

GUIDELINES FOR PHASE GENERATION:

1. REP-BASED EXERCISES (strength, bodyweight):
   - Use simple pace: typically 3-6 seconds per rep depending on exercise complexity
   - Include rest between sets 
   - Add motivational cues at set starts and ends
   - Mark final set with encouraging "Final set!" type cues
   - IMPORTANT: Include set_number (1-indexed) on ALL work phases and rest phases for these exercise types
   - set_number should match which set the phase belongs to (e.g., all reps in set 1 have set_number: 1)

2. CARDIO (cardio_distance, cardio_time):
   - Break into meaningful segments (warmup, main work, cooldown)
   - Add milestone cues (halfway, final stretch, etc.)
   - Keep phases longer (1-5 minutes each) rather than second-by-second

3. HIIT:
   - Alternate work and rest phases based on the interval structure
   - Include round numbers in details
   - Add intensity cues ("All out!", "Push it!", "Recovery")

4. CIRCUIT:
   - Include transition phases between exercises (5-10 seconds)
   - Show exercise name in cue, position in detail
   - Rest between circuits (30-60 seconds)

5. ISOMETRIC/BALANCE:
   - Use "hold" phase type
   - Include encouraging checkpoints during long holds
   - Add form reminders in cues
   - Include set_number (1-indexed) on hold and rest phases for these exercise types

6. FLEXIBILITY/YOGA:
   - Use "hold" for static stretches
   - Include breathing cues
   - Allow transition time between positions

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
 * @param {Object} exercise - The exercise object
 * @returns {string} Formatted prompt for the LLM
 */
function buildExercisePrompt(exercise) {
  const { exercise_type, exercise_name } = exercise;

  let specificInstructions = '';
  let exerciseDetails = `Exercise: ${exercise_name}\nType: ${exercise_type}\n`;

  switch (exercise_type) {
    case 'strength':
      exerciseDetails += `Sets: ${exercise.sets || 3}\n`;
      exerciseDetails += `Reps per set: ${JSON.stringify(exercise.reps || [10, 10, 10])}\n`;
      exerciseDetails += `Load (kg): ${JSON.stringify(exercise.load_kg_each || [])}\n`;
      exerciseDetails += `Rest between sets: ${exercise.rest_seconds || 60} seconds\n`;
      specificInstructions = `
Generate interval data for this strength exercise:
- Use 4-5 seconds per rep (controlled tempo)
- Include rest phases between sets
- Add encouraging cues at the start and end of each set
- Mark the final set specially`;
      break;

    case 'bodyweight':
      exerciseDetails += `Sets: ${exercise.sets || 3}\n`;
      exerciseDetails += `Reps per set: ${JSON.stringify(exercise.reps || [15, 15, 15])}\n`;
      exerciseDetails += `Rest between sets: ${exercise.rest_seconds || 45} seconds\n`;
      specificInstructions = `
Generate interval data for this bodyweight exercise:
- Use 3-4 seconds per rep (slightly faster than weighted)
- Include rest phases between sets
- Keep cues energetic and motivating`;
      break;

    case 'cardio_distance':
      exerciseDetails += `Distance: ${exercise.distance_km || 5} km\n`;
      exerciseDetails += `Target duration: ${exercise.duration_min || 30} minutes\n`;
      exerciseDetails += `Target pace: ${exercise.target_pace || 'comfortable'}\n`;
      specificInstructions = `
Generate interval data for this distance-based cardio:
- Include warmup phase (1-2 minutes)
- Break the main work into 3-5 segments with milestone cues
- Add a cooldown phase
- Use encouraging cues at key distance/time milestones`;
      break;

    case 'cardio_time':
      exerciseDetails += `Duration: ${exercise.duration_min || 20} minutes\n`;
      specificInstructions = `
Generate interval data for this time-based cardio:
- Include warmup (1-2 min) and cooldown (1-2 min)
- Break main work into meaningful segments
- Add milestone cues (halfway, final stretch, etc.)`;
      break;

    case 'hiit':
      exerciseDetails += `Rounds: ${exercise.rounds || 4}\n`;
      exerciseDetails += `Intervals: ${JSON.stringify(exercise.intervals || [{ work_sec: 30, rest_sec: 15 }])}\n`;
      exerciseDetails += `Total duration: ${exercise.total_duration_min || 15} minutes\n`;
      specificInstructions = `
Generate interval data for this HIIT workout:
- Create alternating work/rest phases for each round
- Include a brief warmup/get-ready phase
- Mark round numbers in detail field
- Use high-energy cues for work phases, recovery cues for rest`;
      break;

    case 'circuit':
      exerciseDetails += `Number of circuits: ${exercise.circuits || 3}\n`;
      exerciseDetails += `Exercises in circuit: ${JSON.stringify(exercise.exercises_in_circuit || [])}\n`;
      exerciseDetails += `Rest between circuits: ${exercise.rest_between_circuits_sec || 60} seconds\n`;
      specificInstructions = `
Generate interval data for this circuit training:
- Include each exercise as a work phase with the exercise name as the cue
- Add short transition phases (5-10 sec) between exercises
- Include rest phases between complete circuits
- Show exercise position in detail (e.g., "Exercise 2 of 4")`;
      break;

    case 'flexibility':
      exerciseDetails += `Holds: ${JSON.stringify(exercise.holds || [{ position: 'stretch', duration_sec: 30 }])}\n`;
      exerciseDetails += `Repetitions: ${exercise.repetitions || 1}\n`;
      specificInstructions = `
Generate interval data for this flexibility routine:
- Use "hold" phase type for each stretch position
- Include breathing cues
- Add transition phases between positions
- Keep the pace calm and measured`;
      break;

    case 'yoga':
      exerciseDetails += `Sequence: ${JSON.stringify(exercise.sequence || [])}\n`;
      exerciseDetails += `Total duration: ${exercise.total_duration_min || 15} minutes\n`;
      specificInstructions = `
Generate interval data for this yoga flow:
- Use "hold" phase type for each pose
- Include breath counts or durations
- Add smooth transition phases
- Use calming, mindful cues`;
      break;

    case 'isometric':
      exerciseDetails += `Sets: ${exercise.sets || 3}\n`;
      exerciseDetails += `Hold duration per set: ${JSON.stringify(exercise.hold_duration_sec || [30, 30, 30])}\n`;
      exerciseDetails += `Rest between holds: ${exercise.rest_seconds || 30} seconds\n`;
      specificInstructions = `
Generate interval data for this isometric exercise:
- Use "hold" phase type for active holds
- Add encouraging checkpoints during long holds (e.g., at 10 sec, 20 sec)
- Include form reminder cues
- Mark the final hold specially`;
      break;

    case 'balance':
      exerciseDetails += `Sets: ${exercise.sets || 3}\n`;
      exerciseDetails += `Hold duration per set: ${JSON.stringify(exercise.hold_duration_sec || [30, 30, 30])}\n`;
      specificInstructions = `
Generate interval data for this balance exercise:
- Use "hold" phase type
- Add focus cues ("Find your center", "Steady")
- Include brief rest/transition between sides if applicable`;
      break;

    case 'sport_specific':
      exerciseDetails += `Sport: ${exercise.sport || 'general'}\n`;
      exerciseDetails += `Drill: ${exercise.drill_name || 'practice'}\n`;
      exerciseDetails += `Duration: ${exercise.duration_min || 10} minutes\n`;
      exerciseDetails += `Repetitions: ${exercise.repetitions || 10}\n`;
      specificInstructions = `
Generate interval data for this sport-specific drill:
- Structure based on the drill requirements
- Include skill-focused cues
- Add appropriate rest/recovery phases`;
      break;

    default:
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
 * @param {Object} exercise - The exercise object
 * @returns {number} Estimated duration in seconds
 */
function estimateDuration(exercise) {
  const { exercise_type } = exercise;

  switch (exercise_type) {
    case 'strength':
    case 'bodyweight': {
      const sets = exercise.sets || 3;
      const reps = exercise.reps || [10];
      const avgReps = reps.reduce((a, b) => a + b, 0) / reps.length;
      const repTime = exercise_type === 'strength' ? 5 : 4;
      const restTime = exercise.rest_seconds || 60;
      return Math.round(sets * avgReps * repTime + (sets - 1) * restTime);
    }

    case 'cardio_distance':
    case 'cardio_time':
      return (exercise.duration_min || 20) * 60;

    case 'hiit': {
      const rounds = exercise.rounds || 4;
      const intervals = exercise.intervals || [{ work_sec: 30, rest_sec: 15 }];
      const intervalDuration = intervals.reduce((sum, i) => sum + (i.work_sec || 0) + (i.rest_sec || 0), 0);
      return rounds * intervalDuration + 10; // +10 for warmup
    }

    case 'circuit': {
      const circuits = exercise.circuits || 3;
      const exercises = exercise.exercises_in_circuit || [];
      const exerciseTime = exercises.reduce((sum, e) => sum + (e.duration_sec || 30), 0);
      const transitionTime = (exercises.length - 1) * 10;
      const restTime = exercise.rest_between_circuits_sec || 60;
      return circuits * (exerciseTime + transitionTime) + (circuits - 1) * restTime;
    }

    case 'flexibility': {
      const holds = exercise.holds || [{ duration_sec: 30 }];
      const reps = exercise.repetitions || 1;
      const holdTime = holds.reduce((sum, h) => sum + (h.duration_sec || 30), 0);
      return holdTime * reps + (holds.length - 1) * 5; // 5 sec transitions
    }

    case 'yoga':
      return (exercise.total_duration_min || 15) * 60;

    case 'isometric':
    case 'balance': {
      const sets = exercise.sets || 3;
      const holds = exercise.hold_duration_sec || [30];
      const avgHold = holds.reduce((a, b) => a + b, 0) / holds.length;
      const restTime = exercise.rest_seconds || 30;
      return Math.round(sets * avgHold + (sets - 1) * restTime);
    }

    case 'sport_specific':
      return (exercise.duration_min || 10) * 60;

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

