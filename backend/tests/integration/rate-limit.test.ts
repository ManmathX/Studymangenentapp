import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/app.js';

const ctx = useTestApp('ratelimit', {
  RATE_LIMIT_ENABLED: 'true',
  RATE_LIMIT_AUTH_MAX: '3',
  RATE_LIMIT_GLOBAL_PER_MINUTE: '10',
  API_DOCS_ENABLED: 'false',
});

describe('rate limits', () => {
  it('throttles repeated sign-in attempts with the error envelope', async () => {
    const attempt = () =>
      request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: 'a@example.test', password: 'whatever-1' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const limited = await attempt().expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit-policy']).toBeDefined();
  });

  it('never throttles health probes', async () => {
    for (let i = 0; i < 15; i += 1) await request(ctx.app).get('/api/v1/health').expect(200);
  });

  it('hides API docs when they are disabled', async () => {
    await request(ctx.app).get('/docs/openapi.json').expect(404);
  });
});
