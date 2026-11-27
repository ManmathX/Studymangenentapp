import { dashboardApi, examsApi, habitsApi, homeworkApi, planApi, profileApi, tasksApi } from '../api';
import { addDays } from '../core/dates';
import { read } from '../db';
import { freshPlanner, ONBOARDING, TODAY } from './helpers';

// TODAY is Wednesday 18 Nov 2026. School is 07:45 to 13:45; tuition Mon, Wed, Fri 16:00 to 17:30.
beforeEach(freshPlanner);

const at = (hours, minutes = 0) => hours * 60 + minutes;
const onboarded = (patch = {}) => profileApi.onboard({ ...ONBOARDING, ...patch });
const SUBJECTS = { maths: 'Maths', science: 'Science', sst: 'Social Science', english: 'English', hindi: 'Hindi' };
const firstChapters = (subject) => read().chapters.filter((chapter) => chapter.subject === subject).slice(0, 4).map((chapter) => chapter.key);
/** The day's fixed blocks other than sleep and habits. */
const fixedKinds = (day) => day.rows.filter((row) => row.type === 'fixed' && row.kind !== 'sleep' && row.kind !== 'habit').map((row) => row.kind);
const taskRows = (day) => day.rows.filter((row) => row.type === 'task');

/** Every timeline row starts after the one before it ends. */
function expectNoOverlaps(day) {
  const rows = day.rows.filter((row) => row.type !== 'slot').sort((a, b) => a.start - b.start);
  rows.forEach((row, index) => {
    if (index) expect(row.start).toBeGreaterThanOrEqual(rows[index - 1].end);
  });
}

/** A half-yearly with one paper a day on back-to-back days from `first` (Sundays skipped). */
function backToBack(first, extra = {}) {
  const dates = [];
  for (let date = first; dates.length < 5; date = addDays(date, 1)) if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) dates.push(date);
  return {
    series: 'Half-yearly',
    kind: 'halfYearly',
    paperStart: '09:00',
    paperEnd: '12:00',
    papers: Object.keys(SUBJECTS).map((subject, index) => ({ subject, name: `Half-yearly: ${SUBJECTS[subject]}`, date: dates[index], chapterKeys: firstChapters(subject) })),
    ...extra,
  };
}

