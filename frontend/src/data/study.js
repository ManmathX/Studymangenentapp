import { addDays, diffDays, eachDay, weekday } from './core/dates';
import {
  bestDay,
  chapterDeadline,
  DayLoad,
  layoutDay,
  limitFor,
  planSuggestions,
  priority,
  proposeDays,
  readiness,
  stepsFor,
} from './core/engine';
import { planExamSlots, summarizeSlots } from './core/examPlan';
import { consecutiveDates, defaultSeriesChapters, planSeriesSlots } from './core/examSeries';
import { shortDate } from './core/shortDate';
import { SUBJECTS } from './core/syllabus';
import { CHAPTER_STATUSES, EXAM_PREP_DAYS, EXAM_SERIES, PLANNING_HORIZON_DAYS, REVISION_INTERVALS } from './core/types';
import { read, write } from './db';
import { badRequest, conflict, notFound, unprocessable } from './errors';
import {
  copy,
  examsFrom,
  insertTasks,
  liveHomeworkIds,
  liveTasksFrom,
  newId,
  openHomework,
  requireChapter,
  requireTask,
  slippedTasks,
  studentDay,
  tasksInRange,
} from './queries';
import { dateKey, intIn, list, oneOf, text, unique } from './validate';

/** Days ahead used to judge free room when moving work between days. */
const LOAD_WINDOW_DAYS = 45;
const VIEWABLE_PAST_DAYS = 60;
/** How far ahead the calendar can show a day (half-yearly and final papers can be four months ahead). */
const VIEWABLE_AHEAD_DAYS = 135;
const MIN_STRIP_DAYS = 14;
const MAX_STRIP_DAYS = 135;
/** How far back missed tasks still produce a "move it" suggestion. */
const MISSED_LOOKBACK_DAYS = 7;

const maxDate = (a, b) => (a > b ? a : b);

/* ---------- Tests ---------- */

/** Upcoming tests with days left, chapter statuses and how many are revised. */
export function upcomingExams(data, today) {
  const byKey = new Map(data.chapters.map((chapter) => [chapter.key, chapter]));
  const statusByKey = new Map(data.chapters.map((chapter) => [chapter.key, chapter.status]));
  return examsFrom(data, today).map((exam) => ({
    ...copy(exam),
    daysLeft: diffDays(today, exam.date),
    readiness: readiness(exam.chapterKeys, statusByKey),
    chapters: exam.chapterKeys.flatMap((key) => {
      const chapter = byKey.get(key);
      return chapter ? [{ key, name: chapter.name, status: chapter.status }] : [];
    }),
  }));
}

export function listExams() {
  const data = read();
  return upcomingExams(data, studentDay(data).today);
}

/**
 * Puts self study, homework and revision slots for a test on the calendar.
 * Chapters that already have open slots in the test's preparation window are left alone.
 */
export function planForExam(draft, exam, ctx) {
  const windowStart = addDays(exam.date, -EXAM_PREP_DAYS);
  const skipChapterKeys = new Set(
    liveTasksFrom(draft, ctx.today)
      .filter((task) => task.chapterKey && !task.done && task.date >= windowStart && task.date < exam.date)
      .map((task) => task.chapterKey),
  );
  const { blocks, reason } = planExamSlots({
    exam,
    chapters: draft.chapters,
    profile: ctx.profile,
    // School homework has its own daily slot, so only study work competes for Test prep time.
    load: new DayLoad(tasksInRange(draft, ctx.today, exam.date).filter((task) => task.kind !== 'homework' || task.examId)),
    today: ctx.today,
    start: ctx.start,
    skipChapterKeys,
  });
  insertTasks(draft, blocks.map((block) => ({ ...block, source: 'app', status: 'accepted' })));
  return summarizeSlots(blocks, reason);
}

