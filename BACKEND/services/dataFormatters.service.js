// BACKEND/services/dataFormatters.service.js
// Concise formatters for all data sources used in agent context
// Optimized for token efficiency

/**
 * Format workout history for context
 * Optimized for token efficiency
 * @param {Array} workouts - Array of workout records
 * @returns {string} Formatted string
 */
function formatWorkoutHistory(workouts) {
  if (!workouts || workouts.length === 0) {
    return 'No workout history available.';
  }

  return workouts.map(w => {
    const date = new Date(w.completed_at).toLocaleDateString();
    const exercises = w.exercises?.map(e => 
      `${e.name}(${e.sets}x${e.reps || e.duration || e.hold_time})`
    ).join(', ') || 'No exercises logged';
    return `${date}: ${exercises}`;
  }).join('\n');
}

/**
 * Format user settings for context
 * @param {Object} settings - User settings record
 * @returns {string} Formatted string
 */
function formatUserSettings(settings) {
  if (!settings) {
    return 'Default settings in use.';
  }

  const parts = [];
  if (settings.preferred_workout_duration) {
    parts.push(`Duration: ${settings.preferred_workout_duration}min`);
  }
  if (settings.fitness_level) {
    parts.push(`Level: ${settings.fitness_level}`);
  }
  if (settings.available_equipment?.length > 0) {
    parts.push(`Equipment: ${settings.available_equipment.join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : 'Default settings in use.';
}

/**
 * Format user profile (demographics + latest body measurements) for context
 * @param {Object} profile - Combined profile record from dataSources
 * @returns {string} Formatted string
 */
function formatUserProfile(profile) {
  if (!profile) {
    return 'No profile data recorded.';
  }

  const parts = [];
  if (profile.sex) parts.push(`Sex: ${profile.sex}`);
  if (profile.dob) {
    const age = Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    parts.push(`Age: ${age}`);
  }
  if (profile.height_cm) parts.push(`Height: ${profile.height_cm}cm`);
  if (profile.weight_kg) parts.push(`Weight: ${profile.weight_kg}kg`);
  if (profile.body_fat_pct) parts.push(`Body Fat: ${profile.body_fat_pct}%`);

  return parts.length > 0 ? parts.join(' | ') : 'No profile data recorded.';
}

/**
 * Format all user locations for context
 * Token-efficient format with equipment details
 * @param {Array} locations - Array of location records with full equipment metadata
 * @returns {string} Formatted string
 */
function formatAllLocations(locations) {
  if (!locations || locations.length === 0) {
    return 'No locations configured.';
  }

  return locations.map(loc => {
    // Mark current location with star
    const marker = loc.current_location ? '★ ' : '  ';
    let result = `${marker}${loc.name}`;

    // Add ID for set_current_location tool reference
    result += ` [id:${loc.id}]`;

    // Add description if present
    if (loc.description) {
      result += `\n    ${loc.description}`;
    }

    // Format equipment with type and weight details
    if (loc.equipment && loc.equipment.length > 0) {
      result += '\n    Equipment:';
      for (const eq of loc.equipment) {
        // Handle both object format and legacy string format
        if (typeof eq === 'string') {
          result += `\n      - ${eq}`;
          continue;
        }

        let eqLine = `\n      - ${eq.name}`;
        if (eq.type) eqLine += ` (${eq.type})`;

        // Include weights for free_weights type
        if (eq.type === 'free_weights' && eq.weights && eq.weights.length > 0) {
          const unit = eq.unit || 'kg';
          eqLine += `: ${eq.weights.join(', ')}${unit}`;
        }

        // Include brand/notes if present
        if (eq.brand) eqLine += ` [${eq.brand}]`;
        if (eq.notes) eqLine += ` - ${eq.notes}`;

        result += eqLine;
      }
    } else {
      result += '\n    Equipment: none';
    }

    return result;
  }).join('\n\n');
}

/**
 * Format current workout session for context
 * This data comes from the client (iOS app) not the database
 * Uses the 4-type exercise system: reps, hold, duration, intervals
 * @param {Object} workout - Current workout session from client
 * @returns {string} Formatted string
 */
function formatCurrentWorkout(workout) {
  if (!workout || !workout.exercises || workout.exercises.length === 0) {
    return 'No active workout session.';
  }

  const { exercises, currentIndex, totalCompleted } = workout;
  const total = exercises.length;
  const currentExercise = exercises[currentIndex] || exercises[0];

  let result = `Active workout: ${total} exercises, ${totalCompleted || 0} completed\n`;
  result += `Currently viewing: ${currentExercise.name || currentExercise.exercise_name} (${currentIndex + 1}/${total})\n\n`;
  result += 'Exercises:\n';

  exercises.forEach((ex, idx) => {
    const name = ex.name || ex.exercise_name;
    const type = ex.type || ex.exercise_type;
    const isCompleted = ex.completed ? '✓' : ' ';
    const isCurrent = idx === currentIndex ? '→' : ' ';

    let details = '';
    switch (type) {
      case 'reps':
        const sets = ex.sets || (ex.reps ? ex.reps.length : 0);
        const reps = ex.reps ? ex.reps.join('/') : '';
        details = `${sets}x${reps}`;
        if (ex.load_each && ex.load_each[0]) {
          details += ` @${ex.load_each[0]}${ex.load_unit || 'kg'}`;
        }
        break;
      case 'hold':
        const holdSets = ex.sets || (ex.hold_sec ? ex.hold_sec.length : 0);
        const holds = ex.hold_sec ? ex.hold_sec.join('/') + 's' : '';
        details = `${holdSets}x${holds}`;
        break;
      case 'duration':
        details = `${ex.duration_min}min`;
        if (ex.distance && ex.distance_unit) {
          details += ` / ${ex.distance}${ex.distance_unit}`;
        }
        break;
      case 'intervals':
        details = `${ex.rounds}x (${ex.work_sec}s work / ${ex.rest_sec}s rest)`;
        break;
      default:
        // Fallback for any legacy types
        if (ex.sets && ex.reps) {
          const s = ex.sets;
          const r = ex.reps ? ex.reps.join('/') : '';
          details = `${s}x${r}`;
        } else if (ex.duration_min) {
          details = `${ex.duration_min}min`;
        }
    }

    result += `${isCurrent}[${isCompleted}] ${idx + 1}. ${name} (${type}) ${details}\n`;
  });

  return result.trim();
}

module.exports = {
  formatWorkoutHistory,
  formatUserSettings,
  formatUserProfile,
  formatCurrentWorkout,
  formatAllLocations
};
