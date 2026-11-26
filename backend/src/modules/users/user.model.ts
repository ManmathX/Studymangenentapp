import { model, Schema, type Types } from 'mongoose';
import { ROLES } from '../../common/http/permissions.js';
import type { Role } from '../../common/http/types.js';

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  name: string;
  /** Absent for accounts created with Google sign-in. */
  passwordHash?: string;
  /** False for accounts that only sign in with Google. Missing on older accounts means true. */
  hasPassword?: boolean;
  googleId?: string;
  role: Role;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    passwordHash: { type: String, select: false },
    hasPassword: { type: Boolean, default: true },
    googleId: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'student' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
userSchema.index({ role: 1, createdAt: -1 });

export const UserModel = model<UserDocument>('User', userSchema);
