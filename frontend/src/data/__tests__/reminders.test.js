import { dashboardApi, examsApi, habitsApi, homeworkApi, planApi, profileApi, remindersApi } from '../api';
import { instantAt } from '../core/dates';
import { MAX_REMINDERS } from '../reminders';
import { advanceDays, freshPlanner, NOW, ONBOARDING, TODAY } from './helpers';

/** Wednesday 18 Nov 2026, 11:30 in Kolkata. Asha wakes at 06:00 and sleeps at 22:00 (the defaults). */
const TOMORROW = '2026-11-19';
const ZONE = 'Asia/Kolkata';
const at = (date, minutes) => instantAt(date, minutes, ZONE);
const ids = (list) => list.map((item) => item.id);

beforeEach(async () => {
  await freshPlanner();
  await profileApi.onboard(ONBOARDING);
  // Opening Today fills the coming week with self study and night revision.
  await dashboardApi.today();
});

describe('instantAt', () => {
  it('turns a day and a clock time into the moment it happens there', () => {
    expect(instantAt('2026-11-18', 18 * 60, ZONE)).toBe(Date.parse('2026-11-18T12:30:00Z'));
    // Daylight saving: 09:00 in New York is 13:00 UTC in July and 14:00 UTC in January.
    expect(instantAt('2026-07-01', 9 * 60, 'America/New_York')).toBe(Date.parse('2026-07-01T13:00:00Z'));
    expect(instantAt('2026-01-15', 9 * 60, 'America/New_York')).toBe(Date.parse('2026-01-15T14:00:00Z'));
  });
});

