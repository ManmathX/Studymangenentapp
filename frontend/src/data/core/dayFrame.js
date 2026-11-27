import { weekday } from './dates';
import { DEFAULT_HABIT_MINS, routineOf } from './routine';
import { EXAM_SERIES } from './types';

/**
 * The day frame: one place that decides what a calendar day looks like before any study is
 * planned on it. It answers, for one date:
 *
 *   - when the student wakes up and goes to sleep (nothing is ever planned in between);
 *   - is there school (weekly pattern, per-weekday timings, timing changes for a day, week or
 *     month, Saturday mode, holidays, study leave, exam papers)?
 *   - which fixed blocks the day has: sleep, exam paper, school, tuition, habits (at their set
 *     time, or placed in their part of the day), breakfast, lunch, dinner and the break after
 *     school, with clashes resolved by a strict precedence so blocks never overlap;
 *   - where flexible work may go (the time after school, plus the student's own study
 *     sessions), and how many minutes of it are really free.
 *
 * There is no daily study limit: a day can hold as much study as it has free time, up to the
 * student's sleep time. Fixed blocks are hard constraints and always win over study.
 */

/** Default sleep time; study, and the day, end here. */
export const DAY_END = 22 * 60;
/** Default wake-up time. */
export const DEFAULT_WAKE = 6 * 60;
/** Days without school start study at 09:00. */
export const FREE_DAY_START = 9 * 60;
/** Sleep times the student can pick. Teens need 8 to 10 hours of sleep, so 23:00 is the latest. */
export const STUDY_END_OPTIONS = [21 * 60, 21 * 60 + 30, 22 * 60, 22 * 60 + 30, 23 * 60];
/** Wake-up times run from 04:30 to 08:30. */
export const WAKE_EARLIEST = 4 * 60 + 30;
export const WAKE_LATEST = 8 * 60 + 30;
export const MAX_STUDY_SESSIONS = 2;
/** Earliest a self-study session may start (it must also be after waking up). */
export const EARLIEST_SESSION = WAKE_EARLIEST;
/** Free stretches shorter than this are too short to study in. */
export const MIN_GAP_MINS = 15;

const HALF_DAY_MINS = 285;
const MIN_MEAL_MINS = 10;
const END_OF_DAY = 24 * 60;

/* ---------- Meals and breaks ---------- */

/** Breakfast and dinner at their times; lunch right after school (or the paper), else at its time. */
export const MEAL_DEFAULTS = { breakfast: { at: 7 * 60, mins: 20 }, lunch: { at: 13 * 60, mins: 45 }, dinner: { at: 20 * 60, mins: 45 } };
export const MEAL_LENGTHS = { breakfast: [15, 20, 30], lunch: [30, 45, 60], dinner: [30, 45, 60] };
export const MEALS = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner with family' };
/** A snack and play break after lunch on school days. */
export const AFTER_SCHOOL_BREAK_OPTIONS = [0, 15, 30, 45];
export const DEFAULT_AFTER_SCHOOL_BREAK = 30;
/** On days without school, an afternoon rest follows lunch. */
const FREE_DAY_REST_MINS = 75;

export const mealsOf = (profile) => Object.fromEntries(MEALS.map((meal) => [meal, { ...MEAL_DEFAULTS[meal], ...profile?.meals?.[meal] }]));
export const wakeOf = (profile) => profile?.wakeAt ?? DEFAULT_WAKE;
/** The student's sleep time (default 22:00): study ends with night revision just before it. */
export const studyEndOf = (profile) => profile?.studyEnd ?? DAY_END;
export const afterSchoolBreakOf = (profile) => profile?.afterSchoolBreakMins ?? DEFAULT_AFTER_SCHOOL_BREAK;

/** Which fixed block wins when two overlap. Meals and breaks are trimmed instead of dropped. */
const RANK = { sleep: 6, exam: 5, school: 4, tuition: 3, habit: 2, meal: 1, break: 1 };
const TRIMMED = new Set(['meal', 'break']);

/* ---------- Edited slots ---------- */

