import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';
import type { PaginationQuery } from '../../common/http/page.js';
import { addDays, diffDays } from '../../common/utils/dates.js';
import type { TransactionRunner } from '../../database/transaction.js';
import { priority } from '../planner/planner.engine.js';
import type { StudentContext } from '../planner/student-context.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import { toTaskDto } from '../tasks/task.dto.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { HomeworkRecord, HomeworkRepository } from './homework.repository.js';

export interface NewHomeworkInput {
  subject: SubjectId;
  title: string;
  note: string;
  due: string;
  mins: number;
  difficulty: number;
}

const DEFAULT_WEIGHT = 5;

export class HomeworkService {
  constructor(
    private readonly context: StudentContext,
    private readonly homework: HomeworkRepository,
    private readonly tasks: TaskRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  page(userId: string, done: boolean, query: PaginationQuery) {
    return this.homework.pageByStatus(userId, done, query);
  }

  async summary(userId: string) {
    const ctx = await this.context.load(userId);
    const open = await this.homework.listOpen(userId);
    const weekEnd = addDays(ctx.today, 7);
    return {
      today: ctx.today,
      dueThisWeek: open.filter((item) => item.due <= weekEnd).length,
      overdue: open.filter((item) => item.due < ctx.today).length,
      doneThisWeek: await this.homework.countDoneSince(userId, addDays(ctx.today, -6)),
    };
  }

  /** Saves homework and plans a task for the day before it is due. */
  async create(userId: string, input: NewHomeworkInput) {
    const ctx = await this.context.load(userId);
    if (!ctx.profile.subjects.includes(input.subject))
      throw new BadRequestError('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    if (input.due < ctx.today)
      throw new BadRequestError('Pick a due date from today onwards', 'DUE_IN_PAST');
    const day = input.due > ctx.today ? addDays(input.due, -1) : ctx.today;
    return this.transactions.run(async (tx) => {
      const homework = await this.homework.create(
        userId,
        { ...input, teacher: 'Teacher’s note', weight: DEFAULT_WEIGHT, done: false, doneOn: null },
        tx,
      );
      const [task] = await this.tasks.insertMany(
        userId,
        [
          {
            date: day,
            subject: input.subject,
            title: input.title,
            kind: 'homework',
            mins: input.mins,
            homeworkId: homework.id,
            deadline: day,
            source: 'me',
            status: 'accepted',
            score: priority(
              Math.max(1, diffDays(ctx.today, input.due)),
              DEFAULT_WEIGHT,
              input.difficulty,
            ),
          },
        ],
        tx,
      );
      return { homework, task: toTaskDto(task!) };
    });
  }

  /** Marks homework done (or pending again). Done homework drops its unaccepted suggestions. */
  async setDone(userId: string, id: string, done: boolean): Promise<HomeworkRecord> {
    const ctx = await this.context.load(userId);
    const updated = await this.homework.setDone(userId, id, done, done ? ctx.today : null);
    if (!updated) throw new NotFoundError('Homework not found', 'HOMEWORK_NOT_FOUND');
    if (done) await this.tasks.skipSuggestedForHomework(userId, id, ctx.today);
    return updated;
  }

  /** Deletes homework and its unfinished tasks; minutes already studied stay in the history. */
  async remove(userId: string, id: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      if (!(await this.homework.delete(userId, id, tx))) {
        throw new NotFoundError('Homework not found', 'HOMEWORK_NOT_FOUND');
      }
      await this.tasks.releaseHomework(userId, id, tx);
    });
  }
}
