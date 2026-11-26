import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import type { Route } from './common/http/route.js';
import { createAuthenticate } from './common/middleware/authenticate.js';
import { createRateLimiters, type RateLimiters } from './common/middleware/rate-limit.js';
import { systemClock, type Clock } from './common/utils/clock.js';
import { mongoTransactionRunner } from './database/transaction.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { MongoAuditRepository } from './modules/audit/audit.repository.js';
import { AuditService } from './modules/audit/audit.service.js';
import { AccountService } from './modules/auth/account.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import {
  GoogleAuthLibraryVerifier,
  type GoogleIdTokenVerifier,
} from './modules/auth/google.service.js';
import { SmtpMailer, type Mailer } from './modules/auth/mailer.js';
import { Argon2PasswordHasher, type PasswordHasher } from './modules/auth/password.service.js';
import { MongoPasswordResetRepository } from './modules/auth/password-reset.repository.js';
import { PasswordResetService } from './modules/auth/password-reset.service.js';
import { MongoRefreshTokenRepository } from './modules/auth/refresh-token.repository.js';
import { TokenService } from './modules/auth/token.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { CatalogCache } from './modules/syllabus/catalog-cache.js';
import { CatalogSetup } from './modules/syllabus/catalog-setup.js';
import { CatalogService } from './modules/syllabus/catalog.service.js';
import { DashboardService } from './modules/syllabus/dashboard.service.js';
import { examAdminRoutes } from './modules/syllabus/exam-admin.routes.js';
import { MongoExamRepository } from './modules/syllabus/exam.repository.js';
import { ExamService } from './modules/syllabus/exam.service.js';
import { syllabusAdminRoutes } from './modules/syllabus/syllabus-admin.routes.js';
import { MongoSyllabusRepository } from './modules/syllabus/syllabus.repository.js';
import { syllabusRoutes } from './modules/syllabus/syllabus.routes.js';
import { SyllabusService } from './modules/syllabus/syllabus.service.js';
import { MongoUserRepository } from './modules/users/user.repository.js';

export interface ContainerOptions {
  config: AppConfig;
  logger: Logger;
  redis?: Redis;
  clock?: Clock;
  passwordHasher?: PasswordHasher;
  /** Overrides Google ID token checks (tests). Defaults to google-auth-library when configured. */
  googleVerifier?: GoogleIdTokenVerifier | null;
  /** Overrides email sending (tests). Defaults to SMTP when SMTP_URL is set, otherwise none. */
  mailer?: Mailer | null;
  startedAt?: Date;
  /** Reports whether a graceful shutdown has begun (readiness then fails). */
  isShuttingDown?: () => boolean;
}

export interface Container {
  routes: Route[];
  rateLimiters: RateLimiters;
  authenticate: ReturnType<typeof createAuthenticate>;
}

/**
 * Composition root: the only place that knows concrete implementations.
 * The server holds logins, sessions, the security audit log and the shared syllabus
 * catalogue. Students' plans live only on their phones and never reach the server.
 */
export function buildContainer(options: ContainerOptions): Container {
  const { config, logger, redis } = options;
  const clock = options.clock ?? systemClock;
  const transactions = mongoTransactionRunner;

  const users = new MongoUserRepository();
  const refreshTokens = new MongoRefreshTokenRepository();
  const auditLogs = new MongoAuditRepository();

  const audit = new AuditService(auditLogs, logger);
  const tokens = new TokenService({
    secret: config.JWT_ACCESS_SECRET,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  });
  const passwords = options.passwordHasher ?? new Argon2PasswordHasher();
  const google =
    options.googleVerifier !== undefined
      ? options.googleVerifier
      : config.GOOGLE_CLIENT_IDS.length
        ? new GoogleAuthLibraryVerifier(config.GOOGLE_CLIENT_IDS)
        : null;
  const auth = new AuthService(
    users,
    refreshTokens,
    passwords,
    tokens,
    audit,
    clock,
    {
      accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      reuseGraceSeconds: config.REFRESH_REUSE_GRACE_SECONDS,
    },
    google,
  );
  // Exam catalogue: categories, exams and versioned syllabi (see modules/syllabus).
  const examRepository = new MongoExamRepository();
  const syllabusRepository = new MongoSyllabusRepository();
  const catalogSetup = new CatalogSetup(examRepository, syllabusRepository, transactions, clock);
  const catalogCache = new CatalogCache();
  const catalog = new CatalogService(
    examRepository,
    syllabusRepository,
    catalogSetup,
    catalogCache,
  );
  const exams = new ExamService(
    examRepository,
    syllabusRepository,
    catalogSetup,
    catalogCache,
    transactions,
    clock,
  );
  const syllabi = new SyllabusService(
    examRepository,
    syllabusRepository,
    catalogSetup,
    catalogCache,
    transactions,
    clock,
  );
  const dashboard = new DashboardService(examRepository, syllabusRepository, catalogSetup);
  const accounts = new AccountService(users, refreshTokens, passwords, transactions, audit);
  const mailer =
    options.mailer !== undefined
      ? options.mailer
      : config.SMTP_URL
        ? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM)
        : null;
  const resets = new PasswordResetService(
    users,
    new MongoPasswordResetRepository(),
    refreshTokens,
    passwords,
    mailer,
    audit,
    clock,
    logger,
    { codeTtlMinutes: config.PASSWORD_RESET_CODE_TTL_MINUTES, secret: config.JWT_ACCESS_SECRET },
  );

  const rateLimiters = createRateLimiters(
    {
      enabled: config.RATE_LIMIT_ENABLED,
      globalPerMinute: config.RATE_LIMIT_GLOBAL_PER_MINUTE,
      authPerWindow: config.RATE_LIMIT_AUTH_MAX,
      authWindowMinutes: config.RATE_LIMIT_AUTH_WINDOW_MINUTES,
    },
    redis,
  );

  const routes: Route[] = [
    ...healthRoutes(redis, options.startedAt ?? new Date(), options.isShuttingDown),
    ...authRoutes(auth, accounts, resets, rateLimiters.auth),
    ...syllabusRoutes(catalog),
    ...adminRoutes(users, auditLogs, audit),
    ...examAdminRoutes(exams, syllabi, dashboard, audit),
    ...syllabusAdminRoutes(syllabi, audit),
  ];

  return { routes, rateLimiters, authenticate: createAuthenticate(tokens) };
}
