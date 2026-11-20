import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_IDS, type SubjectId } from '../syllabus/syllabus.data.js';
import {
  TASK_KINDS,
  TASK_SOURCES,
  TASK_STATUSES,
  type TaskKind,
  type TaskSource,
  type TaskStatus,
} from '../planner/planner.types.js';

export interface TaskDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  subject: SubjectId;
  title: string;
  kind: TaskKind;
  mins: number;
  done: boolean;
  source: TaskSource;
  status: TaskStatus;
  score: number;
  order: number;
  deadline: string;
  why: string;
  chapterKey: string | null;
  homeworkId: Types.ObjectId | null;
}

const taskSchema = new Schema<TaskDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    subject: { type: String, enum: SUBJECT_IDS, required: true },
    title: { type: String, required: true, maxlength: 160 },
    kind: { type: String, enum: TASK_KINDS, required: true },
    mins: { type: Number, required: true, min: 5, max: 240 },
    done: { type: Boolean, default: false },
    source: { type: String, enum: TASK_SOURCES, default: 'me' },
    status: { type: String, enum: TASK_STATUSES, default: 'accepted' },
    score: { type: Number, default: 3 },
    order: { type: Number, required: true },
    deadline: { type: String, required: true },
    why: { type: String, default: '' },
    chapterKey: { type: String, default: null },
    homeworkId: { type: Schema.Types.ObjectId, ref: 'Homework', default: null },
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, date: 1 });
taskSchema.index({ userId: 1, status: 1, date: 1 });
taskSchema.index({ userId: 1, chapterKey: 1, date: 1 });
taskSchema.index({ userId: 1, homeworkId: 1 });

export const TaskModel = model<TaskDocument>('Task', taskSchema);
