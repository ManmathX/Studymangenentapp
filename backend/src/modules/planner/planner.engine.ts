import { addDays, diffDays, eachDay, weekday, type DateKey } from '../../common/utils/dates.js';
import { shortDate } from '../../common/utils/format.js';
import {
  BAG_EXTRAS,
  isSubjectPeriod,
  SUBJECTS,
  TIMETABLE,
  type PeriodId,
} from '../syllabus/syllabus.data.js';
import {
  PLANNING_HORIZON_DAYS,
  REVISION_INTERVALS,
  type ChapterStatus,
  type DayTask,
  type FixedBlock,
  type LoadTask,
  type PlannerChapter,
  type PlannerExam,
  type PlannerHomework,
  type PlannerProfile,
  type StudyStep,
  type SuggestedBlock,
} from './planner.types.js';

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
export function limitFor(profile: PlannerProfile, date: DateKey): number {
  let base = profile.dailyLimitMins || DEFAULT_LIMIT;
  if (profile.ageMode === 'simple') base = Math.min(base, SIMPLE_MODE_CAP);
  const day = weekday(date);
  if (day === 0) base += SUNDAY_BONUS;
  else if (profile.tuitionDays.includes(day)) base -= TUITION_PENALTY;
  if (profile.examSeason) base += EXAM_SEASON_BONUS;
  return base;
}

/** Running totals of planned minutes per day. Skipped tasks never count. */
export class DayLoad {
  private readonly accepted = new Map<DateKey, number>();
  private readonly suggested = new Map<DateKey, number>();

  constructor(tasks: Iterable<LoadTask> = []) {
    for (const task of tasks) this.add(task);
  }

  add(task: LoadTask): void {
    if (task.status === 'skipped') return;
    const bucket = task.status === 'accepted' ? this.accepted : this.suggested;
    bucket.set(task.date, (bucket.get(task.date) ?? 0) + task.mins);
  }

  planned(date: DateKey, includeSuggested = false): number {
    const accepted = this.accepted.get(date) ?? 0;
    return includeSuggested ? accepted + (this.suggested.get(date) ?? 0) : accepted;
  }

  room(profile: PlannerProfile, date: DateKey): number {
    return limitFor(profile, date) - this.planned(date, true);
  }

  isOverloaded(profile: PlannerProfile, date: DateKey): boolean {
    return this.planned(date) > limitFor(profile, date);
  }
}

/** Day with the most spare room that still fits `mins`, or null. */
export function bestDay(
  load: DayLoad,
  profile: PlannerProfile,
  mins: number,
  from: DateKey,
  to: DateKey,
  exclude?: DateKey,
): DateKey | null {
  let best: DateKey | null = null;
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
export function firstDay(
  load: DayLoad,
  profile: PlannerProfile,
  mins: number,
  from: DateKey,
  to: DateKey,
): DateKey | null {
  for (const date of eachDay(from, to)) if (load.room(profile, date) >= mins) return date;
  return null;
}

export function startDay(local: { date: DateKey; hour: number }): DateKey {
  return local.hour < EVENING_CUTOFF_HOUR ? local.date : addDays(local.date, 1);
}

/** Priority = urgency × grade weight × difficulty, rounded to one decimal. */
export function priority(daysLeft: number, weight: number, difficulty: number): number {
  return Math.round((10 / Math.max(1, daysLeft)) * (weight / 10) * difficulty * 10) / 10;
}

/* ---------- Day timeline ---------- */

export function fixedBlocks(profile: PlannerProfile, date: DateKey): { start: number; end: number; blocks: FixedBlock[] } {
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
  const schoolStart = profile.schoolStart;
  const schoolOut = day === 6 ? Math.min(profile.schoolEnd, schoolStart + 285) : profile.schoolEnd;
  const blocks: FixedBlock[] = [
    { start: schoolStart, end: schoolOut, label: day === 6 ? 'School (half day)' : 'School', kind: 'school' },
    { start: schoolOut, end: schoolOut + 75, label: 'Lunch and rest', kind: 'rest' },
  ];
  if (profile.tuitionDays.includes(day)) blocks.push({ start: 16 * 60, end: 17 * 60 + 30, label: 'Tuition', kind: 'tuition' });
  blocks.push({ start: 20 * 60, end: 20 * 60 + 45, label: 'Dinner with family', kind: 'rest' });
  return { start: schoolOut + 75, end: DAY_END, blocks };
}

/** Accepted tasks first in the order they were added, then suggestions by priority. */
export function sortDayTasks<T extends DayTask>(tasks: T[]): T[] {
  return tasks
    .filter((task) => task.status !== 'skipped')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'accepted' ? -1 : 1;
      return a.status === 'suggested' ? b.score - a.score : a.order - b.order;
    });
}

