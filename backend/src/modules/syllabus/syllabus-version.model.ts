import { model, Schema, type Types } from 'mongoose';
import {
  PRIORITIES,
  VERSION_STATUSES,
  type NodeCounts,
  type UnitNode,
  type VersionCounts,
  type VersionStatus,
} from './catalog.types.js';

/**
 * One version of an exam's syllabus for an academic year. Only drafts can be edited. At most
 * one version per exam is published; that is the one students download at setup.
 */
export interface SyllabusVersionDocument {
  _id: Types.ObjectId;
  exam: string;
  academicYear: string;
  version: number;
  status: VersionStatus;
  title: string;
  notes: string;
  counts: VersionCounts;
  publishedAt: Date | null;
  publishedBy: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const countsShape = {
  units: { type: Number, default: 0 },
  chapters: { type: Number, default: 0 },
  topics: { type: Number, default: 0 },
  subtopics: { type: Number, default: 0 },
};

const syllabusVersionSchema = new Schema<SyllabusVersionDocument>(
  {
    exam: { type: String, required: true },
    academicYear: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    status: { type: String, enum: VERSION_STATUSES, required: true, default: 'draft' },
    title: { type: String, default: '', maxlength: 80 },
    notes: { type: String, default: '', maxlength: 1000 },
    counts: {
      type: new Schema({ subjects: { type: Number, default: 0 }, ...countsShape }, { _id: false }),
      default: () => ({}),
    },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);
syllabusVersionSchema.index({ exam: 1, academicYear: 1, version: 1 }, { unique: true });
// The database itself refuses a second published version of one exam.
syllabusVersionSchema.index(
  { exam: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'published' },
    name: 'one_published_per_exam',
  },
);
syllabusVersionSchema.index({ status: 1, academicYear: 1 });

export const SyllabusVersionModel = model<SyllabusVersionDocument>(
  'SyllabusVersion',
  syllabusVersionSchema,
  'catalog_syllabus_versions',
);

/**
 * One subject at one level of a syllabus version, with its whole tree embedded: units, chapters,
 * topics and subtopics. The admin editor saves a subject at once.
 */
export interface SyllabusSubjectDocument {
  _id: Types.ObjectId;
  syllabus: Types.ObjectId;
  exam: string;
  level: string;
  subjectId: string;
  name: string;
  color: string;
  position: number;
  revision: number;
  counts: NodeCounts;
  units: UnitNode[];
  createdAt: Date;
  updatedAt: Date;
}

const opt = { type: Number, default: undefined };

const subtopicSchema = new Schema(
  { name: { type: String, required: true }, important: { type: Boolean, default: false } },
  { _id: false },
);
const topicSchema = new Schema(
  {
    name: { type: String, required: true },
    important: { type: Boolean, default: false },
    weightage: opt,
    marks: opt,
    priority: { type: String, enum: PRIORITIES, default: undefined },
    subtopics: { type: [subtopicSchema], default: [] },
  },
  { _id: false },
);
const chapterSchema = new Schema(
  {
    name: { type: String, required: true },
    difficulty: { type: Number, enum: [1, 2, 3], default: 2 },
    book: { type: String, default: undefined },
    important: { type: Boolean, default: false },
    weightage: opt,
    marks: opt,
    priority: { type: String, enum: PRIORITIES, default: undefined },
    grade: opt,
    topics: { type: [topicSchema], default: [] },
  },
  { _id: false },
);
const unitSchema = new Schema(
  {
    name: { type: String, default: '' },
    weightage: opt,
    marks: opt,
    chapters: { type: [chapterSchema], default: [] },
  },
  { _id: false },
);

const syllabusSubjectSchema = new Schema<SyllabusSubjectDocument>(
  {
    syllabus: { type: Schema.Types.ObjectId, required: true },
    exam: { type: String, required: true },
    level: { type: String, default: '' },
    subjectId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 60 },
    color: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ },
    position: { type: Number, default: 0 },
    revision: { type: Number, default: 1 },
    counts: { type: new Schema(countsShape, { _id: false }), default: () => ({}) },
    units: { type: [unitSchema], default: [] },
  },
  { timestamps: true },
);
syllabusSubjectSchema.index({ syllabus: 1, level: 1, subjectId: 1 }, { unique: true });
syllabusSubjectSchema.index({ syllabus: 1, level: 1, position: 1 });

export const SyllabusSubjectModel = model<SyllabusSubjectDocument>(
  'SyllabusSubject',
  syllabusSubjectSchema,
  'catalog_syllabus_subjects',
);
