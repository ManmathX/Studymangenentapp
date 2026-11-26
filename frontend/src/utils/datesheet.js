import { addDays, weekdayOf } from './format';

/**
 * The kinds of exam a school datesheet is for. `chapters` picks which chapters each paper
 * starts with ticked: what has been taught, the first half of the syllabus, or all of it.
 */
export const EXAM_KINDS = [
  { value: 'unit', label: 'Unit test', weight: 10, chapters: 'taught' },
  { value: 'periodic', label: 'Periodic test', weight: 20, chapters: 'taught' },
  { value: 'halfYearly', label: 'Half-yearly', weight: 30, chapters: 'firstHalf' },
  { value: 'final', label: 'Final exam', weight: 50, chapters: 'all' },
  { value: 'other', label: 'Other', weight: 20, chapters: 'taught' },
];

export const OTHER_TESTS = 'Single tests';
const MAX_NAME = 80;

/** The datesheet's sections: unit tests, the big term exams, and everything else. */
export const DATESHEET_SECTIONS = [
  { value: 'unit', title: 'Unit tests', kinds: ['unit', 'periodic'], addKind: 'unit', addLabel: 'Add unit test', empty: 'No unit tests yet. Add UT 1 with its syllabus.' },
  { value: 'term', title: 'Half-yearly & final', kinds: ['halfYearly', 'final'], addKind: 'halfYearly', addLabel: 'Add half-yearly or final', empty: 'No half-yearly or final exam yet.' },
  { value: 'other', title: 'Other exams', kinds: ['other'], addKind: 'other', addLabel: 'Add other exam', empty: 'Olympiads, class tests, anything else.' },
];

export function kindOf(value) {
  return EXAM_KINDS.find((kind) => kind.value === value) ?? EXAM_KINDS[EXAM_KINDS.length - 1];
}

/**
 * A suggested name for a new exam of this kind: "Unit test 1", "Unit test 2"… counting the
 * ones already on the datesheet; the kind's label for the others; blank for "Other".
 */
export function suggestedSeriesName(kindValue, existingSeries = []) {
  const kind = kindOf(kindValue);
  if (kind.value === 'other') return '';
  if (kind.value !== 'unit' && kind.value !== 'periodic') return kind.label;
  const taken = new Set(existingSeries);
  for (let n = 1; ; n += 1) if (!taken.has(`${kind.label} ${n}`)) return `${kind.label} ${n}`;
}

/** Chapters ticked by default for one paper. A taught-only paper with nothing taught yet starts with the first two. */
export function defaultChapterKeys(kind, chapters, isTaught) {
  const keys = chapters.map((chapter) => chapter.key);
  if (kind.chapters === 'all') return keys;
  if (kind.chapters === 'firstHalf') return keys.slice(0, Math.ceil(keys.length / 2));
  const taught = chapters.filter(isTaught).map((chapter) => chapter.key);
  return taught.length ? taught : keys.slice(0, 2);
}

/** One date per paper from `first`, day after day, optionally skipping Sundays. */
export function consecutiveDates(first, count, { skipSundays = true } = {}) {
  const dates = [];
  for (let date = first; dates.length < count; date = addDays(date, 1)) {
    if (!(skipSundays && weekdayOf(date) === 0)) dates.push(date);
  }
  return dates;
}

export function paperName(series, subjectName) {
  return `${series}: ${subjectName}`.slice(0, MAX_NAME);
}

/** Which section a test belongs to. Tests added one at a time (no kind) go under "Other exams". */
export function sectionOf(exam) {
  return DATESHEET_SECTIONS.find((section) => section.kinds.includes(exam.kind))?.value ?? 'other';
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Tests grouped the way a school datesheet reads: one block per exam (series), papers in date
 * order, blocks ordered by their first paper. Tests without a series share a "Single tests" block.
 */
export function groupDatesheet(exams) {
  const groups = new Map();
  for (const exam of [...exams].sort(byDate)) {
    const title = exam.series || OTHER_TESTS;
    if (!groups.has(title)) groups.set(title, { title, series: exam.series || null, kind: exam.kind ?? null, exams: [] });
    groups.get(title).exams.push(exam);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    from: group.exams[0].date,
    to: group.exams[group.exams.length - 1].date,
  }));
}

/** Every section with its exams grouped, in datesheet order. Empty sections are kept so each can offer "Add". */
export function datesheetSections(exams) {
  return DATESHEET_SECTIONS.map((section) => ({
    ...section,
    groups: groupDatesheet(exams.filter((exam) => sectionOf(exam) === section.value)),
  }));
}
