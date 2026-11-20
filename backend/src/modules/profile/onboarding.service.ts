import { BadRequestError, ConflictError } from '../../common/errors/app-error.js';
import type { RequestMeta } from '../../common/http/types.js';
import { addDays } from '../../common/utils/dates.js';
import type { TransactionRunner, TxHandle } from '../../database/transaction.js';
import type { AuditSink } from '../audit/audit.service.js';
import type { ChapterRepository, NewChapter } from '../chapters/chapter.repository.js';
import type { ExamRepository } from '../exams/exam.repository.js';
import type { HabitsRepository } from '../habits/habits.repository.js';
import type { HomeworkRepository } from '../homework/homework.repository.js';
import { DayLoad } from '../planner/planner.engine.js';
import { blockToTask, summarize, type SchedulingService } from '../planner/scheduling.service.js';
import type { StudentContext } from '../planner/student-context.js';
import type { SuggestionRepository } from '../suggestions/suggestion.repository.js';
import { catalogChapters, isSupportedClass } from '../syllabus/syllabus.data.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import { buildDemoData } from './demo-seed.js';
import type { OnboardingBody } from './profile.schemas.js';
import type { NewProfile, ProfileRepository } from './profile.repository.js';
import type { ProfileService } from './profile.service.js';

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
};

export class OnboardingService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly context: StudentContext,
    private readonly profileService: ProfileService,
    private readonly profiles: ProfileRepository,
    private readonly chapters: ChapterRepository,
    private readonly exams: ExamRepository,
    private readonly homework: HomeworkRepository,
    private readonly tasks: TaskRepository,
    private readonly suggestions: SuggestionRepository,
    private readonly habits: HabitsRepository,
    private readonly scheduling: SchedulingService,
    private readonly audit: AuditSink,
  ) {}

  /** Creates the profile, chapters, tests and first suggested study blocks in one transaction. */
  async onboard(userId: string, body: OnboardingBody) {
    if (await this.profiles.findByUser(userId)) throw new ConflictError('Your planner is already set up', 'ALREADY_ONBOARDED');
    if (!isSupportedClass(body.cls)) throw new BadRequestError('That class is not available yet', 'CLASS_NOT_AVAILABLE');
    const { today, start } = this.context.today(body.timezone);

    const catalog = catalogChapters(body.cls, body.subjects);
    const known = new Set(catalog.map((chapter) => chapter.key));
    const taught = new Set(body.taughtChapterKeys);
    for (const key of taught) if (!known.has(key)) throw new BadRequestError(`Unknown chapter ${key}`, 'UNKNOWN_CHAPTER');
    for (const exam of body.exams) {
      if (!body.subjects.includes(exam.subject)) throw new BadRequestError(`${exam.name} is for a subject you turned off`, 'SUBJECT_NOT_SELECTED');
      if (exam.date <= today) throw new BadRequestError(`${exam.name} must be after today`, 'EXAM_IN_PAST');
      if (exam.chapterKeys.some((key) => !key.startsWith(`${exam.subject}-`) || !known.has(key))) {
        throw new BadRequestError(`${exam.name} lists a chapter outside its subject`, 'UNKNOWN_CHAPTER');
      }
    }

    const chapters: NewChapter[] = catalog.map((chapter, position) => ({
      ...chapter,
      position,
      status: taught.has(chapter.key) ? 'learning' : 'not',
      learnedOn: taught.has(chapter.key) ? addDays(today, -10) : null,
      revisions: taught.has(chapter.key) ? 1 : 0,
      snoozedUntil: null,
    }));
    const profile: NewProfile = {
      cls: body.cls,
      board: 'CBSE',
      timezone: body.timezone,
      subjects: body.subjects,
      schoolStart: toMinutes(body.schoolStart),
      schoolEnd: toMinutes(body.schoolEnd),
      tuitionDays: [...new Set(body.tuitionDays)].sort(),
      dailyLimitMins: body.dailyLimitMins,
      weeklyGoalMins: body.dailyLimitMins * 5,
      ageMode: body.cls <= 8 ? 'simple' : 'deeper',
      examSeason: false,
      sharing: { parent: false, items: { hours: true, streak: true, coverage: true, tests: true, marks: false }, groups: false },
      trackingStart: today,
      isDemo: false,
    };

    const result = await this.transactions.run(async (tx) => {
      await this.profiles.create(userId, profile, tx);
      await this.chapters.insertMany(userId, chapters, tx);
      const exams = await this.exams.insertMany(userId, body.exams, tx);
      const blocks = this.scheduling.plan({
        profile,
        today,
        start,
        load: new DayLoad(),
        homework: [],
        exams,
        chapters,
        plannedHomeworkIds: new Set(),
        plannedChapterDates: new Map(),
      });
      await this.tasks.insertMany(userId, blocks.map(blockToTask), tx);
      return summarize(blocks);
    });
    return { profile: await this.profileService.get(userId), suggested: result.added, firstDate: result.firstDate };
  }

  /** Replaces the account's planner data with the demo student's week. */
  async seedDemo(userId: string, timezone: string, meta: RequestMeta) {
    const { today } = this.context.today(timezone);
    const demo = buildDemoData(today, timezone);
    await this.transactions.run(async (tx) => {
      await this.deleteAll(userId, tx);
      await this.profiles.create(userId, demo.profile, tx);
      await this.chapters.insertMany(userId, demo.chapters, tx);
      await this.exams.insertMany(userId, demo.exams, tx);
      const homework = await this.homework.insertMany(userId, demo.homework.map(({ ref: _ref, ...item }) => item), tx);
      const idByRef = new Map(demo.homework.map((item, index) => [item.ref, homework[index]?.id ?? null]));
      await this.tasks.insertMany(
        userId,
        demo.tasks.map(({ homeworkRef, ...task }) => ({ ...task, homeworkId: homeworkRef ? (idByRef.get(homeworkRef) ?? null) : null })),
        tx,
      );
      await this.habits.insertFocusSessions(userId, demo.focus, tx);
      for (const date of demo.restDays) await this.habits.upsertLog(userId, date, { rest: true }, tx);
    });
    await this.audit.record('data.demo_seeded', userId, meta);
    return { profile: await this.profileService.get(userId), suggested: 0, firstDate: null };
  }

  /** "Start over": removes every planner record for the account, keeping the login. */
  async wipe(userId: string, meta: RequestMeta): Promise<void> {
    await this.transactions.run((tx) => this.deleteAll(userId, tx));
    await this.audit.record('data.wipe', userId, meta);
  }

  private async deleteAll(userId: string, tx: TxHandle): Promise<void> {
    await this.tasks.deleteByUser(userId, tx);
    await this.suggestions.deleteByUser(userId, tx);
    await this.homework.deleteByUser(userId, tx);
    await this.exams.deleteByUser(userId, tx);
    await this.chapters.deleteByUser(userId, tx);
    await this.habits.deleteByUser(userId, tx);
    await this.profiles.deleteByUser(userId, tx);
  }
}
