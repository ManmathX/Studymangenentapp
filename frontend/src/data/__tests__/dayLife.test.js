import { dashboardApi, habitsApi, planApi, profileApi } from '../api';
import { addDays } from '../core/dates';
import { layoutDay } from '../core/engine';
import { read } from '../db';
import { freshPlanner, ONBOARDING, TODAY } from './helpers';

// TODAY is Wednesday 18 Nov 2026. School is 07:45 to 13:45; tuition Mon, Wed, Fri 16:00 to 17:30.
beforeEach(freshPlanner);

const at = (hours, minutes = 0) => hours * 60 + minutes;
const onboarded = (patch = {}) => profileApi.onboard({ ...ONBOARDING, exams: [], ...patch });
const fixed = (day, kind) => day.rows.filter((row) => row.type === 'fixed' && row.kind === kind);
const THU = '2026-11-19';

describe('sleep, meals and breaks', () => {
  it('shows sleep, breakfast, lunch, the snack break and dinner, and lets the student change them', async () => {
    await onboarded();
    const before = await planApi.day(THU);
    expect(fixed(before, 'sleep').map(({ start, end }) => [start, end])).toEqual([
      [0, at(6)],
      [at(22), at(24)],
    ]);
    expect(fixed(before, 'meal').map(({ label, start, end }) => [label, start, end])).toEqual([
      ['Breakfast', at(7), at(7, 20)],
      ['Lunch', at(13, 45), at(14, 30)],
      ['Dinner with family', at(20), at(20, 45)],
    ]);
    expect(fixed(before, 'break')).toEqual([expect.objectContaining({ label: 'Snack and play', start: at(14, 30), end: at(15) })]);

    const profile = await profileApi.update({
      wakeAt: '06:30',
      studyEnd: '22:30',
      afterSchoolBreakMins: 15,
      meals: { breakfast: { at: '07:00', mins: 15 }, lunch: { mins: 30 }, dinner: { at: '20:30', mins: 30 } },
    });
    expect(profile).toMatchObject({
      wakeAt: at(6, 30),
      studyEnd: at(22, 30),
      afterSchoolBreakMins: 15,
      meals: { breakfast: { at: at(7), mins: 15 }, lunch: { at: at(13), mins: 30 }, dinner: { at: at(20, 30), mins: 30 } },
    });
    const after = await planApi.day(THU);
    expect(fixed(after, 'sleep').map(({ start, end }) => [start, end])).toEqual([
      [0, at(6, 30)],
      [at(22, 30), at(24)],
    ]);
    // Lunch 13:45–14:15 and a 15-minute break: homework starts at 14:30 now.
    expect(after.slots[0]).toMatchObject({ kind: 'homework', start: at(14, 30) });
    expect(after.slots.at(-1)).toMatchObject({ kind: 'night', end: at(22, 30) });
  });

  it('checks sleep and meal times', async () => {
    await onboarded();
    const cases = [
      [{ wakeAt: '04:00' }, 'Pick a wake-up time between 04:30 and 08:30'],
      [{ wakeAt: '05:00', studyEnd: '23:00' }, 'That leaves less than 7 hours of sleep. Teens need 8 to 10 hours.'],
      [{ wakeAt: '08:00' }, 'School starts before you wake up (08:00)'],
      [{ meals: { breakfast: { at: '05:30' } } }, 'Breakfast has to be after you wake up (06:00)'],
      [{ meals: { dinner: { at: '21:45' } } }, 'Dinner has to finish before you sleep (22:00)'],
      [{ meals: { lunch: { at: '16:00' } } }, 'Lunch has to be between 11:00 and 15:30'],
      [{ meals: { dinner: { mins: 50 } } }, 'Choose one of the options'],
      [{ afterSchoolBreakMins: 20 }, 'Choose one of the options'],
      [{ tuitions: [{ name: 'Early maths', days: [1], start: '05:00', end: '06:00' }] }, 'Early maths starts before you wake up (06:00)'],
    ];
    for (const [patch, message] of cases) await expect(profileApi.update(patch)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message });
  });

  it('puts a short break between study tasks and a long one after about 90 minutes in a row', () => {
    const profile = { schoolStart: at(7, 45), schoolEnd: at(13, 45), tuitions: [], routine: [] };
    const task = (id, mins, order) => ({ id, kind: 'study', mins, order, status: 'accepted', score: 1, date: THU });
    const { rows } = layoutDay(profile, THU, [task('a', 45, 1), task('b', 45, 2), task('c', 45, 3), task('d', 30, 4)]);
    const breaks = rows.filter((row) => row.type === 'break').map(({ start, end, long }) => [start, end, long]);
    // 16:00 a, 16:45 short break, 16:55 b (90 minutes so far), 17:40 long break, 18:00 c, 18:45 short break, 18:55 d.
    expect(breaks).toEqual([
      [at(16, 45), at(16, 55), false],
      [at(17, 40), at(18), true],
      [at(18, 45), at(18, 55), false],
    ]);
  });
});

