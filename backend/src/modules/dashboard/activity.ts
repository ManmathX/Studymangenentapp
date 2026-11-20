import { addDays, eachDay, type DateKey } from '../../common/utils/dates.js';
import type { ExamRepository } from '../exams/exam.repository.js';
import type { HabitsRepository } from '../habits/habits.repository.js';
import { streak, type DayState } from '../planner/planner.engine.js';
import type { StudentDay } from '../planner/student-context.js';
import type { TaskRepository } from '../tasks/task.repository.js';

/** Days of history loaded for the streak. Longer streaks are shown as this cap. */
export const STREAK_LOOKBACK_DAYS = 180;

export interface Activity {
  minutesOn(date: DateKey): number;
  stateOf(date: DateKey): DayState;
  streak: number;
  restDaysThisWeek: number;
}

/**
 * Study minutes per day come from finished tasks plus focus sessions (two grouped
 * aggregations); rest days come from daily logs. Nothing about history is stored twice.
 */
export async function loadActivity(
  userId: string,
  ctx: StudentDay,
  repos: { tasks: TaskRepository; habits: HabitsRepository; exams: ExamRepository },
): Promise<Activity> {
  const from = addDays(ctx.today, -STREAK_LOOKBACK_DAYS);
  const [taskMinutes, focusMinutes, logs, exams] = await Promise.all([
    repos.tasks.doneMinutesByDay(userId, from, ctx.today),
    repos.habits.focusMinutesByDay(userId, from, ctx.today),
    repos.habits.findLogs(userId, from, ctx.today),
    repos.exams.list(userId, from),
  ]);
  const restDays = new Set(logs.filter((log) => log.rest).map((log) => log.date));
  const examDays = new Set(exams.map((exam) => exam.date));
  const minutesOn = (date: DateKey) => (taskMinutes.get(date) ?? 0) + (focusMinutes.get(date) ?? 0);
  const stateOf = (date: DateKey): DayState => {
    if (date > ctx.today || date < from) return null;
    if (minutesOn(date) > 0) return 'study';
    if (restDays.has(date)) return 'rest';
    if (examDays.has(date)) return 'exam';
    if (date < ctx.today && date >= ctx.profile.trackingStart) return 'missed';
    return null;
  };
  const restDaysThisWeek = [...eachDay(addDays(ctx.today, -6), ctx.today)].filter((date) => stateOf(date) === 'rest').length;
  return { minutesOn, stateOf, streak: streak(stateOf, ctx.today), restDaysThisWeek };
}
