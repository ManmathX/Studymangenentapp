import type { Clock } from '../../common/utils/clock.js';
import { escapeRegex } from '../../common/utils/text.js';
import type { TransactionRunner, TxHandle } from '../../database/transaction.js';
import {
  BoardModel,
  CatalogSubjectModel,
  type BoardDocument,
  type CatalogSubjectDocument,
} from './catalog.model.js';
import { academicYearOf, type SubjectContent } from './catalog.types.js';
import { CatalogMigrationModel } from './exam.model.js';
import type { ExamRepository, NewExam } from './exam.repository.js';
import { standardSubjects } from './standard-catalog.data.js';
import {
  COMPETITIVE_EXAMS,
  DEFAULT_CATEGORIES,
  MORE_BOARDS,
  newSubjectId,
  SCHOOL_BOARDS_CATEGORY,
  schoolBoardExam,
  STANDARD_BOARDS,
  subjectColor,
} from './standard-exams.data.js';
import { cleanChapter, cleanUnits } from './syllabus-tree.js';
import type { SyllabusRepository } from './syllabus.repository.js';

/** One-time catalogue steps, run in order; each is recorded in `catalog_migrations` when done. */
export const CATALOG_MIGRATIONS = ['exam-catalogue-v1', 'exam-catalogue-v2-more-boards'] as const;
type MigrationId = (typeof CATALOG_MIGRATIONS)[number];

/** Other names a board is often given, so a board an admin already added isn't added twice. */
const BOARD_ALIASES: Record<string, string[]> = {
  'uttar-pradesh': ['UP Board'],
  'madhya-pradesh': ['MP Board'],
  'himachal-pradesh': ['HP Board'],
  'andhra-pradesh': ['AP Board'],
  'jammu-and-kashmir': ['J&K', 'Jammu & Kashmir'],
  'tamil-nadu': ['TN Board'],
};

function aliasesOf(exam: NewExam): string[] {
  // Acronyms in the name, e.g. "BSEB" in "Bihar Board (BSEB)". Short ones like "BSE" are too common.
  const acronyms = (exam.name.match(/\(([^)]+)\)/)?.[1] ?? '')
    .split(/[,\s]+/)
    .filter((word) => word.length >= 4);
  return [
    exam.state,
    exam.shortName,
    exam.code,
    ...acronyms,
    ...(BOARD_ALIASES[exam.code] ?? []),
  ].filter(Boolean);
}

