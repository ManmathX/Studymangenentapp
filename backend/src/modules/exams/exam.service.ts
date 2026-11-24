import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';
import { diffDays } from '../../common/utils/dates.js';
import type { ChapterRepository } from '../chapters/chapter.repository.js';
import { readiness } from '../planner/planner.engine.js';
import type { StudentContext } from '../planner/student-context.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import type { ExamRecord, ExamRepository } from './exam.repository.js';

export interface NewExamInput {
  subject: SubjectId;
  name: string;
  date: string;
  weight: number;
  chapterKeys: string[];
}

export class ExamService {
  constructor(
    private readonly context: StudentContext,
    private readonly exams: ExamRepository,
    private readonly chapters: ChapterRepository,
  ) {}

  /** Upcoming tests with days left, chapter statuses and how many are revised. */
  async upcoming(userId: string) {
    const ctx = await this.context.load(userId);
    return this.upcomingFrom(userId, ctx.today);
  }

  async upcomingFrom(userId: string, today: string) {
    const exams = await this.exams.list(userId, today);
    const keys = [...new Set(exams.flatMap((exam) => exam.chapterKeys))];
    const chapters = await this.chapters.findByKeys(userId, keys);
    const byKey = new Map(chapters.map((chapter) => [chapter.key, chapter]));
    const statusByKey = new Map(chapters.map((chapter) => [chapter.key, chapter.status]));
    return exams.map((exam) => ({
      ...exam,
      daysLeft: diffDays(today, exam.date),
      readiness: readiness(exam.chapterKeys, statusByKey),
      chapters: exam.chapterKeys.flatMap((key) => {
        const chapter = byKey.get(key);
        return chapter ? [{ key, name: chapter.name, status: chapter.status }] : [];
      }),
    }));
  }

  async create(userId: string, input: NewExamInput): Promise<ExamRecord> {
    const ctx = await this.context.load(userId);
    if (input.date <= ctx.today)
      throw new BadRequestError('Pick a date after today', 'EXAM_IN_PAST');
    const chapterKeys = await this.checkSubjectAndChapters(userId, ctx.profile.subjects, input);
    return this.exams.create(userId, { ...input, chapterKeys });
  }

  /**
   * Changes a test's name, date, weight, subject or chapters. Study blocks already in the
   * plan stay; the next auto-schedule plans around the new date and chapters.
   */
  async update(userId: string, id: string, patch: Partial<NewExamInput>): Promise<ExamRecord> {
    const ctx = await this.context.load(userId);
    const current = await this.exams.findById(userId, id);
    if (!current) throw new NotFoundError('Test not found', 'EXAM_NOT_FOUND');
    const next = { ...current, ...patch };
    // A test that is today can still be renamed; only a newly picked date has to be in the future.
    if (patch.date !== undefined && patch.date !== current.date && patch.date <= ctx.today)
      throw new BadRequestError('Pick a date after today', 'EXAM_IN_PAST');
    if (patch.subject !== undefined && patch.subject !== current.subject && !patch.chapterKeys)
      throw new BadRequestError('Pick chapters from the new subject', 'UNKNOWN_CHAPTER');
    const chapterKeys =
      patch.subject !== undefined || patch.chapterKeys !== undefined
        ? await this.checkSubjectAndChapters(userId, ctx.profile.subjects, next)
        : current.chapterKeys;
    const updated = await this.exams.update(userId, id, {
      subject: next.subject,
      name: next.name,
      date: next.date,
      weight: next.weight,
      chapterKeys,
    });
    if (!updated) throw new NotFoundError('Test not found', 'EXAM_NOT_FOUND');
    return updated;
  }

  /** The subject must be one the student takes, and every chapter must belong to it. Returns unique keys. */
  private async checkSubjectAndChapters(
    userId: string,
    subjects: readonly SubjectId[],
    input: { subject: SubjectId; chapterKeys: string[] },
  ): Promise<string[]> {
    if (!subjects.includes(input.subject))
      throw new BadRequestError('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    const keys = [...new Set(input.chapterKeys)];
    const chapters = await this.chapters.findByKeys(userId, keys);
    if (
      chapters.length !== keys.length ||
      chapters.some((chapter) => chapter.subject !== input.subject)
    ) {
      throw new BadRequestError('Pick chapters from this subject', 'UNKNOWN_CHAPTER');
    }
    return keys;
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.exams.delete(userId, id)))
      throw new NotFoundError('Test not found', 'EXAM_NOT_FOUND');
  }
}
