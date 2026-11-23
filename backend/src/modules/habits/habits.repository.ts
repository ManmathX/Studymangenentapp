import type { TxHandle } from '../../database/transaction.js';
import { idOf, toObjectId } from '../../database/ids.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import {
  DailyLogModel,
  type CheckIn,
  type DailyLogDocument,
  type Routines,
} from './daily-log.model.js';
import { FocusSessionModel, type FocusSessionDocument } from './focus-session.model.js';

export interface FocusSessionRecord {
  id: string;
  date: string;
  subject: SubjectId;
  mins: number;
}

export interface DailyLogRecord {
  date: string;
  rest: boolean;
  checkin: CheckIn | null;
  routines: Routines | null;
  bag: Record<string, boolean>;
}

export interface DailyLogPatch {
  rest?: boolean;
  checkin?: CheckIn;
  routines?: Routines;
  /** Individual bag items to set, keyed by item id. */
  bag?: Record<string, boolean>;
}

export interface HabitsRepository {
  addFocusSession(
    userId: string,
    session: Omit<FocusSessionRecord, 'id'>,
  ): Promise<FocusSessionRecord>;
  insertFocusSessions(
    userId: string,
    sessions: Omit<FocusSessionRecord, 'id'>[],
    tx: TxHandle,
  ): Promise<void>;
  focusSessionsOn(userId: string, date: string): Promise<FocusSessionRecord[]>;
  focusMinutesByDay(userId: string, from: string, to: string): Promise<Map<string, number>>;
  findLog(userId: string, date: string): Promise<DailyLogRecord | null>;
  findLogs(userId: string, from: string, to: string): Promise<DailyLogRecord[]>;
  upsertLog(
    userId: string,
    date: string,
    patch: DailyLogPatch,
    tx?: TxHandle,
  ): Promise<DailyLogRecord>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

function toLog(doc: DailyLogDocument): DailyLogRecord {
  const bag =
    doc.bag instanceof Map
      ? Object.fromEntries(doc.bag)
      : { ...(doc.bag as Record<string, boolean>) };
  return {
    date: doc.date,
    rest: doc.rest,
    checkin: doc.checkin ?? null,
    routines: doc.routines ?? null,
    bag,
  };
}

function toSession(doc: FocusSessionDocument): FocusSessionRecord {
  return { id: idOf(doc), date: doc.date, subject: doc.subject, mins: doc.mins };
}

export class MongoHabitsRepository implements HabitsRepository {
  async addFocusSession(
    userId: string,
    session: Omit<FocusSessionRecord, 'id'>,
  ): Promise<FocusSessionRecord> {
    const doc = await FocusSessionModel.create({ ...session, userId: toObjectId(userId) });
    return toSession(doc.toObject());
  }

  async insertFocusSessions(
    userId: string,
    sessions: Omit<FocusSessionRecord, 'id'>[],
    tx: TxHandle,
  ): Promise<void> {
    if (!sessions.length) return;
    const owner = toObjectId(userId);
    await FocusSessionModel.insertMany(
      sessions.map((session) => ({ ...session, userId: owner })),
      { session: tx },
    );
  }

  async focusSessionsOn(userId: string, date: string): Promise<FocusSessionRecord[]> {
    const docs = await FocusSessionModel.find({ userId: toObjectId(userId), date })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean<FocusSessionDocument[]>();
    return docs.map(toSession);
  }

  async focusMinutesByDay(userId: string, from: string, to: string): Promise<Map<string, number>> {
    const rows = await FocusSessionModel.aggregate<{ _id: string; mins: number }>([
      { $match: { userId: toObjectId(userId), date: { $gte: from, $lte: to } } },
      { $group: { _id: '$date', mins: { $sum: '$mins' } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.mins]));
  }

  async findLog(userId: string, date: string): Promise<DailyLogRecord | null> {
    const doc = await DailyLogModel.findOne({
      userId: toObjectId(userId),
      date,
    }).lean<DailyLogDocument>();
    return doc ? toLog(doc) : null;
  }

  async findLogs(userId: string, from: string, to: string): Promise<DailyLogRecord[]> {
    const docs = await DailyLogModel.find({
      userId: toObjectId(userId),
      date: { $gte: from, $lte: to },
    })
      .limit(400)
      .lean<DailyLogDocument[]>();
    return docs.map(toLog);
  }

  async upsertLog(
    userId: string,
    date: string,
    patch: DailyLogPatch,
    tx?: TxHandle,
  ): Promise<DailyLogRecord> {
    const set: Record<string, unknown> = {};
    if (patch.rest !== undefined) set.rest = patch.rest;
    if (patch.checkin) set.checkin = patch.checkin;
    if (patch.routines) set.routines = patch.routines;
    for (const [itemId, checked] of Object.entries(patch.bag ?? {})) set[`bag.${itemId}`] = checked;
    const doc = await DailyLogModel.findOneAndUpdate(
      { userId: toObjectId(userId), date },
      { $set: set, $setOnInsert: { userId: toObjectId(userId), date } },
      { new: true, upsert: true, runValidators: true, session: tx },
    ).lean<DailyLogDocument>();
    if (!doc) throw new Error('Daily log upsert returned no document');
    return toLog(doc);
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    // Operations inside one transaction must run one after another.
    await DailyLogModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
    await FocusSessionModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
