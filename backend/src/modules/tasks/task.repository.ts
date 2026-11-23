import { Types } from 'mongoose';
import { skipFor, type PaginationQuery } from '../../common/http/page.js';
import type { TxHandle } from '../../database/transaction.js';
import { idOf, toObjectId } from '../../database/ids.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import type { TaskKind, TaskSource, TaskStatus } from '../planner/planner.types.js';
import { TaskModel, type TaskDocument } from './task.model.js';

export interface TaskRecord {
  id: string;
  date: string;
  subject: SubjectId;
  title: string;
  kind: TaskKind;
  mins: number;
  done: boolean;
  source: TaskSource;
  status: TaskStatus;
  score: number;
  order: number;
  deadline: string;
  why: string;
  chapterKey: string | null;
  homeworkId: string | null;
}

export type NewTask = Omit<
  TaskRecord,
  'id' | 'order' | 'done' | 'why' | 'chapterKey' | 'homeworkId'
> &
  Partial<Pick<TaskRecord, 'done' | 'why' | 'chapterKey' | 'homeworkId'>>;

export interface TaskPatch {
  date?: string;
  done?: boolean;
  status?: TaskStatus;
}

export interface TaskPageQuery extends PaginationQuery {
  from?: string;
  to?: string;
  status?: TaskStatus;
  sort: 'date' | '-date';
}

/** Upper bound for range queries; the API never asks for more than ~45 days. */
const RANGE_LIMIT = 2_000;

export interface TaskRepository {
  insertMany(userId: string, tasks: NewTask[], tx?: TxHandle): Promise<TaskRecord[]>;
  findById(userId: string, id: string): Promise<TaskRecord | null>;
  findInRange(userId: string, from: string, to: string): Promise<TaskRecord[]>;
  findLiveFrom(userId: string, from: string): Promise<TaskRecord[]>;
  findSlipped(userId: string, from: string, before: string): Promise<TaskRecord[]>;
  findLiveForChapter(userId: string, chapterKey: string, from: string): Promise<TaskRecord[]>;
  liveHomeworkIds(userId: string): Promise<Set<string>>;
  update(userId: string, id: string, patch: TaskPatch, tx?: TxHandle): Promise<TaskRecord | null>;
  acceptSuggestedFrom(userId: string, from: string): Promise<number>;
  skipSuggestedForHomework(
    userId: string,
    homeworkId: string,
    from: string,
    tx?: TxHandle,
  ): Promise<void>;
  page(userId: string, query: TaskPageQuery): Promise<{ items: TaskRecord[]; total: number }>;
  doneMinutesByDay(userId: string, from: string, to: string): Promise<Map<string, number>>;
  /**
   * For deleted homework: removes its unfinished tasks and detaches finished ones,
   * so study time already logged stays in the history.
   */
  releaseHomework(userId: string, homeworkId: string, tx: TxHandle): Promise<void>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

function toRecord(doc: TaskDocument): TaskRecord {
  return {
    id: idOf(doc),
    date: doc.date,
    subject: doc.subject,
    title: doc.title,
    kind: doc.kind,
    mins: doc.mins,
    done: doc.done,
    source: doc.source,
    status: doc.status,
    score: doc.score,
    order: doc.order,
    deadline: doc.deadline,
    why: doc.why,
    chapterKey: doc.chapterKey,
    homeworkId: doc.homeworkId ? doc.homeworkId.toHexString() : null,
  };
}

const FIELDS = {
  date: 1,
  subject: 1,
  title: 1,
  kind: 1,
  mins: 1,
  done: 1,
  source: 1,
  status: 1,
  score: 1,
  order: 1,
  deadline: 1,
  why: 1,
  chapterKey: 1,
  homeworkId: 1,
} as const;

export class MongoTaskRepository implements TaskRepository {
  private orderSeed = 0;

  /** Monotonic order so tasks keep the sequence in which they were added. */
  private nextOrder(): number {
    this.orderSeed = Math.max(this.orderSeed + 1, Date.now() * 100);
    return this.orderSeed;
  }

  async insertMany(userId: string, tasks: NewTask[], tx?: TxHandle): Promise<TaskRecord[]> {
    if (!tasks.length) return [];
    const owner = toObjectId(userId);
    const docs = await TaskModel.insertMany(
      tasks.map((task) => ({
        ...task,
        userId: owner,
        order: this.nextOrder(),
        homeworkId: task.homeworkId ? toObjectId(task.homeworkId) : null,
      })),
      { session: tx },
    );
    return docs.map((doc) => toRecord(doc.toObject()));
  }

  async findById(userId: string, id: string): Promise<TaskRecord | null> {
    const doc = await TaskModel.findOne(
      { _id: toObjectId(id), userId: toObjectId(userId) },
      FIELDS,
    ).lean<TaskDocument>();
    return doc ? toRecord(doc) : null;
  }