/** Adds a test and plans its study slots on the calendar straight away. */
export function createExam(input) {
  return write((draft) => {
    const ctx = studentDay(draft);
    const { profile, today } = ctx;
    if (!profile.subjects.includes(input.subject)) throw badRequest('That subject is turned off', 'SUBJECT_NOT_SELECTED');
    const name = text(input.name, 'name', { max: 80, required: 'Give the test a name.' });
    const date = dateKey(input.date, 'date');
    if (date <= today) throw badRequest('Pick a date after today', 'EXAM_IN_PAST');
    const weight = intIn(input.weight, 1, 100, 'weight');
    const keys = unique(list(input.chapterKeys, 'chapterKeys', { min: 1, max: 40, message: 'Tick at least one chapter so the planner knows what to revise.' }));
    const chapters = keys.map((key) => draft.chapters.find((chapter) => chapter.key === key));
    if (chapters.some((chapter) => !chapter || chapter.subject !== input.subject)) throw badRequest('Pick chapters from this subject', 'UNKNOWN_CHAPTER');
    const exam = { id: newId(draft), type: 'unit', subject: input.subject, name, date, weight, chapterKeys: keys };
    draft.exams.push(exam);
    return { exam: copy(exam), planned: planForExam(draft, exam, ctx) };
  });
}

/* ---------- Half-yearly and final exams ---------- */

const subjectChapters = (data, subject) => data.chapters.filter((chapter) => chapter.subject === subject).sort((a, b) => a.position - b.position);

/**
 * A starting point for the half-yearly or final form: one paper per subject on back-to-back
 * days from `firstDate` (skipping Sundays unless told not to), with the chapters each paper
 * usually covers already ticked.
 */
export function examSeriesDraft(type, firstDate, skipSundays = true) {
  oneOf(type, Object.keys(EXAM_SERIES), 'type');
  const data = read();
  const { profile } = studentDay(data);
  const dates = consecutiveDates(dateKey(firstDate, 'firstDate'), profile.subjects.length, { skipSundays });
  return profile.subjects.map((subject, index) => {
    const chapters = subjectChapters(data, subject);
    return {
      subject,
      name: `${EXAM_SERIES[type].label}: ${SUBJECTS[subject].name}`,
      date: dates[index],
      chapterKeys: defaultSeriesChapters(type, chapters),
      chapters: chapters.map(({ key, name, status }) => ({ key, name, status })),
    };
  });
}

/** Adds every paper of a half-yearly or final exam and plans a mixed study timetable for all of them. */
export function createExamSeries(input) {
  const series = EXAM_SERIES[oneOf(input?.type, Object.keys(EXAM_SERIES), 'type')];
  return write((draft) => {
    const ctx = studentDay(draft);
    const { profile, today } = ctx;
    const papers = list(input.papers, 'papers', { min: 1, max: profile.subjects.length, message: 'Keep at least one paper' });
    const seen = new Set();
    const exams = papers.map((paper, index) => {
      if (!profile.subjects.includes(paper.subject)) throw badRequest('That subject is turned off', 'SUBJECT_NOT_SELECTED');
      if (seen.has(paper.subject)) throw badRequest(`${SUBJECTS[paper.subject].name} has two papers`, 'DUPLICATE_PAPER');
      seen.add(paper.subject);
      const date = dateKey(paper.date, `papers.${index}.date`);
      if (date <= today) throw badRequest(`Pick a date after today for ${SUBJECTS[paper.subject].name}`, 'EXAM_IN_PAST');
      const own = subjectChapters(draft, paper.subject);
      const keys =
        paper.chapterKeys === undefined
          ? defaultSeriesChapters(input.type, own)
          : unique(list(paper.chapterKeys, `papers.${index}.chapterKeys`, { min: 1, max: 40, message: `Tick at least one ${SUBJECTS[paper.subject].name} chapter` }));
      if (keys.some((key) => !own.some((chapter) => chapter.key === key))) throw badRequest('Pick chapters from each paper’s subject', 'UNKNOWN_CHAPTER');
      return { subject: paper.subject, date, chapterKeys: keys };
    });

    const seriesId = newId(draft);
    const firstPaper = exams.map((exam) => exam.date).sort()[0];
    const prepFrom = addDays(firstPaper, -series.prepDays);
    const stored = exams.map((exam) => ({
      id: newId(draft),
      type: input.type,
      seriesId,
      seriesName: series.label,
      prepFrom,
      subject: exam.subject,
      name: `${series.label}: ${SUBJECTS[exam.subject].name}`,
      date: exam.date,
      weight: series.weight,
      chapterKeys: exam.chapterKeys,
    }));
    draft.exams.push(...stored);

    const lastPaper = stored.map((exam) => exam.date).sort().at(-1);
    const { blocks, unplaced, reason } = planSeriesSlots({
      papers: stored,
      chapters: draft.chapters,
      profile,
      // School homework has its own daily slot, so only study work competes for Test prep time.
      load: new DayLoad(tasksInRange(draft, today, lastPaper).filter((task) => task.kind !== 'homework' || task.examId)),
      today,
      start: ctx.start,
      prepFrom,
    });
    insertTasks(draft, blocks.map((block) => ({ ...block, source: 'app', status: 'accepted' })));
    return { exams: stored.map(copy), planned: { ...summarizeSlots(blocks, reason), unplaced, papers: stored.length } };
  });
}

