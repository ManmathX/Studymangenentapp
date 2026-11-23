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
import { Argon2PasswordHasher, type PasswordHasher } from './modules/auth/password.service.js';
import { MongoRefreshTokenRepository } from './modules/auth/refresh-token.repository.js';
import { TokenService } from './modules/auth/token.service.js';
import { chapterRoutes } from './modules/chapters/chapter.routes.js';
import { MongoChapterRepository } from './modules/chapters/chapter.repository.js';
import { ChapterService } from './modules/chapters/chapter.service.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { examRoutes } from './modules/exams/exam.routes.js';
import { MongoExamRepository } from './modules/exams/exam.repository.js';
import { ExamService } from './modules/exams/exam.service.js';
import { habitsRoutes } from './modules/habits/habits.routes.js';
import { MongoHabitsRepository } from './modules/habits/habits.repository.js';
import { HabitsService } from './modules/habits/habits.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { homeworkRoutes } from './modules/homework/homework.routes.js';
import { MongoHomeworkRepository } from './modules/homework/homework.repository.js';
import { HomeworkService } from './modules/homework/homework.service.js';
import { planRoutes } from './modules/planner/plan.routes.js';
import { PlanService } from './modules/planner/plan.service.js';
import { SchedulingService } from './modules/planner/scheduling.service.js';
import { StudentContext } from './modules/planner/student-context.js';
import { OnboardingService } from './modules/profile/onboarding.service.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { MongoProfileRepository } from './modules/profile/profile.repository.js';
import { ProfileService } from './modules/profile/profile.service.js';
import { suggestionRoutes } from './modules/suggestions/suggestion.routes.js';
import { MongoSuggestionRepository } from './modules/suggestions/suggestion.repository.js';
import { SuggestionService } from './modules/suggestions/suggestion.service.js';
import { syllabusRoutes } from './modules/syllabus/syllabus.routes.js';
import { taskRoutes } from './modules/tasks/task.routes.js';
import { MongoTaskRepository } from './modules/tasks/task.repository.js';
import { TaskService } from './modules/tasks/task.service.js';
import { MongoUserRepository } from './modules/users/user.repository.js';

export interface ContainerOptions {
  config: AppConfig;
  logger: Logger;
  redis?: Redis;
  clock?: Clock;
  passwordHasher?: PasswordHasher;
  startedAt?: Date;
  /** Reports whether a graceful shutdown has begun (readiness then fails). */
  isShuttingDown?: () => boolean;
}

export interface Container {
  routes: Route[];
  rateLimiters: RateLimiters;
  authenticate: ReturnType<typeof createAuthenticate>;
}

/** Composition root: the only place that knows concrete implementations. */
export function buildContainer(options: ContainerOptions): Container {
  const { config, logger, redis } = options;
  const clock = options.clock ?? systemClock;
  const transactions = mongoTransactionRunner;

  const users = new MongoUserRepository();
  const refreshTokens = new MongoRefreshTokenRepository();
  const auditLogs = new MongoAuditRepository();
  const profiles = new MongoProfileRepository();
  const chapters = new MongoChapterRepository();
  const exams = new MongoExamRepository();
  const homework = new MongoHomeworkRepository();
  const tasks = new MongoTaskRepository();
  const suggestions = new MongoSuggestionRepository();
  const habits = new MongoHabitsRepository();

  const audit = new AuditService(auditLogs, logger);
  const tokens = new TokenService({
    secret: config.JWT_ACCESS_SECRET,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  });
  const passwords = options.passwordHasher ?? new Argon2PasswordHasher();
  const auth = new AuthService(users, refreshTokens, profiles, passwords, tokens, audit, clock, {
    accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    reuseGraceSeconds: config.REFRESH_REUSE_GRACE_SECONDS,
  });

  const context = new StudentContext(profiles, clock);
  const scheduling = new SchedulingService(tasks, homework, exams, chapters);
  const profileService = new ProfileService(profiles, users, context);
  const onboarding = new OnboardingService(
    transactions,
    context,
    profileService,
    profiles,
    chapters,
    exams,
    homework,
    tasks,
    suggestions,
    habits,
    scheduling,
    audit,
  );
  const accounts = new AccountService(
    users,
    refreshTokens,
    passwords,
    onboarding,
    transactions,
    audit,
  );
  const plan = new PlanService(context, tasks, exams, scheduling);
  const chapterService = new ChapterService(context, chapters, tasks, exams);
  const taskService = new TaskService(context, tasks, homework, chapters, suggestions);
  const suggestionService = new SuggestionService(context, suggestions, tasks, transactions);
  const examService = new ExamService(context, exams, chapters);
  const homeworkService = new HomeworkService(context, homework, tasks, transactions);
  const habitsService = new HabitsService(context, habits, tasks, homework);
  const dashboard = new DashboardService(
    context,
    tasks,
    exams,
    examService,
    habits,
    suggestions,
    suggestionService,
    chapterService,
    users,
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
    ...authRoutes(auth, accounts, rateLimiters.auth),
    ...syllabusRoutes(),
    ...profileRoutes(profileService, onboarding),
    ...dashboardRoutes(dashboard),
    ...planRoutes(plan),
    ...chapterRoutes(chapterService),
    ...taskRoutes(taskService),
    ...suggestionRoutes(suggestionService),
    ...examRoutes(examService),
    ...homeworkRoutes(homeworkService),
    ...habitsRoutes(habitsService),
    ...adminRoutes(users, auditLogs, audit),
  ];

  return { routes, rateLimiters, authenticate: createAuthenticate(tokens) };
}
