import type { Role } from '../../common/http/types.js';
import { skipFor, type PaginationQuery } from '../../common/http/page.js';
import { idOf, toObjectId } from '../../database/ids.js';
import type { TxHandle } from '../../database/transaction.js';
import { UserModel, type UserDocument } from './user.model.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserListQuery extends PaginationQuery {
  role?: Role;
  sort: 'createdAt' | '-createdAt' | 'email' | '-email';
}

export interface UserRepository {
  create(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: Role;
  }): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  findCredentialsByEmail(email: string): Promise<{ user: UserRecord; passwordHash: string } | null>;
  findPasswordHash(id: string): Promise<string | null>;
  recordLogin(id: string, at: Date): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  setRole(id: string, role: Role): Promise<UserRecord | null>;
  countByRole(role: Role): Promise<number>;
  list(query: UserListQuery): Promise<{ items: UserRecord[]; total: number }>;
  delete(id: string, tx: TxHandle): Promise<boolean>;
}

type UserLean = Omit<UserDocument, 'passwordHash'> & { passwordHash?: string };

function toRecord(doc: UserLean): UserRecord {
  return {
    id: idOf(doc),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    createdAt: doc.createdAt.toISOString(),
    lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
  };
}

const PUBLIC_FIELDS = { email: 1, name: 1, role: 1, createdAt: 1, lastLoginAt: 1 } as const;

export class MongoUserRepository implements UserRepository {
  async create(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: Role;
  }): Promise<UserRecord> {
    const doc = await UserModel.create(input);
    return toRecord(doc.toObject());
  }

  async findById(id: string): Promise<UserRecord | null> {
    const doc = await UserModel.findById(toObjectId(id), PUBLIC_FIELDS).lean<UserLean>();
    return doc ? toRecord(doc) : null;
  }

  async findCredentialsByEmail(
    email: string,
  ): Promise<{ user: UserRecord; passwordHash: string } | null> {
    const doc = await UserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .lean<UserLean & { passwordHash: string }>();
    return doc ? { user: toRecord(doc), passwordHash: doc.passwordHash } : null;
  }

  async findPasswordHash(id: string): Promise<string | null> {
    const doc = await UserModel.findById(toObjectId(id), { passwordHash: 1 })
      .select('+passwordHash')
      .lean<{ passwordHash: string }>();
    return doc?.passwordHash ?? null;
  }

  async recordLogin(id: string, at: Date): Promise<void> {
    await UserModel.updateOne({ _id: toObjectId(id) }, { $set: { lastLoginAt: at } });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await UserModel.updateOne({ _id: toObjectId(id) }, { $set: { passwordHash } });
  }

  async countByRole(role: Role): Promise<number> {
    return UserModel.countDocuments({ role });
  }

  async delete(id: string, tx: TxHandle): Promise<boolean> {
    const result = await UserModel.deleteOne({ _id: toObjectId(id) }, { session: tx });
    return result.deletedCount === 1;
  }

  async setRole(id: string, role: Role): Promise<UserRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(
      toObjectId(id),
      { $set: { role } },
      { new: true, projection: PUBLIC_FIELDS },
    ).lean<UserLean>();
    return doc ? toRecord(doc) : null;
  }

  async list(query: UserListQuery): Promise<{ items: UserRecord[]; total: number }> {
    const filter = query.role ? { role: query.role } : {};
    const field = query.sort.replace('-', '');
    const direction = query.sort.startsWith('-') ? -1 : 1;
    const [docs, total] = await Promise.all([
      UserModel.find(filter, PUBLIC_FIELDS)
        .sort({ [field]: direction, _id: direction })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean<UserLean[]>(),
      UserModel.countDocuments(filter),
    ]);
    return { items: docs.map(toRecord), total };
  }
}
