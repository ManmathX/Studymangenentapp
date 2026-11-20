import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_IDS, type SubjectId } from '../syllabus/syllabus.data.js';

export const SUGGESTION_STATES = ['pending', 'accepted', 'later', 'skipped'] as const;
export type SuggestionState = (typeof SUGGESTION_STATES)[number];
export const SUGGESTION_KINDS = ['move', 'revision', 'practice', 'homework'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export const SUGGESTION_SOURCES = ['app', 'teacher', 'parent'] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

export interface SuggestionDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  from: SuggestionSource;
  who: string;
  role: string;
  subject: SubjectId;
  title: string;
  mins: number;
  date: string;
  kind: SuggestionKind;
  taskId: Types.ObjectId | null;
  chapterKey: string | null;
  note: string;
  state: SuggestionState;
}

const suggestionSchema = new Schema<SuggestionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: String, enum: SUGGESTION_SOURCES, default: 'app' },
    who: { type: String, default: 'Planner' },
    role: { type: String, default: '' },
    subject: { type: String, enum: SUBJECT_IDS, required: true },
    title: { type: String, required: true },
    mins: { type: Number, required: true },
    date: { type: String, required: true },
    kind: { type: String, enum: SUGGESTION_KINDS, required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    chapterKey: { type: String, default: null },
    note: { type: String, default: '' },
    state: { type: String, enum: SUGGESTION_STATES, default: 'pending' },
  },
  { timestamps: true },
);

suggestionSchema.index({ userId: 1, state: 1, date: 1 });
// One "move this missed task" suggestion per task, so generating them is idempotent.
suggestionSchema.index(
  { userId: 1, taskId: 1 },
  { unique: true, partialFilterExpression: { kind: 'move' } },
);

export const SuggestionModel = model<SuggestionDocument>('Suggestion', suggestionSchema);
