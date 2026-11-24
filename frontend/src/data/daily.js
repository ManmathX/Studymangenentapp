import { addDays, diffDays } from './core/dates';
import { bagFor, nextSchoolDay, periodsFor, priority } from './core/engine';
import { isSubjectPeriod, PERIOD_LABELS, SUBJECTS } from './core/syllabus';
import { clock } from './clock';
import { read, write } from './db';
import { badRequest, conflict, invalidField, notFound, unprocessable } from './errors';
import { copy, doneMinutesByDay, focusMinutesByDay, insertTasks, logFor, newId, openHomework, studentDay, upsertLog } from './queries';
import { dateKey, intIn, list, oneOf, optionalText, text } from './validate';

export const MAX_REST_DAYS_PER_WEEK = 2;
/** Sanity bound so streaks and study hours can't be inflated by bogus sessions. */
export const MAX_FOCUS_MINUTES_PER_DAY = 720;
export const SCREEN_TIME_OPTIONS = ['Under 1 h', '1 to 2 h', '2 to 3 h', 'Over 3 h'];
const BAG_DAYS_AHEAD = 7;
const HOMEWORK_WEIGHT = 5;

const logDto = (log) => copy({ date: log.date, rest: log.rest, checkin: log.checkin, routines: log.routines, bag: log.bag });

/* ---------- Homework ---------- */

/** Open homework (by due date) or done homework (newest first), one page at a time. */
export function pageHomework(status = 'open', page = 1, limit = 20) {
  const data = read();
  const done = status === 'done';
  const items = done
    ? data.homework.filter((item) => item.done).sort((a, b) => ((a.doneOn ?? '') < (b.doneOn ?? '') ? 1 : -1))
    : openHomework(data);
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit).map(copy),
    meta: { page, limit, total: items.length, hasNext: page * limit < items.length },
  };
}

export function homeworkSummary() {
  const data = read();
  const { today } = studentDay(data);
  const open = openHomework(data);
  const weekEnd = addDays(today, 7);
  const weekStart = addDays(today, -6);
  return {
    today,
    dueThisWeek: open.filter((item) => item.due <= weekEnd).length,
    overdue: open.filter((item) => item.due < today).length,
    doneThisWeek: data.homework.filter((item) => item.done && item.doneOn && item.doneOn >= weekStart).length,
  };
}

/** Saves homework and plans a task for the day before it is due. */
export function createHomework(input) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    if (!profile.subjects.includes(input.subject)) throw badRequest('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    const title = text(input.title, 'title', { max: 140, required: 'Write what the homework is' });
    const note = optionalText(input.note, 'note', 500);
    const due = dateKey(input.due, 'due');
    if (due < today) throw badRequest('Pick a due date from today onwards', 'DUE_IN_PAST');
    const mins = intIn(input.mins, 5, 240, 'mins');
    const difficulty = intIn(input.difficulty, 1, 3, 'difficulty');
    const day = due > today ? addDays(due, -1) : today;
    const homework = {
      id: newId(draft),
      subject: input.subject,
      title,
      note,
      teacher: 'Teacher’s note',
      due,
      mins,
      difficulty,
      weight: HOMEWORK_WEIGHT,
      done: false,
      doneOn: null,
    };
    draft.homework.push(homework);
    const [task] = insertTasks(draft, [
      {
        date: day,
        subject: input.subject,
        title,
        kind: 'homework',
        mins,
        homeworkId: homework.id,
        deadline: day,
        source: 'me',
        status: 'accepted',
        score: priority(Math.max(1, diffDays(today, due)), HOMEWORK_WEIGHT, difficulty),
      },
    ]);
    return { homework: copy(homework), task: copy(task) };
  });
}

/** Marks homework done (or pending again). Done homework drops its unaccepted suggestions. */
export function setHomeworkDone(id, done) {
  return write((draft) => {
    const { today } = studentDay(draft);
    const item = draft.homework.find((entry) => entry.id === id);
    if (!item) throw notFound('Homework not found', 'HOMEWORK_NOT_FOUND');
    item.done = Boolean(done);
    item.doneOn = done ? today : null;
    if (done) {
      for (const task of draft.tasks) {
        if (task.homeworkId === id && task.status === 'suggested' && !task.done && task.date >= today) task.status = 'skipped';
      }
    }
    return copy(item);
  });
}

