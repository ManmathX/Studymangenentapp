import { addDays, diffDays, eachDay } from './dates';
import { homeworkSlotMins, limitFor, priority } from './engine';
import { shortDate } from './shortDate';
import { EXAM_PREP_DAYS } from './types';

export { EXAM_PREP_DAYS };

/** Minutes of the day's Test prep slot: the study limit minus the Homework slot, kept free for school homework. */
export const prepCapacity = (profile, date) => limitFor(profile, date) - homeworkSlotMins(profile, date);

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
 * Earliest day from `from` whose Test prep slot has room for `mins`. If every day is full, the
 * least-overloaded day in range, so nothing the test needs is silently dropped.
 * `load` holds study work only (not school homework, which has its own slot).
 */
function pickDay(load, profile, mins, from, deadline) {
  if (from > deadline) return deadline;
  let leastBusy = from;
  let leastOver = Infinity;
  for (const date of eachDay(from, deadline)) {
    const over = load.planned(date, true) + mins - prepCapacity(profile, date);
    if (over <= 0) return date;
    if (over < leastOver) {
      leastOver = over;
      leastBusy = date;
    }
  }
  return leastBusy;
}

/**
 * Plans self study, homework and revision slots for every chapter of a test, plus a whole-test
 * revision the day before. Chapters that need the most work go first; each chapter's self study
 * and homework are spread over the first half of the preparation days and its revision over the
 * second half. Mutates `load` so each slot sees the ones before it.
 *
 * Returns `{ blocks, reason }`; `reason` is 'NO_TIME' when the test is too close to plan for.
 */
export function planExamSlots({ exam, chapters, profile, load, today, start, skipChapterKeys = new Set() }) {
  const deadline = addDays(exam.date, -1);
  if (deadline < start) return { blocks: [], reason: 'NO_TIME' };
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
  const place = (slot, from) => {
    const date = pickDay(load, profile, slot.mins, from, deadline);
    load.add({ date, mins: slot.mins, status: 'accepted' });
    blocks.push({ ...slot, date, deadline, why, examId: exam.id });
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
      next = addDays(date, 1);
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
  return { blocks, reason: null };
}

/** Counts for the confirmation message: how many slots of each kind, and the first day. */
export function summarizeSlots(blocks, reason = null) {
  const counts = { study: 0, homework: 0, revision: 0 };
  for (const block of blocks) counts[block.kind] = (counts[block.kind] ?? 0) + 1;
  const firstDate = blocks.reduce((first, block) => (!first || block.date < first ? block.date : first), null);
  return { added: blocks.length, firstDate, counts, reason };
}
