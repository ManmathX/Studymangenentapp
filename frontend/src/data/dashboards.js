import { addDays, eachDay } from './core/dates';
import {
  coverage,
  DayLoad,
  DEFAULT_HOMEWORK_MINS,
  dueRevisionNudges,
  layoutDay,
  limitFor,
  routineSlots,
  sortDayTasks,
  streak,
  tuitionsOf,
} from './core/engine';
import { ROUTINES } from './core/syllabus';
import { REVISION_INTERVALS } from './core/types';
import { read, write } from './db';
import { MAX_REST_DAYS_PER_WEEK } from './daily';
import { copy, doneMinutesByDay, examsFrom, focusMinutesByDay, logFor, slippedTasks, studentDay, subjectName, tasksInRange } from './queries';
import { chaptersWithPlans, needsMoveSuggestions, recentResults, refreshMissedTasks, suggestionsByState, upcomingExams } from './study';

/** Days of history used for the streak. Longer streaks show as this cap. */
const STREAK_LOOKBACK_DAYS = 180;
const HEAVY_DAY_LOOKAHEAD = 7;
const SLIPPED_LOOKBACK_DAYS = 7;
const DEFAULT_CHECKIN = { sleep: 8, breaks: 3, screen: '1 to 2 h', saved: false };
const RECENT_MARKS_DAYS = 14;

/** Study minutes per day (finished tasks plus focus sessions), rest days and the streak. */
function loadActivity(data, ctx) {
  const from = addDays(ctx.today, -STREAK_LOOKBACK_DAYS);
  const taskMinutes = doneMinutesByDay(data, from, ctx.today);
  const focusMinutes = focusMinutesByDay(data, from, ctx.today);
  const restDays = new Set(Object.values(data.dailyLogs).filter((log) => log.rest && log.date >= from && log.date <= ctx.today).map((log) => log.date));
  const examDays = new Set(examsFrom(data, from).map((exam) => exam.date));
  const minutesOn = (date) => (taskMinutes.get(date) ?? 0) + (focusMinutes.get(date) ?? 0);
  const stateOf = (date) => {
    if (date > ctx.today || date < from) return null;
    if (minutesOn(date) > 0) return 'study';
    if (restDays.has(date)) return 'rest';
    if (examDays.has(date)) return 'exam';
    if (date < ctx.today && date >= ctx.profile.trackingStart) return 'missed';
    return null;
  };
  const restDaysThisWeek = [...eachDay(addDays(ctx.today, -6), ctx.today)].filter((date) => stateOf(date) === 'rest').length;
  return { minutesOn, stateOf, streak: streak(stateOf, ctx.today), restDaysThisWeek };
}

const weekMinutes = (activity, today) => [...eachDay(addDays(today, -6), today)].reduce((sum, date) => sum + activity.minutesOn(date), 0);

/** Today screen: next test, timed plan, rings, suggestions, heavy-day warning. */
export function todayDashboard() {
  // Turning slipped tasks into "move it" suggestions is the only write; skip it when there's nothing new.
  const before = read();
  if (needsMoveSuggestions(before, studentDay(before).today)) write((draft) => refreshMissedTasks(draft, studentDay(draft)));

  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const windowTasks = tasksInRange(data, today, addDays(today, 13));
  const upcoming = upcomingExams(data, today);
  const openSuggestions = suggestionsByState(data, ['pending', 'later']);
  const activity = loadActivity(data, ctx);
  const load = new DayLoad(windowTasks);
  const todayTasks = windowTasks.filter((task) => task.date === today);
  const layout = layoutDay(profile, today, todayTasks, data.exams);
  const startOf = new Map(layout.rows.flatMap((row) => (row.type === 'task' ? [[row.task.id, row.start]] : [])));
  const mine = sortDayTasks(todayTasks.filter((task) => task.status === 'accepted'));
  const suggested = windowTasks.filter((task) => task.status === 'suggested');
  const heavyDate = [...eachDay(today, addDays(today, HEAVY_DAY_LOOKAHEAD - 1))].find((date) => load.isOverloaded(profile, date));

  return {
    today,
    ageMode: profile.ageMode,
    examSeason: profile.examSeason,
    nextExam: upcoming[0] ?? null,
    upcomingExams: upcoming,
    plannedMins: load.planned(today),
    limitMins: limitFor(profile, today),
    tasks: mine.map((task) => ({ task: copy(task), start: startOf.get(task.id) ?? null })),
    slots: layout.slots,
    doneCount: mine.filter((task) => task.done).length,
    focusTodayMins: focusMinutesByDay(data, today, today).get(today) ?? 0,
    weekMins: weekMinutes(activity, today),
    weeklyGoalMins: profile.weeklyGoalMins,
    streak: activity.streak,
    suggestedBlocks: { count: suggested.length, firstDate: suggested.map((task) => task.date).sort()[0] ?? null },
    heavyDay: heavyDate ? { date: heavyDate, plannedMins: load.planned(heavyDate), limitMins: limitFor(profile, heavyDate) } : null,
    suggestions: openSuggestions.filter((item) => item.state === 'pending'),
    laterCount: openSuggestions.filter((item) => item.state === 'later').length,
  };
}

