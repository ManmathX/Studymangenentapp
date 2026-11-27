import { dayFrame, limitFor, saturdayOfMonth, weeklyClash } from '../dayFrame';
import { layoutDay, routineSlots, startDay } from '../engine';

// November 2026: Sunday the 1st, so the Saturdays are the 7th, 14th, 21st and 28th.
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SAT = '2026-11-21'; // 3rd Saturday
const SUN = '2026-11-22';
const MON = '2026-11-23';
const at = (hours, minutes = 0) => hours * 60 + minutes;
const MATHS = { name: 'Maths tuition', days: [1, 3, 5], start: at(16), end: at(17, 30) };
// An empty routine keeps habits out of most layouts; the habit tests add their own.
const base = { dailyLimitMins: 180, ageMode: 'deeper', examSeason: false, schoolStart: at(7, 45), schoolEnd: at(13, 45), tuitions: [MATHS], routine: [] };
/** The day's blocks between waking up and going to sleep. */
const awake = (frame) => frame.blocks.filter((block) => block.kind !== 'sleep');
const kinds = (frame) => awake(frame).map((block) => block.kind);
const noOverlaps = (blocks) => {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  return sorted.every((block, index) => index === 0 || sorted[index - 1].end <= block.start);
};
const task = (id, kind, mins, order, extra = {}) => ({ id, kind, mins, order, status: 'accepted', score: 1, date: THU, ...extra });

