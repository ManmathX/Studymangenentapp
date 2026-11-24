import { model, Schema, type Types } from 'mongoose';
import { MAX_CHAPTERS_PER_SUBJECT, SUBJECT_ID_PATTERN } from './syllabus.data.js';

export const BOARD_KINDS = ['national', 'state'] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

/** An exam board students can pick at setup: CBSE, ICSE or a state board. */
export interface BoardDocument {
  _id: Types.ObjectId;
  code: string;
  name: string;
  kind: BoardKind;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

const boardSchema = new Schema<BoardDocument>(
  {
    code: { type: String, required: true, match: /^[a-z][a-z0-9-]{1,31}$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: BOARD_KINDS, required: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: true },
);

boardSchema.index({ code: 1 }, { unique: true });

export const BoardModel = model<BoardDocument>('Board', boardSchema);

export interface CatalogChapterDoc {
  name: string;
  difficulty: 1 | 2 | 3;
  /** The textbook the chapter is in, e.g. "Ganita Prakash – Part 1". Optional. */
  book?: string;
}

/**
 * One subject of one class on one board, with its chapters in book order. Students copy the
 * chapters into their own planner at setup, so later edits here only affect new students.
 */
export interface CatalogSubjectDocument {
  _id: Types.ObjectId;
  board: string;
  cls: number;
  subjectId: string;
  name: string;
  color: string;
  position: number;
  chapters: CatalogChapterDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const catalogSubjectSchema = new Schema<CatalogSubjectDocument>(
  {
    board: { type: String, required: true },
    cls: { type: Number, required: true, min: 6, max: 12 },
    subjectId: { type: String, required: true, match: SUBJECT_ID_PATTERN },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ },
    position: { type: Number, default: 0 },
    chapters: {
      type: [
        {
          _id: false,
          name: { type: String, required: true, trim: true, maxlength: 120 },
          difficulty: { type: Number, enum: [1, 2, 3], default: 2 },
          book: { type: String, trim: true, maxlength: 60 },
        },
      ],
      validate: {
        validator: (list: unknown[]) => list.length <= MAX_CHAPTERS_PER_SUBJECT,
        message: `A subject can have at most ${MAX_CHAPTERS_PER_SUBJECT} chapters`,
      },
      default: [],
    },
  },
  { timestamps: true },
);

catalogSubjectSchema.index({ board: 1, cls: 1, subjectId: 1 }, { unique: true });
catalogSubjectSchema.index({ board: 1, cls: 1, position: 1 });

export const CatalogSubjectModel = model<CatalogSubjectDocument>(
  'CatalogSubject',
  catalogSubjectSchema,
);