describe('exams on continuous days', () => {
  it('handles a half-yearly written on five days in a row', async () => {
    await onboarded();
    // Monday 14 Dec to Friday 18 Dec, 09:00 to 12:00.
    const { exams, planned } = await examsApi.createDatesheet(backToBack('2026-12-14'));
    expect(exams.map((exam) => exam.date)).toEqual(['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18']);
    expect(exams.every((exam) => exam.start === at(9) && exam.end === at(12) && exam.studyLeave === true)).toBe(true);
    expect(planned.added).toBeGreaterThan(20);

    for (const exam of exams) {
      const day = await planApi.day(exam.date);
      // The paper replaces school; there is no Homework slot during the exam.
      expect(day.frame).toMatchObject({ dayType: 'paper', examPeriod: 'Half-yearly' });
      expect(day.rows.find((row) => row.kind === 'exam')).toMatchObject({ label: exam.name, start: at(9), end: at(12) });
      expect(fixedKinds(day)).not.toContain('school');
      expect(day.slots.some((slot) => slot.kind === 'homework')).toBe(false);
      expectNoOverlaps(day);
      expect(day.overflow).toEqual([]);
      // Nothing for a paper is planned on or after its own day.
      expect(read().tasks.some((task) => task.examId === exam.id && task.date >= exam.date)).toBe(false);
      // The evening before each paper (for most papers, the afternoon of the previous paper) revises that whole subject.
      const before = await planApi.day(addDays(exam.date, -1));
      expect(taskRows(before).some((row) => row.task.title === `Revision: all chapters for ${exam.name}`)).toBe(true);
      expectNoOverlaps(before);
      expect(before.overflow).toEqual([]);
    }
    // While papers are left, the afternoon slot is Exam revision for them.
    const monday = await planApi.day('2026-12-14');
    expect(monday.slots.filter((slot) => slot.kind !== 'night').every((slot) => slot.label === 'Exam revision')).toBe(true);
    expect(monday.slots.at(-1).label).toBe('Night revision');
    // The school week after the exam is back to normal.
    const after = await planApi.day('2026-12-21');
    expect(after.frame.dayType).toBe('school');
    expect(after.slots[0].kind).toBe('homework');
  });

  it('gives a gap day between papers to study (study leave), or keeps school when switched off', async () => {
    await onboarded();
    const papers = backToBack('2026-12-14').papers.map((paper, index) => ({ ...paper, date: ['2026-12-14', '2026-12-16', '2026-12-17', '2026-12-18', '2026-12-19'][index] }));
    const { exams } = await examsApi.createDatesheet({ ...backToBack('2026-12-14'), papers });
    const gap = await planApi.day('2026-12-15');
    expect(gap.frame).toMatchObject({ dayType: 'studyLeave', reason: 'Half-yearly' });
    expect(fixedKinds(gap)).not.toContain('school');
    // No school, so the gap day has far more study time than a school day.
    expect(gap.limitMins).toBeGreaterThan((await planApi.day('2026-12-22')).limitMins);
    await examsApi.update(exams[0].id, { studyLeave: false });
    expect(read().exams.filter((exam) => exam.seriesId === exams[0].seriesId).every((exam) => exam.studyLeave === false)).toBe(true);
    expect((await planApi.day('2026-12-15')).frame.dayType).toBe('school');
  });

  it('plans unit tests on back-to-back days, each with its revision the evening before', async () => {
    await onboarded({ exams: [] });
    const dates = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03'];
    const subjects = ['maths', 'science', 'sst', 'english'];
    const { exams, planned } = await examsApi.createDatesheet({
      series: 'Unit test 2',
      kind: 'unit',
      papers: subjects.map((subject, index) => ({ subject, name: `UT 2: ${SUBJECTS[subject]}`, date: dates[index], chapterKeys: firstChapters(subject).slice(0, 2) })),
    });
    expect(planned.added).toBeGreaterThan(0);
    for (const exam of exams) {
      expect(read().tasks.some((task) => task.examId === exam.id && task.date >= exam.date)).toBe(false);
      const before = await planApi.day(addDays(exam.date, -1));
      expect(taskRows(before).some((row) => row.task.title === `Revision: all chapters for ${exam.name}`)).toBe(true);
      expect(before.overflow).toEqual([]);
      // A unit test is written in school: the school block names it.
      expect((await planApi.day(exam.date)).rows.find((row) => row.kind === 'school').label).toBe(`School · ${exam.name}`);
    }
  });

  it('checks the paper time', async () => {
    await onboarded();
    const cases = [
      [{ paperStart: '12:00', paperEnd: '09:00' }, 'The paper has to end after it starts'],
      [{ paperStart: '08:00', paperEnd: '13:00' }, 'A paper lasts between 1 and 4 hours'],
      [{ paperStart: '05:00', paperEnd: '07:00' }, 'Papers are written between 06:00 and 18:00'],
      [{ paperStart: '9am', paperEnd: '12:00' }, 'Use HH:MM'],
    ];
    for (const [time, message] of cases) {
      await expect(examsApi.createDatesheet({ ...backToBack('2026-12-14'), ...time })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message });
    }
    const { exams } = await examsApi.createDatesheet(backToBack('2026-12-14'));
    expect(await examsApi.update(exams[0].id, { paperStart: '10:30', paperEnd: '13:30' })).toMatchObject({ start: at(10, 30), end: at(13, 30) });
    expect(await examsApi.update(exams[0].id, { paperStart: null })).not.toHaveProperty('start');
    const [unitTest] = read().exams.filter((exam) => exam.type === 'unit');
    await expect(examsApi.update(unitTest.id, { paperStart: '09:00', paperEnd: '10:00' })).rejects.toMatchObject({ code: 'NOT_A_TERM_PAPER' });
  });
});

