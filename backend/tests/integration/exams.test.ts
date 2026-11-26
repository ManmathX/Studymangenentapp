import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { as, register, staff, useTestApp } from '../helpers/app.js';

const ctx = useTestApp('exams');

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

type Api = ReturnType<typeof as>;
interface Version {
  id: string;
  status: string;
  version: number;
  academicYear: string;
}
interface Subject {
  id: string;
  subjectId: string;
  name: string;
  revision: number;
  level: string;
  units: object[];
  counts: Record<string, number>;
}

async function student() {
  return as(ctx.app, (await register(ctx.app)).accessToken);
}

async function versionsOf(api: Api, exam: string): Promise<Version[]> {
  return (await api.get(`/admin/exams/${exam}/syllabi`).expect(200)).body.data as Version[];
}

async function draftOf(api: Api, exam: string): Promise<string> {
  return (await versionsOf(api, exam)).find((v) => v.status === 'draft')!.id;
}

async function subjectsOf(api: Api, syllabus: string, level?: string): Promise<Subject[]> {
  const query = level === undefined ? '' : `?level=${level}`;
  return (await api.get(`/admin/syllabi/${syllabus}/subjects${query}`).expect(200)).body
    .data as Subject[];
}

async function saveTree(api: Api, subject: Subject, units: object[], status = 200) {
  return api
    .put(`/admin/syllabus-subjects/${subject.id}`, { revision: subject.revision, units })
    .expect(status);
}

const PHYSICS = [
  {
    name: 'Mechanics',
    weightage: 30,
    chapters: [
      {
        name: 'Kinematics',
        difficulty: 2,
        important: true,
        weightage: 8,
        grade: 11,
        topics: [
          { name: 'Projectile motion', important: true, subtopics: [{ name: 'Range' }] },
          { name: 'Relative velocity' },
        ],
      },
      { name: 'Laws of Motion', difficulty: 3 },
    ],
  },
  { name: 'Optics', chapters: [{ name: 'Ray Optics', grade: 12 }] },
];

describe('roles', () => {
  it('gives each role its permissions', async () => {
    const admin = await staff(ctx.app, 'admin');
    const editor = await staff(ctx.app, 'editor');
    expect(admin.user.permissions).toEqual(
      expect.arrayContaining(['catalog:publish', 'users:manage', 'audit:read']),
    );
    expect(editor.user.permissions).toEqual(['catalog:read', 'catalog:write']);
    await editor.api.get('/admin/exams').expect(200);
    await editor.api.get('/admin/users').expect(403);
    await editor.api.delete('/admin/exam-categories/other').expect(403);
    const pupil = await student();
    expect((await pupil.get('/auth/me').expect(200)).body.data.user.permissions).toEqual([]);
    await pupil.get('/admin/exams').expect(403);
    await pupil.get('/admin/dashboard').expect(403);

    // Admins can make someone an editor.
    const promoted = await admin.api
      .patch(`/admin/users/${(await register(ctx.app)).userId}/role`, { role: 'editor' })
      .expect(200);
    expect(promoted.body.data).toMatchObject({
      role: 'editor',
      permissions: ['catalog:read', 'catalog:write'],
    });
    const found = await admin.api.get('/admin/users?q=staff&role=editor').expect(200);
    expect(found.body.data).toHaveLength(1);
  });
});

describe('categories', () => {
  it('are listed, added, renamed, reordered and deleted when empty', async () => {
    const { api } = await staff(ctx.app, 'admin');
    const seeded = (await api.get('/admin/exam-categories').expect(200)).body.data;
    expect(seeded.map((c: { code: string }) => c.code)).toEqual([
      'school-boards',
      'engineering',
      'medical',
      'university',
      'government',
      'olympiads',
      'other',
    ]);
    expect(seeded[0]).toMatchObject({ group: 'board', exams: 30 });

    const law = await api
      .post('/admin/exam-categories', { name: 'Law Entrance', group: 'exam' })
      .expect(201);
    expect(law.body.data).toMatchObject({ code: 'law-entrance', position: 7, isActive: true });
    await api.post('/admin/exam-categories', { name: 'law entrance', group: 'exam' }).expect(409);
    await api.patch('/admin/exam-categories/law-entrance', { name: 'Law' }).expect(200);
    const order = await api
      .put('/admin/exam-categories/order', { codes: ['law-entrance'] })
      .expect(200);
    expect(order.body.data[0]).toMatchObject({ code: 'law-entrance', name: 'Law', position: 0 });

    const inUse = await api.delete('/admin/exam-categories/engineering').expect(409);
    expect(inUse.body.error.code).toBe('CATEGORY_IN_USE');
    await api.delete('/admin/exam-categories/law-entrance').expect(204);
    await api.delete('/admin/exam-categories/law-entrance').expect(404);

    // A hidden category hides its exams from students.
    const pupil = await student();
    const before = await pupil.get('/syllabus/exams').expect(200);
    expect(before.body.data.map((e: { code: string }) => e.code)).toContain('icse');
    await api.patch('/admin/exam-categories/school-boards', { isActive: false }).expect(200);
    const after = await pupil.get('/syllabus/exams').expect(200);
    expect(after.body.data.map((e: { code: string }) => e.code)).not.toContain('icse');
    const categories = await pupil.get('/syllabus/categories').expect(200);
    expect(categories.body.data.map((c: { code: string }) => c.code)).not.toContain(
      'school-boards',
    );
  });
});

