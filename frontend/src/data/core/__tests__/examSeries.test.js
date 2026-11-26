import { addDays, diffDays, eachDay, weekday } from '../dates';
import { DayLoad } from '../engine';
import { prepCapacity } from '../examPlan';
import { planSeriesSlots } from '../examSeries';
import { catalogChapters } from '../syllabus';
import { EXAM_SERIES } from '../types';

const profile = { dailyLimitMins: 180, ageMode: 'deeper', examSeason: false, tuitionDays: [1, 3, 5], schoolStart: 465, schoolEnd: 825 };
const TODAY = '2026-11-18';

/** Class 9 chapters: the first half of each subject taught (learning), the rest not started. */
function classChapters() {
  return catalogChapters(9).map((chapter, position) => {
    const index = Number(chapter.key.split('-')[1]);
    return { ...chapter, position, status: index <= 4 ? 'learning' : 'not', learnedOn: null, revisions: 0, snoozedUntil: null };
  });
}

/** One paper per subject on back-to-back days (no Sundays); a half-yearly covers the first half of each syllabus, a final all of it. */
function halfYearly(firstPaper = '2026-12-14', chapters = classChapters(), type = 'halfYearly') {
  const subjects = ['maths', 'science', 'sst', 'english', 'hindi'];
  const dates = [];
  for (let date = firstPaper; dates.length < subjects.length; date = addDays(date, 1)) if (weekday(date) !== 0) dates.push(date);
  return subjects.map((subject, index) => {
    const own = chapters.filter((chapter) => chapter.subject === subject).map((chapter) => chapter.key);
    return {
      id: `paper-${subject}`,
      subject,
      name: `${EXAM_SERIES[type].label}: ${subject}`,
      date: dates[index],
      weight: EXAM_SERIES[type].weight,
      chapterKeys: type === 'final' ? own : own.slice(0, Math.ceil(own.length / 2)),
    };
  });
}

function plan({ papers = halfYearly(), chapters = classChapters(), studyProfile = profile, load = new DayLoad() } = {}) {
  const prepFrom = addDays(papers[0].date, -EXAM_SERIES.halfYearly.prepDays);
  return { papers, load, ...planSeriesSlots({ papers, chapters, profile: studyProfile, load, today: TODAY, start: TODAY, prepFrom }) };
}

const chapterBlocks = (blocks) => blocks.filter((block) => block.chapterKey);

describe('half-yearly and final exam plan', () => {
  it('plans every chapter before its paper, in order, with revision in the second half', () => {
    const { blocks, papers, unplaced } = plan();
    expect(unplaced).toBe(0);
    const paperOf = Object.fromEntries(papers.map((paper) => [paper.id, paper]));
    const prepStart = TODAY;
    for (const paper of papers) {
      for (const key of paper.chapterKeys) {
        const steps = blocks.filter((block) => block.chapterKey === key);
        expect(steps.length).toBeGreaterThan(0);
        const dates = steps.map((block) => block.date);
        expect([...dates].sort()).toEqual(dates); // self study, then homework, then revision
        expect(dates.at(-1) <= addDays(paper.date, -2)).toBe(true);
        const revision = steps.find((block) => block.kind === 'revision');
        expect(revision.date >= addDays(prepStart, Math.floor(diffDays(prepStart, paper.date) / 2))).toBe(true);
      }
    }
    for (const block of blocks) expect(block.date < paperOf[block.examId].date).toBe(true);
  });

  it('keeps the evening before each paper for revising that whole subject', () => {
    const { blocks, papers } = plan();
    for (const paper of papers) {
      const whole = blocks.filter((block) => block.examId === paper.id && !block.chapterKey);
      expect(whole).toEqual([expect.objectContaining({ date: addDays(paper.date, -1), kind: 'revision', mins: expect.any(Number) })]);
      expect(whole[0].title).toBe(`Revision: all chapters for ${paper.name}`);
    }
  });

  it('mixes subjects every day and never spends a day or a week on one chapter or subject', () => {
    const { blocks } = plan();
    const work = chapterBlocks(blocks);
    const days = [...new Set(work.map((block) => block.date))].sort();
    for (const date of days) {
      const today = work.filter((block) => block.date === date);
      const chapters = today.map((block) => block.chapterKey);
      expect(new Set(chapters).size).toBe(chapters.length); // at most one step per chapter a day
      const perSubject = {};
      for (const block of today) perSubject[block.subject] = (perSubject[block.subject] ?? 0) + 1;
      expect(Math.max(...Object.values(perSubject))).toBeLessThanOrEqual(2);
    }
    // Over any week of preparation, at least three subjects get time.
    for (const start of eachDay(TODAY, '2026-12-05')) {
      const week = work.filter((block) => block.date >= start && block.date <= addDays(start, 6));
      expect(new Set(week.map((block) => block.subject)).size).toBeGreaterThanOrEqual(3);
    }
    // No chapter is worked on for more than three days in total.
    const daysPerChapter = {};
    for (const block of work) daysPerChapter[block.chapterKey] = (daysPerChapter[block.chapterKey] ?? 0) + 1;
    expect(Math.max(...Object.values(daysPerChapter))).toBeLessThanOrEqual(3);
  });

  it('never goes over the Test prep time on any day', () => {
    const { load } = plan();
    for (const date of eachDay(TODAY, '2026-12-17')) expect(load.planned(date, true)).toBeLessThanOrEqual(prepCapacity(profile, date));
  });

  it('plans a whole-syllabus final and reports what cannot fit instead of overloading days', () => {
    const chapters = classChapters();
    const papers = halfYearly('2026-12-14', chapters, 'final');
    const tight = { ...profile, ageMode: 'simple', homeworkMins: 60 }; // 60 min of Test prep a day
    const { blocks, unplaced, load } = plan({ papers, chapters, studyProfile: tight });
    expect(blocks.length).toBeGreaterThan(0);
    expect(unplaced).toBeGreaterThan(0);
    for (const date of eachDay(TODAY, '2026-12-17')) expect(load.planned(date, true)).toBeLessThanOrEqual(prepCapacity(tight, date));
  });

  it('works around time already planned', () => {
    const load = new DayLoad();
    for (const date of eachDay(TODAY, '2026-11-24')) load.add({ date, mins: 500, status: 'accepted' });
    const { blocks } = plan({ load });
    expect(blocks.every((block) => block.date > '2026-11-24')).toBe(true);
  });

  it('says there is no time when the first paper is tomorrow evening', () => {
    const papers = halfYearly('2026-11-19').slice(0, 1);
    const result = planSeriesSlots({ papers, chapters: classChapters(), profile, load: new DayLoad(), today: TODAY, start: '2026-11-19', prepFrom: '2026-10-22' });
    expect(result).toEqual({ blocks: [], unplaced: 0, reason: 'NO_TIME' });
  });
});
