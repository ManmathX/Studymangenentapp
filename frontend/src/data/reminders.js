import { addDays, diffDays, eachDay, instantAt, weekday } from './core/dates';
import { dayFrame, mealsOf, studyEndOf, wakeOf } from './core/dayFrame';
import { layoutDay } from './core/engine';
import { remindersOf } from './core/reminderSettings';
import { clock } from './clock';
import { read } from './db';
import { bagSummary, habitDoneOn } from './daily';
import { loadActivity } from './dashboards';
import { logFor, slippedTasks, studentDay, subjectName, tasksInRange } from './queries';
import { clockTime, duration } from '../utils/format';

/**
 * The reminders this phone should show, worked out from the plan. Nothing here talks to the
 * server: the app sets these as local notifications and sets them again after every change
 * and whenever it opens, so they always match the plan the student sees.
 *
 * Rules every reminder follows:
 * - It comes from the student's own plan (their slots, tests, homework, habits, bag).
 * - Nothing arrives while they sleep: only between wake-up and sleep time.
 * - Each kind can be turned off in Profile (`remindersOf`).
 */

/** Days ahead reminders are set for, today included. Opening the app sets the next days. */
export const REMINDER_DAYS = 4;
/** iOS keeps at most 64 waiting notifications per app; the focus timer needs one and the rest is spare. */
export const MAX_REMINDERS = 48;
/** The evening before a test or a homework due date. */
const EVENING_BEFORE_AT = 18 * 60;
/** Days after a test (after the last paper, for a half-yearly or final) when marks usually come back. */
const MARKS_AFTER_DAYS = 3;
const MARKS_AT = 18 * 60 + 30;
/** The streak nudge comes two hours before sleep, in time for one task before night revision. */
const STREAK_NUDGE_BEFORE_SLEEP = 120;
/** The morning plan comes a quarter of an hour after waking up. */
const MORNING_AFTER_WAKE = 15;
/** The weekly review is on Sunday evening. */
const WEEKLY_REVIEW_DAY = 0;
const WEEKLY_REVIEW_AT = 18 * 60 + 30;
const WEEKLY_LOOKAHEAD_DAYS = 7;
/** When the days above run out without the app being opened, one nudge to come back. */
const COME_BACK_AT = 18 * 60;
/** Tests this close show a countdown in the morning plan. */
const COUNTDOWN_DAYS = 7;
/** The bag reminder comes after dinner, but at least this long before sleep. */
const BAG_BEFORE_SLEEP = 30;
const BAG_DAY_TYPES = ['school', 'halfDay', 'paper'];

/** Where tapping a reminder opens the app. */
export const OPEN = {
  today: { screen: 'Today' },
  plan: { screen: 'Plan', section: 'plan' },
  homework: { screen: 'Plan', section: 'homework' },
  focus: { screen: 'Habits', section: 'habits' },
  progress: { screen: 'Habits', section: 'progress' },
};

/* ---------- Wording ---------- */

