import { addDays, eachDay, localNow, weekday } from "./core/dates";
import {
  bestStreak,
  coverage,
  DayLoad,
  DEFAULT_HOMEWORK_MINS,
  dueRevisionNudges,
  habitStreak,
  DAY_END,
  layoutDay,
  routineSlots,
  sortDayTasks,
  streak,
  tuitionsOf,
} from "./core/engine";
import { afterSchoolBreakOf, mealsOf, wakeOf } from "./core/dayFrame";
import { remindersOf } from "./core/reminderSettings";
import { REVISION_INTERVALS } from "./core/types";
import { clock } from "./clock";
import { read, write } from "./db";
import { habitDoneOn, MAX_REST_DAYS_PER_WEEK, routineOf } from "./daily";
import {
  copy,
  doneMinutesByDay,
  examsFrom,
  focusMinutesByDay,
  logFor,
  slippedTasks,
  studentDay,
  subjectName,
  tasksInRange,
} from "./queries";
import {
  chaptersWithPlans,
  needsDailyPlan,
  needsMoveSuggestions,
  recentResults,
  refreshMissedTasks,
  suggestionsByState,
  topUpDailyPlan,
  upcomingExams,
} from "./study";

/** Days of history used for the streak. Longer streaks show as this cap. */
const STREAK_LOOKBACK_DAYS = 180;
const HEAVY_DAY_LOOKAHEAD = 7;
const SLIPPED_LOOKBACK_DAYS = 7;
const DEFAULT_CHECKIN = {
  sleep: 8,
  breaks: 3,
  screen: "1 to 2 h",
  saved: false,
};
const RECENT_MARKS_DAYS = 14;
/** Local hours where the afternoon (after school) and evening routines begin. */
const AFTERNOON_FROM_HOUR = 12;
const EVENING_FROM_HOUR = 18;

/** Study minutes per day (finished tasks plus focus sessions), rest days and the streak. */
export function loadActivity(data, ctx) {
  const from = addDays(ctx.today, -STREAK_LOOKBACK_DAYS);
  const taskMinutes = doneMinutesByDay(data, from, ctx.today);
  const focusMinutes = focusMinutesByDay(data, from, ctx.today);
  const restDays = new Set(
    Object.values(data.dailyLogs)
      .filter((log) => log.rest && log.date >= from && log.date <= ctx.today)
      .map((log) => log.date),
  );
  const examDays = new Set(examsFrom(data, from).map((exam) => exam.date));
  const minutesOn = (date) =>
    (taskMinutes.get(date) ?? 0) + (focusMinutes.get(date) ?? 0);
  const stateOf = (date) => {
    if (date > ctx.today || date < from) return null;
    if (minutesOn(date) > 0) return "study";
    if (restDays.has(date)) return "rest";
    if (examDays.has(date)) return "exam";
    if (date < ctx.today && date >= ctx.profile.trackingStart) return "missed";
    return null;
  };
  const restDaysThisWeek = [
    ...eachDay(addDays(ctx.today, -6), ctx.today),
  ].filter((date) => stateOf(date) === "rest").length;
  return {
    from,
    minutesOn,
    stateOf,
    isExamDay: (date) => examDays.has(date),
    streak: streak(stateOf, ctx.today),
    restDaysThisWeek,
  };
}

/** "16:45" on the student's clock for a stored ISO time. */
function localClockTime(iso, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/** Today's routine habits with their streaks, plus how much of each of the last seven days was done. */
function routineSummary(data, profile, today, lastWeek, hour) {
  const habits = routineOf(profile);
  const scheduledOn = (habit) => (date) =>
    habit.days.includes(weekday(date)) &&
    (!habit.createdOn || date >= habit.createdOn);
  const doneOn = (habit) => (date) => habitDoneOn(logFor(data, date), habit.id);
  return {
    now:
      hour < AFTERNOON_FROM_HOUR
        ? "morning"
        : hour < EVENING_FROM_HOUR
          ? "afternoon"
          : "evening",
    habits: habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      icon: habit.icon ?? null,
      part: habit.part,
      // A set time makes the habit a fixed block on the plan.
      at: Number.isInteger(habit.at) ? habit.at : null,
      mins: habit.mins ?? null,
      days: [...habit.days],
      scheduledToday: scheduledOn(habit)(today),
      done: doneOn(habit)(today),
      streak: habitStreak({
        scheduledOn: scheduledOn(habit),
        doneOn: doneOn(habit),
        today,
        since: habit.createdOn ?? profile.trackingStart,
      }),
    })),
    week: lastWeek.map((date) => {
      const due = habits.filter((habit) => scheduledOn(habit)(date));
      return {
        date,
        due: due.length,
        done: due.filter((habit) => doneOn(habit)(date)).length,
      };
    }),
  };
}

