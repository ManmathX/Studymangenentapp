import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { Argon2PasswordHasher } from '../../src/modules/auth/password.service.js';

const base = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a-real-secret-that-is-at-least-32-chars',
};

describe('configuration', () => {
  it('applies defaults and parses lists and booleans', () => {
    const config = loadConfig({
      ...base,
      CORS_ORIGINS: 'https://a.example, https://b.example',
      RATE_LIMIT_ENABLED: '0',
    });
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      RATE_LIMIT_ENABLED: false,
      API_DOCS_ENABLED: true,
    });
    expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('lists every invalid variable at once', () => {
    expect(() => loadConfig({ JWT_ACCESS_SECRET: 'short', PORT: 'abc' })).toThrow(
      /MONGODB_URI[\s\S]*PORT|PORT[\s\S]*MONGODB_URI/,
    );
  });

  it('applies production safety rules', () => {
    const production = { ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example' };
    expect(loadConfig(production).API_DOCS_ENABLED).toBe(false);
    expect(loadConfig({ ...production, API_DOCS_ENABLED: 'true' }).API_DOCS_ENABLED).toBe(true);
    expect(() => loadConfig({ ...production, CORS_ORIGINS: '*' })).toThrow(/explicit origins/);
    expect(() =>
      loadConfig({
        ...production,
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow(/example value/);
  });
});

describe('password hashing', () => {
  it('hashes with argon2id and verifies only the right password', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('correct-horse-9');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'correct-horse-9')).toBe(true);
    expect(await hasher.verify(hash, 'wrong-horse-9')).toBe(false);
    expect(await hasher.verifyAgainstDummy('anything')).toBe(false);
  });
});
