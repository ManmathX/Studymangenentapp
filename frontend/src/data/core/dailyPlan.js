import { addDays, diffDays, weekday } from './dates';
import { nightRevisionItems, reservedMins, stepsFor } from './engine';
import { REVISION_INTERVALS } from './types';

/**
 * The daily plan: every day gets a daily revision block, and days without test preparation
 * get self study that fills the rest of the study slot.
 *
 * Daily revision (20 minutes a chapter, up to two chapters):
 *   1. chapters whose spaced revision is due (1, 7 and 30 days after they were learnt),
 *   2. the chapters self-studied the day before,
 *   3. the most recently learnt chapters,
 * skipping any chapter revised in the last three days.
 *
 * Self study works through the syllabus a step a day per chapter, mixing subjects:
 *   1. chapters already being worked on (their next step, never on the same day as the last),
 *   2. chapters taught in class that still need practice,
 *   3. new chapters, then practised and revised ones,
 * in syllabus order. Each round takes at most one more step per subject, until the slot is
 * full. Chapters already in a test's preparation, and mastered chapters, are left out.
 *
 * Night revision, every night just before the stop time, in its own slot: what school taught
 * that day (15 minutes on a school day), each tuition's notes (10 minutes each), and a recap of
 * the day's study (10 minutes).
 *
 * Every block must fit in the day's free time (after the Homework and night slots) and on its
 * timeline. Pure: returns the new blocks and adds them to `load`.
 */

/** Days ahead the daily plan is filled in (today, or tomorrow evening, onwards). */
export const DAILY_PLAN_DAYS = 7;
export const DAILY_REVISION_MINS = 20;
const MAX_REVISIONS_PER_DAY = 2;
const REVISED_RECENTLY_DAYS = 3;
/** Self study keeps going round the subjects until the slot is full, but at most this many steps per subject a day. */
const MAX_STEPS_PER_SUBJECT = 4;
const DAILY_SCORE = 2;
/** A self-study step may be shortened by up to this much (never below 20 minutes) to use a gap that is a little short. */
const MAX_SHORTEN_MINS = 15;
const MIN_STEP_MINS = 20;
/** Which untouched chapters come first: taught in class, then new, then further along. */
const START_ORDER = { learning: 0, not: 1, practiced: 2, revised: 3 };

const isSchoolHomework = (task) => task.kind === 'homework' && !task.examId;
const isNight = (task) => task.daily?.type === 'night';
const sumMins = (tasks) => tasks.reduce((sum, task) => sum + task.mins, 0);

/**
 * Study minutes a day still has for daily work: its free time, less the Homework slot (or the
 * school homework already in it), the night revision slot, and everything else planned.
 */
export function dailyRoom(load, profile, date) {
  const frame = load.frame(profile, date);
  const tasks = load.tasksByDate.get(date) ?? [];
  const reserved = reservedMins(profile, frame);
  const other = tasks.filter((task) => !isSchoolHomework(task) && !isNight(task));
  return (
    frame.free -
    Math.max(reserved.homework, sumMins(tasks.filter(isSchoolHomework))) -
    Math.max(reserved.night, sumMins(tasks.filter(isNight))) -
    sumMins(other)
  );
}

/** The subject a tuition is for, when its name says so ("Maths tuition"); otherwise 'tuition'. */
function tuitionSubject(profile, label) {
  const name = label.toLowerCase();
  const subjects = profile.subjectInfo ?? (profile.subjects ?? []).map((id) => ({ id, name: id }));
  return subjects.find((subject) => name.includes(subject.name.toLowerCase()))?.id ?? 'tuition';
}

/**
 * Where each chapter's daily self study has got to: its last planned step that is done or
 * still ahead (a step that slipped is done again). `{ from, step, steps, lastDate }` by chapter.
 */
function progressOf(tasks, firstDate) {
  const progress = new Map();
  const study = tasks
    .filter((task) => task.daily?.type === 'study' && task.status !== 'skipped' && (task.done || task.date >= firstDate))
    .sort((a, b) => a.order - b.order);
  for (const task of study) progress.set(task.chapterKey, { from: task.daily.from, step: task.daily.step, steps: task.daily.steps, lastDate: task.date });
  return progress;
}

