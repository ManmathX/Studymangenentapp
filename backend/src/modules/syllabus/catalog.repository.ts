import { idOf, isObjectIdString, toObjectId } from '../../database/ids.js';
import {
  BoardModel,
  CatalogSubjectModel,
  type BoardDocument,
  type BoardKind,
  type CatalogChapterDoc,
  type CatalogSubjectDocument,
} from './catalog.model.js';

export interface BoardRecord {
  code: string;
  name: string;
  kind: BoardKind;
  position: number;
}

export interface CatalogSubjectRecord {
  id: string;
  board: string;
  cls: number;
  subjectId: string;
  name: string;
  color: string;
  position: number;
  chapters: CatalogChapterDoc[];
}

export type NewCatalogSubject = Omit<CatalogSubjectRecord, 'id'>;
export type CatalogSubjectPatch = Partial<
  Pick<CatalogSubjectRecord, 'name' | 'color' | 'position' | 'chapters'>
>;

export interface CatalogRepository {
  countBoards(): Promise<number>;
  listBoards(): Promise<BoardRecord[]>;
  findBoard(code: string): Promise<BoardRecord | null>;
  createBoard(board: BoardRecord): Promise<BoardRecord>;
  updateBoard(code: string, patch: Partial<Omit<BoardRecord, 'code'>>): Promise<BoardRecord | null>;
  /** Removes the board and every subject filed under it. */
  deleteBoard(code: string): Promise<boolean>;
  listSubjects(board: string, cls?: number): Promise<CatalogSubjectRecord[]>;
  findSubject(id: string): Promise<CatalogSubjectRecord | null>;
  createSubject(subject: NewCatalogSubject): Promise<CatalogSubjectRecord>;
  updateSubject(id: string, patch: CatalogSubjectPatch): Promise<CatalogSubjectRecord | null>;
  deleteSubject(id: string): Promise<boolean>;
  setPositions(board: string, cls: number, subjectIds: string[]): Promise<void>;
  /** Number of subjects per board and class. */
  subjectCounts(): Promise<{ board: string; cls: number; count: number }[]>;
  /** Inserts boards and subjects that don't exist yet; never overwrites admin edits. */
  insertMissing(boards: BoardRecord[], subjects: NewCatalogSubject[]): Promise<void>;
}

function toBoard(doc: BoardDocument): BoardRecord {
  return { code: doc.code, name: doc.name, kind: doc.kind, position: doc.position };
}

function toSubject(doc: CatalogSubjectDocument): CatalogSubjectRecord {
  return {
    id: idOf(doc),
    board: doc.board,
    cls: doc.cls,
    subjectId: doc.subjectId,
    name: doc.name,
    color: doc.color,
    position: doc.position,
    chapters: doc.chapters.map(({ name, difficulty }) => ({ name, difficulty })),
  };
}

const isDuplicateKey = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

export class MongoCatalogRepository implements CatalogRepository {
  countBoards(): Promise<number> {
    return BoardModel.countDocuments();
  }

  async listBoards(): Promise<BoardRecord[]> {
    const docs = await BoardModel.find().sort({ position: 1, name: 1 }).lean<BoardDocument[]>();
    return docs.map(toBoard);
  }

  async findBoard(code: string): Promise<BoardRecord | null> {
    const doc = await BoardModel.findOne({ code }).lean<BoardDocument>();
    return doc ? toBoard(doc) : null;
  }

  async createBoard(board: BoardRecord): Promise<BoardRecord> {
    const doc = await BoardModel.create(board);
    return toBoard(doc.toObject());
  }

  async updateBoard(
    code: string,
    patch: Partial<Omit<BoardRecord, 'code'>>,
  ): Promise<BoardRecord | null> {
    const doc = await BoardModel.findOneAndUpdate(
      { code },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean<BoardDocument>();
    return doc ? toBoard(doc) : null;
  }

  async deleteBoard(code: string): Promise<boolean> {
    const result = await BoardModel.deleteOne({ code });
    await CatalogSubjectModel.deleteMany({ board: code });
    return result.deletedCount === 1;
  }

  async listSubjects(board: string, cls?: number): Promise<CatalogSubjectRecord[]> {
    const filter: Record<string, unknown> = { board };
    if (cls !== undefined) filter.cls = cls;
    const docs = await CatalogSubjectModel.find(filter)
      .sort({ cls: 1, position: 1, name: 1 })
      .lean<CatalogSubjectDocument[]>();
    return docs.map(toSubject);
  }

  async findSubject(id: string): Promise<CatalogSubjectRecord | null> {
    if (!isObjectIdString(id)) return null;
    const doc = await CatalogSubjectModel.findById(toObjectId(id)).lean<CatalogSubjectDocument>();
    return doc ? toSubject(doc) : null;
  }

  async createSubject(subject: NewCatalogSubject): Promise<CatalogSubjectRecord> {
    const doc = await CatalogSubjectModel.create(subject);
    return toSubject(doc.toObject());
  }

  async updateSubject(
    id: string,
    patch: CatalogSubjectPatch,
  ): Promise<CatalogSubjectRecord | null> {
    if (!isObjectIdString(id)) return null;
    const doc = await CatalogSubjectModel.findByIdAndUpdate(
      toObjectId(id),
      { $set: patch },
      { new: true, runValidators: true },
    ).lean<CatalogSubjectDocument>();
    return doc ? toSubject(doc) : null;
  }

  async deleteSubject(id: string): Promise<boolean> {
    if (!isObjectIdString(id)) return false;
    const result = await CatalogSubjectModel.deleteOne({ _id: toObjectId(id) });
    return result.deletedCount === 1;
  }

  async setPositions(board: string, cls: number, subjectIds: string[]): Promise<void> {
    if (!subjectIds.length) return;
    await CatalogSubjectModel.bulkWrite(
      subjectIds.map((subjectId, position) => ({
        updateOne: { filter: { board, cls, subjectId }, update: { $set: { position } } },
      })),
    );
  }

  async subjectCounts(): Promise<{ board: string; cls: number; count: number }[]> {
    const rows = await CatalogSubjectModel.aggregate<{
      _id: { board: string; cls: number };
      count: number;
    }>([{ $group: { _id: { board: '$board', cls: '$cls' }, count: { $sum: 1 } } }]);
    return rows.map((row) => ({ board: row._id.board, cls: row._id.cls, count: row.count }));
  }

  async insertMissing(boards: BoardRecord[], subjects: NewCatalogSubject[]): Promise<void> {
    try {
      if (boards.length) {
        await BoardModel.bulkWrite(
          boards.map((board) => ({
            updateOne: {
              filter: { code: board.code },
              update: { $setOnInsert: board },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      }
      if (subjects.length) {
        await CatalogSubjectModel.bulkWrite(
          subjects.map((subject) => ({
            updateOne: {
              filter: { board: subject.board, cls: subject.cls, subjectId: subject.subjectId },
              update: { $setOnInsert: subject },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      }
    } catch (error) {
      // Two first requests racing to seed: the other one already inserted these rows.
      if (!isDuplicateKey(error)) throw error;
    }
  }
}
