import { addDays, diffDays, eachDay, weekday } from './core/dates';
import { EARLIEST_SESSION, weeklyClash } from './core/dayFrame';
import { bagFor, homeworkSlotMins, MAX_HOMEWORK_MINS, nextSchoolDay, periodsFor, priority, splitHomework } from './core/engine';
import { ROUTINE_PARTS, routineOf } from './core/routine';
import { isSubjectPeriod, PERIOD_LABELS, SUBJECTS } from './core/syllabus';
import { clock } from './clock';
import { read, write } from './db';
import { badRequest, conflict, invalidField, notFound, unprocessable } from './errors';
import { copy, doneMinutesByDay, focusMinutesByDay, insertTasks, logFor, newId, openHomework, studentDay, subjectName, upsertLog } from './queries';
import { clearDailyPlanFor } from './study';
import { clock24, dateKey, intIn, list, oneOf, optionalText, text, timeMinutes, unique, WEEKDAY_NAMES } from './validate';

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

/** Minutes of school homework already planned on `date` (test-prep homework has its own slot). */
function homeworkMinsOn(draft, date) {
  return draft.tasks.filter((task) => task.date === date && task.kind === 'homework' && !task.examId && task.status !== 'skipped').reduce((sum, task) => sum + task.mins, 0);
}

/**
 * Saves homework and plans it before it is due: on the day before when it fits that day's Homework
 * slot, otherwise split into parts over the days before, filling the latest free slots first.
 */
export function createHomework(input) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    if (!profile.subjects.includes(input.subject)) throw badRequest('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    const title = text(input.title, 'title', { max: 140, required: 'Write what the homework is' });
    const note = optionalText(input.note, 'note', 500);
    const due = dateKey(input.due, 'due');
    if (due < today) throw badRequest('Pick a due date from today onwards', 'DUE_IN_PAST');
    const mins = intIn(input.mins, 5, MAX_HOMEWORK_MINS, 'mins');
    const difficulty = intIn(input.difficulty, 1, 3, 'difficulty');
    const last = due > today ? addDays(due, -1) : today;
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
    // Days of a half-yearly or final have no Homework slot, so homework avoids them when it can.
    const parts = splitHomework(mins, [...eachDay(today, last)], (date) => homeworkSlotMins(profile, date, draft.exams) - homeworkMinsOn(draft, date));
    const score = priority(Math.max(1, diffDays(today, due)), HOMEWORK_WEIGHT, difficulty);
    const tasks = insertTasks(
      draft,
      parts.map((part, index) => ({
        date: part.date,
        subject: input.subject,
        title: parts.length > 1 ? `${title} (part ${index + 1} of ${parts.length})` : title,
        kind: 'homework',
        mins: part.mins,
        homeworkId: homework.id,
        deadline: last,
        source: 'me',
        status: 'accepted',
        score,
      })),
    );
    return { homework: copy(homework), task: copy(tasks[0]), tasks: tasks.map(copy) };
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

/* ---------- Focus, rest days, check-in ---------- */

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
    clearDailyPlanFor(draft, today, { rest: true });
    return logDto(upsertLog(draft, today, { rest: true }));
  });
}

/** How far ahead a rest day can be planned. */
const REST_PLAN_DAYS = 60;

/**
 * Plans a rest day on the calendar (or takes it back). At most two a week (Monday to Sunday),
 * and today only before any study. A rest day keeps its night revision but no self study or
 * daily revision; taking it back plans the day afresh.
 */