/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
export function listText(items, max = 3) {
  if (items.length > max) return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Papers of a half-yearly or final read "Half-yearly: Maths"; other tests keep their own name. */
const examName = (exam) => (exam.seriesName && exam.seriesName !== exam.name ? `${exam.seriesName}: ${exam.name}` : exam.name);

const capitalized = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/* ---------- Building blocks ---------- */

function reminder(ctx, { kind, key, date, minute, title, body, open, category = null, subject = null, habitId = null }) {
  return {
    id: `plan:${kind}:${date}:${key}`,
    kind,
    date,
    minute,
    at: instantAt(date, minute, ctx.timeZone),
    title,
    body,
    open,
    category,
    subject,
    habitId,
  };
}

/** The day's open work grouped under the slot it sits in, in time order. */
function workBySlot(layout) {
  const slots = [...layout.slots].sort((a, b) => a.start - b.start);
  const groups = [];
  for (const row of layout.rows) {
    if (row.type !== 'task' || row.task.status !== 'accepted' || row.task.done) continue;
    // A task belongs to the last slot that began at or before it: tasks can run on past their slot.
    const slot = slots.filter((candidate) => candidate.start <= row.start).at(-1) ?? slots[0];
    if (!slot) continue;
    const group = groups.find((item) => item.slot === slot);
    if (group) group.rows.push(row);
    else groups.push({ slot, rows: [row] });
  }
  return groups.sort((a, b) => a.rows[0].start - b.rows[0].start);
}

/* ---------- Each kind ---------- */

/** Before each slot with open work: Homework, Self study or Test prep, and Night revision. */
function slotReminders(ctx, date, groups) {
  return groups.map(({ slot, rows }) => {
    const first = rows[0];
    const total = rows.reduce((sum, row) => sum + row.task.mins, 0);
    let body;
    if (slot.kind === 'night') {
      const parts = rows.map((row) => row.task.title.replace(/^Night revision:\s*/, ''));
      body = `${capitalized(listText(parts))}. ${duration(total)} before sleep.`;
    } else {
      const subject = first.task.subject ? `${subjectName(ctx.profile, first.task.subject)}: ` : '';
      const rest = rows.length > 1 ? `, then ${plural(rows.length - 1, 'more task')}. ${duration(total)} in all.` : ` (${duration(first.task.mins)}).`;
      body = `${subject}${first.task.title}${rest}`;
    }
    return reminder(ctx, {
      kind: 'slots',
      key: `${slot.kind}-${slot.start}`,
      date,
      minute: first.start - ctx.settings.leadMins,
      title: `${slot.label} at ${clockTime(first.start)}`,
      body,
      open: OPEN.today,
      category: slot.kind === 'night' ? null : 'studySlot',
      subject: ctx.profile.subjects.includes(first.task.subject) ? first.task.subject : null,
    });
  });
}

/** At the set time of each habit that has one, unless it is already ticked. */
function habitReminders(ctx, date, layout) {
  const log = logFor(ctx.data, date);
  return layout.rows
    .filter((row) => row.type === 'fixed' && row.kind === 'habit' && !row.auto && !habitDoneOn(log, row.habitId))
    .map((row) =>
      reminder(ctx, {
        kind: 'focus',
        key: `habit-${row.habitId}`,
        date,
        minute: row.start,
        title: `${row.label} at ${clockTime(row.start)}`,
        body: 'Tap Mark done when you’ve finished to keep its streak going.',
        open: OPEN.focus,
        category: 'habit',
        habitId: row.habitId,
      }),
    );
}

/** The evening before tests, exam papers and homework due dates. */
function eveningBefore(ctx, date) {
  const due = addDays(date, 1);
  const exams = ctx.data.exams.filter((exam) => exam.date === due);
  const homework = ctx.data.homework.filter((item) => item.due === due && !item.done);
  if (!exams.length && !homework.length) return [];
  const things = [
    ...exams.map((exam) => `${examName(exam)}${Number.isInteger(exam.start) ? ` at ${clockTime(exam.start)}` : ''}`),
    ...homework.map((item) => `${subjectName(ctx.profile, item.subject)} homework: ${item.title}`),
  ];
  const title = exams.length
    ? exams.length === 1
      ? `Tomorrow: ${examName(exams[0])}`
      : `${exams.length} tests tomorrow`
    : homework.length === 1
      ? 'Homework due tomorrow'
      : `${homework.length} pieces of homework due tomorrow`;
  const advice = exams.length ? 'Do tonight’s revision, then sleep on time.' : 'Finish it today and pack it in your bag.';
  return [
    reminder(ctx, {
      kind: 'tests',
      key: 'tomorrow',
      date,
      minute: EVENING_BEFORE_AT,
      title,
      body: `${listText(things)}. ${advice}`,
      open: exams.length ? { ...OPEN.plan, date: due } : OPEN.homework,
    }),
  ];
}

/** A few days after a test (or the last paper of an exam), asking for the marks if none are in. */
function marksReminders(ctx, date) {
  const testDay = addDays(date, -MARKS_AFTER_DAYS);
  const groups = new Map();
  for (const exam of ctx.data.exams) {
    const group = exam.seriesId ?? exam.id;
    groups.set(group, [...(groups.get(group) ?? []), exam]);
  }
  const out = [];
  for (const [group, exams] of groups) {
    if (exams.map((exam) => exam.date).sort().at(-1) !== testDay) continue;
    const missing = exams.filter((exam) => !exam.result);
    if (!missing.length) continue;
    const name = exams.length > 1 ? (exams[0].seriesName ?? examName(exams[0])) : examName(exams[0]);
    out.push(
      reminder(ctx, {
        kind: 'tests',
        key: `marks-${group}`,
        date,
        minute: MARKS_AT,
        title: `Got your ${name} marks?`,
        body: missing.length > 1 ? `Add them for ${plural(missing.length, 'paper')} in Progress to see how your preparation went.` : 'Add them in Progress to see how your preparation went.',
        open: OPEN.progress,
      }),
    );
  }
  return out;
}

/** After dinner before a school or exam day: what to pack. */
function bagReminder(ctx, date) {
  const tomorrow = addDays(date, 1);
  const frame = dayFrame(ctx.profile, tomorrow, ctx.data.exams);
  if (!BAG_DAY_TYPES.includes(frame.dayType)) return [];
  const { subjects, handIn } = bagSummary(ctx.data, tomorrow);
  const sentences = [];
  if (frame.dayType === 'paper') sentences.push(`Pens, pencils and your admit card for ${listText(frame.papers.map(examName))}`);
  else if (subjects.length) sentences.push(`Books for ${listText(subjects, 6)}`);
  if (handIn.length) sentences.push(`Hand in: ${listText(handIn)}`);
  sentences.push('Don’t forget your ID card and water bottle');
  const dinner = mealsOf(ctx.profile).dinner;
  return [
    reminder(ctx, {
      kind: 'bag',
      key: 'bag',
      date,
      minute: Math.min(dinner.at + dinner.mins, studyEndOf(ctx.profile) - BAG_BEFORE_SLEEP),
      title: 'Pack your bag for tomorrow',
      body: `${sentences.join('. ')}.`,
      open: OPEN.homework,
    }),
  ];
}

/** Two hours before sleep on a day with nothing done yet, so the streak isn't lost. */
function streakNudge(ctx, date) {
  const { data, profile, activity, today } = ctx;
  if (logFor(data, date)?.rest || data.exams.some((exam) => exam.date === date)) return [];
  if (date === today && activity.minutesOn(today) > 0) return [];
  const streak = date === today ? activity.streak : 0;
  return [
    reminder(ctx, {
      kind: 'streak',
      key: 'streak',
      date,
      minute: studyEndOf(profile) - STREAK_NUDGE_BEFORE_SLEEP,
      title: streak > 0 ? `Keep your ${streak}-day streak` : 'Keep your streak going',
      body:
        date === today
          ? 'Nothing is ticked off yet today. One task or a short focus session before night revision keeps it.'
          : 'One task or a short focus session today keeps your streak going.',
      open: OPEN.today,
    }),
  ];
}

/** Shortly after waking: the day's slots, how much is planned, and the next test. */
function morningPlan(ctx, date, layout, groups) {
  const { data } = ctx;
  const frame = layout.frame;
  const total = groups.reduce((sum, group) => sum + group.rows.reduce((mins, row) => mins + row.task.mins, 0), 0);
  const tasks = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const next = data.exams.filter((exam) => exam.date >= date && diffDays(date, exam.date) <= COUNTDOWN_DAYS).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!tasks && !next) return [];
  const parts = [];
  if (frame.dayType === 'paper') parts.push(`${listText(frame.papers.map((paper) => `${examName(paper)} at ${clockTime(paper.start)}`))}. All the best!`);
  if (tasks) {
    const when = groups.map(({ slot, rows }) => `${slot.label.toLowerCase()} at ${clockTime(rows[0].start)}`);
    parts.push(`${plural(tasks, 'task')}, ${duration(total)}: ${listText(when)}.`);
  }
  if (next && frame.dayType !== 'paper') {
    const days = diffDays(date, next.date);
    parts.push(days === 0 ? `${examName(next)} is today.` : days === 1 ? `${examName(next)} is tomorrow.` : `${examName(next)} in ${days} days.`);
  }
  const title = frame.dayType === 'paper' ? 'Exam day' : logFor(data, date)?.rest ? 'Rest day today' : 'Your plan for today';
  return [reminder(ctx, { kind: 'morning', key: 'morning', date, minute: wakeOf(ctx.profile) + MORNING_AFTER_WAKE, title, body: parts.join(' '), open: OPEN.today })];
}