const weekMinutes = (activity, today) =>
  [...eachDay(addDays(today, -6), today)].reduce(
    (sum, date) => sum + activity.minutesOn(date),
    0,
  );

/** Today screen: next test, timed plan, rings, suggestions, heavy-day warning. */
export function todayDashboard() {
  // The only writes: slipped tasks become "move it" suggestions, and the coming week gets its
  // daily revision and self study. Both are skipped when there's nothing new.
  const before = read();
  const beforeCtx = studentDay(before);
  if (needsMoveSuggestions(before, beforeCtx.today))
    write((draft) => refreshMissedTasks(draft, studentDay(draft)));
  if (needsDailyPlan(read(), beforeCtx))
    write((draft) => topUpDailyPlan(draft, studentDay(draft)));

  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const windowTasks = tasksInRange(data, today, addDays(today, 13));
  const upcoming = upcomingExams(data, today);
  const openSuggestions = suggestionsByState(data, ["pending", "later"]);
  const activity = loadActivity(data, ctx);
  const load = new DayLoad(windowTasks, { exams: data.exams });
  const todayTasks = windowTasks.filter((task) => task.date === today);
  const layout = layoutDay(profile, today, todayTasks, data.exams);
  const startOf = new Map(
    layout.rows.flatMap((row) =>
      row.type === "task" ? [[row.task.id, row.start]] : [],
    ),
  );
  // Today's plan shows the planner's suggested blocks too, so the student can just do them; ticking one keeps it.
  const byStart = (a, b) =>
    (startOf.get(a.id) ?? Infinity) - (startOf.get(b.id) ?? Infinity);
  const mine = sortDayTasks(
    todayTasks.filter(
      (task) => task.status === "accepted" || task.status === "suggested",
    ),
  ).sort(byStart);
  // Later days' suggestions still wait in Plan.
  const suggested = windowTasks.filter(
    (task) => task.status === "suggested" && task.date > today,
  );
  const heavyDate = [
    ...eachDay(today, addDays(today, HEAVY_DAY_LOOKAHEAD - 1)),
  ].find((date) => load.isOverloaded(profile, date));

  return {
    today,
    ageMode: profile.ageMode,
    examSeason: profile.examSeason,
    nextExam: upcoming[0] ?? null,
    upcomingExams: upcoming,
    plannedMins: load.planned(today),
    limitMins: load.limit(profile, today),
    tasks: mine.map((task) => ({
      task: copy(task),
      start: startOf.get(task.id) ?? null,
    })),
    slots: layout.slots,
    doneCount: mine.filter((task) => task.done).length,
    focusTodayMins: focusMinutesByDay(data, today, today).get(today) ?? 0,
    weekMins: weekMinutes(activity, today),
    weeklyGoalMins: profile.weeklyGoalMins,
    streak: activity.streak,
    suggestedBlocks: {
      count: suggested.length,
      firstDate: suggested.map((task) => task.date).sort()[0] ?? null,
    },
    heavyDay: heavyDate
      ? {
          date: heavyDate,
          plannedMins: load.planned(heavyDate),
          limitMins: load.limit(profile, heavyDate),
        }
      : null,
    suggestions: openSuggestions.filter((item) => item.state === "pending"),
    laterCount: openSuggestions.filter((item) => item.state === "later").length,
  };
}

/** Progress screen: syllabus coverage, study hours, test readiness, slipped tasks. */
export function progressDashboard() {
  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const chapters = chaptersWithPlans(data, today);
  const activity = loadActivity(data, ctx);
  const last7 = [...eachDay(addDays(today, -6), today)].map((date) => ({
    date,
    mins: activity.minutesOn(date),
  }));
  return {
    today,
    ageMode: profile.ageMode,
    coverage: coverage(chapters),
    subjects: profile.subjects.map((subject) => {
      const list = chapters.filter((chapter) => chapter.subject === subject);
      return {
        subject,
        name: subjectName(profile, subject),
        coverage: coverage(list),
        chapters: list,
      };
    }),
    last7,
    weekMins: last7.reduce((sum, day) => sum + day.mins, 0),
    weeklyGoalMins: profile.weeklyGoalMins,
    upcomingExams: upcomingExams(data, today),
    results: recentResults(data, today),
    slipped: slippedTasks(
      data,
      addDays(today, -SLIPPED_LOOKBACK_DAYS),
      today,
    ).map(copy),
  };
}

