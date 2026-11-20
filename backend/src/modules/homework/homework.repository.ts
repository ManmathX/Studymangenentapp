import { skipFor, type PaginationQuery } from '../../common/http/page.js';
import type { TxHandle } from '../../database/transaction.js';
import { idOf, toObjectId } from '../../database/ids.js';
import type { PlannerHomework } from '../planner/planner.types.js';
import { HomeworkModel, type HomeworkDocument } from './homework.model.js';

export interface HomeworkRecord extends PlannerHomework {
  note: string;
  teacher: string;
  doneOn: string | null;
}

export type NewHomework = Omit<HomeworkRecord, 'id'>;

/** Open homework is capped so a planner run never loads an unbounded list. */
export const OPEN_HOMEWORK_LIMIT = 500;

export interface HomeworkRepository {
  create(userId: string, homework: NewHomework, tx?: TxHandle): Promise<HomeworkRecord>;
  insertMany(userId: string, homework: NewHomework[], tx: TxHandle): Promise<HomeworkRecord[]>;
  findById(userId: string, id: string): Promise<HomeworkRecord | null>;
  listOpen(userId: string): Promise<HomeworkRecord[]>;
  pageByStatus(userId: string, done: boolean, query: PaginationQuery): Promise<{ items: HomeworkRecord[]; total: number }>;
  findDueOn(userId: string, date: string): Promise<HomeworkRecord[]>;
  countDoneSince(userId: string, fromDate: string): Promise<number>;
  setDone(userId: string, id: string, done: boolean, doneOn: string | null, tx?: TxHandle): Promise<HomeworkRecord | null>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

function toRecord(doc: HomeworkDocument): HomeworkRecord {
  return {
    id: idOf(doc),
    subject: doc.subject,
    title: doc.title,
    note: doc.note,
    teacher: doc.teacher,
    due: doc.due,
    mins: doc.mins,
    difficulty: doc.difficulty,
    weight: doc.weight,
    done: doc.done,
    doneOn: doc.doneOn,
  };
}

export class MongoHomeworkRepository implements HomeworkRepository {
  async create(userId: string, homework: NewHomework, tx?: TxHandle): Promise<HomeworkRecord> {
    const [doc] = await HomeworkModel.create([{ ...homework, userId: toObjectId(userId) }], { session: tx });
    if (!doc) throw new Error('Homework insert returned no document');
    return toRecord(doc.toObject());
  }

  async insertMany(userId: string, homework: NewHomework[], tx: TxHandle): Promise<HomeworkRecord[]> {
    if (!homework.length) return [];
    const owner = toObjectId(userId);
    const docs = await HomeworkModel.insertMany(homework.map((item) => ({ ...item, userId: owner })), { session: tx });
    return docs.map((doc) => toRecord(doc.toObject()));
  }

  async findById(userId: string, id: string): Promise<HomeworkRecord | null> {
    const doc = await HomeworkModel.findOne({ _id: toObjectId(id), userId: toObjectId(userId) }).lean<HomeworkDocument>();
    return doc ? toRecord(doc) : null;
  }

  async listOpen(userId: string): Promise<HomeworkRecord[]> {
    const docs = await HomeworkModel.find({ userId: toObjectId(userId), done: false })
      .sort({ due: 1 })
      .limit(OPEN_HOMEWORK_LIMIT)
      .lean<HomeworkDocument[]>();
    return docs.map(toRecord);
  }

  async pageByStatus(userId: string, done: boolean, query: PaginationQuery): Promise<{ items: HomeworkRecord[]; total: number }> {
    const filter = { userId: toObjectId(userId), done };
    const sort: Record<string, 1 | -1> = done ? { doneOn: -1, _id: -1 } : { due: 1, _id: 1 };
    const [docs, total] = await Promise.all([
      HomeworkModel.find(filter).sort(sort).skip(skipFor(query)).limit(query.limit).lean<HomeworkDocument[]>(),
      HomeworkModel.countDocuments(filter),
    ]);
    return { items: docs.map(toRecord), total };
  }

  async findDueOn(userId: string, date: string): Promise<HomeworkRecord[]> {
    const docs = await HomeworkModel.find({ userId: toObjectId(userId), due: date }).limit(50).lean<HomeworkDocument[]>();
    return docs.map(toRecord);
  }

  async countDoneSince(userId: string, fromDate: string): Promise<number> {
    return HomeworkModel.countDocuments({ userId: toObjectId(userId), done: true, doneOn: { $gte: fromDate } });
  }

  async setDone(userId: string, id: string, done: boolean, doneOn: string | null, tx?: TxHandle): Promise<HomeworkRecord | null> {
    const doc = await HomeworkModel.findOneAndUpdate(
      { _id: toObjectId(id), userId: toObjectId(userId) },
      { $set: { done, doneOn } },
      { new: true, session: tx },
    ).lean<HomeworkDocument>();
    return doc ? toRecord(doc) : null;
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    await HomeworkModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
