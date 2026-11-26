import type { TxHandle } from '../../database/transaction.js';
import {
  DEFAULT_STRUCTURE,
  type CategoryRecord,
  type ExamRecord,
  type ExamStructure,
  type LogoInfo,
} from './catalog.types.js';
import {
  ExamCategoryModel,
  ExamLogoModel,
  ExamModel,
  type ExamCategoryDocument,
  type ExamDocument,
  type ExamLogoDocument,
} from './exam.model.js';

export type NewExam = Omit<ExamRecord, 'createdAt' | 'updatedAt'>;
export type ExamPatch = Partial<Omit<ExamRecord, 'code' | 'createdAt' | 'updatedAt' | 'logo'>>;

export interface ExamFilter {
  category?: string;
  categories?: string[];
  isActive?: boolean;
  codes?: string[];
  /** Matches name, short name, code or description, ignoring case. */
  search?: RegExp;
}

function toCategory(doc: ExamCategoryDocument): CategoryRecord {
  return {
    code: doc.code,
    name: doc.name,
    description: doc.description ?? '',
    group: doc.group,
    position: doc.position ?? 0,
    isActive: doc.isActive !== false,
  };
}

function toStructure(raw: Partial<ExamStructure> | undefined): ExamStructure {
  return {
    ...DEFAULT_STRUCTURE,
    ...raw,
    levels: (raw?.levels ?? []).map((level) => ({
      key: level.key,
      name: level.name,
      ...(level.grade ? { grade: level.grade } : {}),
    })),
  };
}

export function toExam(doc: ExamDocument): ExamRecord {
  return {
    code: doc.code,
    name: doc.name,
    shortName: doc.shortName || doc.name,
    category: doc.category,
    description: doc.description ?? '',
    color: doc.color,
    logo: doc.logo?.sha
      ? { sha: doc.logo.sha, contentType: doc.logo.contentType, size: doc.logo.size }
      : null,
    conductingBody: doc.conductingBody ?? '',
    region: doc.region ?? 'national',
    state: doc.state ?? '',
    eligibility: doc.eligibility ?? '',
    targetGrades: doc.targetGrades ?? [],
    structure: toStructure(doc.structure),
    languages: doc.languages ?? [],
    isActive: doc.isActive !== false,
    position: doc.position ?? 0,
    settings: doc.settings ?? {},
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function examQuery(filter: ExamFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filter.category) query.category = filter.category;
  if (filter.categories) query.category = { $in: filter.categories };
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.codes) query.code = { $in: filter.codes };
  if (filter.search)
    query.$or = ['name', 'shortName', 'code', 'description'].map((field) => ({
      [field]: filter.search,
    }));
  return query;
}

const session = (tx?: TxHandle) => (tx ? { session: tx } : {});

/** Categories, exams and exam logos. */
export class MongoExamRepository {
  /* ---------- Categories ---------- */

  async listCategories(): Promise<CategoryRecord[]> {
    const docs = await ExamCategoryModel.find()
      .sort({ position: 1, name: 1 })
      .lean<ExamCategoryDocument[]>();
    return docs.map(toCategory);
  }

  async findCategory(code: string): Promise<CategoryRecord | null> {
    const doc = await ExamCategoryModel.findOne({ code }).lean<ExamCategoryDocument>();
    return doc ? toCategory(doc) : null;
  }

  async createCategory(category: CategoryRecord): Promise<CategoryRecord> {
    const doc = await ExamCategoryModel.create(category);
    return toCategory(doc.toObject());
  }

  async updateCategory(
    code: string,
    patch: Partial<Omit<CategoryRecord, 'code'>>,
  ): Promise<CategoryRecord | null> {
    const doc = await ExamCategoryModel.findOneAndUpdate(
      { code },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean<ExamCategoryDocument>();
    return doc ? toCategory(doc) : null;
  }

  async deleteCategory(code: string): Promise<boolean> {
    return (await ExamCategoryModel.deleteOne({ code })).deletedCount === 1;
  }

  async setCategoryPositions(codes: string[]): Promise<void> {
    if (!codes.length) return;
    await ExamCategoryModel.bulkWrite(
      codes.map((code, position) => ({
        updateOne: { filter: { code }, update: { $set: { position } } },
      })),
    );
  }

  /** Inserts categories whose code doesn't exist yet. */
  async insertMissingCategories(categories: CategoryRecord[], tx?: TxHandle): Promise<void> {
    if (!categories.length) return;
    await ExamCategoryModel.bulkWrite(
      categories.map((category) => ({
        updateOne: {
          filter: { code: category.code },
          update: { $setOnInsert: category },
          upsert: true,
        },
      })),
      { ordered: false, ...session(tx) },
    );
  }

  /** Number of exams in each category. */
  async examCountsByCategory(activeOnly = false): Promise<Map<string, number>> {
    const rows = await ExamModel.aggregate<{ _id: string; count: number }>([
      ...(activeOnly ? [{ $match: { isActive: true } }] : []),
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.count]));
  }

