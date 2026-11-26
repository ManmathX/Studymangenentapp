import { createHash } from 'node:crypto';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { PageResult, skipFor, type PaginationQuery } from '../../common/http/page.js';
import { API_PREFIX } from '../../common/http/prefix.js';
import type { Clock } from '../../common/utils/clock.js';
import { escapeRegex, slugify } from '../../common/utils/text.js';
import type { TransactionRunner } from '../../database/transaction.js';
import type { CatalogCache } from './catalog-cache.js';
import type { CatalogSetup } from './catalog-setup.js';
import {
  academicYearOf,
  CODE_PATTERN,
  DEFAULT_STRUCTURE,
  isValidAcademicYear,
  LIMITS,
  type CategoryGroup,
  type CategoryRecord,
  type ExamRecord,
  type ExamStructure,
  type Region,
  type SettingValue,
  type SyllabusVersionRecord,
  type VersionCounts,
} from './catalog.types.js';
import type { ExamPatch, ExamRepository, NewExam } from './exam.repository.js';
import { colorFor, newSubjectId, subjectColor } from './standard-exams.data.js';
import { cleanUnits } from './syllabus-tree.js';
import type { SyllabusRepository } from './syllabus.repository.js';

/** Where clients load an exam's logo. Versioned by content, so it can be cached forever. */
export function logoUrl(exam: Pick<ExamRecord, 'code' | 'logo'>): string | null {
  return exam.logo
    ? `${API_PREFIX}/syllabus/exams/${exam.code}/logo?v=${exam.logo.sha.slice(0, 12)}`
    : null;
}

export type ExamDto = ExamRecord & { logoUrl: string | null };
export const examDto = (exam: ExamRecord): ExamDto => ({ ...exam, logoUrl: logoUrl(exam) });

export interface VersionBrief {
  id: string;
  academicYear: string;
  version: number;
  status: SyllabusVersionRecord['status'];
  counts: VersionCounts;
  publishedAt: string | null;
  updatedAt: string;
}

const brief = (version: SyllabusVersionRecord): VersionBrief => ({
  id: version.id,
  academicYear: version.academicYear,
  version: version.version,
  status: version.status,
  counts: version.counts,
  publishedAt: version.publishedAt,
  updatedAt: version.updatedAt,
});

export interface ExamSummary extends ExamDto {
  categoryName: string;
  syllabus: {
    published: VersionBrief | null;
    drafts: number;
    latestDraft: VersionBrief | null;
    years: string[];
  };
}

export interface StructureInput {
  levelLabel?: string;
  levels?: { key: string; name: string; grade?: number | null }[];
  useUnits?: boolean;
  unitLabel?: string;
  useTopics?: boolean;
  useSubtopics?: boolean;
}

export interface ExamInput {
  code?: string;
  name: string;
  shortName?: string;
  category: string;
  description?: string;
  color?: string;
  conductingBody?: string;
  region?: Region;
  state?: string;
  eligibility?: string;
  targetGrades?: number[];
  structure?: StructureInput;
  languages?: string[];
  isActive?: boolean;
  position?: number;
  settings?: Record<string, SettingValue>;
  /** Subjects of the first draft syllabus, created at every level. */
  subjects?: { name: string; color?: string }[];
  /** Academic year of the first draft; defaults to the current one. */
  academicYear?: string;
}

export type ExamPatchInput = Partial<Omit<ExamInput, 'code' | 'subjects' | 'academicYear'>>;

export interface AdminExamQuery extends PaginationQuery {
  category?: string;
  status?: 'active' | 'inactive';
  year?: string;
  q?: string;
  sort: 'position' | 'name' | '-updatedAt';
}

export function normaliseStructure(
  input: StructureInput | undefined,
  current?: ExamStructure,
): ExamStructure {
  const base = current ?? DEFAULT_STRUCTURE;
  return {
    levelLabel: input?.levelLabel ?? base.levelLabel,
    levels: (input?.levels ?? base.levels).map((level) => ({
      key: level.key,
      name: level.name,
      ...(level.grade ? { grade: level.grade } : {}),
    })),
    useUnits: input?.useUnits ?? base.useUnits,
    unitLabel: input?.unitLabel ?? base.unitLabel,
    useTopics: input?.useTopics ?? base.useTopics,
    useSubtopics: input?.useSubtopics ?? base.useSubtopics,
  };
}

