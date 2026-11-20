import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_IDS, type SubjectId } from '../syllabus/syllabus.data.js';
import { CHAPTER_STATUSES, type ChapterStatus } from '../planner/planner.types.js';

export interface ChapterDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  subject: SubjectId;
  name: string;
  difficulty: number;
  status: ChapterStatus;
  learnedOn: string | null;
  revisions: number;
  snoozedUntil: string | null;
  position: number;
}

const chapterSchema = new Schema<ChapterDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    subject: { type: String, enum: SUBJECT_IDS, required: true },
    name: { type: String, required: true },
    difficulty: { type: Number, min: 1, max: 3, required: true },
    status: { type: String, enum: CHAPTER_STATUSES, default: 'not' },
    learnedOn: { type: String, default: null },
    revisions: { type: Number, default: 0, min: 0, max: 3 },
    snoozedUntil: { type: String, default: null },
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

chapterSchema.index({ userId: 1, key: 1 }, { unique: true });
chapterSchema.index({ userId: 1, subject: 1, position: 1 });

export const ChapterModel = model<ChapterDocument>('Chapter', chapterSchema);
