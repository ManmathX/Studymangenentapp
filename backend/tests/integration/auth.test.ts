import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  as,
  onboardedStudent,
  PASSWORD,
  register,
  testConfig,
  useTestApp,
} from '../helpers/app.js';

const ctx = useTestApp('auth');

const login = (email: string, password = PASSWORD) =>
  request(ctx.app).post('/api/v1/auth/login').send({ email, password });
const refresh = (refreshToken: string) =>
  request(ctx.app).post('/api/v1/auth/refresh').send({ refreshToken });

describe('registration', () => {
  it('creates a student account and returns a session', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: '  Asha ', email: 'Asha@Example.TEST', password: PASSWORD })
      .expect(201);
    const { user, tokens, onboarded } = response.body.data;
    expect(user).toMatchObject({ name: 'Asha', email: 'asha@example.test', role: 'student' });
    expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(onboarded).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('refuses a second account with the same email', async () => {
    const { email } = await register(ctx.app);
    const response = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Copy', email: email.toUpperCase(), password: PASSWORD })
      .expect(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('explains every invalid field', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
    const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['body.name', 'body.email', 'body.password']));
  });

  it('rejects unknown fields such as a self-assigned role', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Eve', email: 'eve@example.test', password: PASSWORD, role: 'admin' })
      .expect(400);
  });
});

