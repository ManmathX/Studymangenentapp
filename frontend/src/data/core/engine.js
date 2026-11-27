// Originally ported from the retired backend's planner.engine.ts. This copy is now the source of truth.
import { addDays, diffDays, eachDay, weekday } from './dates';
import { dayFrame, MIN_GAP_MINS, studyEndOf, subtract } from './dayFrame';
import { shortDate } from './shortDate';
import { BAG_EXTRAS, isSubjectPeriod, SUBJECTS, TIMETABLE } from './syllabus';
import { EXAM_PREP_DAYS, PLANNING_HORIZON_DAYS, REVISION_INTERVALS } from './types';

// School, tuition, limits and the day frame live in dayFrame.js; these names stay importable from here.
export {
  DAY_END,
  dayFrame,
  DEFAULT_TUITION_END,
  DEFAULT_TUITION_START,
  limitFor,
  MAX_TUITIONS,
  SATURDAY_MODES,
  schoolHours,
  TUITION_EARLIEST,
  TUITION_LATEST,
  tuitionLabel,
  tuitionsOf,
  tuitionsOn,
} from './dayFrame';

/** A short break after each study task, and a longer one after about 90 minutes of study in a row. */
export const SHORT_BREAK_MINS = 10;
export const LONG_BREAK_MINS = 20;
export const LONG_BREAK_AFTER_MINS = 90;
/** New work is planned from tomorrow once it is this close to the student's stop time. */
const EVENING_CUTOFF_BEFORE_END = 3 * 60;

/* ---------- Daily limits and load ---------- */

/** Orders for tasks the planner is still trying out: after every stored task of the day. */
const TRIAL_ORDER = 1e12;

/**
 * Running totals of planned minutes per day, and the tasks behind them. Skipped tasks never
 * count. Pass the student's `exams` so exam days and study leave are known (each day's frame
 * is worked out once), and `counts` to leave some tasks out of the minutes (for example
 * school homework, which has its own slot) while still keeping them on the day's timeline.
 */
export class DayLoad {
  accepted = new Map();
  suggested = new Map();
  frames = new WeakMap();
  tasksByDate = new Map();
  trials = 0;
  constructor(tasks = [], { exams = [], counts = () => true } = {}) {
    this.exams = exams;
    this.counts = counts;
    for (const task of tasks) this.add(task);
  }
  add(task) {
    if (task.status === 'skipped') return;
    // Entries with a kind are real tasks (or planned ones) and take time on the timeline.
    if (task.kind) {
      const list = this.tasksByDate.get(task.date) ?? [];
      list.push(task.order === undefined ? { ...task, order: TRIAL_ORDER + (this.trials += 1) } : task);
      this.tasksByDate.set(task.date, list);
    }
    if (!this.counts(task)) return;
    const bucket = task.status === 'accepted' ? this.accepted : this.suggested;
    bucket.set(task.date, (bucket.get(task.date) ?? 0) + task.mins);
  }
  planned(date, includeSuggested = false) {
    const accepted = this.accepted.get(date) ?? 0;
    return includeSuggested ? accepted + (this.suggested.get(date) ?? 0) : accepted;
  }
  /** The day's frame (fixed blocks, free time, limit, capacity) for this student. */
  frame(profile, date) {
    let byDate = this.frames.get(profile);
    if (!byDate) {
      byDate = new Map();
      this.frames.set(profile, byDate);
    }
    if (!byDate.has(date)) byDate.set(date, dayFrame(profile, date, this.exams));
    return byDate.get(date);
  }
  limit(profile, date) {
    return this.frame(profile, date).limit;
  }
  /** Minutes still free on a day: never more than its limit or the time it really has. */
  room(profile, date) {
    return this.frame(profile, date).capacity - this.planned(date, true);
  }
  isOverloaded(profile, date) {
    return this.planned(date) > this.limit(profile, date);
  }
  /**
   * Whether `task` (`{ kind, mins, examId?, daily? }`) still fits in its own slot on the day's
   * timeline, after what is already there and with a break before it: minutes alone can't
   * tell, because free time comes in separate stretches. Self study must fit in a study slot,
   * night revision in the night slot, and so on, so planned days keep their shape.
   */
  fits(profile, date, task) {
    const trial = { status: 'accepted', score: 0, examId: null, ...task, id: '__trial', date, order: TRIAL_ORDER * 2 };
    const frame = this.frame(profile, date);
    const slots = routineSlots(profile, date, this.exams, frame);
    const { overflow } = placeTasks(frame, slots, sortDayTasks([...(this.tasksByDate.get(date) ?? []), trial]), false, trial);
    return !overflow.includes(trial);
  }
}
/** Day with the most spare room that still fits `mins` (and, if given, `task` on its timeline), or null. */
export function bestDay(load, profile, mins, from, to, exclude, task = null) {
  let best = null;
  let spare = -1;
  for (const date of eachDay(from, to)) {
    if (date === exclude) continue;
    const room = load.room(profile, date);
    if (room >= mins && room > spare && (!task || load.fits(profile, date, { ...task, mins }))) {
      best = date;
      spare = room;
    }
  }
  return best;
}
/** Earliest day that still fits `mins` (and, if given, `task` on its timeline), or null. */
export function firstDay(load, profile, mins, from, to, task = null) {
  for (const date of eachDay(from, to)) if (load.room(profile, date) >= mins && (!task || load.fits(profile, date, { ...task, mins }))) return date;
  return null;
}
/** Today, or tomorrow once it is within three hours of the student's stop time (19:00 by default). */
export function startDay(local, profile) {
  const cutoffHour = Math.floor((studyEndOf(profile) - EVENING_CUTOFF_BEFORE_END) / 60);
  return local.hour < cutoffHour ? local.date : addDays(local.date, 1);
}
/** Priority = urgency × grade weight × difficulty, rounded to one decimal. */
export function priority(daysLeft, weight, difficulty) {
  return Math.round((10 / Math.max(1, daysLeft)) * (weight / 10) * difficulty * 10) / 10;
}
/* ---------- Day timeline ---------- */

