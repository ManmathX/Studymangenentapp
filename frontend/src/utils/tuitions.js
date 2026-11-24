import { clockTime, minutesToTime, timeToMinutes } from './format';

/** Tuition form rows: `{ key, name, days (1 = Monday … 6 = Saturday), start, end }`, times "HH:MM". */

const NEW_TUITION_MINUTES = 60;
let keySeq = 0;

/** A new tuition row. `key` only tells rows apart on screen; it is never saved. */
export function newTuition({ name = '', days = [], start = '16:00', end } = {}) {
  keySeq += 1;
  return { key: `tuition-${keySeq}`, name, days, start, end: end ?? minutesToTime(timeToMinutes(start) + NEW_TUITION_MINUTES) };
}

/** Saved tuitions (times in minutes after midnight) as form rows. */
export const tuitionsToForm = (tuitions) =>
  tuitions.map(({ name, days, start, end }) => newTuition({ name, days: [...days], start: clockTime(start), end: clockTime(end) }));

/** Form rows as the planner takes them. */
export const tuitionsFromForm = (rows) => rows.map(({ name, days, start, end }) => ({ name: name.trim(), days, start, end }));

/** Quick checks before saving, worded for the form. The planner checks clashes too. Returns a message or null. */
export function schoolDayProblem({ schoolStart, schoolEnd, tuitions }) {
  if (timeToMinutes(schoolEnd) <= timeToMinutes(schoolStart)) return 'School has to end after it starts.';
  for (const [index, tuition] of tuitions.entries()) {
    const label = tuition.name.trim() || `Tuition ${index + 1}`;
    if (!tuition.days.length) return `Pick the days for ${label}.`;
    if (timeToMinutes(tuition.end) <= timeToMinutes(tuition.start)) return `${label} has to end after it starts.`;
  }
  return null;
}