describe('the day frame', () => {
  it('lays out a school day: school, lunch, tuition and dinner, with study after lunch', () => {
    const frame = dayFrame(base, WED);
    expect(frame).toMatchObject({ dayType: 'school', reason: null, window: { regularStart: at(13, 45), end: at(22) } });
    // Breakfast, school, lunch, the snack and play break, tuition and dinner.
    expect(kinds(frame)).toEqual(['meal', 'school', 'meal', 'break', 'tuition', 'meal']);
    // 15:00–16:00, 17:30–20:00 and 20:45–22:00 are free; with no daily limit all of it is study time.
    expect(frame.free).toBe(60 + 150 + 75);
    expect(frame.capacity).toBe(frame.free);
    expect(frame.limit).toBe(frame.free);
  });

  it('follows the Saturday setting: half day, full day, off, or off on the 2nd and 4th Saturday', () => {
    expect(saturdayOfMonth('2026-11-14')).toBe(2);
    expect(saturdayOfMonth('2026-11-28')).toBe(4);
    const school = (profile, date) => dayFrame(profile, date).blocks.find((block) => block.kind === 'school');
    expect(dayFrame(base, SAT).dayType).toBe('halfDay');
    expect(school(base, SAT)).toMatchObject({ label: 'School (half day)', end: at(12, 30) });
    expect(school({ ...base, saturday: 'full' }, SAT)).toMatchObject({ label: 'School', end: at(13, 45) });
    const off = dayFrame({ ...base, saturday: 'off' }, SAT);
    expect(off).toMatchObject({ dayType: 'noSchool', reason: 'Saturday off' });
    // A day off has the whole day: 09:00–13:00, 15:00–20:00 and 20:45–22:00.
    expect(off.free).toBe(240 + 300 + 75);
    const alternate = { ...base, saturday: 'alternate' };
    expect(dayFrame(alternate, '2026-11-14')).toMatchObject({ dayType: 'noSchool', reason: 'Saturday off' });
    expect(dayFrame(alternate, '2026-11-28').dayType).toBe('noSchool');
    expect(dayFrame(alternate, '2026-11-07').dayType).toBe('halfDay');
    expect(dayFrame(alternate, SAT).dayType).toBe('halfDay');
  });

  it('has no school on holidays, so the whole day is free apart from tuition', () => {
    const profile = { ...base, holidays: [{ id: 'h1', name: 'Diwali break', from: WED, to: FRI }] };
    const frame = dayFrame(profile, WED);
    expect(frame).toMatchObject({ dayType: 'noSchool', reason: 'Diwali break', holiday: { id: 'h1', name: 'Diwali break' } });
    expect(frame.free).toBe(240 + 60 + 150 + 75);
    // Breakfast, lunch at 13:00 and an afternoon rest, tuition, dinner.
    expect(kinds(frame)).toEqual(['meal', 'meal', 'break', 'tuition', 'meal']);
    expect(frame.window.regularStart).toBe(at(9));
    expect(dayFrame(profile, SAT).dayType).toBe('halfDay');
  });

  it('puts Sunday tuition on the timeline', () => {
    const profile = { ...base, tuitions: [MATHS, { name: 'Sunday test series', days: [0], start: at(10), end: at(12) }] };
    expect(awake(dayFrame(profile, SUN)).map(({ kind, start }) => [kind, start])).toEqual([
      ['meal', at(7)],
      ['tuition', at(10)],
      ['meal', at(13)],
      ['break', at(13, 45)],
      ['meal', at(20)],
    ]);
  });

  it('replaces school with a timed half-yearly paper, and gives the days between papers study leave', () => {
    const paper = (id, date, extra = {}) => ({ id, type: 'halfYearly', seriesId: 'hy', seriesName: 'Half-yearly', name: `Half-yearly: ${id}`, date, start: at(9), end: at(12), studyLeave: true, ...extra });
    const exams = [paper('Maths', THU), paper('Science', MON)];
    const day = dayFrame(base, THU, exams);
    expect(day).toMatchObject({ dayType: 'paper', reason: 'Half-yearly', papers: [{ id: 'Maths', start: at(9), end: at(12) }] });
    expect(kinds(day)).not.toContain('school');
    const after = awake(day).filter((block) => block.start >= at(9));
    expect(after[0]).toMatchObject({ kind: 'exam', label: 'Half-yearly: Maths', start: at(9), end: at(12) });
    // Lunch straight after the paper, then the snack and play break.
    expect(after[1]).toMatchObject({ kind: 'meal', start: at(12), end: at(12, 45) });
    expect(after[2]).toMatchObject({ kind: 'break', start: at(12, 45), end: at(13, 15) });
    expect(day.window.regularStart).toBe(at(12));
    expect(dayFrame(base, FRI, exams)).toMatchObject({ dayType: 'studyLeave', reason: 'Half-yearly' });
    expect(dayFrame(base, SAT, exams).dayType).toBe('studyLeave');
    expect(dayFrame(base, '2026-11-24', exams).dayType).toBe('school');
    // Without study leave the school days between papers are normal.
    const noLeave = exams.map((exam) => ({ ...exam, studyLeave: false }));
    expect(dayFrame(base, FRI, noLeave).dayType).toBe('school');
    // Without exams the limit is the school-day one: never more than the real limit.
    expect(limitFor(base, FRI)).toBeLessThanOrEqual(limitFor(base, FRI, exams));
  });

  it('drops the Homework slot between the first and last paper and turns study into Exam revision', () => {
    const paper = (id, date) => ({ id, type: 'final', seriesId: 'f', seriesName: 'Final exam', name: `Final: ${id}`, date, start: at(9), end: at(12), studyLeave: true, prepFrom: '2026-10-08' });
    const exams = [paper('Maths', THU), paper('Science', MON)];
    // Friday is study leave with Maths tuition at 16:00: Exam revision fills every free stretch,
    // and the night ends with revising the tuition and the day's study.
    const slots = routineSlots(base, FRI, exams);
    const revision = slots.filter((slot) => slot.kind !== 'night');
    expect(revision.every((slot) => slot.kind === 'exam' && slot.label === 'Exam revision' && slot.detail === 'Final exam')).toBe(true);
    expect(revision.map(({ start, end }) => [start, end])).toEqual([
      [at(9), at(13)],
      [at(15), at(16)],
      [at(17, 30), at(20)],
      [at(20, 45), at(21, 40)],
    ]);
    expect(slots.at(-1)).toMatchObject({ kind: 'night', detail: 'Maths tuition · Self study', start: at(21, 40), end: at(22) });
    // Before the first paper there is still homework and Test prep.
    expect(routineSlots(base, WED, exams).map((slot) => slot.label)).toEqual(['Homework', 'Test prep', 'Test prep', 'Night revision']);
  });

  it('labels school with the tests written that day, and keeps untimed papers inside school', () => {
    const exams = [
      { id: 'ut', type: 'unit', name: 'Maths UT', date: THU },
      { id: 'hy', type: 'halfYearly', seriesId: 's', seriesName: 'Half-yearly', name: 'Half-yearly: English', date: FRI },
    ];
    expect(dayFrame(base, THU, exams).blocks.find((block) => block.kind === 'school')).toMatchObject({ label: 'School · Maths UT' });
    expect(dayFrame(base, FRI, exams)).toMatchObject({ dayType: 'school', tests: [{ id: 'hy' }] });
    expect(dayFrame(base, FRI, exams).blocks.find((block) => block.kind === 'school').label).toBe('School · Half-yearly: English');
  });

  it('blocks the time of habits with a set time, from the day they were added', () => {
    const swim = { id: 'swim', name: 'Swimming', part: 'afternoon', days: [4], at: at(18), mins: 60, createdOn: THU };
    const profile = { ...base, routine: [swim, { id: 'walk', name: 'Walk', part: 'evening', days: [4], createdOn: null }] };
    const frame = dayFrame(profile, THU);
    expect(frame.blocks.find((block) => block.kind === 'habit')).toMatchObject({ label: 'Swimming', start: at(18), end: at(19), habitId: 'swim' });
    // Swimming takes its hour; the walk (no set time) takes 5 minutes after dinner.
    expect(frame.blocks.find((block) => block.habitId === 'walk')).toMatchObject({ start: at(20, 45), end: at(20, 50), auto: true });
    expect(frame.free).toBe(dayFrame(base, THU).free - 60 - 5);
    // Swimming was added on the 19th, so the week before has no swimming block.
    expect(dayFrame(profile, '2026-11-12').blocks.some((block) => block.habitId === 'swim')).toBe(false);
  });

  it('resolves clashes by precedence (paper, school, tuition, habit, meal) and never overlaps blocks', () => {
    const profile = {
      ...base,
      routine: [{ id: 'dance', name: 'Dance class', part: 'afternoon', days: [3], at: at(17), mins: 60 }],
      tuitions: [MATHS, { name: 'Art class', days: [6], start: at(12, 45), end: at(13, 45) }],
    };
    const wednesday = dayFrame(profile, WED);
    expect(wednesday.dropped).toEqual([{ label: 'Dance class', kind: 'habit', because: 'Maths tuition' }]);
    expect(noOverlaps(wednesday.blocks)).toBe(true);
    // Lunch after the Saturday half day used to overlap a class straight after school; it is trimmed now.
    expect(noOverlaps(dayFrame(profile, SAT).blocks)).toBe(true);
    const exams = [{ id: 'p', type: 'final', seriesId: 'f', seriesName: 'Final', name: 'Final: Maths', date: WED, start: at(15), end: at(18) }];
    expect(dayFrame(profile, WED, exams).dropped.map((item) => item.label)).toEqual(['Maths tuition', 'Dance class']);
  });

  it('merges papers written at the same time into one block', () => {
    const paper = (id) => ({ id, type: 'final', seriesId: 'f', name: id, date: THU, start: at(9), end: at(12) });
    const frame = dayFrame(base, THU, [paper('Hindi'), paper('Sanskrit')]);
    expect(frame.blocks.filter((block) => block.kind === 'exam')).toEqual([expect.objectContaining({ label: 'Hindi + Sanskrit', examIds: ['Hindi', 'Sanskrit'] })]);
    expect(frame.dropped).toEqual([]);
  });

  it('opens the student’s own study sessions, trimmed around fixed blocks', () => {
    const profile = { ...base, wakeAt: at(5), studySessions: [{ start: at(5, 30), end: at(7) }, { start: at(10), end: at(11) }] };
    const thursday = dayFrame(profile, THU);
    // 10:00 is in school on weekdays, so only the morning session is usable.
    expect(thursday.sessions).toEqual([{ start: at(5, 30), end: at(7) }]);
    expect(thursday.window.start).toBe(at(5, 30));
    expect(thursday.free).toBe(dayFrame(base, THU).free + 90);
    expect(dayFrame(profile, SUN).sessions).toEqual([{ start: at(5, 30), end: at(7) }, { start: at(10), end: at(11) }]);
  });

  it('fills study sessions first, then the time after homework', () => {
    const profile = { ...base, wakeAt: at(5), studySessions: [{ start: at(5, 30), end: at(7) }] };
    expect(routineSlots(profile, THU)).toEqual([
      { kind: 'homework', label: 'Homework', key: 'homework', start: at(15), end: at(16) },
      { kind: 'study', label: 'Self study', key: 'study', start: at(5, 30), end: at(7), session: true },
      { kind: 'study', label: 'Self study', key: 'study', start: at(16), end: at(20) },
      { kind: 'study', label: 'Self study', key: 'study', start: at(20, 45), end: at(21, 35) },
      { kind: 'night', label: 'Night revision', key: 'night', detail: 'School · Self study', start: at(21, 35), end: at(22) },
    ]);
    const { rows, overflow } = layoutDay(profile, THU, [task('a', 'study', 45, 1), task('b', 'revision', 40, 2), task('c', 'practice', 30, 3)]);
    const startOf = Object.fromEntries(rows.filter((row) => row.type === 'task').map((row) => [row.task.id, row.start]));
    // `b` does not fit what is left of the morning session, so it goes after homework; `c` does.
    expect(startOf).toEqual({ a: at(5, 30), b: at(16), c: at(6, 25) });
    expect(overflow).toEqual([]);
  });

  it('ends the day at the student’s stop time and plans tomorrow from three hours before it', () => {
    expect(dayFrame({ ...base, studyEnd: at(23) }, THU).window.end).toBe(at(23));
    expect(startDay({ date: THU, hour: 19 }, base)).toBe(FRI);
    expect(startDay({ date: THU, hour: 19 }, { ...base, studyEnd: at(23) })).toBe(THU);
    expect(startDay({ date: THU, hour: 18 }, { ...base, studyEnd: at(21) })).toBe(FRI);
  });

  it('puts tasks wherever there is room when their own slot is full, and only overflows when the day is full', () => {
    const tasks = Array.from({ length: 6 }, (_, index) => task(`t${index}`, 'study', 60, index));
    const { rows, overflow } = layoutDay(base, THU, tasks);
    const busy = rows.filter((row) => row.type !== 'slot');
    expect(noOverlaps(busy)).toBe(true);
    for (const row of busy.filter((item) => item.type === 'task')) expect(row.end).toBeLessThanOrEqual(at(22));
    // 15:00–20:00 holds four hours with breaks; 20:45–21:35 is too short for an hour, and
    // 21:35–22:00 is kept for night revision. The last two do not fit.
    expect(overflow.map((item) => item.id)).toEqual(['t4', 't5']);
  });

  it('finds clashes for a weekly time before it is saved', () => {
    const profile = { ...base, routine: [{ id: 'swim', name: 'Swimming', days: [2], at: at(18), mins: 60 }] };
    expect(weeklyClash(profile, { days: [1, 2], start: at(10), end: at(11) })).toMatchObject({ day: 1, kind: 'school' });
    expect(weeklyClash(profile, { days: [3], start: at(17), end: at(18) })).toMatchObject({ day: 3, kind: 'tuition', label: 'Maths tuition', index: 0 });
    expect(weeklyClash(profile, { days: [2], start: at(18, 30), end: at(19) })).toMatchObject({ kind: 'habit', label: 'Swimming' });
    expect(weeklyClash(profile, { days: [2], start: at(18, 30), end: at(19) }, { skipHabitId: 'swim' })).toBeNull();
    expect(weeklyClash({ ...profile, saturday: 'off' }, { days: [6], start: at(10), end: at(11) })).toBeNull();
  });
});
