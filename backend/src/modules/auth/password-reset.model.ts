import { model, Schema, type Types } from 'mongoose';

/** A pending "forgot password" code. Only its HMAC is stored, never the code itself. */
export interface PasswordResetDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  codeHash: string;
  attempts: number;
  sentAt: Date;
  expiresAt: Date;
}

const passwordResetSchema = new Schema<PasswordResetDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

// One live code per account; asking again replaces it.
passwordResetSchema.index({ userId: 1 }, { unique: true });
// MongoDB removes expired codes automatically.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetModel = model<PasswordResetDocument>(
  'PasswordReset',
  passwordResetSchema,
);