/** The fixed part of a day: `{ start, end, blocks }` (kept for callers that only need the blocks). */
export function fixedBlocks(profile, date, exams = []) {
  const frame = dayFrame(profile, date, exams);
  return { start: frame.window.regularStart, end: frame.window.end, blocks: frame.blocks };
}
/** Accepted tasks first in the order they were added, then suggestions by priority. */
export function sortDayTasks(tasks) {
  return tasks
    .filter((task) => task.status !== 'skipped')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'accepted' ? -1 : 1;
      return a.status === 'suggested' ? b.score - a.score : a.order - b.order;
    });
}
/* ---------- Daily homework and self study slots ---------- */

export const HOMEWORK_SLOT_OPTIONS = [30, 45, 60, 90];
export const DEFAULT_HOMEWORK_MINS = 60;
const MIN_SELF_STUDY_MINS = 30;

/** First free stretch of `mins` from `from` that avoids `busy`; otherwise the longest free stretch. */
function fitWindow(busy, from, end, mins) {
  const gaps = [];
  let cursor = from;
  for (const block of [...busy].sort((a, b) => a.start - b.start)) {
    if (block.end <= cursor) continue;
    if (block.start > cursor) gaps.push({ start: cursor, end: Math.min(block.start, end) });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < end) gaps.push({ start: cursor, end });
  const open = gaps.filter((gap) => gap.end > gap.start);
  const fitting = open.find((gap) => gap.end - gap.start >= mins);
  if (fitting) return { start: fitting.start, end: fitting.start + mins };
  const longest = open.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  return longest ?? null;
}

/**
 * Free time for `mins` of study from `from`: the first stretch that holds all of it, or else
 * the free stretches in time order (each at least 15 minutes) until the minutes are shared out.
 */
function fitRanges(busy, from, end, mins) {
  const whole = fitWindow(busy, from, end, mins);
  if (!whole || whole.end - whole.start >= mins) return whole ? [whole] : [];
  const pieces = [];
  let left = mins;
  for (const gap of subtract({ start: from, end }, busy)) {
    if (left < MIN_GAP_MINS) break;
    const take = Math.min(left, gap.end - gap.start);
    if (take < MIN_GAP_MINS) continue;
    pieces.push({ start: gap.start, end: gap.start + take });
    left -= take;
  }
  return pieces;
}

