/**
 * The exam catalogue: categories, exams (school boards and competitive exams), and versioned
 * syllabi. Every exam uses one spine,
 *
 *   Exam → Level? → Subject → Unit? → Chapter → Topic? → Subtopic?
 *
 * and its `structure` says which optional parts it uses and what they are called. Subjects and
 * chapters always exist because the app's on-device planner schedules chapters of subjects.
 */

export const CATEGORY_GROUPS = ['board', 'exam'] as const;
/** `board`: school boards (CBSE, ICSE, state boards). `exam`: competitive and entrance exams. */
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const REGIONS = ['national', 'state', 'international'] as const;
export type Region = (typeof REGIONS)[number];

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const VERSION_STATUSES = ['draft', 'published', 'archived'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** Exam and category codes share the board-code rule, so codes already on phones stay valid. */
export const CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
/** Level keys: `10`, `prelims`, `mains`. */
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;
/** `2026-27` (school year, April to March) or `2027` (an exam held once a year). */
export const ACADEMIC_YEAR_PATTERN = /^20\d{2}(-\d{2})?$/;
export const SETTING_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/;

export const LIMITS = {
  categories: 50,
  levels: 20,
  languages: 30,
  settings: 30,
  targetGrades: 12,
  subjectsPerLevel: 40,
  unitsPerSubject: 40,
  chaptersPerSubject: 150,
  topicsPerChapter: 80,
  subtopicsPerTopic: 50,
  nodesPerSubject: 4000,
  logoBytes: 200 * 1024,
} as const;

export const NAME_MAX = {
  exam: 80,
  shortName: 16,
  category: 60,
  level: 40,
  subject: 60,
  unit: 120,
  chapter: 120,
  topic: 160,
  subtopic: 160,
  book: 60,
} as const;

export interface CategoryRecord {
  code: string;
  name: string;
  description: string;
  group: CategoryGroup;
  position: number;
  isActive: boolean;
}

export interface ExamLevel {
  key: string;
  name: string;
  /** School class 1–12 when the level is a class. Classes become the app's `cls`. */
  grade?: number;
}

export interface ExamStructure {
  /** What a level is called: Class, Stage, Paper… */
  levelLabel: string;
  /** Empty when the exam has one syllabus for everyone (JEE, NEET). */
  levels: ExamLevel[];
  useUnits: boolean;
  /** What a unit is called: Unit, Section, Book… */
  unitLabel: string;
  useTopics: boolean;
  useSubtopics: boolean;
}

export type SettingValue = string | number | boolean;

export interface LogoInfo {
  sha: string;
  contentType: string;
  size: number;
}

export interface ExamRecord {
  code: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  color: string;
  logo: LogoInfo | null;
  conductingBody: string;
  region: Region;
  /** For state boards and state exams, e.g. "Odisha". */
  state: string;
  eligibility: string;
  /** Classes the exam is meant for, e.g. [11, 12] for JEE. */
  targetGrades: number[];
  structure: ExamStructure;
  languages: string[];
  isActive: boolean;
  position: number;
  /** Exam-specific configuration as flat key/value pairs. */
  settings: Record<string, SettingValue>;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Syllabus tree ---------- */

export interface SubtopicNode {
  name: string;
  important: boolean;
}

export interface TopicNode {
  name: string;
  important: boolean;
  weightage?: number;
  marks?: number;
  priority?: Priority;
  subtopics: SubtopicNode[];
}

export interface ChapterNode {
  name: string;
  /** 1 easy, 2 medium, 3 hard. Drives the planner's priority on the phone. */
  difficulty: 1 | 2 | 3;
  /** The textbook the chapter is in, e.g. "Ganita Prakash – Part 1". */
  book?: string;
  important: boolean;
  /** Share of the exam, in percent. */
  weightage?: number;
  marks?: number;
  priority?: Priority;
  /** For exams without class levels: the class the chapter is taught in (JEE: 11 or 12). */
  grade?: number;
  topics: TopicNode[];
}

export interface UnitNode {
  /** Empty for chapters that are not in a named unit (exams that don't use units). */
  name: string;
  weightage?: number;
  marks?: number;
  chapters: ChapterNode[];
}

export interface NodeCounts {
  units: number;
  chapters: number;
  topics: number;
  subtopics: number;
}

export interface VersionCounts extends NodeCounts {
  subjects: number;
}

export interface SyllabusVersionRecord {
  id: string;
  exam: string;
  academicYear: string;
  version: number;
  status: VersionStatus;
  title: string;
  notes: string;
  counts: VersionCounts;
  publishedAt: string | null;
  publishedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusSubjectRecord {
  id: string;
  syllabus: string;
  exam: string;
  /** A key from the exam's levels, or '' when the exam has none. */
  level: string;
  subjectId: string;
  name: string;
  color: string;
  position: number;
  /** Goes up by one on every save; a save must name the revision it started from. */
  revision: number;
  counts: NodeCounts;
  units: UnitNode[];
  updatedAt: string;
}

/** A subject as it is created or imported, before it has an id. */
export interface SubjectContent {
  level: string;
  subjectId: string;
  name: string;
  color: string;
  units: UnitNode[];
}

export const emptyCounts = (): VersionCounts => ({
  subjects: 0,
  units: 0,
  chapters: 0,
  topics: 0,
  subtopics: 0,
});

export const DEFAULT_STRUCTURE: ExamStructure = {
  levelLabel: 'Class',
  levels: [],
  useUnits: false,
  unitLabel: 'Unit',
  useTopics: true,
  useSubtopics: false,
};

/** The school year a date falls in. Indian schools start the year in April. */
export function academicYearOf(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** `2026-27` must name consecutive years. */
export function isValidAcademicYear(value: string): boolean {
  if (!ACADEMIC_YEAR_PATTERN.test(value)) return false;
  const [first, second] = value.split('-');
  return second === undefined || (Number(first) + 1) % 100 === Number(second);
}

/** Classes 1–12 that are levels of this exam. */
export function gradesOf(structure: ExamStructure): number[] {
  return structure.levels.flatMap((level) => (level.grade ? [level.grade] : []));
}
