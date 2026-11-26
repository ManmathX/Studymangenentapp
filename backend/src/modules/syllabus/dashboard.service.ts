import type { CatalogSetup } from './catalog-setup.js';
import type { VersionCounts } from './catalog.types.js';
import type { ExamRepository } from './exam.repository.js';
import type { SyllabusRepository } from './syllabus.repository.js';

export interface DashboardQuery {
  category?: string;
  status?: 'active' | 'inactive';
  year?: string;
}

export interface Dashboard {
  totals: {
    boards: number;
    competitive: number;
    exams: number;
    active: number;
    inactive: number;
    draftSyllabi: number;
    publishedSyllabi: number;
  };
  /** Content of the published syllabi (what new students get). */
  content: VersionCounts;
  byCategory: {
    code: string;
    name: string;
    group: string;
    exams: number;
    active: number;
    published: number;
  }[];
  years: string[];
  recentDrafts: {
    id: string;
    exam: string;
    examName: string;
    academicYear: string;
    version: number;
    counts: VersionCounts;
    updatedAt: string;
  }[];
}

/** Numbers for the admin portal's overview page. */
export class DashboardService {
  constructor(
    private readonly exams: ExamRepository,
    private readonly syllabi: SyllabusRepository,
    private readonly setup: CatalogSetup,
  ) {}

  async overview(query: DashboardQuery): Promise<Dashboard> {
    await this.setup.ensureReady();
    const [categories, allExams, years] = await Promise.all([
      this.exams.listCategories(),
      this.exams.listExams({
        ...(query.category ? { category: query.category } : {}),
        ...(query.status ? { isActive: query.status === 'active' } : {}),
      }),
      this.syllabi.academicYears(),
    ]);
    const groupOf = new Map(categories.map((category) => [category.code, category.group]));
    const versions = allExams.length
      ? await this.syllabi.listVersions({
          exams: allExams.map((exam) => exam.code),
          ...(query.year ? { academicYear: query.year } : {}),
        })
      : [];
    // With a year filter, only exams that have a syllabus for that year count.
    const exams = query.year
      ? allExams.filter((exam) => versions.some((version) => version.exam === exam.code))
      : allExams;
    const published = versions.filter((version) => version.status === 'published');
    const drafts = versions.filter((version) => version.status === 'draft');
    const nameOf = new Map(exams.map((exam) => [exam.code, exam.name]));
    return {
      totals: {
        boards: exams.filter((exam) => groupOf.get(exam.category) === 'board').length,
        competitive: exams.filter((exam) => groupOf.get(exam.category) !== 'board').length,
        exams: exams.length,
        active: exams.filter((exam) => exam.isActive).length,
        inactive: exams.filter((exam) => !exam.isActive).length,
        draftSyllabi: drafts.length,
        publishedSyllabi: published.length,
      },
      content: await this.syllabi.sumCounts(published.map((version) => version.id)),
      byCategory: categories
        .filter((category) => !query.category || category.code === query.category)
        .map((category) => {
          const own = exams.filter((exam) => exam.category === category.code);
          return {
            code: category.code,
            name: category.name,
            group: category.group,
            exams: own.length,
            active: own.filter((exam) => exam.isActive).length,
            published: own.filter((exam) => published.some((version) => version.exam === exam.code))
              .length,
          };
        }),
      years,
      recentDrafts: drafts
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 8)
        .map((version) => ({
          id: version.id,
          exam: version.exam,
          examName: nameOf.get(version.exam) ?? version.exam,
          academicYear: version.academicYear,
          version: version.version,
          counts: version.counts,
          updatedAt: version.updatedAt,
        })),
    };
  }
}
