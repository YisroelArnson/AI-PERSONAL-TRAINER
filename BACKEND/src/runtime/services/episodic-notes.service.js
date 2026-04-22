/**
 * File overview:
 * Implements runtime service logic for episodic notes.
 *
 * Main functions in this file:
 * - normalizeWindowDays: Normalizes Window days into the format this file expects.
 * - getDateKeysForReadStrategy: Gets Date keys for read strategy needed by this file.
 * - listBootstrapEpisodicNotes: Lists Bootstrap episodic notes for the caller.
 * - formatBootstrapEpisodicNotes: Formats Bootstrap episodic notes for display or logging.
 */

const { getLatestDocVersionsByDocKeys } = require('./memory-docs.service');
const { getDateKeyInTimezone, shiftDateKey } = require('./timezone-date.service');

/**
 * Normalizes Window days into the format this file expects.
 */
function normalizeWindowDays(value) {
  return Math.max(1, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 1);
}

/**
 * Gets Date keys for read strategy needed by this file.
 */
function getDateKeysForReadStrategy({ now = new Date(), timezone, readStrategy, customWindowDays }) {
  const todayKey = getDateKeyInTimezone(now, timezone);

  switch (readStrategy) {
    case 'today_only':
      return [todayKey];
    case 'today_and_yesterday':
      return [todayKey, shiftDateKey(todayKey, -1)];
    case 'custom_window_days': {
      const windowDays = normalizeWindowDays(customWindowDays);
      return Array.from({ length: windowDays }, (_, index) => shiftDateKey(todayKey, -index));
    }
    case 'current_week':
      // Inference: treat current_week as a 7-day rolling local window until a stricter calendar-week rule is chosen.
      return Array.from({ length: 7 }, (_, index) => shiftDateKey(todayKey, -index));
    default:
      return [todayKey, shiftDateKey(todayKey, -1)];
  }
}

/**
 * Lists Bootstrap episodic notes for the caller.
 */
async function listBootstrapEpisodicNotes({
  userId,
  timezone,
  readStrategy,
  customWindowDays
}) {
  const dateKeys = getDateKeysForReadStrategy({
    timezone,
    readStrategy,
    customWindowDays
  });
  const docKeys = dateKeys.map(dateKey => `EPISODIC_DATE:${dateKey}`);
  const records = await getLatestDocVersionsByDocKeys(userId, docKeys);
  const recordsByKey = new Map(records.map(record => [record.doc.doc_key, record]));

  return docKeys
    .map(docKey => recordsByKey.get(docKey))
    .filter(Boolean)
    .map(record => ({
      dateKey: record.doc.doc_key.replace(/^EPISODIC_DATE:/, ''),
      docKey: record.doc.doc_key,
      currentVersion: record.doc.current_version,
      content: record.version.content
    }));
}

/**
 * Formats Bootstrap episodic notes for display or logging.
 */
function formatBootstrapEpisodicNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return '';
  }

  return [
    'These date-keyed episodic notes were loaded because this is the start of a new session.',
    ...notes.map(note => `### ${note.docKey}\n${String(note.content || '').trim()}`)
  ].join('\n\n');
}

module.exports = {
  formatBootstrapEpisodicNotes,
  getDateKeysForReadStrategy,
  listBootstrapEpisodicNotes
};
