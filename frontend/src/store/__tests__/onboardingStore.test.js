import { chosenSubjects, examChosen, MAX_CUSTOM_SUBJECTS, useOnboardingStore } from '../onboardingStore';

const store = () => useOnboardingStore.getState();
const draft = () => store().draft;
const SYLLABUS = [
  { id: 'maths', name: 'Maths', color: '#007AFF', chapters: [{ key: 'maths-1', name: 'Number Systems', difficulty: 2 }] },
  { id: 'science', name: 'Science', color: '#34C759', chapters: [{ key: 'science-1', name: 'Matter', difficulty: 1 }] },
];

beforeEach(() => store().reset());

describe('subjects added during setup', () => {
  it('adds a subject with its own id, colour and chapter keys, next to the catalogue', () => {
    const saved = store().saveCustomSubject({ name: 'Sanskrit', chapters: ['Sandhi', 'Samasa'] });
    expect(saved).toMatchObject({ id: 'custom1', name: 'Sanskrit', chapters: ['Sandhi', 'Samasa'] });
    expect(saved.color).toMatch(/^#[0-9A-F]{6}$/i);

    store().toggleSubject('science');
    const chosen = chosenSubjects(draft(), SYLLABUS);
    expect(chosen.map((subject) => subject.id)).toEqual(['maths', 'custom1']);
    expect(chosen[1].chapters.map((chapter) => chapter.key)).toEqual(['custom1-1', 'custom1-2']);
  });

  it('keeps ticks and tests when only the name changes, and drops them when chapters change', () => {
    store().saveCustomSubject({ name: 'Sanskrit', chapters: ['Sandhi', 'Samasa'] });
    store().toggleTaught('custom1-1');
    store().addExam({ id: 'draft-1', subject: 'custom1', name: 'Unit test', date: '2026-12-01', weight: 20, chapterKeys: ['custom1-1'] });

    store().saveCustomSubject({ id: 'custom1', name: 'Sanskrit II', chapters: ['Sandhi', 'Samasa'] });
    expect(draft().taught).toEqual({ 'custom1-1': true });
    expect(draft().exams).toHaveLength(1);

    store().saveCustomSubject({ id: 'custom1', name: 'Sanskrit II', chapters: ['Karaka'] });
    expect(draft().customSubjects[0]).toMatchObject({ id: 'custom1', name: 'Sanskrit II', chapters: ['Karaka'] });
    expect(draft().taught).toEqual({});
    expect(draft().exams).toEqual([]);
  });

  it('removes a subject with everything that pointed at it, and reuses the freed id cleanly', () => {
    store().saveCustomSubject({ name: 'Sanskrit', chapters: ['Sandhi'] });
    store().saveCustomSubject({ name: 'Computer', chapters: ['Python'] });
    store().toggleTaught('custom1-1');
    store().removeCustomSubject('custom1');
    expect(draft().customSubjects.map((subject) => subject.id)).toEqual(['custom2']);
    expect(draft().taught).toEqual({});
    expect(store().saveCustomSubject({ name: 'Odia', chapters: ['Kabita'] }).id).toBe('custom1');
  });

  it(`stops at ${MAX_CUSTOM_SUBJECTS} added subjects`, () => {
    for (let n = 0; n < MAX_CUSTOM_SUBJECTS; n += 1) store().saveCustomSubject({ name: `Subject ${n}`, chapters: ['One'] });
    expect(store().saveCustomSubject({ name: 'One too many', chapters: ['One'] })).toBeNull();
    expect(draft().customSubjects).toHaveLength(MAX_CUSTOM_SUBJECTS);
  });

  it('starts subjects over when the exam or level changes, but keeps added subjects', () => {
    const cbse = { code: 'cbse', name: 'CBSE', shortName: 'CBSE', category: 'school-boards', levelLabel: 'Class', unitLabel: 'Unit', levels: [{ key: '9', name: 'Class 9', grade: 9 }] };
    const jee = { code: 'jee-main', name: 'JEE Main', shortName: 'JEE Main', category: 'engineering', levelLabel: 'Level', unitLabel: 'Unit', levels: [] };
    store().setExam(cbse);
    expect(examChosen(draft())).toBe(false);
    store().setLevel(cbse.levels[0]);
    expect(draft()).toMatchObject({ board: 'cbse', cls: 9, level: { key: '9', name: 'Class 9', grade: 9 } });
    expect(examChosen(draft())).toBe(true);
    store().saveCustomSubject({ name: 'Sanskrit', chapters: ['Sandhi'] });
    store().toggleSubject('maths');
    store().setExam(jee);
    expect(draft()).toMatchObject({ board: 'jee-main', boardName: 'JEE Main', cls: null, level: null, turnedOff: [], exam: { hasLevels: false } });
    // One syllabus for everyone: nothing more to pick.
    expect(examChosen(draft())).toBe(true);
    expect(draft().customSubjects).toHaveLength(1);
  });
});

describe('editing a test during setup', () => {
  it('replaces the test with the same id', () => {
    store().addExam({ id: 'draft-1', subject: 'maths', name: 'PT 1', date: '2026-12-01', weight: 20, chapterKeys: ['maths-1'] });
    store().addExam({ id: 'draft-2', subject: 'science', name: 'PT 2', date: '2026-12-02', weight: 20, chapterKeys: ['science-1'] });
    store().updateExam({ id: 'draft-1', subject: 'maths', name: 'Periodic test 1', date: '2026-12-03', weight: 20, chapterKeys: ['maths-1'] });
    expect(draft().exams.map((exam) => [exam.id, exam.name, exam.date])).toEqual([
      ['draft-1', 'Periodic test 1', '2026-12-03'],
      ['draft-2', 'PT 2', '2026-12-02'],
    ]);
  });
});

describe('datesheet drafted during setup', () => {
  it('adds a whole exam at once and replaces it when edited', () => {
    const paper = (id, subject) => ({ id, subject, name: `Unit test 1: ${subject}`, date: '2026-12-01', weight: 10, chapterKeys: [`${subject}-1`], series: 'Unit test 1', kind: 'unit' });
    store().saveSeries([paper('draft-1', 'maths'), paper('draft-2', 'science')]);
    expect(draft().exams.map((exam) => exam.id)).toEqual(['draft-1', 'draft-2']);

    store().saveSeries([paper('draft-3', 'maths')], ['draft-1', 'draft-2']);
    expect(draft().exams.map((exam) => exam.id)).toEqual(['draft-3']);

    store().removeExams(['draft-3']);
    expect(draft().exams).toEqual([]);
  });
});
