/**
 * Calendar-date helpers. A "date key" is a local calendar date written as YYYY-MM-DD.
 * Arithmetic runs in UTC so it never drifts across daylight-saving changes.
 */
export type DateKey = string;

const DAY_MS = 86_400_000;
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toUtcMillis(key: DateKey): number {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function fromUtcMillis(ms: number): DateKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  return fromUtcMillis(toUtcMillis(value)) === value;
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromUtcMillis(toUtcMillis(key) + days * DAY_MS);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DateKey, to: DateKey): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: DateKey): number {
  return new Date(toUtcMillis(key)).getUTCDay();
}

export function* eachDay(from: DateKey, to: DateKey): Generator<DateKey> {
  for (let key = from; key <= to; key = addDays(key, 1)) yield key;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date and hour at `now` in the given IANA time zone. */
export function localNow(now: Date, timeZone: string): { date: DateKey; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}
