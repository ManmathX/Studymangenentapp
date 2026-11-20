import { model, Schema, type Types } from 'mongoose';
import { SUBJECT_IDS, type SubjectId } from '../syllabus/syllabus.data.js';
import { AGE_MODES, type AgeMode } from '../planner/planner.types.js';

export const SHARE_ITEMS = ['hours', 'streak', 'coverage', 'tests', 'marks'] as const;
export type ShareItem = (typeof SHARE_ITEMS)[number];

export interface SharingSettings {
  parent: boolean;
  items: Record<ShareItem, boolean>;
  groups: boolean;
}

export interface ProfileDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  cls: number;
  board: 'CBSE';
  timezone: string;
  subjects: SubjectId[];
  schoolStart: number;
  schoolEnd: number;
  tuitionDays: number[];
  dailyLimitMins: number;
  weeklyGoalMins: number;
  ageMode: AgeMode;
  examSeason: boolean;
  sharing: SharingSettings;
  /** First calendar day the streak calendar counts as "missed" when empty. */
  trackingStart: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<ProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cls: { type: Number, required: true, min: 6, max: 12 },
    board: { type: String, enum: ['CBSE'], default: 'CBSE' },
    timezone: { type: String, required: true },
    subjects: { type: [String], enum: SUBJECT_IDS, required: true },
    schoolStart: { type: Number, required: true, min: 0, max: 1439 },
    schoolEnd: { type: Number, required: true, min: 0, max: 1439 },
    tuitionDays: { type: [Number], default: [] },
    dailyLimitMins: { type: Number, required: true, min: 30, max: 600 },
    weeklyGoalMins: { type: Number, required: true, min: 0, max: 4200 },
    ageMode: { type: String, enum: AGE_MODES, default: 'deeper' },
    examSeason: { type: Boolean, default: false },
    sharing: {
      parent: { type: Boolean, default: false },
      items: {
        hours: { type: Boolean, default: true },
        streak: { type: Boolean, default: true },
        coverage: { type: Boolean, default: true },
        tests: { type: Boolean, default: true },
        marks: { type: Boolean, default: false },
      },
      groups: { type: Boolean, default: false },
    },
    trackingStart: { type: String, required: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

profileSchema.index({ userId: 1 }, { unique: true });

export const ProfileModel = model<ProfileDocument>('Profile', profileSchema);
