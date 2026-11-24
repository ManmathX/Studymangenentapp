import { describe, expect, it } from 'vitest';
import {
  as,
  ONBOARDING,
  onboardedStudent,
  register,
  TIMEZONE,
  TODAY,
  useTestApp,
} from '../helpers/app.js';

const ctx = useTestApp('onboarding');

describe('syllabus', () => {
  it('lists classes and loads a supported class', async () => {
    const { accessToken } = await register(ctx.app);
    const user = as(ctx.app, accessToken);
    const classes = await user.get('/syllabus/classes').expect(200);
    expect(classes.body.data).toContainEqual({ cls: 9, available: true });
    expect(classes.body.data).toContainEqual({ cls: 6, available: true });

    const syllabus = await user.get('/syllabus/9').expect(200);
    expect(syllabus.body.data.map((subject: { id: string }) => subject.id)).toEqual(
      ONBOARDING.subjects,
    );
    expect(syllabus.body.data[0].chapters[0]).toMatchObject({
      key: 'maths-1',
      name: expect.any(String),
    });

    const six = await user.get('/syllabus/6').expect(200);
    expect(six.body.data[0]).toMatchObject({ id: 'maths', name: 'Maths' });
  });
});

describe('onboarding', () => {
  it('blocks planner screens until setup is finished', async () => {
    const { accessToken } = await register(ctx.app);
    const response = await as(ctx.app, accessToken).get('/dashboard/today').expect(404);
    expect(response.body.error.code).toBe('ONBOARDING_REQUIRED');
  });

  it('builds the profile, chapters, test and first suggestions', async () => {
    const { accessToken } = await register(ctx.app, 'Ravi');
    const user = as(ctx.app, accessToken);
    const response = await user.post('/onboarding', ONBOARDING).expect(201);
    expect(response.body.data).toMatchObject({
      suggested: 3,
      firstDate: TODAY,
      profile: {
        name: 'Ravi',
        cls: 9,
        board: 'cbse',
        boardName: 'CBSE',
        timezone: TIMEZONE,
        today: TODAY,
        ageMode: 'deeper',
      },
    });

    const chapters = await user.get('/chapters?subject=maths').expect(200);
    const byKey = Object.fromEntries(
      chapters.body.data.map((chapter: { key: string; status: string }) => [chapter.key, chapter]),
    );
    expect(byKey['maths-1'].status).toBe('learning');
    expect(byKey['maths-3'].status).toBe('not');

    const exams = await user.get('/exams').expect(200);
    expect(exams.body.data[0]).toMatchObject({
      name: 'Periodic test 2',
      daysLeft: 10,
      readiness: { revised: 0, total: 3 },
    });

    await user.post('/onboarding', ONBOARDING).expect(409);
  });

  it('validates the setup answers', async () => {
    const { accessToken } = await register(ctx.app);
    const user = as(ctx.app, accessToken);
    const cases: [object, number, string][] = [
      [{ taughtChapterKeys: ['maths-99'] }, 400, 'UNKNOWN_CHAPTER'],
      [{ exams: [{ ...ONBOARDING.exams[0], date: TODAY }] }, 400, 'EXAM_IN_PAST'],
      [{ exams: [{ ...ONBOARDING.exams[0], chapterKeys: ['science-1'] }] }, 400, 'UNKNOWN_CHAPTER'],
      [
        { subjects: ['science'], exams: ONBOARDING.exams, taughtChapterKeys: [] },
        400,
        'SUBJECT_NOT_SELECTED',
      ],
      [{ schoolStart: '14:00', schoolEnd: '08:00' }, 400, 'VALIDATION_ERROR'],
      [{ timezone: 'Mars/Olympus' }, 400, 'VALIDATION_ERROR'],
      [{ dailyLimitMins: 999 }, 400, 'VALIDATION_ERROR'],
    ];
    for (const [patch, status, code] of cases) {
      const response = await user.post('/onboarding', { ...ONBOARDING, ...patch });
      expect({ patch, status: response.status, code: response.body.error?.code }).toEqual({
        patch,
        status,
        code,
      });
    }
  });

  it('loads the demo student and can start over', async () => {
    const { accessToken } = await register(ctx.app);
    const user = as(ctx.app, accessToken);
    const demo = await user.post('/onboarding/demo', { timezone: TIMEZONE }).expect(201);
    expect(demo.body.data.profile).toMatchObject({ isDemo: true, cls: 9 });

    const today = await user.get('/dashboard/today').expect(200);
    expect(today.body.data.tasks.length).toBeGreaterThan(0);
    expect(today.body.data.streak).toBeGreaterThan(0);

    await user.delete('/profile/data').expect(204);
    await user.get('/dashboard/today').expect(404);
    const me = await user.get('/auth/me').expect(200);
    expect(me.body.data.onboarded).toBe(false);
    await user.post('/onboarding', ONBOARDING).expect(201);
  });
});

describe('profile settings', () => {
  it('changes age mode, exam season, time zone and sharing', async () => {
    const { accessToken } = await onboardedStudent(ctx.app);
    const user = as(ctx.app, accessToken);
    const response = await user
      .patch('/profile', {
        ageMode: 'simple',
        examSeason: true,
        timezone: 'Europe/London',
        sharing: { parent: true, items: { marks: true } },
      })
      .expect(200);
    expect(response.body.data).toMatchObject({
      ageMode: 'simple',
      examSeason: true,
      timezone: 'Europe/London',
      sharing: {
        parent: true,
        groups: false,
        items: { hours: true, streak: true, coverage: true, tests: true, marks: true },
      },
    });
    const sharing = await user.get('/dashboard/sharing').expect(200);
    expect(sharing.body.data.sharing.parent).toBe(true);
  });

  it('refuses empty and invalid changes', async () => {
    const { accessToken } = await onboardedStudent(ctx.app);
    const user = as(ctx.app, accessToken);
    await user.patch('/profile', {}).expect(400);
    await user.patch('/profile', { timezone: 'Nowhere/Land' }).expect(400);
    await user.patch('/profile', { cls: 10 }).expect(400);
  });
});