/** Removes a test and its unfinished slots; time already studied stays in the history. */
export function removeExam(id) {
  write((draft) => {
    const index = draft.exams.findIndex((exam) => exam.id === id);
    if (index < 0) throw notFound('Test not found', 'EXAM_NOT_FOUND');
    draft.exams.splice(index, 1);
    draft.tasks = draft.tasks.filter((task) => task.examId !== id || task.done);
    for (const task of draft.tasks) if (task.examId === id) task.examId = null;
  });
  return null;
}

/* ---------- Auto-scheduling ---------- */

export function blockToTask(block) {
  return {
    date: block.date,
    subject: block.subject,
    title: block.title,
    kind: block.kind,
    mins: block.mins,
    deadline: block.deadline,
    score: block.score,
    why: block.why,
    chapterKey: block.chapterKey ?? null,
    homeworkId: block.homeworkId ?? null,
    source: 'app',
    status: 'suggested',
  };
}

export function summarize(blocks) {
  const firstDate = blocks.reduce((first, block) => (!first || block.date < first ? block.date : first), null);
  return { added: blocks.length, firstDate };
}

/** "Fill free slots before exams": suggests blocks the student can accept, swap or skip. */
function suggestForStudent(draft, ctx) {
  const liveTasks = liveTasksFrom(draft, ctx.today);
  const plannedChapterDates = new Map();
  for (const task of liveTasks) {
    if (!task.chapterKey) continue;
    plannedChapterDates.set(task.chapterKey, [...(plannedChapterDates.get(task.chapterKey) ?? []), task.date]);
  }
  const blocks = planSuggestions({
    profile: ctx.profile,
    today: ctx.today,
    start: ctx.start,
    load: new DayLoad(liveTasks),
    homework: openHomework(draft),
    exams: examsFrom(draft, ctx.today),
    chapters: draft.chapters,
    plannedHomeworkIds: liveHomeworkIds(draft),
    plannedChapterDates,
  });
  insertTasks(draft, blocks.map(blockToTask));
  return summarize(blocks);
}

/* ---------- Plan ---------- */

/** Days the calendar should show by default: two weeks, or up to the last test or planned slot. */
function defaultStripDays(data, today) {
  const lastDate = [...examsFrom(data, today).map((exam) => exam.date), ...liveTasksFrom(data, today).map((task) => task.date)].reduce(
    (last, date) => (date > last ? date : last),
    today,
  );
  return Math.min(MAX_STRIP_DAYS, Math.max(MIN_STRIP_DAYS, diffDays(today, lastDate) + 1));
}