const mentions = (text: string, alias: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegex(alias.toLowerCase())}($|[^a-z0-9])`).test(
    text.toLowerCase(),
  );

const isDuplicateKey = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

/**
 * Prepares the exam catalogue on first use, once per database:
 *
 * - adds the default exam categories;
 * - on a database from before exams, copies every legacy board into an exam (category School
 *   Boards, classes 6–12) and its subjects into a published syllabus for the current academic
 *   year, so students see exactly what they saw before. The legacy collections are left as
 *   they were;
 * - on a fresh database, loads CBSE and ICSE (classes 6–12) as published syllabi instead;
 * - adds the competitive exams (setup only, with an empty draft syllabus).
 *
 * Runs in one transaction with a marker document, so a crash leaves nothing half done and two
 * servers starting together don't both do it. Lazy (first request) so it also works serverless.
 */
export class CatalogSetup {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly exams: ExamRepository,
    private readonly syllabi: SyllabusRepository,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  ensureReady(): Promise<void> {
    this.ready ??= this.run().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async run(): Promise<void> {
    await this.step('exam-catalogue-v1', async (tx) => {
      await this.exams.insertMissingCategories(DEFAULT_CATEGORIES, tx);
      if ((await this.exams.countExams(tx)) === 0) {
        const boards = await BoardModel.find({}, null, { session: tx })
          .sort({ position: 1, name: 1 })
          .lean<BoardDocument[]>();
        if (boards.length) await this.migrateLegacy(boards, tx);
        else await this.seedStandardBoards(tx);
      }
      await this.seedCompetitive(tx);
    });
    await this.step('exam-catalogue-v2-more-boards', (tx) => this.addMoreBoards(tx));
  }

  /** Runs `work` once per database, in a transaction with its marker document. */
  private async step(id: MigrationId, work: (tx: TxHandle) => Promise<void>): Promise<void> {
    if (await CatalogMigrationModel.exists({ _id: id })) return;
    try {
      await this.transactions.run(async (tx) => {
        // Claimed first: a second server racing us fails here and rolls back.
        await CatalogMigrationModel.create([{ _id: id, at: this.clock.now() }], { session: tx });
        await work(tx);
      });
    } catch (error) {
      if (isDuplicateKey(error) && (await CatalogMigrationModel.exists({ _id: id }))) return;
      throw error;
    }
  }

  /**
   * Adds NIOS and the state boards (setup only, with an empty draft each), after the boards
   * the catalogue already has. A board already there under its code, state, short name or a
   * common alias ("UP Board") is skipped, so boards admins added aren't doubled.
   */
  private async addMoreBoards(tx: TxHandle) {
    await this.exams.insertMissingCategories(
      DEFAULT_CATEGORIES.filter((category) => category.code === SCHOOL_BOARDS_CATEGORY),
      tx,
    );
    const categories = await this.exams.listCategories();
    const boardCategories = new Set(
      categories.filter((category) => category.group === 'board').map((c) => c.code),
    );
    const existing = await this.exams.listExams();
    const boards = existing.filter((exam) => boardCategories.has(exam.category));
    const haystacks = boards.map(
      (exam) => `${exam.name} ${exam.shortName} ${exam.code} ${exam.state}`,
    );
    const missing = MORE_BOARDS.filter(
      (board) =>
        !existing.some((exam) => exam.code === board.code) &&
        !haystacks.some((text) => aliasesOf(board).some((alias) => mentions(text, alias))),
    );
    const start = Math.max(-1, ...boards.map((exam) => exam.position)) + 1;
    const inserted = await this.exams.insertMissingExams(
      missing.map((board, index) => ({ ...board, position: start + index })),
      tx,
    );
    for (const code of inserted) {
      await this.syllabi.createVersion(
        {
          exam: code,
          academicYear: this.academicYear,
          status: 'draft',
          title: 'First draft',
          notes:
            'Add subjects and chapters (or copy them from CBSE where the board uses NCERT books), then publish to show this board to students.',
          createdBy: null,
        },
        tx,
      );
    }
  }

  private get academicYear() {
    return academicYearOf(this.clock.now());
  }

  private async publishWith(
    exam: string,
    subjects: (SubjectContent & { position: number })[],
    title: string,
    tx: TxHandle,
  ) {
    const version = await this.syllabi.createVersion(
      {
        exam,
        academicYear: this.academicYear,
        status: 'published',
        title,
        createdBy: null,
        publishedAt: this.clock.now(),
      },
      tx,
    );
    await this.syllabi.insertSubjects(version.id, exam, subjects, tx);
    await this.syllabi.refreshCounts(version.id, tx);
  }

  private async migrateLegacy(boards: BoardDocument[], tx: TxHandle) {
    for (const board of boards) {
      await this.exams.createExam(
        schoolBoardExam({
          code: board.code,
          name: board.name,
          region: board.kind === 'state' ? 'state' : 'national',
          position: board.position ?? 0,
          ...(STANDARD_BOARDS.find((standard) => standard.code === board.code)
            ? {
                color: STANDARD_BOARDS.find((standard) => standard.code === board.code)!.color,
              }
            : {}),
        }),
        tx,
      );
      const subjects = await CatalogSubjectModel.find({ board: board.code }, null, { session: tx })
        .sort({ cls: 1, position: 1, name: 1 })
        .lean<CatalogSubjectDocument[]>();
      await this.publishWith(
        board.code,
        subjects.map((subject) => ({
          level: String(subject.cls),
          subjectId: subject.subjectId,
          name: subject.name,
          color: subject.color,
          position: subject.position ?? 0,
          units: subject.chapters.length
            ? [{ name: '', chapters: subject.chapters.map((chapter) => cleanChapter(chapter)) }]
            : [],
        })),
        'Copied from the board catalogue',
        tx,
      );
    }
  }

  private async seedStandardBoards(tx: TxHandle) {
    const standard = standardSubjects();
    for (const exam of STANDARD_BOARDS) {
      await this.exams.createExam(exam, tx);
      await this.publishWith(
        exam.code,
        standard
          .filter((subject) => subject.board === exam.code)
          .map((subject) => ({
            level: String(subject.cls),
            subjectId: subject.subjectId,
            name: subject.name,
            color: subject.color,
            position: subject.position,
            units: [
              { name: '', chapters: subject.chapters.map((chapter) => cleanChapter(chapter)) },
            ],
          })),
        'Standard syllabus',
        tx,
      );
    }
  }

  private async seedCompetitive(tx: TxHandle) {
    const inserted = new Set(
      await this.exams.insertMissingExams(
        COMPETITIVE_EXAMS.map((item) => item.exam),
        tx,
      ),
    );
    for (const { exam, subjects } of COMPETITIVE_EXAMS) {
      if (!inserted.has(exam.code)) continue;
      const draft = await this.syllabi.createVersion(
        {
          exam: exam.code,
          academicYear: this.academicYear,
          status: 'draft',
          title: 'First draft',
          notes: 'Fill in units, chapters and topics, then publish to show this exam to students.',
          createdBy: null,
        },
        tx,
      );
      const taken = new Map<string, Set<string>>();
      const positions = new Map<string, number>();
      await this.syllabi.insertSubjects(
        draft.id,
        exam.code,
        subjects.map((subject) => {
          const ids = taken.get(subject.level) ?? new Set<string>();
          taken.set(subject.level, ids);
          const subjectId = newSubjectId(subject.name, ids);
          ids.add(subjectId);
          const position = positions.get(subject.level) ?? 0;
          positions.set(subject.level, position + 1);
          return {
            level: subject.level,
            subjectId,
            name: subject.name,
            color: subjectColor(subjectId, position),
            position,
            units: cleanUnits((subject.units ?? []).map((name) => ({ name }))),
          };
        }),
        tx,
      );
      await this.syllabi.refreshCounts(draft.id, tx);
    }
  }
}
