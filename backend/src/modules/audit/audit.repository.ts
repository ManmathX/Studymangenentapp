import { skipFor, type PaginationQuery } from '../../common/http/page.js';
import { idOf, toObjectId } from '../../database/ids.js';
import { AuditLogModel, type AuditLogDocument } from './audit.model.js';

export interface AuditEntry {
  userId: string | null;
  action: string;
  ip: string;
  requestId: string;
  meta?: Record<string, unknown>;
}

export interface AuditRecord extends Required<AuditEntry> {
  id: string;
  at: string;
}

export interface AuditListQuery extends PaginationQuery {
  action?: string;
  userId?: string;
}

export interface AuditRepository {
  insert(entry: AuditEntry): Promise<void>;
  list(query: AuditListQuery): Promise<{ items: AuditRecord[]; total: number }>;
}

export class MongoAuditRepository implements AuditRepository {
  async insert(entry: AuditEntry): Promise<void> {
    await AuditLogModel.create({
      ...entry,
      userId: entry.userId ? toObjectId(entry.userId) : null,
    });
  }

  async list(query: AuditListQuery): Promise<{ items: AuditRecord[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.userId) filter.userId = toObjectId(query.userId);
    const [docs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ at: -1 })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean<AuditLogDocument[]>(),
      AuditLogModel.countDocuments(filter),
    ]);
    return {
      items: docs.map((doc) => ({
        id: idOf(doc),
        userId: doc.userId ? doc.userId.toHexString() : null,
        action: doc.action,
        ip: doc.ip,
        requestId: doc.requestId,
        meta: doc.meta,
        at: doc.at.toISOString(),
      })),
      total,
    };
  }
}
