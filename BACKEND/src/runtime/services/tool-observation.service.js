/**
 * File overview:
 * Formats and persists compact durable tool observations.
 *
 * Main functions in this file:
 * - clipText: Clips Text to the supported length.
 * - compactJson: Compacts Json into a bounded string.
 * - formatToolObservation: Formats Tool observation for prompt context.
 * - appendToolObservationEvent: Appends Tool observation event to the transcript.
 */

const { appendSessionEvent } = require('./transcript-write.service');

const MAX_OBSERVATION_CHARS = 1800;
const MAX_PREVIEW_CHARS = 220;

/**
 * Clips Text to the supported length.
 */
function clipText(value, maxLength = MAX_PREVIEW_CHARS) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

/**
 * Compacts Json into a bounded string.
 */
function compactJson(value, maxLength = MAX_OBSERVATION_CHARS) {
  try {
    return clipText(JSON.stringify(value), maxLength);
  } catch (error) {
    return clipText(String(value || ''), maxLength);
  }
}

function formatErrorObservation(toolResult) {
  const error = toolResult && toolResult.error && typeof toolResult.error === 'object'
    ? toolResult.error
    : {};
  const lines = [
    `Status: ${toolResult && toolResult.status ? toolResult.status : 'error'}`
  ];

  if (error.code) {
    lines.push(`Code: ${error.code}`);
  }

  if (error.explanation) {
    lines.push(`Explanation: ${clipText(error.explanation, 500)}`);
  }

  if (error.agent_guidance) {
    lines.push(`Guidance: ${clipText(error.agent_guidance, 500)}`);
  }

  return lines.join('\n');
}

function formatMemorySearch(output) {
  const results = Array.isArray(output && output.results) ? output.results : [];
  const lines = [
    `Search backend: ${output && output.backend ? output.backend : 'unknown'}`,
    `Results returned: ${results.length}`
  ];

  for (const [index, result] of results.slice(0, 4).entries()) {
    const source = result.sourceType || 'unknown';
    const score = Number.isFinite(Number(result.score))
      ? ` score=${Math.round(Number(result.score) * 1000) / 1000}`
      : '';
    lines.push(`${index + 1}. ${source}${score}: ${clipText(result.content, 260)}`);
  }

  return lines.join('\n');
}

function formatWorkoutHistory(output) {
  const history = output && output.history ? output.history : {};
  const window = history.window || {};
  const summary = history.summary || {};
  const sessions = Array.isArray(history.sessions) ? history.sessions : [];
  const lines = [
    `Window: ${window.startDate || '?'} to ${window.endDate || '?'}; returned ${window.returnedSessions ?? sessions.length}${window.hasMore ? ' (more available)' : ''}.`,
    `Summary: ${summary.totalSessions ?? sessions.length} sessions; statuses ${compactJson(summary.statusCounts || {}, 180)}; completed sets ${summary.completedSets ?? 0}/${summary.totalSets ?? 0}.`
  ];

  for (const [index, session] of sessions.slice(0, 5).entries()) {
    const title = session.title || session.workoutTitle || session.name || 'Untitled workout';
    const status = session.status || 'unknown';
    const date = session.sessionDate || session.date || 'unknown date';
    const completedSets = session.completedSets ?? session.completed_sets ?? null;
    const totalSets = session.totalSets ?? session.total_sets ?? null;
    const setSummary = completedSets !== null && totalSets !== null
      ? `, sets ${completedSets}/${totalSets}`
      : '';
    lines.push(`${index + 1}. ${date}: ${title} (${status}${setSummary})`);
  }

  return lines.join('\n');
}