describe('habits on the calendar', () => {
  it('places habits without a set time in their part of the day, and ticks them from the calendar', async () => {
    await onboarded();
    const water = await habitsApi.addHabit({ name: 'Water the plants', part: 'morning', days: [0, 1, 2, 3, 4, 5, 6], mins: 10 });
    const piano = await habitsApi.addHabit({ name: 'Piano practice', part: 'afternoon', days: [3], mins: 30 });
    const day = await planApi.day(TODAY);
    const habits = fixed(day, 'habit');
    const row = (id) => habits.find((item) => item.habitId === id);
    // Morning habits follow waking up, before school; afternoon ones come after the snack break; evening ones after dinner.
    expect(row(water.id)).toMatchObject({ auto: true, end: expect.any(Number) });
    expect(row(water.id).start).toBeGreaterThanOrEqual(at(6));
    expect(row(water.id).end).toBeLessThanOrEqual(at(7, 45));
    expect(row(piano.id)).toMatchObject({ start: at(15), end: at(15, 30), done: false });
    expect(row('evening-0').start).toBeGreaterThanOrEqual(at(20, 45));
    // Homework needs an hour: 15:30–16:00 is too short before Wednesday's tuition, so it goes after it.
    expect(day.slots[0]).toMatchObject({ kind: 'homework', start: at(17, 30) });

    await habitsApi.setHabitDone(piano.id, true);
    expect(fixed(await planApi.day(TODAY), 'habit').find((item) => item.habitId === piano.id).done).toBe(true);
    expect((await dashboardApi.habits()).routine.habits.find((habit) => habit.id === water.id)).toMatchObject({ at: null, mins: 10 });
  });
});

describe('rest days on the calendar', () => {
  it('plans rest days ahead: only night revision that day, at most two a week, and taking one back refills the day', async () => {
    await onboarded();
    await dashboardApi.today();
    const saturday = '2026-11-21';
    const dailyOn = (date) => read().tasks.filter((task) => task.date === date && task.daily && !task.done);
    expect(dailyOn(saturday).some((task) => task.daily.type === 'study')).toBe(true);

    await habitsApi.setRestDay(saturday, true);
    expect(dailyOn(saturday).map((task) => task.daily.type).every((type) => type === 'night')).toBe(true);
    expect(dailyOn(saturday).length).toBeGreaterThan(0);
    expect((await planApi.day(saturday)).rest).toBe(true);
    expect((await planApi.month('2026-11')).find((item) => item.date === saturday).rest).toBe(true);

    await habitsApi.setRestDay('2026-11-22', true);
    await expect(habitsApi.setRestDay('2026-11-20', true)).rejects.toMatchObject({ code: 'REST_LIMIT_REACHED' });
    await expect(habitsApi.setRestDay('2026-11-17', true)).rejects.toMatchObject({ code: 'DATE_IN_PAST' });

    await habitsApi.setRestDay(saturday, false);
    await dashboardApi.today();
    expect(dailyOn(saturday).some((task) => task.daily.type === 'study')).toBe(true);
    expect(dailyOn(saturday).filter((task) => task.daily.type === 'night').length).toBeGreaterThan(0);
    // Night revision is not doubled.
    const nights = dailyOn(saturday).filter((task) => task.daily.type === 'night').map((task) => task.daily.of);
    expect(new Set(nights).size).toBe(nights.length);
  });

  it('keeps a planned rest day out of the coming week’s self study', async () => {
    await onboarded();
    await habitsApi.setRestDay(addDays(TODAY, 3), true);
    await dashboardApi.today();
    expect(read().tasks.filter((task) => task.date === addDays(TODAY, 3) && task.daily?.type === 'study')).toEqual([]);
  });
});