describe('exams', () => {
  it('are created with validation, a first draft and their own settings', async () => {
    const { api } = await staff(ctx.app, 'admin');
    const badLevels = await api
      .post('/admin/exams', {
        name: 'Bad',
        category: 'other',
        structure: {
          levels: [
            { key: 'a', name: 'A' },
            { key: 'a', name: 'B' },
          ],
        },
      })
      .expect(400);
    expect(badLevels.body.error.details[0].path).toBe('body.structure.levels.1.key');
    expect(
      (await api.post('/admin/exams', { name: 'Nowhere', category: 'nope' }).expect(422)).body.error
        .code,
    ).toBe('CATEGORY_NOT_FOUND');
    expect(
      (
        await api
          .post('/admin/exams', { code: 'cbse', name: 'Again', category: 'other' })
          .expect(409)
      ).body.error.code,
    ).toBe('EXAM_EXISTS');
    await api
      .post('/admin/exams', { name: 'Year', category: 'other', academicYear: '2026-28' })
      .expect(400);
    await api
      .post('/admin/exams', { name: 'Extra', category: 'other', unknownField: 1 })
      .expect(400);

    const created = await api
      .post('/admin/exams', {
        name: 'Common Law Admission Test',
        shortName: 'CLAT',
        category: 'other',
        description: 'National law universities',
        subjects: [{ name: 'English' }, { name: 'Legal Reasoning' }],
        languages: ['English', 'English'],
        settings: { negativeMarks: 0.25, calculator: false },
      })
      .expect(201);
    expect(created.body.data.exam).toMatchObject({
      code: 'clat',
      shortName: 'CLAT',
      languages: ['English'],
      settings: { negativeMarks: 0.25, calculator: false },
      syllabus: { published: null, drafts: 1 },
      structure: { levels: [], useTopics: true },
    });
    const subjects = await subjectsOf(api, created.body.data.draftId as string);
    expect(subjects.map((s) => [s.subjectId, s.level])).toEqual([
      ['english', ''],
      ['legalreasoning', ''],
    ]);

    const search = await api.get('/admin/exams?q=law&limit=5').expect(200);
    expect(search.body.data.map((e: { code: string }) => e.code)).toEqual(['clat']);
    const paged = await api.get('/admin/exams?limit=3&page=2&category=school-boards').expect(200);
    expect(paged.body.meta).toMatchObject({ page: 2, limit: 3, total: 30, hasNext: true });
    expect(paged.body.data.map((e: { code: string }) => e.code)).toEqual([
      'andhra-pradesh',
      'assam',
      'bihar',
    ]);
    const inactive = await api.get('/admin/exams?status=inactive').expect(200);
    expect(inactive.body.data).toEqual([]);
    const byYear = await api.get('/admin/exams?year=2026-27&category=engineering').expect(200);
    expect(byYear.body.data.map((e: { code: string }) => e.code)).toEqual([
      'jee-main',
      'jee-advanced',
    ]);
    const none = await api.get('/admin/exams?year=2030-31').expect(200);
    expect(none.body.data).toEqual([]);

    // Reorder within a category.
    await api.put('/admin/exams/order', { codes: ['icse', 'cbse'] }).expect(200);
    const boards = await api.get('/admin/exams?category=school-boards').expect(200);
    expect(boards.body.data.slice(0, 3).map((e: { code: string }) => e.code)).toEqual([
      'icse',
      'cbse',
      'nios',
    ]);
  });

  it('can’t drop a level that a syllabus still uses', async () => {
    const { api } = await staff(ctx.app, 'admin');
    const cbse = (await api.get('/admin/exams/cbse').expect(200)).body.data;
    const without12 = cbse.structure.levels.filter((level: { key: string }) => level.key !== '12');
    const refused = await api
      .patch('/admin/exams/cbse', { structure: { levels: without12 } })
      .expect(409);
    expect(refused.body.error.code).toBe('LEVEL_IN_USE');
    const renamed = cbse.structure.levels.map((level: { key: string; name: string }) => ({
      ...level,
      name: `Std ${level.key}`,
    }));
    const ok = await api.patch('/admin/exams/cbse', { structure: { levels: renamed } }).expect(200);
    expect(ok.body.data.structure.levels[0]).toEqual({ key: '6', name: 'Std 6', grade: 6 });
  });

  it('store and serve a logo', async () => {
    const { api } = await staff(ctx.app, 'admin');
    const saved = await api
      .put('/admin/exams/jee-main/logo', { dataBase64: PNG.toString('base64') })
      .expect(200);
    const url = saved.body.data.logoUrl as string;
    expect(url).toMatch(/^\/api\/v1\/syllabus\/exams\/jee-main\/logo\?v=[a-f0-9]{12}$/);

    const image = await request(ctx.app).get(url).expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);

    const text = await api
      .put('/admin/exams/jee-main/logo', {
        dataBase64: Buffer.from('<svg></svg>').toString('base64'),
      })
      .expect(422);
    expect(text.body.error.code).toBe('LOGO_TYPE');
    const huge = Buffer.concat([PNG, Buffer.alloc(200 * 1024)]);
    const tooBig = await api
      .put('/admin/exams/jee-main/logo', { dataBase64: huge.toString('base64') })
      .expect(422);
    expect(tooBig.body.error.code).toBe('LOGO_TOO_LARGE');

    const removed = await api.delete('/admin/exams/jee-main/logo').expect(200);
    expect(removed.body.data.logoUrl).toBeNull();
    await request(ctx.app).get(url).expect(404);
  });
});