/**
 * Slots and routine blocks the student can move, resize or remove from the calendar, for one
 * day or every day: meals, the break after lunch, the Homework, Self study and Night revision
 * slots, and habits (`habit:<id>`).
 */
export const SLOT_KEYS = ['breakfast', 'lunch', 'dinner', 'break', 'homework', 'study', 'night'];
export const isSlotKey = (key) => SLOT_KEYS.includes(key) || /^habit:[A-Za-z0-9_-]{1,64}$/.test(key);

/** The edits that apply on a date: that day's own, on top of the every-day ones. Each is `{ removed: true }` or `{ start, mins? }`. */
export function slotEditsOn(profile, date) {
  const always = profile.slotEdits?.['*'] ?? {};
  const own = profile.slotEdits?.[date] ?? {};
  const edits = {};
  for (const [key, edit] of Object.entries(always)) edits[key] = { ...edit, scope: 'always' };
  for (const [key, edit] of Object.entries(own)) edits[key] = { ...edit, scope: 'day' };
  return edits;
}

/* ---------- School ---------- */

/** Saturdays: half day (default), full day, off, or off on the 2nd and 4th Saturday of the month. */
export const SATURDAY_MODES = ['half', 'full', 'off', 'alternate'];

/** 1 for the first Saturday of the month, 2 for the second, and so on. */
export const saturdayOfMonth = (date) => Math.ceil(Number(date.slice(8, 10)) / 7);

/**
 * School hours on a weekday (0 = Sunday … 6 = Saturday) by the weekly pattern, or null when
 * there is never school that day. A weekday can have timings of its own (`schoolWeek`);
 * otherwise school runs from `schoolStart` to `schoolEnd`, and Saturdays follow their mode.
 */
export function schoolHours(profile, day) {
  const own = profile.schoolWeek?.[day];
  if (own) return own.off ? null : { start: own.start, end: own.end, half: false };
  if (day === 0) return null;
  const start = profile.schoolStart;
  const end = profile.schoolEnd;
  if (day !== 6) return { start, end, half: false };
  const mode = profile.saturday ?? 'half';
  if (mode === 'off') return null;
  if (mode === 'full') return { start, end, half: false };
  return { start, end: Math.min(end, start + HALF_DAY_MINS), half: true };
}

/** School on a date by the weekly pattern (no holidays, timing changes or exams considered). */
export function schoolPatternOn(profile, date) {
  if (weekday(date) === 6 && (profile.saturday ?? 'half') === 'alternate' && [2, 4].includes(saturdayOfMonth(date))) return null;
  return schoolHours(profile, weekday(date));
}

/** The latest timing change covering `date` that sets `field` ('school' or 'tuitions'), or null. */
export function timingChangeOn(profile, date, field) {
  const changes = profile.timingChanges ?? [];
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    if (change.from <= date && date <= change.to && change[field] != null) return change;
  }
  return null;
}

/**
 * School on a date after timing changes: a change for the day can add or remove school; a
 * change for a week or month changes the hours of the days that have school, or cancels them.
 * Returns `{ school, change }`.
 */
export function schoolOn(profile, date) {
  const pattern = schoolPatternOn(profile, date);
  const change = timingChangeOn(profile, date, 'school');
  if (!change) return { school: pattern, change: null };
  if (change.school.off) return { school: null, change };
  if (!pattern && change.scope !== 'day') return { school: null, change: null };
  return { school: { start: change.school.start, end: change.school.end, half: false }, change };
}

/** The holiday or break covering a date, or null. */
export function holidayOn(profile, date) {
  return (profile.holidays ?? []).find((holiday) => holiday.from <= date && date <= holiday.to) ?? null;
}

/* ---------- Tuition ---------- */

/** Plans saved before tuition times were editable had one tuition, 16:00 to 17:30. */
export const DEFAULT_TUITION_START = 16 * 60;
export const DEFAULT_TUITION_END = 17 * 60 + 30;
/** Earliest and latest a tuition class can be (morning tuition before school is common). */
export const TUITION_EARLIEST = 5 * 60;
export const TUITION_LATEST = DAY_END;
export const MAX_TUITIONS = 6;

