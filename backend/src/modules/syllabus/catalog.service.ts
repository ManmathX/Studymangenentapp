import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';
import { PageResult, skipFor, type PaginationQuery } from '../../common/http/page.js';
import type { CatalogCache } from './catalog-cache.js';
import type { CatalogSetup } from './catalog-setup.js';
import type {
  CategoryGroup,
  CategoryRecord,
  ExamLevel,
  ExamRecord,
  SyllabusVersionRecord,
} from './catalog.types.js';
import type { ExamRepository } from './exam.repository.js';
import type { ExamLogoDocument } from './exam.model.js';
import { logoUrl } from './exam.service.js';
import { flattenChapters, type StudentChapter } from './syllabus-tree.js';
import { ALL_CLASSES } from './syllabus.data.js';
import type { SyllabusRepository } from './syllabus.repository.js';

/** An exam as the app's exam picker lists it. */
export interface StudentExam {
  code: string;
  name: string;
  shortName: string;
  category: string;
  categoryName: string;
  categoryGroup: CategoryGroup;
  description: string;
  conductingBody: string;
  color: string;
  logoUrl: string | null;
  region: ExamRecord['region'];
  state: string;
  levelLabel: string;
  unitLabel: string;
  levels: (ExamLevel & { available: boolean })[];
  /** True once a published syllabus has chapters for the exam (for some level, if it has levels). */
  available: boolean;
  academicYear: string | null;
  languages: string[];
  position: number;
}

export interface StudentExamDetail extends StudentExam {
  eligibility: string;
  targetGrades: number[];
  version: { id: string; academicYear: string; version: number; publishedAt: string | null } | null;
}

export interface StudentSubject {
  id: string;
  name: string;
  color: string;
  units: { name: string; chapters: number }[];
  chapters: StudentChapter[];
}

export interface StudentSyllabus {
  exam: {
    code: string;
    name: string;
    shortName: string;
    category: string;
    color: string;
    logoUrl: string | null;
  };
  level: ExamLevel | null;
  labels: { level: string; unit: string };
  version: { id: string; academicYear: string; version: number; publishedAt: string | null };
  subjects: StudentSubject[];
}

/** The shapes the app has always downloaded; kept exactly for app builds already installed. */
export interface LegacyBoard {
  code: string;
  name: string;
  kind: 'national' | 'state';
  position: number;
}

export interface LegacySubject {
  id: string;
  name: string;
  color: string;
  chapters: { key: string; name: string; difficulty: 1 | 2 | 3; book?: string }[];
}

interface Visible {
  exam: ExamRecord;
  summary: StudentExam;
  version: SyllabusVersionRecord | null;
}

export interface StudentExamQuery extends PaginationQuery {
  category?: string;
  q?: string;
}

/** Folds case and accents so "neet" finds "NEET UG" and "odia" finds "Oḍiā". */
const fold = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** What students read: categories, exams and published syllabi. */
export class CatalogService {
  constructor(
    private readonly exams: ExamRepository,
    private readonly syllabi: SyllabusRepository,
    private readonly setup: CatalogSetup,
    private readonly cache: CatalogCache,
  ) {}

