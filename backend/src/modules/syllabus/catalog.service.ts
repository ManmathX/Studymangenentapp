import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type {
  BoardRecord,
  CatalogRepository,
  CatalogSubjectRecord,
  NewCatalogSubject,
} from './catalog.repository.js';
import type { BoardKind, CatalogChapterDoc } from './catalog.model.js';
import {
  ALL_CLASSES,
  RESERVED_SUBJECT_ID_PATTERN,
  SUBJECT_IDS,
  SUBJECTS,
  SUPPORTED_CLASSES,
  SYLLABUS,
} from './syllabus.data.js';

/** Boards that exist on a fresh install. Admins add state boards from the admin portal. */
const DEFAULT_BOARDS: BoardRecord[] = [
  { code: 'cbse', name: 'CBSE', kind: 'national', position: 0 },
  { code: 'icse', name: 'ICSE', kind: 'national', position: 1 },
];

/** Colours handed to new subjects in turn; admins can change them. */
export const SUBJECT_PALETTE = [
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FFCC00',
  '#5856D6',
  '#A2845E',
  '#30B0C7',
  '#FF6482',
  '#64D2FF',
];

/** The NCERT data that shipped with the app becomes CBSE class 9 and 10 in the catalogue. */
function defaultSubjects(): NewCatalogSubject[] {
  return SUPPORTED_CLASSES.flatMap((cls) =>
    SUBJECT_IDS.map((subjectId, position) => ({
      board: 'cbse',
      cls,
      subjectId,
      name: SUBJECTS[subjectId].name,
      color: SUBJECTS[subjectId].color,
      position,
      chapters: SYLLABUS[cls][subjectId].map(([name, difficulty]) => ({ name, difficulty })),
    })),
  );
}

/** What a student sees for one subject at setup. Chapter keys are `<subject>-<n>`, 1-based. */
export interface CatalogSubjectView {
  id: string;
  name: string;
  color: string;
  chapters: { key: string; name: string; difficulty: 1 | 2 | 3 }[];
}

export interface NewSubjectInput {
  subjectId?: string;
  name: string;
  color?: string;
  chapters: CatalogChapterDoc[];
}

export interface SubjectPatchInput {
  name?: string;
  color?: string;
  chapters?: CatalogChapterDoc[];
}

const slug = (text: string, separator: '' | '-') =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, separator)
    .replace(/^-+|-+$/g, '');

function toView(subject: CatalogSubjectRecord): CatalogSubjectView {
  return {
    id: subject.subjectId,
    name: subject.name,
    color: subject.color,
    chapters: subject.chapters.map((chapter, index) => ({
      key: `${subject.subjectId}-${index + 1}`,
      name: chapter.name,
      difficulty: chapter.difficulty,
    })),
  };
}

export class CatalogService {
  private seeding: Promise<void> | null = null;

  constructor(private readonly catalog: CatalogRepository) {}

  /** Fills an empty catalogue with CBSE and ICSE on first use. Runs once per process. */
  ensureSeeded(): Promise<void> {
    this.seeding ??= (async () => {
      if ((await this.catalog.countBoards()) > 0) return;
      await this.catalog.insertMissing(DEFAULT_BOARDS, defaultSubjects());
    })().catch((error: unknown) => {
      this.seeding = null;
      throw error;
    });
    return this.seeding;
  }

  /* ---------- What students see ---------- */

  async boards(): Promise<BoardRecord[]> {
    await this.ensureSeeded();
    return this.catalog.listBoards();
  }

  async classes(board: string): Promise<{ cls: number; available: boolean }[]> {
    await this.requireBoard(board);
    const counts = await this.catalog.subjectCounts();
    const loaded = new Set(counts.filter((row) => row.board === board).map((row) => row.cls));
    return ALL_CLASSES.map((cls) => ({ cls, available: loaded.has(cls) }));
  }

  /** Subjects with chapters for one class. Only subjects that have at least one chapter. */
  async subjectsFor(board: string, cls: number): Promise<CatalogSubjectView[]> {
    await this.requireBoard(board);
    const subjects = (await this.catalog.listSubjects(board, cls)).filter(
      (subject) => subject.chapters.length > 0,
    );
    if (!subjects.length)
      throw new NotFoundError('That class is not available yet', 'CLASS_NOT_AVAILABLE');
    return subjects.map(toView);
  }

  /* ---------- Admin ---------- */

  /** Every board with how many subjects each class has. */
  async overview() {
    // Seed before counting, or the very first call counts an empty catalogue.
    await this.ensureSeeded();
    const [boards, counts] = await Promise.all([
      this.catalog.listBoards(),
      this.catalog.subjectCounts(),
    ]);
    return boards.map((board) => ({
      ...board,
      classes: ALL_CLASSES.map((cls) => ({
        cls,
        subjects: counts.find((row) => row.board === board.code && row.cls === cls)?.count ?? 0,
      })),
    }));
  }