/** Day strip: load, limit and markers for a run of days. */
export function planStrip(from, requestedDays) {
  const data = read();
  const { profile, today } = studentDay(data);
  const days = requestedDays === undefined ? defaultStripDays(data, today) : intIn(requestedDays, 1, MAX_STRIP_DAYS, 'days');
  const first = from ?? today;
  const last = addDays(first, days - 1);
  const tasks = tasksInRange(data, first, last);
  const load = new DayLoad(tasks);
  const examDates = new Set(examsFrom(data, first).map((exam) => exam.date));
  const suggestedDates = new Set(tasks.filter((task) => task.status === 'suggested').map((task) => task.date));
  return [...eachDay(first, last)].map((date) => ({
    date,
    plannedMins: load.planned(date),
    limitMins: limitFor(profile, date),
    overloaded: load.isOverloaded(profile, date),
    hasExam: examDates.has(date),
    hasSuggested: suggestedDates.has(date),
  }));
}

/** On an overloaded day, the lowest-priority open task and the best day to move it to. */
function relief(load, profile, today, date, dayTasks) {
  const candidate = dayTasks.filter((task) => task.status === 'accepted' && !task.done).sort((a, b) => a.score - b.score)[0];
  if (!candidate) return null;
  const from = date === today ? addDays(today, 1) : today;
  const to = candidate.deadline > date ? candidate.deadline : addDays(date, 6);
  const toDate = bestDay(load, profile, candidate.mins, from, to, date);
  return toDate ? { taskId: candidate.id, title: candidate.title, toDate } : null;
}

/** One day laid out around school, tuition and meals. */
export function planDay(date) {
  dateKey(date, 'date');
  const data = read();
  const { profile, today, start } = studentDay(data);
  if (date < addDays(today, -VIEWABLE_PAST_DAYS) || date > addDays(today, VIEWABLE_AHEAD_DAYS)) {
    throw badRequest('That day is outside the planner window', 'DATE_OUT_OF_RANGE');
  }
  const windowTasks = tasksInRange(data, date < today ? date : today, addDays(today, VIEWABLE_AHEAD_DAYS));
  const load = new DayLoad(windowTasks);
  const dayTasks = windowTasks.filter((task) => task.date === date);
  const layout = layoutDay(profile, date, dayTasks, data.exams);
  const plannedMins = load.planned(date);
  const limitMins = limitFor(profile, date);
  const overloaded = plannedMins > limitMins;
  return {
    date,
    today,
    ageMode: profile.ageMode,
    plannedMins,
    limitMins,
    overloaded,
    tuitionDay: profile.tuitionDays.includes(weekday(date)),
    rows: layout.rows.map((row) => (row.type === 'task' ? { type: 'task', start: row.start, end: row.end, task: copy(row.task) } : { ...row })),
    slots: layout.slots,
    overflow: layout.overflow.map(copy),
    moveSuggestion: overloaded ? relief(load, profile, today, date, dayTasks) : null,
    suggestedCount: windowTasks.filter((task) => task.status === 'suggested' && task.date >= today).length,
    dayOptions: [...eachDay(start, addDays(today, PLANNING_HORIZON_DAYS))],
  };
}

export function autoSchedule() {
  return write((draft) => suggestForStudent(draft, studentDay(draft)));
}

/** Accepts every suggested block from today onwards. */
export function acceptAll() {
  return write((draft) => {
    const { today } = studentDay(draft);
    let accepted = 0;
    for (const task of draft.tasks) {
      if (task.status === 'suggested' && task.date >= today) {
        task.status = 'accepted';
        accepted += 1;
      }
    }
    return { accepted };
  });
}

/* ---------- Chapters ---------- */

const chapterDto = (chapter) => ({
  key: chapter.key,
  subject: chapter.subject,
  name: chapter.name,
  difficulty: chapter.difficulty,
  status: chapter.status,
  learnedOn: chapter.learnedOn,
  revisions: chapter.revisions,
  snoozedUntil: chapter.snoozedUntil,
});

/** Chapters with how many open steps are planned from today on. */
export function chaptersWithPlans(data, today, filter = {}) {
  const plannedCount = new Map();
  for (const task of liveTasksFrom(data, today)) {
    if (task.chapterKey && !task.done) plannedCount.set(task.chapterKey, (plannedCount.get(task.chapterKey) ?? 0) + 1);
  }
  return data.chapters
    .filter((chapter) => (!filter.subject || chapter.subject === filter.subject) && (!filter.status || chapter.status === filter.status))
    .sort((a, b) => a.position - b.position)
    .map((chapter) => ({ ...chapterDto(chapter), plannedCount: plannedCount.get(chapter.key) ?? 0 }));
}

