import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import { AppError } from '../../common/errors/app-error.js';
import type { RequestMeta } from '../../common/http/types.js';
import type { Clock } from '../../common/utils/clock.js';
import type { AuditSink } from '../audit/audit.service.js';
import type { UserRepository } from '../users/user.repository.js';
import type { Mailer } from './mailer.js';
import type { PasswordHasher } from './password.service.js';
import type { PasswordResetRepository } from './password-reset.repository.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';

/** Wrong guesses allowed before a code stops working. */
export const MAX_WRONG_CODES = 5;
/** A new code is emailed at most once a minute per account, so nobody can flood an inbox. */
const RESEND_AFTER_MS = 60_000;

export interface PasswordResetSettings {
  codeTtlMinutes: number;
  /** Server secret mixed into stored code hashes, so a database copy alone can't reveal codes. */
  secret: string;
}

function invalidCode(): AppError {
  const message = 'That code is not right or has expired. Ask for a new one.';
  return new AppError(400, 'RESET_CODE_INVALID', message, [{ path: 'body.code', message }]);
}

/**
 * "Forgot password": emails a 6-digit code, then sets a new password with it. Asking for a
 * code answers the same whether or not the email has an account, and the email is sent in
 * the background so the reply time doesn't tell either.
 */
export class PasswordResetService {
  private readonly key: Buffer;

  constructor(
    private readonly users: UserRepository,
    private readonly resets: PasswordResetRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordHasher,
    /** Null when SMTP_URL is not configured. */
    private readonly mailer: Mailer | null,
    private readonly audit: AuditSink,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly settings: PasswordResetSettings,
  ) {
    this.key = createHash('sha256').update(`password-reset:${settings.secret}`).digest();
  }

  async requestCode(email: string, meta: RequestMeta): Promise<void> {
    if (!this.mailer) {
      throw new AppError(
        503,
        'PASSWORD_RESET_UNAVAILABLE',
        'Password reset by email is not set up yet. Ask your school or the app team for help.',
      );
    }
    const credentials = await this.users.findCredentialsByEmail(email);
    if (!credentials) return;
    const { user } = credentials;
    const now = this.clock.now();
    const existing = await this.resets.find(user.id);
    if (
      existing &&
      existing.expiresAt > now &&
      now.getTime() - existing.sentAt.getTime() < RESEND_AFTER_MS
    )
      return;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now.getTime() + this.settings.codeTtlMinutes * 60_000);
    await this.resets.replace(user.id, this.hash(user.id, code), now, expiresAt);
    await this.audit.record('auth.password_reset_requested', user.id, meta);
    const mailer = this.mailer;
    void mailer
      .send({
        to: user.email,
        subject: 'Your Study Planner password reset code',
        text: [
          `Hi ${user.name},`,
          '',
          `Your code to reset your Study Planner password is ${code}. It works for ${this.settings.codeTtlMinutes} minutes.`,
          '',
          'If you didn’t ask for this, you can ignore this email. Your password stays the same.',
        ].join('\n'),
      })
      .catch((error: unknown) =>
        this.logger.error({ err: error, userId: user.id }, 'Password reset email failed'),
      );
  }

  /** Sets a new password with an emailed code and signs out every device. */
  async resetPassword(
    input: { email: string; code: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<void> {
    const credentials = await this.users.findCredentialsByEmail(input.email);
    if (!credentials) throw invalidCode();
    const userId = credentials.user.id;
    const now = this.clock.now();
    const stored = await this.resets.find(userId);
    if (!stored || stored.expiresAt <= now || stored.attempts >= MAX_WRONG_CODES)
      throw invalidCode();

    const expected = Buffer.from(stored.codeHash, 'hex');
    const given = Buffer.from(this.hash(userId, input.code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      const attempts = await this.resets.recordFailedAttempt(userId);
      if (attempts >= MAX_WRONG_CODES) await this.resets.delete(userId);
      await this.audit.record('auth.password_reset_failed', userId, meta, { attempts });
      throw invalidCode();
    }

    await this.users.updatePasswordHash(userId, await this.passwords.hash(input.newPassword));
    await this.resets.delete(userId);
    const revoked = await this.refreshTokens.revokeAllForUser(userId, now);
    await this.audit.record('auth.password_reset', userId, meta, { revokedSessions: revoked });
  }

  private hash(userId: string, code: string): string {
    return createHmac('sha256', this.key).update(`${userId}:${code}`).digest('hex');
  }
}