export type TimelineRow<T> =
  | ({ type: 'fixed' } & FixedBlock)
  | { type: 'task'; start: number; end: number; task: T };

/** Places tasks in the free time around school, tuition and meals, with short breaks between. */
export function layoutDay<T extends DayTask>(
  profile: PlannerProfile,
  date: DateKey,
  tasks: T[],
): { rows: TimelineRow<T>[]; overflow: T[] } {
  const { start, end, blocks } = fixedBlocks(profile, date);
  const rows: TimelineRow<T>[] = blocks.map((block) => ({ type: 'fixed' as const, ...block }));
  const overflow: T[] = [];
  let cursor = start;
  for (const task of sortDayTasks(tasks)) {
    let slotStart = cursor;
    let fits = false;
    for (let guard = 0; guard < 10; guard += 1) {
      const clash = blocks.find((block) => block.start < slotStart + task.mins && block.end > slotStart);
      if (clash) {
        slotStart = clash.end;
        continue;
      }
      fits = slotStart + task.mins <= end;
      break;
    }
    if (fits) {
      rows.push({ type: 'task', start: slotStart, end: slotStart + task.mins, task });
      cursor = slotStart + task.mins + BREAK_BETWEEN_TASKS;
    } else {
      overflow.push(task);
    }
  }
  rows.sort((a, b) => a.start - b.start);
  return { rows, overflow };
}

/* ---------- Chapters ---------- */

