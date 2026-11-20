import { model, Schema, type Types } from 'mongoose';

export const SCREEN_TIME_OPTIONS = ['Under 1 h', '1 to 2 h', '2 to 3 h', 'Over 3 h'] as const;
export type ScreenTime = (typeof SCREEN_TIME_OPTIONS)[number];

export interface CheckIn {
  sleep: number;
  breaks: number;
  screen: ScreenTime;
  saved: boolean;
}

export interface Routines {
  morning: boolean[];
  evening: boolean[];
}

export interface DailyLogDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  rest: boolean;
  checkin: CheckIn | null;
  routines: Routines | null;
  bag: Map<string, boolean>;
}

const dailyLogSchema = new Schema<DailyLogDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    rest: { type: Boolean, default: false },
    checkin: {
      type: new Schema<CheckIn>(
        {
          sleep: { type: Number, min: 3, max: 12 },
          breaks: { type: Number, min: 0, max: 12 },
          screen: { type: String, enum: SCREEN_TIME_OPTIONS },
          saved: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: null,
    },
    routines: {
      type: new Schema<Routines>({ morning: [Boolean], evening: [Boolean] }, { _id: false }),
      default: null,
    },
    bag: { type: Map, of: Boolean, default: () => new Map() },
  },
  { timestamps: true },
);

dailyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyLogModel = model<DailyLogDocument>('DailyLog', dailyLogSchema);
