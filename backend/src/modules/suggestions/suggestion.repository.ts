import type { TxHandle } from '../../database/transaction.js';
import { idOf, toObjectId } from '../../database/ids.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import {
  SuggestionModel,
  type SuggestionDocument,
  type SuggestionKind,
  type SuggestionSource,
  type SuggestionState,
} from './suggestion.model.js';

export interface SuggestionRecord {
  id: string;
  from: SuggestionSource;
  who: string;
  role: string;
  subject: SubjectId;
  title: string;
  mins: number;
  date: string;
  kind: SuggestionKind;
  taskId: string | null;
  chapterKey: string | null;
  note: string;
  state: SuggestionState;
}

export type NewSuggestion = Omit<SuggestionRecord, 'id' | 'state'>;

export interface SuggestionRepository {
  listByStates(userId: string, states: SuggestionState[]): Promise<SuggestionRecord[]>;
  findById(userId: string, id: string): Promise<SuggestionRecord | null>;
  setState(
    userId: string,
    id: string,
    state: SuggestionState,
    tx?: TxHandle,
  ): Promise<SuggestionRecord | null>;
  /** Creates the suggestion only when none exists yet for the same task. */
  ensureMoveSuggestion(userId: string, suggestion: NewSuggestion): Promise<void>;
  insertMany(userId: string, suggestions: NewSuggestion[], tx: TxHandle): Promise<void>;
  acceptPendingForTask(userId: string, taskId: string, tx?: TxHandle): Promise<void>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

function toRecord(doc: SuggestionDocument): SuggestionRecord {
  return {
    id: idOf(doc),
    from: doc.from,
    who: doc.who,
    role: doc.role,
    subject: doc.subject,
    title: doc.title,
    mins: doc.mins,
    date: doc.date,
    kind: doc.kind,
    taskId: doc.taskId ? doc.taskId.toHexString() : null,
    chapterKey: doc.chapterKey,
    note: doc.note,
    state: doc.state,
  };
}

export class MongoSuggestionRepository implements SuggestionRepository {
  async listByStates(userId: string, states: SuggestionState[]): Promise<SuggestionRecord[]> {
    const docs = await SuggestionModel.find({ userId: toObjectId(userId), state: { $in: states } })
      .sort({ date: 1, _id: 1 })
      .limit(100)
      .lean<SuggestionDocument[]>();
    return docs.map(toRecord);
  }

  async findById(userId: string, id: string): Promise<SuggestionRecord | null> {
    const doc = await SuggestionModel.findOne({
      _id: toObjectId(id),
      userId: toObjectId(userId),
    }).lean<SuggestionDocument>();
    return doc ? toRecord(doc) : null;
  }

  async setState(
    userId: string,
    id: string,
    state: SuggestionState,
    tx?: TxHandle,
  ): Promise<SuggestionRecord | null> {
    const doc = await SuggestionModel.findOneAndUpdate(
      { _id: toObjectId(id), userId: toObjectId(userId) },
      { $set: { state } },
      { new: true, session: tx },
    ).lean<SuggestionDocument>();
    return doc ? toRecord(doc) : null;
  }

  async ensureMoveSuggestion(userId: string, suggestion: NewSuggestion): Promise<void> {
    if (!suggestion.taskId) throw new Error('A move suggestion needs a task id');
    await SuggestionModel.updateOne(
      { userId: toObjectId(userId), taskId: toObjectId(suggestion.taskId), kind: 'move' },
      { $setOnInsert: { ...suggestion, taskId: toObjectId(suggestion.taskId), state: 'pending' } },
      { upsert: true },
    );
  }

  async insertMany(userId: string, suggestions: NewSuggestion[], tx: TxHandle): Promise<void> {
    if (!suggestions.length) return;
    const owner = toObjectId(userId);
    await SuggestionModel.insertMany(
      suggestions.map((item) => ({
        ...item,
        userId: owner,
        taskId: item.taskId ? toObjectId(item.taskId) : null,
      })),
      { session: tx },
    );
  }

  async acceptPendingForTask(userId: string, taskId: string, tx?: TxHandle): Promise<void> {
    await SuggestionModel.updateMany(
      { userId: toObjectId(userId), taskId: toObjectId(taskId), state: 'pending' },
      { $set: { state: 'accepted' } },
      { session: tx },
    );
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    await SuggestionModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