  async findInRange(userId: string, from: string, to: string): Promise<TaskRecord[]> {
    const docs = await TaskModel.find(
      { userId: toObjectId(userId), date: { $gte: from, $lte: to } },
      FIELDS,
    )
      .sort({ date: 1, order: 1 })
      .limit(RANGE_LIMIT)
      .lean<TaskDocument[]>();
    return docs.map(toRecord);
  }

  async findLiveFrom(userId: string, from: string): Promise<TaskRecord[]> {
    const docs = await TaskModel.find(
      { userId: toObjectId(userId), date: { $gte: from }, status: { $ne: 'skipped' } },
      FIELDS,
    )
      .sort({ date: 1, order: 1 })
      .limit(RANGE_LIMIT)
      .lean<TaskDocument[]>();
    return docs.map(toRecord);
  }

  async findSlipped(userId: string, from: string, before: string): Promise<TaskRecord[]> {
    const docs = await TaskModel.find(
      {
        userId: toObjectId(userId),
        status: 'accepted',
        done: false,
        date: { $gte: from, $lt: before },
      },
      FIELDS,
    )
      .sort({ date: 1, order: 1 })
      .limit(100)
      .lean<TaskDocument[]>();
    return docs.map(toRecord);
  }

  async findLiveForChapter(
    userId: string,
    chapterKey: string,
    from: string,
  ): Promise<TaskRecord[]> {
    const docs = await TaskModel.find(
      {
        userId: toObjectId(userId),
        chapterKey,
        date: { $gte: from },
        status: { $ne: 'skipped' },
        done: false,
      },
      FIELDS,
    )
      .sort({ date: 1 })
      .limit(50)
      .lean<TaskDocument[]>();
    return docs.map(toRecord);
  }

  async liveHomeworkIds(userId: string): Promise<Set<string>> {
    const ids = await TaskModel.distinct('homeworkId', {
      userId: toObjectId(userId),
      homeworkId: { $ne: null },
      status: { $ne: 'skipped' },
    });
    return new Set(
      ids
        .filter((id): id is Types.ObjectId => id instanceof Types.ObjectId)
        .map((id) => id.toHexString()),
    );
  }

  async update(
    userId: string,
    id: string,
    patch: TaskPatch,
    tx?: TxHandle,
  ): Promise<TaskRecord | null> {
    const doc = await TaskModel.findOneAndUpdate(
      { _id: toObjectId(id), userId: toObjectId(userId) },
      { $set: patch },
      { new: true, projection: FIELDS, runValidators: true, session: tx },
    ).lean<TaskDocument>();
    return doc ? toRecord(doc) : null;
  }

  async acceptSuggestedFrom(userId: string, from: string): Promise<number> {
    const result = await TaskModel.updateMany(
      { userId: toObjectId(userId), status: 'suggested', date: { $gte: from } },
      { $set: { status: 'accepted' } },
    );
    return result.modifiedCount;
  }

  async skipSuggestedForHomework(
    userId: string,
    homeworkId: string,
    from: string,
    tx?: TxHandle,
  ): Promise<void> {
    await TaskModel.updateMany(
      {
        userId: toObjectId(userId),
        homeworkId: toObjectId(homeworkId),
        status: 'suggested',
        done: false,
        date: { $gte: from },
      },
      { $set: { status: 'skipped' } },
      { session: tx },
    );
  }

  async page(
    userId: string,
    query: TaskPageQuery,
  ): Promise<{ items: TaskRecord[]; total: number }> {
    const filter: Record<string, unknown> = { userId: toObjectId(userId) };
    if (query.from || query.to) {
      filter.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.status) filter.status = query.status;
    const direction = query.sort === '-date' ? -1 : 1;
    const [docs, total] = await Promise.all([
      TaskModel.find(filter, FIELDS)
        .sort({ date: direction, order: direction })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean<TaskDocument[]>(),
      TaskModel.countDocuments(filter),
    ]);
    return { items: docs.map(toRecord), total };
  }

  async doneMinutesByDay(userId: string, from: string, to: string): Promise<Map<string, number>> {
    const rows = await TaskModel.aggregate<{ _id: string; mins: number }>([
      {
        $match: {
          userId: toObjectId(userId),
          done: true,
          status: { $ne: 'skipped' },
          date: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: '$date', mins: { $sum: '$mins' } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.mins]));
  }

  async releaseHomework(userId: string, homeworkId: string, tx: TxHandle): Promise<void> {
    const filter = { userId: toObjectId(userId), homeworkId: toObjectId(homeworkId) };
    // Operations inside one transaction must run one after another.
    await TaskModel.deleteMany({ ...filter, done: false }, { session: tx });
    await TaskModel.updateMany(
      { ...filter, done: true },
      { $set: { homeworkId: null } },
      { session: tx },
    );
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    await TaskModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
