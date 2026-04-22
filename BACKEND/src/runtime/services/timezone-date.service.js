
/**
 * Handles To date or throw for timezone-date.service.js.
 */
function toDateOrThrow(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }

  return date;
}

/**
 * Gets Date parts in timezone needed by this file.
 */
function getDatePartsInTimezone(value, timezone) {
  const date = toDateOrThrow(value);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const mapped = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day)
  };
}

/**
 * Formats Date key for display or logging.
 */
function formatDateKey(parts) {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0')
  ].join('-');
}

/**
 * Gets Date key in timezone needed by this file.
 */
function getDateKeyInTimezone(value, timezone) {
  return formatDateKey(getDatePartsInTimezone(value, timezone));
}

/**
 * Handles Shift date key for timezone-date.service.js.
 */
function shiftDateKey(dateKey, deltaDays) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date key');
  }

  date.setUTCDate(date.getUTCDate() + deltaDays);

  return formatDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  });
}

/**
 * Handles Is valid date key for timezone-date.service.js.
 */
function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

module.exports = {
  getDateKeyInTimezone,
  isValidDateKey,
  shiftDateKey
};
