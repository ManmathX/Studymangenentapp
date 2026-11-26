import { consecutiveDates, datesheetSections, defaultChapterKeys, kindOf, suggestedSeriesName } from '../datesheet';

const chapters = [1, 2, 3, 4, 5].map((n) => ({ key: `maths-${n}`, name: `Ch ${n}` }));
const taught = (chapter) => ['maths-1', 'maths-3'].includes(chapter.key);

describe('datesheet helpers', () => {
  it('starts each kind of exam with a sensible syllabus', () => {
    expect(defaultChapterKeys(kindOf('unit'), chapters, taught)).toEqual(['maths-1', 'maths-3']);
    expect(defaultChapterKeys(kindOf('unit'), chapters, () => false)).toEqual(['maths-1', 'maths-2']);
    expect(defaultChapterKeys(kindOf('halfYearly'), chapters, taught)).toEqual(['maths-1', 'maths-2', 'maths-3']);
    expect(defaultChapterKeys(kindOf('final'), chapters, taught)).toHaveLength(5);
  });

  it('numbers unit tests and leaves other exams for the student to name', () => {
    expect(suggestedSeriesName('unit', [])).toBe('Unit test 1');
    expect(suggestedSeriesName('unit', ['Unit test 1', 'Half-yearly'])).toBe('Unit test 2');
    expect(suggestedSeriesName('halfYearly')).toBe('Half-yearly');
    expect(suggestedSeriesName('other')).toBe('');
  });

  it('lays papers on back-to-back days, skipping Sundays', () => {
    // 2026-11-28 is a Saturday.
    expect(consecutiveDates('2026-11-28', 3)).toEqual(['2026-11-28', '2026-11-30', '2026-12-01']);
    expect(consecutiveDates('2026-11-28', 2, { skipSundays: false })).toEqual(['2026-11-28', '2026-11-29']);
  });

  it('sorts exams into unit tests, term exams and other exams, grouped by series in date order', () => {
    const exams = [
      { id: 'a', subject: 'maths', date: '2026-12-03', series: 'Unit test 1', kind: 'unit' },
      { id: 'b', subject: 'science', date: '2026-12-02', series: 'Unit test 1', kind: 'unit' },
      { id: 'c', subject: 'maths', date: '2027-01-10', series: 'Half-yearly', kind: 'halfYearly' },
      { id: 'd', subject: 'maths', date: '2026-12-20', series: null, kind: null },
      { id: 'e', subject: 'maths', date: '2026-12-15', series: 'Olympiad', kind: 'other' },
    ];
    const [unit, term, other] = datesheetSections(exams);
    expect(unit.groups).toHaveLength(1);
    expect(unit.groups[0]).toMatchObject({ title: 'Unit test 1', from: '2026-12-02', to: '2026-12-03' });
    expect(unit.groups[0].exams.map((exam) => exam.id)).toEqual(['b', 'a']);
    expect(term.groups.map((group) => group.title)).toEqual(['Half-yearly']);
    expect(other.groups.map((group) => group.title)).toEqual(['Olympiad', 'Single tests']);
  });
});
