import type { Logger } from 'pino';
import type { RequestMeta } from '../../common/http/types.js';
import type { AuditRepository } from './audit.repository.js';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.google_login'
  | 'auth.google_linked'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse_detected'
  | 'auth.password_changed'
  | 'auth.password_change_failed'
  | 'auth.account_deleted'
  | 'data.wipe'
  | 'data.demo_seeded'
  | 'admin.role_changed'
  | 'admin.syllabus_changed';

export interface AuditSink {
  record(
    action: AuditAction,
    userId: string | null,
    meta: RequestMeta,
    details?: Record<string, unknown>,
  ): Promise<void>;
}

/** Writes security-relevant events. A failed write is logged, never surfaced to the caller. */
export class AuditService implements AuditSink {
  constructor(
    private readonly repository: AuditRepository,
    private readonly logger: Logger,
  ) {}

  async record(
    action: AuditAction,
    userId: string | null,
    meta: RequestMeta,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.repository.insert({
        action,
        userId,
        ip: meta.ip,
        requestId: meta.requestId,
        meta: details,
      });
    } catch (error) {
      this.logger.error(
        { err: error, action, requestId: meta.requestId },
        'Failed to write audit log',
      );
    }
  }
}
