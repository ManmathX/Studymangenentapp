import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createApp } from '../../src/app.js';
import { FixedClock } from '../../src/common/utils/clock.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { buildContainer, type ContainerOptions } from '../../src/container.js';
import { connectMongo, disconnectMongo } from '../../src/database/mongoose.js';
import type { PasswordHasher } from '../../src/modules/auth/password.service.js';

/** A fixed "now" so token expiry and audit times are predictable. */
export const NOW = new Date('2026-11-18T06:00:00.000Z');
export const PASSWORD = 'correct-horse-9';

/** Argon2 is exercised in its own unit test; integration tests use a fast stand-in. */
export const fastHasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`plain:${password}`),
  verify: (hash, password) => Promise.resolve(hash === `plain:${password}`),
  verifyAgainstDummy: () => Promise.resolve(false),
};

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://set-by-tests',
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides,
  });
}

export interface TestApp {
  app: Express;
  clock: FixedClock;
}

function uriWithDatabase(uri: string, database: string): string {
  const url = new URL(uri);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Gives a test file its own database, a fresh app per file, and empty collections
 * before every test. Call once at the top level of a test file.
 */
export function useTestApp(
  name: string,
  configOverrides: Record<string, string> = {},
  containerOverrides: Partial<Pick<ContainerOptions, 'googleVerifier' | 'mailer'>> = {},
): TestApp {
  const holder = {} as TestApp;
  const config = testConfig(configOverrides);
  const logger = createLogger(config);

  beforeAll(async () => {
    await connectMongo(
      { uri: uriWithDatabase(inject('mongoUri'), `test_${name}`), maxPoolSize: 5, autoIndex: true },
      logger,
    );
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
    holder.clock = new FixedClock(NOW);
    holder.app = createApp(
      config,
      logger,
      buildContainer({
        config,
        logger,
        clock: holder.clock,
        passwordHasher: fastHasher,
        ...containerOverrides,
      }),
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  });

  return holder;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

let emailCounter = 0;

export async function register(app: Express, name = 'Asha'): Promise<Session & { email: string }> {
  emailCounter += 1;
  const email = `student${emailCounter}@example.test`;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email, password: PASSWORD })
    .expect(201);
  const data = response.body.data as {
    user: { id: string };
    tokens: { accessToken: string; refreshToken: string };
  };
  return { email, userId: data.user.id, ...data.tokens };
}

/** Supertest bound to one user's access token. */
export function as(app: Express, token: string) {
  const auth = (test: request.Test) => test.set('Authorization', `Bearer ${token}`);
  return {
    get: (path: string) => auth(request(app).get(`/api/v1${path}`)),
    post: (path: string, body?: object) => auth(request(app).post(`/api/v1${path}`)).send(body),
    put: (path: string, body?: object) => auth(request(app).put(`/api/v1${path}`)).send(body),
    patch: (path: string, body?: object) => auth(request(app).patch(`/api/v1${path}`)).send(body),
    delete: (path: string, body?: object) => auth(request(app).delete(`/api/v1${path}`)).send(body),
  };
}

/** An account with `role` (set in the database, as `npm run create-admin` does), signed in. */
export async function staff(app: Express, role: 'admin' | 'editor', name = 'Staff') {
  const session = await register(app, name);
  await mongoose.connection
    .collection('users')
    .updateOne({ _id: new mongoose.Types.ObjectId(session.userId) }, { $set: { role } });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: session.email, password: PASSWORD })
    .expect(200);
  return {
    ...session,
    user: login.body.data.user as { role: string; permissions: string[] },
    api: as(app, login.body.data.tokens.accessToken as string),
  };
}
