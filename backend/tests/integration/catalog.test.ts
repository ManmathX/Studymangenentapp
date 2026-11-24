import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';
import type { GoogleIdTokenVerifier } from '../../src/modules/auth/google.service.js';
import {
  as,
  ONBOARDING,
  onboardedStudent,
  PASSWORD,
  register,
  TODAY,
  useTestApp,
} from '../helpers/app.js';

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
  it('starts with CBSE class 9 and 10, and ICSE with nothing loaded', async () => {
    const { accessToken } = await register(ctx.app);
    const user = as(ctx.app, accessToken);
    const boards = await user.get('/syllabus/boards').expect(200);
    expect(boards.body.data.map((board: { code: string }) => board.code)).toEqual(['cbse', 'icse']);

    const cbse = await user.get('/syllabus/classes?board=cbse').expect(200);
    expect(cbse.body.data).toContainEqual({ cls: 10, available: true });
    const icse = await user.get('/syllabus/classes?board=icse').expect(200);
    expect(icse.body.data.every((row: { available: boolean }) => !row.available)).toBe(true);
    await user.get('/syllabus/9?board=icse').expect(404);
    await user.get('/syllabus/classes?board=nowhere').expect(404);
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

    const setup = await student
      .post('/onboarding', {
        ...ONBOARDING,
        board: 'odisha-board',
        cls: 8,
        subjects: ['odia', 'maths', 'custom1'],
        customSubjects: [
          { id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', chapters: ['Sandhi', 'Samasa'] },
        ],
        taughtChapterKeys: ['odia-1', 'custom1-1'],
        exams: [
          {
            subject: 'custom1',
            name: 'Sanskrit unit test',
            date: '2026-11-30',
            weight: 10,
            chapterKeys: ['custom1-1', 'custom1-2'],
          },
        ],
      })
      .expect(201);
    expect(setup.body.data.profile).toMatchObject({
      board: 'odisha-board',
      boardName: 'Odisha Board',
      cls: 8,
      ageMode: 'simple',
      subjects: ['maths', 'odia', 'custom1'],
      subjectInfo: [
        { id: 'maths', name: 'Mathematics', custom: false },
        { id: 'odia', name: 'Odia', custom: false },
        { id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', custom: true },
      ],
    });
    const chapters = await student.get('/chapters?subject=custom1').expect(200);
    expect(
      chapters.body.data.map((c: { key: string; name: string; status: string }) => [
        c.key,
        c.name,
        c.status,
      ]),
    ).toEqual([
      ['custom1-1', 'Sandhi', 'learning'],
      ['custom1-2', 'Samasa', 'not'],
    ]);
    const progress = await student.get('/dashboard/progress').expect(200);
    expect(progress.body.data.subjects.map((s: { name: string }) => s.name)).toEqual([
      'Mathematics',
      'Odia',
      'Sanskrit',
    ]);

    // Deleting the board later never touches students who already set up.
    await boss.delete('/admin/syllabus/boards/odisha-board').expect(204);
    const profile = await student.get('/profile').expect(200);
    expect(profile.body.data.boardName).toBe('Odisha Board');
  });

  it('rejects added subjects that clash or are unknown', async () => {
    const { accessToken } = await register(ctx.app);
    const user = as(ctx.app, accessToken);
    const sanskrit = { id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', chapters: ['Sandhi'] };
    const cases: [object, string][] = [
      [
        { subjects: ['maths', 'custom2'], customSubjects: [sanskrit], exams: [] },
        'UNKNOWN_SUBJECT',
      ],
      [
        {
          subjects: ['maths', 'custom1'],
          customSubjects: [{ ...sanskrit, name: 'maths' }],
          exams: [],
        },
        'DUPLICATE_SUBJECT',
      ],
      [{ board: 'icse', exams: [] }, 'CLASS_NOT_AVAILABLE'],
      [{ board: 'nowhere', exams: [] }, 'BOARD_NOT_FOUND'],
      [
        {
          subjects: ['maths', 'custom1'],
          customSubjects: [{ ...sanskrit, chapters: [] }],
          exams: [],
        },
        'VALIDATION_ERROR',
      ],
    ];
    for (const [patch, code] of cases) {
      const response = await user.post('/onboarding', { ...ONBOARDING, ...patch });
      expect({ patch, status: response.status, code: response.body.error?.code }).toEqual({
        patch,
        status: 400,
        code,
      });
    }
  });
});

describe('editing a test', () => {
  it('changes name, date, weight and chapters, and checks them like a new test', async () => {
    const { accessToken } = await onboardedStudent(ctx.app);
    const user = as(ctx.app, accessToken);
    const [exam] = (await user.get('/exams').expect(200)).body.data;

    const edited = await user
      .patch(`/exams/${exam.id}`, {
        name: 'Half-yearly maths',
        date: '2026-12-05',
        weight: 30,
        chapterKeys: ['maths-4', 'maths-5'],
      })
      .expect(200);
    expect(edited.body.data).toMatchObject({
      id: exam.id,
      subject: 'maths',
      name: 'Half-yearly maths',
      date: '2026-12-05',
      weight: 30,
      chapterKeys: ['maths-4', 'maths-5'],
    });
    const list = await user.get('/exams').expect(200);
    expect(list.body.data[0]).toMatchObject({ name: 'Half-yearly maths', daysLeft: 17 });

    const switched = await user
      .patch(`/exams/${exam.id}`, { subject: 'science', chapterKeys: ['science-1'] })
      .expect(200);
    expect(switched.body.data).toMatchObject({ subject: 'science', chapterKeys: ['science-1'] });

    const errors: [object, number, string][] = [
      [{ date: TODAY }, 400, 'EXAM_IN_PAST'],
      [{ subject: 'maths' }, 400, 'UNKNOWN_CHAPTER'],
      [{ chapterKeys: ['maths-1'] }, 400, 'UNKNOWN_CHAPTER'],
      [{}, 400, 'VALIDATION_ERROR'],
    ];
    for (const [body, status, code] of errors) {
      const response = await user.patch(`/exams/${exam.id}`, body);
      expect({ body, status: response.status, code: response.body.error?.code }).toEqual({
        body,
        status,
        code,
      });
    }
    await user
      .patch(`/exams/${new mongoose.Types.ObjectId().toHexString()}`, { name: 'Nope' })
      .expect(404);
    const other = await onboardedStudent(ctx.app);
    await as(ctx.app, other.accessToken)
      .patch(`/exams/${exam.id}`, { name: 'Mine now' })
      .expect(404);
  });
});

describe('Google sign-in', () => {
  const google = (idToken: string) =>
    request(ctx.app).post('/api/v1/auth/google').send({ idToken });

  it('creates a student on first sign-in and finds them again after', async () => {
    const first = await google('good:sub-1:new.student@gmail.test').expect(200);
    expect(first.body.data).toMatchObject({
      onboarded: false,
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
    const existing = await onboardedStudent(ctx.app);
    const linked = await google(`good:sub-2:${existing.email}`).expect(200);
    expect(linked.body.data).toMatchObject({
      onboarded: true,
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