/** Sunday evening: how the week went and a prompt to plan the next one. */
function weeklyReview(ctx, date) {
  if (weekday(date) !== WEEKLY_REVIEW_DAY) return [];
  let body = 'See how your week went, move what slipped and get set for the week ahead.';
  if (date === ctx.today) {
    const activity = ctx.activity ?? loadActivity(ctx.data, ctx.day);
    const mins = [...eachDay(addDays(date, -6), date)].reduce((sum, day) => sum + activity.minutesOn(day), 0);
    const slipped = slippedTasks(ctx.data, addDays(date, -6), date).length;
    body = `${duration(mins)} of study this week${slipped ? `, ${plural(slipped, 'task')} slipped` : ''}. Look back and plan the week ahead.`;
  }
  return [reminder(ctx, { kind: 'weekly', key: 'weekly', date, minute: WEEKLY_REVIEW_AT, title: 'Your weekly review', body, open: OPEN.progress })];
}

/** If the app isn't opened before the reminders above run out, one nudge to come back. */
function comeBack(ctx) {
  return reminder(ctx, {
    kind: 'streak',
    key: 'come-back',
    date: addDays(ctx.today, REMINDER_DAYS),
    minute: COME_BACK_AT,
    title: 'Your plan is waiting',
    body: 'Open Study Planner to see what’s next. Reminders pause until you do.',
    open: OPEN.today,
  });
}

