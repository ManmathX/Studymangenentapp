import { toObjectId } from '../../database/ids.js';
import { PasswordResetModel, type PasswordResetDocument } from './password-reset.model.js';

export interface PasswordResetRecord {
  codeHash: string;
  attempts: number;
  sentAt: Date;
  expiresAt: Date;
}

export interface PasswordResetRepository {
  find(userId: string): Promise<PasswordResetRecord | null>;
  /** Stores a new code for the account, replacing any earlier one. */
  replace(userId: string, codeHash: string, sentAt: Date, expiresAt: Date): Promise<void>;
  /** Counts a wrong guess. Returns how many wrong guesses the code now has. */
  recordFailedAttempt(userId: string): Promise<number>;
  delete(userId: string): Promise<void>;
}

export class MongoPasswordResetRepository implements PasswordResetRepository {
  async find(userId: string): Promise<PasswordResetRecord | null> {
    const doc = await PasswordResetModel.findOne({ userId: toObjectId(userId) }).lean<
      Pick<PasswordResetDocument, 'codeHash' | 'attempts' | 'sentAt' | 'expiresAt'>
    >();
    return doc
      ? {
          codeHash: doc.codeHash,
          attempts: doc.attempts,
          sentAt: doc.sentAt,
          expiresAt: doc.expiresAt,
        }
      : null;
  }

  async replace(userId: string, codeHash: string, sentAt: Date, expiresAt: Date): Promise<void> {
    await PasswordResetModel.updateOne(
      { userId: toObjectId(userId) },
      { $set: { codeHash, attempts: 0, sentAt, expiresAt } },
      { upsert: true },
    );
  }

  async recordFailedAttempt(userId: string): Promise<number> {
    const doc = await PasswordResetModel.findOneAndUpdate(
      { userId: toObjectId(userId) },
      { $inc: { attempts: 1 } },
      { new: true, projection: { attempts: 1 } },
    ).lean<Pick<PasswordResetDocument, 'attempts'>>();
    return doc?.attempts ?? 0;
  }

  async delete(userId: string): Promise<void> {
    await PasswordResetModel.deleteOne({ userId: toObjectId(userId) });
  }
}