describe('school days: Saturdays, holidays and Sunday tuition', () => {
  it('follows the Saturday setting', async () => {
    await onboarded();
    expect((await planApi.day('2026-11-21')).frame.dayType).toBe('halfDay');
    expect((await profileApi.update({ saturday: 'alternate' })).saturday).toBe('alternate');
    expect((await planApi.day('2026-11-21')).frame.dayType).toBe('halfDay'); // 3rd Saturday
    expect((await planApi.day('2026-11-28')).frame).toMatchObject({ dayType: 'noSchool', reason: 'Saturday off' }); // 4th
    await profileApi.update({ saturday: 'off' });
    expect(fixedKinds(await planApi.day('2026-11-21'))).not.toContain('school');
    await expect(profileApi.update({ saturday: 'sometimes' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('refuses a Saturday change that makes a tuition clash with school', async () => {
    await onboarded({ tuitions: [{ name: 'Art class', days: [6], start: '10:00', end: '11:00' }], saturday: 'off' });
    await expect(profileApi.update({ saturday: 'half' })).rejects.toMatchObject({ message: 'Art class on Saturday clashes with school (07:45 to 12:30)' });
  });

  it('adds and removes holidays; there is no school on them and they plan like a Sunday', async () => {
    await onboarded();
    const diwali = await profileApi.addHoliday({ name: ' Diwali break ', from: '2026-11-19', to: '2026-11-21' });
    expect(diwali).toMatchObject({ name: 'Diwali break', from: '2026-11-19', to: '2026-11-21' });
    const day = await planApi.day('2026-11-20');
    expect(day.frame).toMatchObject({ dayType: 'noSchool', reason: 'Diwali break' });
    // Breakfast, lunch at 13:00 and an afternoon rest, tuition, dinner.
    expect(fixedKinds(day)).toEqual(['meal', 'meal', 'break', 'tuition', 'meal']);
    expect(day.limitMins).toBeGreaterThan((await planApi.day('2026-11-26')).limitMins);
    expect((await profileApi.get()).holidays).toEqual([diwali]);
    expect((await dashboardApi.sharing()).holidays).toEqual([diwali]);

    const cases = [
      [{ name: '', from: '2026-12-01' }, 'VALIDATION_ERROR'],
      [{ name: 'Winter', from: '2026-12-31', to: '2026-12-20' }, 'VALIDATION_ERROR'],
      [{ name: 'Summer', from: '2027-04-01', to: '2027-07-15' }, 'VALIDATION_ERROR'],
      [{ name: 'Gone', from: '2026-11-01', to: '2026-11-10' }, 'HOLIDAY_IN_PAST'],
    ];
    for (const [input, code] of cases) await expect(profileApi.addHoliday(input)).rejects.toMatchObject({ code });
    expect(await profileApi.addHoliday({ name: 'Guru Nanak Jayanti', from: '2026-11-24' })).toMatchObject({ to: '2026-11-24' });

    await profileApi.removeHoliday(diwali.id);
    expect((await planApi.day('2026-11-20')).frame.dayType).toBe('school');
    await expect(profileApi.removeHoliday(diwali.id)).rejects.toMatchObject({ code: 'HOLIDAY_NOT_FOUND' });
  });

  it('allows tuition on Sundays', async () => {
    const { profile } = await onboarded({ tuitions: [{ name: 'Sunday test series', days: [0], start: '10:00', end: '12:00' }] });
    expect(profile.tuitions).toEqual([{ name: 'Sunday test series', days: [0], start: at(10), end: at(12) }]);
    expect((await planApi.day('2026-11-22')).rows.find((row) => row.kind === 'tuition')).toMatchObject({ label: 'Sunday test series', start: at(10) });
  });
});

describe('self study sessions and stop time', () => {
  it('fills the student’s own sessions first', async () => {
    await onboarded({ exams: [] });
    // Waking at 05:00 and sleeping at 22:30 would leave only 6.5 hours of sleep.
    await expect(profileApi.update({ wakeAt: '05:00', studyEnd: '22:30' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'That leaves less than 7 hours of sleep. Teens need 8 to 10 hours.' });
    const profile = await profileApi.update({ wakeAt: '05:00', studySessions: [{ start: '18:30', end: '20:00' }, { start: '05:30', end: '06:30' }] });
    expect(profile).toMatchObject({ wakeAt: at(5), studyEnd: at(22), studySessions: [{ start: at(5, 30), end: at(6, 30) }, { start: at(18, 30), end: at(20) }] });
    // Thursday, no tuition: both sessions are self study, the rest of the free time too (the
    // default evening habits take 20:45–21:00), and the night ends with revision before sleep.
    const day = await planApi.day('2026-11-19');
    expect(day.slots.map(({ kind, start, end }) => [kind, start, end])).toEqual([
      ['homework', at(15), at(16)],
      ['study', at(5, 30), at(6, 30)],
      ['study', at(16), at(18, 30)],
      ['study', at(18, 30), at(20)],
      ['study', at(21), at(21, 35)],
      ['night', at(21, 35), at(22)],
    ]);
    expect(day.slots.filter((slot) => slot.session).map((slot) => slot.start)).toEqual([at(5, 30), at(18, 30)]);
    expect((await dashboardApi.sharing()).studySessions).toEqual(profile.studySessions);
  });

  it('checks sessions and the stop time', async () => {
    await onboarded();
    const cases = [
      [{ studySessions: [{ start: '06:00', end: '06:20' }] }, 'A study session needs at least 30 minutes'],
      [{ studySessions: [{ start: '05:00', end: '06:00' }] }, 'Start study sessions after you wake up (06:00)'],
      [{ studySessions: [{ start: '21:30', end: '22:30' }] }, 'End study sessions by 22:00, when you sleep'],
      [{ studySessions: [{ start: '18:00', end: '19:30' }, { start: '19:00', end: '20:00' }] }, 'Your two study sessions overlap'],
      [{ studySessions: [{ start: '05:00', end: '06:00' }, { start: '07:00', end: '08:00' }, { start: '19:00', end: '20:00' }] }, 'Pick at most 2'],
      [{ studyEnd: '23:30' }, 'Choose one of the options'],
    ];
    for (const [patch, message] of cases) await expect(profileApi.update(patch)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message });
    expect(await profileApi.update({ studySessions: [] })).toMatchObject({ studySessions: [] });
  });
});

describe('habits with a set time', () => {
  it('block their time on the plan, and study is planned around them', async () => {
    await onboarded();
    const swim = await habitsApi.addHabit({ name: 'Swimming', icon: 'waves', part: 'afternoon', days: [1, 3, 5], at: '18:00', mins: 60 });
    expect(swim).toMatchObject({ at: at(18), mins: 60 });
    const day = await planApi.day(TODAY);
    expect(day.rows.find((row) => row.label === 'Swimming')).toMatchObject({ kind: 'habit', start: at(18), end: at(19) });
    expectNoOverlaps(day);
    expect((await dashboardApi.habits()).routine.habits.find((habit) => habit.id === swim.id)).toMatchObject({ at: at(18), mins: 60 });

    // Untimed habits stay a checklist; clearing the time takes the block away.
    await habitsApi.updateHabit(swim.id, { at: null });
    expect((await planApi.day(TODAY)).rows.some((row) => row.label === 'Swimming' && !row.auto)).toBe(false);
  });

  it('refuses a time that clashes with school, tuition or another timed habit', async () => {
    await onboarded();
    await habitsApi.addHabit({ name: 'Swimming', part: 'afternoon', days: [1, 3, 5], at: '18:00', mins: 60 });
    const cases = [
      [{ name: 'Gym', part: 'afternoon', days: [2, 3], at: '16:30', mins: 30 }, 'Gym on Wednesday clashes with Tuition (16:00 to 17:30)'],
      [{ name: 'Yoga', part: 'morning', days: [1], at: '07:30', mins: 30 }, 'Yoga on Monday clashes with school (07:45 to 13:45)'],
      [{ name: 'Dance', part: 'evening', days: [5], at: '18:30', mins: 60 }, 'Dance on Friday clashes with Swimming (18:00 to 19:00)'],
      [{ name: 'Night walk', part: 'evening', days: [1], at: '23:00', mins: 60 }, 'Finish the habit by 23:30'],
      [{ name: 'Run', part: 'morning', days: [1], at: '06:00', mins: 0 }, 'Use a whole number from 5 to 180'],
    ];
    for (const [input, message] of cases) await expect(habitsApi.addHabit(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message });
    // Moving tuition onto the habit's time is refused too, naming the habit.
    await expect(profileApi.update({ tuitions: [{ name: 'Maths', days: [1, 3, 5], start: '17:30', end: '18:30' }] })).rejects.toMatchObject({
      message: 'Swimming on Monday clashes with Maths (17:30 to 18:30). Change the habit’s time first.',
    });
  });
});

describe('the month calendar', () => {
  it('shows each day’s kind, tests, preparation and load', async () => {
    await onboarded();
    await profileApi.addHoliday({ name: 'Winter break', from: '2026-12-24', to: '2026-12-31' });
    await examsApi.createDatesheet(backToBack('2026-12-14'));
    const month = await planApi.month('2026-12');
    expect(month).toHaveLength(31);
    const day = (date) => month.find((item) => item.date === date);
    expect(day('2026-12-14')).toMatchObject({ dayType: 'paper', examPeriod: true, tests: [{ name: 'Half-yearly: Maths', kind: 'halfYearly' }] });
    expect(day('2026-12-01')).toMatchObject({ dayType: 'school', prep: 'big' });
    expect(day('2026-12-06')).toMatchObject({ dayType: 'noSchool', reason: 'Sunday' });
    expect(day('2026-12-25')).toMatchObject({ dayType: 'noSchool', reason: 'Winter break', prep: null });
    expect(month.every((item) => item.capacityMins <= item.limitMins)).toBe(true);
    // 15 Nov is in the periodic test's two weeks but before the half-yearly's four weeks of preparation.
    expect((await planApi.month('2026-11')).find((item) => item.date === '2026-11-15')).toMatchObject({ prep: 'unit' });
    await expect(planApi.month('2026-13')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(planApi.month('2029-01')).rejects.toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
  });
});

describe('when there is not enough time', () => {
  it('reports test steps that did not fit instead of overloading days', async () => {
    await onboarded({ exams: [] });
    const chapterKeys = read().chapters.filter((chapter) => chapter.subject === 'science').slice(0, 10).map((chapter) => chapter.key);
    const { planned } = await examsApi.createDatesheet({ series: 'Class test', kind: 'unit', papers: [{ subject: 'science', name: 'Science class test', date: '2026-11-20', chapterKeys }] });
    expect(planned.unplaced).toBeGreaterThan(0);
    for (const date of [TODAY, '2026-11-19']) {
      const day = await planApi.day(date);
      expect(day.overflow).toEqual([]);
      expect(day.plannedMins).toBeLessThanOrEqual(day.limitMins + 30);
    }
  });

  it('keeps homework out of exam days when other days have room', async () => {
    await onboarded();
    await examsApi.createDatesheet(backToBack('2026-11-30'));
    const { tasks } = await homeworkApi.create({ subject: 'maths', title: 'Holiday worksheet', note: '', due: '2026-12-05', mins: 30, difficulty: 1 });
    expect(tasks.every((task) => task.date < '2026-11-30')).toBe(true);
  });
});

describe('every day: self study, daily revision and night revision', () => {
  const daily = (type, date) => read().tasks.filter((task) => task.daily?.type === type && (!date || task.date === date));

  it('fills days without a test with self study, and every day with daily and night revision', async () => {
    await onboarded({ exams: [] });
    const today = await dashboardApi.today();
    // The coming week is filled once; opening Today again adds nothing.
    const planned = read().tasks.length;
    await dashboardApi.today();
    expect(read().tasks.length).toBe(planned);

    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(TODAY, offset);
      const day = await planApi.day(date);
      expectNoOverlaps(day);
      expect(day.overflow).toEqual([]);
      // The study slots are full: no gap is left that could hold another step (20 minutes) and its break.
      const tasks = taskRows(day);
      for (const slot of day.slots.filter((item) => item.kind === 'study')) {
        let cursor = slot.start;
        let largestGap = 0;
        for (const row of tasks.filter((item) => item.start < slot.end && item.end > slot.start).sort((a, b) => a.start - b.start)) {
          largestGap = Math.max(largestGap, row.start - cursor);
          cursor = Math.max(cursor, row.end);
        }
        largestGap = Math.max(largestGap, slot.end - cursor);
        expect(largestGap).toBeLessThan(30);
      }
      // Night revision sits in its own slot at the end of the day.
      const night = day.slots.find((slot) => slot.kind === 'night');
      const nightRows = taskRows(day).filter((row) => row.task.daily?.type === 'night');
      expect(nightRows.length).toBeGreaterThan(0);
      for (const row of nightRows) expect(row.start).toBeGreaterThanOrEqual(night.start);
    }
    // Wednesday: school, tuition and the day's study are all revised at night.
    expect(daily('night', TODAY).map((task) => task.title)).toEqual([
      'Night revision: what school taught today',
      'Night revision: today’s tuition notes',
      expect.stringMatching(/^Night revision: /),
    ]);
    // Chapters taught in class (maths-1, maths-2, science-1) come first today: revised if their
    // spaced revision is due, otherwise practised, before any new chapter is started.
    const coveredToday = [...daily('revision', TODAY), ...daily('study', TODAY)].map((task) => task.chapterKey);
    expect(coveredToday).toEqual(expect.arrayContaining(['maths-1', 'maths-2', 'science-1']));
    expect(daily('study', TODAY)[0]).toMatchObject({ chapterKey: 'science-1', kind: 'practice' });
    // A chapter studied today is revised tomorrow.
    const studiedToday = daily('study', TODAY).map((task) => task.chapterKey);
    expect(daily('revision', addDays(TODAY, 1)).some((task) => studiedToday.includes(task.chapterKey))).toBe(true);
    expect(today.tasks.some(({ task }) => task.daily)).toBe(true);
  });

  it('keeps test-preparation days for the test: no self study there, but daily and night revision stay', async () => {
    await onboarded({ exams: [] });
    await dashboardApi.today();
    expect(daily('study', addDays(TODAY, 2)).length).toBeGreaterThan(0);
    await examsApi.create({ subject: 'maths', name: 'Maths quiz', date: addDays(TODAY, 4), weight: 10, chapterKeys: ['maths-1'] });
    for (let offset = 0; offset < 4; offset += 1) {
      const date = addDays(TODAY, offset);
      expect(daily('study', date).filter((task) => !task.done)).toEqual([]);
      expect(daily('night', date).length).toBeGreaterThan(0);
    }
    // After the quiz, self study is back.
    expect(daily('study', addDays(TODAY, 5)).length).toBeGreaterThan(0);
  });

  it('counts a finished daily revision as the chapter’s spaced revision, and moves chapters on as steps are done', async () => {
    await onboarded({ exams: [] });
    await dashboardApi.today();
    const revision = daily('revision').find((task) => task.date === TODAY) ?? daily('revision')[0];
    const before = read().chapters.find((chapter) => chapter.key === revision.chapterKey).revisions;
    const { chapter } = await tasksApi.update(revision.id, { done: true });
    expect(chapter.revisions).toBe(before + 1);
    const step = daily('study', TODAY).find((task) => task.kind === 'practice');
    expect((await tasksApi.update(step.id, { done: true })).chapter.status).toBe('practiced');
  });
});
