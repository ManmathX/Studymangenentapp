import { dashboardApi, examsApi, habitsApi, homeworkApi, profileApi } from '../../api';
import { read } from '../../db';
import { clock24 } from '../../validate';
import { freshPlanner, ONBOARDING, TODAY } from '../../__tests__/helpers';
import { addDays, eachDay, weekday } from '../dates';
import { dayFrame, SATURDAY_MODES } from '../dayFrame';
import { layoutDay, prepExamsOn } from '../engine';

/**
 * Property tests for the scheduler. Random students (school hours, Saturdays, tuitions,
 * timed habits, study sessions, stop time, holidays) get random datesheets (unit tests, and
 * a half-yearly or final on continuous or gapped days, with paper times and study leave) and
 * homework, all through the real planner operations, and opening Today fills the coming week
 * with self study, daily revision and night revision. Every day from today to the last paper
 * is then checked against the rules the scheduler must never break.
 * A failure names the seed, so `run(seed)` reproduces it exactly.
 */

const STUDENTS = 150;
const SUBJECTS = ['maths', 'science', 'sst', 'english', 'hindi'];

/** Small seeded random generator (mulberry32), so every run is the same. */
function random(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (low, high) => low + Math.floor(next() * (high - low + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  const days = (from = 0) => {
    const chosen = [0, 1, 2, 3, 4, 5, 6].filter((day) => day >= from && next() < 0.4);
    return chosen.length ? chosen : [int(from, 6)];
  };
  return { next, int, pick, days };
}

/** Saves what is allowed; a refusal because of a clash is the validation doing its job. */
async function attempt(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' || error.code === 'HABIT_EXISTS') return null;
    throw error;
  }
}

async function buildStudent(seed) {
  const r = random(seed);
  const schoolStart = r.int(28, 36) * 15; // 07:00 to 09:00
  const schoolEnd = schoolStart + r.int(18, 28) * 15; // 4.5 to 7 hours
  await profileApi.onboard({
    ...ONBOARDING,
    schoolStart: clock24(schoolStart),
    schoolEnd: clock24(schoolEnd),
    saturday: r.pick(SATURDAY_MODES),
    homeworkMins: r.pick([30, 45, 60, 90]),
    tuitions: [],
    exams: [],
    taughtChapterKeys: SUBJECTS.flatMap((subject) => [1, 2, 3].filter(() => r.next() < 0.5).map((n) => `${subject}-${n}`)),
  });
  await attempt(profileApi.update({ studyEnd: r.pick(['21:00', '21:30', '22:00', '22:30', '23:00']) }));
  // Sleep, meals and the break after school (combinations that leave too little sleep are refused).
  await attempt(
    profileApi.update({
      wakeAt: clock24(r.int(20, 26) * 15), // 05:00 to 06:30
      afterSchoolBreakMins: r.pick([0, 15, 30, 45]),
      meals: { breakfast: { at: clock24(r.int(26, 30) * 15), mins: r.pick([15, 20, 30]) }, lunch: { mins: r.pick([30, 45, 60]) }, dinner: { at: clock24(r.int(76, 82) * 15), mins: r.pick([30, 45, 60]) } },
    }),
  );

  // Tuitions one by one (Sunday included); clashing ones are refused.
  const tuitions = [];
  for (let index = r.int(0, 4); index > 0; index -= 1) {
    const start = r.int(20, 83) * 15; // 05:00 to 20:45
    const tuition = { name: `Tuition ${index}`, days: r.days(), start: clock24(start), end: clock24(Math.min(22 * 60, start + r.int(2, 8) * 15)) };
    if (await attempt(profileApi.update({ tuitions: [...tuitions, tuition] }))) tuitions.push(tuition);
  }
  const sessions = [];
  for (let index = r.int(0, 2); index > 0; index -= 1) {
    const start = r.int(18, 86) * 15; // 04:30 to 21:30
    const session = { start: clock24(start), end: clock24(start + r.int(2, 8) * 15) };
    if (await attempt(profileApi.update({ studySessions: [...sessions, session] }))) sessions.push(session);
  }
  for (let index = r.int(0, 3); index > 0; index -= 1) {
    await attempt(habitsApi.addHabit({ name: `Habit ${index}`, part: 'evening', days: r.days(), at: clock24(r.int(20, 88) * 15), mins: r.pick([15, 30, 45, 60, 90]) }));
  }
  // Habits without a set time, placed in their part of the day.
  for (let index = r.int(0, 3); index > 0; index -= 1) {
    await attempt(habitsApi.addHabit({ name: `Any-time habit ${index}`, part: r.pick(['morning', 'afternoon', 'evening']), days: r.days(), mins: r.pick([5, 10, 15, 30]) }));
  }
  // A weekday with its own school times, a changed week, and a rest day.
  if (r.next() < 0.5) {
    const start = r.int(30, 34) * 15;
    await attempt(profileApi.changeTimings({ date: addDays(TODAY, r.int(0, 6)), scope: 'weekday', school: { start: clock24(start), end: clock24(start + r.int(16, 26) * 15) } }));
  }
  if (r.next() < 0.5) {
    const start = r.int(30, 34) * 15;
    await attempt(profileApi.changeTimings({ date: addDays(TODAY, r.int(0, 20)), scope: r.pick(['day', 'week', 'month']), school: r.next() < 0.2 ? { off: true } : { start: clock24(start), end: clock24(start + r.int(12, 24) * 15) } }));
  }
  if (r.next() < 0.5) await habitsApi.setRestDay(addDays(TODAY, r.int(1, 6)), true).catch(() => null);
  // Slots moved, resized or removed from the calendar, for a day or every day.
  for (let index = r.int(0, 3); index > 0; index -= 1) {
    const key = r.pick(['homework', 'night', 'dinner', 'break', 'study', 'lunch']);
    const scope = r.pick(['day', 'always']);
    const remove = key === 'study' || r.next() < 0.3;
    const start = r.int(60, 84) * 15; // 15:00 to 21:00
    await attempt(profileApi.editSlot({ key, scope, date: addDays(TODAY, r.int(0, 6)), ...(remove ? { removed: true } : { start: clock24(start), mins: r.pick([30, 45, 60]) }) }).catch((error) => (error.code === 'VALIDATION_ERROR' ? null : Promise.reject(error))));
  }
  for (let index = r.int(0, 2); index > 0; index -= 1) {
    const from = addDays(TODAY, r.int(0, 40));
    await attempt(profileApi.addHoliday({ name: `Break ${index}`, from, to: addDays(from, r.int(0, 10)) }));
  }

  // Unit tests on separate or back-to-back days.
  const chaptersOf = (subject, count) => read().chapters.filter((chapter) => chapter.subject === subject).slice(0, count).map((chapter) => chapter.key);
  const results = [];
  let utDate = addDays(TODAY, r.int(1, 12));
  const utPapers = [];
  for (const subject of SUBJECTS.filter(() => r.next() < 0.5)) {
    utPapers.push({ subject, name: `UT: ${subject}`, date: utDate, chapterKeys: chaptersOf(subject, r.int(1, 5)) });
    utDate = addDays(utDate, r.int(1, 2));
  }
  if (utPapers.length) results.push(await examsApi.createDatesheet({ series: 'Unit test', kind: 'unit', papers: utPapers }));

  // A half-yearly or final: continuous days or with gaps, with or without a paper time and study leave.
  const kind = r.pick(['halfYearly', 'final']);
  let date = addDays(TODAY, r.int(10, 60));
  const papers = [];
  for (const subject of SUBJECTS) {
    while (weekday(date) === 0) date = addDays(date, 1);
    papers.push({ subject, name: `${kind}: ${subject}`, date, chapterKeys: chaptersOf(subject, r.int(2, kind === 'final' ? 12 : 6)) });
    date = addDays(date, r.next() < 0.6 ? 1 : r.int(2, 3));
  }
  const start = r.int(32, 40) * 15; // 08:00 to 10:00
  const timing = r.next() < 0.8 ? { paperStart: clock24(start), paperEnd: clock24(start + r.int(8, 12) * 15) } : {};
  results.push(await examsApi.createDatesheet({ series: kind, kind, papers, studyLeave: r.next() < 0.7, ...timing }));

  for (let index = r.int(0, 4); index > 0; index -= 1) {
    await homeworkApi.create({ subject: r.pick(SUBJECTS), title: `Homework ${index}`, note: '', due: addDays(TODAY, r.int(0, 14)), mins: r.pick([20, 40, 60, 120, 240]), difficulty: 2 });
  }
  // Opening Today fills the coming week with self study, daily revision and night revision.
  await dashboardApi.today();
  return results;
}

const overlapping = (list) => {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  return sorted.find((row, index) => index && row.start < sorted[index - 1].end) ?? null;
};

/** Every rule the plan must keep. Returns a list of broken ones (empty when all hold). */
function brokenRules(results) {
  const data = read();
  const { profile, exams, tasks } = data;
  const problems = [];
  const fail = (date, rule) => problems.push(`${date}: ${rule}`);
  const lastPaper = exams.map((exam) => exam.date).sort().at(-1);
  const examById = new Map(exams.map((exam) => [exam.id, exam]));

  for (const date of eachDay(TODAY, addDays(lastPaper, 1))) {
    const frame = dayFrame(profile, date, exams);
    const dayTasks = tasks.filter((task) => task.date === date && task.status !== 'skipped');
    const { rows, overflow, slots } = layoutDay(profile, date, dayTasks, exams);
    const fixed = rows.filter((row) => row.type === 'fixed');
    const timed = rows.filter((row) => row.type !== 'slot');

    if (overlapping(fixed)) fail(date, 'fixed blocks overlap');
    if (overlapping(timed)) fail(date, `a task overlaps ${overlapping(timed).label ?? overlapping(timed).task?.title}`);
    if (overlapping(slots)) fail(date, 'slots overlap');
    for (const slot of slots) if (fixed.some((block) => slot.start < block.end && block.start < slot.end)) fail(date, `${slot.label} slot overlaps a fixed block`);
    for (const row of timed.filter((item) => item.type === 'task')) if (row.end > frame.window.end) fail(date, `${row.task.title} runs past the stop time`);
    if (frame.capacity > frame.limit || frame.capacity > frame.free) fail(date, 'capacity is more than the limit or the free time');

    const schoolToday = fixed.some((row) => row.kind === 'school');
    if (schoolToday && ['noSchool', 'studyLeave', 'paper'].includes(frame.dayType)) fail(date, `school on a ${frame.dayType} day`);
    if (schoolToday && (profile.holidays ?? []).some((holiday) => holiday.from <= date && date <= holiday.to)) fail(date, 'school on a holiday');
    // Sundays have no school unless the student set school for Sundays or for that day.
    const sundaySchool = profile.schoolWeek?.[0] && !profile.schoolWeek[0].off;
    const dayChange = (profile.timingChanges ?? []).some((change) => change.scope === 'day' && change.from === date && change.school && !change.school.off);
    if (schoolToday && weekday(date) === 0 && !sundaySchool && !dayChange) fail(date, 'school on a Sunday');
    if (frame.examPeriod && slots.some((slot) => slot.kind === 'homework')) fail(date, 'Homework slot during a half-yearly or final');

    // No daily limit, but the planner never asks a day for more than its free time.
    const prepMins = dayTasks.filter((task) => task.examId && task.source === 'app').reduce((sum, task) => sum + task.mins, 0);
    if (prepMins > frame.free) fail(date, `${prepMins} min of test prep but only ${frame.free} min free`);

    // Nothing is planned while the student sleeps.
    for (const row of rows.filter((item) => item.type === 'task')) {
      if (row.start < frame.wake || row.end > frame.sleep) fail(date, `${row.task.title} is planned while asleep`);
    }
    // A rest day has no self study or daily revision.
    if (data.dailyLogs[date]?.rest && dayTasks.some((task) => !task.done && (task.daily?.type === 'study' || task.daily?.type === 'revision'))) fail(date, 'self study on a rest day');

    // The daily plan: self study only on days without test preparation, night revision every
    // planned night and always inside its slot, at the end of the day.
    const dailyStudy = dayTasks.filter((task) => task.daily?.type === 'study' && !task.done);
    if (dailyStudy.length && prepExamsOn(exams, date).length) fail(date, 'self study on a test-preparation day');
    const nightSlot = slots.find((slot) => slot.kind === 'night');
    for (const row of rows.filter((item) => item.type === 'task' && item.task.daily?.type === 'night')) {
      if (!nightSlot || row.start < nightSlot.start || row.end > nightSlot.end) fail(date, `${row.task.title} is outside the night revision slot`);
    }
    if (!nightSlot && frame.free > 0 && !frame.edits.night?.removed) fail(date, 'no night revision slot');
    if (data.dailyPlan?.[date] && nightSlot && !dayTasks.some((task) => task.daily?.type === 'night')) fail(date, 'no night revision planned');
    // Self study removed for a day stays free.
    if (frame.edits.study?.removed && dayTasks.some((task) => task.daily?.type === 'study' && !task.done)) fail(date, 'self study on a day it was removed');
    // When the day holds only what the planner put there, all of it fits on the timeline.
    if (overflow.length && dayTasks.every((task) => task.source === 'app')) fail(date, `${overflow.length} planned task(s) do not fit`);
  }

  for (const task of tasks.filter((item) => item.examId && item.source === 'app')) {
    const exam = examById.get(task.examId);
    if (task.date >= exam.date) fail(task.date, `${task.title} is on or after ${exam.name}`);
    if (task.date < TODAY) fail(task.date, `${task.title} is in the past`);
  }
  // A chapter's steps for a test come in order: self study, then homework, then revision.
  const ORDER = { study: 0, homework: 1, practice: 1, revision: 2 };
  const chains = new Map();
  for (const task of [...tasks].filter((item) => item.examId && item.chapterKey).sort((a, b) => a.order - b.order)) {
    const key = `${task.examId}|${task.chapterKey}`;
    const previous = chains.get(key);
    if (previous && (task.date < previous.date || ORDER[task.kind] < ORDER[previous.kind])) fail(task.date, `${task.title} comes before an earlier step`);
    chains.set(key, task);
  }
  // What the planner reports matches what it stored.
  const reported = results.reduce((sum, result) => sum + result.planned.added, 0);
  const stored = tasks.filter((task) => task.examId && task.source === 'app').length;
  if (reported !== stored) problems.push(`reported ${reported} slots but stored ${stored}`);
  return problems;
}

/** The plan as data, without ids and order, to compare two runs. */
const planShape = () => read().tasks.map(({ date, subject, title, kind, mins, status }) => [date, subject, title, kind, mins, status].join('|')).sort();

async function run(seed) {
  await freshPlanner();
  const results = await buildStudent(seed);
  return { results, problems: brokenRules(results), shape: planShape() };
}

describe('the scheduler keeps its rules for any student', () => {
  it(`holds for ${STUDENTS} random students and datesheets`, async () => {
    const failures = [];
    for (let seed = 1; seed <= STUDENTS; seed += 1) {
      const { problems } = await run(seed);
      if (problems.length) failures.push(`seed ${seed}: ${problems.slice(0, 3).join('; ')}`);
    }
    expect(failures).toEqual([]);
  }, 120000);

  it('plans the same input the same way every time', async () => {
    for (const seed of [3, 42, 99]) {
      const first = (await run(seed)).shape;
      const second = (await run(seed)).shape;
      expect(second).toEqual(first);
    }
  }, 60000);
});
