/**
 * Spreadsheet import and export of a syllabus. One row per unit, chapter, topic or subtopic;
 * the row's deepest filled-in name column says which node it is, and its other columns set that
 * node's details. Parents are created from the names on the way down, so a sheet can be as
 * simple as "subject, chapter" rows.
 *
 *   level, subject, unit, chapter, topic, subtopic,
 *   difficulty, weightage, marks, priority, important, grade, book
 */
import {
  NAME_MAX,
  PRIORITIES,
  type ChapterNode,
  type ExamRecord,
  type SubjectContent,
  type TopicNode,
  type UnitNode,
} from './catalog.types.js';
import { sameName } from './syllabus-tree.js';

export const CSV_COLUMNS = [
  'level',
  'subject',
  'unit',
  'chapter',
  'topic',
  'subtopic',
  'difficulty',
  'weightage',
  'marks',
  'priority',
  'important',
  'grade',
  'book',
] as const;
type Column = (typeof CSV_COLUMNS)[number];

export interface CsvProblem {
  row: number;
  message: string;
}

/* ---------- Reading and writing CSV text ---------- */

/** RFC 4180 CSV: commas, double-quoted fields with "" escapes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const quote = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

/* ---------- Syllabus → rows ---------- */

const numberText = (value: number | undefined) => (value === undefined ? '' : String(value));

export function syllabusToCsv(subjects: SubjectContent[]): string {
  const rows: string[][] = [[...CSV_COLUMNS]];
  const line = (cells: Partial<Record<Column, string>>) =>
    rows.push(CSV_COLUMNS.map((column) => cells[column] ?? ''));
  for (const subject of subjects) {
    const base = { level: subject.level, subject: subject.name };
    if (!subject.units.length) line(base);
    for (const unit of subject.units) {
      const inUnit = { ...base, unit: unit.name };
      if (unit.name)
        line({
          ...inUnit,
          weightage: numberText(unit.weightage),
          marks: numberText(unit.marks),
        });
      for (const chapter of unit.chapters) {
        const inChapter = { ...inUnit, chapter: chapter.name };
        line({
          ...inChapter,
          difficulty: String(chapter.difficulty),
          weightage: numberText(chapter.weightage),
          marks: numberText(chapter.marks),
          priority: chapter.priority ?? '',
          important: chapter.important ? 'yes' : '',
          grade: numberText(chapter.grade),
          book: chapter.book ?? '',
        });
        for (const topic of chapter.topics) {
          const inTopic = { ...inChapter, topic: topic.name };
          line({
            ...inTopic,
            weightage: numberText(topic.weightage),
            marks: numberText(topic.marks),
            priority: topic.priority ?? '',
            important: topic.important ? 'yes' : '',
          });
          for (const subtopic of topic.subtopics)
            line({
              ...inTopic,
              subtopic: subtopic.name,
              important: subtopic.important ? 'yes' : '',
            });
        }
      }
    }
  }
  return toCsv(rows);
}

/* ---------- Rows → syllabus ---------- */

export interface ParsedCsv {
  subjects: SubjectContent[];
  /** For each node, the detail columns its rows filled in (merges only overwrite those). */
  explicit: WeakMap<object, Set<string>>;
  problems: CsvProblem[];
}

const DIFFICULTY: Record<string, 1 | 2 | 3> = {
  '1': 1,
  '2': 2,
  '3': 3,
  easy: 1,
  medium: 2,
  hard: 3,
};
const YES = new Set(['yes', 'y', 'true', '1', '★', '*', 'x']);
const NO = new Set(['no', 'n', 'false', '0', '']);

/**
 * Reads a syllabus sheet for `exam`. Levels may be given by key or name. Rows that
 * can't be read are reported with their row number (the header is row 1).
 */
