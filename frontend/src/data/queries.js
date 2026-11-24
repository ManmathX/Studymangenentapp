import { localNow } from './core/dates';
import { startDay } from './core/engine';
import { clock } from './clock';
import { nextSeq } from './db';
import { notFound } from './errors';

/* ---------- The student's day ---------- */

/** Today and the first day new work may be planned on (tomorrow after 19:00), on the device clock. */
export function localToday() {
  const local = localNow(clock.now(), clock.timeZone());
  return { today: local.date, start: startDay(local) };
}

/** The profile plus today's date. Every planner screen needs setup to be finished first. */
export function studentDay(data) {
  if (!data.profile) throw notFound('Finish setting up your planner first', 'ONBOARDING_REQUIRED');
  return { profile: data.profile, ...localToday() };
}

/* ---------- Ids ---------- */

/** Unique, sortable id: creation time plus a sequence number and some randomness. */
export function newId(draft) {
  const time = Date.now().toString(36);
  const seq = nextSeq(draft).toString(36);
  const random = Math.floor(Math.random() * 36 ** 4).toString(36);
  return `${time}-${seq}-${random}`;
}

/* ---------- Tasks ---------- */

const byDateThenOrder = (a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1);

export function tasksInRange(data, from, to) {
  return data.tasks.filter((task) => task.date >= from && task.date <= to).sort(byDateThenOrder);
}

/** Tasks from `from` on that are not skipped. */
export function liveTasksFrom(data, from) {
  return data.tasks.filter((task) => task.date >= from && task.status !== 'skipped').sort(byDateThenOrder);
}

/** Accepted, unfinished tasks dated in [from, before). */
export function slippedTasks(data, from, before) {
  return data.tasks
    .filter((task) => task.status === 'accepted' && !task.done && task.date >= from && task.date < before)
    .sort(byDateThenOrder)
    .slice(0, 100);
}

export function liveHomeworkIds(data) {
  return new Set(data.tasks.filter((task) => task.homeworkId && task.status !== 'skipped').map((task) => task.homeworkId));
}

export function requireTask(data, id) {
  const task = data.tasks.find((item) => item.id === id);
  if (!task) throw notFound('Task not found', 'TASK_NOT_FOUND');
  return task;
}

/** Adds tasks in order, filling defaults. Returns the stored tasks. */
export function insertTasks(draft, tasks) {
  return tasks.map((task) => {
    const stored = {
      done: false,
      why: '',
      chapterKey: null,
      homeworkId: null,
      examId: null,
      ...task,
      id: newId(draft),
      order: nextSeq(draft),
    };
    draft.tasks.push(stored);
    return stored;
  });
}

export function sumMinutesByDay(items, from, to) {
  const totals = new Map();
  for (const item of items) {
    if (item.date < from || item.date > to) continue;
    totals.set(item.date, (totals.get(item.date) ?? 0) + item.mins);
  }
  return totals;
}

export function doneMinutesByDay(data, from, to) {
  return sumMinutesByDay(
    data.tasks.filter((task) => task.done && task.status !== 'skipped'),
    from,
    to,
  );
}

export function focusMinutesByDay(data, from, to) {
  return sumMinutesByDay(data.focusSessions, from, to);
}

/* ---------- Tests, homework, chapters ---------- */

export function examsFrom(data, fromDate) {
  return data.exams.filter((exam) => !fromDate || exam.date >= fromDate).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function openHomework(data) {
  return data.homework.filter((item) => !item.done).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

export function requireChapter(data, key) {
  const chapter = data.chapters.find((item) => item.key === key);
  if (!chapter) throw notFound('Chapter not found', 'CHAPTER_NOT_FOUND');
  return chapter;
}

/* ---------- Daily logs ---------- */

export function logFor(data, date) {
  return data.dailyLogs[date] ?? null;
}

/** Creates the day's log if needed and applies the patch (bag ticks are merged item by item). */
export function upsertLog(draft, date, patch) {
  const log = draft.dailyLogs[date] ?? { date, rest: false, checkin: null, routines: null, bag: {} };
  if (patch.rest !== undefined) log.rest = patch.rest;
  if (patch.checkin) log.checkin = patch.checkin;
  if (patch.routines) log.routines = patch.routines;
  if (patch.bag) log.bag = { ...log.bag, ...patch.bag };
  draft.dailyLogs[date] = log;
  return log;
}

/** A copy safe to hand to screens. */
export const copy = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
