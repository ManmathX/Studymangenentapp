import type { TxHandle } from '../../database/transaction.js';
import { toObjectId } from '../../database/ids.js';
import { isBuiltInSubject, SUBJECTS, type SubjectId } from '../syllabus/syllabus.data.js';
import type { AgeMode, PlannerProfile } from '../planner/planner.types.js';
import {
  ProfileModel,
  type ProfileDocument,
  type ProfileSubject,
  type SharingSettings,
} from './profile.model.js';

export interface ProfileRecord extends PlannerProfile {
  cls: number;
  board: string;
  boardName: string;
  timezone: string;
  subjects: SubjectId[];
  /** Name and colour for each id in `subjects`, in the same order. */
  subjectInfo: ProfileSubject[];
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

/** Older profiles have no subject snapshot: they only ever held the five built-in CBSE subjects. */
function subjectInfoOf(doc: ProfileDocument): ProfileSubject[] {
  const stored = new Map((doc.subjectInfo ?? []).map((info) => [info.id, info]));
  return doc.subjects.map((id) => {
    const info = stored.get(id);
    if (info) return { id, name: info.name, color: info.color, custom: Boolean(info.custom) };
    if (isBuiltInSubject(id)) return { ...SUBJECTS[id], custom: false };
    return { id, name: 'Other subject', color: '#8E8E93', custom: false };
  });
}

function toRecord(doc: ProfileDocument): ProfileRecord {
  return {
    cls: doc.cls,
    board: doc.board.toLowerCase(),
    boardName: doc.boardName ?? doc.board.toUpperCase(),
    timezone: doc.timezone,
    subjects: doc.subjects,
    subjectInfo: subjectInfoOf(doc),
    schoolStart: doc.schoolStart,
    schoolEnd: doc.schoolEnd,
    tuitionDays: doc.tuitionDays,
    tuitionStart: doc.tuitionStart ?? 960,
    tuitionEnd: doc.tuitionEnd ?? 1050,
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
