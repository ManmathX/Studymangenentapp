import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
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
import type { CatalogService } from '../syllabus/catalog.service.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import { buildDemoData } from './demo-seed.js';
import type { ProfileSubject } from './profile.model.js';
import type { OnboardingBody } from './profile.schemas.js';
import type { NewProfile, ProfileRepository } from './profile.repository.js';
import type { ProfileService } from './profile.service.js';

/** Chapters of a subject the student added themselves start at medium difficulty. */
const CUSTOM_CHAPTER_DIFFICULTY = 2;

/** A board or class missing from the catalogue is a bad setup answer here, not a missing page. */
async function asBadRequest<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) throw new BadRequestError(error.message, error.code);
    throw error;
  }
}

/**
 * Works out the student's subjects and chapters from the board's catalogue plus any subjects
 * they added. Throws a 400 for anything that doesn't fit together.
 */
async function resolveSubjects(catalogService: CatalogService, body: OnboardingBody) {
  const catalog = await asBadRequest(() => catalogService.subjectsFor(body.board, body.cls));
  const chosen = new Set(body.subjects);
  if (chosen.size !== body.subjects.length)
    throw new BadRequestError('A subject is listed twice', 'DUPLICATE_SUBJECT');

  const names = new Set(catalog.map((subject) => subject.name.toLowerCase()));
  const customIds = new Set<string>();
  for (const custom of body.customSubjects) {
    if (customIds.has(custom.id))
      throw new BadRequestError('Two added subjects share an id', 'DUPLICATE_SUBJECT');
    if (names.has(custom.name.toLowerCase()))
      throw new BadRequestError(
        `You already have a subject called ${custom.name}`,
        'DUPLICATE_SUBJECT',
      );
    customIds.add(custom.id);
    names.add(custom.name.toLowerCase());
  }
  const catalogIds = new Set(catalog.map((subject) => subject.id));
  for (const id of chosen) {
    if (!catalogIds.has(id) && !customIds.has(id))
      throw new BadRequestError(`Unknown subject ${id}`, 'UNKNOWN_SUBJECT');
  }

  const picked = catalog.filter((subject) => chosen.has(subject.id));
  const added = body.customSubjects.filter((subject) => chosen.has(subject.id));
  const subjectInfo: ProfileSubject[] = [
    ...picked.map(({ id, name, color }) => ({ id, name, color, custom: false })),
    ...added.map(({ id, name, color }) => ({ id, name, color, custom: true })),
  ];
  const chapters = [
    ...picked.flatMap((subject) =>
      subject.chapters.map((chapter) => ({ ...chapter, subject: subject.id })),
    ),
    ...added.flatMap((subject) =>
      subject.chapters.map((name, index) => ({
        key: `${subject.id}-${index + 1}`,
        subject: subject.id,
        name,
        difficulty: CUSTOM_CHAPTER_DIFFICULTY,
      })),
    ),
  ];
  return { subjectInfo, chapters };
}

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
    private readonly catalog: CatalogService,
  ) {}

  /** Creates the profile, chapters, tests and first suggested study blocks in one transaction. */
  async onboard(userId: string, body: OnboardingBody) {
    if (await this.profiles.findByUser(userId))
      throw new ConflictError('Your planner is already set up', 'ALREADY_ONBOARDED');
    const board = await asBadRequest(() => this.catalog.requireBoard(body.board));
    const { today, start } = this.context.today(body.timezone);

    const { subjectInfo, chapters: catalog } = await resolveSubjects(this.catalog, body);
    const subjects = subjectInfo.map((subject) => subject.id);
    const known = new Set(catalog.map((chapter) => chapter.key));
    const taught = new Set(body.taughtChapterKeys);
    for (const key of taught)
      if (!known.has(key)) throw new BadRequestError(`Unknown chapter ${key}`, 'UNKNOWN_CHAPTER');
    for (const exam of body.exams) {
      if (!subjects.includes(exam.subject))
        throw new BadRequestError(
          `${exam.name} is for a subject you turned off`,
          'SUBJECT_NOT_SELECTED',
        );
      if (exam.date <= today)
        throw new BadRequestError(`${exam.name} must be after today`, 'EXAM_IN_PAST');
      if (exam.chapterKeys.some((key) => !key.startsWith(`${exam.subject}-`) || !known.has(key))) {
        throw new BadRequestError(
          `${exam.name} lists a chapter outside its subject`,
          'UNKNOWN_CHAPTER',
        );
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
      board: board.code,
      boardName: board.name,
      timezone: body.timezone,
      subjects,
      subjectInfo,
      schoolStart: toMinutes(body.schoolStart),
      schoolEnd: toMinutes(body.schoolEnd),
      tuitionDays: [...new Set(body.tuitionDays)].sort(),
      tuitionStart: toMinutes(body.tuitionStart),
      tuitionEnd: toMinutes(body.tuitionEnd),
      dailyLimitMins: body.dailyLimitMins,
      weeklyGoalMins: body.dailyLimitMins * 5,
      ageMode: body.cls <= 8 ? 'simple' : 'deeper',
      examSeason: false,
      sharing: {
        parent: false,
        items: { hours: true, streak: true, coverage: true, tests: true, marks: false },
        groups: false,
      },
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
    return {
      profile: await this.profileService.get(userId),
      suggested: result.added,
      firstDate: result.firstDate,
    };
  }

  /** Replaces the account's planner data with the demo student's week. */
  async seedDemo(userId: string, timezone: string, meta: RequestMeta) {
    const { today } = this.context.today(timezone);
    const demo = buildDemoData(today, timezone);
    await this.transactions.run(async (tx) => {
      await this.deleteAllData(userId, tx);
      await this.profiles.create(userId, demo.profile, tx);
      await this.chapters.insertMany(userId, demo.chapters, tx);
      await this.exams.insertMany(userId, demo.exams, tx);
      const homework = await this.homework.insertMany(
        userId,
        demo.homework.map(({ ref: _ref, ...item }) => item),
        tx,
      );
      const idByRef = new Map(
        demo.homework.map((item, index) => [item.ref, homework[index]?.id ?? null]),
      );
      await this.tasks.insertMany(
        userId,
        demo.tasks.map(({ homeworkRef, ...task }) => ({
          ...task,
          homeworkId: homeworkRef ? (idByRef.get(homeworkRef) ?? null) : null,
        })),
        tx,
      );
      await this.habits.insertFocusSessions(userId, demo.focus, tx);
      for (const date of demo.restDays)
        await this.habits.upsertLog(userId, date, { rest: true }, tx);
    });
    await this.audit.record('data.demo_seeded', userId, meta);
    return { profile: await this.profileService.get(userId), suggested: 0, firstDate: null };
  }

  /** "Start over": removes every planner record for the account, keeping the login. */
  async wipe(userId: string, meta: RequestMeta): Promise<void> {
    await this.transactions.run((tx) => this.deleteAllData(userId, tx));
    await this.audit.record('data.wipe', userId, meta);
  }

  /** Deletes every planner record for the account. Also used when the account itself is deleted. */
  async deleteAllData(userId: string, tx: TxHandle): Promise<void> {
    await this.tasks.deleteByUser(userId, tx);
    await this.suggestions.deleteByUser(userId, tx);
    await this.homework.deleteByUser(userId, tx);
    await this.exams.deleteByUser(userId, tx);
    await this.chapters.deleteByUser(userId, tx);
    await this.habits.deleteByUser(userId, tx);
    await this.profiles.deleteByUser(userId, tx);
  }
}
