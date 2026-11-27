// Ported from backend/src/common/utils/dates.ts (types stripped). Keep both in step if the planner rules change.
const DAY_MS = 86_400_000;
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function toUtcMillis(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}
function fromUtcMillis(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
export function isValidDateKey(value) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  return fromUtcMillis(toUtcMillis(value)) === value;
}
export function addDays(key, days) {
  return fromUtcMillis(toUtcMillis(key) + days * DAY_MS);
}
/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from, to) {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / DAY_MS);
}
/** 0 = Sunday … 6 = Saturday. */
export function weekday(key) {
  return new Date(toUtcMillis(key)).getUTCDay();
}
export function* eachDay(from, to) {
  for (let key = from; key <= to; key = addDays(key, 1)) yield key;
}
export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
/** How far the zone's wall clock is ahead of UTC at the moment `ms`, in milliseconds. */
function zoneOffset(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(ms / 1000) * 1000;
}

/**
 * The moment (milliseconds since 1970) when the clock in `timeZone` shows `minutes` after
 * midnight on the day `key`. Reminders are set for these moments.
 */
export function instantAt(key, minutes, timeZone) {
  const wall = toUtcMillis(key) + minutes * 60_000;
  const guess = wall - zoneOffset(wall, timeZone);
  // Across a daylight-saving change the offset at the answer can differ from the first guess.
  return wall - zoneOffset(guess, timeZone);
}

/** The calendar date and hour at `now` in the given IANA time zone. */
export function localNow(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}
