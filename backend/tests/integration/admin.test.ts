import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { as, PASSWORD, register, useTestApp } from '../helpers/app.js';

const ctx = useTestApp('admin');

/** Promotes directly in the database (as `npm run create-admin` does), then signs in again for an admin token. */
async function admin() {
  const session = await register(ctx.app, 'Admin');
  await mongoose.connection
    .collection('users')
    .updateOne({ _id: new mongoose.Types.ObjectId(session.userId) }, { $set: { role: 'admin' } });
  const login = await request(ctx.app)
    .post('/api/v1/auth/login')
    .send({ email: session.email, password: PASSWORD })
    .expect(200);
  return { ...session, user: as(ctx.app, login.body.data.tokens.accessToken as string) };
}

describe('admin', () => {
  it('is closed to students', async () => {
    const student = await register(ctx.app);
    const response = await as(ctx.app, student.accessToken).get('/admin/users').expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('lists accounts with paging, filtering and sorting', async () => {
    const boss = await admin();
    await register(ctx.app);
    await register(ctx.app);
    const page = await boss.user.get('/admin/users?limit=2&sort=email').expect(200);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, hasNext: true });
    const admins = await boss.user.get('/admin/users?role=admin').expect(200);
    expect(admins.body.data).toHaveLength(1);
    await boss.user.get('/admin/users?sort=password').expect(400);
  });

  it('changes another account’s role and records it, but never its own', async () => {
    const boss = await admin();
    const student = await register(ctx.app);
    const promoted = await boss.user
      .patch(`/admin/users/${student.userId}/role`, { role: 'admin' })
      .expect(200);
    expect(promoted.body.data.role).toBe('admin');

    const own = await boss.user
      .patch(`/admin/users/${boss.userId}/role`, { role: 'student' })
      .expect(409);
    expect(own.body.error.code).toBe('OWN_ROLE');
    await boss.user
      .patch(`/admin/users/${new mongoose.Types.ObjectId().toHexString()}/role`, { role: 'admin' })
      .expect(404);

    const audit = await boss.user.get('/admin/audit-logs?action=admin.role_changed').expect(200);
    expect(audit.body.data[0]).toMatchObject({
      userId: boss.userId,
      meta: { target: student.userId, role: 'admin' },
    });
  });

  it('keeps the last admin from deleting their account', async () => {
    const boss = await admin();
    const response = await boss.user.delete('/auth/account', { password: PASSWORD }).expect(409);
    expect(response.body.error.code).toBe('LAST_ADMIN');
  });

  it('records failed sign-ins in the audit trail', async () => {
    const boss = await admin();
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.test', password: 'nope-nope-1' })
      .expect(401);
    const audit = await boss.user.get('/admin/audit-logs?action=auth.login_failed').expect(200);
    expect(audit.body.data[0]).toMatchObject({ userId: null, meta: { reason: 'unknown_email' } });
    expect(JSON.stringify(audit.body)).not.toContain('nope-nope-1');
  });
});