/** Longest homework a student can add: a big project, spread over several days. */
export const MAX_HOMEWORK_MINS = 600;
/** Smallest piece a long homework is split into; anything shorter joins its neighbour. */
const MIN_HOMEWORK_PART_MINS = 15;

/**
 * Splits `mins` of homework over `days` (oldest first). Fills the days nearest the due date first,
 * each up to `roomOf(date)` free minutes, in 5-minute steps. If the free time runs out, the rest is
 * shared evenly over every day. Returns [{ date, mins }] in date order; one entry when it fits in a day.
 */
export function splitHomework(mins, days, roomOf) {
  if (mins <= 0 || !days.length) return [];
  const plan = new Map();
  let left = mins;
  for (const date of [...days].reverse()) {
    if (!left) break;
    const take = Math.min(left, Math.floor(Math.max(0, roomOf(date)) / 5) * 5);
    if (take < MIN_HOMEWORK_PART_MINS && take < left) continue;
    plan.set(date, take);
    left -= take;
  }
  if (left) {
    const share = Math.ceil(left / days.length / 5) * 5;
    for (const date of [...days].reverse()) {
      if (!left) break;
      const add = Math.min(left, share);
      plan.set(date, (plan.get(date) ?? 0) + add);
      left -= add;
    }
  }
  const parts = days.filter((date) => plan.get(date)).map((date) => ({ date, mins: plan.get(date) }));
  // Fold a too-short piece into the day after it (or before it, if it is the last day).
  for (let index = parts.length - 1; index >= 0 && parts.length > 1; index -= 1) {
    if (parts[index].mins >= MIN_HOMEWORK_PART_MINS) continue;
    const into = parts[index + 1] ?? parts[index - 1];
    into.mins += parts[index].mins;
    parts.splice(index, 1);
  }
  return parts;
}

/** The Homework slot's length when the day has `free` minutes: the student's choice, leaving at least 30 minutes for study. */
export function homeworkMinsFor(profile, free) {
  return Math.max(15, Math.min(profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS, free - MIN_SELF_STUDY_MINS));
}

/* ---------- Night revision ---------- */

/** Minutes of night revision for each thing the day covered. */
export const NIGHT_REVISION_MINS = { school: 15, tuition: 10, study: 10 };

/**
 * What the night revision covers, every night just before the stop time: what school taught
 * (on a day with school), each tuition that happened, and the day's own study.
 */
export function nightRevisionItems(frame) {
  const items = [];
  if (frame.dayType === 'school' || frame.dayType === 'halfDay') items.push({ of: 'school', label: 'School', mins: NIGHT_REVISION_MINS.school });
  for (const block of frame.blocks) if (block.kind === 'tuition') items.push({ of: 'tuition', label: block.label, mins: NIGHT_REVISION_MINS.tuition });
  items.push({ of: 'study', label: 'Self study', mins: NIGHT_REVISION_MINS.study });
  return items;
}

/**
 * Where an edited slot goes: the requested time if it is free, otherwise the next free stretch
 * after it that is long enough, otherwise the longest free stretch after it (at least 15
 * minutes). Null when nothing after it is free.
 */
function editedRange(frame, busy, start, mins) {
  const pieces = subtract({ start, end: frame.window.end }, busy).filter(
    (part) => frame.zones.some((zone) => part.start >= zone.start && part.end <= zone.end) || part.start >= frame.window.regularStart,
  );
  const fitting = pieces.find((part) => part.end - part.start >= mins);
  if (fitting) return { start: fitting.start, end: fitting.start + mins };
  const longest = pieces.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  return longest && longest.end - longest.start >= MIN_GAP_MINS ? longest : null;
}

/**
 * The night revision slot: the last minutes of free time before sleep (shorter if the evening
 * is), or where the student moved it. Null when they removed it for the day.
 */
