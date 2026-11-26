import type { Types } from 'mongoose';
import { idOf, isObjectIdString, toObjectId } from '../../database/ids.js';
import type { TxHandle } from '../../database/transaction.js';
import {
  emptyCounts,
  type NodeCounts,
  type SubjectContent,
  type SyllabusSubjectRecord,
  type SyllabusVersionRecord,
  type UnitNode,
  type VersionCounts,
  type VersionStatus,
} from './catalog.types.js';
import { countNodes, normaliseStoredUnits } from './syllabus-tree.js';
import {
  SyllabusSubjectModel,
  SyllabusVersionModel,
  type SyllabusSubjectDocument,
  type SyllabusVersionDocument,
} from './syllabus-version.model.js';

export interface NewVersion {
  exam: string;
  academicYear: string;
  status: VersionStatus;
  title?: string;
  notes?: string;
  createdBy: string | null;
  publishedAt?: Date | null;
  publishedBy?: string | null;
}

export interface VersionFilter {
  exams?: string[];
  status?: VersionStatus | VersionStatus[];
  academicYear?: string;
}

export interface SubjectSummary {
  id: string;
  level: string;
  subjectId: string;
  name: string;
  color: string;
  position: number;
  revision: number;
  counts: NodeCounts;
}

const session = (tx?: TxHandle) => (tx ? { session: tx } : {});
const optionalId = (id: string | null | undefined) =>
  id && isObjectIdString(id) ? toObjectId(id) : null;

function toCounts(raw: Partial<VersionCounts> | undefined): VersionCounts {
  return { ...emptyCounts(), ...raw };
}