/**
 * Plans the daily blocks for `days` (`[{ date, mode }]`, in date order). Mode 'full' is daily
 * revision and self study, 'revision' only the revision (days of test preparation), and
 * 'study' only self study (the day already has its revision).
 */
export function planDailyStudy({ profile, chapters, tasks, load, days }) {
  if (!days.length) return [];
  const byKey = new Map(chapters.map((chapter) => [chapter.key, chapter]));
  const progress = progressOf(tasks, days[0].date);
  const live = tasks.filter((task) => task.status !== 'skipped');
  const inTestPrep = new Set(live.filter((task) => task.examId && task.chapterKey && !task.done).map((task) => task.chapterKey));
  const lastRevised = new Map();
  const studiedOn = new Map();
  const noteRevised = (key, date) => {
    if (!lastRevised.has(key) || lastRevised.get(key) < date) lastRevised.set(key, date);
  };
  const noteStudied = (key, date) => studiedOn.set(date, [...(studiedOn.get(date) ?? []), key]);
  for (const task of live) {
    if (task.daily?.type === 'revision') noteRevised(task.chapterKey, task.date);
    if (task.daily?.type === 'study') noteStudied(task.chapterKey, task.date);
  }

  const blocks = [];
  const place = (block) => {
    load.add({ ...block, status: 'accepted' });
    blocks.push(block);
  };

  const revisionChoices = (date) => {
    const revisedRecently = (chapter) => lastRevised.has(chapter.key) && diffDays(lastRevised.get(chapter.key), date) < REVISED_RECENTLY_DAYS;
    const due = chapters
      .filter((chapter) => chapter.learnedOn && chapter.revisions < REVISION_INTERVALS.length && (!chapter.snoozedUntil || chapter.snoozedUntil <= date))
      .map((chapter) => ({ chapter, overdue: diffDays(chapter.learnedOn, date) - REVISION_INTERVALS[chapter.revisions] }))
      .filter((item) => item.overdue >= 0)
      .sort((a, b) => b.overdue - a.overdue || a.chapter.position - b.chapter.position)
      .map((item) => item.chapter);
    const yesterday = (studiedOn.get(addDays(date, -1)) ?? []).map((key) => byKey.get(key)).filter(Boolean);
    const recent = chapters
      .filter((chapter) => chapter.learnedOn && chapter.learnedOn <= date && chapter.status !== 'mastered')
      .sort((a, b) => (a.learnedOn < b.learnedOn ? 1 : a.learnedOn > b.learnedOn ? -1 : a.position - b.position));
    const seen = new Set();
    return [...due, ...yesterday, ...recent].filter((chapter) => {
      if (seen.has(chapter.key) || revisedRecently(chapter)) return false;
      seen.add(chapter.key);
      return true;
    });
  };

  const studyQueue = (date) => {
    const jobs = [];
    for (const chapter of chapters) {
      if (chapter.status === 'mastered' || inTestPrep.has(chapter.key)) continue;
      const done = progress.get(chapter.key);
      if (done) {
        if (done.step + 1 >= done.steps || done.lastDate >= date) continue;
        const steps = stepsFor({ ...chapter, status: done.from });
        if (!steps) continue;
        jobs.push({ chapter, steps, step: done.step + 1, from: done.from, rank: -1, since: done.lastDate });
      } else if (START_ORDER[chapter.status] !== undefined) {
        jobs.push({ chapter, steps: stepsFor(chapter), step: 0, from: chapter.status, rank: START_ORDER[chapter.status], since: '' });
      }
    }
    return jobs.sort((a, b) => a.rank - b.rank || (a.since < b.since ? -1 : a.since > b.since ? 1 : 0) || a.chapter.position - b.chapter.position);
  };

  /** The night revision tasks for a day, in the order they are done. */
  const nightBlocks = (date) => {
    const frame = load.frame(profile, date);
    const studied = (studiedOn.get(date) ?? []).map((key) => byKey.get(key)).filter(Boolean);
    const prepToday = live.some((task) => task.date === date && task.examId) || blocks.some((block) => block.date === date && block.examId);
    return nightRevisionItems(frame).map((item) => {
      const base = { date, kind: 'revision', mins: item.mins, chapterKey: null, deadline: date, score: DAILY_SCORE, daily: { type: 'night', of: item.of } };
      if (item.of === 'school') {
        // The class timetable says which subjects were taught today.
        const periods = [...new Set(profile.periods?.[weekday(date)] ?? [])];
        const names = periods.map((id) => (profile.subjectInfo ?? []).find((subject) => subject.id === id)?.name ?? id);
        return {
          ...base,
          subject: periods[0] ?? 'school',
          title: names.length ? `Night revision: today’s lessons (${names.join(', ')})` : 'Night revision: what school taught today',
          why: 'Going over today’s lessons the same night helps them stick.',
        };
      }
      if (item.of === 'tuition') {
        const name = item.label === 'Tuition' ? 'tuition' : item.label;
        return { ...base, subject: tuitionSubject(profile, item.label), title: `Night revision: today’s ${name} notes`, why: 'Read through today’s tuition notes before sleeping.' };
      }
      const what = studied.length ? studied.slice(0, 3).map((chapter) => chapter.name).join(', ') : prepToday ? 'today’s test prep' : 'what you studied today';
      return {
        ...base,
        subject: studied[0]?.subject ?? 'study',
        chapterKey: studied.length === 1 ? studied[0].key : null,
        title: `Night revision: ${what}`,
        why: 'A quick recap of today’s study before sleeping.',
      };
    });
  };

  for (const { date, mode } of days) {
    let room = dailyRoom(load, profile, date);
    const usedToday = new Set();

    if (mode === 'full' || mode === 'revision') {
      let revisions = 0;
      for (const chapter of revisionChoices(date)) {
        if (revisions >= MAX_REVISIONS_PER_DAY || room < DAILY_REVISION_MINS) break;
        const block = {
          date,
          subject: chapter.subject,
          title: `${chapter.name}: daily revision`,
          kind: 'revision',
          mins: DAILY_REVISION_MINS,
          chapterKey: chapter.key,
          deadline: date,
          score: DAILY_SCORE,
          why: 'Daily revision keeps what you learnt fresh.',
          daily: { type: 'revision' },
        };
        if (!load.fits(profile, date, block)) break;
        place(block);
        room -= block.mins;
        revisions += 1;
        usedToday.add(chapter.key);
        noteRevised(chapter.key, date);
      }
    }
    if (mode === 'full' || mode === 'study') {
      const perSubject = new Map();
      for (let round = 1; round <= MAX_STEPS_PER_SUBJECT; round += 1) {
        let placedThisRound = 0;
        for (const job of studyQueue(date)) {
          const { chapter } = job;
          const step = job.steps[job.step];
          if (usedToday.has(chapter.key) || (perSubject.get(chapter.subject) ?? 0) >= round) continue;
          const blockOf = (mins) => ({
            date,
            subject: chapter.subject,
            title: `${chapter.name}: ${step.title}`,
            kind: step.kind,
            mins,
            chapterKey: chapter.key,
            deadline: date,
            score: DAILY_SCORE,
            why: `Daily self study, step ${job.step + 1} of ${job.steps.length} for this chapter.`,
            daily: { type: 'study', from: job.from, step: job.step, steps: job.steps.length },
          });
          // The full step if it fits, else a slightly shorter one that uses the gap that is left.
          const lengths = [step.mins, step.mins - 5, step.mins - 10, step.mins - MAX_SHORTEN_MINS].filter((mins) => mins >= MIN_STEP_MINS && mins <= room);
          const block = lengths.map(blockOf).find((candidate) => load.fits(profile, date, candidate));
          if (!block) continue;
          place(block);
          room -= block.mins;
          usedToday.add(chapter.key);
          perSubject.set(chapter.subject, (perSubject.get(chapter.subject) ?? 0) + 1);
          progress.set(chapter.key, { from: job.from, step: job.step, steps: job.steps.length, lastDate: date });
          noteStudied(chapter.key, date);
          placedThisRound += 1;
        }
        if (!placedThisRound) break;
      }
    }

    // Every night before sleep: revise what school, each tuition and the day's study covered.
    if (mode !== 'study') for (const block of nightBlocks(date)) if (load.fits(profile, date, block)) place(block);
  }
  return blocks;
}
