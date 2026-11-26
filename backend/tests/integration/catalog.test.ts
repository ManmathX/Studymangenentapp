import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';
import type { GoogleIdTokenVerifier } from '../../src/modules/auth/google.service.js';
import { as, PASSWORD, register, useTestApp } from '../helpers/app.js';

/** Accepts tokens shaped `good:<sub>:<email>[:unverified]`, rejects everything else. */
const fakeGoogle: GoogleIdTokenVerifier = {
  verify: (idToken) => {
    const [kind, googleId, email, flag] = idToken.split(':');
    if (kind !== 'good' || !googleId || !email)
      return Promise.reject(new UnauthorizedError('Google sign-in failed', 'GOOGLE_TOKEN_INVALID'));
    return Promise.resolve({
      googleId,
      email,
      emailVerified: flag !== 'unverified',
      name: 'Google Student',
    });
  },
};

const ctx = useTestApp('catalog', {}, { googleVerifier: fakeGoogle });

async function admin() {
  const session = await register(ctx.app, 'Admin');
  await mongoose.connection
    .collection('users')
    .updateOne({ _id: new mongoose.Types.ObjectId(session.userId) }, { $set: { role: 'admin' } });
  const login = await request(ctx.app)
    .post('/api/v1/auth/login')
    .send({ email: session.email, password: PASSWORD })
    .expect(200);
  return as(ctx.app, login.body.data.tokens.accessToken as string);
}

describe('syllabus catalogue', () => {
  it('starts with CBSE and ICSE loaded for classes 6 to 12', async () => {
    const { accessToken } = await register(ctx.app);
    const user = as(ctx.app, accessToken);
    const boards = await user.get('/syllabus/boards').expect(200);
    expect(boards.body.data.map((board: { code: string }) => board.code)).toEqual(['cbse', 'icse']);

    for (const board of ['cbse', 'icse']) {
      const classes = await user.get(`/syllabus/classes?board=${board}`).expect(200);
      expect(classes.body.data.every((row: { available: boolean }) => row.available)).toBe(true);
    }
    const icse10 = await user.get('/syllabus/10?board=icse').expect(200);
    expect(icse10.body.data.map((subject: { id: string }) => subject.id)).toContain('physics');
    const cbse12 = await user.get('/syllabus/12?board=cbse').expect(200);
    expect(cbse12.body.data[0]).toMatchObject({ id: 'physics', name: 'Physics' });
    expect(cbse12.body.data[0].chapters[0]).toMatchObject({
      key: 'physics-1',
      name: 'Electric Charges and Fields',
      book: 'Physics – Part 1',
    });
    await user.get('/syllabus/classes?board=nowhere').expect(404);
  });

  it('loads the standard syllabus into an existing catalogue without touching edits', async () => {
    const boss = await admin();
    const subjects = await boss.get('/admin/syllabus/boards/icse/classes/7/subjects').expect(200);
    const maths = subjects.body.data.find((s: { subjectId: string }) => s.subjectId === 'maths');
    await boss.patch(`/admin/syllabus/subjects/${maths.id}`, { name: 'Mathematics' }).expect(200);
    const physics = subjects.body.data.find(
      (s: { subjectId: string }) => s.subjectId === 'physics',
    );
    await boss.delete(`/admin/syllabus/subjects/${physics.id}`).expect(204);

    // An older catalogue: CBSE class 7 maths without book names and missing Part 2.
    const cbse7 = await boss.get('/admin/syllabus/boards/cbse/classes/7/subjects').expect(200);
    const cbseMaths = cbse7.body.data.find((s: { subjectId: string }) => s.subjectId === 'maths');
    await boss
      .patch(`/admin/syllabus/subjects/${cbseMaths.id}`, {
        chapters: [
          { name: 'My own revision chapter' },
          { name: 'Large Numbers Around Us', difficulty: 3 },
        ],
      })
      .expect(200);

    const loaded = await boss.post('/admin/syllabus/standard', {}).expect(200);
    expect(loaded.body.data).toEqual({ added: 1, updated: 1 });
    const merged = (
      await boss.get('/admin/syllabus/boards/cbse/classes/7/subjects').expect(200)
    ).body.data.find((s: { subjectId: string }) => s.subjectId === 'maths').chapters;
    expect(merged).toHaveLength(16);
    expect(merged[0]).toEqual({
      name: 'Large Numbers Around Us',
      difficulty: 3,
      book: 'Ganita Prakash – Part 1',
    });
    expect(merged[8]).toMatchObject({ name: 'Geometric Twins', book: 'Ganita Prakash – Part 2' });
    expect(merged[15]).toEqual({ name: 'My own revision chapter', difficulty: 2 });
    const after = await boss.get('/admin/syllabus/boards/icse/classes/7/subjects').expect(200);
    expect(after.body.data.map((s: { name: string }) => s.name)).toContain('Mathematics');
    expect(after.body.data.map((s: { subjectId: string }) => s.subjectId)).toContain('physics');

    const again = await boss.post('/admin/syllabus/standard', {}).expect(200);
    expect(again.body.data).toEqual({ added: 0, updated: 0 });
  });

  it('counts the seeded classes on the very first admin request', async () => {
    const boss = await admin();
    const overview = await boss.get('/admin/syllabus/boards').expect(200);
    expect(overview.body.data[0]).toMatchObject({ code: 'cbse' });
    expect(overview.body.data[0].classes).toContainEqual({ cls: 9, subjects: 5 });
  });

  it('lets an admin build a state board class that students can then pick', async () => {
    const boss = await admin();
    const { accessToken } = await register(ctx.app);
    const student = as(ctx.app, accessToken);
    await student.post('/admin/syllabus/boards', { name: 'X', kind: 'state' }).expect(403);

    const board = await boss
      .post('/admin/syllabus/boards', { name: 'Odisha Board', kind: 'state' })
      .expect(201);
    expect(board.body.data).toMatchObject({ code: 'odisha-board', kind: 'state' });

    const odia = await boss
      .post('/admin/syllabus/boards/odisha-board/classes/8/subjects', {
        name: 'Odia',
        chapters: [{ name: 'Bande Utkala Janani' }, { name: 'Utkala Gaurab', difficulty: 3 }],
      })
      .expect(201);
    expect(odia.body.data).toMatchObject({ subjectId: 'odia', position: 0, cls: 8 });
    await boss
      .post('/admin/syllabus/boards/odisha-board/classes/8/subjects', { name: 'odia' })
      .expect(409);
    await boss
      .post('/admin/syllabus/boards/odisha-board/classes/8/subjects', {
        subjectId: 'custom1',
        name: 'Sneaky',
      })
      .expect(409);

    // Copy CBSE class 9 maths & co. in, then rename one and reorder.
    const copied = await boss
      .post('/admin/syllabus/boards/odisha-board/classes/8/copy', { fromBoard: 'cbse', fromCls: 9 })
      .expect(200);
    expect(copied.body.data.added).toBe(5);
    const maths = copied.body.data.subjects.find(
      (s: { subjectId: string }) => s.subjectId === 'maths',
    );
    await boss.patch(`/admin/syllabus/subjects/${maths.id}`, { name: 'Mathematics' }).expect(200);
    const reordered = await boss
      .put('/admin/syllabus/boards/odisha-board/classes/8/order', { subjectIds: ['maths', 'odia'] })
      .expect(200);
    expect(reordered.body.data.slice(0, 2).map((s: { name: string }) => s.name)).toEqual([
      'Mathematics',
      'Odia',
    ]);

    const overview = await boss.get('/admin/syllabus/boards').expect(200);
    const odisha = overview.body.data.find((b: { code: string }) => b.code === 'odisha-board');
    expect(odisha.classes).toContainEqual({ cls: 8, subjects: 6 });

    const classes = await student.get('/syllabus/classes?board=odisha-board').expect(200);
    expect(classes.body.data).toContainEqual({ cls: 8, available: true });

    // The app downloads this at setup and keeps the student's copy on the phone.
    const syllabus = await student.get('/syllabus/8?board=odisha-board').expect(200);
    expect(
      syllabus.body.data.slice(0, 2).map((subject: { id: string; name: string }) => subject.id),
    ).toEqual(['maths', 'odia']);
    expect(syllabus.body.data[1]).toMatchObject({
      id: 'odia',
      name: 'Odia',
      chapters: [
        { key: 'odia-1', name: 'Bande Utkala Janani' },
        { key: 'odia-2', name: 'Utkala Gaurab', difficulty: 3 },
      ],
    });

    await boss.delete('/admin/syllabus/boards/odisha-board').expect(204);
    await student.get('/syllabus/classes?board=odisha-board').expect(404);
  });
});