function nightRange(frame) {
  const edit = frame.edits?.night;
  if (edit?.removed) return null;
  const mins = nightRevisionItems(frame).reduce((sum, item) => sum + item.mins, 0);
  // Moved, it keeps its length: what the day covered decides how long night revision is.
  if (Number.isInteger(edit?.start)) {
    const moved = editedRange(frame, frame.blocks, edit.start, mins);
    if (moved) return moved;
  }
  const last = frame.gaps.at(-1);
  return last ? { start: Math.max(last.start, last.end - mins), end: last.end } : null;
}

/**
 * Time a day keeps aside before study is planned: the Homework slot (none during a half-yearly
 * or final) and the night revision slot. `{ homework, night, study }` in minutes, where `study`
 * is the free time left for self study or test prep.
 */
export function reservedMins(profile, frame) {
  const edits = frame.edits ?? {};
  const nightSlot = nightRange(frame);
  const night = nightSlot ? nightSlot.end - nightSlot.start : 0;
  // No Homework slot while a half-yearly or final is on, however it was edited.
  const homework = frame.examPeriod || edits.homework?.removed ? 0 : (edits.homework?.mins ?? homeworkMinsFor(profile, frame.free - night));
  // With Self study removed for the day, its free time stays free: nothing is planned in it.
  const study = edits.study?.removed ? 0 : Math.max(0, frame.free - night - homework);
  return { homework, night, study };
}

/**
 * Minutes of the day's Homework slot: the student's choice, leaving at least 30 minutes for
 * study. During a half-yearly or final (first to last paper) there is no Homework slot.
 */
export function homeworkSlotMins(profile, date, exams = []) {
  return reservedMins(profile, dayFrame(profile, date, exams)).homework;
}

/**
 * Tests whose preparation window (the days before them) includes `date`, soonest first.
 * Unit tests prepare for two weeks; half-yearly and final papers from their exam's `prepFrom`.
 */