describe('syllabus versions', () => {
  it('are edited as drafts, published for students and versioned', async () => {
    const admin = (await staff(ctx.app, 'admin')).api;
    const editor = (await staff(ctx.app, 'editor')).api;
    const pupil = await student();

    // Seeded as setup only: students don't see it until it is published.
    const listed = await pupil.get('/syllabus/exams?category=engineering').expect(200);
    expect(listed.body.data).toEqual([]);
    const engineering = (await pupil.get('/syllabus/categories').expect(200)).body.data.find(
      (c: { code: string }) => c.code === 'engineering',
    );
    expect(engineering.exams).toBe(0);
    await pupil.get('/syllabus/exams/jee-main').expect(404);
    expect((await pupil.get('/syllabus/exams/jee-main/subjects').expect(404)).body.error.code).toBe(
      'EXAM_NOT_FOUND',
    );

    const draft = await draftOf(editor, 'jee-main');
    const detail = await editor.get(`/admin/syllabi/${draft}`).expect(200);
    expect(detail.body.data).toMatchObject({
      editable: true,
      status: 'draft',
      academicYear: '2026-27',
    });
    expect(detail.body.data.levels).toHaveLength(1);
    expect(detail.body.data.levels[0].subjects.map((s: { name: string }) => s.name)).toEqual([
      'Physics',
      'Chemistry',
      'Mathematics',
    ]);

    const [physics] = await subjectsOf(editor, draft);
    const saved = await saveTree(editor, physics!, PHYSICS);
    expect(saved.body.data).toMatchObject({
      revision: 2,
      counts: { units: 2, chapters: 3, topics: 2, subtopics: 1 },
    });
    // A stale revision is refused, and so is a tree over the limits.
    const stale = await saveTree(editor, physics!, [], 409);
    expect(stale.body.error.code).toBe('SUBJECT_CHANGED');
    const tooBig = await saveTree(
      editor,
      { ...physics!, revision: 2 },
      [0, 1].map((u) => ({
        name: `Unit ${u}`,
        chapters: Array.from({ length: 80 }, (_, i) => ({ name: `Chapter ${u}.${i}` })),
      })),
      422,
    );
    expect(tooBig.body.error.code).toBe('SYLLABUS_INVALID');

    // Editors can't publish; admins can.
    await editor.post(`/admin/syllabi/${draft}/publish`, {}).expect(403);
    const published = await admin.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);
    expect(published.body.data).toMatchObject({ archived: null, version: { status: 'published' } });

    const exam = await pupil.get('/syllabus/exams/jee-main').expect(200);
    expect(exam.body.data).toMatchObject({
      available: true,
      academicYear: '2026-27',
      conductingBody: 'National Testing Agency (NTA)',
      version: { version: 1 },
    });
    const syllabus = await pupil.get('/syllabus/exams/jee-main/subjects').expect(200);
    expect(syllabus.body.data).toMatchObject({
      level: null,
      labels: { unit: 'Unit' },
      exam: { code: 'jee-main', shortName: 'JEE Main' },
    });
    // Only subjects with chapters reach students.
    expect(syllabus.body.data.subjects).toHaveLength(1);
    expect(syllabus.body.data.subjects[0].units).toEqual([
      { name: 'Mechanics', chapters: 2 },
      { name: 'Optics', chapters: 1 },
    ]);
    expect(syllabus.body.data.subjects[0].chapters).toEqual([
      {
        key: 'physics-1',
        name: 'Kinematics',
        difficulty: 2,
        unit: 'Mechanics',
        important: true,
        weightage: 8,
        grade: 11,
        topics: [
          {
            name: 'Projectile motion',
            important: true,
            subtopics: [{ name: 'Range', important: false }],
          },
          { name: 'Relative velocity', important: false, subtopics: [] },
        ],
      },
      {
        key: 'physics-2',
        name: 'Laws of Motion',
        difficulty: 3,
        unit: 'Mechanics',
        important: false,
        topics: [],
      },
      {
        key: 'physics-3',
        name: 'Ray Optics',
        difficulty: 2,
        unit: 'Optics',
        important: false,
        grade: 12,
        topics: [],
      },
    ]);
    // App builds from before exams never see competitive exams.
    const boards = await pupil.get('/syllabus/boards').expect(200);
    expect(boards.body.data.map((b: { code: string }) => b.code)).toEqual(['cbse', 'icse']);

    // Published versions are locked; changes go through a new draft.
    const locked = await saveTree(admin, { ...physics!, revision: 2 }, [], 409);
    expect(locked.body.error.code).toBe('VERSION_LOCKED');
    await admin.post(`/admin/syllabi/${draft}/subjects`, { name: 'Biology' }).expect(409);
    const next = await editor.post(`/admin/syllabi/${draft}/duplicate`, {}).expect(201);
    expect(next.body.data).toMatchObject({ copied: 3, version: { status: 'draft', version: 2 } });
    const second = next.body.data.version.id as string;
    const chemistry = (await subjectsOf(editor, second)).find((s) => s.subjectId === 'chemistry')!;
    await saveTree(editor, chemistry, [
      { name: 'Physical Chemistry', chapters: [{ name: 'Mole Concept' }] },
    ]);
    const republished = await admin.post(`/admin/syllabi/${second}/publish`, {}).expect(200);
    expect(republished.body.data.archived).toBe(draft);
    expect((await versionsOf(admin, 'jee-main')).map((v) => [v.version, v.status])).toEqual([
      [2, 'published'],
      [1, 'archived'],
    ]);
    const now = await pupil.get('/syllabus/exams/jee-main/subjects').expect(200);
    expect(now.body.data.subjects.map((s: { id: string }) => s.id)).toEqual([
      'physics',
      'chemistry',
    ]);

    // Unpublishing hides the exam's syllabus again; an archived version can be published back.
    await admin.post(`/admin/syllabi/${second}/unpublish`, {}).expect(200);
    await pupil.get('/syllabus/exams/jee-main').expect(404);
    await admin.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);
    expect(
      (await pupil.get('/syllabus/exams/jee-main/subjects').expect(200)).body.data.subjects,
    ).toHaveLength(1);
    expect((await admin.delete(`/admin/syllabi/${draft}`).expect(409)).body.error.code).toBe(
      'VERSION_PUBLISHED',
    );
    await editor.delete(`/admin/syllabi/${second}`).expect(403);
    await admin.delete(`/admin/syllabi/${second}`).expect(204);

    const audit = await admin.get('/admin/audit-logs?action=admin.syllabus_changed').expect(200);
    expect(audit.body.data.map((row: { meta: { op: string } }) => row.meta.op)).toContain(
      'syllabus.publish',
    );
  });

  it('serve exams with levels one level at a time', async () => {
    const admin = (await staff(ctx.app, 'admin')).api;
    const pupil = await student();
    const draft = await draftOf(admin, 'upsc-cse');
    const prelims = (await subjectsOf(admin, draft, 'prelims')).find(
      (s) => s.subjectId === 'generalstudies',
    )!;
    await saveTree(admin, prelims, [
      {
        name: 'History',
        chapters: [
          {
            name: 'Modern India',
            topics: [{ name: 'Freedom struggle', subtopics: [{ name: '1857' }] }],
          },
        ],
      },
    ]);
    await admin.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);

    const exam = await pupil.get('/syllabus/exams/upsc-cse').expect(200);
    expect(exam.body.data).toMatchObject({
      levelLabel: 'Stage',
      available: true,
      // Mains has no chapters yet, so students aren't offered it.
      levels: [{ key: 'prelims', name: 'Prelims', available: true }],
    });
    expect((await pupil.get('/syllabus/exams/upsc-cse/subjects').expect(400)).body.error.code).toBe(
      'LEVEL_REQUIRED',
    );
    expect(
      (await pupil.get('/syllabus/exams/upsc-cse/subjects?level=mains').expect(404)).body.error
        .code,
    ).toBe('CLASS_NOT_AVAILABLE');
    await pupil.get('/syllabus/exams/upsc-cse/subjects?level=interview').expect(404);
    const syllabus = await pupil.get('/syllabus/exams/upsc-cse/subjects?level=prelims').expect(200);
    expect(syllabus.body.data.level).toEqual({ key: 'prelims', name: 'Prelims' });
    expect(syllabus.body.data.labels).toEqual({ level: 'Stage', unit: 'Section' });
    expect(syllabus.body.data.subjects[0]).toMatchObject({
      id: 'generalstudies',
      chapters: [{ key: 'generalstudies-1', unit: 'History', name: 'Modern India' }],
    });
  });

  it('are copied between exams and levels', async () => {
    const admin = (await staff(ctx.app, 'admin')).api;
    const jee = await draftOf(admin, 'jee-main');
    const [physics] = await subjectsOf(admin, jee);
    await saveTree(admin, physics!, PHYSICS);

    const copy = await admin
      .post(`/admin/syllabi/${jee}/duplicate`, { exam: 'jee-advanced', academicYear: '2027' })
      .expect(201);
    expect(copy.body.data).toMatchObject({
      copied: 3,
      skipped: 0,
      version: { exam: 'jee-advanced', academicYear: '2027', version: 1 },
    });
    const copied = await subjectsOf(admin, copy.body.data.version.id as string);
    expect(copied[0]!.counts).toEqual({ units: 2, chapters: 3, topics: 2, subtopics: 1 });

    // CBSE has classes and JEE doesn't: say which class to copy.
    const cbse = (await versionsOf(admin, 'cbse'))[0]!.id;
    const refused = await admin
      .post('/admin/exams/jee-main/syllabi', { copyFrom: { syllabusId: cbse } })
      .expect(422);
    expect(refused.body.error.code).toBe('LEVEL_REQUIRED');
    const fromClass = await admin
      .post('/admin/exams/jee-main/syllabi', { copyFrom: { syllabusId: cbse, level: '11' } })
      .expect(201);
    expect(fromClass.body.data.copied).toBeGreaterThan(3);
    const levels = new Set(
      (await subjectsOf(admin, fromClass.body.data.version.id as string)).map((s) => s.level),
    );
    expect([...levels]).toEqual(['']);
  });
});

