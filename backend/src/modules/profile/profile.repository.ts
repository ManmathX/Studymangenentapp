import type { TxHandle } from '../../database/transaction.js';
import { toObjectId } from '../../database/ids.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';
import type { AgeMode, PlannerProfile } from '../planner/planner.types.js';
import { ProfileModel, type ProfileDocument, type SharingSettings } from './profile.model.js';

export interface ProfileRecord extends PlannerProfile {
  cls: number;
  board: 'CBSE';
  timezone: string;
  subjects: SubjectId[];
  weeklyGoalMins: number;
  sharing: SharingSettings;
  trackingStart: string;
  isDemo: boolean;
}

export type NewProfile = ProfileRecord;

export interface ProfilePatch {
  ageMode?: AgeMode;
  examSeason?: boolean;
  timezone?: string;
  sharing?: SharingSettings;
}

export interface ProfileRepository {
  findByUser(userId: string): Promise<ProfileRecord | null>;
  create(userId: string, profile: NewProfile, tx: TxHandle): Promise<ProfileRecord>;
  update(userId: string, patch: ProfilePatch): Promise<ProfileRecord | null>;
  deleteByUser(userId: string, tx: TxHandle): Promise<void>;
}

function toRecord(doc: ProfileDocument): ProfileRecord {
  return {
    cls: doc.cls,
    board: doc.board,
    timezone: doc.timezone,
    subjects: doc.subjects,
    schoolStart: doc.schoolStart,
    schoolEnd: doc.schoolEnd,
    tuitionDays: doc.tuitionDays,
    dailyLimitMins: doc.dailyLimitMins,
    weeklyGoalMins: doc.weeklyGoalMins,
    ageMode: doc.ageMode,
    examSeason: doc.examSeason,
    sharing: {
      parent: doc.sharing.parent,
      items: { ...doc.sharing.items },
      groups: doc.sharing.groups,
    },
    trackingStart: doc.trackingStart,
    isDemo: doc.isDemo,
  };
}

export class MongoProfileRepository implements ProfileRepository {
  async findByUser(userId: string): Promise<ProfileRecord | null> {
    const doc = await ProfileModel.findOne({ userId: toObjectId(userId) }).lean<ProfileDocument>();
    return doc ? toRecord(doc) : null;
  }

  async create(userId: string, profile: NewProfile, tx: TxHandle): Promise<ProfileRecord> {
    const [doc] = await ProfileModel.create([{ ...profile, userId: toObjectId(userId) }], {
      session: tx,
    });
    if (!doc) throw new Error('Profile insert returned no document');
    return toRecord(doc.toObject());
  }

  async update(userId: string, patch: ProfilePatch): Promise<ProfileRecord | null> {
    const doc = await ProfileModel.findOneAndUpdate(
      { userId: toObjectId(userId) },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean<ProfileDocument>();
    return doc ? toRecord(doc) : null;
  }

  async deleteByUser(userId: string, tx: TxHandle): Promise<void> {
    await ProfileModel.deleteOne({ userId: toObjectId(userId) }, { session: tx });
  }
}
