import { addDays, eachDay } from '../../common/utils/dates.js';
import type { ChapterService } from '../chapters/chapter.service.js';
import type { ExamRepository } from '../exams/exam.repository.js';
import type { ExamService } from '../exams/exam.service.js';
import type { HabitsRepository } from '../habits/habits.repository.js';
import { MAX_REST_DAYS_PER_WEEK } from '../habits/habits.service.js';
import { coverage, DayLoad, dueRevisionNudges, layoutDay, limitFor, sortDayTasks } from '../planner/planner.engine.js';
import { REVISION_INTERVALS } from '../planner/planner.types.js';
import type { StudentContext } from '../planner/student-context.js';
import type { SuggestionRepository } from '../suggestions/suggestion.repository.js';
import type { SuggestionService } from '../suggestions/suggestion.service.js';
import { ROUTINES, SUBJECTS } from '../syllabus/syllabus.data.js';
import { toTaskDto } from '../tasks/task.dto.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import { loadActivity } from './activity.js';

const HEAVY_DAY_LOOKAHEAD = 7;
const SLIPPED_LOOKBACK_DAYS = 7;
const DEFAULT_CHECKIN = { sleep: 8, breaks: 3, screen: '1 to 2 h' as const, saved: false };

/** Read models for the main screens, each assembled with a fixed, small number of queries. */
export class DashboardService {
  constructor(
    private readonly context: StudentContext,
    private readonly tasks: TaskRepository,
    private readonly exams: ExamRepository,
    private readonly examService: ExamService,
    private readonly habits: HabitsRepository,
    private readonly suggestions: SuggestionRepository,
    private readonly suggestionService: SuggestionService,
    private readonly chapterService: ChapterService,
    private readonly users: UserRepository,
  ) {}

  private get repos() {
    return { tasks: this.tasks, habits: this.habits, exams: this.exams };
  }

  async today(userId: string) {
    const ctx = await this.context.load(userId);
    await this.suggestionService.refreshMissedTasks(userId, ctx);
    const [windowTasks, upcoming, openSuggestions, activity] = await Promise.all([
      this.tasks.findInRange(userId, ctx.today, addDays(ctx.today, 13)),
      this.examService.upcomingFrom(userId, ctx.today),
      this.suggestions.listByStates(userId, ['pending', 'later']),
      loadActivity(userId, ctx, this.repos),
    ]);
    const load = new DayLoad(windowTasks);
    const todayTasks = windowTasks.filter((task) => task.date === ctx.today);
    const layout = layoutDay(ctx.profile, ctx.today, todayTasks);
    const startOf = new Map(layout.rows.flatMap((row) => (row.type === 'task' ? [[row.task.id, row.start] as const] : [])));
    const mine = sortDayTasks(todayTasks.filter((task) => task.status === 'accepted'));
    const suggested = windowTasks.filter((task) => task.status === 'suggested');
    const heavyDate = [...eachDay(ctx.today, addDays(ctx.today, HEAVY_DAY_LOOKAHEAD - 1))].find((date) => load.isOverloaded(ctx.profile, date));
    const weekMins = [...eachDay(addDays(ctx.today, -6), ctx.today)].reduce((sum, date) => sum + activity.minutesOn(date), 0);
    const focusTodayMins = (await this.habits.focusMinutesByDay(userId, ctx.today, ctx.today)).get(ctx.today) ?? 0;

    return {
      today: ctx.today,
      ageMode: ctx.profile.ageMode,
      examSeason: ctx.profile.examSeason,
      nextExam: upcoming[0] ?? null,
      upcomingExams: upcoming,
      plannedMins: load.planned(ctx.today),
      limitMins: limitFor(ctx.profile, ctx.today),
      tasks: mine.map((task) => ({ task: toTaskDto(task), start: startOf.get(task.id) ?? null })),
      doneCount: mine.filter((task) => task.done).length,
      focusTodayMins,
      weekMins,
      weeklyGoalMins: ctx.profile.weeklyGoalMins,
      streak: activity.streak,
      suggestedBlocks: {
        count: suggested.length,
        firstDate: suggested.map((task) => task.date).sort()[0] ?? null,
      },
      heavyDay: heavyDate ? { date: heavyDate, plannedMins: load.planned(heavyDate), limitMins: limitFor(ctx.profile, heavyDate) } : null,
      suggestions: openSuggestions.filter((item) => item.state === 'pending'),
      laterCount: openSuggestions.filter((item) => item.state === 'later').length,
    };
  }

