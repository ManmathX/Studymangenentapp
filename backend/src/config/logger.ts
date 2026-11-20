import { pino, type Logger } from 'pino';
import type { AppConfig } from './env.js';

/** Fields that must never reach log output. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.tokenHash',
];

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  const pretty = config.NODE_ENV === 'development';
  return pino({
    level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    base: { service: 'study-planner-api', env: config.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
      : {}),
  });
}
