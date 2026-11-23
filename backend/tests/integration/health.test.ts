import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/app.js';

const ctx = useTestApp('health');

describe('health and platform', () => {
  it('reports liveness', async () => {
    const response = await request(ctx.app).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('reports readiness with the database reachable', async () => {
    const response = await request(ctx.app).get('/api/v1/health/ready').expect(200);
    expect(response.body.data).toEqual({ status: 'ready', mongo: 'ok', redis: 'disabled' });
  });

  it('echoes a well-formed request id and makes one up otherwise', async () => {
    const echoed = await request(ctx.app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'client-req-123');
    expect(echoed.headers['x-request-id']).toBe('client-req-123');
    const made = await request(ctx.app).get('/api/v1/health').set('X-Request-Id', 'bad id!');
    expect(made.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await request(ctx.app).get('/api/v1/nope').expect(404);
    expect(response.body).toMatchObject({ success: false, error: { code: 'ROUTE_NOT_FOUND' } });
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });

  it('rejects malformed JSON with a 400', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(response.body.error.code).toBe('MALFORMED_JSON');
  });

  it('sets security headers and hides the framework', async () => {
    const response = await request(ctx.app).get('/api/v1/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });

  it('serves the OpenAPI document when docs are enabled', async () => {
    const response = await request(ctx.app).get('/docs/openapi.json').expect(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(Object.keys(response.body.paths)).toContain('/api/v1/auth/account');
  });
});
