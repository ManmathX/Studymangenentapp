import { addDays, diffDays, eachDay } from './dates';
import { dayFrame } from './dayFrame';
import { priority, reservedMins } from './engine';
import { shortDate } from './shortDate';
import { EXAM_PREP_DAYS } from './types';

export { EXAM_PREP_DAYS };

/**
 * Minutes of a day's Test prep time: all its free time minus the Homework slot (kept for
 * school homework; none during a half-yearly or final) and the night revision slot.
 */
export function prepCapacity(profile, date, exams = [], frame = dayFrame(profile, date, exams)) {
  return reservedMins(profile, frame).study;
}

/** Test prep minutes still free on a day, given what `load` already holds (study work only). */
export function prepRoom(load, profile, date) {
  return prepCapacity(profile, date, load.exams, load.frame(profile, date)) - load.planned(date, true);
}

const maxKey = (a, b) => (a > b ? a : b);
const STATUS_ORDER = { not: 0, learning: 1, revised: 2, mastered: 3 };

/** Slots a chapter needs before a test, in the order they must happen. */
export function examStepsFor(chapter) {
  const exercises = chapter.subject === 'maths' || chapter.subject === 'science' ? 'NCERT exercises' : 'textbook questions';
  switch (chapter.status) {
    case 'not':
      return [
        { kind: 'study', mins: 45, title: 'Self study: read the chapter and make notes' },
        { kind: 'homework', mins: 40, title: `Homework: ${exercises}` },
        { kind: 'revision', mins: 20, title: 'Revision: notes and key points' },
      ];
    case 'learning':
      return [
        { kind: 'homework', mins: 40, title: `Homework: ${exercises}` },
        { kind: 'revision', mins: 20, title: 'Revision: notes and key points' },
      ];
    case 'practiced':
      return [{ kind: 'revision', mins: 20, title: 'Revision: notes and key points' }];
    case 'revised':
      return [
        { kind: 'homework', mins: 30, title: 'Homework: practice questions' },
        { kind: 'revision', mins: 20, title: 'Revision: key points' },
      ];
    default:
      return [{ kind: 'revision', mins: 15, title: 'Revision: quick recap' }];
  }
}

/**
 * The day for a step that may start on `from` and must be done by `deadline`: the earliest
 * day whose Test prep time still has room and where the step fits on the day's timeline.
 * Returns null when no day works: the step is reported as not planned, never squeezed in.
 * `load` counts study work only (not school homework, which has its own slot).
 */
export function pickPrepDay(load, profile, slot, from, deadline) {
  const first = from > deadline ? deadline : from;
  for (const date of eachDay(first, deadline)) if (prepRoom(load, profile, date) >= slot.mins && load.fits(profile, date, slot)) return date;
  return null;
}

/**
 * Plans self study, homework and revision slots for every chapter of a test, plus a whole-test
 * revision the day before. Chapters that need the most work go first; each chapter's self study
 * and homework are spread over the first half of the preparation days and its revision over the
 * second half. Mutates `load` so each slot sees the ones before it.
 *
 * Returns `{ blocks, reason, unplaced }`. `reason` is 'NO_TIME' when the test is too close to plan
 * for; `unplaced` counts steps that did not fit in the days before it.
 */
export function planExamSlots({ exam, chapters, profile, load, today, start, skipChapterKeys = new Set() }) {
  const deadline = addDays(exam.date, -1);
  if (deadline < start) return { blocks: [], reason: 'NO_TIME', unplaced: 0 };
  const days = [...eachDay(maxKey(start, addDays(exam.date, -EXAM_PREP_DAYS)), deadline)];
  const midIndex = Math.floor((days.length - 1) / 2);
  const lastRevisionIndex = Math.max(midIndex, days.length - 2);
  const daysLeft = Math.max(1, diffDays(today, exam.date));
  const why = `${exam.name} on ${shortDate(exam.date)}`;

  const byKey = new Map(chapters.map((chapter) => [chapter.key, chapter]));
  const list = exam.chapterKeys
    .map((key) => byKey.get(key))
    .filter((chapter) => chapter && !skipChapterKeys.has(chapter.key))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const blocks = [];
  let unplaced = 0;
  const place = (slot, from) => {
    const planned = { ...slot, deadline, why, examId: exam.id };
    const date = pickPrepDay(load, profile, planned, from, deadline);
    if (!date) {
      unplaced += 1;
      return null;
    }
    load.add({ ...planned, date, status: 'accepted' });
    blocks.push({ ...planned, date });
    return date;
  };

  list.forEach((chapter, index) => {
    const workStart = days[Math.floor((index * Math.max(1, midIndex)) / list.length)] ?? days[0];
    const revisionStart = days[midIndex + Math.floor((index * Math.max(0, lastRevisionIndex - midIndex)) / list.length)] ?? deadline;
    const score = priority(daysLeft, exam.weight, chapter.difficulty);
    let next = workStart;
    for (const step of examStepsFor(chapter)) {
      const from = step.kind === 'revision' ? maxKey(next, revisionStart) : next;
      const date = place(
        { subject: chapter.subject, title: `${chapter.name}: ${step.title}`, kind: step.kind, mins: step.mins, chapterKey: chapter.key, score },
        from,
      );
      if (date) next = addDays(date, 1);
    }
  });

  if (exam.chapterKeys.length) {
    place(
      {
        subject: exam.subject,
        title: `Revision: all chapters for ${exam.name}`,
        kind: 'revision',
        mins: Math.min(60, Math.max(30, 15 * exam.chapterKeys.length)),
        chapterKey: null,
        score: priority(daysLeft, exam.weight, 2),
      },
      deadline,
    );
  }
  return { blocks, reason: null, unplaced };
}

/** Counts for the confirmation message: how many slots of each kind, the first day, and how many steps did not fit. */
export function summarizeSlots(blocks, reason = null, unplaced = 0) {
  const counts = { study: 0, homework: 0, revision: 0 };
  for (const block of blocks) counts[block.kind] = (counts[block.kind] ?? 0) + 1;
  const firstDate = blocks.reduce((first, block) => (!first || block.date < first ? block.date : first), null);
  return { added: blocks.length, firstDate, counts, reason, unplaced };
}