function toVersion(doc: SyllabusVersionDocument): SyllabusVersionRecord {
  return {
    id: idOf(doc),
    exam: doc.exam,
    academicYear: doc.academicYear,
    version: doc.version,
    status: doc.status,
    title: doc.title ?? '',
    notes: doc.notes ?? '',
    counts: toCounts(doc.counts),
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    publishedBy: doc.publishedBy ? doc.publishedBy.toHexString() : null,
    createdBy: doc.createdBy ? doc.createdBy.toHexString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toSubject(doc: SyllabusSubjectDocument): SyllabusSubjectRecord {
  const units = normaliseStoredUnits(doc.units);
  return {
    id: idOf(doc),
    syllabus: doc.syllabus.toHexString(),
    exam: doc.exam,
    level: doc.level ?? '',
    subjectId: doc.subjectId,
    name: doc.name,
    color: doc.color,
    position: doc.position ?? 0,
    revision: doc.revision ?? 1,
    counts: countNodes(units),
    units,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const ZERO_COUNTS: NodeCounts = { units: 0, chapters: 0, topics: 0, subtopics: 0 };

const SUMMARY_FIELDS = {
  level: 1,
  subjectId: 1,
  name: 1,
  color: 1,
  position: 1,
  revision: 1,
  counts: 1,
} as const;

function toSummary(doc: Omit<SyllabusSubjectDocument, 'units'>): SubjectSummary {
  return {
    id: idOf(doc),
    level: doc.level ?? '',
    subjectId: doc.subjectId,
    name: doc.name,
    color: doc.color,
    position: doc.position ?? 0,
    revision: doc.revision ?? 1,
    counts: { ...ZERO_COUNTS, ...doc.counts },
  };
}

function versionQuery(filter: VersionFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filter.exams) query.exam = { $in: filter.exams };
  if (filter.status)
    query.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
  if (filter.academicYear) query.academicYear = filter.academicYear;
  return query;
}

/** Syllabus versions and their subjects. */
export class MongoSyllabusRepository {
  /* ---------- Versions ---------- */

  async listVersions(filter: VersionFilter = {}): Promise<SyllabusVersionRecord[]> {
    const docs = await SyllabusVersionModel.find(versionQuery(filter))
      .sort({ academicYear: -1, version: -1 })
      .lean<SyllabusVersionDocument[]>();
    return docs.map(toVersion);
  }

  async countVersions(filter: VersionFilter = {}): Promise<number> {
    return SyllabusVersionModel.countDocuments(versionQuery(filter));
  }

  async recentVersions(filter: VersionFilter, limit: number): Promise<SyllabusVersionRecord[]> {
    const docs = await SyllabusVersionModel.find(versionQuery(filter))
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<SyllabusVersionDocument[]>();
    return docs.map(toVersion);
  }

  async academicYears(): Promise<string[]> {
    const years = await SyllabusVersionModel.distinct('academicYear');
    return years.sort().reverse();
  }

  async findVersion(id: string, tx?: TxHandle): Promise<SyllabusVersionRecord | null> {
    if (!isObjectIdString(id)) return null;
    const doc = await SyllabusVersionModel.findById(
      toObjectId(id),
      null,
      session(tx),
    ).lean<SyllabusVersionDocument>();
    return doc ? toVersion(doc) : null;
  }

  async findPublished(exam: string, tx?: TxHandle): Promise<SyllabusVersionRecord | null> {
    const doc = await SyllabusVersionModel.findOne(
      { exam, status: 'published' },
      null,
      session(tx),
    ).lean<SyllabusVersionDocument>();
    return doc ? toVersion(doc) : null;
  }

  async nextVersionNumber(exam: string, academicYear: string, tx?: TxHandle): Promise<number> {
    const doc = await SyllabusVersionModel.findOne(
      { exam, academicYear },
      { version: 1 },
      session(tx),
    )
      .sort({ version: -1 })
      .lean<{ version: number }>();
    return (doc?.version ?? 0) + 1;
  }

  async createVersion(input: NewVersion, tx?: TxHandle): Promise<SyllabusVersionRecord> {
    const version = await this.nextVersionNumber(input.exam, input.academicYear, tx);
    const [doc] = await SyllabusVersionModel.create(
      [
        {
          exam: input.exam,
          academicYear: input.academicYear,
          version,
          status: input.status,
          title: input.title ?? '',
          notes: input.notes ?? '',
          createdBy: optionalId(input.createdBy),
          publishedAt: input.publishedAt ?? null,
          publishedBy: optionalId(input.publishedBy),
        },
      ],
      session(tx),
    );
    return toVersion(doc!.toObject());
  }

  async updateVersion(
    id: string,
    patch: Partial<Pick<SyllabusVersionRecord, 'academicYear' | 'version' | 'title' | 'notes'>> & {
      status?: VersionStatus;
      publishedAt?: Date | null;
      publishedBy?: string | null;
    },
    tx?: TxHandle,
  ): Promise<SyllabusVersionRecord | null> {
    if (!isObjectIdString(id)) return null;
    const { publishedBy, ...rest } = patch;
    const set: Record<string, unknown> = { ...rest };
    if (publishedBy !== undefined) set.publishedBy = optionalId(publishedBy);
    const doc = await SyllabusVersionModel.findByIdAndUpdate(
      toObjectId(id),
      { $set: set },
      { new: true, runValidators: true, ...session(tx) },
    ).lean<SyllabusVersionDocument>();
    return doc ? toVersion(doc) : null;
  }

  /** Moves the exam's published version (if any) to archived. */
  async archivePublished(exam: string, tx?: TxHandle): Promise<string | null> {
    const doc = await SyllabusVersionModel.findOneAndUpdate(
      { exam, status: 'published' },
      { $set: { status: 'archived' } },
      { new: true, ...session(tx) },
    ).lean<SyllabusVersionDocument>();
    return doc ? idOf(doc) : null;
  }

  async deleteVersion(id: string, tx?: TxHandle): Promise<boolean> {
    if (!isObjectIdString(id)) return false;
    const objectId = toObjectId(id);
    await SyllabusSubjectModel.deleteMany({ syllabus: objectId }, session(tx));
    return (
      (await SyllabusVersionModel.deleteOne({ _id: objectId }, session(tx))).deletedCount === 1
    );
  }

  async deleteVersionsOfExam(exam: string, tx?: TxHandle): Promise<void> {
    await SyllabusSubjectModel.deleteMany({ exam }, session(tx));
    await SyllabusVersionModel.deleteMany({ exam }, session(tx));
  }

  /** Recomputes a version's totals from its subjects. */
  async refreshCounts(id: string, tx?: TxHandle): Promise<VersionCounts> {
    const objectId = toObjectId(id);
    const [row] = await SyllabusSubjectModel.aggregate<VersionCounts>(
      [
        { $match: { syllabus: objectId } },
        {
          $group: {
            _id: null,
            subjects: { $sum: 1 },
            units: { $sum: '$counts.units' },
            chapters: { $sum: '$counts.chapters' },
            topics: { $sum: '$counts.topics' },
            subtopics: { $sum: '$counts.subtopics' },
          },
        },
        { $project: { _id: 0 } },
      ],
      session(tx),
    );
    const counts = toCounts(row);
    await SyllabusVersionModel.updateOne({ _id: objectId }, { $set: { counts } }, session(tx));
    return counts;
  }

  /** Levels of each version that have at least one subject with chapters. */
  async levelsWithChapters(versionIds: string[]): Promise<Map<string, Set<string>>> {
    const rows = await SyllabusSubjectModel.aggregate<{
      _id: { syllabus: Types.ObjectId; level: string };
    }>([
      {
        $match: {
          syllabus: { $in: versionIds.map(toObjectId) },
          'counts.chapters': { $gt: 0 },
        },
      },
      { $group: { _id: { syllabus: '$syllabus', level: '$level' } } },
    ]);
    const result = new Map<string, Set<string>>();
    for (const row of rows) {
      const id = row._id.syllabus.toHexString();
      if (!result.has(id)) result.set(id, new Set());
      result.get(id)!.add(row._id.level ?? '');
    }
    return result;
  }

  /** Levels that draft or published versions of the exam have subjects at. */
  async levelsInUse(exam: string): Promise<Set<string>> {
    const live = await SyllabusVersionModel.find(
      { exam, status: { $in: ['draft', 'published'] } },
      { _id: 1 },
    ).lean<{ _id: Types.ObjectId }[]>();
    if (!live.length) return new Set();
    const levels = (await SyllabusSubjectModel.distinct('level', {
      syllabus: { $in: live.map((doc) => doc._id) },
    })) as (string | null)[];
    return new Set(levels.map((level) => level ?? ''));
  }

  /* ---------- Subjects ---------- */

  async listSubjects(
    syllabus: string,
    level?: string,
    tx?: TxHandle,
  ): Promise<SyllabusSubjectRecord[]> {
    const filter: Record<string, unknown> = { syllabus: toObjectId(syllabus) };
    if (level !== undefined) filter.level = level;
    const docs = await SyllabusSubjectModel.find(filter, null, session(tx))
      .sort({ level: 1, position: 1, name: 1 })
      .lean<SyllabusSubjectDocument[]>();
    return docs.map(toSubject);
  }

  async listSubjectSummaries(syllabus: string): Promise<SubjectSummary[]> {
    const docs = await SyllabusSubjectModel.find({ syllabus: toObjectId(syllabus) }, SUMMARY_FIELDS)
      .sort({ level: 1, position: 1, name: 1 })
      .lean<Omit<SyllabusSubjectDocument, 'units'>[]>();
    return docs.map(toSummary);
  }

  async findSubject(id: string): Promise<SyllabusSubjectRecord | null> {
    if (!isObjectIdString(id)) return null;
    const doc = await SyllabusSubjectModel.findById(toObjectId(id)).lean<SyllabusSubjectDocument>();
    return doc ? toSubject(doc) : null;
  }

  async insertSubjects(
    syllabus: string,
    exam: string,
    subjects: (SubjectContent & { position: number })[],
    tx?: TxHandle,
  ): Promise<void> {
    if (!subjects.length) return;
    await SyllabusSubjectModel.insertMany(
      subjects.map((subject) => ({
        ...subject,
        syllabus: toObjectId(syllabus),
        exam,
        revision: 1,
        counts: countNodes(subject.units),
      })),
      session(tx),
    );
  }

  /**
   * Saves a subject only if nobody saved it since `revision`. Returns null when the subject is
   * gone or was changed in the meantime; the caller tells the two apart.
   */
  async saveSubject(
    id: string,
    revision: number,
    patch: { name?: string; color?: string; units?: UnitNode[] },
  ): Promise<SyllabusSubjectRecord | null> {
    if (!isObjectIdString(id)) return null;
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.color !== undefined) set.color = patch.color;
    if (patch.units !== undefined) {
      set.units = patch.units;
      set.counts = countNodes(patch.units);
    }
    const doc = await SyllabusSubjectModel.findOneAndUpdate(
      { _id: toObjectId(id), revision },
      { $set: set, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    ).lean<SyllabusSubjectDocument>();
    return doc ? toSubject(doc) : null;
  }

  async deleteSubject(id: string): Promise<boolean> {
    if (!isObjectIdString(id)) return false;
    return (await SyllabusSubjectModel.deleteOne({ _id: toObjectId(id) })).deletedCount === 1;
  }

  async deleteSubjectsAtLevels(syllabus: string, levels: string[], tx?: TxHandle): Promise<void> {
    await SyllabusSubjectModel.deleteMany(
      { syllabus: toObjectId(syllabus), level: { $in: levels } },
      session(tx),
    );
  }

  async setSubjectPositions(syllabus: string, level: string, subjectIds: string[]): Promise<void> {
    if (!subjectIds.length) return;
    await SyllabusSubjectModel.bulkWrite(
      subjectIds.map((subjectId, position) => ({
        updateOne: {
          filter: { syllabus: toObjectId(syllabus), level, subjectId },
          // Order isn't part of a subject save, so it doesn't bump the revision.
          update: { $set: { position } },
        },
      })),
    );
  }

  /** Replaces a subject's units (imports); bumps its revision so open editors notice. */
  async replaceUnits(id: string, units: UnitNode[], tx?: TxHandle): Promise<void> {
    await SyllabusSubjectModel.updateOne(
      { _id: toObjectId(id) },
      { $set: { units, counts: countNodes(units) }, $inc: { revision: 1 } },
      session(tx),
    );
  }

  /** Content totals of the given versions added together. */
  async sumCounts(versionIds: string[]): Promise<VersionCounts> {
    if (!versionIds.length) return emptyCounts();
    const [row] = await SyllabusVersionModel.aggregate<VersionCounts>([
      { $match: { _id: { $in: versionIds.map(toObjectId) } } },
      {
        $group: {
          _id: null,
          subjects: { $sum: '$counts.subjects' },
          units: { $sum: '$counts.units' },
          chapters: { $sum: '$counts.chapters' },
          topics: { $sum: '$counts.topics' },
          subtopics: { $sum: '$counts.subtopics' },
        },
      },
      { $project: { _id: 0 } },
    ]);
    return toCounts(row);
  }
}

export type SyllabusRepository = Pick<MongoSyllabusRepository, keyof MongoSyllabusRepository>;