describe('upcoming reminders', () => {
  it('are in the future, while the student is awake, soonest first and within the iOS limit', async () => {
    const list = await remindersApi.upcoming();
    expect(list.length).toBeGreaterThan(5);
    expect(list.length).toBeLessThanOrEqual(MAX_REMINDERS);
    for (const item of list) {
      expect(item.at).toBeGreaterThan(NOW.getTime());
      expect(item.minute).toBeGreaterThanOrEqual(6 * 60);
      expect(item.minute).toBeLessThan(22 * 60);
      expect(item.at).toBe(at(item.date, item.minute));
      expect(item.id).toMatch(/^plan:/);
    }
    expect(list.map((item) => item.at)).toEqual([...list.map((item) => item.at)].sort((a, b) => a - b));
    expect(new Set(ids(list)).size).toBe(list.length);
  });

  it('come before each slot with open work, at the time the timeline shows', async () => {
    const list = (await remindersApi.upcoming()).filter((item) => item.kind === 'slots');
    expect(list.some((item) => item.title.startsWith('Night revision at'))).toBe(true);
    for (const item of list) {
      const day = await planApi.day(item.date);
      const starts = day.rows.filter((row) => row.type === 'task' && !row.task.done).map((row) => row.start);
      // Five minutes before a task on that day's timeline (the default).
      expect(starts).toContain(item.minute + 5);
      expect(item.open).toEqual({ screen: 'Today' });
    }
  });

  it('follow the student’s choices: kinds off, and how early slot reminders come', async () => {
    const before = await remindersApi.upcoming();
    const night = before.find((item) => item.id.startsWith(`plan:slots:${TODAY}:night`));
    await profileApi.update({ reminders: { leadMins: 15 } });
    const earlier = (await remindersApi.upcoming()).find((item) => item.id === night.id);
    expect(earlier.minute).toBe(night.minute - 10);

    await profileApi.update({ reminders: { slots: false, streak: false } });
    const after = await remindersApi.upcoming();
    expect(after.some((item) => item.kind === 'slots' || item.kind === 'streak')).toBe(false);
    expect((await profileApi.get()).reminders).toMatchObject({ slots: false, streak: false, tests: true, leadMins: 15 });

    await expect(profileApi.update({ reminders: { leadMins: 7 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(profileApi.update({ reminders: { pigeons: true } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('warn the evening before a test and homework, and open the plan on that day', async () => {
    await examsApi.create({ subject: 'science', name: 'Science quiz', date: TOMORROW, weight: 10, chapterKeys: ['science-1'] });
    await homeworkApi.create({ subject: 'english', title: 'Essay on trees', due: TOMORROW, mins: 30, difficulty: 2 });
    const eve = (await remindersApi.upcoming()).find((item) => item.id === `plan:tests:${TODAY}:tomorrow`);
    expect(eve).toMatchObject({ minute: 18 * 60, title: 'Tomorrow: Science quiz', open: { screen: 'Plan', section: 'plan', date: TOMORROW } });
    expect(eve.body).toContain('English homework: Essay on trees');
  });

  it('ask for marks three days after a test, until they are added', async () => {
    const { exam } = await examsApi.create({ subject: 'science', name: 'Science quiz', date: TOMORROW, weight: 10, chapterKeys: ['science-1'] });
    advanceDays(4);
    const marks = (await remindersApi.upcoming()).find((item) => item.id === `plan:tests:2026-11-22:marks-${exam.id}`);
    expect(marks).toMatchObject({ title: 'Got your Science quiz marks?', open: { screen: 'Habits', section: 'progress' } });
    await examsApi.setResult(exam.id, { score: 18, outOf: 20 });
    expect((await remindersApi.upcoming()).some((item) => item.id === marks.id)).toBe(false);
  });

  it('say what to pack the evening before a school day, but not before Sunday', async () => {
    const bags = (await remindersApi.upcoming()).filter((item) => item.kind === 'bag');
    // Wednesday, Thursday and Friday evenings; Saturday's would be for Sunday.
    expect(bags.map((item) => item.date)).toEqual([TODAY, TOMORROW, '2026-11-20']);
    expect(bags[0]).toMatchObject({ title: 'Pack your bag for tomorrow', minute: 20 * 60 + 45 });
    expect(bags[0].body).toMatch(/^Books for .+\. Don’t forget your ID card and water bottle\.$/);
  });

  it('nudge about the streak only on days with nothing done', async () => {
    const nudgeToday = `plan:streak:${TODAY}:streak`;
    expect(ids(await remindersApi.upcoming())).toContain(nudgeToday);
    await habitsApi.logFocus('maths', 20);
    const after = ids(await remindersApi.upcoming());
    expect(after).not.toContain(nudgeToday);
    expect(after).toContain(`plan:streak:${TOMORROW}:streak`);
    // Once the reminders run out, one nudge to open the app again.
    expect(after).toContain('plan:streak:2026-11-22:come-back');
  });

  it('remind about a habit at its set time until it is ticked', async () => {
    const habit = await habitsApi.addHabit({ name: 'Swimming', part: 'evening', days: [0, 1, 2, 3, 4, 5, 6], at: '19:00', mins: 45 });
    const id = `plan:focus:${TODAY}:habit-${habit.id}`;
    const reminder = (await remindersApi.upcoming()).find((item) => item.id === id);
    expect(reminder).toMatchObject({ minute: 19 * 60, title: 'Swimming at 19:00', category: 'habit', habitId: habit.id });
    await habitsApi.setHabitDone(habit.id, true);
    expect(ids(await remindersApi.upcoming())).not.toContain(id);
  });

  it('add the morning plan and the weekly review when turned on', async () => {
    const before = await remindersApi.upcoming();
    expect(before.some((item) => item.kind === 'morning' || item.kind === 'weekly')).toBe(false);
    await profileApi.update({ reminders: { morning: true, weekly: true } });
    const list = await remindersApi.upcoming();
    const morning = list.find((item) => item.id === `plan:morning:${TOMORROW}:morning`);
    expect(morning).toMatchObject({ minute: 6 * 60 + 15, title: 'Your plan for today' });
    expect(morning.body).toMatch(/night revision at \d\d:\d\d/);
    // Sunday 22 November, 18:30.
    expect(list.find((item) => item.kind === 'weekly')).toMatchObject({ date: '2026-11-22', minute: 18 * 60 + 30, open: { screen: 'Habits', section: 'progress' } });
  });

  it('never arrive while the student sleeps', async () => {
    await profileApi.update({ wakeAt: '07:00', studyEnd: '21:00' });
    for (const item of await remindersApi.upcoming()) {
      expect(item.minute).toBeGreaterThanOrEqual(7 * 60);
      expect(item.minute).toBeLessThan(21 * 60);
    }
  });
});