export function prepExamsOn(exams, date) {
  return exams
    .filter((exam) => date < exam.date && date >= (exam.prepFrom ?? addDays(exam.date, -EXAM_PREP_DAYS)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The day's flexible slots. Every night ends with a Night revision slot just before the stop
 * time (what school, each tuition and the day's study covered). A Homework slot comes after
 * school and lunch (none during a half-yearly or final). All the free time left is study: first
 * the student's own study sessions, then the free time after homework. There is no daily limit.
 * The study slots are Self study, Test prep in the two weeks before a test, or Exam revision
 * between the papers of a half-yearly or final.
 */
export function routineSlots(profile, date, exams = [], frame = dayFrame(profile, date, exams)) {
  const { blocks, window } = frame;
  const edits = frame.edits ?? {};
  const night = nightRange(frame);
  const reserved = reservedMins(profile, frame);
  const fixed = night ? [...blocks, night] : blocks;
  // The Homework slot goes after school, or where the student moved it.
  const movedHomework = reserved.homework && Number.isInteger(edits.homework?.start) ? editedRange(frame, fixed, edits.homework.start, reserved.homework) : null;
  const homework = movedHomework ?? (reserved.homework ? fitWindow(fixed, window.regularStart, window.end, reserved.homework) : null);
  let left = reserved.study;

  const study = [];
  for (const session of frame.sessions) {
    for (const piece of subtract(session, [...(homework ? [homework] : []), ...(night ? [night] : [])])) {
      const take = Math.min(left, piece.end - piece.start);
      if (take < MIN_GAP_MINS) continue;
      study.push({ start: piece.start, end: piece.start + take, session: true });
      left -= take;
    }
  }
  if (left >= MIN_GAP_MINS) {
    const busy = [...fixed, ...(homework ? [homework] : []), ...study];
    study.push(...fitRanges(busy, movedHomework ? window.regularStart : homework ? homework.end : window.regularStart, window.end, left));
  }
  study.sort((a, b) => a.start - b.start);

  const upcoming = prepExamsOn(exams, date);
  // Papers of one half-yearly or final are shown under the exam's name.
  const names = [...new Set(upcoming.map((exam) => exam.seriesName ?? exam.name))];
  const look = upcoming.length
    ? {
        kind: 'exam',
        label: frame.examPeriod ? 'Exam revision' : 'Test prep',
        detail: `${names[0]}${names.length > 1 ? ` and ${names.length - 1} more` : ''}`,
        exams: upcoming.map(({ id, name, date: examDate }) => ({ id, name, date: examDate })),
      }
    : { kind: 'study', label: 'Self study' };

  const slots = [];
  const editedBy = (key) => (edits[key] && !edits[key].removed ? { edited: edits[key].scope } : {});
  if (homework) slots.push({ kind: 'homework', label: 'Homework', key: 'homework', ...editedBy('homework'), ...homework });
  for (const { session, ...range } of study) slots.push({ ...look, key: 'study', ...range, ...(session ? { session: true } : {}) });
  if (night) slots.push({ kind: 'night', label: 'Night revision', key: 'night', ...editedBy('night'), detail: nightRevisionItems(frame).map((item) => item.label).join(' · '), ...night });
  return slots;
}

/**
 * Which of the day's slots a task goes in. Night revision goes in the Night revision slot;
 * work for a test in the Test prep slot; school homework in the Homework slot; any other
 * study in the study slot (Test prep or Self study).
 */
export function slotKindFor(task, slots = []) {
  // Night revision only ever goes in the night slot; without one (removed for the day) it isn't planned.
  if (task.daily?.type === 'night') return 'night';
  const hasExamSlot = slots.some((slot) => slot.kind === 'exam');
  if (task.examId && hasExamSlot) return 'exam';
  if (task.kind === 'homework' && !task.examId) return 'homework';
  return hasExamSlot ? 'exam' : 'study';
}

const ROW_ORDER = { fixed: 0, slot: 1, break: 2, task: 3 };

/** Earliest start at or after `from` where `mins` fits inside one free interval and ends by `bound`. */
function earliestFit(free, from, mins, bound = Infinity) {
  for (const interval of free) {
    if (interval.end <= from) continue;
    const start = Math.max(from, interval.start);
    if (start + mins <= Math.min(interval.end, bound)) return start;
  }
  return null;
}

/**
 * Lays out a day: the fixed blocks (exam paper, school, tuition, timed habits, meals), the
 * day's slots, and each task in its slot. A task first goes in its own slots in time order,
 * with a 10-minute break after the one before; if they are full it takes the earliest free
 * time after its slot, then any free time that day, without the break. It never overlaps a
 * fixed block or another task. Tasks that fit nowhere before the stop time are overflow.
 */
/**
 * Places tasks in order. In slot mode each task goes in its own slots first (stopping where
 * the next slot starts), with a break after the task before it, then the earliest free time
 * after its slot, then any free time. In packed mode tasks simply follow one another from
 * the earliest free time. Breaks are dropped only when they are what stops a task fitting.
 * `strict` (one task) may only go in its own slots, with its break: that is how the planner
 * checks a new task. The Night revision slot is kept for night revision in every mode.
 */
function placeTasks(frame, slots, ordered, packed, strict = null) {
  const byTime = [...slots].sort((a, b) => a.start - b.start);
  // A slot's tasks may run on until the next slot starts; night revision stays inside its own slot.
  const boundOf = (slot) => (slot.kind === 'night' ? slot.end : (byTime.find((other) => other !== slot && other.start > slot.start)?.start ?? frame.window.end));
  const nightSlot = slots.find((slot) => slot.kind === 'night');
  const occupied = [...frame.blocks];
  // Per slot (or one for the packed day): where the next task may start after its break, where
  // the last task ended, and how long the student has been studying without a long break.
  const cursor = new Map();
  const PACKED = 'packed';
  const placed = [];
  const breaks = [];
  const overflow = [];
  for (const task of ordered) {
    const night = task.daily?.type === 'night';
    const free = frame.zones.flatMap((zone) => subtract(zone, nightSlot && !night ? [...occupied, nightSlot] : occupied));
    let start = null;
    let region = null;
    if (packed && !night) {
      start = earliestFit(free, cursor.get(PACKED)?.at ?? -Infinity, task.mins);
      if (start !== null) region = PACKED;
    } else {
      const regions = byTime.filter((slot) => slot.kind === slotKindFor(task, slots));
      for (const candidate of regions) {
        start = earliestFit(free, cursor.get(candidate)?.at ?? candidate.start, task.mins, boundOf(candidate));
        if (start !== null) {
          region = candidate;
          break;
        }
      }
      if (start === null && task !== strict) start = earliestFit(free, regions[0]?.start ?? frame.window.regularStart, task.mins);
    }
    if (start === null && task !== strict) start = earliestFit(free, -Infinity, task.mins);
    if (start === null) {
      overflow.push(task);
      continue;
    }
    placed.push({ type: 'task', start, end: start + task.mins, task });
    occupied.push({ start, end: start + task.mins });
    if (!region) continue;
    const last = cursor.get(region);
    // The break before this task shows on the plan; a long enough gap counts as a rest.
    // Anything already inside the break (a short habit, the night revision slot, another task)
    // keeps its place; the break shows only in the time that is really empty.
    if (last && start === last.at && last.at > last.end) {
      const long = last.at - last.end >= LONG_BREAK_MINS;
      const taken = [...frame.blocks, ...placed, ...(nightSlot ? [nightSlot] : [])];
      for (const piece of subtract({ start: last.end, end: last.at }, taken)) breaks.push({ type: 'break', start: piece.start, end: piece.end, long });
    }
    const streak = (last && start - last.end < LONG_BREAK_MINS ? last.streak : 0) + task.mins;
    // Night revision is one sitting before sleep: its parts follow straight on.
    const pause = night ? 0 : streak >= LONG_BREAK_AFTER_MINS ? LONG_BREAK_MINS : SHORT_BREAK_MINS;
    cursor.set(region, { at: start + task.mins + pause, end: start + task.mins, streak });
    // The break is kept free, so nothing else is squeezed into it; it never runs into the next
    // slot or the night revision.
    const until = region === PACKED ? (nightSlot && start < nightSlot.start ? nightSlot.start : Infinity) : boundOf(region);
    const breakEnd = Math.min(start + task.mins + pause, until);
    if (breakEnd > start + task.mins) occupied.push({ start: start + task.mins, end: breakEnd });
  }
  return { placed: [...placed, ...breaks], overflow };
}

/**
 * Lays out a day: the fixed blocks (exam paper, school, tuition, timed habits, meals), the
 * day's slots, and each task in its slot. A task first goes in its own slots in time order,
 * with a 10-minute break after the one before; if they are full it takes the earliest free
 * time after its slot, then any free time that day, without the break. It never overlaps a
 * fixed block or another task. If that leaves tasks over, the day is packed again from its
 * earliest free time instead (a repair step), and whichever fits more is kept. Tasks that fit
 * nowhere before the stop time are overflow.
 */
export function layoutDay(profile, date, tasks, exams = [], frame = dayFrame(profile, date, exams)) {
  const slots = routineSlots(profile, date, exams, frame);
  const ordered = sortDayTasks(tasks);
  let result = placeTasks(frame, slots, ordered, false);
  if (result.overflow.length) {
    const packed = placeTasks(frame, slots, ordered, true);
    if (packed.overflow.length < result.overflow.length) result = packed;
  }
  const rows = [...frame.blocks.map((block) => ({ type: 'fixed', ...block })), ...slots.map((slot) => ({ type: 'slot', ...slot })), ...result.placed];
  rows.sort((a, b) => a.start - b.start || ROW_ORDER[a.type] - ROW_ORDER[b.type]);
  return { rows, overflow: result.overflow, slots, frame };
}
/* ---------- Chapters ---------- */
export function stepsFor(chapter) {
  const exercises =
    chapter.subject === 'maths' || chapter.subject === 'science' ? 'NCERT exercises' : 'Textbook questions';
  const steps = {
    not: [
      { title: 'Self study: read and make notes', mins: 45, kind: 'study' },
      { title: exercises, mins: 40, kind: 'practice' },
      { title: 'Practise extra questions', mins: 30, kind: 'practice' },
      { title: 'Revise from your notes', mins: 20, kind: 'revision' },
    ],
    learning: [
      { title: exercises, mins: 40, kind: 'practice' },
      { title: 'Practise extra questions', mins: 30, kind: 'practice' },
      { title: 'Revise from your notes', mins: 20, kind: 'revision' },
    ],
    practiced: [
      { title: 'Revise from your notes', mins: 20, kind: 'revision' },
      { title: 'Past-paper questions', mins: 30, kind: 'practice' },
    ],
    revised: [
      { title: 'Past-paper questions', mins: 30, kind: 'practice' },
      { title: 'Final revision', mins: 20, kind: 'revision' },
    ],
    mastered: [{ title: 'Quick revision', mins: 15, kind: 'revision' }],
  };
  return steps[chapter.status];
}
/** The next test covering the chapter and the last day to finish its steps. */
export function chapterDeadline(chapterKey, exams, today) {
  const exam = exams
    .filter((candidate) => candidate.date > today && candidate.chapterKeys.includes(chapterKey))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return exam
    ? { exam, deadline: addDays(exam.date, -1) }
    : { exam: null, deadline: addDays(today, PLANNING_HORIZON_DAYS) };
}
/** Proposes one day per step, in order, using days with free time before the deadline. */
export function proposeDays(load, profile, stepMinutes, deadline, today, start) {
  const horizonEnd = addDays(today, PLANNING_HORIZON_DAYS);
  const cap = deadline < horizonEnd ? deadline : horizonEnd;
  const reserved = new Map();
  const room = (date) => load.room(profile, date) - (reserved.get(date) ?? 0);
  const days = [];
  let from = start;
  for (const mins of stepMinutes) {
    let day = null;
    for (const date of eachDay(from, cap))
      if (room(date) >= mins) {
        day = date;
        break;
      }
    if (!day)
      for (const date of eachDay(start, cap))
        if (room(date) >= mins) {
          day = date;
          break;
        }
    if (!day) day = from <= cap ? from : cap >= start ? cap : start;
    reserved.set(day, (reserved.get(day) ?? 0) + mins);
    days.push(day);
    from = addDays(day, 1);
  }
  return days;
}
/** Spaced-revision reminders due today (1, 7 and 30 days after learning). */
export function dueRevisionNudges(chapters, today) {
  return chapters.filter((chapter) => {
    if (!chapter.learnedOn || chapter.revisions >= REVISION_INTERVALS.length) return false;
    if (chapter.snoozedUntil && chapter.snoozedUntil > today) return false;
    const interval = REVISION_INTERVALS[chapter.revisions] ?? Infinity;
    return diffDays(chapter.learnedOn, today) >= interval;
  });
}
export function coverage(chapters) {
  const counts = { not: 0, learning: 0, practiced: 0, revised: 0, mastered: 0 };
  for (const chapter of chapters) if (chapter.status in counts) counts[chapter.status] += 1;
  const total = chapters.length;
  const covered = counts.revised + counts.mastered;
  return { counts, total, covered, percent: total ? Math.round((covered / total) * 100) : 0 };
}
export function readiness(chapterKeys, statusByKey) {
  const revised = chapterKeys.filter((key) => {
    const status = statusByKey.get(key);
    return status === 'revised' || status === 'mastered';
  }).length;
  return { revised, total: chapterKeys.length };
}
const EXAM_STEP = {
  not: { mins: 60, what: 'self study and notes', kind: 'study' },
  learning: { mins: 45, what: 'revise and practise', kind: 'revision' },
  practiced: { mins: 30, what: 'revision', kind: 'revision' },
  revised: { mins: 30, what: 'final revision', kind: 'revision' },
};
/**
 * Fills free time before deadlines with suggested blocks, highest priority first.
 * Mutates `load` so each placement accounts for the previous ones.
 */
export function planSuggestions(input) {
  const { profile, today, start, load } = input;
  const candidates = [];
  for (const homework of input.homework) {
    if (homework.done || input.plannedHomeworkIds.has(homework.id)) continue;
    const daysLeft = diffDays(today, homework.due);
    if (daysLeft < 1) continue;
    candidates.push({
      subject: homework.subject,
      title: homework.title,
      kind: 'homework',
      mins: homework.mins,
      homeworkId: homework.id,
      deadline: addDays(homework.due, -1),
      score: priority(daysLeft, homework.weight || 5, homework.difficulty),
      why: `Homework due ${shortDate(homework.due)}`,
    });
  }
  const chapterByKey = new Map(input.chapters.map((chapter) => [chapter.key, chapter]));
  const bestByChapter = new Map();
  for (const exam of input.exams) {
    const daysLeft = diffDays(today, exam.date);
    if (daysLeft < 1) continue;
    for (const key of exam.chapterKeys) {
      const chapter = chapterByKey.get(key);
      if (!chapter || chapter.status === 'mastered') continue;
      const planned = input.plannedChapterDates.get(key) ?? [];
      if (planned.some((date) => date >= today && date < exam.date)) continue;
      const step = EXAM_STEP[chapter.status];
      const candidate = {
        subject: chapter.subject,
        title: `${chapter.name}: ${step.what}`,
        kind: step.kind,
        mins: step.mins,
        chapterKey: key,
        deadline: addDays(exam.date, -1),
        score: priority(daysLeft, exam.weight, chapter.difficulty),
        why: `${exam.name} in ${daysLeft} days, ${exam.weight}% of grade`,
      };
      const existing = bestByChapter.get(key);
      if (!existing || existing.score < candidate.score) bestByChapter.set(key, candidate);
    }
  }
  candidates.push(...bestByChapter.values());
  candidates.sort((a, b) => b.score - a.score);
  const placed = [];
  for (const candidate of candidates) {
    if (candidate.deadline < start) continue;
    const date = firstDay(load, profile, candidate.mins, start, candidate.deadline, candidate);
    if (!date) continue;
    load.add({ ...candidate, date, status: 'suggested' });
    placed.push({ ...candidate, date });
  }
  return placed;
}
/** Consecutive days of study, rest or exams, counting back from today (or yesterday if today is empty). */
export function streak(stateOf, today) {
  let date = stateOf(today) ? today : addDays(today, -1);
  let count = 0;
  while (count < 3650) {
    const state = stateOf(date);
    if (state !== 'study' && state !== 'rest' && state !== 'exam') break;
    count += 1;
    date = addDays(date, -1);
  }
  return count;
}
/** Longest run of study, rest or exam days from `from` to `today` (same rule as `streak`). */
export function bestStreak(stateOf, from, today) {
  let best = 0;
  let run = 0;
  for (let date = from; date <= today; date = addDays(date, 1)) {
    const state = stateOf(date);
    if (state === 'study' || state === 'rest' || state === 'exam') {
      run += 1;
      best = Math.max(best, run);
    } else if (date !== today) {
      // Today still counts as open until it ends, so it never breaks a run.
      run = 0;
    }
  }
  return best;
}
/**
 * Days in a row a routine habit was kept, counting back from today. Days it isn't scheduled on,
 * and today while it is still open, never break the run; a tick on an off day still counts.
 */
export function habitStreak({ scheduledOn, doneOn, today, since }) {
  let count = 0;
  for (let back = 0; back < 366; back += 1) {
    const date = addDays(today, -back);
    if (since && date < since) break;
    if (doneOn(date)) count += 1;
    else if (scheduledOn(date) && date !== today) break;
  }
  return count;
}
export function nextSchoolDay(today) {
  let date = addDays(today, 1);
  while (weekday(date) === 0) date = addDays(date, 1);
  return date;
}
/** Bag checklist from the timetable for that day plus homework to hand in. */
export function bagFor(date, homeworkDue) {
  const items = [];
  const seen = new Set();
  const add = (id, label) => {
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ id, label });
  };
  for (const period of TIMETABLE[weekday(date)] ?? []) {
    if (isSubjectPeriod(period)) {
      add(period, `${SUBJECTS[period].name} textbook and notebook`);
      if (period === 'maths') add('geo', 'Geometry box');
    } else {
      add(period, BAG_EXTRAS[period]);
    }
  }
  for (const homework of homeworkDue) add(`hw-${homework.id}`, `Hand in: ${homework.title}`);
  add('id', 'School ID card');
  add('water', 'Water bottle');
  return items;
}
export function periodsFor(date) {
  return [...(TIMETABLE[weekday(date)] ?? [])];
}
