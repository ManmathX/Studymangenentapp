// Originally ported from the retired backend's planner.types.ts. This copy is now the source of truth.
export const CHAPTER_STATUSES = ['not', 'learning', 'revised', 'mastered'];
/** Slot types on the calendar: self study (learning new material), revision, practice and homework. */
export const TASK_KINDS = ['study', 'revision', 'practice', 'homework'];
export const TASK_STATUSES = ['accepted', 'suggested', 'skipped'];
export const TASK_SOURCES = ['me', 'app', 'teacher', 'parent'];
export const AGE_MODES = ['simple', 'deeper'];
/** Spaced-revision intervals in days after a chapter is learnt. */
export const REVISION_INTERVALS = [1, 7, 30];
/** How far ahead (days, inclusive of today) the planner schedules chapter steps. */
export const PLANNING_HORIZON_DAYS = 13;
/** Preparation for a test starts at most this many days before it; those days get a Test prep slot. */
export const EXAM_PREP_DAYS = 14;

/**
 * Big exams: one paper per subject, usually on back-to-back days. They cover far more
 * chapters than a unit test, so preparation starts earlier and mixes subjects every day.
 */
export const EXAM_SERIES = {
  halfYearly: { label: 'Half-yearly', weight: 30, prepDays: 28 },
  final: { label: 'Final exam', weight: 50, prepDays: 42 },
};
export const EXAM_TYPES = ['unit', ...Object.keys(EXAM_SERIES)];
