import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(20),
  REDIS_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined)),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1).default('study-planner-api'),
  JWT_AUDIENCE: z.string().min(1).default('study-planner-app'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8081')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  /**
   * OAuth client IDs whose Google ID tokens are accepted (comma-separated). Use the *web*
   * client ID the app passes to GoogleSignin.configure(); add the iOS client ID if iOS signs
   * in with its own. Empty turns Google sign-in off.
   */
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  /**
   * Email for "forgot password" codes, as an SMTP URL such as
   * smtps://user:password@smtp.example.com:465. Empty turns password reset off.
   */
  SMTP_URL: z.string().default(''),
  /** Sender shown on those emails, e.g. "Study Planner <no-reply@example.com>". Needed with SMTP_URL. */
  MAIL_FROM: z.string().default(''),
  PASSWORD_RESET_CODE_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  RATE_LIMIT_ENABLED: booleanFromString.default(true),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).max(10_000).default(20),
  RATE_LIMIT_AUTH_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** Serves Swagger UI at /docs. Defaults to on, except in production. */
  API_DOCS_ENABLED: booleanFromString.optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;
export type AppConfig = Omit<ParsedEnv, 'API_DOCS_ENABLED'> & { API_DOCS_ENABLED: boolean };

/** The placeholder from .env.example. It must never sign real tokens. */
const EXAMPLE_JWT_SECRET = 'replace-with-at-least-32-random-characters';

/**
 * Parses and validates configuration from an environment-like object.
 * Fails fast with a readable message listing every invalid variable.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  const deployed = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  if (env.SMTP_URL && !/^smtps?:\/\//.test(env.SMTP_URL)) {
    throw new Error('SMTP_URL must start with smtp:// or smtps://');
  }
  if (env.SMTP_URL && !env.MAIL_FROM) {
    throw new Error('MAIL_FROM is required when SMTP_URL is set');
  }
  if (deployed && env.JWT_ACCESS_SECRET === EXAMPLE_JWT_SECRET) {
    throw new Error(
      `JWT_ACCESS_SECRET is still the example value; generate a real secret for ${env.NODE_ENV}`,
    );
  }
  return { ...env, API_DOCS_ENABLED: env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production' };
}

/** Loads a local .env file when present (development convenience only). */
export function loadDotEnvIfPresent(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
