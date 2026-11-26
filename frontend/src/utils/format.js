/** Display formatting only. Dates are "YYYY-MM-DD" keys computed by the server in the student's time zone. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;

function parts(key) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

export function addDays(key, days) {
  const { year, month, day } = parts(key);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

export function weekdayOf(key) {
  return parts(key).weekday;
}

export function shortWeekday(key) {
  return WEEKDAYS[parts(key).weekday];
}

export function dayOfMonth(key) {
  return parts(key).day;
}

export function shortDate(key) {
  const { day, month, weekday } = parts(key);
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
}

export function longDate(key) {
  const { day, month, weekday } = parts(key);
  return `${WEEKDAYS_LONG[weekday]}, ${day} ${MONTHS_LONG[month - 1]}`;
}

export function monthDay(key) {
  const { day, month, weekday } = parts(key);
  return `${WEEKDAYS_LONG[weekday]} ${day} ${MONTHS_LONG[month - 1]}`;
}

/** "December 2026". */
export function monthYear(key) {
  const { month, year } = parts(key);
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

export function shortMonth(key) {
  return MONTHS[parts(key).month - 1];
}

/** "November 2026", "October – November 2026" or "December 2025 – January 2026". */
export function monthRange(from, to) {
  const a = parts(from);
  const b = parts(to);
  if (a.year === b.year && a.month === b.month) return `${MONTHS_LONG[a.month - 1]} ${a.year}`;
  if (a.year === b.year) return `${MONTHS_LONG[a.month - 1]} – ${MONTHS_LONG[b.month - 1]} ${b.year}`;
  return `${MONTHS_LONG[a.month - 1]} ${a.year} – ${MONTHS_LONG[b.month - 1]} ${b.year}`;
}

/** "today", "tomorrow", "Thursday", or "Mon 24 Nov" relative to `today`. */
export function dayName(key, today) {
  const offset = diffDays(today, key);
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  if (offset === -1) return 'yesterday';
  if (offset > 1 && offset < 7) return WEEKDAYS_LONG[parts(key).weekday];
  return shortDate(key);
}

export function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const pad = (value) => String(value).padStart(2, '0');

/** Minutes after midnight → "16:45". */
export function clockTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 95 → "1 h 35 min". */
export function duration(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** 90 → "1.5". */
export function hours(minutes) {
  return (minutes / 60).toFixed(1).replace(/\.0$/, '');
}

export function countdown(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function initialOf(name) {
  return (name || 'S').trim().charAt(0).toUpperCase() || 'S';
}

/** The device's IANA time zone, sent once at setup so "today" matches the student's day. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/** The device's calendar date as a key. Used only before the server knows the student's time zone. */
export function localTodayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "07:45" ↔ minutes after midnight. */
export function timeToMinutes(time) {
  const [hoursPart, minutesPart] = time.split(':').map(Number);
  return hoursPart * 60 + minutesPart;
}

export function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 45, minutes));
  return clockTime(clamped);
}