/** PNG, JPEG or WebP by their first bytes; null for anything else. */
export function sniffImage(data: Buffer): string | null {
  if (
    data.length > 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (
    data.length > 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/** Admin side of categories and exams. */
export class ExamService {
  constructor(
    private readonly exams: ExamRepository,
    private readonly syllabi: SyllabusRepository,
    private readonly setup: CatalogSetup,
    private readonly cache: CatalogCache,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /* ---------- Categories ---------- */

  async categories(): Promise<(CategoryRecord & { exams: number })[]> {
    await this.setup.ensureReady();
    const [categories, counts] = await Promise.all([
      this.exams.listCategories(),
      this.exams.examCountsByCategory(),
    ]);
    return categories.map((category) => ({ ...category, exams: counts.get(category.code) ?? 0 }));
  }

  async createCategory(input: {
    code?: string;
    name: string;
    description?: string;
    group: CategoryGroup;
    isActive?: boolean;
  }): Promise<CategoryRecord> {
    await this.setup.ensureReady();
    const code = input.code ?? slugify(input.name, '-').slice(0, 32);
    if (!CODE_PATTERN.test(code))
      throw new UnprocessableError(
        'Give the category a code such as "law-entrance"',
        'CATEGORY_CODE_INVALID',
      );
    const existing = await this.exams.listCategories();
    if (existing.length >= LIMITS.categories)
      throw new ConflictError(
        `There can be at most ${LIMITS.categories} categories`,
        'TOO_MANY_CATEGORIES',
      );
    if (existing.some((category) => category.code === code))
      throw new ConflictError(`A category with code "${code}" already exists`, 'CATEGORY_EXISTS');
    if (existing.some((category) => category.name.toLowerCase() === input.name.toLowerCase()))
      throw new ConflictError(
        `There is already a category called ${input.name}`,
        'CATEGORY_EXISTS',
      );
    const created = await this.exams.createCategory({
      code,
      name: input.name,
      description: input.description ?? '',
      group: input.group,
      isActive: input.isActive ?? true,
      position: existing.length,
    });
    this.cache.invalidate();
    return created;
  }

  async updateCategory(
    code: string,
    patch: Partial<Pick<CategoryRecord, 'name' | 'description' | 'group' | 'isActive'>>,
  ): Promise<CategoryRecord> {
    await this.setup.ensureReady();
    if (patch.name) {
      const clash = (await this.exams.listCategories()).find(
        (category) =>
          category.code !== code && category.name.toLowerCase() === patch.name!.toLowerCase(),
      );
      if (clash)
        throw new ConflictError(
          `There is already a category called ${patch.name}`,
          'CATEGORY_EXISTS',
        );
    }
    const updated = await this.exams.updateCategory(code, patch);
    if (!updated) throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    this.cache.invalidate();
    return updated;
  }

  async deleteCategory(code: string): Promise<void> {
    await this.setup.ensureReady();
    const count = (await this.exams.examCountsByCategory()).get(code) ?? 0;
    if (count)
      throw new ConflictError(
        `Move or delete the ${count} exam${count === 1 ? '' : 's'} in this category first`,
        'CATEGORY_IN_USE',
      );
    if (!(await this.exams.deleteCategory(code)))
      throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    this.cache.invalidate();
  }

  /** Puts categories in the given order; codes left out keep their order after these. */
  async reorderCategories(codes: string[]): Promise<CategoryRecord[]> {
    await this.setup.ensureReady();
    const all = await this.exams.listCategories();
    const known = new Set(all.map((category) => category.code));
    const ordered = [...new Set(codes)].filter((code) => known.has(code));
    const rest = all.map((category) => category.code).filter((code) => !ordered.includes(code));
    await this.exams.setCategoryPositions([...ordered, ...rest]);
    this.cache.invalidate();
    return this.exams.listCategories();
  }

  /* ---------- Exams ---------- */

  async list(query: AdminExamQuery): Promise<PageResult<ExamSummary>> {
    await this.setup.ensureReady();
    let codes: string[] | undefined;
    if (query.year) {
      codes = [
        ...new Set(
          (await this.syllabi.listVersions({ academicYear: query.year })).map((v) => v.exam),
        ),
      ];
    }
    const [categories, exams] = await Promise.all([
      this.exams.listCategories(),
      this.exams.listExams({
        ...(query.category ? { category: query.category } : {}),
        ...(query.status ? { isActive: query.status === 'active' } : {}),
        ...(codes ? { codes } : {}),
        ...(query.q ? { search: new RegExp(escapeRegex(query.q), 'i') } : {}),
      }),
    ]);
    const categoryIndex = new Map(categories.map((category, index) => [category.code, index]));
    const sorted = [...exams].sort((a, b) => {
      if (query.sort === 'name') return a.name.localeCompare(b.name);
      if (query.sort === '-updatedAt') return b.updatedAt.localeCompare(a.updatedAt);
      return (
        (categoryIndex.get(a.category) ?? 999) - (categoryIndex.get(b.category) ?? 999) ||
        a.position - b.position ||
        a.name.localeCompare(b.name)
      );
    });
    const page = sorted.slice(skipFor(query), skipFor(query) + query.limit);
    const summaries = await this.summarise(page, categories);
    return new PageResult(summaries, sorted.length, query);
  }

  async get(code: string): Promise<ExamSummary> {
    const exam = await this.requireExam(code);
    const [summary] = await this.summarise([exam], await this.exams.listCategories());
    return summary!;
  }

  private async summarise(
    exams: ExamRecord[],
    categories: CategoryRecord[],
  ): Promise<ExamSummary[]> {
    if (!exams.length) return [];
    const versions = await this.syllabi.listVersions({ exams: exams.map((exam) => exam.code) });
    return exams.map((exam) => {
      const own = versions.filter((version) => version.exam === exam.code);
      const published = own.find((version) => version.status === 'published');
      const drafts = own
        .filter((version) => version.status === 'draft')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return {
        ...examDto(exam),
        categoryName:
          categories.find((category) => category.code === exam.category)?.name ?? exam.category,
        syllabus: {
          published: published ? brief(published) : null,
          drafts: drafts.length,
          latestDraft: drafts[0] ? brief(drafts[0]) : null,
          years: [...new Set(own.map((version) => version.academicYear))],
        },
      };
    });
  }

  async create(input: ExamInput, userId: string): Promise<{ exam: ExamSummary; draftId: string }> {
    await this.setup.ensureReady();
    const code = input.code ?? slugify(input.shortName ?? input.name, '-').slice(0, 32);
    if (!CODE_PATTERN.test(code))
      throw new UnprocessableError('Give the exam a code such as "jee-main"', 'EXAM_CODE_INVALID');
    if (await this.exams.findExam(code))
      throw new ConflictError(`An exam with code "${code}" already exists`, 'EXAM_EXISTS');
    await this.requireCategory(input.category);
    const academicYear = input.academicYear ?? academicYearOf(this.clock.now());
    if (!isValidAcademicYear(academicYear))
      throw new UnprocessableError(
        'Use an academic year like 2026-27 or 2027',
        'ACADEMIC_YEAR_INVALID',
      );
    const structure = normaliseStructure(input.structure);
    const exam: NewExam = {
      code,
      name: input.name,
      shortName:
        input.shortName ?? (input.name.length <= 16 ? input.name : code.toUpperCase().slice(0, 16)),
      category: input.category,
      description: input.description ?? '',
      color: input.color?.toUpperCase() ?? colorFor(code),
      logo: null,
      conductingBody: input.conductingBody ?? '',
      region: input.region ?? 'national',
      state: input.state ?? '',
      eligibility: input.eligibility ?? '',
      targetGrades: [...new Set(input.targetGrades ?? [])].sort((a, b) => a - b),
      structure,
      languages: [...new Set(input.languages ?? [])],
      isActive: input.isActive ?? true,
      position: input.position ?? (await this.exams.maxExamPosition(input.category)) + 1,
      settings: input.settings ?? {},
    };
    const levels = structure.levels.length ? structure.levels.map((level) => level.key) : [''];
    const draftId = await this.transactions.run(async (tx) => {
      await this.exams.createExam(exam, tx);
      const draft = await this.syllabi.createVersion(
        { exam: code, academicYear, status: 'draft', title: 'First draft', createdBy: userId },
        tx,
      );
      const taken = new Set<string>();
      const subjects = (input.subjects ?? []).map((subject, index) => {
        const subjectId = newSubjectId(subject.name, taken);
        taken.add(subjectId);
        return {
          ...subject,
          subjectId,
          color: subject.color?.toUpperCase() ?? subjectColor(subjectId, index),
          index,
        };
      });
      await this.syllabi.insertSubjects(
        draft.id,
        code,
        levels.flatMap((level) =>
          subjects.map((subject) => ({
            level,
            subjectId: subject.subjectId,
            name: subject.name,
            color: subject.color,
            position: subject.index,
            units: cleanUnits([]),
          })),
        ),
        tx,
      );
      await this.syllabi.refreshCounts(draft.id, tx);
      return draft.id;
    });
    this.cache.invalidate();
    return { exam: await this.get(code), draftId };
  }

  async update(code: string, input: ExamPatchInput): Promise<ExamSummary> {
    const current = await this.requireExam(code);
    if (input.category && input.category !== current.category)
      await this.requireCategory(input.category);
    const patch: ExamPatch = {};
    const copy = <K extends keyof ExamPatch>(key: K, value: ExamPatch[K] | undefined) => {
      if (value !== undefined) patch[key] = value;
    };
    copy('name', input.name);
    copy('shortName', input.shortName);
    copy('category', input.category);
    copy('description', input.description);
    copy('color', input.color?.toUpperCase());
    copy('conductingBody', input.conductingBody);
    copy('region', input.region);
    copy('state', input.state);
    copy('eligibility', input.eligibility);
    if (input.targetGrades)
      patch.targetGrades = [...new Set(input.targetGrades)].sort((a, b) => a - b);
    if (input.languages) patch.languages = [...new Set(input.languages)];
    copy('isActive', input.isActive);
    copy('position', input.position);
    copy('settings', input.settings);
    if (input.structure) {
      const structure = normaliseStructure(input.structure, current.structure);
      await this.checkLevelsStillFit(code, structure);
      patch.structure = structure;
    }
    const updated = await this.exams.updateExam(code, patch);
    if (!updated) throw new NotFoundError('Exam not found', 'EXAM_NOT_FOUND');
    this.cache.invalidate();
    return this.get(code);
  }

  /**
   * Refuses to drop a level that a draft or published syllabus still has subjects for, which
   * would leave them unreachable. Archived versions don't count.
   */
  private async checkLevelsStillFit(code: string, structure: ExamStructure): Promise<void> {
    const keys = new Set(
      structure.levels.length ? structure.levels.map((level) => level.key) : [''],
    );
    const used = await this.syllabi.levelsInUse(code);
    const orphaned = [...used].filter((level) => !keys.has(level));
    if (!orphaned.length) return;
    const names = orphaned.map((level) => (level ? `"${level}"` : 'without a level')).join(', ');
    throw new ConflictError(
      `The current syllabus still has subjects ${orphaned.includes('') ? '' : 'at '}${names}. Move or delete them first, or start a new draft.`,
      'LEVEL_IN_USE',
    );
  }

  async remove(code: string): Promise<void> {
    await this.requireExam(code);
    await this.transactions.run(async (tx) => {
      await this.syllabi.deleteVersionsOfExam(code, tx);
      await this.exams.deleteExam(code, tx);
    });
    this.cache.invalidate();
  }

  /** Sets the display order of exams (usually the exams of one category, first to last). */
  async reorder(codes: string[]): Promise<void> {
    await this.setup.ensureReady();
    const known = new Set((await this.exams.listExams({ codes })).map((exam) => exam.code));
    await this.exams.setExamPositions([...new Set(codes)].filter((code) => known.has(code)));
    this.cache.invalidate();
  }

  async setLogo(code: string, dataBase64: string): Promise<ExamSummary> {
    await this.requireExam(code);
    const data = Buffer.from(dataBase64, 'base64');
    if (!data.length) throw new UnprocessableError('The image is empty', 'LOGO_INVALID');
    if (data.length > LIMITS.logoBytes)
      throw new UnprocessableError('Use an image of at most 200 kB', 'LOGO_TOO_LARGE');
    const contentType = sniffImage(data);
    if (!contentType) throw new UnprocessableError('Use a PNG, JPEG or WebP image', 'LOGO_TYPE');
    const sha = createHash('sha256').update(data).digest('hex');
    await this.exams.saveLogo(code, { sha, contentType, size: data.length, data });
    this.cache.invalidate();
    return this.get(code);
  }

  async removeLogo(code: string): Promise<ExamSummary> {
    await this.requireExam(code);
    await this.exams.removeLogo(code);
    this.cache.invalidate();
    return this.get(code);
  }

  async requireExam(code: string): Promise<ExamRecord> {
    await this.setup.ensureReady();
    const exam = await this.exams.findExam(code);
    if (!exam) throw new NotFoundError('Exam not found', 'EXAM_NOT_FOUND');
    return exam;
  }

  private async requireCategory(code: string): Promise<CategoryRecord> {
    const category = await this.exams.findCategory(code);
    if (!category)
      throw new UnprocessableError('Pick a category that exists', 'CATEGORY_NOT_FOUND');
    return category;
  }
}
