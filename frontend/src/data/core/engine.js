// Originally ported from the retired backend's planner.engine.ts. This copy is now the source of truth.
import { addDays, diffDays, eachDay, weekday } from './dates';
import { shortDate } from './shortDate';
import { BAG_EXTRAS, isSubjectPeriod, SUBJECTS, TIMETABLE } from './syllabus';
import { EXAM_PREP_DAYS, PLANNING_HORIZON_DAYS, REVISION_INTERVALS } from './types';
const DEFAULT_LIMIT = 180;
const SIMPLE_MODE_CAP = 120;
const SUNDAY_BONUS = 90;
const TUITION_PENALTY = 30;
const EXAM_SEASON_BONUS = 45;
const DAY_END = 22 * 60;
const BREAK_BETWEEN_TASKS = 10;
/** After this local hour, new work is planned from tomorrow. */
const EVENING_CUTOFF_HOUR = 19;
/* ---------- Daily limits and load ---------- */
/** Most minutes of study the student wants on a given day. */
export function limitFor(profile, date) {
  let base = profile.dailyLimitMins || DEFAULT_LIMIT;
  if (profile.ageMode === 'simple') base = Math.min(base, SIMPLE_MODE_CAP);
  const day = weekday(date);
  if (day === 0) base += SUNDAY_BONUS;
  else if (tuitionsOn(profile, day).length) base -= TUITION_PENALTY;
  if (profile.examSeason) base += EXAM_SEASON_BONUS;
  return base;
}
/** Running totals of planned minutes per day. Skipped tasks never count. */
export class DayLoad {
  accepted = new Map();
  suggested = new Map();
  constructor(tasks = []) {
    for (const task of tasks) this.add(task);
  }
  add(task) {
    if (task.status === 'skipped') return;
    const bucket = task.status === 'accepted' ? this.accepted : this.suggested;
    bucket.set(task.date, (bucket.get(task.date) ?? 0) + task.mins);
  }
  planned(date, includeSuggested = false) {
    const accepted = this.accepted.get(date) ?? 0;
    return includeSuggested ? accepted + (this.suggested.get(date) ?? 0) : accepted;
  }
  room(profile, date) {
    return limitFor(profile, date) - this.planned(date, true);
  }
  isOverloaded(profile, date) {
    return this.planned(date) > limitFor(profile, date);
  }
}
/** Day with the most spare room that still fits `mins`, or null. */
export function bestDay(load, profile, mins, from, to, exclude) {
  let best = null;
  let spare = -1;
  for (const date of eachDay(from, to)) {
    if (date === exclude) continue;
    const room = load.room(profile, date);
    if (room >= mins && room > spare) {
      best = date;
      spare = room;
    }
  }
  return best;
}
/** Earliest day that still fits `mins`, or null. */
export function firstDay(load, profile, mins, from, to) {
  for (const date of eachDay(from, to)) if (load.room(profile, date) >= mins) return date;
  return null;
}
export function startDay(local) {
  return local.hour < EVENING_CUTOFF_HOUR ? local.date : addDays(local.date, 1);
}
/** Priority = urgency × grade weight × difficulty, rounded to one decimal. */
export function priority(daysLeft, weight, difficulty) {
  return Math.round((10 / Math.max(1, daysLeft)) * (weight / 10) * difficulty * 10) / 10;
}
/* ---------- Day timeline ---------- */
/** Plans saved before tuition times were editable had one tuition, 16:00 to 17:30. */
export const DEFAULT_TUITION_START = 16 * 60;
export const DEFAULT_TUITION_END = 17 * 60 + 30;
/** Earliest and latest a tuition class can be (morning tuition before school is common). */
export const TUITION_EARLIEST = 5 * 60;
export const TUITION_LATEST = DAY_END;
export const MAX_TUITIONS = 6;

/**
 * The student's tuitions: `{ name, days (1 = Monday … 6 = Saturday), start, end }`, times in
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

export const tuitionLabel = (tuition) => tuition.name || 'Tuition';

/** School hours on a weekday (1 = Monday … 6 = Saturday). Saturday is a half day. */
export function schoolHours(profile, day) {
  const start = profile.schoolStart;
  return { start, end: day === 6 ? Math.min(profile.schoolEnd, start + 285) : profile.schoolEnd };
}

