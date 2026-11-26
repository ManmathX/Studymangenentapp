import { backupApi, chaptersApi, dashboardApi, examsApi, habitsApi, homeworkApi, planApi, profileApi, suggestionsApi, tasksApi } from '../api';
import { addDays } from '../core/dates';
import { read, write } from '../db';
import { advanceDays, freshPlanner, ONBOARDING, TODAY } from './helpers';

beforeEach(freshPlanner);

const tasksFrom = (from = TODAY) => read().tasks.filter((task) => task.date >= from);
const onboarded = () => profileApi.onboard(ONBOARDING);
const SANSKRIT = { id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', chapters: ['Sandhi', 'Samasa'] };

describe('setup', () => {
  it('copies the board’s catalogue and the subjects the student added', async () => {
    const { profile } = await profileApi.onboard({
      ...ONBOARDING,
      board: 'odisha',
      boardName: 'Odisha Board',
      subjects: ['maths', 'custom1'],
      customSubjects: [SANSKRIT],
      taughtChapterKeys: ['custom1-1'],
      exams: [{ subject: 'custom1', name: 'Sanskrit test', date: '2026-11-30', weight: 10, chapterKeys: ['custom1-1', 'custom1-2'] }],
    });
    expect(profile).toMatchObject({ board: 'odisha', boardName: 'Odisha Board', subjects: ['maths', 'custom1'] });
    expect(profile.subjectInfo).toEqual([
      { id: 'maths', name: 'Maths', color: '#007AFF', custom: false },
      { id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', custom: true },
    ]);
    const sanskrit = await chaptersApi.list('custom1');
    expect(sanskrit.map(({ key, name, difficulty, status }) => [key, name, difficulty, status])).toEqual([
      ['custom1-1', 'Sandhi', 2, 'learning'],
      ['custom1-2', 'Samasa', 2, 'not'],
    ]);
    expect(await chaptersApi.list('science')).toEqual([]);
    expect((await dashboardApi.progress()).subjects.map((subject) => subject.name)).toEqual(['Maths', 'Sanskrit']);
    expect((await dashboardApi.sharing()).boardName).toBe('Odisha Board');
  });

  it('needs setup before planner screens', async () => {
    await expect(dashboardApi.today()).rejects.toMatchObject({ status: 404, code: 'ONBOARDING_REQUIRED' });
  });

  it('builds the profile, chapters, test and the test’s study slots', async () => {
    const result = await onboarded();
    // maths-3 (not started): self study, homework, revision; maths-1 and maths-2 (learning): homework, revision; plus a whole-test revision.
    expect(result).toMatchObject({ planned: 8, firstDate: TODAY, profile: { name: 'Asha', cls: 9, today: TODAY, ageMode: 'deeper' } });
    expect(read().tasks.every((task) => task.status === 'accepted' && task.date < '2026-11-28')).toBe(true);
    const maths = await chaptersApi.list('maths');
    expect(maths.find((chapter) => chapter.key === 'maths-1').status).toBe('learning');
    expect(maths.find((chapter) => chapter.key === 'maths-3').status).toBe('not');
    const [exam] = await examsApi.upcoming();
    expect(exam).toMatchObject({ name: 'Periodic test 2', daysLeft: 10, readiness: { revised: 0, total: 3 } });
  });

  it('validates the setup answers', async () => {
    const cases = [
      [{ name: '  ' }, 'VALIDATION_ERROR'],
      [{ board: 'CBSE!' }, 'VALIDATION_ERROR'],
      [{ catalog: [] }, 'VALIDATION_ERROR'],
      [{ catalog: [{ id: 'Maths', name: 'Maths', chapters: [] }] }, 'CATALOG_INVALID'],
      [{ subjects: ['maths', 'maths'] }, 'DUPLICATE_SUBJECT'],
      [{ subjects: ['physics'] }, 'UNKNOWN_SUBJECT'],
      [{ customSubjects: [{ ...SANSKRIT, name: 'maths' }] }, 'DUPLICATE_SUBJECT'],
      [{ customSubjects: [SANSKRIT, { ...SANSKRIT, name: 'Odia' }] }, 'DUPLICATE_SUBJECT'],
      [{ customSubjects: [{ ...SANSKRIT, id: 'custom9' }] }, 'VALIDATION_ERROR'],
      [{ customSubjects: [{ ...SANSKRIT, chapters: [] }] }, 'VALIDATION_ERROR'],
      [{ taughtChapterKeys: ['maths-99'] }, 'UNKNOWN_CHAPTER'],
      [{ exams: [{ ...ONBOARDING.exams[0], date: TODAY }] }, 'EXAM_IN_PAST'],
      [{ exams: [{ ...ONBOARDING.exams[0], chapterKeys: ['science-1'] }] }, 'UNKNOWN_CHAPTER'],
      [{ subjects: ['science'], taughtChapterKeys: [] }, 'SUBJECT_NOT_SELECTED'],
      [{ schoolStart: '14:00', schoolEnd: '08:00' }, 'VALIDATION_ERROR'],
      [{ dailyLimitMins: 999 }, 'VALIDATION_ERROR'],
    ];
    for (const [patch, code] of cases) {
      await expect(profileApi.onboard({ ...ONBOARDING, ...patch })).rejects.toMatchObject({ code });
    }
    expect(read().profile).toBeNull();
  });

  it('loads the demo student with a week of history', async () => {
    const demo = await profileApi.loadDemo('Ravi');
    expect(demo.profile).toMatchObject({ name: 'Ravi', isDemo: true, board: 'cbse', boardName: 'CBSE' });
    expect(demo.profile.subjectInfo.map((subject) => subject.name)).toEqual(['Maths', 'Science', 'Social Science', 'English', 'Hindi']);
    const today = await dashboardApi.today();
    expect(today.tasks.length).toBeGreaterThan(0);
    expect(today.streak).toBeGreaterThan(0);
    expect(today.suggestions.some((item) => item.kind === 'move')).toBe(true);
  });

  it('changes settings', async () => {
    await onboarded();
    const profile = await profileApi.update({ name: 'Asha K', ageMode: 'simple', examSeason: true, sharing: { groups: true, items: { marks: true } } });
    expect(profile).toMatchObject({ name: 'Asha K', ageMode: 'simple', examSeason: true, sharing: { groups: true, items: { hours: true, marks: true } } });
    await expect(profileApi.update({})).rejects.toMatchObject({ status: 400 });
    await expect(profileApi.update({ ageMode: 'expert' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('school hours and tuitions', () => {
  // TODAY (18 Nov 2026) is a Wednesday. School is 07:45 to 13:45, and 12:30 on Saturday.
  const tuitionRows = async (date) =>
    (await planApi.day(date)).rows.filter((row) => row.kind === 'tuition').map(({ label, start, end }) => ({ label, start, end }));
  const taskIds = (day) => [...day.rows.filter((row) => row.type === 'task').map((row) => row.task.id), ...day.overflow.map((task) => task.id)].sort();
  const MATHS = { name: 'Maths tuition', days: [1, 3, 5], start: '16:00', end: '17:30' };
  const SCIENCE = { name: 'Science tuition', days: [3, 6], start: '18:00', end: '19:00' };

  it('plans around every tuition, each on its own days and at its own times', async () => {
    const { profile } = await profileApi.onboard({ ...ONBOARDING, tuitions: [MATHS, SCIENCE, { name: ' ', days: [2], start: '06:00', end: '07:00' }] });
    expect(profile.tuitions).toEqual([
      { name: 'Maths tuition', days: [1, 3, 5], start: 960, end: 1050 },
      { name: 'Science tuition', days: [3, 6], start: 1080, end: 1140 },
      { name: '', days: [2], start: 360, end: 420 },
    ]);
    expect(await tuitionRows(TODAY)).toEqual([
      { label: 'Maths tuition', start: 960, end: 1050 },
      { label: 'Science tuition', start: 1080, end: 1140 },
    ]);
    expect(await tuitionRows('2026-11-24')).toEqual([{ label: 'Tuition', start: 360, end: 420 }]);
    expect(await tuitionRows('2026-11-19')).toEqual([]);
    expect((await planApi.day('2026-11-19')).tuitionDay).toBe(false);
  });

  it('adds, edits and removes tuitions later and plans each day around them', async () => {
    await onboarded();
    const before = await planApi.day(TODAY);
    const profile = await profileApi.update({ schoolEnd: '14:30', tuitions: [{ ...MATHS, start: '17:00', end: '18:00' }, SCIENCE] });
    expect(profile).toMatchObject({
      schoolEnd: 870,
      tuitions: [
        { name: 'Maths tuition', days: [1, 3, 5], start: 1020, end: 1080 },
        { name: 'Science tuition', days: [3, 6], start: 1080, end: 1140 },
      ],
    });
    const after = await planApi.day(TODAY);
    expect(await tuitionRows(TODAY)).toEqual([
      { label: 'Maths tuition', start: 1020, end: 1080 },
      { label: 'Science tuition', start: 1080, end: 1140 },
    ]);
    expect(taskIds(after)).toEqual(taskIds(before));
    expect(after.rows.filter((row) => row.type === 'task').every((row) => row.end <= 1020 || row.start >= 1140)).toBe(true);
    expect((await dashboardApi.sharing()).schoolDay).toEqual({ schoolStart: 465, schoolEnd: 870, tuitions: profile.tuitions });

    expect((await profileApi.update({ tuitions: [SCIENCE] })).tuitions).toEqual([{ name: 'Science tuition', days: [3, 6], start: 1080, end: 1140 }]);
    expect(await tuitionRows('2026-11-20')).toEqual([]);
    expect((await profileApi.update({ tuitions: [] })).tuitions).toEqual([]);
    expect(await tuitionRows(TODAY)).toEqual([]);
  });

  it('refuses tuitions that don’t fit and keeps the saved ones', async () => {
    await onboarded();
    const cases = [
      [{ tuitions: [{ ...MATHS, start: '17:30', end: '17:00' }] }, 'end', 'Maths tuition has to end after it starts'],
      [{ tuitions: [{ ...MATHS, start: '10:00', end: '11:00' }] }, 'start', 'Maths tuition on Monday clashes with school (07:45 to 13:45)'],
      [{ tuitions: [{ ...MATHS, start: '04:00', end: '05:00' }] }, 'start', 'Maths tuition has to be between 05:00 and 22:00'],
      [{ tuitions: [MATHS, { ...SCIENCE, days: [5], start: '17:00', end: '18:00' }] }, 'start', 'Maths tuition and Science tuition overlap on Friday'],
      [{ tuitions: [{ ...MATHS, days: [] }] }, 'days', 'Pick the days for Maths tuition'],
      [{ tuitions: [{ ...MATHS, days: [0] }] }, 'days', 'Use a whole number from 1 to 6'],
      [{ tuitions: [{ ...MATHS, start: '4pm' }] }, 'start', 'Use HH:MM'],
      [{ tuitions: Array.from({ length: 7 }, () => MATHS) }, 'tuitions', 'Pick at most 6'],
      [{ schoolEnd: '16:30' }, 'start', 'Tuition on Monday clashes with school (07:45 to 16:30)'],
      [{ schoolStart: '14:00' }, 'schoolEnd', 'School has to end after it starts'],
    ];
    for (const [patch, field, message] of cases) {
      const error = await profileApi.update(patch).catch((caught) => caught);
      expect({ field: Object.keys(error.fieldErrors?.() ?? {})[0], message: error.message }).toEqual({ field, message });
    }
    expect(await profileApi.get()).toMatchObject({ schoolEnd: 825, tuitions: [{ name: '', days: [1, 3, 5], start: 960, end: 1050 }] });
  });

  it('allows Saturday tuition straight after the half day, but not on a full school day', async () => {
    const art = { name: 'Art class', days: [6], start: '12:45', end: '13:45' };
    const { profile } = await profileApi.onboard({ ...ONBOARDING, tuitions: [art] });
    expect(profile.tuitions).toEqual([{ name: 'Art class', days: [6], start: 765, end: 825 }]);
    await expect(profileApi.update({ tuitions: [{ ...art, days: [1, 6] }] })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Art class on Monday clashes with school (07:45 to 13:45)',
    });
  });

  it('reads plans saved with one set of tuition days and one time', async () => {
    const restoreWith = async (oldFields) => {
      await profileApi.loadDemo('Ravi');
      const backup = JSON.parse(await backupApi.export());
      const { tuitions: _replaced, ...profile } = backup.data.profile;
      backup.data.profile = { ...profile, ...oldFields };
      await backupApi.restore(JSON.stringify(backup));
    };
    await restoreWith({ tuitionDays: [3] });
    expect(await tuitionRows(TODAY)).toEqual([{ label: 'Tuition', start: 960, end: 1050 }]);

    await restoreWith({ tuitionDays: [3], tuitionStart: 1020, tuitionEnd: 1110 });
    expect((await profileApi.get()).tuitions).toEqual([{ name: '', days: [3], start: 1020, end: 1110 }]);
    expect(await tuitionRows(TODAY)).toEqual([{ label: 'Tuition', start: 1020, end: 1110 }]);

    // The next save stores the list in place of the old fields.
    await profileApi.update({ schoolEnd: '14:00' });
    expect(read().profile).toMatchObject({ tuitions: [{ name: '', days: [3], start: 1020, end: 1110 }] });
    expect(read().profile).not.toHaveProperty('tuitionDays');
    expect(read().profile).not.toHaveProperty('tuitionStart');
  });
});

describe('today and plan', () => {
  it('shows the day, the next test and today’s study slots', async () => {
    await onboarded();
    const today = await dashboardApi.today();
    expect(today).toMatchObject({
      today: TODAY,
      nextExam: { name: 'Periodic test 2', daysLeft: 10 },
      suggestedBlocks: { count: 0 },
      limitMins: 150,
      streak: 0,
    });
    expect(today.tasks.length).toBeGreaterThan(0);
    expect(today.tasks.map(({ task }) => task.kind)).toContain('study');
    expect(today.plannedMins).toBeLessThanOrEqual(150);
  });

  it('builds the day strip and a timed day', async () => {
    await onboarded();
    const strip = await planApi.strip();
    expect(strip).toHaveLength(14);
    expect(strip[0]).toMatchObject({ date: TODAY, limitMins: 150 });
    expect(strip.find((day) => day.date === '2026-11-28').hasExam).toBe(true);
    expect(strip.some((day) => day.overloaded)).toBe(false);

    const day = await planApi.day(TODAY);
    expect(day.rows.map((row) => row.kind ?? row.type)).toEqual(expect.arrayContaining(['school', 'tuition', 'rest', 'task']));
    expect(day).toMatchObject({ tuitionDay: true, suggestedCount: 0 });
    await expect(planApi.day('2027-06-01')).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
  });

  it('re-plans skipped chapters on request and accepts all suggestions', async () => {
    await onboarded();
    for (const task of read().tasks.filter((item) => item.chapterKey === 'maths-3')) await tasksApi.skip(task.id);
    const auto = await planApi.autoSchedule();
    expect(auto.added).toBe(1);
    expect(read().tasks.find((task) => task.status === 'suggested')).toMatchObject({ chapterKey: 'maths-3', kind: 'study' });
    expect(await planApi.acceptAll()).toEqual({ accepted: 1 });
    expect((await planApi.autoSchedule()).added).toBe(0);
  });
});

describe('tasks and suggestions', () => {
  it('marks done, moves, skips, accepts and swaps', async () => {
    await onboarded();
    const first = tasksFrom().find((task) => task.date === TODAY);
    const [second, third] = tasksFrom().filter((task) => task.id !== first.id);
    expect((await tasksApi.update(first.id, { done: true })).task.done).toBe(true);
    expect((await dashboardApi.progress()).weekMins).toBeGreaterThan(0);
    expect((await tasksApi.update(second.id, { date: '2026-11-21' })).task.date).toBe('2026-11-21');
    await expect(tasksApi.update(second.id, { date: '2026-11-17' })).rejects.toMatchObject({ code: 'DATE_IN_PAST' });
    expect((await tasksApi.skip(third.id)).status).toBe('skipped');
    expect((await tasksApi.accept(third.id)).status).toBe('accepted');
    expect((await tasksApi.swap(third.id)).date).not.toBe(third.date);
    expect((await tasksApi.move(second.id)).date >= TODAY).toBe(true);
    await expect(tasksApi.skip('nope')).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });

  it('turns slipped tasks into "move it" suggestions that can be accepted, saved, swapped or skipped', async () => {
    await onboarded();
    advanceDays(2);
    const slipped = read().tasks.filter((task) => task.status === 'accepted' && !task.done && task.date < '2026-11-20');
    expect(slipped.length).toBeGreaterThanOrEqual(3);
    const moves = (await dashboardApi.today()).suggestions.filter((item) => item.kind === 'move');
    expect(moves).toHaveLength(slipped.length);
    await dashboardApi.today();
    expect(read().suggestions).toHaveLength(slipped.length);

    const [acceptMe, laterMe, skipMe] = moves;
    await suggestionsApi.accept(acceptMe.id);
    expect(read().tasks.find((task) => task.id === acceptMe.taskId).date).toBe(acceptMe.date);
    await expect(suggestionsApi.accept(acceptMe.id)).rejects.toMatchObject({ code: 'SUGGESTION_CLOSED' });

    expect((await suggestionsApi.later(laterMe.id)).state).toBe('later');
    expect((await dashboardApi.sharing()).later).toHaveLength(1);
    const swapped = await suggestionsApi.swap(laterMe.id);
    expect(swapped.state).toBe('accepted');
    expect(read().tasks.find((task) => task.id === laterMe.taskId).date).toBe(swapped.date);

    await suggestionsApi.skip(skipMe.id);
    expect(read().tasks.find((task) => task.id === skipMe.taskId).status).toBe('skipped');
  });
});

describe('chapters', () => {
  it('proposes and schedules study steps before the test', async () => {
    await onboarded();
    const proposal = await chaptersApi.proposal('maths-3');
    expect(proposal.exam).toMatchObject({ name: 'Periodic test 2' });
    expect(proposal.steps).toHaveLength(4);
    for (const step of proposal.steps) expect(step.proposedDate < '2026-11-28').toBe(true);
    const created = await chaptersApi.schedule(
      'maths-3',
      proposal.steps.map((step) => ({ index: step.index, date: step.proposedDate })),
    );
    expect(created).toHaveLength(4);
    await expect(chaptersApi.schedule('maths-3', [{ index: 0, date: TODAY }, { index: 0, date: TODAY }])).rejects.toMatchObject({ code: 'INVALID_STEP' });
    await expect(chaptersApi.schedule('maths-3', [{ index: 0, date: '2027-01-01' }])).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
    await expect(chaptersApi.proposal('maths-99')).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' });
  });

  it('updates status, adds spaced revisions and snoozes nudges', async () => {
    await onboarded();
    expect(await chaptersApi.setStatus('maths-5', 'learning')).toMatchObject({ status: 'learning', learnedOn: TODAY, revisions: 0 });
    const revision = await chaptersApi.addRevision('maths-5');
    expect(revision.task).toMatchObject({ kind: 'revision', mins: 15, date: TODAY });
    expect(revision.chapter.revisions).toBe(1);
    await expect(chaptersApi.addRevision('maths-6')).rejects.toMatchObject({ code: 'NO_REVISION_DUE' });
    expect((await chaptersApi.snooze('maths-5')).snoozedUntil).toBe('2026-11-19');
  });

  it('shows chapters ticked at setup or marked later as Studied in the progress bars', async () => {
    await onboarded();
    const progress = await dashboardApi.progress();
    expect(progress.coverage.counts).toMatchObject({ learning: 3, practiced: 0 });
    expect(progress.subjects.find((item) => item.subject === 'maths').coverage.counts.learning).toBe(2);

    await chaptersApi.setStatus('maths-4', 'learning');
    expect((await dashboardApi.progress()).coverage.counts.learning).toBe(4);
  });

  it('shows today’s suggested blocks in Today’s plan, and ticking one done keeps it', async () => {
    await onboarded();
    write((draft) => {
      draft.tasks.push({ id: 'sugg-1', date: TODAY, subject: 'maths', title: 'Revision: Polynomials', kind: 'revision', mins: 20, deadline: TODAY, score: 5, why: 'Test soon', chapterKey: null, homeworkId: null, source: 'app', status: 'suggested', done: false, order: 99 });
    });
    const today = await dashboardApi.today();
    expect(today.tasks.map(({ task }) => task.id)).toContain('sugg-1');
    const { task } = await tasksApi.update('sugg-1', { done: true });
    expect(task).toMatchObject({ done: true, status: 'accepted' });
  });

  it('lets the student edit any task’s title, length and day; editing a suggestion keeps it', async () => {
    await onboarded();
    write((draft) => {
      draft.tasks.push({ id: 'sugg-2', date: TODAY, subject: 'maths', title: 'Revision: Polynomials', kind: 'revision', mins: 20, deadline: TODAY, score: 5, why: '', chapterKey: null, homeworkId: null, source: 'app', status: 'suggested', done: false, order: 99 });
    });
    const { task } = await tasksApi.update('sugg-2', { title: '  Polynomials: past paper  ', mins: 45, date: '2026-11-20' });
    expect(task).toMatchObject({ title: 'Polynomials: past paper', mins: 45, date: '2026-11-20', status: 'accepted' });
    await expect(tasksApi.update('sugg-2', { title: '   ' })).rejects.toMatchObject({ code: expect.any(String) });
    await expect(tasksApi.update('sugg-2', { mins: 2 })).rejects.toMatchObject({ code: expect.any(String) });
    await expect(tasksApi.update('sugg-2', { date: addDays(TODAY, 30) })).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
    expect((await tasksApi.skip('sugg-2')).status).toBe('skipped');
  });

  it('moves a Studied chapter to Practiced once a practice or homework step is done', async () => {
    await onboarded();
    const step = read().tasks.find((task) => task.chapterKey === 'maths-1' && (task.kind === 'homework' || task.kind === 'practice'));
    const { chapter } = await tasksApi.update(step.id, { done: true });
    expect(chapter).toMatchObject({ key: 'maths-1', status: 'practiced' });
    expect((await dashboardApi.progress()).coverage.counts).toMatchObject({ learning: 2, practiced: 1 });
  });
});

describe('daily homework and self study slots', () => {
  it('every day has a Homework slot, and Test prep replaces Self study in the two weeks before a test', async () => {
    await onboarded(); // Periodic test 2 on Sat 28 Nov
    for (const { date } of await planApi.strip()) {
      const day = await planApi.day(date);
      const { slots } = day;
      // The timeline itself only has fixed blocks and tasks.
      expect(day.rows.every((row) => row.type === 'fixed' || row.type === 'task')).toBe(true);
      const beforeTest = date < '2026-11-28' && date >= '2026-11-14';
      expect(slots.map((slot) => slot.kind)).toEqual(['homework', beforeTest ? 'exam' : 'study']);
      if (beforeTest) expect(slots[1]).toMatchObject({ label: 'Test prep', detail: 'Periodic test 2', exams: [{ name: 'Periodic test 2', date: '2026-11-28' }] });
    }
    expect((await dashboardApi.today()).slots.map((slot) => slot.label)).toEqual(['Homework', 'Test prep']);
  });

  it('uses Self study again once no test is coming up', async () => {
    await profileApi.onboard({ ...ONBOARDING, exams: [] });
    expect((await dashboardApi.today()).slots.map((slot) => slot.label)).toEqual(['Homework', 'Self study']);
  });

  it('puts the test’s work in Test prep and school homework in the Homework slot', async () => {
    await onboarded();
    const homework = await homeworkApi.create({ subject: 'maths', title: 'Exercise 8.2', note: '', due: '2026-11-20', mins: 30, difficulty: 2 });
    const day = await planApi.day('2026-11-19');
    const [homeworkSlot, prepSlot] = day.slots;
    expect(prepSlot.kind).toBe('exam');
    const taskRows = day.rows.filter((item) => item.type === 'task');
    expect(taskRows.find((row) => row.task.id === homework.task.id).start).toBe(homeworkSlot.start);
    const testWork = taskRows.filter((row) => row.task.examId);
    expect(testWork.length).toBeGreaterThan(0);
    expect(testWork.map((row) => row.task.kind)).toContain('homework');
    for (const row of testWork) expect(row.start).toBeGreaterThanOrEqual(prepSlot.start);
    // Test work is planned to fit the Test prep slot, leaving the Homework slot for school homework.
    expect(testWork.reduce((sum, row) => sum + row.task.mins, 0)).toBeLessThanOrEqual(prepSlot.end - prepSlot.start);
  });

  it('lets the student change the homework slot length', async () => {
    await onboarded();
    expect((await profileApi.get()).homeworkMins).toBe(60);
    expect((await profileApi.update({ homeworkMins: 45 })).homeworkMins).toBe(45);
    const [homework, study] = (await planApi.day('2026-11-19')).slots;
    expect(homework.end - homework.start).toBe(45);
    expect(study.end - study.start).toBe(135);
    await expect(profileApi.update({ homeworkMins: 25 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await dashboardApi.sharing()).homeworkMins).toBe(45);
  });
});

describe('unit tests update the calendar', () => {
  const scienceTest = { subject: 'science', name: 'Science unit test', date: '2026-12-02', weight: 10, chapterKeys: ['science-1', 'science-2'] };
  const slotsFor = (examId) => read().tasks.filter((task) => task.examId === examId);

  it('adds self study, homework and revision slots before the test', async () => {
    await onboarded();
    const { exam, planned } = await examsApi.create(scienceTest);
    // science-1 was taught (learning): homework + revision; science-2 not started: self study + homework + revision; plus whole-test revision.
    expect(planned).toMatchObject({ added: 6, counts: { study: 1, homework: 2, revision: 3 }, reason: null });
    const slots = slotsFor(exam.id);
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      expect(slot).toMatchObject({ status: 'accepted', source: 'app', deadline: '2026-12-01' });
      expect(slot.date >= TODAY && slot.date < '2026-12-02').toBe(true);
    }
    expect(slots.find((slot) => slot.chapterKey === null)).toMatchObject({ kind: 'revision', date: '2026-12-01' });
    expect((await planApi.day(planned.firstDate)).rows.some((row) => row.type === 'task' && row.task.examId === exam.id)).toBe(true);
  });

  it('shows far-away tests and their slots on the calendar strip', async () => {
    await onboarded();
    const { planned } = await examsApi.create({ ...scienceTest, date: '2027-01-10' });
    expect(planned.firstDate >= '2026-12-27').toBe(true);
    const strip = await planApi.strip();
    expect(strip.at(-1).date).toBe('2027-01-10');
    expect(strip.at(-1).hasExam).toBe(true);
    await expect(planApi.day('2027-01-09')).resolves.toMatchObject({ date: '2027-01-09' });
  });

  it('does not double-plan a chapter that already has slots before the test', async () => {
    await onboarded();
    const { planned } = await examsApi.create({ subject: 'maths', name: 'Maths quiz', date: '2026-11-25', weight: 10, chapterKeys: ['maths-3'] });
    expect(planned).toMatchObject({ added: 1, counts: { study: 0, homework: 0, revision: 1 } });
  });

  it('tells the student when the test is too close to plan for', async () => {
    await onboarded();
    advanceDays(9 / 24); // 20:30 in Kolkata, after the 19:00 cut-off: planning starts tomorrow, the test day itself.
    const { planned } = await examsApi.create({ ...scienceTest, date: '2026-11-19' });
    expect(planned).toMatchObject({ added: 0, reason: 'NO_TIME', firstDate: null });
  });

  it('removing a test removes its unfinished slots but keeps time already studied', async () => {
    await onboarded();
    const { exam } = await examsApi.create(scienceTest);
    const [finished] = slotsFor(exam.id).filter((slot) => slot.date === TODAY);
    await tasksApi.update(finished.id, { done: true });
    await examsApi.remove(exam.id);
    expect(slotsFor(exam.id)).toEqual([]);
    expect(read().tasks.find((task) => task.id === finished.id)).toMatchObject({ done: true, examId: null });
  });

  it('edits a test and keeps the slots already planned', async () => {
    await onboarded();
    const [exam] = await examsApi.upcoming();
    const planned = read().tasks.length;
    const saved = await examsApi.update(exam.id, { name: 'Periodic test 2 (moved)', date: '2026-12-02', chapterKeys: ['maths-1'] });
    expect(saved).toMatchObject({ name: 'Periodic test 2 (moved)', date: '2026-12-02', chapterKeys: ['maths-1'], weight: 20, subject: 'maths' });
    expect(read().tasks).toHaveLength(planned);

    await expect(examsApi.update(exam.id, { date: TODAY })).rejects.toMatchObject({ code: 'EXAM_IN_PAST' });
    await expect(examsApi.update(exam.id, { subject: 'science' })).rejects.toMatchObject({ code: 'UNKNOWN_CHAPTER' });
    await expect(examsApi.update(exam.id, { subject: 'science', chapterKeys: ['maths-1'] })).rejects.toMatchObject({ code: 'UNKNOWN_CHAPTER' });
    await expect(examsApi.update('missing', { name: 'Test' })).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
    expect(await examsApi.update(exam.id, { subject: 'science', chapterKeys: ['science-1', 'science-1'] })).toMatchObject({ subject: 'science', chapterKeys: ['science-1'] });
  });
});

describe('the datesheet', () => {
  const SUBJECT_NAMES = { maths: 'Maths', science: 'Science', sst: 'Social Science', english: 'English', hindi: 'Hindi' };
  const DATES = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
  const firstHalf = (subject) => {
    const own = read().chapters.filter((chapter) => chapter.subject === subject);
    return own.slice(0, Math.ceil(own.length / 2)).map((chapter) => chapter.key);
  };
  const halfYearly = () => ({
    series: 'Half-yearly',
    kind: 'halfYearly',
    papers: Object.keys(SUBJECT_NAMES).map((subject, index) => ({ subject, name: `Half-yearly: ${SUBJECT_NAMES[subject]}`, date: DATES[index], weight: 30, chapterKeys: firstHalf(subject) })),
  });

  it('adds a unit test as one group and plans each paper like a single test', async () => {
    await onboarded();
    const { exams, planned } = await examsApi.createDatesheet({
      series: 'UT 1',
      kind: 'unit',
      papers: [
        { subject: 'maths', name: 'UT 1: Maths', date: '2026-12-01', chapterKeys: ['maths-1'] },
        { subject: 'science', name: 'UT 1: Science', date: '2026-12-02', chapterKeys: ['science-1'] },
      ],
    });
    expect(exams).toHaveLength(2);
    expect(exams[0]).toMatchObject({ type: 'unit', kind: 'unit', seriesName: 'UT 1', weight: 20 });
    expect(exams[0]).not.toHaveProperty('prepFrom');
    expect(new Set(exams.map((exam) => exam.seriesId)).size).toBe(1);
    expect(planned.added).toBeGreaterThan(0);
  });

  it('plans a half-yearly as one mixed timetable starting weeks before the first paper', async () => {
    await onboarded();
    const { exams, planned } = await examsApi.createDatesheet(halfYearly());
    expect(exams).toHaveLength(5);
    expect(new Set(exams.map((exam) => exam.seriesId)).size).toBe(1);
    expect(exams[0]).toMatchObject({ type: 'halfYearly', kind: 'halfYearly', seriesName: 'Half-yearly', weight: 30, prepFrom: '2026-11-16' });
    expect(planned.added).toBeGreaterThan(40);

    const slots = read().tasks.filter((task) => exams.some((exam) => exam.id === task.examId));
    const subjectsOnFirstWeek = new Set(slots.filter((task) => task.date <= '2026-11-24').map((task) => task.subject));
    expect(subjectsOnFirstWeek.size).toBeGreaterThanOrEqual(3);
    for (const exam of exams) {
      expect(slots.find((task) => task.examId === exam.id && !task.chapterKey).date).toBe(addDays(exam.date, -1));
    }
    expect((await examsApi.upcoming()).map((exam) => exam.name)).toContain('Half-yearly: Hindi');
  });

  it('shows Test prep for the half-yearly on the calendar while it is coming up', async () => {
    await profileApi.onboard({ ...ONBOARDING, exams: [] });
    await examsApi.createDatesheet(halfYearly());
    expect((await planApi.day(TODAY)).slots[1]).toMatchObject({ kind: 'exam', label: 'Test prep', detail: 'Half-yearly' });
    const strip = await planApi.strip();
    expect(strip.at(-1).date).toBe('2026-12-18');
    expect(strip.filter((day) => day.hasExam)).toHaveLength(5);
  });

  it('checks the exam and every paper', async () => {
    await onboarded();
    const paper = { subject: 'maths', name: 'Final: Maths', date: '2027-02-22', chapterKeys: ['maths-1'] };
    const bad = [
      [{ series: 'Final', kind: 'weekly', papers: [paper] }, 'VALIDATION_ERROR'],
      [{ series: '', kind: 'final', papers: [paper] }, 'VALIDATION_ERROR'],
      [{ series: 'Final', kind: 'final', papers: [] }, 'VALIDATION_ERROR'],
      [{ series: 'Final', kind: 'final', papers: [{ ...paper, date: TODAY }] }, 'EXAM_IN_PAST'],
      [{ series: 'Final', kind: 'final', papers: [paper, paper] }, 'DUPLICATE_PAPER'],
      [{ series: 'Final', kind: 'final', papers: [{ ...paper, chapterKeys: ['science-1'] }] }, 'UNKNOWN_CHAPTER'],
    ];
    for (const [input, code] of bad) await expect(examsApi.createDatesheet(input)).rejects.toMatchObject({ code });
  });

  it('keeps setup datesheet papers grouped and plans them the same way', async () => {
    const exams = halfYearly().papers.map((paper) => ({ ...paper, series: 'Half-yearly', kind: 'halfYearly', chapterKeys: [`${paper.subject}-1`] }));
    await profileApi.onboard({ ...ONBOARDING, exams });
    const saved = read().exams;
    expect(saved).toHaveLength(5);
    expect(new Set(saved.map((exam) => exam.seriesId)).size).toBe(1);
    expect(saved[0]).toMatchObject({ type: 'halfYearly', seriesName: 'Half-yearly', prepFrom: '2026-11-16' });
  });

  it('removing one paper removes only that paper and its unfinished slots', async () => {
    await onboarded();
    const { exams } = await examsApi.createDatesheet(halfYearly());
    await examsApi.remove(exams[0].id);
    expect(read().tasks.some((task) => task.examId === exams[0].id)).toBe(false);
    expect(read().tasks.some((task) => task.examId === exams[1].id)).toBe(true);
    expect((await examsApi.upcoming()).filter((exam) => exam.seriesId === exams[0].seriesId)).toHaveLength(4);
  });
});

describe('tests (exams)', () => {
  it('adds and removes tests with validation', async () => {
    await onboarded();
    const { exam } = await examsApi.create({ subject: 'science', name: 'Unit test', date: '2026-12-02', weight: 10, chapterKeys: ['science-1', 'science-2'] });
    expect(await examsApi.upcoming()).toHaveLength(2);
    await expect(examsApi.create({ ...exam, date: TODAY })).rejects.toMatchObject({ code: 'EXAM_IN_PAST' });
    await expect(examsApi.create({ ...exam, chapterKeys: ['maths-1'] })).rejects.toMatchObject({ code: 'UNKNOWN_CHAPTER' });
    await expect(examsApi.create({ ...exam, chapterKeys: [] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await examsApi.remove(exam.id);
    await expect(examsApi.remove(exam.id)).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
});

describe('homework', () => {
  const item = { subject: 'maths', title: 'Exercise 8.2', note: 'Odd numbers only', due: '2026-11-21', mins: 40, difficulty: 2 };

  it('adds homework with a task the day before, marks it done and pending again', async () => {
    await onboarded();
    const { homework, task } = await homeworkApi.create(item);
    expect(task).toMatchObject({ date: '2026-11-20', kind: 'homework', mins: 40 });
    expect(await homeworkApi.summary()).toEqual({ today: TODAY, dueThisWeek: 1, overdue: 0, doneThisWeek: 0 });
    await expect(homeworkApi.create({ ...item, due: '2026-11-17' })).rejects.toMatchObject({ code: 'DUE_IN_PAST' });
    await expect(homeworkApi.create({ ...item, title: '' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(await homeworkApi.setDone(homework.id, true)).toMatchObject({ done: true, doneOn: TODAY });
    const done = await homeworkApi.page('done', 1);
    expect(done).toMatchObject({ meta: { total: 1, hasNext: false } });
    expect((await homeworkApi.summary()).doneThisWeek).toBe(1);
    expect(await homeworkApi.setDone(homework.id, false)).toMatchObject({ done: false, doneOn: null });
  });

  it('deletes homework with its open task but keeps minutes already studied', async () => {
    await onboarded();
    const first = await homeworkApi.create(item);
    const second = await homeworkApi.create({ ...item, title: 'Essay', due: TODAY });
    await tasksApi.update(second.task.id, { done: true });
    await homeworkApi.remove(first.homework.id);
    await homeworkApi.remove(second.homework.id);
    await expect(homeworkApi.remove(first.homework.id)).rejects.toMatchObject({ code: 'HOMEWORK_NOT_FOUND' });
    expect(read().tasks.find((task) => task.id === first.task.id)).toBeUndefined();
    expect(read().tasks.find((task) => task.id === second.task.id)).toMatchObject({ done: true, homeworkId: null });
  });

  it('pages through homework', async () => {
    await onboarded();
    for (let i = 0; i < 3; i += 1) await homeworkApi.create({ ...item, title: `Task ${i}` });
    const page = await homeworkApi.page('open', 1, 2);
    expect(page.data).toHaveLength(2);
    expect(page.meta).toEqual({ page: 1, limit: 2, total: 3, hasNext: true });
  });
});

describe('habits', () => {
  it('logs focus sessions up to a daily cap', async () => {
    await onboarded();
    expect(await habitsApi.logFocus('science', 25)).toMatchObject({ date: TODAY, subject: 'science', mins: 25 });
    expect(await dashboardApi.habits()).toMatchObject({ focusTodayMins: 25, streak: 1, canRestToday: false });
    await habitsApi.logFocus('maths', 240);
    await habitsApi.logFocus('maths', 240);
    await expect(habitsApi.logFocus('maths', 240)).rejects.toMatchObject({ code: 'FOCUS_LIMIT_REACHED' });
  });

  it('takes rest days only before studying and at most twice a week', async () => {
    await onboarded();
    expect(await habitsApi.takeRestDay()).toMatchObject({ date: TODAY, rest: true });
    await expect(habitsApi.takeRestDay()).rejects.toMatchObject({ code: 'ALREADY_RESTING' });
    advanceDays(1);
    await habitsApi.takeRestDay();
    advanceDays(2);
    await expect(habitsApi.takeRestDay()).rejects.toMatchObject({ code: 'REST_LIMIT_REACHED' });
    advanceDays(3);
    await habitsApi.logFocus('maths', 10);
    await expect(habitsApi.takeRestDay()).rejects.toMatchObject({ code: 'ALREADY_STUDIED' });
  });

  it('saves the check-in and routines', async () => {
    await onboarded();
    expect((await habitsApi.saveCheckin({ sleep: 7.5, breaks: 3, screen: '1 to 2 h' })).checkin).toEqual({ sleep: 7.5, breaks: 3, screen: '1 to 2 h', saved: true });
    await expect(habitsApi.saveCheckin({ sleep: 7.3, breaks: 3, screen: '1 to 2 h' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await habitsApi.setHabitDone('morning-0', true);
    await habitsApi.setHabitDone('morning-2', true);
    const morning = (await dashboardApi.habits()).routine.habits.filter((habit) => habit.part === 'morning');
    expect(morning.map((habit) => habit.done)).toEqual([true, false, true]);
    await expect(habitsApi.setHabitDone('rocket', true)).rejects.toMatchObject({ code: 'HABIT_NOT_FOUND' });
  });

  it('lets the student customise the routine', async () => {
    await onboarded();
    // Wednesday 18 Nov: swimming on Mon, Wed and Fri after school.
    const swim = await habitsApi.addHabit({ name: 'Swimming', icon: 'waves', part: 'afternoon', days: [5, 1, 3, 3] });
    expect(swim).toMatchObject({ name: 'Swimming', icon: 'waves', part: 'afternoon', days: [1, 3, 5], createdOn: TODAY });
    await expect(habitsApi.addHabit({ name: ' swimming ', part: 'evening', days: [2] })).rejects.toMatchObject({ code: 'HABIT_EXISTS' });
    await expect(habitsApi.addHabit({ name: 'Gym', part: 'afternoon', days: [] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(habitsApi.addHabit({ name: 'Gym', part: 'night', days: [1] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const gym = await habitsApi.addHabit({ name: 'Gym', icon: '<script>', part: 'afternoon', days: [0, 1, 2, 3, 4, 5, 6] });
    expect(gym.icon).toBe('star');

    await habitsApi.moveHabit(gym.id, -1);
    await habitsApi.removeHabit('morning-1');
    await habitsApi.updateHabit('evening-2', { part: 'morning' });
    await expect(habitsApi.updateHabit(gym.id, { name: 'Swimming' })).rejects.toMatchObject({ code: 'HABIT_EXISTS' });

    const { routine } = await dashboardApi.habits();
    expect(routine.habits.map((habit) => `${habit.part}: ${habit.name}`)).toEqual([
      'morning: Look at today’s plan',
      'morning: Do one revision nudge',
      'evening: Tick off what you finished',
      'evening: Move anything that slipped',
      'afternoon: Gym',
      'afternoon: Swimming',
      'morning: Pick tomorrow’s first task',
    ]);
    expect(routine.habits.find((habit) => habit.name === 'Swimming')).toMatchObject({ scheduledToday: true, done: false, streak: 0 });
    expect(routine.week[6]).toEqual({ date: TODAY, due: 7, done: 0 });
    expect(read().profile.routine).toHaveLength(7);
  });

  it('keeps a habit’s streak across days it isn’t planned', async () => {
    await onboarded();
    const swim = await habitsApi.addHabit({ name: 'Swimming', part: 'afternoon', days: [1, 3, 5] });
    const swimming = async () => (await dashboardApi.habits()).routine.habits.find((habit) => habit.id === swim.id);
    await habitsApi.setHabitDone(swim.id, true); // Wed 18
    advanceDays(2); // Fri 20
    await habitsApi.setHabitDone(swim.id, true);
    advanceDays(4); // Sun 22: not planned
    expect(await swimming()).toMatchObject({ scheduledToday: false, streak: 2 });
    advanceDays(5); // Mon 23: planned and still open
    expect(await swimming()).toMatchObject({ scheduledToday: true, done: false, streak: 2 });
    advanceDays(7); // Wed 25: Monday was missed
    expect((await swimming()).streak).toBe(0);
  });

  it('reads routine ticks saved by older versions', async () => {
    await onboarded();
    write((draft) => {
      draft.dailyLogs[TODAY] = { date: TODAY, rest: false, checkin: null, routines: { morning: [true, false, true], evening: [false, true, false] }, bag: {} };
    });
    const ticks = () => dashboardApi.habits().then((habits) => habits.routine.habits.map((habit) => habit.done));
    expect(await ticks()).toEqual([true, false, true, false, true, false]);
    await habitsApi.setHabitDone('morning-0', false);
    expect(await ticks()).toEqual([false, false, true, false, true, false]);
  });

  it('summarises focus history, routines and how today counts for the streak', async () => {
    await onboarded();
    const before = await dashboardApi.habits();
    expect(before).toMatchObject({ todayState: null, studiedToday: false, restToday: false, streak: 0, bestStreak: 0, focusWeekMins: 0 });
    expect(before.routine.now).toBe('morning');

    await habitsApi.logFocus('maths', 25);
    await habitsApi.setHabitDone('morning-0', true);
    await habitsApi.setHabitDone('morning-1', true);
    const after = await dashboardApi.habits();
    expect(after.focusWeek).toHaveLength(7);
    expect(after.focusWeek[6]).toEqual({ date: TODAY, mins: 25 });
    expect(after.focusWeekMins).toBe(25);
    // Logged at 11:30 on the student's clock (06:00 UTC in Asia/Kolkata).
    expect(after.focusSessions).toEqual([expect.objectContaining({ subject: 'maths', mins: 25, time: '11:30' })]);
    expect(after).toMatchObject({ todayState: 'study', studiedToday: true, streak: 1, bestStreak: 1 });
    expect(after.routine.week).toHaveLength(7);
    expect(after.routine.week[6]).toEqual({ date: TODAY, due: 6, done: 2 });
  });

  it('remembers the best streak after a missed day', async () => {
    await onboarded();
    await habitsApi.logFocus('maths', 20);
    advanceDays(1);
    await habitsApi.logFocus('maths', 20);
    advanceDays(3);
    await habitsApi.logFocus('science', 20);
    expect(await dashboardApi.habits()).toMatchObject({ streak: 1, bestStreak: 2 });
  });

  it('builds the school bag for the next school day and ticks items', async () => {
    await onboarded();
    const bag = await habitsApi.bag();
    expect(bag.date).toBe('2026-11-19');
    const ticked = await habitsApi.setBagItem('2026-11-19', bag.items[0].id, true);
    expect(ticked.packed).toBe(1);
    await expect(habitsApi.setBagItem('2026-11-19', 'rocket', true)).rejects.toMatchObject({ code: 'UNKNOWN_BAG_ITEM' });
    await expect(habitsApi.bag('2026-12-30')).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
  });
});

describe('dashboards', () => {
  it('serves every screen', async () => {
    await onboarded();
    const progress = await dashboardApi.progress();
    expect(progress.coverage.total).toBeGreaterThan(50);
    expect(progress.last7).toHaveLength(7);
    expect((await dashboardApi.habits()).calendar).toHaveLength(28);
    expect((await dashboardApi.sharing()).preview).toMatchObject({ streak: 0, coveragePercent: 0 });
  });
});

describe('marks', () => {
  const classTest = { subject: 'maths', name: 'Maths class test', date: '2026-11-20', weight: 10, chapterKeys: ['maths-1'] };

  it('saves marks once a test has happened and shows them in Progress and the parent summary', async () => {
    await onboarded();
    const { exam } = await examsApi.create(classTest);
    await expect(examsApi.setResult(exam.id, { score: 30, outOf: 40 })).rejects.toMatchObject({ code: 'EXAM_NOT_TAKEN' });

    advanceDays(2); // Friday 20 Nov, the test day
    expect(await examsApi.setResult(exam.id, { score: 32.5, outOf: 40 })).toMatchObject({ result: { score: 32.5, outOf: 40 } });
    const progress = await dashboardApi.progress();
    expect(progress.results[0]).toMatchObject({ id: exam.id, name: 'Maths class test', result: { score: 32.5, outOf: 40, percent: 81 } });
    expect((await dashboardApi.sharing()).preview.recentMarks).toEqual([{ name: 'Maths class test', date: '2026-11-20', score: 32.5, outOf: 40, percent: 81 }]);

    advanceDays(20); // two weeks on, the marks drop out of the weekly summary but stay in Progress
    expect((await dashboardApi.sharing()).preview.recentMarks).toEqual([]);
    const later = await dashboardApi.progress();
    expect(later.results.map((test) => test.name)).toEqual(['Periodic test 2', 'Maths class test']);
    expect(later.results.find((test) => test.id === exam.id).result.percent).toBe(81);

    expect(await examsApi.setResult(exam.id, null)).toMatchObject({ result: null });
    expect((await dashboardApi.progress()).results.find((test) => test.id === exam.id).result).toBeNull();
  });

  it('checks the marks', async () => {
    await onboarded();
    const { exam } = await examsApi.create(classTest);
    advanceDays(3);
    const cases = [
      [{ score: 41, outOf: 40 }, 'score'],
      [{ score: -1, outOf: 40 }, 'score'],
      [{ score: 32.25, outOf: 40 }, 'score'],
      [{ score: Number.NaN, outOf: 40 }, 'score'],
      [{ score: 10, outOf: 0 }, 'outOf'],
      [{ score: 10, outOf: 1001 }, 'outOf'],
      [{ score: '10', outOf: 40 }, 'score'],
    ];
    for (const [result, field] of cases) {
      const error = await examsApi.setResult(exam.id, result).catch((caught) => caught);
      expect({ result, code: error.code, field: Object.keys(error.fieldErrors())[0] }).toEqual({ result, code: 'VALIDATION_ERROR', field });
    }
    await expect(examsApi.setResult('missing', { score: 1, outOf: 2 })).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
});

describe('adding a subject after setup', () => {
  it('adds the subject with its chapters, ready for tests and plans', async () => {
    await onboarded();
    const added = await profileApi.addSubject({ name: ' Sanskrit ', chapters: ['Sandhi', ' Samasa ', 'Karaka'] });
    expect(added).toEqual({ id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', chapters: 3 });

    const profile = await profileApi.get();
    expect(profile.subjects.at(-1)).toBe('custom1');
    expect(profile.subjectInfo.at(-1)).toEqual({ id: 'custom1', name: 'Sanskrit', color: '#5AC8FA', custom: true });
    expect((await chaptersApi.list('custom1')).map(({ key, name, status }) => [key, name, status])).toEqual([
      ['custom1-1', 'Sandhi', 'not'],
      ['custom1-2', 'Samasa', 'not'],
      ['custom1-3', 'Karaka', 'not'],
    ]);
    expect((await dashboardApi.progress()).subjects.at(-1)).toMatchObject({ name: 'Sanskrit', coverage: { total: 3 } });

    const { planned } = await examsApi.create({ subject: 'custom1', name: 'Sanskrit test', date: '2026-11-27', weight: 10, chapterKeys: ['custom1-1', 'custom1-2'] });
    expect(planned.added).toBeGreaterThan(0);
    expect(await habitsApi.logFocus('custom1', 20)).toMatchObject({ subject: 'custom1', mins: 20 });
  });

  it('refuses a clashing name, an empty list and a seventh added subject', async () => {
    await onboarded();
    const cases = [
      [{ name: 'maths', chapters: ['A'] }, 'DUPLICATE_SUBJECT'],
      [{ name: 'Sanskrit', chapters: [] }, 'VALIDATION_ERROR'],
      [{ name: '  ', chapters: ['A'] }, 'VALIDATION_ERROR'],
      [{ name: 'Sanskrit', chapters: Array.from({ length: 41 }, (_, index) => `Chapter ${index + 1}`) }, 'VALIDATION_ERROR'],
    ];
    for (const [body, code] of cases) await expect(profileApi.addSubject(body)).rejects.toMatchObject({ code });

    for (const name of ['Sanskrit', 'Odia', 'Computers', 'Music', 'Art', 'French']) await profileApi.addSubject({ name, chapters: ['One'] });
    await expect(profileApi.addSubject({ name: 'German', chapters: ['One'] })).rejects.toMatchObject({ code: 'TOO_MANY_SUBJECTS' });
    expect(new Set((await profileApi.get()).subjectInfo.map((subject) => subject.color)).size).toBe(11);
  });
});
