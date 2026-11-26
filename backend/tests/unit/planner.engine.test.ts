import { describe, expect, it } from 'vitest';
import {
  bagFor,
  bestDay,
  chapterDeadline,
  coverage,
  DayLoad,
  dueRevisionNudges,
  layoutDay,
  limitFor,
  nextSchoolDay,
  planSuggestions,
  priority,
  proposeDays,
  startDay,
  stepsFor,
  streak,
  type DayState,
} from '../../src/modules/planner/planner.engine.js';
import type { PlannerChapter, PlannerProfile } from '../../src/modules/planner/planner.types.js';

const profile: PlannerProfile = {
  dailyLimitMins: 180,
  ageMode: 'deeper',
  examSeason: false,
  tuitionDays: [1, 3, 5],
  tuitionStart: 960,
  tuitionEnd: 1050,
  schoolStart: 7 * 60 + 45,
  schoolEnd: 13 * 60 + 45,
};
const WED = '2026-11-18';
const THU = '2026-11-19';
const SUN = '2026-11-22';

const chapter = (key: string, patch: Partial<PlannerChapter> = {}): PlannerChapter => ({
  key,
  subject: 'maths',
  name: `Chapter ${key}`,
  difficulty: 2,
  status: 'not',
  learnedOn: null,
  revisions: 0,
  snoozedUntil: null,
  ...patch,
});

describe('daily limits', () => {
  it('adjusts for Sundays, tuition, simple mode and exam season', () => {
    expect(limitFor(profile, THU)).toBe(180);
    expect(limitFor(profile, WED)).toBe(150);
    expect(limitFor(profile, SUN)).toBe(270);
    expect(limitFor({ ...profile, ageMode: 'simple', dailyLimitMins: 240 }, THU)).toBe(120);
    expect(limitFor({ ...profile, examSeason: true }, THU)).toBe(225);
  });

  it('counts accepted and suggested load but never skipped tasks', () => {
    const load = new DayLoad([
      { date: THU, mins: 60, status: 'accepted' },
      { date: THU, mins: 30, status: 'suggested' },
      { date: THU, mins: 90, status: 'skipped' },
    ]);
    expect(load.planned(THU)).toBe(60);
    expect(load.planned(THU, true)).toBe(90);
    expect(load.room(profile, THU)).toBe(90);
    expect(load.isOverloaded(profile, THU)).toBe(false);
  });

  it('picks the roomiest day that still fits', () => {
    const load = new DayLoad([{ date: THU, mins: 170, status: 'accepted' }]);
    expect(bestDay(load, profile, 60, WED, '2026-11-21')).toBe('2026-11-21');
    expect(bestDay(load, profile, 500, WED, '2026-11-21')).toBeNull();
    expect(bestDay(new DayLoad(), profile, 30, WED, SUN, SUN)).toBe('2026-11-19');
  });

  it('plans from tomorrow after the evening cut-off and scores urgency', () => {
    expect(startDay({ date: WED, hour: 18 })).toBe(WED);
    expect(startDay({ date: WED, hour: 19 })).toBe(THU);
    expect(priority(1, 100, 3)).toBeGreaterThan(priority(10, 100, 3));
    expect(priority(0, 20, 2)).toBe(priority(1, 20, 2));
  });
});

describe('day timeline', () => {
  it('fits tasks around school, lunch, tuition and dinner, and reports overflow', () => {
    const tasks = [
      { id: 'a', date: WED, mins: 60, status: 'accepted' as const, score: 1, order: 1 },
      { id: 'b', date: WED, mins: 120, status: 'accepted' as const, score: 1, order: 2 },
      { id: 'c', date: WED, mins: 200, status: 'accepted' as const, score: 1, order: 3 },
      { id: 'd', date: WED, mins: 30, status: 'skipped' as const, score: 9, order: 4 },
    ];
    const { rows, overflow } = layoutDay(profile, WED, tasks);
    const placed = rows.filter((row) => row.type === 'task');
    expect(placed.map((row) => (row.type === 'task' ? row.task.id : ''))).toEqual(['a', 'b']);
    expect(overflow.map((task) => task.id)).toEqual(['c']);
    for (const row of placed) {
      const clash = rows.some(
        (other) => other.type === 'fixed' && other.start < row.end && other.end > row.start,
      );
      expect(clash).toBe(false);
    }
  });
});

