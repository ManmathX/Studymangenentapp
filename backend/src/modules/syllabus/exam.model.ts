import { model, Schema, type Types } from 'mongoose';
import {
  CATEGORY_GROUPS,
  CODE_PATTERN,
  REGIONS,
  type CategoryGroup,
  type ExamStructure,
  type LogoInfo,
  type Region,
  type SettingValue,
} from './catalog.types.js';

/** A group students browse exams by: School Boards, Engineering Entrance, Olympiads… */
export interface ExamCategoryDocument {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description: string;
  group: CategoryGroup;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const examCategorySchema = new Schema<ExamCategoryDocument>(
  {
    code: { type: String, required: true, match: CODE_PATTERN },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 300 },
    group: { type: String, enum: CATEGORY_GROUPS, required: true },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
examCategorySchema.index({ code: 1 }, { unique: true });
examCategorySchema.index({ position: 1 });

/**
 * Catalogue collections are named `catalog_*` explicitly: older databases still hold the
 * server-side planner's `exams`, `chapters`… collections (see scripts/drop-planner-data.ts).
 */
export const ExamCategoryModel = model<ExamCategoryDocument>(
  'ExamCategory',
  examCategorySchema,
  'catalog_exam_categories',
);

/**
 * A school board or competitive exam. Legacy boards were copied in with the same code, which
 * is also what students' phones store, so codes never change.
 */
export interface ExamDocument {
  _id: Types.ObjectId;
  code: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  color: string;
  logo?: LogoInfo | null;
  conductingBody: string;
  region: Region;
  state: string;
  eligibility: string;
  targetGrades: number[];
  structure: ExamStructure;
  languages: string[];
  isActive: boolean;
  position: number;
  settings: Record<string, SettingValue>;
  createdAt: Date;
  updatedAt: Date;
}

const examSchema = new Schema<ExamDocument>(
  {
    code: { type: String, required: true, match: CODE_PATTERN },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    shortName: { type: String, required: true, trim: true, maxlength: 16 },
    category: { type: String, required: true },
    description: { type: String, default: '' },
    color: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ },
    logo: {
      type: new Schema(
        { sha: String, contentType: String, size: Number },
        { _id: false, strict: 'throw' },
      ),
      default: null,
    },
    conductingBody: { type: String, default: '' },
    region: { type: String, enum: REGIONS, default: 'national' },
    state: { type: String, default: '' },
    eligibility: { type: String, default: '' },
    targetGrades: { type: [Number], default: [] },
    // Validated by the API (Zod) before it gets here; stored as given.
    structure: { type: Schema.Types.Mixed, required: true },
    languages: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
    settings: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, minimize: false },
);
examSchema.index({ code: 1 }, { unique: true });
examSchema.index({ category: 1, isActive: 1, position: 1 });

export const ExamModel = model<ExamDocument>('Exam', examSchema, 'catalog_exams');

/** An exam's logo image (PNG, JPEG or WebP, at most 200 kB). One per exam. */
export interface ExamLogoDocument {
  _id: Types.ObjectId;
  exam: string;
  sha: string;
  contentType: string;
  size: number;
  data: Buffer;
  createdAt: Date;
}

const examLogoSchema = new Schema<ExamLogoDocument>(
  {
    exam: { type: String, required: true },
    sha: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
examLogoSchema.index({ exam: 1 }, { unique: true });

export const ExamLogoModel = model<ExamLogoDocument>(
  'ExamLogo',
  examLogoSchema,
  'catalog_exam_logos',
);

/** Marks one-time catalogue migrations as done so they run once per database. */
export interface CatalogMigrationDocument {
  _id: string;
  at: Date;
}

const catalogMigrationSchema = new Schema<CatalogMigrationDocument>({
  _id: { type: String, required: true },
  at: { type: Date, required: true },
});

export const CatalogMigrationModel = model<CatalogMigrationDocument>(
  'CatalogMigration',
  catalogMigrationSchema,
  'catalog_migrations',
);
