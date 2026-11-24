import { chaptersApi, dashboardApi, examsApi, habitsApi, homeworkApi, planApi, profileApi, suggestionsApi, syllabusApi, tasksApi } from '../api';
import { addDays } from '../core/dates';
import { read } from '../db';
import { advanceDays, freshPlanner, ONBOARDING, TODAY } from './helpers';

beforeEach(freshPlanner);

const tasksFrom = (from = TODAY) => read().tasks.filter((task) => task.date >= from);
const onboarded = () => profileApi.onboard(ONBOARDING);

describe('setup', () => {
  it('lists the syllabus', async () => {
    expect(await syllabusApi.classes()).toContainEqual({ cls: 9, available: true });
    const syllabus = await syllabusApi.forClass(9);
    expect(syllabus.map((subject) => subject.id)).toEqual(ONBOARDING.subjects);
    await expect(syllabusApi.forClass(6)).rejects.toMatchObject({ code: 'CLASS_NOT_AVAILABLE' });
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
      [{ cls: 6 }, 'CLASS_NOT_AVAILABLE'],
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
    expect(demo.profile).toMatchObject({ name: 'Ravi', isDemo: true });
    const today = await dashboardApi.today();
    expect(today.tasks.length).toBeGreaterThan(0);
    expect(today.streak).toBeGreaterThan(0);
    expect(today.suggestions.some((item) => item.kind === 'move')).toBe(true);
  });

  it('changes settings', async () => {
    await onboarded();
    const profile = await profileApi.update({ name: 'Asha K', ageMode: 'simple', examSeason: true, sharing: { items: { marks: true } } });
    expect(profile).toMatchObject({ name: 'Asha K', ageMode: 'simple', examSeason: true, sharing: { items: { hours: true, marks: true } } });
    await expect(profileApi.update({})).rejects.toMatchObject({ status: 400 });
    await expect(profileApi.update({ ageMode: 'expert' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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
});

describe('daily homework and self study slots', () => {
  it('every day has a Homework slot, and Test prep replaces Self study in the two weeks before a test', async () => {
    await onboarded(); // Periodic test 2 on Sat 28 Nov
    for (const { date } of await planApi.strip()) {
      const slots = (await planApi.day(date)).rows.filter((row) => row.type === 'slot');
      const beforeTest = date < '2026-11-28' && date >= '2026-11-14';
      expect(slots.map((row) => row.kind)).toEqual(['homework', beforeTest ? 'exam' : 'study']);
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
});

describe('half-yearly and final exams', () => {
  const papersFor = (exams) => exams.map(({ subject, date, chapterKeys }) => ({ subject, date, chapterKeys }));

  it('drafts one paper per subject on back-to-back days with the usual chapters ticked', async () => {
    await onboarded();
    const draft = await examsApi.seriesDraft('halfYearly', '2026-12-11');
    expect(draft.map((paper) => [paper.subject, paper.date])).toEqual([
      ['maths', '2026-12-11'],
      ['science', '2026-12-12'],
      ['sst', '2026-12-14'], // Sunday skipped
      ['english', '2026-12-15'],
      ['hindi', '2026-12-16'],
    ]);
    const maths = draft[0];
    expect(maths.name).toBe('Half-yearly: Maths');
    expect(maths.chapterKeys).toEqual(maths.chapters.slice(0, Math.ceil(maths.chapters.length / 2)).map((chapter) => chapter.key));
    const final = await examsApi.seriesDraft('final', '2027-02-22', false);
    expect(final[0].chapterKeys).toHaveLength(final[0].chapters.length);
    await expect(examsApi.seriesDraft('weekly', '2027-02-22')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('adds every paper and plans a mixed timetable on the calendar', async () => {
    await onboarded();
    const draft = await examsApi.seriesDraft('halfYearly', '2026-12-14');
    const { exams, planned } = await examsApi.createSeries({ type: 'halfYearly', papers: papersFor(draft) });
    expect(exams).toHaveLength(5);
    expect(new Set(exams.map((exam) => exam.seriesId)).size).toBe(1);
    expect(exams[0]).toMatchObject({ type: 'halfYearly', seriesName: 'Half-yearly', weight: 30, prepFrom: '2026-11-16' });
    expect(planned).toMatchObject({ papers: 5, reason: null });
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
    const draft = await examsApi.seriesDraft('halfYearly', '2026-12-14');
    await examsApi.createSeries({ type: 'halfYearly', papers: papersFor(draft) });
    expect((await planApi.day(TODAY)).slots[1]).toMatchObject({ kind: 'exam', label: 'Test prep', detail: 'Half-yearly' });
    const strip = await planApi.strip();
    expect(strip.at(-1).date).toBe('2026-12-18');
    expect(strip.filter((day) => day.hasExam)).toHaveLength(5);
  });

  it('uses the default chapters when none are sent, and checks every paper', async () => {
    await onboarded();
    const { exams } = await examsApi.createSeries({ type: 'final', papers: [{ subject: 'maths', date: '2027-02-22' }] });
    expect(exams[0].chapterKeys.length).toBe(read().chapters.filter((chapter) => chapter.subject === 'maths').length);
    const bad = [
      [{ type: 'weekly', papers: [{ subject: 'maths', date: '2027-02-22' }] }, 'VALIDATION_ERROR'],
      [{ type: 'final', papers: [] }, 'VALIDATION_ERROR'],
      [{ type: 'final', papers: [{ subject: 'maths', date: TODAY }] }, 'EXAM_IN_PAST'],
      [{ type: 'final', papers: [{ subject: 'maths', date: '2027-02-22' }, { subject: 'maths', date: '2027-02-23' }] }, 'DUPLICATE_PAPER'],
      [{ type: 'final', papers: [{ subject: 'maths', date: '2027-02-22', chapterKeys: ['science-1'] }] }, 'UNKNOWN_CHAPTER'],
    ];
    for (const [input, code] of bad) await expect(examsApi.createSeries(input)).rejects.toMatchObject({ code });
  });

  it('removing one paper removes only that paper and its unfinished slots', async () => {
    await onboarded();
    const draft = await examsApi.seriesDraft('halfYearly', '2026-12-14');
    const { exams } = await examsApi.createSeries({ type: 'halfYearly', papers: papersFor(draft) });
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
    await habitsApi.saveRoutines({ morning: [true, false, true], evening: [false, false, true] });
    expect((await dashboardApi.habits()).routines.morning.map((entry) => entry.done)).toEqual([true, false, true]);
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
