import { addDays } from '../dates';
import { DayLoad, limitFor } from '../engine';
import { EXAM_PREP_DAYS, examStepsFor, planExamSlots, summarizeSlots } from '../examPlan';

const profile = { dailyLimitMins: 180, ageMode: 'deeper', examSeason: false, tuitionDays: [1, 3, 5], schoolStart: 465, schoolEnd: 825 };
const TODAY = '2026-11-18';
const chapter = (key, status, subject = 'maths') => ({ key, subject, name: `Chapter ${key}`, difficulty: 2, status, learnedOn: null, revisions: 0, snoozedUntil: null });
const exam = (date, chapterKeys) => ({ id: 'exam-1', subject: 'maths', name: 'Unit test 3', date, weight: 20, chapterKeys });

function plan({ testDate = '2026-11-28', chapters = [chapter('maths-1', 'not'), chapter('maths-2', 'learning')], load = new DayLoad(), start = TODAY, skip } = {}) {
  return planExamSlots({ exam: exam(testDate, chapters.map((item) => item.key)), chapters, profile, load, today: TODAY, start, skipChapterKeys: skip });
}

describe('unit test slots', () => {
  it('gives each chapter self study, homework and revision in that order, all before the test', () => {
    const { blocks, reason } = plan();
    expect(reason).toBeNull();
    const forChapter = (key) => blocks.filter((block) => block.chapterKey === key);
    expect(forChapter('maths-1').map((block) => block.kind)).toEqual(['study', 'homework', 'revision']);
    expect(forChapter('maths-2').map((block) => block.kind)).toEqual(['homework', 'revision']);
    for (const key of ['maths-1', 'maths-2']) {
      const dates = forChapter(key).map((block) => block.date);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(dates.length);
    }
    for (const block of blocks) {
      expect(block.date >= TODAY && block.date < '2026-11-28').toBe(true);
      expect(block).toMatchObject({ examId: 'exam-1', deadline: '2026-11-27', why: 'Unit test 3 on Sat 28 Nov' });
    }
  });

  it('puts revision in the second half and a whole-test revision the day before', () => {
    const { blocks } = plan();
    const chapterRevisions = blocks.filter((block) => block.kind === 'revision' && block.chapterKey);
    for (const block of chapterRevisions) expect(block.date >= '2026-11-22').toBe(true);
    const whole = blocks.find((block) => block.chapterKey === null);
    expect(whole).toMatchObject({ kind: 'revision', date: '2026-11-27', title: 'Revision: all chapters for Unit test 3', mins: 30 });
  });

  it('plans less for chapters that are further along', () => {
    expect(examStepsFor(chapter('x', 'not')).map((step) => step.kind)).toEqual(['study', 'homework', 'revision']);
    expect(examStepsFor(chapter('x', 'revised')).map((step) => step.kind)).toEqual(['homework', 'revision']);
    expect(examStepsFor(chapter('x', 'mastered'))).toEqual([{ kind: 'revision', mins: 15, title: 'Revision: quick recap' }]);
    expect(examStepsFor(chapter('x', 'not', 'english'))[1].title).toBe('Homework: textbook questions');
  });

  it('starts preparing at most two weeks before a far-away test', () => {
    const testDate = addDays(TODAY, 40);
    const { blocks } = plan({ testDate });
    for (const block of blocks) expect(block.date >= addDays(testDate, -EXAM_PREP_DAYS)).toBe(true);
  });

  it('keeps every day within its limit while there is room', () => {
    const load = new DayLoad();
    const chapters = ['1', '2', '3', '4', '5', '6'].map((n) => chapter(`maths-${n}`, 'not'));
    plan({ chapters, load });
    for (let offset = 0; offset < 10; offset += 1) {
      const date = addDays(TODAY, offset);
      expect(load.planned(date, true)).toBeLessThanOrEqual(limitFor(profile, date));
    }
  });

  it('still plans everything when days are full, on the least busy days', () => {
    const load = new DayLoad();
    for (let offset = 0; offset < 10; offset += 1) load.add({ date: addDays(TODAY, offset), mins: 300, status: 'accepted' });
    load.add({ date: '2026-11-22', mins: -200, status: 'accepted' });
    const { blocks } = plan({ load });
    expect(blocks).toHaveLength(6);
    expect(blocks.find((block) => block.kind === 'study').date).toBe('2026-11-22');
  });

  it('says there is no time when the test is too close', () => {
    expect(plan({ testDate: '2026-11-19', start: '2026-11-19' })).toEqual({ blocks: [], reason: 'NO_TIME' });
    const tomorrow = plan({ testDate: '2026-11-19' });
    expect(tomorrow.blocks.every((block) => block.date === TODAY)).toBe(true);
  });

  it('leaves out chapters that are already planned', () => {
    const { blocks } = plan({ skip: new Set(['maths-1']) });
    expect(blocks.some((block) => block.chapterKey === 'maths-1')).toBe(false);
    expect(blocks.filter((block) => block.chapterKey === 'maths-2')).toHaveLength(2);
  });

  it('summarises slots for the confirmation message', () => {
    const { blocks } = plan();
    expect(summarizeSlots(blocks)).toEqual({ added: 6, firstDate: TODAY, counts: { study: 1, homework: 2, revision: 3 }, reason: null });
  });
});
