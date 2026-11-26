import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_ID_PATTERN, type SubjectId } from '../syllabus/syllabus.data.js';

/** What a test is on the datesheet: unit or periodic test, half-yearly, final, or anything else. */
export const EXAM_KINDS = ['unit', 'periodic', 'halfYearly', 'final', 'other'] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

export interface ExamDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  subject: SubjectId;
  name: string;
  date: string;
  weight: number;
  chapterKeys: string[];
  /** The exam this paper belongs to on the datesheet, e.g. "Half-yearly". Null for a stand-alone test. */
  series?: string | null;
  kind?: ExamKind | null;
}

const examSchema = new Schema<ExamDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, match: SUBJECT_ID_PATTERN, required: true },
    name: { type: String, required: true, maxlength: 80 },
    date: { type: String, required: true },
    weight: { type: Number, required: true, min: 1, max: 100 },
    chapterKeys: { type: [String], required: true },
    series: { type: String, maxlength: 60, default: null },
    kind: { type: String, enum: [...EXAM_KINDS, null], default: null },
  },
  { timestamps: true },
);

examSchema.index({ userId: 1, date: 1 });

export const ExamModel = model<ExamDocument>('Exam', examSchema);
