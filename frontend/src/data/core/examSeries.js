import { addDays, diffDays, eachDay } from './dates';
import { priority } from './engine';
import { examStepsFor, prepCapacity } from './examPlan';
import { shortDate } from './shortDate';

/**
 * Half-yearly and final exams on the datesheet: one paper per subject, usually on back-to-back days.
 *
 * The plan never parks on one chapter or one subject. Each day takes at most one step from
 * any chapter and, before anything else, one step from as many different subjects as fit.
 * Exercises (self study, homework) come first; revision waits for the second half of the
 * preparation time so it is fresh; the evening before each paper is kept for revising that
 * whole subject. Steps that cannot fit in the time available are counted, not crammed in.
 */

const maxKey = (a, b) => (a > b ? a : b);
const minKey = (a, b) => (a < b ? a : b);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** The whole-subject revision the evening before a paper uses the time left that evening: up to 90 minutes, never under 20. */
const FINAL_REVISION_MAX = 90;
const FINAL_REVISION_MIN = 20;

/**
 * Plans every paper of a big exam. `load` holds study work already planned (it is updated).
 * Returns `{ blocks, unplaced, reason }`; `reason` is 'NO_TIME' when no day is left before the first paper.
 */
export function planSeriesSlots({ papers, chapters, profile, load, today, start, prepFrom, skipChapterKeys = new Set() }) {
  const sorted = [...papers].sort(byDate);
  const firstDay = maxKey(start, prepFrom);
  const lastStudyDay = addDays(sorted[sorted.length - 1].date, -1);
  if (lastStudyDay < firstDay) return { blocks: [], unplaced: 0, reason: 'NO_TIME' };

  const byKey = new Map(chapters.map((chapter) => [chapter.key, chapter]));
  const blocks = [];
  const room = (date) => prepCapacity(profile, date) - load.planned(date, true);
  const place = (slot, date) => {
    load.add({ date, mins: slot.mins, status: 'accepted' });
    blocks.push({ ...slot, date });
  };
  const slotFor = (paper, extra) => ({
    subject: paper.subject,
    examId: paper.id,
    deadline: addDays(paper.date, -1),
    why: `${paper.name} on ${shortDate(paper.date)}`,
    ...extra,
  });

  // 1. The evening before each paper: revise that whole subject.
  for (const paper of sorted) {
    const date = addDays(paper.date, -1);
    if (date < firstDay) continue;
    const daysLeft = Math.max(1, diffDays(today, paper.date));
    place(
      slotFor(paper, {
        title: `Revision: all chapters for ${paper.name}`,
        kind: 'revision',
        mins: Math.min(FINAL_REVISION_MAX, Math.max(FINAL_REVISION_MIN, room(date))),
        chapterKey: null,
        score: priority(daysLeft, paper.weight, 2),
      }),
      date,
    );
  }

  // 2. Every chapter's steps, mixed across subjects day by day.
  const jobs = [];
  for (const paper of sorted) {
    const lastDay = maxKey(firstDay, addDays(paper.date, -2));
    const revisionFrom = minKey(lastDay, addDays(firstDay, Math.floor(diffDays(firstDay, paper.date) / 2)));
    for (const key of paper.chapterKeys) {
      const chapter = byKey.get(key);
      if (!chapter || skipChapterKeys.has(key)) continue;
      jobs.push({ paper, chapter, steps: examStepsFor(chapter), next: 0, readyFrom: firstDay, revisionFrom, lastDay });
    }
  }
  // A step's latest sensible day leaves one day for each step after it.
  const latest = (job) => addDays(job.lastDay, -(job.steps.length - 1 - job.next));

  for (const date of eachDay(firstDay, lastStudyDay)) {
    const usedChapters = new Set();
    const perSubject = new Map();
    // Round 1: one step per subject; round 2: a second subject step if time is left.
    for (let round = 1; round <= 2; round += 1) {
      const ready = jobs
        .filter(
          (job) =>
            job.next < job.steps.length &&
            date >= job.readyFrom &&
            date <= job.lastDay &&
            (job.steps[job.next].kind !== 'revision' || date >= job.revisionFrom) &&
            !usedChapters.has(job.chapter.key),
        )
        .sort((a, b) => (latest(a) < latest(b) ? -1 : latest(a) > latest(b) ? 1 : byDate(a.paper, b.paper)));
      for (const job of ready) {
        const subject = job.chapter.subject;
        const step = job.steps[job.next];
        if ((perSubject.get(subject) ?? 0) >= round || usedChapters.has(job.chapter.key) || room(date) < step.mins) continue;
        place(
          slotFor(job.paper, {
            title: `${job.chapter.name}: ${step.title}`,
            kind: step.kind,
            mins: step.mins,
            chapterKey: job.chapter.key,
            score: priority(Math.max(1, diffDays(today, job.paper.date)), job.paper.weight, job.chapter.difficulty),
          }),
          date,
        );
        usedChapters.add(job.chapter.key);
        perSubject.set(subject, (perSubject.get(subject) ?? 0) + 1);
        job.next += 1;
        job.readyFrom = addDays(date, 1);
      }
    }
  }

  const unplaced = jobs.reduce((sum, job) => sum + job.steps.length - job.next, 0);
  return { blocks, unplaced, reason: null };
}