/** Progress screen: syllabus coverage, study hours, test readiness, slipped tasks. */
export function progressDashboard() {
  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const chapters = chaptersWithPlans(data, today);
  const activity = loadActivity(data, ctx);
  const last7 = [...eachDay(addDays(today, -6), today)].map((date) => ({ date, mins: activity.minutesOn(date) }));
  return {
    today,
    ageMode: profile.ageMode,
    coverage: coverage(chapters),
    subjects: profile.subjects.map((subject) => {
      const list = chapters.filter((chapter) => chapter.subject === subject);
      return { subject, name: subjectName(profile, subject), coverage: coverage(list), chapters: list };
    }),
    last7,
    weekMins: last7.reduce((sum, day) => sum + day.mins, 0),
    weeklyGoalMins: profile.weeklyGoalMins,
    upcomingExams: upcomingExams(data, today),
    results: recentResults(data, today),
    slipped: slippedTasks(data, addDays(today, -SLIPPED_LOOKBACK_DAYS), today).map(copy),
  };
}

/** Habits screen: streak calendar, focus sessions, check-in, routines, revision nudges. */
export function habitsDashboard() {
  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const activity = loadActivity(data, ctx);
  const sessions = data.focusSessions
    .filter((session) => session.date === today)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map(({ id, date, subject, mins }) => ({ id, date, subject, mins }));
  const log = logFor(data, today);
  const studiedToday = activity.minutesOn(today) > 0;
  return {
    today,
    streak: activity.streak,
    calendar: [...eachDay(addDays(today, -27), today)].map((date) => ({ date, state: activity.stateOf(date) })),
    restDaysThisWeek: activity.restDaysThisWeek,
    maxRestDaysPerWeek: MAX_REST_DAYS_PER_WEEK,
    canRestToday: !studiedToday && !log?.rest && activity.restDaysThisWeek < MAX_REST_DAYS_PER_WEEK,
    focusSessions: sessions,
    focusTodayMins: sessions.reduce((sum, session) => sum + session.mins, 0),
    checkin: copy(log?.checkin ?? DEFAULT_CHECKIN),
    routines: {
      morning: ROUTINES.morning.map((label, index) => ({ label, done: Boolean(log?.routines?.morning?.[index]) })),
      evening: ROUTINES.evening.map((label, index) => ({ label, done: Boolean(log?.routines?.evening?.[index]) })),
    },
    nudges: dueRevisionNudges(data.chapters, today).map((chapter) => ({
      key: chapter.key,
      name: chapter.name,
      subject: chapter.subject,
      learnedOn: chapter.learnedOn,
      intervalDays: REVISION_INTERVALS[chapter.revisions] ?? null,
    })),
    subjects: [...profile.subjects],
  };
}

/** Profile screen: who you are, the parent-summary preview, and suggestions saved for later. */
export function sharingDashboard() {
  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const activity = loadActivity(data, ctx);
  const nextExam = upcomingExams(data, today)[0];
  return {
    name: profile.name,
    cls: profile.cls,
    board: profile.board,
    boardName: profile.boardName ?? profile.board,
    ageMode: profile.ageMode,
    examSeason: profile.examSeason,
    homeworkMins: profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS,
    schoolDay: {
      schoolStart: profile.schoolStart,
      schoolEnd: profile.schoolEnd,
      tuitions: tuitionsOf(profile).map(({ name, days, start, end }) => ({ name, days: [...days], start, end })),
    },
    todaySlots: routineSlots(profile, today, data.exams),
    sharing: copy(profile.sharing),
    preview: {
      weekMins: weekMinutes(activity, today),
      weeklyGoalMins: profile.weeklyGoalMins,
      streak: activity.streak,
      coveragePercent: coverage(data.chapters).percent,
      nextExam: nextExam ? { name: nextExam.name, date: nextExam.date } : null,
      /** Marks from tests in the last two weeks, newest first. */
      recentMarks: recentResults(data, today)
        .filter((exam) => exam.result && exam.date >= addDays(today, -(RECENT_MARKS_DAYS - 1)))
        .slice(0, 3)
        .map(({ name, date, result }) => ({ name, date, ...result })),
    },
    later: suggestionsByState(data, ['later']),
  };
}