export function listChapters(filter = {}) {
  const data = read();
  return chaptersWithPlans(data, studentDay(data).today, filter);
}

export function setChapterStatus(key, status) {
  oneOf(status, CHAPTER_STATUSES, 'status');
  return write((draft) => {
    const { today } = studentDay(draft);
    const chapter = requireChapter(draft, key);
    const startsLearning = status === 'learning' && !chapter.learnedOn;
    chapter.status = status;
    if (startsLearning) {
      chapter.learnedOn = today;
      chapter.revisions = 0;
    }
    return chapterDto(chapter);
  });
}

/** Study steps for a chapter with proposed days before its next test. */
export function scheduleProposal(key) {
  const data = read();
  const { profile, today, start } = studentDay(data);
  const chapter = requireChapter(data, key);
  const liveTasks = liveTasksFrom(data, today);
  const steps = stepsFor(chapter);
  const { exam, deadline } = chapterDeadline(key, examsFrom(data, today), today);
  const days = proposeDays(new DayLoad(liveTasks), profile, steps.map((step) => step.mins), deadline, today, start);
  return {
    chapter: chapterDto(chapter),
    exam: exam ? { id: exam.id, name: exam.name, date: exam.date } : null,
    steps: steps.map((step, index) => ({ index, ...step, proposedDate: days[index] ?? start })),
    alreadyPlanned: liveTasks.filter((task) => task.chapterKey === key && !task.done).map(copy),
    dayOptions: [...eachDay(start, addDays(today, PLANNING_HORIZON_DAYS))],
  };
}

/** Adds the chosen steps to the plan on the chosen days. */
export function scheduleChapter(key, selections) {
  list(selections, 'steps', { min: 1, max: 10, message: 'Tick at least one step to add' });
  return write((draft) => {
    const { today, start } = studentDay(draft);
    const chapter = requireChapter(draft, key);
    const steps = stepsFor(chapter);
    const lastDay = addDays(today, PLANNING_HORIZON_DAYS);
    const seen = new Set();
    for (const selection of selections) {
      dateKey(selection.date, 'date');
      if (!Number.isInteger(selection.index) || selection.index < 0 || selection.index >= steps.length || seen.has(selection.index)) {
        throw badRequest('Pick each step once', 'INVALID_STEP');
      }
      if (selection.date < start || selection.date > lastDay) throw badRequest('Pick days within the next two weeks', 'DATE_OUT_OF_RANGE');
      seen.add(selection.index);
    }
    const { exam, deadline } = chapterDeadline(key, examsFrom(draft, today), today);
    const score = priority(Math.max(1, diffDays(today, exam ? exam.date : addDays(deadline, 1))), exam ? exam.weight : 10, chapter.difficulty);
    const created = insertTasks(
      draft,
      selections.map((selection) => {
        const step = steps[selection.index];
        return {
          date: selection.date,
          subject: chapter.subject,
          title: `${chapter.name}: ${step.title}`,
          kind: step.kind,
          mins: step.mins,
          chapterKey: key,
          deadline: deadline >= selection.date ? deadline : selection.date,
          source: 'me',
          status: 'accepted',
          score,
        };
      }),
    );
    return copy(created);
  });
}

/** Adds today's 15-minute spaced revision and advances the chapter's revision count. */
export function addRevision(key) {
  return write((draft) => {
    const { today } = studentDay(draft);
    const chapter = requireChapter(draft, key);
    const interval = REVISION_INTERVALS[chapter.revisions];
    if (!chapter.learnedOn || interval === undefined) throw conflict('No revision is due for this chapter', 'NO_REVISION_DUE');
    const [task] = insertTasks(draft, [
      {
        date: today,
        subject: chapter.subject,
        title: `${chapter.name}: ${interval}-day revision`,
        kind: 'revision',
        mins: 15,
        chapterKey: key,
        deadline: today,
        source: 'app',
        status: 'accepted',
        score: 4,
      },
    ]);
    chapter.revisions += 1;
    return { task: copy(task), chapter: chapterDto(chapter) };
  });
}

