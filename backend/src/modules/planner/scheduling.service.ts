import type { TxHandle } from '../../database/transaction.js';
import type { ChapterRepository } from '../chapters/chapter.repository.js';
import type { ExamRepository } from '../exams/exam.repository.js';
import type { HomeworkRepository } from '../homework/homework.repository.js';
import type { NewTask, TaskRecord, TaskRepository } from '../tasks/task.repository.js';
import { DayLoad, planSuggestions, type SuggestionInput } from './planner.engine.js';
import type { SuggestedBlock } from './planner.types.js';
import type { StudentDay } from './student-context.js';

export interface ScheduleResult {
  added: number;
  firstDate: string | null;
}

export function blockToTask(block: SuggestedBlock): NewTask {
  return {
    date: block.date,
    subject: block.subject,
    title: block.title,
    kind: block.kind,
    mins: block.mins,
    deadline: block.deadline,
    score: block.score,
    why: block.why,
    chapterKey: block.chapterKey ?? null,
    homeworkId: block.homeworkId ?? null,
    source: 'app',
    status: 'suggested',
  };
}

export function summarize(blocks: SuggestedBlock[]): ScheduleResult {
  const firstDate = blocks.reduce<string | null>((first, block) => (!first || block.date < first ? block.date : first), null);
  return { added: blocks.length, firstDate };
}

/** Index of live tasks the auto-scheduler needs, built from a single query result. */
export function plannedIndex(tasks: TaskRecord[]) {
  const plannedChapterDates = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.chapterKey || task.status === 'skipped') continue;
    plannedChapterDates.set(task.chapterKey, [...(plannedChapterDates.get(task.chapterKey) ?? []), task.date]);
  }
  return { load: new DayLoad(tasks), plannedChapterDates };
}

/** "Fill free slots before exams": suggests blocks the student can accept, swap or skip. */
export class SchedulingService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly homework: HomeworkRepository,
    private readonly exams: ExamRepository,
    private readonly chapters: ChapterRepository,
  ) {}

  async suggestForStudent(userId: string, ctx: StudentDay, tx?: TxHandle): Promise<ScheduleResult> {
    const [liveTasks, openHomework, upcomingExams, chapters, plannedHomeworkIds] = await Promise.all([
      this.tasks.findLiveFrom(userId, ctx.today),
      this.homework.listOpen(userId),
      this.exams.list(userId, ctx.today),
      this.chapters.list(userId),
      this.tasks.liveHomeworkIds(userId),
    ]);
    const { load, plannedChapterDates } = plannedIndex(liveTasks);
    const blocks = this.plan({
      profile: ctx.profile,
      today: ctx.today,
      start: ctx.start,
      load,
      homework: openHomework,
      exams: upcomingExams,
      chapters,
      plannedHomeworkIds,
      plannedChapterDates,
    });
    await this.tasks.insertMany(userId, blocks.map(blockToTask), tx);
    return summarize(blocks);
  }

  plan(input: SuggestionInput): SuggestedBlock[] {
    return planSuggestions(input);
  }
}