  /**
   * Active exams in active categories, in display order, with which levels students can pick.
   * Cached briefly; see CatalogCache.
   */
  private visible(): Promise<{ categories: CategoryRecord[]; exams: Visible[] }> {
    return this.cache.list('visible', async () => {
      await this.setup.ensureReady();
      const [allCategories, allExams] = await Promise.all([
        this.exams.listCategories(),
        this.exams.listExams({ isActive: true }),
      ]);
      const categories = allCategories.filter((category) => category.isActive);
      const order = new Map(categories.map((category, index) => [category.code, index]));
      const shown = allExams.filter((exam) => order.has(exam.category));
      const published = await this.syllabi.listVersions({
        exams: shown.map((exam) => exam.code),
        status: 'published',
      });
      const versionOf = new Map(published.map((version) => [version.exam, version]));
      const loaded = await this.syllabi.levelsWithChapters(published.map((version) => version.id));
      const exams = shown
        .map((exam): Visible => {
          const version = versionOf.get(exam.code) ?? null;
          const levelsLoaded = (version && loaded.get(version.id)) || new Set<string>();
          const levels = exam.structure.levels.map((level) => ({
            ...level,
            available: levelsLoaded.has(level.key),
          }));
          const category = categories[order.get(exam.category)!]!;
          return {
            exam,
            version,
            summary: {
              code: exam.code,
              name: exam.name,
              shortName: exam.shortName,
              category: exam.category,
              categoryName: category.name,
              categoryGroup: category.group,
              description: exam.description,
              conductingBody: exam.conductingBody,
              color: exam.color,
              logoUrl: logoUrl(exam),
              region: exam.region,
              state: exam.state,
              levelLabel: exam.structure.levelLabel,
              unitLabel: exam.structure.unitLabel,
              levels,
              available: levels.length
                ? levels.some((level) => level.available)
                : levelsLoaded.has(''),
              academicYear: version?.academicYear ?? null,
              languages: exam.languages,
              position: exam.position,
            },
          };
        })
        .sort(
          (a, b) =>
            order.get(a.exam.category)! - order.get(b.exam.category)! ||
            a.exam.position - b.exam.position ||
            a.exam.name.localeCompare(b.exam.name),
        );
      return { categories, exams };
    });
  }

  /**
   * What the exam picker offers: only exams students can set up with now (a published syllabus
   * with chapters), and only their levels that are ready. Nothing is listed as "coming soon".
   */
  private async pickable(): Promise<{ categories: CategoryRecord[]; exams: Visible[] }> {
    const { categories, exams } = await this.visible();
    return {
      categories,
      exams: exams
        .filter((item) => item.summary.available)
        .map((item) => ({
          ...item,
          summary: {
            ...item.summary,
            levels: item.summary.levels.filter((level) => level.available),
          },
        })),
    };
  }

  private async find(code: string): Promise<Visible> {
    const found = (await this.pickable()).exams.find((item) => item.exam.code === code);
    if (!found) throw new NotFoundError('That exam is not available', 'EXAM_NOT_FOUND');
    return found;
  }

  /* ---------- Exam picker ---------- */

  /** Active categories with how many exams students can pick in each. */
  async categories(): Promise<(CategoryRecord & { exams: number })[]> {
    const { categories, exams } = await this.pickable();
    return categories.map((category) => ({
      ...category,
      exams: exams.filter((item) => item.exam.category === category.code).length,
    }));
  }

  async list(query: StudentExamQuery): Promise<PageResult<StudentExam>> {
    const { exams } = await this.pickable();
    const needle = query.q ? fold(query.q.trim()) : '';
    const matches = exams
      .map((item) => item.summary)
      .filter((exam) => !query.category || exam.category === query.category)
      .filter(
        (exam) =>
          !needle ||
          [
            exam.name,
            exam.shortName,
            exam.code,
            exam.description,
            exam.categoryName,
            exam.state,
          ].some((field) => fold(field).includes(needle)),
      );
    return new PageResult(
      matches.slice(skipFor(query), skipFor(query) + query.limit),
      matches.length,
      query,
    );
  }

  async exam(code: string): Promise<StudentExamDetail> {
    const { exam, summary, version } = await this.find(code);
    return {
      ...summary,
      eligibility: exam.eligibility,
      targetGrades: exam.targetGrades,
      version: version
        ? {
            id: version.id,
            academicYear: version.academicYear,
            version: version.version,
            publishedAt: version.publishedAt,
          }
        : null,
    };
  }

