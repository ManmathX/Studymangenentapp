import { model, Schema, type Types } from 'mongoose';
import type { Role } from '../../common/http/types.js';

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, createdAt: -1 });

export const UserModel = model<UserDocument>('User', userSchema);