describe('editing the timetable', () => {
  const schoolOf = async (date) => fixed(await planApi.day(date), 'school')[0] ?? null;

  it('changes school for one day, a week, a month, every such weekday, or always', async () => {
    await onboarded();
    // One day: school ends early this Friday.
    await profileApi.changeTimings({ date: '2026-11-20', scope: 'day', school: { start: '07:45', end: '11:00' } });
    expect(await schoolOf('2026-11-20')).toMatchObject({ start: at(7, 45), end: at(11) });
    expect(await schoolOf('2026-11-27')).toMatchObject({ end: at(13, 45) });
    // A week of exams: 08:00 to 12:00, Monday 23 to Sunday 29 (Sunday stays free).
    const week = await profileApi.changeTimings({ date: '2026-11-25', scope: 'week', school: { start: '08:00', end: '12:00' } });
    expect(week).toMatchObject({ from: '2026-11-23', to: '2026-11-29' });
    expect(await schoolOf('2026-11-23')).toMatchObject({ start: at(8), end: at(12) });
    expect(await schoolOf('2026-11-29')).toBeNull();
    // Winter timings for all of December.
    const month = await profileApi.changeTimings({ date: '2026-12-10', scope: 'month', school: { start: '08:30', end: '14:30' } });
    expect(month).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    expect(await schoolOf('2026-12-15')).toMatchObject({ start: at(8, 30), end: at(14, 30) });
    expect(await schoolOf('2027-01-05')).toMatchObject({ start: at(7, 45) });
    // School off on one day.
    await profileApi.changeTimings({ date: '2026-11-19', scope: 'day', school: { off: true } });
    expect((await planApi.day('2026-11-19')).frame).toMatchObject({ dayType: 'noSchool', reason: 'School is off (timetable change)' });
    // Every Tuesday ends at 15:00 from now on; and every school day starts at 08:00.
    await profileApi.changeTimings({ date: '2026-11-24', scope: 'weekday', school: { start: '07:45', end: '15:00' } });
    expect((await profileApi.get()).schoolWeek).toEqual({ 2: { start: at(7, 45), end: at(15) } });
    expect(await schoolOf('2027-01-05')).toMatchObject({ end: at(15) });
    await profileApi.changeTimings({ date: TODAY, scope: 'always', school: { start: '08:00', end: '14:00' } });
    expect((await profileApi.get())).toMatchObject({ schoolStart: at(8), schoolEnd: at(14) });
    await profileApi.resetSchoolDay(2);
    expect(await schoolOf('2027-01-05')).toMatchObject({ start: at(8), end: at(14) });

    // Removing a change brings the normal timetable back.
    await profileApi.removeTimingChange(month.id);
    expect(await schoolOf('2026-12-15')).toMatchObject({ start: at(8), end: at(14) });
  });

  it('changes one day’s tuitions, and checks every change', async () => {
    await onboarded();
    await profileApi.changeTimings({ date: TODAY, scope: 'day', tuitions: [{ name: 'Extra maths class', start: '18:00', end: '19:00' }] });
    expect(fixed(await planApi.day(TODAY), 'tuition').map(({ label, start }) => [label, start])).toEqual([['Extra maths class', at(18)]]);
    expect(fixed(await planApi.day('2026-11-20'), 'tuition')).toHaveLength(1);
    const cases = [
      [{ date: '2026-11-10', scope: 'day', school: { off: true } }, 'DATE_IN_PAST'],
      [{ date: TODAY, scope: 'week', tuitions: [] }, 'TUITIONS_FOR_ONE_DAY'],
      [{ date: TODAY, scope: 'day' }, 'NOTHING_TO_CHANGE'],
      [{ date: TODAY, scope: 'always', school: { off: true } }, 'USE_A_HOLIDAY'],
      [{ date: TODAY, scope: 'day', school: { start: '12:00', end: '09:00' } }, 'VALIDATION_ERROR'],
      [{ date: TODAY, scope: 'year', school: { off: true } }, 'VALIDATION_ERROR'],
      [{ date: TODAY, scope: 'weekday', school: { start: '08:00', end: '17:00' } }, 'VALIDATION_ERROR'],
    ];
    for (const [input, code] of cases) await expect(profileApi.changeTimings(input)).rejects.toMatchObject({ code });
  });

  it('uses the class timetable for the school bag and for night revision', async () => {
    await onboarded();
    await profileApi.update({ periods: { 4: ['maths', 'science', 'english', 'maths'] } });
    const bag = await habitsApi.bag(THU);
    expect(bag.periods.map((period) => period.label)).toEqual(['Maths', 'Science', 'English', 'Maths']);
    expect(bag.items.map((item) => item.label)).toEqual(expect.arrayContaining(['Maths textbook and notebook', 'Geometry box', 'Science textbook and notebook']));
    await dashboardApi.today();
    expect(read().tasks.find((task) => task.date === THU && task.daily?.of === 'school').title).toBe('Night revision: today’s lessons (Maths, Science, English)');
    await expect(profileApi.update({ periods: { 4: ['physics'] } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('moving, resizing and removing slots from the calendar', () => {
  const slotOf = (day, kind) => day.slots.find((slot) => slot.kind === kind) ?? null;

  it('moves the Homework and Night revision slots, removes self study for a day, and puts them back', async () => {
    await onboarded();
    await profileApi.editSlot({ key: 'homework', date: THU, start: '18:00', mins: 45 });
    let day = await planApi.day(THU);
    expect(slotOf(day, 'homework')).toMatchObject({ start: at(18), end: at(18, 45), edited: 'day' });
    // Self study fills the time before and after the moved homework.
    expect(day.slots.some((slot) => slot.kind === 'study' && slot.start < at(18))).toBe(true);
    // Other days are as usual.
    expect(slotOf(await planApi.day('2026-11-26'), 'homework')).toMatchObject({ start: at(15) });

    await profileApi.editSlot({ key: 'night', date: THU, start: '21:00' });
    expect(slotOf(await planApi.day(THU), 'night')).toMatchObject({ start: at(21) });

    await profileApi.editSlot({ key: 'study', date: THU, removed: true });
    day = await planApi.day(THU);
    expect(day.slots.some((slot) => slot.kind === 'study')).toBe(false);
    expect(day.frame.removed).toEqual([]);
    await dashboardApi.today();
    expect(read().tasks.filter((task) => task.date === THU && task.daily?.type === 'study')).toEqual([]);

    await profileApi.resetSlot({ key: 'study', date: THU });
    await profileApi.resetSlot({ key: 'homework', date: THU });
    expect(slotOf(await planApi.day(THU), 'homework')).toMatchObject({ start: at(15) });
    await expect(profileApi.resetSlot({ key: 'homework', date: THU })).rejects.toMatchObject({ code: 'SLOT_NOT_EDITED' });
  });

  it('moves or removes meals, the break and habits, for one day or every day', async () => {
    await onboarded();
    await profileApi.editSlot({ key: 'dinner', scope: 'always', start: '20:30', mins: 30 });
    await profileApi.editSlot({ key: 'break', date: THU, removed: true });
    await profileApi.editSlot({ key: 'habit:evening-0', date: THU, start: '19:00', mins: 10 });
    const day = await planApi.day(THU);
    expect(fixed(day, 'meal').find((row) => row.meal === 'dinner')).toMatchObject({ start: at(20, 30), end: at(21), edited: 'always' });
    expect(fixed(day, 'break')).toEqual([]);
    expect(day.frame.removed).toEqual([{ key: 'break', label: 'Snack and play', scope: 'day' }]);
    expect(fixed(day, 'habit').find((row) => row.habitId === 'evening-0')).toMatchObject({ start: at(19), end: at(19, 10) });
    // With the break removed, homework starts right after lunch.
    expect(slotOf(day, 'homework')).toMatchObject({ start: at(14, 30) });
    // Every day's dinner moved; Friday still has its snack break.
    expect(fixed(await planApi.day('2026-11-20'), 'meal').find((row) => row.meal === 'dinner').start).toBe(at(20, 30));
    expect(fixed(await planApi.day('2026-11-20'), 'break')).toHaveLength(1);

    const cases = [
      [{ key: 'school', date: THU, removed: true }, 'VALIDATION_ERROR'],
      [{ key: 'study', date: THU, start: '18:00' }, 'STUDY_CANNOT_MOVE'],
      [{ key: 'homework', date: THU, start: '05:00' }, 'VALIDATION_ERROR'],
      [{ key: 'homework', date: THU, start: '21:30', mins: 60 }, 'VALIDATION_ERROR'],
      [{ key: 'habit:nope', date: THU, removed: true }, 'HABIT_NOT_FOUND'],
      [{ key: 'dinner', date: '2026-11-10', removed: true }, 'DATE_IN_PAST'],
    ];
    for (const [input, code] of cases) await expect(profileApi.editSlot(input)).rejects.toMatchObject({ code });
  });
});