/**
 * The student's tuitions: `{ name, days (0 = Sunday … 6 = Saturday), start, end }`, times in
 * minutes after midnight. Plans saved earlier had one set of tuition days and one time.
 */
export function tuitionsOf(profile) {
  if (Array.isArray(profile.tuitions)) return profile.tuitions;
  if (!profile.tuitionDays?.length) return [];
  return [
    {
      name: '',
      days: profile.tuitionDays,
      start: profile.tuitionStart ?? DEFAULT_TUITION_START,
      end: profile.tuitionEnd ?? DEFAULT_TUITION_END,
    },
  ];
}

/** Tuitions on a weekday, earliest first. */
export function tuitionsOn(profile, day) {
  return tuitionsOf(profile)
    .filter((tuition) => tuition.days.includes(day))
    .sort((a, b) => a.start - b.start);
}

/** Tuitions on a date: that day's changed list if it has one, otherwise the weekly ones. */
export function tuitionsOnDate(profile, date) {
  const change = timingChangeOn(profile, date, 'tuitions');
  return change ? [...change.tuitions].sort((a, b) => a.start - b.start) : tuitionsOn(profile, weekday(date));
}

export const tuitionLabel = (tuition) => tuition.name || 'Tuition';

/* ---------- Habits ---------- */

const scheduledOn = (habit, date) => habit.days.includes(weekday(date)) && (!habit.createdOn || habit.createdOn <= date);

/** Routine habits with a set time that happen on this date. */
export function timedHabitsOn(profile, date) {
  if (!Array.isArray(profile.routine)) return [];
  return profile.routine.filter((habit) => Number.isInteger(habit.at) && Number.isInteger(habit.mins) && scheduledOn(habit, date));
}

/** Routine habits without a set time on this date; the plan puts them in their part of the day. */
export function partHabitsOn(profile, date) {
  return routineOf(profile).filter((habit) => !Number.isInteger(habit.at) && scheduledOn(habit, date));
}

/* ---------- Exams ---------- */

/** Half-yearly and final papers: they come with their own time and can replace a school day. */
export const isBigPaper = (exam) => Boolean(EXAM_SERIES[exam.type]);
const hasTime = (exam) => Number.isInteger(exam.start) && Number.isInteger(exam.end) && exam.end > exam.start;

/**
 * The half-yearly or final exam whose papers run over `date` (from its first paper to its
 * last), or null. `studyLeave` is on when the student only goes to school for papers.
 */
export function examPeriodOn(exams, date) {
  const series = new Map();
  for (const exam of exams) {
    if (!isBigPaper(exam)) continue;
    const key = exam.seriesId ?? exam.id;
    const entry = series.get(key) ?? { seriesId: key, name: exam.seriesName ?? exam.name, first: exam.date, last: exam.date, studyLeave: false };
    if (exam.date < entry.first) entry.first = exam.date;
    if (exam.date > entry.last) entry.last = exam.date;
    if (exam.studyLeave === true) entry.studyLeave = true;
    series.set(key, entry);
  }
  for (const entry of series.values()) if (entry.first <= date && date <= entry.last) return entry;
  return null;
}

/* ---------- Intervals ---------- */

const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const byStart = (a, b) => a.start - b.start || a.end - b.end;
const length = (range) => range.end - range.start;

/** `range` minus every block in `busy`, as sorted pieces. */
export function subtract(range, busy) {
  let pieces = range.end > range.start ? [{ start: range.start, end: range.end }] : [];
  for (const block of busy) {
    pieces = pieces.flatMap((piece) => {
      if (!overlaps(piece, block)) return [piece];
      const out = [];
      if (block.start > piece.start) out.push({ start: piece.start, end: block.start });
      if (block.end < piece.end) out.push({ start: block.end, end: piece.end });
      return out;
    });
  }
  return pieces.sort(byStart);
}

