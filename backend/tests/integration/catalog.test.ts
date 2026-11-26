import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';
import type { GoogleIdTokenVerifier } from '../../src/modules/auth/google.service.js';
import { as, PASSWORD, register, staff, useTestApp } from '../helpers/app.js';

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

  it('loads the standard syllabus into drafts without touching edits', async () => {
    const boss = (await staff(ctx.app, 'admin')).api;
    const { accessToken } = await register(ctx.app);
    const student = as(ctx.app, accessToken);
    const publishedOf = async (exam: string) =>
      (await boss.get(`/admin/exams/${exam}/syllabi`).expect(200)).body.data.find(
        (v: { status: string }) => v.status === 'published',
      ).id as string;
    const draftOf = async (exam: string) =>
      (await boss.post(`/admin/syllabi/${await publishedOf(exam)}/duplicate`, {}).expect(201)).body
        .data.version.id as string;
    type Subject = {
      id: string;
      subjectId: string;
      name: string;
      revision: number;
      units: { chapters: object[] }[];
    };
    const subjectAt = async (syllabus: string, level: string, subjectId: string) => {
      const list = (
        await boss.get(`/admin/syllabi/${syllabus}/subjects?level=${level}`).expect(200)
      ).body.data as Subject[];
      return list.find((s) => s.subjectId === subjectId)!;
    };

    // ICSE draft: maths renamed, physics deleted.
    const icse = await draftOf('icse');
    const icseMaths = await subjectAt(icse, '7', 'maths');
    await boss
      .put(`/admin/syllabus-subjects/${icseMaths.id}`, {
        revision: icseMaths.revision,
        name: 'Mathematics',
        units: icseMaths.units,
      })
      .expect(200);
    await boss
      .delete(`/admin/syllabus-subjects/${(await subjectAt(icse, '7', 'physics')).id}`)
      .expect(204);

    // CBSE draft: class 7 maths without book names and missing Part 2.
    const cbse = await draftOf('cbse');
    const cbseMaths = await subjectAt(cbse, '7', 'maths');
    await boss
      .put(`/admin/syllabus-subjects/${cbseMaths.id}`, {
        revision: cbseMaths.revision,
        units: [
          {
            name: '',
            chapters: [
              { name: 'My own revision chapter' },
              { name: 'Large Numbers Around Us', difficulty: 3 },
            ],
          },
        ],
      })
      .expect(200);

    const loaded = await boss.post('/admin/exams/standard', {}).expect(200);
    expect(loaded.body.data).toMatchObject({ added: 1, updated: 1 });
    expect(loaded.body.data.drafts).toEqual([
      { exam: 'cbse', syllabusId: cbse },
      { exam: 'icse', syllabusId: icse },
    ]);
    const merged = (await subjectAt(cbse, '7', 'maths')).units[0]!.chapters;
    expect(merged).toHaveLength(16);
    expect(merged[0]).toMatchObject({
      name: 'Large Numbers Around Us',
      difficulty: 3,
      book: 'Ganita Prakash – Part 1',
    });
    expect(merged[8]).toMatchObject({ name: 'Geometric Twins', book: 'Ganita Prakash – Part 2' });
    expect(merged[15]).toMatchObject({ name: 'My own revision chapter', difficulty: 2 });
    expect((await subjectAt(icse, '7', 'maths')).name).toBe('Mathematics');
    expect(await subjectAt(icse, '7', 'physics')).toBeDefined();

    // Students see the change only once the draft is published.
    const before = await student.get('/syllabus/7?board=cbse').expect(200);
    expect(before.body.data.find((s: { id: string }) => s.id === 'maths').chapters).toHaveLength(
      15,
    );
    await boss.post(`/admin/syllabi/${cbse}/publish`, {}).expect(200);
    const after = await student.get('/syllabus/7?board=cbse').expect(200);
    const maths = after.body.data.find((s: { id: string }) => s.id === 'maths');
    expect(maths.chapters).toHaveLength(16);
    expect(maths.chapters[15]).toEqual({
      key: 'maths-16',
      name: 'My own revision chapter',
      difficulty: 2,
    });

    const again = await boss.post('/admin/exams/standard', {}).expect(200);
    expect(again.body.data).toMatchObject({ added: 0, updated: 0 });
  });

  it('counts boards, exams and syllabi on the dashboard', async () => {
    const boss = (await staff(ctx.app, 'admin')).api;
    const overview = await boss.get('/admin/dashboard').expect(200);
    // CBSE and ICSE published; NIOS, 27 state boards and 8 competitive exams set up as drafts.
    expect(overview.body.data.totals).toEqual({
      boards: 30,
      competitive: 8,
      exams: 38,
      active: 38,
      inactive: 0,
      draftSyllabi: 36,
      publishedSyllabi: 2,
    });
    expect(overview.body.data.content.subjects).toBeGreaterThan(80);
    expect(overview.body.data.content.chapters).toBeGreaterThan(1000);
    expect(overview.body.data.years).toEqual(['2026-27']);
    const engineering = await boss.get('/admin/dashboard?category=engineering').expect(200);
    expect(engineering.body.data.totals).toMatchObject({
      boards: 0,
      competitive: 2,
      publishedSyllabi: 0,
    });
    expect(engineering.body.data.byCategory).toEqual([
      expect.objectContaining({ code: 'engineering', exams: 2, published: 0 }),
    ]);
    const other = await boss.get('/admin/dashboard?year=2030-31').expect(200);
    expect(other.body.data.totals.exams).toBe(0);
  });

  it('lets an admin build a state board class that students can then pick', async () => {
    const boss = (await staff(ctx.app, 'admin')).api;
    const { accessToken } = await register(ctx.app);
    const student = as(ctx.app, accessToken);
    await student.post('/admin/exams', { name: 'X', category: 'school-boards' }).expect(403);

    const classes = [6, 7, 8, 9, 10, 11, 12].map((n) => ({
      key: String(n),
      name: `Class ${n}`,
      grade: n,
    }));
    const created = await boss
      .post('/admin/exams', {
        name: 'Odisha Board',
        category: 'school-boards',
        region: 'state',
        state: 'Odisha',
        structure: { levelLabel: 'Class', levels: classes },
      })
      .expect(201);
    expect(created.body.data.exam).toMatchObject({ code: 'odisha-board', region: 'state' });
    const draft = created.body.data.draftId as string;

    const odia = await boss
      .post(`/admin/syllabi/${draft}/subjects`, { level: '8', name: 'Odia' })
      .expect(201);
    expect(odia.body.data).toMatchObject({
      subjectId: 'odia',
      position: 0,
      level: '8',
      revision: 1,
    });
    await boss
      .put(`/admin/syllabus-subjects/${odia.body.data.id}`, {
        revision: 1,
        units: [
          {
            name: '',
            chapters: [{ name: 'Bande Utkala Janani' }, { name: 'Utkala Gaurab', difficulty: 3 }],
          },
        ],
      })
      .expect(200);
    await boss.post(`/admin/syllabi/${draft}/subjects`, { level: '8', name: 'odia' }).expect(409);
    await boss
      .post(`/admin/syllabi/${draft}/subjects`, {
        level: '8',
        subjectId: 'custom1',
        name: 'Sneaky',
      })
      .expect(409);
    await boss.post(`/admin/syllabi/${draft}/subjects`, { level: '13', name: 'Nope' }).expect(422);

    // Copy CBSE class 9 in, then rename one and reorder.
    const cbse = (await boss.get('/admin/exams/cbse/syllabi').expect(200)).body.data[0]
      .id as string;
    const copied = await boss
      .post(`/admin/syllabi/${draft}/levels/8/copy`, { fromSyllabusId: cbse, fromLevel: '9' })
      .expect(200);
    expect(copied.body.data.added).toBe(5);
    const maths = copied.body.data.subjects.find(
      (s: { subjectId: string }) => s.subjectId === 'maths',
    );
    await boss
      .put(`/admin/syllabus-subjects/${maths.id}`, {
        revision: maths.revision,
        name: 'Mathematics',
        units: maths.units,
      })
      .expect(200);
    const reordered = await boss
      .put(`/admin/syllabi/${draft}/subjects/order`, { level: '8', subjectIds: ['maths', 'odia'] })
      .expect(200);
    expect(reordered.body.data.slice(0, 2).map((s: { name: string }) => s.name)).toEqual([
      'Mathematics',
      'Odia',
    ]);

    // Students don't see the board until it is published.
    const draftBoards = await student.get('/syllabus/boards').expect(200);
    expect(draftBoards.body.data.map((b: { code: string }) => b.code)).not.toContain(
      'odisha-board',
    );
    await student.get('/syllabus/classes?board=odisha-board').expect(404);

    await boss.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);
    const boards = await student.get('/syllabus/boards').expect(200);
    expect(boards.body.data).toContainEqual(
      expect.objectContaining({ code: 'odisha-board', name: 'Odisha Board', kind: 'state' }),
    );
    const live = await student.get('/syllabus/classes?board=odisha-board').expect(200);
    expect(live.body.data).toContainEqual({ cls: 8, available: true });
    expect(live.body.data).toContainEqual({ cls: 9, available: false });

    // The app downloads this at setup and keeps the student's copy on the phone.
    const syllabus = await student.get('/syllabus/8?board=odisha-board').expect(200);
    expect(syllabus.body.data.slice(0, 2).map((subject: { id: string }) => subject.id)).toEqual([
      'maths',
      'odia',
    ]);
    expect(syllabus.body.data[1]).toEqual({
      id: 'odia',
      name: 'Odia',
      color: expect.any(String),
      chapters: [
        { key: 'odia-1', name: 'Bande Utkala Janani', difficulty: 2 },
        { key: 'odia-2', name: 'Utkala Gaurab', difficulty: 3 },
      ],
    });

    await boss.delete('/admin/exams/odisha-board').expect(204);
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