export function snoozeChapter(key) {
  return write((draft) => {
    const { today } = studentDay(draft);
    const chapter = requireChapter(draft, key);
    chapter.snoozedUntil = addDays(today, 1);
    return chapterDto(chapter);
  });
}

/* ---------- Tasks ---------- */

/**
 * Marks done or not done, or moves to another day. Finishing a homework task can close the
 * homework; finishing a chapter step moves an unstarted chapter to "learning".
 */
export function updateTask(id, patch) {
  if (patch?.done === undefined && patch?.date === undefined) throw badRequest('Send done or date');
  return write((draft) => {
    const { today } = studentDay(draft);
    const task = requireTask(draft, id);
    if (patch.date !== undefined && dateKey(patch.date, 'date') < today) throw badRequest('Pick today or a later day', 'DATE_IN_PAST');
    const wasDone = task.done;
    if (patch.done !== undefined) task.done = Boolean(patch.done);
    if (patch.date !== undefined) task.date = patch.date;

    let homework = null;
    let chapter = null;
    if (patch.done === true && !wasDone) {
      const item = task.homeworkId ? draft.homework.find((entry) => entry.id === task.homeworkId) : null;
      if (item && !item.done && item.due <= addDays(today, 1) && task.mins >= item.mins * 0.8) {
        item.done = true;
        item.doneOn = today;
        homework = copy(item);
      }
      const current = task.chapterKey ? draft.chapters.find((entry) => entry.key === task.chapterKey) : null;
      if (current?.status === 'not') {
        Object.assign(current, { status: 'learning', learnedOn: today, revisions: 0 });
        chapter = chapterDto(current);
      }
    }
    if (patch.date !== undefined) {
      for (const suggestion of draft.suggestions) if (suggestion.taskId === id && suggestion.state === 'pending') suggestion.state = 'accepted';
    }
    return { task: copy(task), homework, chapter };
  });
}

function setTaskStatus(id, status) {
  return write((draft) => {
    const task = requireTask(draft, id);
    task.status = status;
    return copy(task);
  });
}

export const acceptTask = (id) => setTaskStatus(id, 'accepted');
export const skipTask = (id) => setTaskStatus(id, 'skipped');

/** Moves a suggestion to the roomiest other day before its deadline and accepts it. */
export function swapTask(id) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const task = requireTask(draft, id);
    const load = new DayLoad(tasksInRange(draft, today, addDays(today, LOAD_WINDOW_DAYS)));
    const latest = task.deadline > task.date ? task.deadline : addDays(task.date, 4);
    const date =
      bestDay(load, profile, task.mins, maxDate(addDays(task.date, 1), today), latest, task.date) ??
      bestDay(load, profile, task.mins, today, addDays(task.date, 4), task.date);
    if (!date) throw unprocessable('No other day before the deadline has room', 'NO_ROOM');
    Object.assign(task, { date, status: 'accepted' });
    return copy(task);
  });
}

/** Moves a task to the nearby day with the most free time. */
export function moveTaskToBestDay(id) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const task = requireTask(draft, id);
    const load = new DayLoad(tasksInRange(draft, today, addDays(today, LOAD_WINDOW_DAYS)));
    const date = bestDay(load, profile, task.mins, today, addDays(maxDate(task.date, today), 5), task.date);
    if (!date) throw unprocessable('No nearby day has room', 'NO_ROOM');
    task.date = date;
    return copy(task);
  });
}

/* ---------- Suggestions ---------- */

/** Pending "move it" suggestions are only created for slipped tasks that don't have one yet. */
export function needsMoveSuggestions(data, today) {
  const covered = new Set(data.suggestions.filter((item) => item.kind === 'move').map((item) => item.taskId));
  return slippedTasks(data, addDays(today, -MISSED_LOOKBACK_DAYS), today).some((task) => !covered.has(task.id));
}

