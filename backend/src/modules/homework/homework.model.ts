import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_IDS, type SubjectId } from '../syllabus/syllabus.data.js';

export interface HomeworkDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  subject: SubjectId;
  title: string;
  note: string;
  teacher: string;
  due: string;
  mins: number;
  difficulty: number;
  weight: number;
  done: boolean;
  doneOn: string | null;
}

const homeworkSchema = new Schema<HomeworkDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, enum: SUBJECT_IDS, required: true },
    title: { type: String, required: true, maxlength: 140 },
    note: { type: String, default: '', maxlength: 500 },
    teacher: { type: String, default: '', maxlength: 60 },
    due: { type: String, required: true },
    mins: { type: Number, required: true, min: 5, max: 240 },
    difficulty: { type: Number, required: true, min: 1, max: 3 },
    weight: { type: Number, default: 5, min: 1, max: 100 },
    done: { type: Boolean, default: false },
    doneOn: { type: String, default: null },
  },
  { timestamps: true },
);

homeworkSchema.index({ userId: 1, done: 1, due: 1 });
homeworkSchema.index({ userId: 1, done: 1, doneOn: -1 });

export const HomeworkModel = model<HomeworkDocument>('Homework', homeworkSchema);
