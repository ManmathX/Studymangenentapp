import { BadRequestError, ConflictError } from '../../common/errors/app-error.js';
import { addDays } from '../../common/utils/dates.js';
import { bagFor, nextSchoolDay, periodsFor } from '../planner/planner.engine.js';
import type { StudentContext } from '../planner/student-context.js';
import { isSubjectPeriod, PERIOD_LABELS, SUBJECTS, type SubjectId } from '../syllabus/syllabus.data.js';
import type { HomeworkRepository } from '../homework/homework.repository.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { CheckIn, Routines, ScreenTime } from './daily-log.model.js';
import type { HabitsRepository } from './habits.repository.js';

export const MAX_REST_DAYS_PER_WEEK = 2;
const BAG_DAYS_AHEAD = 7;

export class HabitsService {
  constructor(
    private readonly context: StudentContext,
    private readonly habits: HabitsRepository,
    private readonly tasks: TaskRepository,
    private readonly homework: HomeworkRepository,
  ) {}

  async logFocus(userId: string, input: { subject: SubjectId; mins: number }) {
    const ctx = await this.context.load(userId);
    if (!ctx.profile.subjects.includes(input.subject)) throw new BadRequestError('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    return this.habits.addFocusSession(userId, { date: ctx.today, subject: input.subject, mins: input.mins });
  }

  /** Rest days keep the streak alive, at most two a week and only before any study that day. */
  async takeRestDay(userId: string) {
    const ctx = await this.context.load(userId);
    const weekStart = addDays(ctx.today, -6);
    const [logs, doneMins, focusMins] = await Promise.all([
      this.habits.findLogs(userId, weekStart, ctx.today),
      this.tasks.doneMinutesByDay(userId, ctx.today, ctx.today),
      this.habits.focusMinutesByDay(userId, ctx.today, ctx.today),
    ]);
    if ((doneMins.get(ctx.today) ?? 0) + (focusMins.get(ctx.today) ?? 0) > 0) {
      throw new ConflictError('You already studied today, so it counts as a study day', 'ALREADY_STUDIED');
    }
    if (logs.some((log) => log.date === ctx.today && log.rest)) throw new ConflictError('Today is already a rest day', 'ALREADY_RESTING');
    if (logs.filter((log) => log.rest).length >= MAX_REST_DAYS_PER_WEEK) {
      throw new ConflictError('You have used both rest days this week', 'REST_LIMIT_REACHED');
    }
    return this.habits.upsertLog(userId, ctx.today, { rest: true });
  }

  async saveCheckin(userId: string, input: { sleep: number; breaks: number; screen: ScreenTime }) {
    const ctx = await this.context.load(userId);
    const checkin: CheckIn = { ...input, saved: true };
    return this.habits.upsertLog(userId, ctx.today, { checkin });
  }

  async saveRoutines(userId: string, routines: Routines) {
    const ctx = await this.context.load(userId);
    return this.habits.upsertLog(userId, ctx.today, { routines });
  }

  /** Packing list for a school day (default: the next one) with what is already packed. */
  async bag(userId: string, date?: string) {
    const ctx = await this.context.load(userId);
    const day = date ?? nextSchoolDay(ctx.today);
    this.assertBagDay(day, ctx.today);
    const [dueThatDay, log] = await Promise.all([this.homework.findDueOn(userId, day), this.habits.findLog(userId, day)]);
    const checked = log?.bag ?? {};
    const items = bagFor(day, dueThatDay.filter((item) => !item.done)).map((item) => ({ ...item, checked: Boolean(checked[item.id]) }));
    return {
      date: day,
      periods: periodsFor(day).map((period, index) => ({
        number: index + 1,
        id: period,
        label: isSubjectPeriod(period) ? SUBJECTS[period].name : PERIOD_LABELS[period],
      })),
      items,
      packed: items.filter((item) => item.checked).length,
    };
  }

  async setBagItem(userId: string, date: string, itemId: string, checked: boolean) {
    const current = await this.bag(userId, date);
    if (!current.items.some((item) => item.id === itemId)) throw new BadRequestError('That item is not on this day’s list', 'UNKNOWN_BAG_ITEM');
    await this.habits.upsertLog(userId, date, { bag: { [itemId]: checked } });
    return this.bag(userId, date);
  }

  private assertBagDay(day: string, today: string): void {
    if (day < today || day > addDays(today, BAG_DAYS_AHEAD)) {
      throw new BadRequestError('Pick a day in the coming week', 'DATE_OUT_OF_RANGE');
    }
  }
}
