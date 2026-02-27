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

  return workouts.map(workout => {
    const dateSource = workout.completed_at || workout.started_at;
    const date = dateSource ? new Date(dateSource).toLocaleDateString() : 'Unknown date';
    const title = workout.title || 'Workout';
    const duration = Number.isFinite(Number(workout.actual_duration_min))
      ? `${Math.round(Number(workout.actual_duration_min))}min`
      : 'duration n/a';
    const exercises = Number.isFinite(Number(workout.exercise_count))
      ? `${Number(workout.exercise_count)} exercises`
      : 'exercise count n/a';
    const volume = Number.isFinite(Number(workout.total_volume))
      ? `volume ${Math.round(Number(workout.total_volume))}`
      : null;

    return `${date}: ${title} (${duration}, ${exercises}${volume ? `, ${volume}` : ''})`;
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

    // Format plain-text equipment list
    const equipmentLines = typeof loc.equipment === 'string'
      ? loc.equipment
        .split(/\r?\n|,/)
        .map(s => s.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
      : [];
    if (equipmentLines.length > 0) {
      result += '\n    Equipment:';
      for (const eq of equipmentLines) {
        result += `\n      - ${eq}`;
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
