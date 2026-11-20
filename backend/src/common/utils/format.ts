import { weekday, type DateKey } from './dates.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 21 Nov" — used in stored explanation text, which must not go stale. */
export function shortDate(key: DateKey): string {
  const [, month, day] = key.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[weekday(key)]} ${day} ${MONTHS[month - 1]}`;
}