describe('sign-in and sessions', () => {
  it('signs in with the right password only', async () => {
    const { email } = await register(ctx.app);
    const wrong = await login(email, 'wrong-password-1').expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await login('nobody@example.test').expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    const ok = await login(email).expect(200);
    expect(ok.body.data.user.lastLoginAt).toEqual(expect.any(String));
  });

  it('blocks NoSQL operators in credentials', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: { $gt: '' }, password: 'x' })
      .expect(400);
  });

  it('requires a valid bearer token on protected routes', async () => {
    const missing = await request(ctx.app).get('/api/v1/auth/me').expect(401);
    expect(missing.body.error.code).toBe('TOKEN_MISSING');
    const invalid = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
      .expect(401);
    expect(invalid.body.error.code).toBe('TOKEN_INVALID');
  });

  it('tells clients when an access token has expired', async () => {
    const session = await register(ctx.app);
    const config = testConfig();
    const expired = jwt.sign(
      { role: 'student', exp: Math.floor(Date.now() / 1000) - 60 },
      config.JWT_ACCESS_SECRET,
      { subject: session.userId, issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE },
    );
    const response = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects tokens signed with another secret or algorithm', async () => {
    const session = await register(ctx.app);
    const config = testConfig();
    const claims = {
      subject: session.userId,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    };
    const forged = jwt.sign({ role: 'admin' }, 'a-different-secret-that-is-long-enough!!', claims);
    await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
    const unsigned = jwt.sign({ role: 'admin' }, '', { ...claims, algorithm: 'none' });
    await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${unsigned}`)
      .expect(401);
  });

  it('reports onboarding state on /me', async () => {
    const fresh = await register(ctx.app);
    const me = await as(ctx.app, fresh.accessToken).get('/auth/me').expect(200);
    expect(me.body.data.onboarded).toBe(false);
    const done = await onboardedStudent(ctx.app);
    const meAfter = await as(ctx.app, done.accessToken).get('/auth/me').expect(200);
    expect(meAfter.body.data.onboarded).toBe(true);
  });
});

describe('refresh token rotation', () => {
  it('rotates on every use and detects reuse of a rotated token', async () => {
    const session = await register(ctx.app);
    const first = await refresh(session.refreshToken).expect(200);
    const next = first.body.data.refreshToken as string;
    expect(next).not.toBe(session.refreshToken);

    // Inside the grace window a replay is refused without punishing the family.
    await refresh(session.refreshToken).expect(401);
    await refresh(next).expect(200);
  });

  it('revokes the whole family when an old token is replayed after the grace window', async () => {
    const session = await register(ctx.app);
    const first = await refresh(session.refreshToken).expect(200);
    ctx.clock.set(new Date(ctx.clock.now().getTime() + 60_000));
    const replay = await refresh(session.refreshToken).expect(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');
    const victim = await refresh(first.body.data.refreshToken).expect(401);
    expect(victim.body.error.code).toBe('REFRESH_REUSED');
  });

  it('rejects unknown and expired refresh tokens', async () => {
    await refresh('x'.repeat(43)).expect(401);
    const session = await register(ctx.app);
    ctx.clock.set(new Date(ctx.clock.now().getTime() + 31 * 86_400_000));
    const expired = await refresh(session.refreshToken).expect(401);
    expect(expired.body.error.code).toBe('REFRESH_EXPIRED');
  });

  it('logs out by revoking the device’s token family', async () => {
    const session = await register(ctx.app);
    await as(ctx.app, session.accessToken)
      .post('/auth/logout', { refreshToken: session.refreshToken })
      .expect(204);
    await refresh(session.refreshToken).expect(401);
  });
});

describe('change password', () => {
  it('needs the current password', async () => {
    const session = await register(ctx.app);
    const response = await as(ctx.app, session.accessToken)
      .post('/auth/password', { currentPassword: 'wrong-pass-1', newPassword: 'brand-new-pass-2' })
      .expect(400);
    expect(response.body.error.code).toBe('WRONG_PASSWORD');
    expect(response.body.error.details[0].path).toBe('body.currentPassword');
  });

  it('refuses a weak or unchanged new password', async () => {
    const session = await register(ctx.app);
    await as(ctx.app, session.accessToken)
      .post('/auth/password', { currentPassword: PASSWORD, newPassword: 'short' })
      .expect(400);
    await as(ctx.app, session.accessToken)
      .post('/auth/password', { currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(400);
  });

  it('switches passwords, signs out other devices and keeps this one signed in', async () => {
    const session = await register(ctx.app);
    const otherDevice = await login(session.email).expect(200);
    const response = await as(ctx.app, session.accessToken)
      .post('/auth/password', { currentPassword: PASSWORD, newPassword: 'brand-new-pass-2' })
      .expect(200);

    await refresh(otherDevice.body.data.tokens.refreshToken).expect(401);
    await refresh(session.refreshToken).expect(401);
    await refresh(response.body.data.refreshToken).expect(200);
    await login(session.email).expect(401);
    await login(session.email, 'brand-new-pass-2').expect(200);
  });
});

describe('delete account', () => {
  it('needs the password', async () => {
    const session = await register(ctx.app);
    const response = await as(ctx.app, session.accessToken)
      .delete('/auth/account', { password: 'wrong-pass-1' })
      .expect(400);
    expect(response.body.error.code).toBe('WRONG_PASSWORD');
  });

  it('removes the login, sessions and every planner record', async () => {
    const session = await onboardedStudent(ctx.app);
    const user = as(ctx.app, session.accessToken);
    await user
      .post('/homework', {
        subject: 'maths',
        title: 'Ex 1.1',
        due: '2026-11-20',
        mins: 30,
        difficulty: 2,
      })
      .expect(201);
    await user.post('/focus-sessions', { subject: 'maths', mins: 25 }).expect(201);

    await user.delete('/auth/account', { password: PASSWORD }).expect(204);

    await login(session.email).expect(401);
    await refresh(session.refreshToken).expect(401);
    const owner = new mongoose.Types.ObjectId(session.userId);
    for (const name of [
      'users',
      'refreshtokens',
      'profiles',
      'chapters',
      'exams',
      'tasks',
      'homework',
      'focussessions',
      'dailylogs',
      'suggestions',
    ]) {
      const filter = name === 'users' ? { _id: owner } : { userId: owner };
      const count = await mongoose.connection.collection(name).countDocuments(filter);
      expect({ name, count }).toEqual({ name, count: 0 });
    }
    const audit = await mongoose.connection
      .collection('auditlogs')
      .findOne({ action: 'auth.account_deleted', userId: owner });
    expect(audit).not.toBeNull();
  });

  it('lets the same email register again afterwards', async () => {
    const session = await register(ctx.app);
    await as(ctx.app, session.accessToken)
      .delete('/auth/account', { password: PASSWORD })
      .expect(204);
    await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Again', email: session.email, password: PASSWORD })
      .expect(201);
  });
});