export function setRestDay(date, rest) {
  return write((draft) => {
    const { today } = studentDay(draft);
    dateKey(date, 'date');
    if (date < today) throw badRequest('Pick today or a later day', 'DATE_IN_PAST');
    if (date > addDays(today, REST_PLAN_DAYS)) throw badRequest('Pick a day in the next two months', 'DATE_OUT_OF_RANGE');
    const resting = Boolean(logFor(draft, date)?.rest);
    if (rest) {
      if (resting) throw conflict('That day is already a rest day', 'ALREADY_RESTING');
      if (date === today) {
        const studied = (doneMinutesByDay(draft, today, today).get(today) ?? 0) + (focusMinutesByDay(draft, today, today).get(today) ?? 0);
        if (studied > 0) throw conflict('You already studied today, so it counts as a study day', 'ALREADY_STUDIED');
      }
      const monday = addDays(date, -((weekday(date) + 6) % 7));
      const sunday = addDays(monday, 6);
      const inWeek = Object.values(draft.dailyLogs).filter((log) => log.rest && log.date >= monday && log.date <= sunday).length;
      if (inWeek >= MAX_REST_DAYS_PER_WEEK) throw conflict('That week already has two rest days', 'REST_LIMIT_REACHED');
    } else if (!resting) {
      throw conflict('That day is not a rest day', 'NOT_RESTING');
    }
    clearDailyPlanFor(draft, date, { rest });
    return logDto(upsertLog(draft, date, { rest }));
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

/* ---------- Routines ---------- */

export { habitDoneOn, ROUTINE_PARTS, routineOf } from './core/routine';
export const MAX_ROUTINE_HABITS = 24;
const HABIT_NAME_MAX = 40;
const DEFAULT_HABIT_ICON = 'star';

/** The routine as stored on the profile, copied out of the defaults on the first change. */
function editableRoutine(profile) {
  if (!Array.isArray(profile.routine)) profile.routine = routineOf(profile).map((habit) => ({ ...habit, days: [...habit.days] }));
  return profile.routine;
}

function requireHabit(routine, id) {
  const habit = routine.find((item) => item.id === id);
  if (!habit) throw notFound('That habit isn’t in your routine', 'HABIT_NOT_FOUND');
  return habit;
}

/** Timed habits: from 04:30, finished by 23:30, 5 minutes to 3 hours long. */
const HABIT_LATEST_END = 23 * 60 + 30;
const HABIT_MAX_MINS = 180;

/**
 * A habit's set time, if it has one: `at` ("HH:MM", or null to clear it) and `mins`. A timed
 * habit is a fixed block on the plan, so study is planned around it.
 */
function habitTime(input, current) {
  if (input.at === undefined && input.mins === undefined) return current ? {} : { at: null, mins: null };
  const at = input.at === undefined ? (current?.at ?? null) : input.at === null ? null : timeMinutes(input.at, 'at');
  // Without a set time a habit can still have a length; the plan puts it in its part of the day.
  if (at === null) {
    const length = input.mins === undefined ? (current?.mins ?? null) : input.mins;
    return { at: null, mins: length === null ? null : intIn(length, 5, HABIT_MAX_MINS, 'mins') };
  }
  const mins = intIn(input.mins === undefined ? current?.mins : input.mins, 5, HABIT_MAX_MINS, 'mins');
  if (at < EARLIEST_SESSION) throw invalidField('at', `Start habits at ${clock24(EARLIEST_SESSION)} or later`);
  if (at + mins > HABIT_LATEST_END) throw invalidField('mins', `Finish the habit by ${clock24(HABIT_LATEST_END)}`);
  return { at, mins };
}

function habitFields(input, routine, current, profile) {
  const fields = {};
  if (!current || input.name !== undefined) {
    fields.name = text(input.name, 'name', { max: HABIT_NAME_MAX, required: 'Name the habit' });
    const taken = routine.some((item) => item !== current && item.name.toLowerCase() === fields.name.toLowerCase());
    if (taken) throw conflict(`${fields.name} is already in your routine`, 'HABIT_EXISTS');
  }
  if (!current || input.part !== undefined) fields.part = oneOf(input.part, ROUTINE_PARTS, 'part');
  if (!current || input.days !== undefined) {
    const days = list(input.days, 'days', { min: 1, max: 7, message: 'Pick at least one day' });
    fields.days = unique(days.map((day) => intIn(day, 0, 6, 'days'))).sort((a, b) => a - b);
  }
  if (input.icon !== undefined || !current) {
    // Icons are names from the app's habit icon set; anything else falls back to a star.
    fields.icon = typeof input.icon === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(input.icon) ? input.icon : DEFAULT_HABIT_ICON;
  }
  Object.assign(fields, habitTime(input, current));
  const at = fields.at === undefined ? current?.at : fields.at;
  if (Number.isInteger(at)) {
    const mins = fields.mins ?? current.mins;
    const days = fields.days ?? current.days;
    const name = fields.name ?? current.name;
    const clash = weeklyClash(profile, { days, start: at, end: at + mins }, { skipHabitId: current?.id ?? null });
    if (clash) throw invalidField('at', `${name} on ${WEEKDAY_NAMES[clash.day]} clashes with ${clash.label} (${clock24(clash.start)} to ${clock24(clash.end)})`);
  }
  return fields;
}

/**
 * Adds a habit (a study step, swimming, dance class, gym…) at the end of its time of day.
 * With `at` ("HH:MM") and `mins` it also gets a set time and blocks that time on the plan.
 */
export function addRoutineHabit(input = {}) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const routine = editableRoutine(profile);
    if (routine.length >= MAX_ROUTINE_HABITS) throw conflict(`A routine holds up to ${MAX_ROUTINE_HABITS} habits`, 'ROUTINE_FULL');
    const habit = { id: newId(draft), ...habitFields(input, routine, null, profile), createdOn: today };
    routine.push(habit);
    return copy(habit);
  });
}

