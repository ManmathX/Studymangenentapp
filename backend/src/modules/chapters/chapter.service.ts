import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { addDays, diffDays } from '../../common/utils/dates.js';
import type { ExamRepository } from '../exams/exam.repository.js';
import { chapterDeadline, DayLoad, priority, proposeDays, stepsFor } from '../planner/planner.engine.js';
import { PLANNING_HORIZON_DAYS, REVISION_INTERVALS, type ChapterStatus } from '../planner/planner.types.js';
import type { StudentContext, StudentDay } from '../planner/student-context.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import { toTaskDto } from '../tasks/task.dto.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { ChapterRecord, ChapterRepository } from './chapter.repository.js';

export class ChapterService {
  constructor(
    private readonly context: StudentContext,
    private readonly chapters: ChapterRepository,
    private readonly tasks: TaskRepository,
    private readonly exams: ExamRepository,
  ) {}

  /** Chapters with how many open steps are planned from today on (one task query, no N+1). */
  async list(userId: string, filter: { subject?: SubjectId; status?: ChapterStatus }) {
    const ctx = await this.context.load(userId);
    const [chapters, liveTasks] = await Promise.all([this.chapters.list(userId, filter), this.tasks.findLiveFrom(userId, ctx.today)]);
    const plannedCount = new Map<string, number>();
    for (const task of liveTasks) {
      if (task.chapterKey && !task.done) plannedCount.set(task.chapterKey, (plannedCount.get(task.chapterKey) ?? 0) + 1);
    }
    return chapters.map((chapter) => ({ ...chapter, plannedCount: plannedCount.get(chapter.key) ?? 0 }));
  }

  async setStatus(userId: string, key: string, status: ChapterStatus): Promise<ChapterRecord> {
    const ctx = await this.context.load(userId);
    const chapter = await this.require(userId, key);
    const startsLearning = status === 'learning' && !chapter.learnedOn;
    const updated = await this.chapters.update(userId, key, {
      status,
      ...(startsLearning ? { learnedOn: ctx.today, revisions: 0 } : {}),
    });
    if (!updated) throw new NotFoundError('Chapter not found', 'CHAPTER_NOT_FOUND');
    return updated;
  }

  async proposal(userId: string, key: string) {
    const ctx = await this.context.load(userId);
    const chapter = await this.require(userId, key);
    const [liveTasks, upcomingExams] = await Promise.all([this.tasks.findLiveFrom(userId, ctx.today), this.exams.list(userId, ctx.today)]);
    const steps = stepsFor(chapter);
    const { exam, deadline } = chapterDeadline(key, upcomingExams, ctx.today);
    const days = proposeDays(new DayLoad(liveTasks), ctx.profile, steps.map((step) => step.mins), deadline, ctx.today, ctx.start);
    const dayOptions: string[] = [];
    for (let date = ctx.start; date <= addDays(ctx.today, PLANNING_HORIZON_DAYS); date = addDays(date, 1)) dayOptions.push(date);
    return {
      chapter,
      exam: exam ? { id: exam.id, name: exam.name, date: exam.date } : null,
      steps: steps.map((step, index) => ({ index, ...step, proposedDate: days[index] ?? ctx.start })),
      alreadyPlanned: liveTasks.filter((task) => task.chapterKey === key && !task.done).map(toTaskDto),
      dayOptions,
    };
  }

  async schedule(userId: string, key: string, selections: { index: number; date: string }[]) {
    const ctx = await this.context.load(userId);
    const chapter = await this.require(userId, key);
    const steps = stepsFor(chapter);
    const lastDay = addDays(ctx.today, PLANNING_HORIZON_DAYS);
    const seen = new Set<number>();
    for (const selection of selections) {
      if (selection.index >= steps.length || seen.has(selection.index)) throw new BadRequestError('Pick each step once', 'INVALID_STEP');
      if (selection.date < ctx.start || selection.date > lastDay) throw new BadRequestError('Pick days within the next two weeks', 'DATE_OUT_OF_RANGE');
      seen.add(selection.index);
    }
    const upcomingExams = await this.exams.list(userId, ctx.today);
    const { exam, deadline } = chapterDeadline(key, upcomingExams, ctx.today);
    const score = priority(
      Math.max(1, diffDays(ctx.today, exam ? exam.date : addDays(deadline, 1))),
      exam ? exam.weight : 10,
      chapter.difficulty,
    );
    const created = await this.tasks.insertMany(
      userId,
      selections.map((selection) => {
        const step = steps[selection.index]!;
        return {
          date: selection.date,
          subject: chapter.subject,
          title: `${chapter.name}: ${step.title}`,
          kind: step.kind,
          mins: step.mins,
          chapterKey: key,
          deadline: deadline >= selection.date ? deadline : selection.date,
          source: 'me' as const,
          status: 'accepted' as const,
          score,
        };
      }),
    );
    return created.map(toTaskDto);
  }

  /** Adds today's 15-minute spaced revision for a chapter and advances its revision count. */
  async addRevision(userId: string, key: string) {
    const ctx = await this.context.load(userId);
    const chapter = await this.require(userId, key);
    const interval = REVISION_INTERVALS[chapter.revisions];
    if (!chapter.learnedOn || interval === undefined) throw new ConflictError('No revision is due for this chapter', 'NO_REVISION_DUE');
    const [task] = await this.tasks.insertMany(userId, [
      {
        date: ctx.today,
        subject: chapter.subject,
        title: `${chapter.name}: ${interval}-day revision`,
        kind: 'revision',
        mins: 15,
        chapterKey: key,
        deadline: ctx.today,
        source: 'app',
        status: 'accepted',
        score: 4,
      },
    ]);
    const updated = await this.chapters.update(userId, key, { revisions: chapter.revisions + 1 });
    return { task: toTaskDto(task!), chapter: updated };
  }

  async snooze(userId: string, key: string) {
    const ctx: StudentDay = await this.context.load(userId);
    await this.require(userId, key);
    return this.chapters.update(userId, key, { snoozedUntil: addDays(ctx.today, 1) });
  }

  private async require(userId: string, key: string): Promise<ChapterRecord> {
    const chapter = await this.chapters.findByKey(userId, key);
    if (!chapter) throw new NotFoundError('Chapter not found', 'CHAPTER_NOT_FOUND');
    return chapter;
  }
}