export function csvToSyllabus(text: string, exam: ExamRecord): ParsedCsv {
  const problems: CsvProblem[] = [];
  const explicit = new WeakMap<object, Set<string>>();
  const subjects: SubjectContent[] = [];
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (!rows.length)
    return { subjects, explicit, problems: [{ row: 1, message: 'The file is empty' }] };

  const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
  const unknown = header.filter(
    (name) => name && !(CSV_COLUMNS as readonly string[]).includes(name),
  );
  if (unknown.length)
    problems.push({
      row: 1,
      message: `Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
    });
  if (!header.includes('subject'))
    problems.push({ row: 1, message: 'The sheet needs a "subject" column' });
  if (problems.length) return { subjects, explicit, problems };
  const at = (row: string[], column: Column) => {
    const index = header.indexOf(column);
    return index === -1 ? '' : (row[index] ?? '').trim();
  };

  const levels = exam.structure.levels;

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const fail = (message: string) => problems.push({ row: rowNumber, message });

    const levelText = at(row, 'level');
    let level = '';
    if (levels.length) {
      const found = levels.find((item) => item.key === levelText || sameName(item.name, levelText));
      if (!found)
        return fail(
          levelText
            ? `Unknown ${exam.structure.levelLabel.toLowerCase()} "${levelText}"`
            : `Fill in the ${exam.structure.levelLabel.toLowerCase()}`,
        );
      level = found.key;
    } else if (levelText) return fail(`${exam.name} has no levels; leave "level" empty`);

    const names = {
      subject: at(row, 'subject'),
      unit: at(row, 'unit'),
      chapter: at(row, 'chapter'),
      topic: at(row, 'topic'),
      subtopic: at(row, 'subtopic'),
    };
    if (!names.subject) return fail('Fill in the subject');
    if (names.subtopic && !names.topic) return fail('A subtopic needs its topic');
    if ((names.topic || names.subtopic) && !names.chapter) return fail('A topic needs its chapter');
    const tooLong = (
      [
        ['subject', NAME_MAX.subject],
        ['unit', NAME_MAX.unit],
        ['chapter', NAME_MAX.chapter],
        ['topic', NAME_MAX.topic],
        ['subtopic', NAME_MAX.subtopic],
      ] as const
    ).find(([column, max]) => names[column].length > max);
    if (tooLong) return fail(`The ${tooLong[0]} name is longer than ${tooLong[1]} characters`);

    // Detail columns, checked before anything is created.
    const details: Record<string, unknown> = {};
    const difficulty = at(row, 'difficulty').toLowerCase();
    if (difficulty) {
      if (!DIFFICULTY[difficulty]) return fail('Difficulty is 1–3 or easy / medium / hard');
      details.difficulty = DIFFICULTY[difficulty];
    }
    for (const column of ['weightage', 'marks'] as const) {
      const value = at(row, column).replace(/%$/, '');
      if (!value) continue;
      const number = Number(value);
      const max = column === 'weightage' ? 100 : 1000;
      if (!Number.isFinite(number) || number < 0 || number > max)
        return fail(
          `${column === 'weightage' ? 'Weightage' : 'Marks'} must be a number from 0 to ${max}`,
        );
      details[column] = number;
    }
    const priority = at(row, 'priority').toLowerCase();
    if (priority) {
      if (!(PRIORITIES as readonly string[]).includes(priority))
        return fail('Priority is high, medium or low');
      details.priority = priority;
    }
    const important = at(row, 'important').toLowerCase();
    if (important) {
      if (!YES.has(important) && !NO.has(important)) return fail('Important is yes or no');
      details.important = YES.has(important);
    }
    const grade = at(row, 'grade');
    if (grade) {
      const number = Number(grade);
      if (!Number.isInteger(number) || number < 1 || number > 12)
        return fail('Class must be 1 to 12');
      details.grade = number;
    }
    const book = at(row, 'book');
    if (book) {
      if (book.length > NAME_MAX.book)
        return fail(`The book name is longer than ${NAME_MAX.book} characters`);
      details.book = book;
    }

    const kind = names.subtopic
      ? 'subtopic'
      : names.topic
        ? 'topic'
        : names.chapter
          ? 'chapter'
          : names.unit
            ? 'unit'
            : 'subject';
    const allowed: Record<typeof kind, string[]> = {
      subject: [],
      unit: ['weightage', 'marks'],
      chapter: ['difficulty', 'weightage', 'marks', 'priority', 'important', 'grade', 'book'],
      topic: ['weightage', 'marks', 'priority', 'important'],
      subtopic: ['important'],
    };
    const misplaced = Object.keys(details).filter((key) => !allowed[kind].includes(key));
    if (misplaced.length) return fail(`${misplaced.join(', ')} can't be set on a ${kind}`);

    // Find or create the path down to the row's node.
    let subject = subjects.find((s) => s.level === level && sameName(s.name, names.subject));
    if (!subject) {
      subject = { level, subjectId: '', name: names.subject, color: '', units: [] };
      subjects.push(subject);
    }
    if (kind === 'subject') return note(subject, details);
    let unit = subject.units.find((u) => sameName(u.name, names.unit));
    if (!unit) {
      unit = { name: names.unit, chapters: [] };
      subject.units.push(unit);
    }
    if (kind === 'unit') return note(unit, details);
    let chapter = unit.chapters.find((c) => sameName(c.name, names.chapter));
    if (!chapter) {
      chapter = { name: names.chapter, difficulty: 2, important: false, topics: [] };
      unit.chapters.push(chapter);
    }
    if (kind === 'chapter') return note(chapter, details);
    let topic = chapter.topics.find((t) => sameName(t.name, names.topic));
    if (!topic) {
      topic = { name: names.topic, important: false, subtopics: [] };
      chapter.topics.push(topic);
    }
    if (kind === 'topic') return note(topic, details);
    let subtopic = topic.subtopics.find((s) => sameName(s.name, names.subtopic));
    if (!subtopic) {
      subtopic = { name: names.subtopic, important: false };
      topic.subtopics.push(subtopic);
    }
    note(subtopic, details);
  });

  function note(
    node: SubjectContent | UnitNode | ChapterNode | TopicNode | object,
    details: Record<string, unknown>,
  ) {
    Object.assign(node, details);
    const set = explicit.get(node) ?? new Set<string>();
    for (const key of Object.keys(details)) set.add(key);
    explicit.set(node, set);
  }

  return { subjects, explicit, problems };
}