  /** The published syllabus of an exam (at one level, if it has levels), as the app keeps it. */
  async syllabus(code: string, levelKey?: string): Promise<StudentSyllabus> {
    const { exam, version } = await this.find(code);
    let level: ExamLevel | null = null;
    if (exam.structure.levels.length) {
      if (!levelKey)
        throw new BadRequestError(
          `Pick a ${exam.structure.levelLabel.toLowerCase()}`,
          'LEVEL_REQUIRED',
        );
      level = exam.structure.levels.find((item) => item.key === levelKey) ?? null;
      if (!level)
        throw new NotFoundError(
          `${exam.name} has no ${exam.structure.levelLabel.toLowerCase()} "${levelKey}"`,
          'LEVEL_NOT_FOUND',
        );
    }
    if (!version)
      throw new NotFoundError(
        `The ${exam.name} syllabus is not available yet`,
        'SYLLABUS_NOT_AVAILABLE',
      );
    const subjects = await this.publishedSubjects(version, level?.key ?? '');
    if (!subjects.length)
      throw new NotFoundError(
        level
          ? `${level.name} is not available yet`
          : `The ${exam.name} syllabus is not available yet`,
        'CLASS_NOT_AVAILABLE',
      );
    return {
      exam: {
        code: exam.code,
        name: exam.name,
        shortName: exam.shortName,
        category: exam.category,
        color: exam.color,
        logoUrl: logoUrl(exam),
      },
      level,
      labels: { level: exam.structure.levelLabel, unit: exam.structure.unitLabel },
      version: {
        id: version.id,
        academicYear: version.academicYear,
        version: version.version,
        publishedAt: version.publishedAt,
      },
      subjects,
    };
  }

  /** Subjects with chapters at one level of a published version. Cached: published content never changes. */
  private publishedSubjects(
    version: SyllabusVersionRecord,
    level: string,
  ): Promise<StudentSubject[]> {
    return this.cache.syllabus(`${version.id}:${version.publishedAt}:${level}`, async () =>
      (await this.syllabi.listSubjects(version.id, level))
        .filter((subject) => subject.counts.chapters > 0)
        .map((subject) => ({
          id: subject.subjectId,
          name: subject.name,
          color: subject.color,
          units: subject.units
            .filter((unit) => unit.name)
            .map((unit) => ({ name: unit.name, chapters: unit.chapters.length })),
          chapters: flattenChapters(subject.subjectId, subject.units),
        })),
    );
  }

  async logo(code: string): Promise<ExamLogoDocument> {
    await this.setup.ensureReady();
    const logo = await this.exams.findLogo(code);
    if (!logo) throw new NotFoundError('This exam has no logo', 'LOGO_NOT_FOUND');
    return logo;
  }

  /* ---------- What app builds from before exams call ---------- */

  /**
   * School boards with classes 6–12, in the old shape. Competitive exams never appear here, nor
   * do boards that have never been published (boards copied from the old catalogue always were).
   */
  private async legacyBoards(): Promise<Visible[]> {
    return (await this.visible()).exams.filter(
      (item) =>
        item.summary.categoryGroup === 'board' &&
        item.version !== null &&
        item.exam.structure.levels.some(
          (level) => level.grade && level.grade >= 6 && level.grade <= 12,
        ),
    );
  }

  private async legacyBoard(code: string): Promise<Visible> {
    const found = (await this.legacyBoards()).find((item) => item.exam.code === code);
    if (!found) throw new NotFoundError('That board is not available', 'BOARD_NOT_FOUND');
    return found;
  }

  async boards(): Promise<LegacyBoard[]> {
    return (await this.legacyBoards()).map(({ exam }) => ({
      code: exam.code,
      name: exam.name,
      kind: exam.region === 'state' ? 'state' : 'national',
      position: exam.position,
    }));
  }

  async classes(board: string): Promise<{ cls: number; available: boolean }[]> {
    const { exam, summary } = await this.legacyBoard(board);
    return ALL_CLASSES.map((cls) => {
      const level = exam.structure.levels.find((item) => item.grade === cls);
      return {
        cls,
        available: Boolean(
          level && summary.levels.find((item) => item.key === level.key)?.available,
        ),
      };
    });
  }

  async subjectsFor(board: string, cls: number): Promise<LegacySubject[]> {
    const { exam, version } = await this.legacyBoard(board);
    const level = exam.structure.levels.find((item) => item.grade === cls);
    const subjects = level && version ? await this.publishedSubjects(version, level.key) : [];
    if (!subjects.length)
      throw new NotFoundError('That class is not available yet', 'CLASS_NOT_AVAILABLE');
    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      color: subject.color,
      chapters: subject.chapters.map((chapter) => ({
        key: chapter.key,
        name: chapter.name,
        difficulty: chapter.difficulty,
        ...(chapter.book ? { book: chapter.book } : {}),
      })),
    }));
  }
}
