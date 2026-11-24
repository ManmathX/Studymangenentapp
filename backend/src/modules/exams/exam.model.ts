import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_ID_PATTERN, type SubjectId } from '../syllabus/syllabus.data.js';

export interface ExamDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  subject: SubjectId;
  name: string;
  date: string;
  weight: number;
  chapterKeys: string[];
}

const examSchema = new Schema<ExamDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, match: SUBJECT_ID_PATTERN, required: true },
    name: { type: String, required: true, maxlength: 80 },
    date: { type: String, required: true },
    weight: { type: Number, required: true, min: 1, max: 100 },
    chapterKeys: { type: [String], required: true },
  },
  { timestamps: true },
);

examSchema.index({ userId: 1, date: 1 });

export const ExamModel = model<ExamDocument>('Exam', examSchema);
