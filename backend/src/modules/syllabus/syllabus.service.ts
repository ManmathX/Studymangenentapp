import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import type { Clock } from '../../common/utils/clock.js';
import type { TransactionRunner } from '../../database/transaction.js';
import type { CatalogCache } from './catalog-cache.js';
import type { CatalogSetup } from './catalog-setup.js';
import { importFileSchema } from './catalog.schemas.js';
import {
  academicYearOf,
  isValidAcademicYear,
  LIMITS,
  type ExamRecord,
  type NodeCounts,
  type SubjectContent,
  type SyllabusSubjectRecord,
  type SyllabusVersionRecord,
  type UnitNode,
} from './catalog.types.js';
import type { ExamRepository } from './exam.repository.js';
import { examDto, type ExamDto } from './exam.service.js';
import { standardSubjects } from './standard-catalog.data.js';
import {
  DEFAULT_CATEGORIES,
  newSubjectId,
  SCHOOL_BOARDS_CATEGORY,
  STANDARD_BOARDS,
  subjectColor,
} from './standard-exams.data.js';
import { csvToSyllabus, syllabusToCsv } from './syllabus-csv.js';
import {
  cleanChapter,
  cleanUnits,
  mergeStandardUnits,
  mergeUnits,
  sameName,
  treeProblems,
  zeroCounts,
  type MergeStats,
  type UnitInput,
} from './syllabus-tree.js';
import { RESERVED_SUBJECT_ID_PATTERN, SUBJECT_ID_PATTERN } from './syllabus.data.js';
import type { SubjectSummary, SyllabusRepository } from './syllabus.repository.js';

export interface VersionDetail extends SyllabusVersionRecord {
  editable: boolean;
  examInfo: ExamDto;
  /** The exam's levels with their subjects; one unnamed level when the exam has none. */
  levels: { key: string; name: string; grade?: number; subjects: SubjectSummary[] }[];
}

export interface CopySource {
  syllabusId: string;
  /** Copy only this level of the source. */
  level?: string;
  /** Level of the target exam to copy into (defaults to the same key, or none). */
  toLevel?: string;
}

export interface DraftInput {
  academicYear?: string;
  title?: string;
  notes?: string;
  copyFrom?: CopySource;
}

export interface SubjectSaveInput {
  revision: number;
  name?: string;
  color?: string;
  units: UnitInput[];
}

export interface ImportInput {
  format: 'json' | 'csv';
  content: string;
  mode: 'merge' | 'replace';
  dryRun: boolean;
}

export interface ImportProblem {
  row?: number;
  path?: string;
  message: string;
}

export interface ImportResult {
  applied: boolean;
  problems: ImportProblem[];
  levels: string[];
  subjects: { added: number; updated: number; removed: number };
  added: NodeCounts;
  updated: NodeCounts;
}

const LOCKED_MESSAGE =
  'Only drafts can be edited. Start a new draft from this version, edit it, then publish it.';