describe('chapters and revision', () => {
  it('offers fewer steps the further along a chapter is', () => {
    expect(stepsFor({ subject: 'maths', status: 'not' })).toHaveLength(4);
    expect(stepsFor({ subject: 'english', status: 'learning' })[0]!.title).toBe(
      'Textbook questions',
    );
    expect(stepsFor({ subject: 'maths', status: 'mastered' })).toHaveLength(1);
  });

  it('works back from the next test that covers the chapter', () => {
    const exams = [
      { id: '1', name: 'Later', date: '2026-12-10', weight: 20, chapterKeys: ['maths-1'] },
      { id: '2', name: 'Sooner', date: '2026-11-28', weight: 20, chapterKeys: ['maths-1'] },
    ];
    expect(chapterDeadline('maths-1', exams, WED)).toMatchObject({
      exam: { name: 'Sooner' },
      deadline: '2026-11-27',
    });
    expect(chapterDeadline('maths-9', exams, WED)).toEqual({ exam: null, deadline: '2026-12-01' });
  });

  it('proposes one day per step, in order, before the deadline', () => {
    const days = proposeDays(new DayLoad(), profile, [45, 40, 30, 20], '2026-11-27', WED, WED);
    expect(days).toEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    const full = new DayLoad([{ date: THU, mins: 180, status: 'accepted' }]);
    expect(proposeDays(full, profile, [45, 40], '2026-11-27', WED, WED)).toEqual([
      WED,
      '2026-11-20',
    ]);
  });

  it('nudges revisions 1, 7 and 30 days after learning, respecting snoozes', () => {
    const chapters = [
      chapter('maths-1', { status: 'learning', learnedOn: '2026-11-17', revisions: 0 }),
      chapter('maths-2', { status: 'learning', learnedOn: '2026-11-15', revisions: 1 }),
      chapter('maths-3', {
        status: 'revised',
        learnedOn: '2026-11-01',
        revisions: 1,
        snoozedUntil: THU,
      }),
      chapter('maths-4', { status: 'mastered', learnedOn: '2026-01-01', revisions: 3 }),
    ];
    expect(dueRevisionNudges(chapters, WED).map((item) => item.key)).toEqual(['maths-1']);
  });

  it('measures coverage as revised plus mastered', () => {
    const result = coverage([
      { status: 'not' },
      { status: 'learning' },
      { status: 'revised' },
      { status: 'mastered' },
    ]);
    expect(result).toMatchObject({ total: 4, covered: 2, percent: 50 });
    expect(coverage([]).percent).toBe(0);
  });
});

describe('auto-scheduling', () => {
  it('suggests the highest-priority work first and never overfills a day', () => {
    const load = new DayLoad();
    const blocks = planSuggestions({
      profile,
      today: WED,
      start: WED,
      load,
      homework: [
        {
          id: 'hw1',
          subject: 'science',
          title: 'Lab report',
          due: '2026-11-20',
          mins: 60,
          difficulty: 2,
          weight: 5,
          done: false,
        },
        {
          id: 'hw2',
          subject: 'maths',
          title: 'Already planned',
          due: '2026-11-20',
          mins: 30,
          difficulty: 1,
          weight: 5,
          done: false,
        },
      ],
      exams: [
        {
          id: 'e',
          name: 'Test',
          date: '2026-11-21',
          weight: 50,
          chapterKeys: ['maths-1', 'maths-2', 'maths-3'],
        },
      ],
      chapters: [
        chapter('maths-1'),
        chapter('maths-2', { status: 'mastered' }),
        chapter('maths-3', { status: 'learning' }),
      ],
      plannedHomeworkIds: new Set(['hw2']),
      plannedChapterDates: new Map(),
    });
    expect(blocks.map((block) => block.homeworkId ?? block.chapterKey)).toEqual([
      'maths-1',
      'maths-3',
      'hw1',
    ]);
    for (const block of blocks) expect(block.date <= block.deadline).toBe(true);
    for (const date of [WED, THU, '2026-11-20'])
      expect(load.planned(date, true)).toBeLessThanOrEqual(limitFor(profile, date));
  });
});

describe('habits', () => {
  it('counts a streak through rest and exam days, from yesterday if today is empty', () => {
    const states: Record<string, DayState> = {
      '2026-11-17': 'study',
      '2026-11-16': 'rest',
      '2026-11-15': 'exam',
      '2026-11-14': 'study',
      '2026-11-13': 'missed',
    };
    const stateOf = (date: string) => states[date] ?? null;
    expect(streak(stateOf, WED)).toBe(4);
    expect(streak((date) => (date === WED ? 'study' : stateOf(date)), WED)).toBe(5);
  });

  it('packs the bag from the timetable and homework due', () => {
    expect(nextSchoolDay('2026-11-21')).toBe('2026-11-23');
    const items = bagFor(THU, [{ id: 'abc', title: 'Essay' }]);
    const ids = items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['maths', 'geo', 'lab', 'hw-abc', 'id', 'water']));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
