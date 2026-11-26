import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Mailer, MailMessage } from '../../src/modules/auth/mailer.js';
import { NOW, PASSWORD, register, useTestApp } from '../helpers/app.js';

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send: (message) => {
    sent.push(message);
    return Promise.resolve();
  },
};
const ctx = useTestApp('password_reset', {}, { mailer });

const NEW_PASSWORD = 'brand-new-pass-7';
const forgot = (email: string) =>
  request(ctx.app).post('/api/v1/auth/password/forgot').send({ email });
const reset = (email: string, code: string, newPassword = NEW_PASSWORD) =>
  request(ctx.app).post('/api/v1/auth/password/reset').send({ email, code, newPassword });
const login = (email: string, password: string) =>
  request(ctx.app).post('/api/v1/auth/login').send({ email, password });
const codeIn = (message: MailMessage | undefined) =>
  /\b(\d{6})\b/.exec(message?.text ?? '')?.[1] ?? '';
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const later = (ms: number) => ctx.clock.set(new Date(NOW.getTime() + ms));

beforeEach(() => {
  sent.length = 0;
});

describe('forgot password', () => {
  it('emails a code that sets a new password and signs out every device', async () => {
    const student = await register(ctx.app);
    await forgot(student.email).expect(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: student.email,
      subject: expect.stringContaining('reset code'),
    });
    const code = codeIn(sent[0]);
    expect(code).toMatch(/^\d{6}$/);

    const bad = await reset(student.email, wrong(code)).expect(400);
    expect(bad.body.error.code).toBe('RESET_CODE_INVALID');
    await reset(student.email, code).expect(204);

    await login(student.email, PASSWORD).expect(401);
    await login(student.email, NEW_PASSWORD).expect(200);
    await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: student.refreshToken })
      .expect(401);
    // A code works once.
    await reset(student.email, code, 'another-pass-8').expect(400);

    const actions = await mongoose.connection
      .collection('auditlogs')
      .find({ userId: new mongoose.Types.ObjectId(student.userId) })
      .map((entry) => entry.action as string)
      .toArray();
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.password_reset_requested',
        'auth.password_reset_failed',
        'auth.password_reset',
      ]),
    );
  });

  it('answers the same for an email with no account, and sends nothing', async () => {
    await forgot('nobody@example.test').expect(204);
    expect(sent).toHaveLength(0);
    const response = await reset('nobody@example.test', '123456').expect(400);
    expect(response.body.error.code).toBe('RESET_CODE_INVALID');
  });

  it('stops a code after five wrong tries', async () => {
    const student = await register(ctx.app);
    await forgot(student.email).expect(204);
    const code = codeIn(sent[0]);
    for (let attempt = 0; attempt < 5; attempt += 1)
      await reset(student.email, wrong(code)).expect(400);
    await reset(student.email, code).expect(400);
    await login(student.email, PASSWORD).expect(200);
  });

  it('lets a code expire', async () => {
    const student = await register(ctx.app);
    await forgot(student.email).expect(204);
    later(16 * 60_000);
    await reset(student.email, codeIn(sent[0])).expect(400);
  });

  it('emails at most one code a minute, and a new code replaces the old one', async () => {
    const student = await register(ctx.app);
    await forgot(student.email).expect(204);
    await forgot(student.email).expect(204);
    expect(sent).toHaveLength(1);

    later(61_000);
    await forgot(student.email).expect(204);
    expect(sent).toHaveLength(2);
    const [first, second] = sent.map(codeIn);
    if (first !== second) await reset(student.email, first ?? '').expect(400);
    await reset(student.email, second ?? '').expect(204);
  });

  it('checks the request', async () => {
    const student = await register(ctx.app);
    const cases: [object, string][] = [
      [{ email: 'not-an-email' }, '/auth/password/forgot'],
      [{ email: student.email, code: '12345', newPassword: NEW_PASSWORD }, '/auth/password/reset'],
      [{ email: student.email, code: '123456', newPassword: 'short' }, '/auth/password/reset'],
    ];
    for (const [body, path] of cases) {
      const response = await request(ctx.app).post(`/api/v1${path}`).send(body);
      expect({ path, status: response.status, code: response.body.error?.code }).toEqual({
        path,
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  });
});