describe('import and export', () => {
  const SHEET = [
    'subject,unit,chapter,topic,subtopic,difficulty,weightage,important,grade',
    'Physics,Mechanics,Kinematics,,,2,8,yes,11',
    'Physics,Mechanics,Kinematics,Projectile motion,,,,yes,,',
    'Physics,Mechanics,Kinematics,Projectile motion,Range,,,,,',
    'Physics,Mechanics,"Laws of Motion, Friction",,,hard,,,,',
    'Mathematics,,Sets,,,easy,,,,',
    'Biology,,Cell,,,,,,,',
  ].join('\n');

  it('previews, merges and replaces from CSV and JSON', async () => {
    const admin = (await staff(ctx.app, 'admin')).api;
    const draft = await draftOf(admin, 'jee-main');
    const importInto = (syllabus: string, body: object) =>
      admin.post(`/admin/syllabi/${syllabus}/import`, body).expect(200);

    const preview = await importInto(draft, { format: 'csv', content: SHEET });
    expect(preview.body.data).toMatchObject({
      applied: false,
      problems: [],
      levels: [''],
      subjects: { added: 1, updated: 2, removed: 0 },
      added: { units: 1, chapters: 4, topics: 1, subtopics: 1 },
    });
    expect((await subjectsOf(admin, draft))[0]!.counts.chapters).toBe(0);

    const applied = await importInto(draft, { format: 'csv', content: SHEET, dryRun: false });
    expect(applied.body.data.applied).toBe(true);
    const physics = (await subjectsOf(admin, draft)).find((s) => s.subjectId === 'physics')!;
    expect(physics.units).toEqual([
      {
        name: 'Mechanics',
        chapters: [
          {
            name: 'Kinematics',
            difficulty: 2,
            important: true,
            weightage: 8,
            grade: 11,
            topics: [
              {
                name: 'Projectile motion',
                important: true,
                subtopics: [{ name: 'Range', important: false }],
              },
            ],
          },
          { name: 'Laws of Motion, Friction', difficulty: 3, important: false, topics: [] },
        ],
      },
    ]);

    // A merge only overwrites the columns a row fills in.
    const tweak = await importInto(draft, {
      format: 'csv',
      content: 'subject,unit,chapter,difficulty\nPhysics,Mechanics,Kinematics,3\n',
      dryRun: false,
    });
    expect(tweak.body.data.updated.chapters).toBe(1);
    const kinematics = (await subjectsOf(admin, draft)).find((s) => s.subjectId === 'physics')!
      .units[0] as { chapters: Record<string, unknown>[] };
    expect(kinematics.chapters[0]).toMatchObject({ difficulty: 3, weightage: 8, important: true });

    // Bad rows are reported by row number and nothing is written.
    const bad = await importInto(draft, {
      format: 'csv',
      content: 'subject,chapter,topic,difficulty\nPhysics,,Orphan topic,\nPhysics,Waves,,extreme\n',
      dryRun: false,
    });
    expect(bad.body.data).toMatchObject({
      applied: false,
      problems: [
        { row: 2, message: 'A topic needs its chapter' },
        { row: 3, message: 'Difficulty is 1–3 or easy / medium / hard' },
      ],
    });
    const unknownColumn = await importInto(draft, {
      format: 'csv',
      content: 'subject,colour\nX,red\n',
    });
    expect(unknownColumn.body.data.problems[0].message).toBe('Unknown column: colour');

    // CSV and JSON exports import back to the same content.
    const csv = (await admin.get(`/admin/syllabi/${draft}/export?format=csv`).expect(200)).body
      .data;
    expect(csv).toMatchObject({ filename: 'jee-main-2026-27-v1.csv', contentType: 'text/csv' });
    expect(csv.content).toContain('Physics,Mechanics,"Laws of Motion, Friction"');
    const json = (await admin.get(`/admin/syllabi/${draft}/export?format=json`).expect(200)).body
      .data;
    for (const [format, content] of [
      ['csv', csv.content],
      ['json', json.content],
    ] as const) {
      const empty = await admin
        .post('/admin/exams/jee-main/syllabi', { academicYear: '2027' })
        .expect(201);
      const target = empty.body.data.version.id as string;
      const replaced = await importInto(target, {
        format,
        content,
        mode: 'replace',
        dryRun: false,
      });
      expect(replaced.body.data).toMatchObject({ applied: true, subjects: { added: 4 } });
      const again = (
        await admin.get(`/admin/syllabi/${target}/export?format=${format}`).expect(200)
      ).body.data;
      if (format === 'csv') expect(again.content).toBe(content);
      else
        expect(JSON.parse(again.content as string).subjects).toEqual(
          JSON.parse(content as string).subjects,
        );
    }

    // Published versions can't be imported into.
    await admin.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);
    await admin
      .post(`/admin/syllabi/${draft}/import`, { format: 'csv', content: SHEET, dryRun: false })
      .expect(409);
  });
});