/** Habits screen: streak, focus timer and history, routines, check-in, revision nudges. */
export function habitsDashboard() {
  const data = read();
  const ctx = studentDay(data);
  const { profile, today } = ctx;
  const activity = loadActivity(data, ctx);
  const timeZone = clock.timeZone();
  const sessions = data.focusSessions
    .filter((session) => session.date === today)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map(({ id, date, subject, mins, createdAt }) => ({
      id,
      date,
      subject,
      mins,
      time: createdAt ? localClockTime(createdAt, timeZone) : null,
    }));
  const log = logFor(data, today);
  const studiedToday = activity.minutesOn(today) > 0;
  const lastWeek = [...eachDay(addDays(today, -6), today)];
  const focusByDay = focusMinutesByDay(data, lastWeek[0], today);
  const focusWeek = lastWeek.map((date) => ({
    date,
    mins: focusByDay.get(date) ?? 0,
  }));
  return {
    today,
    streak: activity.streak,
    bestStreak: Math.max(
      activity.streak,
      bestStreak(activity.stateOf, activity.from, today),
    ),
    todayState: activity.stateOf(today),
    studiedToday,
    restToday: Boolean(log?.rest),
    calendar: [...eachDay(addDays(today, -27), today)].map((date) => ({
      date,
      state: activity.stateOf(date),
      exam: activity.isExamDay(date),
    })),
    restDaysThisWeek: activity.restDaysThisWeek,
    maxRestDaysPerWeek: MAX_REST_DAYS_PER_WEEK,
    canRestToday:
      !studiedToday &&
      !log?.rest &&
      activity.restDaysThisWeek < MAX_REST_DAYS_PER_WEEK,
    focusSessions: sessions,
    focusTodayMins: sessions.reduce((sum, session) => sum + session.mins, 0),
    focusWeek,
    focusWeekMins: focusWeek.reduce((sum, day) => sum + day.mins, 0),
    checkin: copy(log?.checkin ?? DEFAULT_CHECKIN),
    routine: routineSummary(
      data,
      profile,
      today,
      lastWeek,
      localNow(clock.now(), timeZone).hour,
    ),
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
    cls: profile.cls ?? null,
    board: profile.board,
    boardName: profile.boardName ?? profile.board,
    examShortName: profile.examShortName ?? null,
    levelName: profile.levelName ?? null,
    ageMode: profile.ageMode,
    examSeason: profile.examSeason,
    homeworkMins: profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS,
    schoolDay: {
      schoolStart: profile.schoolStart,
      schoolEnd: profile.schoolEnd,
      saturday: profile.saturday ?? "half",
      tuitions: tuitionsOf(profile).map(({ name, days, start, end }) => ({
        name,
        days: [...days],
        start,
        end,
      })),
    },
    todaySlots: routineSlots(profile, today, data.exams),
    studyEnd: profile.studyEnd ?? DAY_END,
    wakeAt: wakeOf(profile),
    meals: mealsOf(profile),
    afterSchoolBreakMins: afterSchoolBreakOf(profile),
    studySessions: (profile.studySessions ?? []).map(({ start, end }) => ({
      start,
      end,
    })),
    holidays: (profile.holidays ?? [])
      .filter((holiday) => holiday.to >= today)
      .map(({ id, name, from, to }) => ({ id, name, from, to })),
    sharing: copy(profile.sharing),
    reminders: remindersOf(profile),
    preview: {
      weekMins: weekMinutes(activity, today),
      weeklyGoalMins: profile.weeklyGoalMins,
      streak: activity.streak,
      coveragePercent: coverage(data.chapters).percent,
      nextExam: nextExam ? { name: nextExam.name, date: nextExam.date } : null,
      /** Marks from tests in the last two weeks, newest first. */
      recentMarks: recentResults(data, today)
        .filter(
          (exam) =>
            exam.result &&
            exam.date >= addDays(today, -(RECENT_MARKS_DAYS - 1)),
        )
        .slice(0, 3)
        .map(({ name, date, result }) => ({ name, date, ...result })),
    },
    later: suggestionsByState(data, ["later"]),
  };
}
