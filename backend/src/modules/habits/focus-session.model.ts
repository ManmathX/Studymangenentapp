import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_IDS, type SubjectId } from '../syllabus/syllabus.data.js';

export interface FocusSessionDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  subject: SubjectId;
  mins: number;
  createdAt: Date;
}

const focusSessionSchema = new Schema<FocusSessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    subject: { type: String, enum: SUBJECT_IDS, required: true },
    mins: { type: Number, required: true, min: 1, max: 240 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

focusSessionSchema.index({ userId: 1, date: 1 });

export const FocusSessionModel = model<FocusSessionDocument>('FocusSession', focusSessionSchema);
