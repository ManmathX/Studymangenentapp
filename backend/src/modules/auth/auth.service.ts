import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors/app-error.js';
import type { RequestMeta } from '../../common/http/types.js';
import type { Clock } from '../../common/utils/clock.js';
import type { AuditSink } from '../audit/audit.service.js';
import type { ProfileRepository } from '../profile/profile.repository.js';
import type { UserRecord, UserRepository } from '../users/user.repository.js';
import type { LoginBody, RegisterBody } from './auth.schemas.js';
import type { GoogleIdTokenVerifier } from './google.service.js';
import type { PasswordHasher } from './password.service.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';
import type { TokenService } from './token.service.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface Session {
  user: UserRecord;
  tokens: TokenPair;
  onboarded: boolean;
}

export interface AuthSettings {
  accessTtlSeconds: number;
  refreshTtlDays: number;
  reuseGraceSeconds: number;
}

const INVALID_CREDENTIALS = 'Email or password is incorrect';

/** A re-entered password did not match. 400, not 401, so clients don't treat it as a lost session. */
export function wrongPasswordError(field: string): AppError {
  const message = 'That password is not right';
  return new AppError(400, 'WRONG_PASSWORD', message, [{ path: `body.${field}`, message }]);
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly profiles: ProfileRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly audit: AuditSink,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
    /** Null when GOOGLE_CLIENT_IDS is not configured. */
    private readonly google: GoogleIdTokenVerifier | null = null,
  ) {}

  async register(input: RegisterBody, meta: RequestMeta): Promise<Session> {
    const existing = await this.users.findCredentialsByEmail(input.email);
    if (existing)
      throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
      role: 'student',
    });
    await this.audit.record('auth.register', user.id, meta);
    const tokens = await this.issueTokens(user, this.tokens.newFamilyId(), meta);
    return { user, tokens, onboarded: false };
  }

  async login(input: LoginBody, meta: RequestMeta): Promise<Session> {
    const credentials = await this.users.findCredentialsByEmail(input.email);
    // Accounts made with Google have no password; check a dummy hash so timing stays the same.
    const valid = credentials?.passwordHash
      ? await this.passwords.verify(credentials.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);
    if (!credentials || !valid) {
      await this.audit.record('auth.login_failed', credentials?.user.id ?? null, meta, {
        reason: credentials ? 'password' : 'unknown_email',
      });
      throw new UnauthorizedError(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }
    const now = this.clock.now();
    await this.users.recordLogin(credentials.user.id, now);
    await this.audit.record('auth.login', credentials.user.id, meta);
    const user = { ...credentials.user, lastLoginAt: now.toISOString() };
    const tokens = await this.issueTokens(user, this.tokens.newFamilyId(), meta);
    return { user, tokens, onboarded: Boolean(await this.profiles.findByUser(user.id)) };
  }

  /**
   * Signs in with a Google ID token from the app. The Google account is matched by its id,
   * then by verified email (linking it to an existing email-and-password login); otherwise a
   * new student account is created.
   */
  async googleLogin(idToken: string, meta: RequestMeta): Promise<Session> {
    if (!this.google)
      throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not set up yet');
    const identity = await this.google.verify(idToken);
    let user = await this.users.findByGoogleId(identity.googleId);
    let created = false;
    if (!user) {
      if (!identity.emailVerified)
        throw new UnauthorizedError(
          'Verify your Google account email first',
          'GOOGLE_EMAIL_UNVERIFIED',
        );
      const existing = await this.users.findCredentialsByEmail(identity.email);
      if (existing) {
        await this.users.linkGoogle(existing.user.id, identity.googleId);
        await this.audit.record('auth.google_linked', existing.user.id, meta);
        user = existing.user;
      } else {
        user = await this.users.create({
          email: identity.email,
          name: (identity.name ?? identity.email.split('@')[0] ?? 'Student').slice(0, 60),
          role: 'student',
          googleId: identity.googleId,
        });
        created = true;
        await this.audit.record('auth.register', user.id, meta, { provider: 'google' });
      }
    }
    const now = this.clock.now();
    await this.users.recordLogin(user.id, now);
    await this.audit.record('auth.google_login', user.id, meta);
    const signedIn = { ...user, lastLoginAt: now.toISOString() };
    const tokens = await this.issueTokens(signedIn, this.tokens.newFamilyId(), meta);
    const onboarded = created ? false : Boolean(await this.profiles.findByUser(user.id));
    return { user: signedIn, tokens, onboarded };
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token outside the short grace
   * window is treated as theft: the whole token family is revoked.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const now = this.clock.now();
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored) throw new UnauthorizedError('Your session is not valid', 'REFRESH_INVALID');
    if (stored.expiresAt <= now)
      throw new UnauthorizedError('Your session has expired', 'REFRESH_EXPIRED');
    if (stored.revokedAt) {
      await this.handleReuse(stored.familyId, stored.userId, stored.revokedAt, now, meta);
      throw new UnauthorizedError('Your session is no longer valid', 'REFRESH_REUSED');
    }

    const user = await this.users.findById(stored.userId);
    if (!user) throw new UnauthorizedError('Your session is not valid', 'REFRESH_INVALID');

    const nextToken = this.tokens.generateRefreshToken();
    const rotated = await this.refreshTokens.markRotated(
      tokenHash,
      this.tokens.hashRefreshToken(nextToken),
      now,
    );
    if (!rotated) {
      // Another request rotated this token a moment ago (a benign race inside the grace window).
      throw new UnauthorizedError('Your session is no longer valid', 'REFRESH_REUSED');
    }
    return this.storeTokens(user, stored.familyId, nextToken, meta);
  }

  async logout(refreshToken: string, meta: RequestMeta, userId: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(this.tokens.hashRefreshToken(refreshToken));
    if (stored && stored.userId === userId) {
      await this.refreshTokens.revokeFamily(stored.familyId, this.clock.now());
    }
    await this.audit.record('auth.logout', userId, meta);
  }

  async me(userId: string): Promise<{ user: UserRecord; onboarded: boolean }> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
    return { user, onboarded: Boolean(await this.profiles.findByUser(userId)) };
  }

  /**
   * Changes the password after re-checking the current one. Every existing session,
   * on every device, is signed out; the caller gets a fresh token pair to stay signed in.
   */
  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const [user, currentHash] = await Promise.all([
      this.users.findById(userId),
      this.users.findPasswordHash(userId),
    ]);
    if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
    if (!currentHash)
      throw new BadRequestError(
        'This account signs in with Google, so it has no password to change',
        'NO_PASSWORD',
      );
    if (!(await this.passwords.verify(currentHash, input.currentPassword))) {
      await this.audit.record('auth.password_change_failed', userId, meta);
      throw wrongPasswordError('currentPassword');
    }
    await this.users.updatePasswordHash(userId, await this.passwords.hash(input.newPassword));
    const revoked = await this.refreshTokens.revokeAllForUser(userId, this.clock.now());
    await this.audit.record('auth.password_changed', userId, meta, { revokedSessions: revoked });
    return this.issueTokens(user, this.tokens.newFamilyId(), meta);
  }

  private async handleReuse(
    familyId: string,
    userId: string,
    revokedAt: Date,
    now: Date,
    meta: RequestMeta,
  ): Promise<void> {
    const secondsSinceRotation = (now.getTime() - revokedAt.getTime()) / 1000;
    if (secondsSinceRotation <= this.settings.reuseGraceSeconds) return;
    const revoked = await this.refreshTokens.revokeFamily(familyId, now);
    await this.audit.record('auth.refresh_reuse_detected', userId, meta, { familyId, revoked });
  }

  private issueTokens(user: UserRecord, familyId: string, meta: RequestMeta): Promise<TokenPair> {
    return this.storeTokens(user, familyId, this.tokens.generateRefreshToken(), meta);
  }

  private async storeTokens(
    user: UserRecord,
    familyId: string,
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const expiresAt = new Date(
      this.clock.now().getTime() + this.settings.refreshTtlDays * 86_400_000,
    );
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.tokens.hashRefreshToken(refreshToken),
      familyId,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      accessToken: this.tokens.signAccessToken({ userId: user.id, role: user.role }),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.settings.accessTtlSeconds,
    };
  }
}