  /* ---------- Exams ---------- */

  countExams(tx?: TxHandle): Promise<number> {
    return ExamModel.countDocuments({}, session(tx));
  }

  /** Exams matching the filter, in display order. Exam lists are small (hundreds at most). */
  async listExams(filter: ExamFilter = {}): Promise<ExamRecord[]> {
    const docs = await ExamModel.find(examQuery(filter))
      .sort({ position: 1, name: 1 })
      .lean<ExamDocument[]>();
    return docs.map(toExam);
  }

  async findExam(code: string): Promise<ExamRecord | null> {
    const doc = await ExamModel.findOne({ code }).lean<ExamDocument>();
    return doc ? toExam(doc) : null;
  }

  async createExam(exam: NewExam, tx?: TxHandle): Promise<ExamRecord> {
    const [doc] = await ExamModel.create([exam], session(tx));
    return toExam(doc!.toObject());
  }

  /** Inserts exams whose code doesn't exist yet; returns the codes it inserted. */
  async insertMissingExams(exams: NewExam[], tx?: TxHandle): Promise<string[]> {
    if (!exams.length) return [];
    const existing = await ExamModel.find(
      { code: { $in: exams.map((exam) => exam.code) } },
      { code: 1 },
      session(tx),
    ).lean<{ code: string }[]>();
    const have = new Set(existing.map((doc) => doc.code));
    const fresh = exams.filter((exam) => !have.has(exam.code));
    if (fresh.length) await ExamModel.insertMany(fresh, session(tx));
    return fresh.map((exam) => exam.code);
  }

  async updateExam(code: string, patch: ExamPatch): Promise<ExamRecord | null> {
    const doc = await ExamModel.findOneAndUpdate(
      { code },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean<ExamDocument>();
    return doc ? toExam(doc) : null;
  }

  async deleteExam(code: string, tx?: TxHandle): Promise<boolean> {
    await ExamLogoModel.deleteOne({ exam: code }, session(tx));
    return (await ExamModel.deleteOne({ code }, session(tx))).deletedCount === 1;
  }

  async setExamPositions(codes: string[]): Promise<void> {
    if (!codes.length) return;
    await ExamModel.bulkWrite(
      codes.map((code, position) => ({
        updateOne: { filter: { code }, update: { $set: { position } } },
      })),
    );
  }

  async maxExamPosition(category: string): Promise<number> {
    const doc = await ExamModel.findOne({ category }, { position: 1 })
      .sort({ position: -1 })
      .lean<{ position?: number }>();
    return doc?.position ?? -1;
  }

  /* ---------- Logos ---------- */

  async saveLogo(code: string, logo: LogoInfo & { data: Buffer }): Promise<ExamRecord | null> {
    await ExamLogoModel.updateOne(
      { exam: code },
      { $set: { ...logo, exam: code } },
      { upsert: true },
    );
    const { data: _data, ...info } = logo;
    const doc = await ExamModel.findOneAndUpdate(
      { code },
      { $set: { logo: info } },
      { new: true },
    ).lean<ExamDocument>();
    return doc ? toExam(doc) : null;
  }

  async removeLogo(code: string): Promise<ExamRecord | null> {
    await ExamLogoModel.deleteOne({ exam: code });
    const doc = await ExamModel.findOneAndUpdate(
      { code },
      { $set: { logo: null } },
      { new: true },
    ).lean<ExamDocument>();
    return doc ? toExam(doc) : null;
  }

  async findLogo(code: string): Promise<ExamLogoDocument | null> {
    const doc = await ExamLogoModel.findOne({ exam: code }).lean<ExamLogoDocument>();
    if (!doc) return null;
    // Lean reads give BSON Binary rather than a Buffer.
    const raw = doc.data as unknown as Buffer | { buffer: Uint8Array };
    return { ...doc, data: Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer) };
  }
}

export type ExamRepository = Pick<MongoExamRepository, keyof MongoExamRepository>;
