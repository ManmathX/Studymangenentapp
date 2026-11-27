import { addDays, diffDays, eachDay } from './dates';
import { priority } from './engine';
import { examStepsFor, prepRoom } from './examPlan';
import { shortDate } from './shortDate';

/**
 * Half-yearly and final exams on the datesheet: one paper per subject, usually on back-to-back days.
 *
 * The plan never parks on one chapter or one subject. Each day takes at most one step from
 * any chapter and, before anything else, one step from as many different subjects as fit.
 * Exercises (self study, homework) come first; revision waits for the second half of the
 * preparation time so it is fresh; the evening before each paper is kept for revising that
 * whole subject. Steps that cannot fit in the time available are counted, not crammed in.
 *
 * There is no daily limit, so the plan paces itself: each day takes an even share of the
 * steps still to do over the days still left, so preparation is spread out rather than
 * crammed into the first week. A step that would otherwise run out of days is always placed.
 *
 * Each day's room comes from its day frame (see dayFrame.js): between the first and last
 * paper there is no Homework slot, and study-leave days have no school, so they hold more.
 */

const maxKey = (a, b) => (a > b ? a : b);
const minKey = (a, b) => (a < b ? a : b);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** The whole-subject revision the evening before a paper uses the time left that evening: up to 90 minutes, never under 20. */
const FINAL_REVISION_MAX = 90;
const FINAL_REVISION_MIN = 20;
/** How much more than an even share of the steps left a day may take. */
const PACE_SLACK = 1.25;

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
  const room = (date) => prepRoom(load, profile, date);
  const place = (slot, date) => {
    load.add({ ...slot, date, status: 'accepted' });
    blocks.push({ ...slot, date });
  };
  // Minutes alone can't tell: the step must also fit in one of the day's free stretches.
  const fits = (slot, date) => load.fits(profile, date, slot);
  const slotFor = (paper, extra) => ({
    subject: paper.subject,
    examId: paper.id,
    deadline: addDays(paper.date, -1),
    why: `${paper.name} on ${shortDate(paper.date)}`,
    ...extra,
  });

  // 1. The evening before each paper: revise that whole subject. If that evening has no room
  // it is counted as not planned.
  let unplacedRevisions = 0;
  for (const paper of sorted) {
    const date = addDays(paper.date, -1);
    if (date < firstDay) continue;
    const daysLeft = Math.max(1, diffDays(today, paper.date));
    const free = room(date);
    // The longest revision (up to 90 minutes, at least 20) that fits in the room left and on the timeline.
    const sizes = [Math.min(FINAL_REVISION_MAX, free), 60, 45, 30, FINAL_REVISION_MIN].filter((mins) => mins >= FINAL_REVISION_MIN && mins <= free);
    const revision = (mins) =>
      slotFor(paper, { title: `Revision: all chapters for ${paper.name}`, kind: 'revision', mins, chapterKey: null, score: priority(daysLeft, paper.weight, 2) });
    const mins = sizes.find((size) => fits(revision(size), date));
    if (!mins) {
      unplacedRevisions += 1;
      continue;
    }
    place(revision(mins), date);
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

  const stepsLeft = () => jobs.reduce((sum, job) => sum + job.steps.length - job.next, 0);
  for (const date of eachDay(firstDay, lastStudyDay)) {
    const usedChapters = new Set();
    const perSubject = new Map();
    // A quarter more than an even share, so the last days never inherit a backlog.
    const quota = Math.ceil((stepsLeft() * PACE_SLACK) / (diffDays(date, lastStudyDay) + 1));
    let placedToday = 0;
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
        if (placedToday >= quota && latest(job) > addDays(date, 1)) continue;
        const slot = slotFor(job.paper, {
          title: `${job.chapter.name}: ${step.title}`,
          kind: step.kind,
          mins: step.mins,
          chapterKey: job.chapter.key,
          score: priority(Math.max(1, diffDays(today, job.paper.date)), job.paper.weight, job.chapter.difficulty),
        });
        if (!fits(slot, date)) continue;
        place(slot, date);
        usedChapters.add(job.chapter.key);
        perSubject.set(subject, (perSubject.get(subject) ?? 0) + 1);
        job.next += 1;
        job.readyFrom = addDays(date, 1);
        placedToday += 1;
      }
    }
  }

  const unplaced = unplacedRevisions + jobs.reduce((sum, job) => sum + job.steps.length - job.next, 0);
  return { blocks, unplaced, reason: null };
}
