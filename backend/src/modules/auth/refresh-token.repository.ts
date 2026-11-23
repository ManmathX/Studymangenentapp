import { toObjectId } from '../../database/ids.js';
import type { TxHandle } from '../../database/transaction.js';
import { RefreshTokenModel, type RefreshTokenDocument } from './refresh-token.model.js';

export interface RefreshTokenRecord {
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  ip: string;
  userAgent: string;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Atomically revokes an active token. Returns false if another request already rotated it. */
  markRotated(tokenHash: string, replacedByHash: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<number>;
  revokeAllForUser(userId: string, at: Date): Promise<number>;
  deleteAllForUser(userId: string, tx: TxHandle): Promise<void>;
}

export class MongoRefreshTokenRepository implements RefreshTokenRepository {
  async create(token: NewRefreshToken): Promise<void> {
    await RefreshTokenModel.create({
      userId: toObjectId(token.userId),
      tokenHash: token.tokenHash,
      familyId: token.familyId,
      expiresAt: token.expiresAt,
      createdByIp: token.ip,
      userAgent: token.userAgent,
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const doc = await RefreshTokenModel.findOne(
      { tokenHash },
      { userId: 1, familyId: 1, expiresAt: 1, revokedAt: 1 },
    ).lean<Pick<RefreshTokenDocument, 'userId' | 'familyId' | 'expiresAt' | 'revokedAt'>>();
    if (!doc) return null;
    return {
      userId: doc.userId.toHexString(),
      familyId: doc.familyId,
      expiresAt: doc.expiresAt,
      revokedAt: doc.revokedAt,
    };
  }

  async markRotated(tokenHash: string, replacedByHash: string, at: Date): Promise<boolean> {
    const result = await RefreshTokenModel.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: at, replacedByHash } },
    );
    return result.modifiedCount === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<number> {
    const result = await RefreshTokenModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: at } },
    );
    return result.modifiedCount;
  }

  async revokeAllForUser(userId: string, at: Date): Promise<number> {
    const result = await RefreshTokenModel.updateMany(
      { userId: toObjectId(userId), revokedAt: null },
      { $set: { revokedAt: at } },
    );
    return result.modifiedCount;
  }

  async deleteAllForUser(userId: string, tx: TxHandle): Promise<void> {
    await RefreshTokenModel.deleteMany({ userId: toObjectId(userId) }, { session: tx });
  }
}