  async createBoard(input: { code?: string; name: string; kind: BoardKind }): Promise<BoardRecord> {
    await this.ensureSeeded();
    const code = input.code ?? slug(input.name, '-').slice(0, 32);
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(code))
      throw new ConflictError('Give the board a code such as "odisha"', 'BOARD_CODE_INVALID');
    if (await this.catalog.findBoard(code))
      throw new ConflictError(`A board with code "${code}" already exists`, 'BOARD_EXISTS');
    const boards = await this.catalog.listBoards();
    return this.catalog.createBoard({
      code,
      name: input.name,
      kind: input.kind,
      position: boards.length,
    });
  }

  async updateBoard(code: string, patch: { name?: string; kind?: BoardKind; position?: number }) {
    const updated = await this.catalog.updateBoard(code, patch);
    if (!updated) throw new NotFoundError('Board not found', 'BOARD_NOT_FOUND');
    return updated;
  }

  async deleteBoard(code: string): Promise<void> {
    if (!(await this.catalog.deleteBoard(code)))
      throw new NotFoundError('Board not found', 'BOARD_NOT_FOUND');
  }

  async adminSubjects(board: string, cls: number): Promise<CatalogSubjectRecord[]> {
    await this.requireBoard(board);
    return this.catalog.listSubjects(board, cls);
  }

  async createSubject(
    board: string,
    cls: number,
    input: NewSubjectInput,
  ): Promise<CatalogSubjectRecord> {
    await this.requireBoard(board);
    const existing = await this.catalog.listSubjects(board, cls);
    const taken = new Set(existing.map((subject) => subject.subjectId));
    if (existing.some((subject) => subject.name.toLowerCase() === input.name.toLowerCase()))
      throw new ConflictError(`Class ${cls} already has ${input.name}`, 'SUBJECT_EXISTS');
    const subjectId = input.subjectId ?? this.newSubjectId(input.name, taken);
    if (RESERVED_SUBJECT_ID_PATTERN.test(subjectId))
      throw new ConflictError('Ids starting with "custom" are reserved', 'SUBJECT_ID_RESERVED');
    if (taken.has(subjectId))
      throw new ConflictError(
        `Class ${cls} already has a subject "${subjectId}"`,
        'SUBJECT_EXISTS',
      );
    return this.catalog.createSubject({
      board,
      cls,
      subjectId,
      name: input.name,
      color: input.color ?? SUBJECT_PALETTE[existing.length % SUBJECT_PALETTE.length]!,
      position: existing.length,
      chapters: input.chapters,
    });
  }

  async updateSubject(id: string, patch: SubjectPatchInput): Promise<CatalogSubjectRecord> {
    const current = await this.catalog.findSubject(id);
    if (!current) throw new NotFoundError('Subject not found', 'SUBJECT_NOT_FOUND');
    if (patch.name && patch.name.toLowerCase() !== current.name.toLowerCase()) {
      const siblings = await this.catalog.listSubjects(current.board, current.cls);
      if (siblings.some((s) => s.id !== id && s.name.toLowerCase() === patch.name!.toLowerCase()))
        throw new ConflictError(`Class ${current.cls} already has ${patch.name}`, 'SUBJECT_EXISTS');
    }
    const updated = await this.catalog.updateSubject(id, patch);
    if (!updated) throw new NotFoundError('Subject not found', 'SUBJECT_NOT_FOUND');
    return updated;
  }

  async deleteSubject(id: string): Promise<void> {
    if (!(await this.catalog.deleteSubject(id)))
      throw new NotFoundError('Subject not found', 'SUBJECT_NOT_FOUND');
  }

  /** Puts a class's subjects in the given order (subject ids, first to last). */
  async reorder(board: string, cls: number, subjectIds: string[]) {
    const subjects = await this.adminSubjects(board, cls);
    const known = new Set(subjects.map((subject) => subject.subjectId));
    const ordered = subjectIds.filter((subjectId) => known.has(subjectId));
    const rest = subjects
      .map((s) => s.subjectId)
      .filter((subjectId) => !ordered.includes(subjectId));
    await this.catalog.setPositions(board, cls, [...ordered, ...rest]);
    return this.catalog.listSubjects(board, cls);
  }

  /** Copies every subject of another board/class that this class doesn't have yet. */
  async copyClass(board: string, cls: number, from: { board: string; cls: number }) {
    await this.requireBoard(board);
    await this.requireBoard(from.board);
    const [source, target] = await Promise.all([
      this.catalog.listSubjects(from.board, from.cls),
      this.catalog.listSubjects(board, cls),
    ]);
    const taken = new Set(target.map((subject) => subject.subjectId));
    const added = source
      .filter((subject) => !taken.has(subject.subjectId))
      .map((subject, index) => ({
        board,
        cls,
        subjectId: subject.subjectId,
        name: subject.name,
        color: subject.color,
        position: target.length + index,
        chapters: subject.chapters,
      }));
    await this.catalog.insertMissing([], added);
    return { added: added.length, subjects: await this.catalog.listSubjects(board, cls) };
  }

  async requireBoard(code: string): Promise<BoardRecord> {
    await this.ensureSeeded();
    const board = await this.catalog.findBoard(code);
    if (!board) throw new NotFoundError('That board is not available', 'BOARD_NOT_FOUND');
    return board;
  }

  private newSubjectId(name: string, taken: Set<string>): string {
    let base = slug(name, '').slice(0, 20);
    if (!/^[a-z]/.test(base)) base = `s${base}`;
    if (base.length < 2 || RESERVED_SUBJECT_ID_PATTERN.test(base))
      base = `subject${base}`.slice(0, 20);
    let candidate = base;
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}${n}`;
    return candidate;
  }
}
