import {
  BadRequestError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/app-error.js';
import { addDays } from '../../common/utils/dates.js';
import type { ChapterRepository } from '../chapters/chapter.repository.js';
import type { HomeworkRepository } from '../homework/homework.repository.js';
import { bestDay, DayLoad } from '../planner/planner.engine.js';
import type { StudentContext, StudentDay } from '../planner/student-context.js';
import type { SuggestionRepository } from '../suggestions/suggestion.repository.js';
import { toTaskDto } from './task.dto.js';
import type { TaskPageQuery, TaskRecord, TaskRepository } from './task.repository.js';

const LOAD_WINDOW_DAYS = 45;

export class TaskService {
  constructor(
    private readonly context: StudentContext,
    private readonly tasks: TaskRepository,
    private readonly homework: HomeworkRepository,
    private readonly chapters: ChapterRepository,
    private readonly suggestions: SuggestionRepository,
  ) {}

  async page(userId: string, query: TaskPageQuery) {
    const result = await this.tasks.page(userId, query);
    return { items: result.items.map(toTaskDto), total: result.total };
  }

  /**
   * Updates done state and/or day. Finishing a homework task can close the homework;
   * finishing a chapter step moves an unstarted chapter to "learning".
   */
  async update(userId: string, id: string, patch: { done?: boolean; date?: string }) {
    const ctx = await this.context.load(userId);
    const task = await this.require(userId, id);
    if (patch.date !== undefined && patch.date < ctx.today)
      throw new BadRequestError('Pick today or a later day', 'DATE_IN_PAST');

    const updated = await this.tasks.update(userId, id, patch);
    if (!updated) throw new NotFoundError('Task not found', 'TASK_NOT_FOUND');

    let homework = null;
    let chapter = null;
    if (patch.done === true && !task.done) {
      if (task.homeworkId) {
        const item = await this.homework.findById(userId, task.homeworkId);
        if (
          item &&
          !item.done &&
          item.due <= addDays(ctx.today, 1) &&
          task.mins >= item.mins * 0.8
        ) {
          homework = await this.homework.setDone(userId, item.id, true, ctx.today);
        }
      }
      if (task.chapterKey) {
        const current = await this.chapters.findByKey(userId, task.chapterKey);
        if (current?.status === 'not') {
          chapter = await this.chapters.update(userId, current.key, {
            status: 'learning',
            learnedOn: ctx.today,
            revisions: 0,
          });
        }
      }
    }
    if (patch.date !== undefined) await this.suggestions.acceptPendingForTask(userId, id);
    return { task: toTaskDto(updated), homework, chapter };
  }

  async accept(userId: string, id: string) {
    await this.require(userId, id);
    return toTaskDto((await this.tasks.update(userId, id, { status: 'accepted' }))!);
  }

  async skip(userId: string, id: string) {
    await this.require(userId, id);
    return toTaskDto((await this.tasks.update(userId, id, { status: 'skipped' }))!);
  }

  /** Moves a suggestion to the roomiest other day before its deadline and accepts it. */
  async swap(userId: string, id: string) {
    const ctx = await this.context.load(userId);
    const task = await this.require(userId, id);
    const load = await this.loadFrom(userId, ctx);
    const latest = task.deadline > task.date ? task.deadline : addDays(task.date, 4);
    const date =
      bestDay(
        load,
        ctx.profile,
        task.mins,
        maxDate(addDays(task.date, 1), ctx.today),
        latest,
        task.date,
      ) ?? bestDay(load, ctx.profile, task.mins, ctx.today, addDays(task.date, 4), task.date);
    if (!date) throw new UnprocessableError('No other day before the deadline has room', 'NO_ROOM');
    return toTaskDto((await this.tasks.update(userId, id, { date, status: 'accepted' }))!);
  }

  /** Moves a task to the nearby day with the most free time. */
  async moveToBestDay(userId: string, id: string) {
    const ctx = await this.context.load(userId);
    const task = await this.require(userId, id);
    const load = await this.loadFrom(userId, ctx);
    const date = bestDay(
      load,
      ctx.profile,
      task.mins,
      ctx.today,
      addDays(maxDate(task.date, ctx.today), 5),
      task.date,
    );
    if (!date) throw new UnprocessableError('No nearby day has room', 'NO_ROOM');
    return toTaskDto((await this.tasks.update(userId, id, { date }))!);
  }

  private async loadFrom(userId: string, ctx: StudentDay): Promise<DayLoad> {
    return new DayLoad(
      await this.tasks.findInRange(userId, ctx.today, addDays(ctx.today, LOAD_WINDOW_DAYS)),
    );
  }

  private async require(userId: string, id: string): Promise<TaskRecord> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new NotFoundError('Task not found', 'TASK_NOT_FOUND');
    return task;
  }
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
