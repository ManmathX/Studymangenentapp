import { model, Schema, type Types } from 'mongoose';

export const AUDIT_RETENTION_DAYS = 180;

export interface AuditLogDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId | null;
  action: string;
  ip: string;
  requestId: string;
  meta: Record<string, unknown>;
  at: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true },
  ip: { type: String, default: '' },
  requestId: { type: String, default: '' },
  meta: { type: Schema.Types.Mixed, default: {} },
  at: { type: Date, default: () => new Date() },
});

auditLogSchema.index({ userId: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: AUDIT_RETENTION_DAYS * 86_400 });

export const AuditLogModel = model<AuditLogDocument>('AuditLog', auditLogSchema);