/* ---------- All of them ---------- */

/**
 * Every reminder to set from now on, soonest first: at most MAX_REMINDERS, none in the past,
 * none while the student sleeps. Each has a stable `id` (the same reminder keeps its id when
 * the plan changes, so it is replaced rather than duplicated).
 */
export function upcomingReminders() {
  const data = read();
  const day = studentDay(data);
  const { profile, today } = day;
  const settings = remindersOf(profile);
  const ctx = { data, day, profile, today, settings, timeZone: clock.timeZone(), activity: settings.streak ? loadActivity(data, day) : null };
  const all = [];
  for (const date of eachDay(today, addDays(today, REMINDER_DAYS - 1))) {
    const layout = settings.slots || settings.focus || settings.morning ? layoutDay(profile, date, tasksInRange(data, date, date), data.exams) : null;
    const groups = layout ? workBySlot(layout) : [];
    if (settings.slots) all.push(...slotReminders(ctx, date, groups));
    if (settings.focus) all.push(...habitReminders(ctx, date, layout));
    if (settings.morning) all.push(...morningPlan(ctx, date, layout, groups));
    if (settings.tests) all.push(...eveningBefore(ctx, date), ...marksReminders(ctx, date));
    if (settings.bag) all.push(...bagReminder(ctx, date));
    if (settings.streak) all.push(...streakNudge(ctx, date));
  }
  if (settings.weekly) for (const date of eachDay(today, addDays(today, WEEKLY_LOOKAHEAD_DAYS - 1))) all.push(...weeklyReview(ctx, date));
  if (settings.streak) all.push(comeBack(ctx));

  const wake = wakeOf(profile);
  const sleep = studyEndOf(profile);
  const now = clock.now().getTime();
  return all
    .filter((item) => item.minute >= wake && item.minute < sleep && item.at > now)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_REMINDERS);
}

/** Whether the focus timer may notify when a session or break ends. */
export function focusRemindersOn() {
  const profile = read().profile;
  return Boolean(profile) && remindersOf(profile).focus;
}