export function fixedBlocks(profile, date) {
  const day = weekday(date);
  if (day === 0) {
    return {
      start: 9 * 60,
      end: DAY_END,
      blocks: [
        { start: 13 * 60, end: 15 * 60, label: 'Lunch and rest', kind: 'rest' },
        { start: 20 * 60, end: 20 * 60 + 45, label: 'Dinner with family', kind: 'rest' },
      ],
    };
  }
  const school = schoolHours(profile, day);
  const blocks = [
    {
      start: school.start,
      end: school.end,
      label: day === 6 ? 'School (half day)' : 'School',
      kind: 'school',
    },
    { start: school.end, end: school.end + 75, label: 'Lunch and rest', kind: 'rest' },
  ];
  for (const tuition of tuitionsOn(profile, day)) {
    blocks.push({ start: tuition.start, end: tuition.end, label: tuitionLabel(tuition), kind: 'tuition' });
  }
  blocks.push({ start: 20 * 60, end: 20 * 60 + 45, label: 'Dinner with family', kind: 'rest' });
  return { start: school.end + 75, end: DAY_END, blocks };
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
/** Places tasks in the free time around school, tuition and meals, with short breaks between. */
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

/** Minutes of the day's Homework slot: the student's choice, leaving at least 30 minutes for study. */
export function homeworkSlotMins(profile, date) {
  return Math.max(15, Math.min(profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS, limitFor(profile, date) - MIN_SELF_STUDY_MINS));
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
 * Every day has a Homework slot (after school and lunch) and a study slot (the next free
 * stretch after it). Together they fill the day's study limit: homework takes the student's
 * chosen length and the study slot the rest, never less than 30 minutes.
 * In the two weeks before a test, the study slot becomes that test's Test prep slot.
 */
export function routineSlots(profile, date, exams = []) {
  const { start, end, blocks } = fixedBlocks(profile, date);
  const homeworkMins = homeworkSlotMins(profile, date);
  const studyMins = Math.max(MIN_SELF_STUDY_MINS, limitFor(profile, date) - homeworkMins);
  const homework = fitWindow(blocks, start, end, homeworkMins);
  const study = fitWindow(homework ? [...blocks, homework] : blocks, homework ? homework.end : start, end, studyMins);
  const slots = [];
  if (homework) slots.push({ kind: 'homework', label: 'Homework', ...homework });
  if (study) {
    const upcoming = prepExamsOn(exams, date);
    if (upcoming.length) {
      // Papers of one half-yearly or final are shown under the exam's name.
      const names = [...new Set(upcoming.map((exam) => exam.seriesName ?? exam.name))];
      slots.push({
        kind: 'exam',
        label: 'Test prep',
        detail: `${names[0]}${names.length > 1 ? ` and ${names.length - 1} more` : ''}`,
        exams: upcoming.map(({ id, name, date: examDate }) => ({ id, name, date: examDate })),
        ...study,
      });
    } else {
      slots.push({ kind: 'study', label: 'Self study', ...study });
    }
  }
  return slots;
}

/**
 * Which of the day's slots a task goes in. Work for a test goes in the Test prep slot; school
 * homework in the Homework slot; any other study in the study slot (Test prep or Self study).
 */
export function slotKindFor(task, slots = []) {
  const hasExamSlot = slots.some((slot) => slot.kind === 'exam');
  if (task.examId && hasExamSlot) return 'exam';
  if (task.kind === 'homework' && !task.examId) return 'homework';
  return hasExamSlot ? 'exam' : 'study';
}

const ROW_ORDER = { fixed: 0, slot: 1, task: 2 };

/**
 * Lays out a day: fixed blocks (school, meals, tuition), the two daily slots, and each task
 * placed from the start of its slot, never overlapping a fixed block or another task.
 * Tasks that don't fit before 22:00 are returned as overflow.
 */
export function layoutDay(profile, date, tasks, exams = []) {
  const { start, end, blocks } = fixedBlocks(profile, date);
  const slots = routineSlots(profile, date, exams);
  const rows = [...blocks.map((block) => ({ type: 'fixed', ...block })), ...slots.map((slot) => ({ type: 'slot', ...slot }))];
  const overflow = [];
  const occupied = [...blocks];
  const cursor = Object.fromEntries(slots.map((slot) => [slot.kind, slot.start]));
  for (const task of sortDayTasks(tasks)) {
    const group = slotKindFor(task, slots);
    let slotStart = cursor[group] ?? start;
    let fits = false;
    for (let guard = 0; guard < 200; guard += 1) {
      const clash = occupied.find((block) => block.start < slotStart + task.mins && block.end > slotStart);
      if (clash) {
        slotStart = clash.end;
        continue;
      }
      fits = slotStart + task.mins <= end;
      break;
    }
    if (fits) {
      rows.push({ type: 'task', start: slotStart, end: slotStart + task.mins, task });
      occupied.push({ start: slotStart, end: slotStart + task.mins });
      cursor[group] = slotStart + task.mins + BREAK_BETWEEN_TASKS;
    } else {
      overflow.push(task);
    }
  }
  rows.sort((a, b) => a.start - b.start || ROW_ORDER[a.type] - ROW_ORDER[b.type]);
  return { rows, overflow, slots };
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
    const date = firstDay(load, profile, candidate.mins, start, candidate.deadline);
    if (!date) continue;
    load.add({ date, mins: candidate.mins, status: 'suggested' });
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
