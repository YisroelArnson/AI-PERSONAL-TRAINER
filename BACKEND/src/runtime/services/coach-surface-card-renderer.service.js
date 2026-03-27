function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatLoad(load) {
  if (!load || typeof load.value !== 'number') {
    return null;
  }

  const numberText = formatNumber(load.value);
  return load.unit ? `${numberText} ${load.unit}` : numberText;
}

function formatTarget(target) {
  if (!target || typeof target !== 'object') {
    return null;
  }

  const parts = [];

  if (typeof target.reps === 'number') {
    parts.push(`${target.reps} reps`);
  } else if (target.repRange && typeof target.repRange.min === 'number' && typeof target.repRange.max === 'number') {
    parts.push(`${target.repRange.min}-${target.repRange.max} reps`);
  }

  const loadText = formatLoad(target.load);
  if (loadText) {
    parts.push(`@ ${loadText}`);
  } else if (target.loadPrescription && target.loadPrescription.text) {
    parts.push(String(target.loadPrescription.text).trim());
  }

  if (typeof target.durationSec === 'number') {
    parts.push(`${target.durationSec} sec`);
  }

  if (typeof target.distanceM === 'number') {
    parts.push(`${target.distanceM} m`);
  }

  if (typeof target.rpe === 'number') {
    parts.push(`RPE ${formatNumber(target.rpe)}`);
  }

  return parts.length > 0 ? parts.join(' • ') : null;
}

function buildMetric(id, label, value, tone = 'neutral') {
  if (!value) {
    return null;
  }

  return {
    id,
    label,
    value,
    tone
  };
}

function buildCardAction({
  id,
  label,
  icon,
  actionType = 'submit_message',
  semanticAction,
  triggerType = 'user.message',
  message,
  style = 'secondary',
  metadata = {}
}) {
  return {
    id,
    label,
    icon,
    actionType,
    semanticAction,
    triggerType,
    message,
    style,
    metadata: {
      source: 'coach_surface_workout_card',
      ...metadata
    }
  };
}

function findCurrentExercise(workout) {
  if (!workout || !Array.isArray(workout.exercises)) {
    return null;
  }

  return (
    workout.exercises.find(exercise => exercise.workoutExerciseId === workout.currentExerciseId) ||
    workout.exercises.find(exercise => exercise.orderIndex === workout.currentExerciseIndex) ||
    workout.exercises.find(exercise => exercise.status === 'active') ||
    workout.exercises.find(exercise => exercise.status === 'pending') ||
    null
  );
}

function findCurrentSet(workout, exercise) {
  if (!workout || !exercise || !Array.isArray(exercise.sets)) {
    return null;
  }

  return (
    exercise.sets.find(set => set.setIndex === workout.currentSetIndex) ||
    exercise.sets.find(set => set.status === 'active') ||
    exercise.sets.find(set => set.status === 'pending') ||
    null
  );
}

function buildCurrentWorkoutActions(workout) {
  if (!workout) {
    return [];
  }

  if (workout.currentPhase === 'preview' || workout.status === 'queued') {
    return [
      buildCardAction({
        id: 'start_workout',
        label: 'Start',
        icon: 'play.fill',
        actionType: 'start_workout',
        semanticAction: 'workout_start',
        style: 'primary'
      }),
      buildCardAction({
        id: 'finish_workout',
        label: 'Finish',
        icon: 'xmark.circle',
        actionType: 'finish_workout',
        semanticAction: 'workout_finish',
        style: 'secondary'
      })
    ];
  }

  if (workout.status === 'paused') {
    return [
      buildCardAction({
        id: 'resume_workout',
        label: 'Resume',
        icon: 'play.fill',
        actionType: 'resume_workout',
        semanticAction: 'workout_resume',
        style: 'primary'
      }),
      buildCardAction({
        id: 'skip_exercise',
        label: 'Skip',
        icon: 'forward.fill',
        actionType: 'skip_current_exercise',
        semanticAction: 'workout_skip_exercise',
        style: 'secondary'
      }),
      buildCardAction({
        id: 'finish_workout',
        label: 'Finish',
        icon: 'stop.fill',
        actionType: 'finish_workout',
        semanticAction: 'workout_finish',
        style: 'secondary'
      })
    ];
  }

  return [
    buildCardAction({
      id: 'complete_set',
      label: 'Done',
      icon: 'checkmark',
      actionType: 'complete_current_set',
      semanticAction: 'workout_complete_set',
      triggerType: 'ui.action.complete_set',
      style: 'primary'
    }),
    buildCardAction({
      id: 'skip_exercise',
      label: 'Skip',
      icon: 'forward.fill',
      actionType: 'skip_current_exercise',
      semanticAction: 'workout_skip_exercise',
      style: 'secondary'
    }),
    buildCardAction({
      id: 'pause_workout',
      label: 'Pause',
      icon: 'pause.fill',
      actionType: 'pause_workout',
      semanticAction: 'workout_pause',
      style: 'secondary'
    }),
    buildCardAction({
      id: 'finish_workout',
      label: 'Finish',
      icon: 'stop.fill',
      actionType: 'finish_workout',
      semanticAction: 'workout_finish',
      style: 'secondary'
    })
  ];
}

function buildSummaryWorkoutActions() {
  return [
    buildCardAction({
      id: 'post_workout_recap',
      label: 'Recap',
      icon: 'text.append',
      semanticAction: 'workout_post_recap',
      message: 'Give me a quick recap of this workout.',
      style: 'secondary'
    })
  ];
}