/** Admin side of syllabus versions and their content. */
export class SyllabusService {
  constructor(
    private readonly exams: ExamRepository,
    private readonly syllabi: SyllabusRepository,
    private readonly setup: CatalogSetup,
    private readonly cache: CatalogCache,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /* ---------- Versions ---------- */

  async versions(examCode: string): Promise<SyllabusVersionRecord[]> {
    await this.requireExam(examCode);
    return this.syllabi.listVersions({ exams: [examCode] });
  }

  async version(id: string): Promise<VersionDetail> {
    const version = await this.requireVersion(id);
    const exam = await this.requireExam(version.exam);
    const subjects = await this.syllabi.listSubjectSummaries(id);
    const levels = exam.structure.levels.length
      ? exam.structure.levels.map((level) => ({ ...level }))
      : [{ key: '', name: '' }];
    // Subjects at a level the exam no longer has still show, so they can be moved or deleted.
    for (const subject of subjects)
      if (!levels.some((level) => level.key === subject.level))
        levels.push({ key: subject.level, name: `${subject.level || 'No level'} (removed)` });
    return {
      ...version,
      editable: version.status === 'draft',
      examInfo: examDto(exam),
      levels: levels.map((level) => ({
        ...level,
        subjects: subjects.filter((subject) => subject.level === level.key),
      })),
    };
  }

  /** A new draft for `examCode`: empty, or a copy of another version (of any exam). */
  async createDraft(
    examCode: string,
    input: DraftInput,
    userId: string,
  ): Promise<{ version: SyllabusVersionRecord; copied: number; skipped: number }> {
    const exam = await this.requireExam(examCode);
    const academicYear = input.academicYear ?? academicYearOf(this.clock.now());
    if (!isValidAcademicYear(academicYear))
      throw new UnprocessableError(
        'Use an academic year like 2026-27 or 2027',
        'ACADEMIC_YEAR_INVALID',
      );
    const plan = input.copyFrom
      ? await this.copyPlan(input.copyFrom, exam)
      : { subjects: [], skipped: 0 };
    const version = await this.transactions.run(async (tx) => {
      const created = await this.syllabi.createVersion(
        {
          exam: examCode,
          academicYear,
          status: 'draft',
          title: input.title ?? '',
          notes: input.notes ?? '',
          createdBy: userId,
        },
        tx,
      );
      await this.syllabi.insertSubjects(created.id, examCode, plan.subjects, tx);
      await this.syllabi.refreshCounts(created.id, tx);
      return created;
    });
    this.cache.invalidate();
    return {
      version: (await this.syllabi.findVersion(version.id))!,
      copied: plan.subjects.length,
      skipped: plan.skipped,
    };
  }

  /** Copies a version into a new draft, of the same exam or another one. */
  duplicate(
    id: string,
    input: {
      exam?: string;
      academicYear?: string;
      title?: string;
      level?: string;
      toLevel?: string;
    },
    userId: string,
  ) {
    return this.requireVersion(id).then((source) =>
      this.createDraft(
        input.exam ?? source.exam,
        {
          academicYear: input.academicYear ?? source.academicYear,
          title: input.title ?? `Copy of ${source.academicYear} v${source.version}`,
          copyFrom: {
            syllabusId: id,
            ...(input.level !== undefined ? { level: input.level } : {}),
            ...(input.toLevel !== undefined ? { toLevel: input.toLevel } : {}),
          },
        },
        userId,
      ),
    );
  }

  /**
   * Which subjects of a source version land where in `target`. Levels are matched by key;
   * subjects whose level the target exam doesn't have are skipped.
   */
  private async copyPlan(source: CopySource, target: ExamRecord) {
    const from = await this.requireVersion(source.syllabusId);
    const all = await this.syllabi.listSubjects(source.syllabusId, source.level);
    const targetLevels = new Set(target.structure.levels.map((level) => level.key));
    const hasLevel = (key: string) => (targetLevels.size ? targetLevels.has(key) : key === '');
    const fromExam = from.exam === target.code ? target : await this.requireExam(from.exam);
    if (source.level === undefined && fromExam.structure.levels.length && !targetLevels.size)
      throw new UnprocessableError(
        `${target.name} has no levels. Pick which ${fromExam.structure.levelLabel.toLowerCase()} of ${fromExam.name} to copy.`,
        'LEVEL_REQUIRED',
      );
    const destination = (level: string) => {
      if (source.toLevel !== undefined) return source.toLevel;
      if (source.level !== undefined && !targetLevels.size) return '';
      return level;
    };
    if (source.toLevel !== undefined && !hasLevel(source.toLevel))
      throw new UnprocessableError(
        `${target.name} has no level "${source.toLevel}"`,
        'LEVEL_NOT_FOUND',
      );
    let skipped = 0;
    const subjects: (SubjectContent & { position: number })[] = [];
    for (const subject of all) {
      const level = destination(subject.level);
      if (
        !hasLevel(level) ||
        subjects.some((s) => s.level === level && s.subjectId === subject.subjectId)
      ) {
        skipped += 1;
        continue;
      }
      subjects.push({
        level,
        subjectId: subject.subjectId,
        name: subject.name,
        color: subject.color,
        position: subject.position,
        units: subject.units,
      });
    }
    return { subjects, skipped };
  }

  async updateVersion(
    id: string,
    patch: { academicYear?: string; title?: string; notes?: string },
  ): Promise<SyllabusVersionRecord> {
    const version = await this.requireVersion(id);
    const changes: Parameters<SyllabusRepository['updateVersion']>[1] = {};
    if (patch.title !== undefined) changes.title = patch.title;
    if (patch.notes !== undefined) changes.notes = patch.notes;
    if (patch.academicYear !== undefined && patch.academicYear !== version.academicYear) {
      if (version.status !== 'draft')
        throw new ConflictError('Only a draft’s academic year can change', 'VERSION_LOCKED');
      changes.academicYear = patch.academicYear;
      changes.version = await this.syllabi.nextVersionNumber(version.exam, patch.academicYear);
    }
    const updated = await this.syllabi.updateVersion(id, changes);
    if (!updated) throw new NotFoundError('Syllabus not found', 'SYLLABUS_NOT_FOUND');
    return updated;
  }

  async deleteVersion(id: string): Promise<void> {
    const version = await this.requireVersion(id);
    if (version.status === 'published')
      throw new ConflictError('Unpublish this syllabus before deleting it', 'VERSION_PUBLISHED');
    await this.transactions.run((tx) => this.syllabi.deleteVersion(id, tx));
    this.cache.invalidate();
  }

  /**
   * Makes this version the one students get. The exam's previously published version (if any)
   * is archived in the same transaction. Students already set up keep their own copy.
   */
  async publish(
    id: string,
    userId: string,
  ): Promise<{ version: SyllabusVersionRecord; archived: string | null }> {
    const version = await this.requireVersion(id);
    if (version.status === 'published')
      throw new ConflictError('This syllabus is already published', 'ALREADY_PUBLISHED');
    const exam = await this.requireExam(version.exam);
    const subjects = await this.syllabi.listSubjectSummaries(id);
    if (!subjects.some((subject) => subject.counts.chapters > 0))
      throw new UnprocessableError(
        'Add at least one subject with chapters before publishing',
        'SYLLABUS_EMPTY',
      );
    const levels = new Set(
      exam.structure.levels.length ? exam.structure.levels.map((l) => l.key) : [''],
    );
    const stray = subjects.filter((subject) => !levels.has(subject.level));
    if (stray.length)
      throw new UnprocessableError(
        `${stray.map((s) => s.name).join(', ')} ${stray.length === 1 ? 'is' : 'are'} at a level ${exam.name} no longer has. Move or delete ${stray.length === 1 ? 'it' : 'them'} first.`,
        'LEVEL_UNKNOWN',
      );
    const result = await this.transactions.run(async (tx) => {
      const archived = await this.syllabi.archivePublished(version.exam, tx);
      const published = await this.syllabi.updateVersion(
        id,
        { status: 'published', publishedAt: this.clock.now(), publishedBy: userId },
        tx,
      );
      return { version: published!, archived };
    });
    this.cache.invalidate();
    return result;
  }

  /** Takes the published version back to draft. The exam then has nothing for new students. */
  async unpublish(id: string): Promise<SyllabusVersionRecord> {
    const version = await this.requireVersion(id);
    if (version.status !== 'published')
      throw new ConflictError('This syllabus is not published', 'NOT_PUBLISHED');
    const updated = await this.syllabi.updateVersion(id, {
      status: 'draft',
      publishedAt: null,
      publishedBy: null,
    });
    this.cache.invalidate();
    return updated!;
  }

  /* ---------- Subjects ---------- */

  async subjects(id: string, level?: string): Promise<SyllabusSubjectRecord[]> {
    await this.requireVersion(id);
    return this.syllabi.listSubjects(id, level);
  }

  async subject(subjectId: string): Promise<SyllabusSubjectRecord> {
    const subject = await this.syllabi.findSubject(subjectId);
    if (!subject) throw new NotFoundError('Subject not found', 'SUBJECT_NOT_FOUND');
    return subject;
  }

  async createSubject(
    id: string,
    input: { level?: string; name: string; subjectId?: string; color?: string },
  ): Promise<SyllabusSubjectRecord> {
    const version = await this.requireDraft(id);
    const exam = await this.requireExam(version.exam);
    const level = this.requireLevel(exam, input.level ?? '');
    const siblings = await this.syllabi.listSubjects(id, level);
    if (siblings.length >= LIMITS.subjectsPerLevel)
      throw new ConflictError(
        `At most ${LIMITS.subjectsPerLevel} subjects per level`,
        'TOO_MANY_SUBJECTS',
      );
    if (siblings.some((subject) => sameName(subject.name, input.name)))
      throw new ConflictError(
        `${levelText(exam, level)} already has ${input.name}`,
        'SUBJECT_EXISTS',
      );
    const taken = new Set(siblings.map((subject) => subject.subjectId));
    const subjectId = input.subjectId ?? newSubjectId(input.name, taken);
    if (RESERVED_SUBJECT_ID_PATTERN.test(subjectId))
      throw new ConflictError('Ids starting with "custom" are reserved', 'SUBJECT_ID_RESERVED');
    if (taken.has(subjectId))
      throw new ConflictError(
        `${levelText(exam, level)} already has a subject "${subjectId}"`,
        'SUBJECT_EXISTS',
      );
    await this.syllabi.insertSubjects(id, exam.code, [
      {
        level,
        subjectId,
        name: input.name,
        color: input.color?.toUpperCase() ?? subjectColor(subjectId, siblings.length),
        position: siblings.length,
        units: [],
      },
    ]);
    await this.syllabi.refreshCounts(id);
    const created = (await this.syllabi.listSubjects(id, level)).find(
      (s) => s.subjectId === subjectId,
    );
    return created!;
  }

  /**
   * Saves a subject's name, colour and whole tree. `revision` must be the one the editor
   * loaded; if someone saved in between, nothing is written and the editor is told to reload.
   */
  async saveSubject(subjectDocId: string, input: SubjectSaveInput): Promise<SyllabusSubjectRecord> {
    const current = await this.subject(subjectDocId);
    await this.requireDraft(current.syllabus);
    const exam = await this.requireExam(current.exam);
    const name = input.name ?? current.name;
    if (input.name && !sameName(input.name, current.name)) {
      const siblings = await this.syllabi.listSubjects(current.syllabus, current.level);
      if (siblings.some((s) => s.id !== subjectDocId && sameName(s.name, input.name!)))
        throw new ConflictError(
          `${levelText(exam, current.level)} already has ${input.name}`,
          'SUBJECT_EXISTS',
        );
    }
    const units = cleanUnits(input.units);
    const problems = treeProblems(name, units);
    if (problems.length) throw new UnprocessableError(problems.join('. '), 'SYLLABUS_INVALID');
    const saved = await this.syllabi.saveSubject(subjectDocId, input.revision, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color.toUpperCase() } : {}),
      units,
    });
    if (!saved) {
      if (await this.syllabi.findSubject(subjectDocId))
        throw new ConflictError(
          'Someone else saved this subject since you opened it. Reload to see their changes.',
          'SUBJECT_CHANGED',
        );
      throw new NotFoundError('Subject not found', 'SUBJECT_NOT_FOUND');
    }
    await this.syllabi.refreshCounts(current.syllabus);
    return saved;
  }

  async deleteSubject(subjectDocId: string): Promise<void> {
    const current = await this.subject(subjectDocId);
    await this.requireDraft(current.syllabus);
    await this.syllabi.deleteSubject(subjectDocId);
    await this.syllabi.refreshCounts(current.syllabus);
  }

  /** Puts a level's subjects in the given order (subject ids, first to last). */
  async reorderSubjects(
    id: string,
    level: string,
    subjectIds: string[],
  ): Promise<SyllabusSubjectRecord[]> {
    await this.requireDraft(id);
    const subjects = await this.syllabi.listSubjects(id, level);
    const known = new Set(subjects.map((subject) => subject.subjectId));
    const ordered = [...new Set(subjectIds)].filter((subjectId) => known.has(subjectId));
    const rest = subjects
      .map((s) => s.subjectId)
      .filter((subjectId) => !ordered.includes(subjectId));
    await this.syllabi.setSubjectPositions(id, level, [...ordered, ...rest]);
    return this.syllabi.listSubjects(id, level);
  }

  /** Copies the subjects of another version's level into a level of this draft (missing ones only). */
  async copyLevel(
    id: string,
    level: string,
    from: { syllabusId: string; level: string },
  ): Promise<{ added: number; subjects: SyllabusSubjectRecord[] }> {
    const version = await this.requireDraft(id);
    const exam = await this.requireExam(version.exam);
    this.requireLevel(exam, level);
    const plan = await this.copyPlan(
      { syllabusId: from.syllabusId, level: from.level, toLevel: level },
      exam,
    );
    const existing = await this.syllabi.listSubjects(id, level);
    const taken = new Set(existing.map((subject) => subject.subjectId));
    const names = existing.map((subject) => subject.name);
    const fresh = plan.subjects
      .filter(
        (subject) =>
          !taken.has(subject.subjectId) && !names.some((name) => sameName(name, subject.name)),
      )
      .slice(0, Math.max(0, LIMITS.subjectsPerLevel - existing.length))
      .map((subject, index) => ({ ...subject, position: existing.length + index }));
    await this.syllabi.insertSubjects(id, exam.code, fresh);
    await this.syllabi.refreshCounts(id);
    return { added: fresh.length, subjects: await this.syllabi.listSubjects(id, level) };
  }

  /* ---------- Import and export ---------- */

  async exportContent(
    id: string,
    format: 'json' | 'csv',
    level?: string,
  ): Promise<{ filename: string; contentType: string; content: string }> {
    const version = await this.requireVersion(id);
    const exam = await this.requireExam(version.exam);
    const subjects: SubjectContent[] = (await this.syllabi.listSubjects(id, level)).map(
      (subject) => ({
        level: subject.level,
        subjectId: subject.subjectId,
        name: subject.name,
        color: subject.color,
        units: subject.units,
      }),
    );
    const base = `${exam.code}-${version.academicYear}-v${version.version}${level ? `-${level}` : ''}`;
    if (format === 'csv')
      return { filename: `${base}.csv`, contentType: 'text/csv', content: syllabusToCsv(subjects) };
    const content = JSON.stringify(
      {
        format: 'study-planner-syllabus',
        formatVersion: 1,
        exam: exam.code,
        examName: exam.name,
        academicYear: version.academicYear,
        version: version.version,
        status: version.status,
        exportedAt: this.clock.now().toISOString(),
        subjects,
      },
      null,
      2,
    );
    return { filename: `${base}.json`, contentType: 'application/json', content };
  }

  /**
   * Imports a JSON export or a CSV sheet into a draft. `merge` adds and updates by name and
   * never removes; `replace` replaces every subject at the levels the file mentions. With
   * `dryRun` nothing is written and the result says what would change.
   */
  async importContent(id: string, input: ImportInput): Promise<ImportResult> {
    const version = await this.requireDraft(id);
    const exam = await this.requireExam(version.exam);
    const result: ImportResult = {
      applied: false,
      problems: [],
      levels: [],
      subjects: { added: 0, updated: 0, removed: 0 },
      added: zeroCounts(),
      updated: zeroCounts(),
    };
    const parsed = this.parseImport(exam, input);
    if (parsed.problems.length) return { ...result, problems: parsed.problems };
    const incoming = parsed.subjects;
    const levels = [...new Set(incoming.map((subject) => subject.level))];
    result.levels = levels;
    const existing = await this.syllabi.listSubjects(id);
    const stats: MergeStats = { added: result.added, updated: result.updated };

    // What each level looks like afterwards.
    const updates: { id: string; units: UnitNode[] }[] = [];
    const inserts: (SubjectContent & { position: number })[] = [];
    const problems: ImportProblem[] = [];
    for (const level of levels) {
      const have = existing.filter((subject) => subject.level === level);
      const coming = incoming.filter((subject) => subject.level === level);
      if (input.mode === 'replace') {
        result.subjects.removed += have.length;
        const taken = new Set<string>();
        coming.forEach((subject, position) => {
          // Keep the id and colour of a subject being replaced by one with the same name.
          const previous = have.find((s) => sameName(s.name, subject.name));
          const subjectId =
            subject.subjectId || previous?.subjectId || newSubjectId(subject.name, taken);
          taken.add(subjectId);
          const units = mergeUnits([], subject.units, stats, parsed.explicitFor);
          inserts.push({
            ...subject,
            subjectId,
            color: subject.color || previous?.color || subjectColor(subjectId, position),
            position,
            units,
          });
          result.subjects.added += 1;
        });
      } else {
        const taken = new Set(have.map((subject) => subject.subjectId));
        let position = have.length;
        for (const subject of coming) {
          const match = have.find((s) =>
            subject.subjectId ? s.subjectId === subject.subjectId : sameName(s.name, subject.name),
          );
          if (match) {
            const units = mergeUnits(match.units, subject.units, stats, parsed.explicitFor);
            updates.push({ id: match.id, units });
            result.subjects.updated += 1;
            continue;
          }
          const subjectId = subject.subjectId || newSubjectId(subject.name, taken);
          taken.add(subjectId);
          inserts.push({
            ...subject,
            subjectId,
            color: subject.color || subjectColor(subjectId, position),
            position,
            units: mergeUnits([], subject.units, stats, parsed.explicitFor),
          });
          position += 1;
          result.subjects.added += 1;
        }
      }
      const count =
        input.mode === 'replace'
          ? coming.length
          : have.length + inserts.filter((s) => s.level === level).length;
      if (count > LIMITS.subjectsPerLevel)
        problems.push({
          message: `${levelText(exam, level)} would have more than ${LIMITS.subjectsPerLevel} subjects`,
        });
    }
    for (const subject of [
      ...inserts,
      ...updates.map((u) => ({ ...u, name: existing.find((s) => s.id === u.id)!.name })),
    ])
      problems.push(...treeProblems(subject.name, subject.units).map((message) => ({ message })));
    for (const subject of inserts) {
      if (
        !SUBJECT_ID_PATTERN.test(subject.subjectId) ||
        RESERVED_SUBJECT_ID_PATTERN.test(subject.subjectId)
      )
        problems.push({ message: `"${subject.subjectId}" can't be used as a subject id` });
    }
    if (problems.length) return { ...result, applied: false, problems };
    if (input.dryRun) return result;

    await this.transactions.run(async (tx) => {
      if (input.mode === 'replace') await this.syllabi.deleteSubjectsAtLevels(id, levels, tx);
      for (const update of updates) await this.syllabi.replaceUnits(update.id, update.units, tx);
      await this.syllabi.insertSubjects(id, exam.code, inserts, tx);
      await this.syllabi.refreshCounts(id, tx);
    });
    return { ...result, applied: true };
  }

  private parseImport(
    exam: ExamRecord,
    input: ImportInput,
  ): {
    subjects: SubjectContent[];
    problems: ImportProblem[];
    explicitFor: (node: object) => ReadonlySet<string> | null;
  } {
    if (input.format === 'csv') {
      // The sheet's nodes are already clean; merges overwrite only the columns a row filled in.
      const parsed = csvToSyllabus(input.content, exam);
      const none: ReadonlySet<string> = new Set();
      return {
        subjects: parsed.subjects,
        problems: parsed.problems,
        explicitFor: (node) => parsed.explicit.get(node) ?? none,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(input.content);
    } catch {
      return {
        subjects: [],
        problems: [{ message: 'The file is not valid JSON' }],
        explicitFor: () => null,
      };
    }
    const checked = importFileSchema.safeParse(json);
    if (!checked.success)
      return {
        subjects: [],
        problems: checked.error.issues.slice(0, 50).map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
        explicitFor: () => null,
      };
    const problems: ImportProblem[] = [];
    const levels = exam.structure.levels;
    const subjects = checked.data.subjects.flatMap((subject, index): SubjectContent[] => {
      const levelText = subject.level ?? '';
      const level = levels.length
        ? levels.find((item) => item.key === levelText || sameName(item.name, levelText))?.key
        : levelText
          ? undefined
          : '';
      if (level === undefined) {
        problems.push({
          path: `subjects.${index}.level`,
          message: levels.length ? `Unknown level "${levelText}"` : `${exam.name} has no levels`,
        });
        return [];
      }
      if (subject.subjectId && !SUBJECT_ID_PATTERN.test(subject.subjectId)) {
        problems.push({
          path: `subjects.${index}.subjectId`,
          message: 'Use 2–24 lowercase letters and numbers',
        });
        return [];
      }
      return [
        {
          level,
          subjectId: subject.subjectId ?? '',
          name: subject.name,
          color: subject.color?.toUpperCase() ?? '',
          units: cleanUnits(subject.units),
        },
      ];
    });
    return { subjects, problems, explicitFor: () => null };
  }

  /* ---------- Standard CBSE and ICSE ---------- */

  /**
   * Loads the standard CBSE and ICSE syllabus (classes 6–12) into a draft of each board, made
   * from the published version when there is no draft yet. Adds missing subjects; for existing
   * subjects fills in book names and appends missing standard chapters. Admin edits are kept.
   * Review the drafts, then publish them.
   */
  async loadStandard(userId: string) {
    await this.setup.ensureReady();
    await this.exams.insertMissingCategories(
      DEFAULT_CATEGORIES.filter((c) => c.code === SCHOOL_BOARDS_CATEGORY),
    );
    const standard = standardSubjects();
    let added = 0;
    let updated = 0;
    const drafts: { exam: string; syllabusId: string }[] = [];
    for (const board of STANDARD_BOARDS) {
      let exam = await this.exams.findExam(board.code);
      if (!exam) {
        const position = (await this.exams.listExams({ category: SCHOOL_BOARDS_CATEGORY })).length;
        exam = await this.exams.createExam({ ...board, position });
      }
      const versions = await this.syllabi.listVersions({ exams: [board.code] });
      let draft = versions
        .filter((version) => version.status === 'draft')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!draft) {
        const published = versions.find((version) => version.status === 'published');
        draft = (
          await this.createDraft(
            board.code,
            {
              title: 'Standard syllabus update',
              ...(published ? { copyFrom: { syllabusId: published.id } } : {}),
            },
            userId,
          )
        ).version;
      }
      const levels = new Set(exam.structure.levels.map((level) => level.key));
      const existing = await this.syllabi.listSubjects(draft.id);
      const fresh: (SubjectContent & { position: number })[] = [];
      for (const subject of standard.filter((s) => s.board === board.code)) {
        const level = String(subject.cls);
        if (!levels.has(level)) continue;
        const chapters = subject.chapters.map((chapter) => cleanChapter(chapter));
        const current = existing.find(
          (s) => s.level === level && s.subjectId === subject.subjectId,
        );
        if (!current) {
          const position =
            existing.filter((s) => s.level === level).length +
            fresh.filter((s) => s.level === level).length;
          fresh.push({
            level,
            subjectId: subject.subjectId,
            name: subject.name,
            color: subject.color,
            position,
            units: [{ name: '', chapters }],
          });
          continue;
        }
        const merged = mergeStandardUnits(current.units, chapters);
        if (merged) {
          await this.syllabi.replaceUnits(current.id, merged);
          updated += 1;
        }
      }
      await this.syllabi.insertSubjects(draft.id, board.code, fresh);
      await this.syllabi.refreshCounts(draft.id);
      added += fresh.length;
      drafts.push({ exam: board.code, syllabusId: draft.id });
    }
    this.cache.invalidate();
    return { added, updated, drafts };
  }

  /* ---------- Helpers ---------- */

  async requireVersion(id: string): Promise<SyllabusVersionRecord> {
    await this.setup.ensureReady();
    const version = await this.syllabi.findVersion(id);
    if (!version) throw new NotFoundError('Syllabus not found', 'SYLLABUS_NOT_FOUND');
    return version;
  }

  private async requireDraft(id: string): Promise<SyllabusVersionRecord> {
    const version = await this.requireVersion(id);
    if (version.status !== 'draft') throw new ConflictError(LOCKED_MESSAGE, 'VERSION_LOCKED');
    return version;
  }

  private async requireExam(code: string): Promise<ExamRecord> {
    await this.setup.ensureReady();
    const exam = await this.exams.findExam(code);
    if (!exam) throw new NotFoundError('Exam not found', 'EXAM_NOT_FOUND');
    return exam;
  }

  private requireLevel(exam: ExamRecord, level: string): string {
    const levels = exam.structure.levels;
    if (!levels.length) {
      if (level) throw new UnprocessableError(`${exam.name} has no levels`, 'LEVEL_NOT_FOUND');
      return '';
    }
    if (!levels.some((item) => item.key === level))
      throw new UnprocessableError(
        level
          ? `${exam.name} has no ${exam.structure.levelLabel.toLowerCase()} "${level}"`
          : `Pick a ${exam.structure.levelLabel.toLowerCase()}`,
        'LEVEL_NOT_FOUND',
      );
    return level;
  }
}

function levelText(exam: ExamRecord, level: string): string {
  if (!level) return exam.name;
  return exam.structure.levels.find((item) => item.key === level)?.name ?? `${exam.name} ${level}`;
}