/** Renames a habit, or changes its time of day or days. A habit moved to another time of day goes last there. */
export function updateRoutineHabit(id, input = {}) {
  return write((draft) => {
    const { profile } = studentDay(draft);
    const routine = editableRoutine(profile);
    const habit = requireHabit(routine, id);
    const fields = habitFields(input, routine, habit, profile);
    const moved = fields.part && fields.part !== habit.part;
    Object.assign(habit, fields);
    if (moved) {
      routine.splice(routine.indexOf(habit), 1);
      routine.push(habit);
    }
    return copy(habit);
  });
}

/** Removes a habit. Days already ticked stay in the history but no longer count. */
export function removeRoutineHabit(id) {
  write((draft) => {
    const { profile } = studentDay(draft);
    const routine = editableRoutine(profile);
    routine.splice(routine.indexOf(requireHabit(routine, id)), 1);
  });
  return null;
}

/** Moves a habit one place up (-1) or down (1) within its time of day. */
export function moveRoutineHabit(id, direction) {
  return write((draft) => {
    const { profile } = studentDay(draft);
    const routine = editableRoutine(profile);
    const habit = requireHabit(routine, id);
    oneOf(direction, [-1, 1], 'direction');
    const index = routine.indexOf(habit);
    let other = index + direction;
    while (other >= 0 && other < routine.length && routine[other].part !== habit.part) other += direction;
    if (other < 0 || other >= routine.length) return copy(routineOf(profile));
    [routine[index], routine[other]] = [routine[other], routine[index]];
    return copy(routine);
  });
}

/** Ticks (or unticks) a habit for today. */
export function setHabitDone(id, done) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    requireHabit(routineOf(profile), id);
    upsertLog(draft, today, { ticks: { [id]: Boolean(done) } });
    return { id, date: today, done: Boolean(done) };
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
  const own = data.profile.periods?.[weekday(day)];
  // The student's own class timetable when they have set one; the built-in one otherwise.
  const items = (own ? ownBag(data.profile, own, dueThatDay) : bagFor(day, dueThatDay)).map((item) => ({ ...item, checked: Boolean(checked[item.id]) }));
  return {
    date: day,
    periods: own
      ? own.map((subject, index) => ({ number: index + 1, id: subject, label: subjectName(data.profile, subject) }))
      : periodsFor(day).map((period, index) => ({
          number: index + 1,
          id: period,
          label: isSubjectPeriod(period) ? SUBJECTS[period].name : PERIOD_LABELS[period],
        })),
    items,
    packed: items.filter((item) => item.checked).length,
  };
}

/** The bag for the student's own timetable: a textbook and notebook per subject, homework to hand in, ID card, water. */
function ownBag(profile, periods, homeworkDue) {
  const items = [];
  for (const subject of [...new Set(periods)]) {
    items.push({ id: subject, label: `${subjectName(profile, subject)} textbook and notebook` });
    if (subject === 'maths') items.push({ id: 'geo', label: 'Geometry box' });
  }
  for (const homework of homeworkDue) items.push({ id: `hw-${homework.id}`, label: `Hand in: ${homework.title}` });
  items.push({ id: 'id', label: 'School ID card' }, { id: 'water', label: 'Water bottle' });
  return items;
}

/**
 * In short, what goes in the bag for a day, for the evening reminder: the day's subjects (from
 * the student's own timetable, or the built-in one) and the homework to hand in.
 */
export function bagSummary(data, day) {
  const own = data.profile.periods?.[weekday(day)];
  const subjects = own
    ? [...new Set(own)].map((subject) => subjectName(data.profile, subject))
    : [...new Set(periodsFor(day).filter(isSubjectPeriod))].map((period) => SUBJECTS[period].name);
  const handIn = data.homework.filter((item) => item.due === day && !item.done).map((item) => item.title);
  return { subjects, handIn };
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