describe('students', () => {
  it('browse, search and page the exam list', async () => {
    const admin = (await staff(ctx.app, 'admin')).api;
    const pupil = await student();
    // Publish NEET UG and NDA so there is more than CBSE and ICSE to browse.
    for (const code of ['neet-ug', 'nda']) {
      const draft = await draftOf(admin, code);
      const [first] = await subjectsOf(admin, draft);
      await saveTree(admin, first!, [{ name: '', chapters: [{ name: 'Units and Measurement' }] }]);
      await admin.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);
    }
    const categories = await pupil.get('/syllabus/categories').expect(200);
    expect(categories.body.data[0]).toMatchObject({ code: 'school-boards', exams: 2 });
    expect(categories.body.data.find((c: { code: string }) => c.code === 'olympiads').exams).toBe(
      0,
    );

    const all = await pupil.get('/syllabus/exams').expect(200);
    expect(all.body.meta.total).toBe(4);
    expect(all.body.data.every((e: { available: boolean }) => e.available)).toBe(true);
    expect(all.body.data[0]).toMatchObject({
      code: 'cbse',
      available: true,
      levelLabel: 'Class',
      categoryGroup: 'board',
    });
    expect(all.body.data[0].levels[0]).toEqual({
      key: '6',
      name: 'Class 6',
      grade: 6,
      available: true,
    });
    const neet = await pupil.get('/syllabus/exams?q=NEET').expect(200);
    expect(neet.body.data.map((e: { code: string }) => e.code)).toEqual(['neet-ug']);
    const medical = await pupil.get('/syllabus/exams?q=medical').expect(200);
    expect(medical.body.data.map((e: { code: string }) => e.code)).toEqual(['neet-ug']);
    const page = await pupil.get('/syllabus/exams?limit=3&page=2').expect(200);
    expect(page.body.meta).toMatchObject({ total: 4, hasNext: false });
    expect(page.body.data).toHaveLength(1);

    const government = await pupil.get('/syllabus/exams?category=government').expect(200);
    expect(government.body.data.map((e: { code: string }) => e.code)).toEqual(['nda']);
    await admin.patch('/admin/exams/nda', { isActive: false }).expect(200);
    const after = await pupil.get('/syllabus/exams?category=government').expect(200);
    expect(after.body.data).toEqual([]);
    await pupil.get('/syllabus/exams/nda').expect(404);
  });
});

