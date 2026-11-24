// Ported from backend/src/common/utils/format.ts (types stripped). Keep both in step if the planner rules change.
import { weekday } from './dates';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Fri 21 Nov" — used in stored explanation text, which must not go stale. */
export function shortDate(key) {
  const [, month, day] = key.split('-').map(Number);
  return `${WEEKDAYS[weekday(key)]} ${day} ${MONTHS[month - 1]}`;
}