/** Deletes homework and its unfinished tasks; minutes already studied stay in the history. */
export function removeHomework(id) {
  write((draft) => {
    const index = draft.homework.findIndex((entry) => entry.id === id);
    if (index < 0) throw notFound('Homework not found', 'HOMEWORK_NOT_FOUND');
    draft.homework.splice(index, 1);
    draft.tasks = draft.tasks.filter((task) => task.homeworkId !== id || task.done);
    for (const task of draft.tasks) if (task.homeworkId === id) task.homeworkId = null;
  });
  return null;
}

/* ---------- Focus, rest days, check-in, routines ---------- */

export function logFocus(subject, mins) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    if (!profile.subjects.includes(subject)) throw badRequest('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    intIn(mins, 1, 240, 'mins');
    const loggedToday = focusMinutesByDay(draft, today, today).get(today) ?? 0;
    if (loggedToday + mins > MAX_FOCUS_MINUTES_PER_DAY) {
      throw unprocessable(`Focus time is capped at ${MAX_FOCUS_MINUTES_PER_DAY / 60} hours a day`, 'FOCUS_LIMIT_REACHED');
    }
    const session = { id: newId(draft), date: today, subject, mins, createdAt: clock.now().toISOString() };
    draft.focusSessions.push(session);
    return { id: session.id, date: session.date, subject, mins };
  });
}

/** Rest days keep the streak alive, at most two a week and only before any study that day. */
export function takeRestDay() {
  return write((draft) => {
    const { today } = studentDay(draft);
    const studied = (doneMinutesByDay(draft, today, today).get(today) ?? 0) + (focusMinutesByDay(draft, today, today).get(today) ?? 0);
    if (studied > 0) throw conflict('You already studied today, so it counts as a study day', 'ALREADY_STUDIED');
    if (logFor(draft, today)?.rest) throw conflict('Today is already a rest day', 'ALREADY_RESTING');
    const weekStart = addDays(today, -6);
    const restThisWeek = Object.values(draft.dailyLogs).filter((log) => log.rest && log.date >= weekStart && log.date <= today).length;
    if (restThisWeek >= MAX_REST_DAYS_PER_WEEK) throw conflict('You have used both rest days this week', 'REST_LIMIT_REACHED');
    return logDto(upsertLog(draft, today, { rest: true }));
  });
}

export function saveCheckin(input) {
  return write((draft) => {
    const { today } = studentDay(draft);
    if (typeof input.sleep !== 'number' || input.sleep < 3 || input.sleep > 12 || (input.sleep * 2) % 1 !== 0) {
      throw invalidField('sleep', 'Sleep is between 3 and 12 hours, in half hours');
    }
    const checkin = {
      sleep: input.sleep,
      breaks: intIn(input.breaks, 0, 12, 'breaks'),
      screen: oneOf(input.screen, SCREEN_TIME_OPTIONS, 'screen'),
      saved: true,
    };
    return logDto(upsertLog(draft, today, { checkin }));
  });
}

export function saveRoutines(input) {
  const ticks = (value, field) => list(value, field, { min: 3, max: 3, message: 'Send three ticks' }).map(Boolean);
  return write((draft) => {
    const { today } = studentDay(draft);
    return logDto(upsertLog(draft, today, { routines: { morning: ticks(input.morning, 'morning'), evening: ticks(input.evening, 'evening') } }));
  });
}

/* ---------- School bag ---------- */

function bagIn(data, date) {
  const { today } = studentDay(data);
  const day = date ?? nextSchoolDay(today);
  dateKey(day, 'date');
  if (day < today || day > addDays(today, BAG_DAYS_AHEAD)) throw badRequest('Pick a day in the coming week', 'DATE_OUT_OF_RANGE');
  const dueThatDay = data.homework.filter((item) => item.due === day && !item.done);
  const checked = logFor(data, day)?.bag ?? {};
  const items = bagFor(day, dueThatDay).map((item) => ({ ...item, checked: Boolean(checked[item.id]) }));
  return {
    date: day,
    periods: periodsFor(day).map((period, index) => ({
      number: index + 1,
      id: period,
      label: isSubjectPeriod(period) ? SUBJECTS[period].name : PERIOD_LABELS[period],
    })),
    items,
    packed: items.filter((item) => item.checked).length,
  };
}

/** Packing list for a school day (default: the next one) from the timetable and homework due. */
export function bag(date) {
  return bagIn(read(), date);
}

export function setBagItem(date, itemId, checked) {
  write((draft) => {
    if (!bagIn(draft, date).items.some((item) => item.id === itemId)) {
      throw badRequest('That item is not on this day’s list', 'UNKNOWN_BAG_ITEM');
    }
    upsertLog(draft, date, { bag: { [itemId]: Boolean(checked) } });
  });
  return bag(date);
}