describe('more boards', () => {
  it('come set up for every state, hidden until a syllabus is published', async () => {
    const admin = (await staff(ctx.app, 'admin')).api;
    const pupil = await student();
    const boards = await admin.get('/admin/exams?category=school-boards&limit=100').expect(200);
    expect(boards.body.meta.total).toBe(30);
    const bihar = boards.body.data.find((e: { code: string }) => e.code === 'bihar');
    expect(bihar).toMatchObject({
      name: 'Bihar Board (BSEB)',
      shortName: 'BSEB',
      region: 'state',
      state: 'Bihar',
      conductingBody: 'Bihar School Examination Board',
      syllabus: { published: null, drafts: 1 },
    });
    expect(bihar.structure.levels.map((l: { grade: number }) => l.grade)).toEqual([
      6, 7, 8, 9, 10, 11, 12,
    ]);
    const nios = boards.body.data.find((e: { code: string }) => e.code === 'nios');
    expect(nios.structure.levels.map((l: { key: string }) => l.key)).toEqual(['10', '12']);

    // Not offered to students, old app builds included, until published.
    const listed = (await pupil.get('/syllabus/exams?category=school-boards').expect(200)).body
      .data;
    expect(listed.map((e: { code: string }) => e.code)).toEqual(['cbse', 'icse']);
    expect((await pupil.get('/syllabus/boards').expect(200)).body.data).toHaveLength(2);

    // Copy CBSE class 9 into Bihar's draft and publish: Bihar appears, with class 9 only.
    const draft = (await versionsOf(admin, 'bihar'))[0]!.id;
    const cbse = (await versionsOf(admin, 'cbse'))[0]!.id;
    await admin
      .post(`/admin/syllabi/${draft}/levels/9/copy`, { fromSyllabusId: cbse, fromLevel: '9' })
      .expect(200);
    await admin.post(`/admin/syllabi/${draft}/publish`, {}).expect(200);
    const exam = (await pupil.get('/syllabus/exams/bihar').expect(200)).body.data;
    expect(exam.levels.map((l: { key: string }) => l.key)).toEqual(['9']);
    const classes = (await pupil.get('/syllabus/classes?board=bihar').expect(200)).body.data;
    expect(classes.filter((row: { available: boolean }) => row.available)).toEqual([
      { cls: 9, available: true },
    ]);
  });
});

