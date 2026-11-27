import { ROUTINES } from './syllabus';

/** Routines are grouped by time of day, like the habit apps students know. */
export const ROUTINE_PARTS = ['morning', 'afternoon', 'evening'];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const SUGGESTED_ICONS = { morning: ['list-check', 'backpack', 'repeat'], evening: ['check-circle', 'calendar', 'target'] };
/** How long a habit without its own length takes on the plan. */
export const DEFAULT_HABIT_MINS = 5;

/**
 * The student's routine: habits with a time of day and the weekdays they happen on (0 = Sunday).
 * Until the student customises it, the routine is the suggested study steps; their ids match the
 * ticks older versions saved (`morning-0` … `evening-2`).
 */
export function routineOf(profile) {
  if (Array.isArray(profile?.routine)) return profile.routine;
  return ['morning', 'evening'].flatMap((part) =>
    ROUTINES[part].map((name, index) => ({ id: `${part}-${index}`, name, icon: SUGGESTED_ICONS[part][index], part, days: [...EVERY_DAY], createdOn: null })),
  );
}

/** Whether a habit was ticked on a day. Older versions saved the suggested steps as arrays of ticks. */
export function habitDoneOn(log, id) {
  const tick = log?.ticks?.[id];
  if (tick !== undefined) return Boolean(tick);
  const legacy = /^(morning|evening)-(\d)$/.exec(id);
  return legacy ? Boolean(log?.routines?.[legacy[1]]?.[Number(legacy[2])]) : false;
}