function buildCurrentWorkoutCard(workout) {
  const currentExercise = findCurrentExercise(workout);
  const currentSet = findCurrentSet(workout, currentExercise);
  const setTargetText = formatTarget(currentSet ? currentSet.target : null);
  const progress = workout.progress || {
    completedExercises: 0,
    totalExercises: 0,
    completedSets: 0,
    totalSets: 0,
    remainingExercises: 0
  };
  const currentExerciseOrdinal = currentExercise ? currentExercise.orderIndex + 1 : null;
  const setOrdinal = currentSet ? currentSet.setIndex + 1 : null;
  const exerciseCount = Array.isArray(workout.exercises) ? workout.exercises.length : progress.totalExercises;
  const subtitleBase = currentExerciseOrdinal != null && exerciseCount
    ? `Exercise ${currentExerciseOrdinal} of ${exerciseCount}`
    : null;

  return {
    type: 'workout_current',
    workoutSessionId: workout.workoutSessionId,
    title: workout.title || 'Current workout',
    subtitle: subtitleBase,
    phase: workout.currentPhase,
    progressLabel: `${progress.completedSets} of ${progress.totalSets} sets done`,
    currentExerciseName: currentExercise ? currentExercise.displayName || currentExercise.exerciseName : null,
    currentSetLabel: setOrdinal != null
      ? [ `Set ${setOrdinal} of ${currentExercise ? currentExercise.sets.length : 0}`, setTargetText ]
          .filter(Boolean)
          .join(' • ')
      : setTargetText,
    coachCue: (
      (currentExercise && currentExercise.coachMessage) ||
      (currentExercise && currentExercise.prescription && currentExercise.prescription.coachingCues && currentExercise.prescription.coachingCues[0]) ||
      (currentExercise && currentExercise.prescription && currentExercise.prescription.intensityCue) ||
      null
    ),
    metrics: [
      buildMetric(
        'exercise-progress',
        'Exercises',
        `${progress.completedExercises}/${progress.totalExercises}`,
        progress.completedExercises > 0 ? 'success' : 'neutral'
      ),
      buildMetric('set-target', 'Target', setTargetText),
      buildMetric(
        'rest',
        'Rest',
        (() => {
          const restSec = (
            (currentSet && currentSet.target && currentSet.target.restSec) ||
            (currentExercise && currentExercise.prescription && currentExercise.prescription.restSec) ||
            null
          );
          return typeof restSec === 'number' ? `${restSec} sec` : null;
        })()
      )
    ].filter(Boolean),
    actions: buildCurrentWorkoutActions(workout)
  };
}

function buildWorkoutSummaryCard(workout) {
  const progress = workout.progress || {
    completedExercises: 0,
    totalExercises: 0,
    completedSets: 0,
    totalSets: 0
  };
  const highlights = [
    workout.summary && workout.summary.coachSummary,
    workout.summary && workout.summary.agentSummary,
    workout.summary && workout.summary.adaptationSummary
  ].filter(Boolean);

  return {
    type: 'workout_summary',
    workoutSessionId: workout.workoutSessionId,
    title: workout.title || 'Workout complete',
    subtitle: workout.status === 'completed'
      ? 'Session finished'
      : `Session ${workout.status}`,
    highlights,
    metrics: [
      buildMetric(
        'exercise-progress',
        'Exercises',
        `${progress.completedExercises}/${progress.totalExercises}`,
        progress.completedExercises === progress.totalExercises ? 'success' : 'warning'
      ),
      buildMetric(
        'set-progress',
        'Sets',
        `${progress.completedSets}/${progress.totalSets}`,
        progress.completedSets === progress.totalSets ? 'success' : 'warning'
      )
    ].filter(Boolean),
    actions: buildSummaryWorkoutActions()
  };
}

function buildWorkoutFeedCard(workout) {
  if (
    !workout ||
    !workout.workoutSessionId ||
    !Array.isArray(workout.exercises) ||
    workout.exercises.length === 0 ||
    !workout.progress ||
    workout.progress.totalSets <= 0
  ) {
    return null;
  }

  if (workout.currentPhase === 'finished' || ['completed', 'canceled', 'abandoned'].includes(workout.status)) {
    return {
      id: `workout:${workout.workoutSessionId}:summary`,
      eventType: 'workout.card.summary',
      text: workout.summary && workout.summary.coachSummary
        ? workout.summary.coachSummary
        : 'Workout session finished.',
      card: buildWorkoutSummaryCard(workout),
      pin: false
    };
  }

  return {
    id: `workout:${workout.workoutSessionId}:current`,
    eventType: 'workout.card.current',
    text: workout.currentPhase === 'preview'
      ? 'Your workout is ready to start.'
      : 'Your current workout is live.',
    card: buildCurrentWorkoutCard(workout),
    pin: ['queued', 'in_progress', 'paused'].includes(workout.status)
  };
}

function buildWorkoutSurfaceDecorations({ workout, activeRun }) {
  const feedCard = buildWorkoutFeedCard(workout);

  if (!feedCard) {
    return {
      feedItems: [],
      pinnedCard: null
    };
  }

  return {
    feedItems: [
      {
        id: feedCard.id,
        kind: 'card',
        role: 'assistant',
        text: feedCard.text,
        eventType: feedCard.eventType,
        runId: activeRun ? activeRun.runId : null,
        seqNum: null,
        occurredAt: workout.completedAt || workout.startedAt || new Date().toISOString(),
        card: feedCard.card
      }
    ],
    pinnedCard: feedCard.pin
      ? {
          feedItemId: feedCard.id,
          reason: 'active_workout',
          placement: 'above_composer'
        }
      : null
  };
}

module.exports = {
  buildWorkoutSurfaceDecorations
};