/** Overlapping or touching ranges merged into one. */
function union(ranges) {
  const merged = [];
  for (const range of ranges.filter((item) => item.end > item.start).sort(byStart)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/** Earliest start from `from` where `mins` fits between `busy` blocks before `until`, or null. */
function earliestFree(busy, from, until, mins) {
  return subtract({ start: from, end: until }, busy).find((gap) => length(gap) >= mins)?.start ?? null;
}

/* ---------- The day ---------- */

/**
 * What kind of day it is, without laying it out: 'school', 'halfDay', 'noSchool' (Sunday,
 * holiday, Saturday off, school cancelled), 'studyLeave' (a school day inside a half-yearly or
 * final with no paper, when the student only goes in for papers) or 'paper' (a timed exam
 * paper replaces school).
 */
function dayKind(profile, date, exams) {
  const todays = exams.filter((exam) => exam.date === date);
  const papers = todays.filter((exam) => isBigPaper(exam) && hasTime(exam));
  const tests = todays.filter((exam) => !papers.includes(exam));
  const period = examPeriodOn(exams, date);
  const holiday = holidayOn(profile, date);
  const resolved = holiday ? { school: null, change: null } : schoolOn(profile, date);
  let { school } = resolved;
  let dayType;
  let reason = null;
  if (papers.length) {
    dayType = 'paper';
    school = null;
    reason = period?.name ?? papers[0].seriesName ?? papers[0].name;
  } else if (school && period?.studyLeave && !todays.some(isBigPaper)) {
    dayType = 'studyLeave';
    school = null;
    reason = period.name;
  } else if (school) {
    dayType = school.half ? 'halfDay' : 'school';
  } else {
    dayType = 'noSchool';
    reason = holiday?.name ?? (resolved.change ? 'School is off (timetable change)' : weekday(date) === 0 ? 'Sunday' : 'Saturday off');
  }
  return { dayType, reason, school, papers, tests, period, holiday, change: resolved.change };
}

/**
 * Minutes a date has for study: all its free time up to the sleep time. There is no other
 * limit. Without `exams`, exam papers and study leave are not known, so this is the time a
 * normal school day leaves (never more than the real one).
 */
export function limitFor(profile, date, exams = []) {
  return dayFrame(profile, date, exams).free;
}

/** Papers at the same time become one block ("Hindi + Sanskrit"). */
function paperBlocks(papers) {
  const blocks = [];
  for (const paper of [...papers].sort(byStart)) {
    const last = blocks.at(-1);
    if (last && paper.start < last.end) {
      last.end = Math.max(last.end, paper.end);
      last.label = `${last.label} + ${paper.name}`;
      last.examIds.push(paper.id);
    } else {
      blocks.push({ start: paper.start, end: paper.end, label: paper.name, kind: 'exam', examIds: [paper.id] });
    }
  }
  return blocks;
}

function schoolLabel(kind) {
  const base = kind.school.half ? 'School (half day)' : 'School';
  return kind.tests.length ? `${base} · ${kind.tests.map((exam) => exam.name).join(', ')}` : base;
}

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Lays out the fixed part of a day and measures the time left for study.
 * `exams` are the student's tests and papers (any dates); without them exam days are not known.
 */
export function dayFrame(profile, date, exams = []) {
  const kind = dayKind(profile, date, exams);
  const day = weekday(date);
  const wake = wakeOf(profile);
  const end = studyEndOf(profile);
  const meals = mealsOf(profile);
  const edits = slotEditsOn(profile, date);
  const removed = [];
  /** A routine block at its usual time, moved or resized by an edit, or null when removed for the day. */
  const edited = (key, label, start, mins) => {
    const edit = edits[key];
    if (edit?.removed) {
      removed.push({ key, label, scope: edit.scope });
      return null;
    }
    const from = edit?.start ?? start;
    return { start: from, end: from + (edit?.mins ?? mins), ...(edit ? { edited: edit.scope } : {}) };
  };

  const candidates = [
    { start: 0, end: wake, label: `Sleep until ${clock(wake)}`, kind: 'sleep' },
    { start: end, end: END_OF_DAY, label: 'Sleep', kind: 'sleep' },
    ...paperBlocks(kind.papers),
  ];
  if (kind.school) candidates.push({ start: kind.school.start, end: kind.school.end, label: schoolLabel(kind), kind: 'school' });
  for (const tuition of tuitionsOnDate(profile, date)) candidates.push({ start: tuition.start, end: tuition.end, label: tuitionLabel(tuition), kind: 'tuition' });
  for (const habit of timedHabitsOn(profile, date)) {
    const range = edited(`habit:${habit.id}`, habit.name, habit.at, habit.mins);
    if (range) candidates.push({ ...range, label: habit.name, kind: 'habit', habitId: habit.id, key: `habit:${habit.id}` });
  }

  // Meals: lunch comes straight after school or the paper, then a break (snack and play after
  // school, an afternoon rest on days without school).
  const morningEnd = kind.papers.length ? Math.max(...candidates.filter((block) => block.kind === 'exam').map((block) => block.end)) : (kind.school?.end ?? null);
  const lunchStart = morningEnd ?? meals.lunch.at;
  const breakMins = morningEnd === null ? FREE_DAY_REST_MINS : afterSchoolBreakOf(profile);
  const mealStarts = { breakfast: meals.breakfast.at, lunch: lunchStart, dinner: meals.dinner.at };
  for (const meal of MEALS) {
    const range = edited(meal, MEAL_LABELS[meal], mealStarts[meal], meals[meal].mins);
    if (range) candidates.push({ ...range, label: MEAL_LABELS[meal], kind: 'meal', meal, key: meal });
  }
  const breakLabel = morningEnd === null ? 'Afternoon rest' : 'Snack and play';
  const breakRange = breakMins || edits.break ? edited('break', breakLabel, lunchStart + meals.lunch.mins, breakMins || 15) : null;
  if (breakRange) candidates.push({ ...breakRange, label: breakLabel, kind: 'break', key: 'break' });

  // Higher-ranked blocks go first; a lower one that clashes is dropped (meals and breaks are trimmed).
  const blocks = [];
  const dropped = [];
  for (const block of candidates.sort((a, b) => RANK[b.kind] - RANK[a.kind] || byStart(a, b))) {
    if (TRIMMED.has(block.kind)) {
      const piece = subtract(block, blocks).sort((a, b) => length(b) - length(a))[0];
      if (piece && length(piece) >= MIN_MEAL_MINS) blocks.push({ ...block, ...piece });
      continue;
    }
    const clash = blocks.find((placed) => overlaps(placed, block));
    if (clash) dropped.push({ label: block.label, kind: block.kind, because: clash.label });
    else blocks.push(block);
  }

  // Habits without a set time go in their part of the day: the morning after waking (before
  // school), after school, or the evening after dinner.
  // Study time starts when school (or the paper) ends; lunch and the break are blocks of their
  // own, so moving or removing them frees that time.
  const regularStart = morningEnd ?? FREE_DAY_START;
  const morningUntil = kind.school?.start ?? (kind.papers.length ? Math.min(...kind.papers.map((paper) => paper.start)) : FREE_DAY_START);
  const windows = {
    morning: { from: wake, until: Math.max(wake, morningUntil) },
    afternoon: { from: regularStart, until: end },
    evening: { from: meals.dinner.at + meals.dinner.mins, until: end },
  };
  for (const habit of partHabitsOn(profile, date)) {
    const mins = habit.mins ?? DEFAULT_HABIT_MINS;
    const edit = edits[`habit:${habit.id}`];
    if (edit?.removed) {
      removed.push({ key: `habit:${habit.id}`, label: habit.name, scope: edit.scope });
      continue;
    }
    // A habit given a time from the calendar sits there, if that time is free.
    if (Number.isInteger(edit?.start)) {
      const block = { start: edit.start, end: edit.start + (edit.mins ?? mins), label: habit.name, kind: 'habit', habitId: habit.id, part: habit.part, key: `habit:${habit.id}`, edited: edit.scope };
      if (blocks.some((placed) => overlaps(placed, block))) dropped.push({ label: habit.name, kind: 'habit', because: 'its new time is taken' });
      else blocks.push(block);
      continue;
    }
    const window = windows[habit.part] ?? windows.evening;
    let start = earliestFree(blocks, window.from, window.until, mins);
    // An evening habit that doesn't fit after dinner goes in the evening before it.
    if (start === null && habit.part === 'evening') start = earliestFree(blocks, 18 * 60, end, mins);
    if (start === null) dropped.push({ label: habit.name, kind: 'habit', because: 'no free time' });
    else blocks.push({ start, end: start + mins, label: habit.name, kind: 'habit', habitId: habit.id, part: habit.part, auto: true, key: `habit:${habit.id}` });
  }
  blocks.sort(byStart);

  // Flexible work goes after school (or from 09:00), and in the student's own study sessions.
  const ownSessions = (profile.studySessions ?? [])
    .map((session) => ({ start: Math.max(session.start, wake), end: Math.min(session.end, end) }))
    .filter((session) => session.end > session.start);
  const zones = union([{ start: regularStart, end }, ...ownSessions]);
  const gaps = zones.flatMap((zone) => subtract(zone, blocks)).filter((gap) => length(gap) >= MIN_GAP_MINS);
  const sessions = ownSessions.flatMap((session) => subtract(session, blocks)).filter((piece) => length(piece) >= MIN_GAP_MINS);
  const free = gaps.reduce((sum, gap) => sum + length(gap), 0);

  return {
    date,
    weekday: day,
    dayType: kind.dayType,
    reason: kind.reason,
    holiday: kind.holiday ? { id: kind.holiday.id, name: kind.holiday.name } : null,
    changed: kind.change ? { id: kind.change.id, scope: kind.change.scope } : null,
    papers: kind.papers.map(({ id, name, start, end: paperEnd }) => ({ id, name, start, end: paperEnd })),
    tests: kind.tests.map(({ id, name, type }) => ({ id, name, type })),
    examPeriod: kind.period,
    blocks,
    dropped,
    edits,
    removed,
    wake,
    sleep: end,
    window: { start: Math.min(regularStart, ...zones.map((zone) => zone.start)), regularStart, end },
    zones,
    gaps,
    sessions,
    // No daily limit: the day can hold as much study as it has free time.
    limit: free,
    free,
    capacity: free,
  };
}

/* ---------- Clash checks for saving ---------- */

/**
 * The first fixed weekly block that `{ days, start, end }` would overlap: sleep, school (by
 * the weekly pattern), a tuition, or another timed habit. Returns `{ day, kind, label, start,
 * end, index }` or null. Used to refuse clashing timings before they are saved.
 */
export function weeklyClash(profile, { days, start, end }, { skipHabitId = null, habits = true } = {}) {
  const hits = (block) => start < block.end && end > block.start;
  const wake = wakeOf(profile);
  const sleep = studyEndOf(profile);
  for (const day of [...days].sort((a, b) => a - b)) {
    if (start < wake) return { day, kind: 'sleep', label: 'your sleep', start: 0, end: wake };
    if (end > sleep) return { day, kind: 'sleep', label: 'your sleep', start: sleep, end: END_OF_DAY };
    const school = schoolHours(profile, day);
    if (school && hits(school)) return { day, kind: 'school', label: 'school', start: school.start, end: school.end };
    const all = tuitionsOf(profile);
    for (const tuition of tuitionsOn(profile, day)) {
      if (hits(tuition)) return { day, kind: 'tuition', label: tuitionLabel(tuition), start: tuition.start, end: tuition.end, index: all.indexOf(tuition) };
    }
    if (!habits || !Array.isArray(profile.routine)) continue;
    for (const habit of profile.routine) {
      if (habit.id === skipHabitId || !Number.isInteger(habit.at) || !habit.days.includes(day)) continue;
      const block = { start: habit.at, end: habit.at + habit.mins };
      if (hits(block)) return { day, kind: 'habit', label: habit.name, ...block };
    }
  }
  return null;
}
