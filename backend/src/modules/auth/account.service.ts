import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { RequestMeta } from '../../common/http/types.js';
import type { TransactionRunner } from '../../database/transaction.js';
import type { AuditSink } from '../audit/audit.service.js';
import type { UserRepository } from '../users/user.repository.js';
import { wrongPasswordError } from './auth.service.js';
import type { PasswordHasher } from './password.service.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';

/**
 * Self-service account deletion (required by the App Store and Google Play). The server only
 * holds the login and its sessions; the app deletes the student's plan from the phone.
 * The audit trail keeps the event, keyed by the old id, for its normal retention period.
 */
export class AccountService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordHasher,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditSink,
  ) {}

  /**
   * Accounts with a password must re-enter it. Google-only accounts have none; for them the
   * signed-in session plus the app's confirmation step is the check.
   */
  async deleteAccount(
    userId: string,
    password: string | undefined,
    meta: RequestMeta,
  ): Promise<void> {
    const [user, passwordHash] = await Promise.all([
      this.users.findById(userId),
      this.users.findPasswordHash(userId),
    ]);
    if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
    if (passwordHash && !(await this.passwords.verify(passwordHash, password ?? '')))
      throw wrongPasswordError('password');
    if (user.role === 'admin' && (await this.users.countByRole('admin')) <= 1) {
      throw new ConflictError(
        'Make another account an admin before deleting the last admin',
        'LAST_ADMIN',
      );
    }
    await this.transactions.run(async (tx) => {
      await this.refreshTokens.deleteAllForUser(userId, tx);
      await this.users.delete(userId, tx);
    });
    await this.audit.record('auth.account_deleted', userId, meta);
  }
}