/** Turns tasks that slipped in the last week into one pending "move" suggestion each (idempotent). */
export function refreshMissedTasks(draft, ctx) {
  const slipped = slippedTasks(draft, addDays(ctx.today, -MISSED_LOOKBACK_DAYS), ctx.today);
  if (!slipped.length) return;
  const load = new DayLoad(tasksInRange(draft, ctx.today, addDays(ctx.today, 7)));
  for (const task of slipped) {
    const date = bestDay(load, ctx.profile, task.mins, ctx.start, addDays(ctx.start, 5)) ?? ctx.start;
    load.add({ date, mins: task.mins, status: 'suggested' });
    if (draft.suggestions.some((item) => item.kind === 'move' && item.taskId === task.id)) continue;
    draft.suggestions.push({
      id: newId(draft),
      from: 'app',
      who: 'Planner',
      role: 'Missed task',
      subject: task.subject,
      title: task.title,
      mins: task.mins,
      date,
      kind: 'move',
      taskId: task.id,
      chapterKey: task.chapterKey,
      note: `This slipped on ${shortDate(task.date)}. ${shortDate(date)} has room.`,
      state: 'pending',
    });
  }
}

export function suggestionsByState(data, states) {
  return data.suggestions
    .filter((item) => states.includes(item.state))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 100)
    .map(copy);
}

function requireOpen(draft, id) {
  const suggestion = draft.suggestions.find((item) => item.id === id);
  if (!suggestion) throw notFound('Suggestion not found', 'SUGGESTION_NOT_FOUND');
  if (suggestion.state !== 'pending' && suggestion.state !== 'later') throw conflict('This suggestion was already handled', 'SUGGESTION_CLOSED');
  return suggestion;
}

function acceptInDraft(draft, suggestion, date) {
  const target = date ?? suggestion.date;
  if (suggestion.kind === 'move' && suggestion.taskId) {
    const task = draft.tasks.find((item) => item.id === suggestion.taskId);
    if (task) Object.assign(task, { date: target, status: 'accepted' });
  } else {
    insertTasks(draft, [
      {
        date: target,
        subject: suggestion.subject,
        title: suggestion.title,
        kind: suggestion.kind === 'move' ? 'revision' : suggestion.kind,
        mins: suggestion.mins,
        chapterKey: suggestion.chapterKey,
        deadline: target,
        source: suggestion.from,
        status: 'accepted',
        score: 5,
      },
    ]);
  }
  // Record where it actually went, so "Swapped to …" names the new day.
  suggestion.date = target;
  suggestion.state = 'accepted';
  return copy(suggestion);
}

/** Accept: add or move the block on its suggested day. */
export function acceptSuggestion(id) {
  return write((draft) => acceptInDraft(draft, requireOpen(draft, id)));
}

export function saveSuggestionForLater(id) {
  return write((draft) => {
    const suggestion = requireOpen(draft, id);
    suggestion.state = 'later';
    return copy(suggestion);
  });
}

/** Skip: the plan stays as it is (a missed task is dropped). */
export function skipSuggestion(id) {
  return write((draft) => {
    const suggestion = requireOpen(draft, id);
    if (suggestion.kind === 'move' && suggestion.taskId) {
      const task = draft.tasks.find((item) => item.id === suggestion.taskId);
      if (task) task.status = 'skipped';
    }
    suggestion.state = 'skipped';
    return copy(suggestion);
  });
}

/** Accepts the suggestion on the roomiest of the following six days instead. */
export function swapSuggestion(id) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const suggestion = requireOpen(draft, id);
    const from = maxDate(addDays(suggestion.date, 1), today);
    const load = new DayLoad(tasksInRange(draft, from, addDays(from, 6)));
    const date = bestDay(load, profile, suggestion.mins, from, addDays(suggestion.date, 6)) ?? from;
    return acceptInDraft(draft, suggestion, date);
  });
}
