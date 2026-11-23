import type { TxHandle } from '../../database/transaction.js';
import { toObjectId } from '../../database/ids.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import type { ChapterStatus, PlannerChapter } from '../planner/planner.types.js';
import { ChapterModel, type ChapterDocument } from './chapter.model.js';

export type ChapterRecord = PlannerChapter;

export interface NewChapter extends ChapterRecord {
  position: number;
}

export interface ChapterPatch {
  status?: ChapterStatus;
  learnedOn?: string | null;
  revisions?: number;
  snoozedUntil?: string | null;
}

export interface ChapterRepository {
  insertMany(userId: string, chapters: NewChapter[], tx: TxHandle): Promise<void>;
  list(
    userId: string,
    filter?: { subject?: SubjectId; status?: ChapterStatus },
  ): Promise<ChapterRecord[]>;
  findByKey(userId: string, key: string): Promise<ChapterRecord | null>;
  findByKeys(userId: string, keys: string[]): Promise<ChapterRecord[]>;
  update(
    userId: string,
    key: string,
    patch: ChapterPatch,
    tx?: TxHandle,
  ): Promise<ChapterRecord | null>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

const FIELDS = {
  key: 1,
  subject: 1,
  name: 1,
  difficulty: 1,
  status: 1,
  learnedOn: 1,
  revisions: 1,
  snoozedUntil: 1,
} as const;

function toRecord(doc: Pick<ChapterDocument, keyof typeof FIELDS>): ChapterRecord {
  return {
    key: doc.key,
    subject: doc.subject,
    name: doc.name,
    difficulty: doc.difficulty,
    status: doc.status,
    learnedOn: doc.learnedOn,
    revisions: doc.revisions,
    snoozedUntil: doc.snoozedUntil,
  };
}

export class MongoChapterRepository implements ChapterRepository {
  async insertMany(userId: string, chapters: NewChapter[], tx: TxHandle): Promise<void> {
    const owner = toObjectId(userId);
    await ChapterModel.insertMany(
      chapters.map((chapter) => ({ ...chapter, userId: owner })),
      { session: tx },
    );
  }

  async list(
    userId: string,
    filter: { subject?: SubjectId; status?: ChapterStatus } = {},
  ): Promise<ChapterRecord[]> {
    const query: Record<string, unknown> = { userId: toObjectId(userId) };
    if (filter.subject) query.subject = filter.subject;
    if (filter.status) query.status = filter.status;
    const docs = await ChapterModel.find(query, FIELDS)
      .sort({ subject: 1, position: 1 })
      .lean<ChapterDocument[]>();
    return docs.map(toRecord);
  }

  async findByKey(userId: string, key: string): Promise<ChapterRecord | null> {
    const doc = await ChapterModel.findOne(
      { userId: toObjectId(userId), key },
      FIELDS,
    ).lean<ChapterDocument>();
    return doc ? toRecord(doc) : null;
  }

  async findByKeys(userId: string, keys: string[]): Promise<ChapterRecord[]> {
    if (!keys.length) return [];
    const docs = await ChapterModel.find(
      { userId: toObjectId(userId), key: { $in: keys } },
      FIELDS,
    ).lean<ChapterDocument[]>();
    return docs.map(toRecord);
  }

  async update(
    userId: string,
    key: string,
    patch: ChapterPatch,
    tx?: TxHandle,
  ): Promise<ChapterRecord | null> {
    const doc = await ChapterModel.findOneAndUpdate(
      { userId: toObjectId(userId), key },
      { $set: patch },
      { new: true, projection: FIELDS, runValidators: true, session: tx },
    ).lean<ChapterDocument>();
    return doc ? toRecord(doc) : null;
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    await ChapterModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