describe('Google sign-in', () => {
  const google = (idToken: string) =>
    request(ctx.app).post('/api/v1/auth/google').send({ idToken });

  it('creates a student on first sign-in and finds them again after', async () => {
    const first = await google('good:sub-1:new.student@gmail.test').expect(200);
    expect(first.body.data).toMatchObject({
      user: { email: 'new.student@gmail.test', name: 'Google Student', hasPassword: false },
    });
    const again = await google('good:sub-1:new.student@gmail.test').expect(200);
    expect(again.body.data.user.id).toBe(first.body.data.user.id);

    // No password: email login fails, deleting the account needs no password.
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'new.student@gmail.test', password: PASSWORD })
      .expect(401);
    const user = as(ctx.app, again.body.data.tokens.accessToken as string);
    const change = await user
      .post('/auth/password', { currentPassword: 'whatever1', newPassword: 'brand-new-1' })
      .expect(400);
    expect(change.body.error.code).toBe('NO_PASSWORD');
    await user.delete('/auth/account', {}).expect(204);
  });

  it('links to an existing email account', async () => {
    const existing = await register(ctx.app);
    const linked = await google(`good:sub-2:${existing.email}`).expect(200);
    expect(linked.body.data).toMatchObject({
      user: { id: existing.userId, hasPassword: true },
    });
    // The password still works, and the account still needs it to be deleted.
    const user = as(ctx.app, linked.body.data.tokens.accessToken as string);
    await user.delete('/auth/account', {}).expect(400);
  });

  it('refuses bad or unverified tokens', async () => {
    expect((await google('forged-token-forged-token').expect(401)).body.error.code).toBe(
      'GOOGLE_TOKEN_INVALID',
    );
    expect(
      (await google('good:sub-3:someone@gmail.test:unverified').expect(401)).body.error.code,
    ).toBe('GOOGLE_EMAIL_UNVERIFIED');
  });
});
