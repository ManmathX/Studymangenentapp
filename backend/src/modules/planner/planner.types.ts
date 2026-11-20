import type { DateKey } from '../../common/utils/dates.js';
import type { SubjectId } from '../syllabus/syllabus.data.js';

export const CHAPTER_STATUSES = ['not', 'learning', 'revised', 'mastered'] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const TASK_KINDS = ['revision', 'practice', 'homework'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_STATUSES = ['accepted', 'suggested', 'skipped'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ['me', 'app', 'teacher', 'parent'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const AGE_MODES = ['simple', 'deeper'] as const;
export type AgeMode = (typeof AGE_MODES)[number];

/** Spaced-revision intervals in days after a chapter is learnt. */
export const REVISION_INTERVALS = [1, 7, 30] as const;

/** How far ahead (days, inclusive of today) the planner schedules chapter steps. */
export const PLANNING_HORIZON_DAYS = 13;

export interface PlannerProfile {
  dailyLimitMins: number;
  ageMode: AgeMode;
  examSeason: boolean;
  tuitionDays: number[];
  /** Minutes after midnight. */
  schoolStart: number;
  schoolEnd: number;
}

export interface LoadTask {
  date: DateKey;
  mins: number;
  status: TaskStatus;
}

export interface DayTask extends LoadTask {
  id: string;
  score: number;
  order: number;
}

export interface PlannerChapter {
  key: string;
  subject: SubjectId;
  name: string;
  difficulty: number;
  status: ChapterStatus;
  learnedOn: DateKey | null;
  revisions: number;
  snoozedUntil: DateKey | null;
}

export interface PlannerExam {
  id: string;
  name: string;
  date: DateKey;
  weight: number;
  chapterKeys: string[];
}

export interface PlannerHomework {
  id: string;
  subject: SubjectId;
  title: string;
  due: DateKey;
  mins: number;
  difficulty: number;
  weight: number;
  done: boolean;
}

export interface FixedBlock {
  start: number;
  end: number;
  label: string;
  kind: 'school' | 'rest' | 'tuition';
}

export interface StudyStep {
  title: string;
  mins: number;
  kind: TaskKind;
}

export interface SuggestedBlock {
  subject: SubjectId;
  title: string;
  kind: TaskKind;
  mins: number;
  date: DateKey;
  deadline: DateKey;
  score: number;
  why: string;
  chapterKey?: string;
  homeworkId?: string;
}