  async progress(userId: string) {
    const ctx = await this.context.load(userId);
    const [chapters, upcoming, slipped, activity] = await Promise.all([
      this.chapterService.list(userId, {}),
      this.examService.upcomingFrom(userId, ctx.today),
      this.tasks.findSlipped(userId, addDays(ctx.today, -SLIPPED_LOOKBACK_DAYS), ctx.today),
      loadActivity(userId, ctx, this.repos),
    ]);
    const last7 = [...eachDay(addDays(ctx.today, -6), ctx.today)].map((date) => ({ date, mins: activity.minutesOn(date) }));
    return {
      today: ctx.today,
      ageMode: ctx.profile.ageMode,
      coverage: coverage(chapters),
      subjects: ctx.profile.subjects.map((subject) => {
        const list = chapters.filter((chapter) => chapter.subject === subject);
        return { subject, name: SUBJECTS[subject].name, coverage: coverage(list), chapters: list };
      }),
      last7,
      weekMins: last7.reduce((sum, day) => sum + day.mins, 0),
      weeklyGoalMins: ctx.profile.weeklyGoalMins,
      upcomingExams: upcoming,
      slipped: slipped.map(toTaskDto),
    };
  }

  async habitsOverview(userId: string) {
    const ctx = await this.context.load(userId);
    const calendarStart = addDays(ctx.today, -27);
    const [activity, sessions, log, chapters] = await Promise.all([
      loadActivity(userId, ctx, this.repos),
      this.habits.focusSessionsOn(userId, ctx.today),
      this.habits.findLog(userId, ctx.today),
      this.chapterService.list(userId, {}),
    ]);
    const studiedToday = activity.minutesOn(ctx.today) > 0;
    const restingToday = Boolean(log?.rest);
    return {
      today: ctx.today,
      streak: activity.streak,
      calendar: [...eachDay(calendarStart, ctx.today)].map((date) => ({ date, state: activity.stateOf(date) })),
      restDaysThisWeek: activity.restDaysThisWeek,
      maxRestDaysPerWeek: MAX_REST_DAYS_PER_WEEK,
      canRestToday: !studiedToday && !restingToday && activity.restDaysThisWeek < MAX_REST_DAYS_PER_WEEK,
      focusSessions: sessions,
      focusTodayMins: sessions.reduce((sum, session) => sum + session.mins, 0),
      checkin: log?.checkin ?? DEFAULT_CHECKIN,
      routines: {
        morning: ROUTINES.morning.map((label, index) => ({ label, done: Boolean(log?.routines?.morning[index]) })),
        evening: ROUTINES.evening.map((label, index) => ({ label, done: Boolean(log?.routines?.evening[index]) })),
      },
      nudges: dueRevisionNudges(chapters, ctx.today).map((chapter) => ({
        key: chapter.key,
        name: chapter.name,
        subject: chapter.subject,
        learnedOn: chapter.learnedOn,
        intervalDays: REVISION_INTERVALS[chapter.revisions] ?? null,
      })),
      subjects: ctx.profile.subjects,
    };
  }

  /** What a parent summary would contain, plus suggestions saved for later. */
  async sharing(userId: string) {
    const ctx = await this.context.load(userId);
    const [user, activity, chapters, upcoming, later] = await Promise.all([
      this.users.findById(userId),
      loadActivity(userId, ctx, this.repos),
      this.chapterService.list(userId, {}),
      this.examService.upcomingFrom(userId, ctx.today),
      this.suggestions.listByStates(userId, ['later']),
    ]);
    const weekMins = [...eachDay(addDays(ctx.today, -6), ctx.today)].reduce((sum, date) => sum + activity.minutesOn(date), 0);
    const nextExam = upcoming[0];
    return {
      name: user?.name ?? '',
      cls: ctx.profile.cls,
      board: ctx.profile.board,
      ageMode: ctx.profile.ageMode,
      examSeason: ctx.profile.examSeason,
      sharing: ctx.profile.sharing,
      preview: {
        weekMins,
        weeklyGoalMins: ctx.profile.weeklyGoalMins,
        streak: activity.streak,
        coveragePercent: coverage(chapters).percent,
        nextExam: nextExam ? { name: nextExam.name, date: nextExam.date } : null,
      },
      later,
    };
  }
}
