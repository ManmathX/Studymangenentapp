import { BadRequestError } from '../../common/errors/app-error.js';
import { addDays, eachDay, weekday, type DateKey } from '../../common/utils/dates.js';
import type { ExamRepository } from '../exams/exam.repository.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import { toTaskDto, type TaskDto } from '../tasks/task.dto.js';
import { bestDay, DayLoad, layoutDay, limitFor } from './planner.engine.js';
import { PLANNING_HORIZON_DAYS } from './planner.types.js';
import type { ScheduleResult, SchedulingService } from './scheduling.service.js';
import type { StudentContext } from './student-context.js';

/** Days ahead loaded to judge free room when moving work between days. */
const LOAD_WINDOW_DAYS = 45;
const VIEWABLE_PAST_DAYS = 60;

type PlanRow =
  | { type: 'fixed'; start: number; end: number; label: string; kind: 'school' | 'rest' | 'tuition' }
  | { type: 'task'; start: number; end: number; task: TaskDto };

export class PlanService {
  constructor(
    private readonly context: StudentContext,
    private readonly tasks: TaskRepository,
    private readonly exams: ExamRepository,
    private readonly scheduling: SchedulingService,
  ) {}

  async strip(userId: string, from: DateKey | undefined, days: number) {
    const ctx = await this.context.load(userId);
    const first = from ?? ctx.today;
    const last = addDays(first, days - 1);
    const [tasks, exams] = await Promise.all([this.tasks.findInRange(userId, first, last), this.exams.list(userId, first)]);
    const load = new DayLoad(tasks);
    const examDates = new Set(exams.map((exam) => exam.date));
    const suggestedDates = new Set(tasks.filter((task) => task.status === 'suggested').map((task) => task.date));
    return [...eachDay(first, last)].map((date) => ({
      date,
      plannedMins: load.planned(date),
      limitMins: limitFor(ctx.profile, date),
      overloaded: load.isOverloaded(ctx.profile, date),
      hasExam: examDates.has(date),
      hasSuggested: suggestedDates.has(date),
    }));
  }

  async day(userId: string, date: DateKey) {
    const ctx = await this.context.load(userId);
    if (date < addDays(ctx.today, -VIEWABLE_PAST_DAYS) || date > addDays(ctx.today, LOAD_WINDOW_DAYS)) {
      throw new BadRequestError('That day is outside the planner window', 'DATE_OUT_OF_RANGE');
    }
    const windowStart = date < ctx.today ? date : ctx.today;
    const windowTasks = await this.tasks.findInRange(userId, windowStart, addDays(ctx.today, LOAD_WINDOW_DAYS));
    const load = new DayLoad(windowTasks);
    const dayTasks = windowTasks.filter((task) => task.date === date);
    const layout = layoutDay(ctx.profile, date, dayTasks);
    const plannedMins = load.planned(date);
    const limitMins = limitFor(ctx.profile, date);
    const overloaded = plannedMins > limitMins;

    const rows: PlanRow[] = layout.rows.map((row) =>
      row.type === 'fixed'
        ? row
        : { type: 'task', start: row.start, end: row.end, task: toTaskDto(row.task) },
    );

    return {
      date,
      today: ctx.today,
      ageMode: ctx.profile.ageMode,
      plannedMins,
      limitMins,
      overloaded,
      tuitionDay: ctx.profile.tuitionDays.includes(weekday(date)),
      rows,
      overflow: layout.overflow.map(toTaskDto),
      moveSuggestion: overloaded ? this.relief(load, ctx.profile, ctx.today, date, dayTasks) : null,
      suggestedCount: windowTasks.filter((task) => task.status === 'suggested' && task.date >= ctx.today).length,
      dayOptions: [...eachDay(ctx.start, addDays(ctx.today, PLANNING_HORIZON_DAYS))],
    };
  }

  autoSchedule(userId: string): Promise<ScheduleResult> {
    return this.context.load(userId).then((ctx) => this.scheduling.suggestForStudent(userId, ctx));
  }

  async acceptAll(userId: string): Promise<{ accepted: number }> {
    const ctx = await this.context.load(userId);
    return { accepted: await this.tasks.acceptSuggestedFrom(userId, ctx.today) };
  }

  /** On an overloaded day, the lowest-priority open task and the best day to move it to. */
  private relief(
    load: DayLoad,
    profile: Parameters<typeof limitFor>[0],
    today: DateKey,
    date: DateKey,
    dayTasks: { id: string; title: string; mins: number; score: number; done: boolean; status: string; deadline: string }[],
  ) {
    const candidate = dayTasks
      .filter((task) => task.status === 'accepted' && !task.done)
      .sort((a, b) => a.score - b.score)[0];
    if (!candidate) return null;
    const from = date === today ? addDays(today, 1) : today;
    const to = candidate.deadline > date ? candidate.deadline : addDays(date, 6);
    const toDate = bestDay(load, profile, candidate.mins, from, to, date);
    return toDate ? { taskId: candidate.id, title: candidate.title, toDate } : null;
  }
}