export function stepsFor(chapter: Pick<PlannerChapter, 'subject' | 'status'>): StudyStep[] {
  const exercises = chapter.subject === 'maths' || chapter.subject === 'science' ? 'NCERT exercises' : 'Textbook questions';
  const steps: Record<ChapterStatus, StudyStep[]> = {
    not: [
      { title: 'Learn: read and make notes', mins: 45, kind: 'revision' },
      { title: exercises, mins: 40, kind: 'practice' },
      { title: 'Practise extra questions', mins: 30, kind: 'practice' },
      { title: 'Revise from your notes', mins: 20, kind: 'revision' },
    ],
    learning: [
      { title: exercises, mins: 40, kind: 'practice' },
      { title: 'Practise extra questions', mins: 30, kind: 'practice' },
      { title: 'Revise from your notes', mins: 20, kind: 'revision' },
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
export function chapterDeadline<E extends PlannerExam>(
  chapterKey: string,
  exams: E[],
  today: DateKey,
): { exam: E | null; deadline: DateKey } {
  const exam = exams
    .filter((candidate) => candidate.date > today && candidate.chapterKeys.includes(chapterKey))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return exam ? { exam, deadline: addDays(exam.date, -1) } : { exam: null, deadline: addDays(today, PLANNING_HORIZON_DAYS) };
}

/** Proposes one day per step, in order, using days with free time before the deadline. */
export function proposeDays(
  load: DayLoad,
  profile: PlannerProfile,
  stepMinutes: number[],
  deadline: DateKey,
  today: DateKey,
  start: DateKey,
): DateKey[] {
  const horizonEnd = addDays(today, PLANNING_HORIZON_DAYS);
  const cap = deadline < horizonEnd ? deadline : horizonEnd;
  const reserved = new Map<DateKey, number>();
  const room = (date: DateKey) => load.room(profile, date) - (reserved.get(date) ?? 0);
  const days: DateKey[] = [];
  let from = start;
  for (const mins of stepMinutes) {
    let day: DateKey | null = null;
    for (const date of eachDay(from, cap)) if (room(date) >= mins) { day = date; break; }
    if (!day) for (const date of eachDay(start, cap)) if (room(date) >= mins) { day = date; break; }
    if (!day) day = from <= cap ? from : cap >= start ? cap : start;
    reserved.set(day, (reserved.get(day) ?? 0) + mins);
    days.push(day);
    from = addDays(day, 1);
  }
  return days;
}

/** Spaced-revision reminders due today (1, 7 and 30 days after learning). */
export function dueRevisionNudges<C extends PlannerChapter>(chapters: C[], today: DateKey): C[] {
  return chapters.filter((chapter) => {
    if (!chapter.learnedOn || chapter.revisions >= REVISION_INTERVALS.length) return false;
    if (chapter.snoozedUntil && chapter.snoozedUntil > today) return false;
    const interval = REVISION_INTERVALS[chapter.revisions] ?? Infinity;
    return diffDays(chapter.learnedOn, today) >= interval;
  });
}

export function coverage(chapters: Pick<PlannerChapter, 'status'>[]) {
  const counts: Record<ChapterStatus, number> = { not: 0, learning: 0, revised: 0, mastered: 0 };
  for (const chapter of chapters) counts[chapter.status] += 1;
  const total = chapters.length;
  const covered = counts.revised + counts.mastered;
  return { counts, total, covered, percent: total ? Math.round((covered / total) * 100) : 0 };
}

export function readiness(chapterKeys: string[], statusByKey: Map<string, ChapterStatus>) {
  const revised = chapterKeys.filter((key) => {
    const status = statusByKey.get(key);
    return status === 'revised' || status === 'mastered';
  }).length;
  return { revised, total: chapterKeys.length };
}

/* ---------- Auto-scheduling ---------- */

export interface SuggestionInput {
  profile: PlannerProfile;
  today: DateKey;
  start: DateKey;
  load: DayLoad;
  homework: PlannerHomework[];
  exams: PlannerExam[];
  chapters: PlannerChapter[];
  /** Homework ids that already have a live task. */
  plannedHomeworkIds: Set<string>;
  /** Live, future tasks per chapter: dates they are planned on. */
  plannedChapterDates: Map<string, DateKey[]>;
}

const EXAM_STEP: Record<Exclude<ChapterStatus, 'mastered'>, { mins: number; what: string }> = {
  not: { mins: 60, what: 'learn and make notes' },
  learning: { mins: 45, what: 'revise and practise' },
  revised: { mins: 30, what: 'final revision' },
};

/**
 * Fills free time before deadlines with suggested blocks, highest priority first.
 * Mutates `load` so each placement accounts for the previous ones.
 */
export function planSuggestions(input: SuggestionInput): SuggestedBlock[] {
  const { profile, today, start, load } = input;
  const candidates: Omit<SuggestedBlock, 'date'>[] = [];

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
  const bestByChapter = new Map<string, Omit<SuggestedBlock, 'date'>>();
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
        kind: 'revision' as const,
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

  const placed: SuggestedBlock[] = [];
  for (const candidate of candidates) {
    if (candidate.deadline < start) continue;
    const date = firstDay(load, profile, candidate.mins, start, candidate.deadline);
    if (!date) continue;
    load.add({ date, mins: candidate.mins, status: 'suggested' });
    placed.push({ ...candidate, date });
  }
  return placed;
}

/* ---------- Habits ---------- */

export type DayState = 'study' | 'rest' | 'exam' | 'missed' | null;

/** Consecutive days of study, rest or exams, counting back from today (or yesterday if today is empty). */
export function streak(stateOf: (date: DateKey) => DayState, today: DateKey): number {
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

export function nextSchoolDay(today: DateKey): DateKey {
  let date = addDays(today, 1);
  while (weekday(date) === 0) date = addDays(date, 1);
  return date;
}

export interface BagItem {
  id: string;
  label: string;
}

/** Bag checklist from the timetable for that day plus homework to hand in. */
export function bagFor(date: DateKey, homeworkDue: { id: string; title: string }[]): BagItem[] {
  const items: BagItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, label: string) => {
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

export function periodsFor(date: DateKey): PeriodId[] {
  return [...(TIMETABLE[weekday(date)] ?? [])];
}
