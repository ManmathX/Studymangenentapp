import type { TxHandle } from '../../database/transaction.js';
import { idOf, toObjectId } from '../../database/ids.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import type { PlannerExam } from '../planner/planner.types.js';
import { ExamModel, type ExamDocument } from './exam.model.js';

export interface ExamRecord extends PlannerExam {
  subject: SubjectId;
}

export type NewExam = Omit<ExamRecord, 'id'>;

export interface ExamRepository {
  create(userId: string, exam: NewExam, tx?: TxHandle): Promise<ExamRecord>;
  insertMany(userId: string, exams: NewExam[], tx: TxHandle): Promise<ExamRecord[]>;
  list(userId: string, fromDate?: string): Promise<ExamRecord[]>;
  delete(userId: string, id: string): Promise<boolean>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

function toRecord(doc: ExamDocument): ExamRecord {
  return {
    id: idOf(doc),
    subject: doc.subject,
    name: doc.name,
    date: doc.date,
    weight: doc.weight,
    chapterKeys: doc.chapterKeys,
  };
}

export class MongoExamRepository implements ExamRepository {
  async create(userId: string, exam: NewExam, tx?: TxHandle): Promise<ExamRecord> {
    const [doc] = await ExamModel.create([{ ...exam, userId: toObjectId(userId) }], {
      session: tx,
    });
    if (!doc) throw new Error('Exam insert returned no document');
    return toRecord(doc.toObject());
  }

  async insertMany(userId: string, exams: NewExam[], tx: TxHandle): Promise<ExamRecord[]> {
    if (!exams.length) return [];
    const owner = toObjectId(userId);
    const docs = await ExamModel.insertMany(
      exams.map((exam) => ({ ...exam, userId: owner })),
      { session: tx },
    );
    return docs.map((doc) => toRecord(doc.toObject()));
  }

  async list(userId: string, fromDate?: string): Promise<ExamRecord[]> {
    const filter: Record<string, unknown> = { userId: toObjectId(userId) };
    if (fromDate) filter.date = { $gte: fromDate };
    const docs = await ExamModel.find(filter).sort({ date: 1 }).limit(200).lean<ExamDocument[]>();
    return docs.map(toRecord);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await ExamModel.deleteOne({ _id: toObjectId(id), userId: toObjectId(userId) });
    return result.deletedCount === 1;
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    await ExamModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