function formatWorkoutOutput(output) {
  const workout = output && output.workout ? output.workout : {};
  const command = output && output.command ? output.command : null;
  const lines = [
    `Workout: ${workout.title || workout.name || workout.workoutTitle || workout.workoutSessionId || 'updated'}`,
    `Status: ${workout.status || workout.sessionStatus || 'unknown'}`,
    `State version: ${workout.stateVersion ?? workout.state_version ?? 'unknown'}`
  ];

  if (Array.isArray(workout.exercises)) {
    lines.push(`Exercises: ${workout.exercises.length}`);
  }

  if (command && command.commandType) {
    lines.push(`Command: ${command.commandType} (${command.status || 'unknown'})`);
  }

  return lines.join('\n');
}

function formatDocumentOutput(output) {
  return [
    `Document: ${output && (output.docKey || output.docType) ? (output.docKey || output.docType) : 'unknown'}`,
    `Version: ${output && output.currentVersion != null ? output.currentVersion : 'unknown'}`,
    `Changed: ${output && output.changed === false ? 'no' : 'yes'}`,
    output && output.reason ? `Reason: ${clipText(output.reason, 400)}` : null,
    output && output.dateKey ? `Date: ${output.dateKey}` : null
  ].filter(Boolean).join('\n');
}

function formatMessageOutput(toolName, output) {
  const delivery = output && output.delivery ? output.delivery : 'unknown';
  const skipped = output && output.skipped ? `; skipped=${output.skipReason || 'yes'}` : '';
  const kind = toolName === 'message_ask_user' ? 'question' : 'message';
  return `User-facing ${kind}: delivery=${delivery}${skipped}.`;
}

/**
 * Formats Tool observation for prompt context.
 */
function formatToolObservation({ toolName, toolResult }) {
  const result = toolResult && typeof toolResult === 'object' ? toolResult : {};
  const output = result.output && typeof result.output === 'object' ? result.output : {};

  if (result.status && result.status !== 'ok') {
    return clipText(formatErrorObservation(result), MAX_OBSERVATION_CHARS);
  }

  switch (toolName) {
    case 'memory_search':
      return clipText(formatMemorySearch(output), MAX_OBSERVATION_CHARS);
    case 'workout_history_fetch':
      return clipText(formatWorkoutHistory(output), MAX_OBSERVATION_CHARS);
    case 'workout_generate':
    case 'workout_session_control':
    case 'workout_rewrite_remaining':
    case 'workout_replace_exercise':
    case 'workout_adjust_set_targets':
    case 'workout_record_set_result':
    case 'workout_skip_exercise':
    case 'workout_finish_session':
      return clipText(formatWorkoutOutput(output), MAX_OBSERVATION_CHARS);
    case 'document_replace_text':
    case 'document_replace_entire':
    case 'episodic_note_append':
      return clipText(formatDocumentOutput(output), MAX_OBSERVATION_CHARS);
    case 'message_notify_user':
    case 'message_ask_user':
      return clipText(formatMessageOutput(toolName, output), MAX_OBSERVATION_CHARS);
    case 'idle':
      return 'No user-facing reply needed for this trigger.';
    default:
      return compactJson(output || result, MAX_OBSERVATION_CHARS);
  }
}

/**
 * Appends Tool observation event to the transcript.
 */
async function appendToolObservationEvent({
  run,
  iteration,
  toolCall,
  toolResult
}) {
  if (!run || !toolCall || !toolCall.name) {
    return null;
  }

  const observation = formatToolObservation({
    toolName: toolCall.name,
    toolResult
  });

  if (!observation) {
    return null;
  }

  return appendSessionEvent({
    userId: run.user_id,
    sessionKey: run.session_key,
    sessionId: run.session_id,
    eventType: 'tool.result',
    actor: 'tool',
    runId: run.run_id,
    payload: {
      toolName: toolCall.name,
      toolUseId: toolCall.id || null,
      iteration,
      resultStatus: toolResult && toolResult.status ? toolResult.status : null,
      observation
    },
    idempotencyKey: `tool.result:${run.run_id}:${toolCall.id || `${iteration}:${toolCall.name}`}`
  });
}

module.exports = {
  appendToolObservationEvent,
  formatToolObservation
};