describe('upgrading from the board catalogue', () => {
  it('starts next to the old server-side planner collections without touching them', async () => {
    // Databases from before plans moved to phones still have these (scripts/drop-planner-data.ts).
    const legacy = [
      'profiles',
      'chapters',
      'exams',
      'tasks',
      'suggestions',
      'homeworks',
      'dailylogs',
      'focussessions',
    ];
    const db = mongoose.connection;
    for (const name of legacy)
      await db.collection(name).insertMany([{ userId: 'u1' }, { userId: 'u2' }]);
    const collections = Object.values(mongoose.models).map((m) => m.collection.collectionName);
    expect(collections.filter((name) => legacy.includes(name))).toEqual([]);
    // What the server does at start-up; it failed on `exams` when the catalogue used that name.
    await mongoose.connection.syncIndexes();
    for (const name of legacy) expect(await db.collection(name).countDocuments()).toBe(2);
    const pupil = await student();
    await pupil.get('/syllabus/exams').expect(200);
    for (const name of legacy) await db.dropCollection(name);
  });

  it('copies legacy boards and subjects into published syllabi on first use', async () => {
    const db = mongoose.connection;
    const now = new Date();
    await db.collection('boards').insertMany([
      { code: 'cbse', name: 'CBSE', kind: 'national', position: 0, createdAt: now, updatedAt: now },
      {
        code: 'odisha',
        name: 'Odisha Board (BSE)',
        kind: 'state',
        position: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.collection('catalogsubjects').insertMany([
      {
        board: 'cbse',
        cls: 9,
        subjectId: 'maths',
        name: 'Maths',
        color: '#007AFF',
        position: 0,
        chapters: [
          { name: 'Number Systems', difficulty: 2, book: 'Mathematics' },
          { name: 'Polynomials', difficulty: 3 },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        board: 'odisha',
        cls: 8,
        subjectId: 'odia',
        name: 'Odia',
        color: '#FF9500',
        position: 0,
        chapters: [{ name: 'Bande Utkala Janani', difficulty: 1 }],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const pupil = await student();
    expect((await pupil.get('/syllabus/boards').expect(200)).body.data).toEqual([
      { code: 'cbse', name: 'CBSE', kind: 'national', position: 0 },
      { code: 'odisha', name: 'Odisha Board (BSE)', kind: 'state', position: 1 },
    ]);
    // Exactly what was there: no standard syllabus added on top.
    const classes = await pupil.get('/syllabus/classes?board=cbse').expect(200);
    expect(classes.body.data.filter((row: { available: boolean }) => row.available)).toEqual([
      { cls: 9, available: true },
    ]);
    expect((await pupil.get('/syllabus/9?board=cbse').expect(200)).body.data).toEqual([
      {
        id: 'maths',
        name: 'Maths',
        color: '#007AFF',
        chapters: [
          { key: 'maths-1', name: 'Number Systems', difficulty: 2, book: 'Mathematics' },
          { key: 'maths-2', name: 'Polynomials', difficulty: 3 },
        ],
      },
    ]);
    expect((await pupil.get('/syllabus/8?board=odisha').expect(200)).body.data[0].chapters).toEqual(
      [{ key: 'odia-1', name: 'Bande Utkala Janani', difficulty: 1 }],
    );

    const admin = (await staff(ctx.app, 'admin')).api;
    const odisha = await admin.get('/admin/exams/odisha').expect(200);
    expect(odisha.body.data).toMatchObject({
      region: 'state',
      shortName: 'ODISHA',
      category: 'school-boards',
      syllabus: { published: { academicYear: '2026-27', version: 1 } },
    });
    // Competitive exams are added alongside, and the legacy data is left as it was.
    expect((await admin.get('/admin/exams?category=engineering').expect(200)).body.meta.total).toBe(
      2,
    );
    expect(await db.collection('catalogsubjects').countDocuments()).toBe(2);
    expect(await db.collection('catalog_migrations').countDocuments()).toBe(2);
    // The new boards are added after the copied ones, without a second Odisha.
    const boards = await admin.get('/admin/exams?category=school-boards&limit=100').expect(200);
    const codes = boards.body.data.map((e: { code: string }) => e.code);
    expect(codes.slice(0, 3)).toEqual(['cbse', 'odisha', 'nios']);
    expect(codes).toContain('bihar');
    expect(codes.filter((code: string) => code.includes('odisha'))).toEqual(['odisha']);
  });
});
