import { addDays } from './core/dates';
import { buildDemoData } from './core/demoSeed';
import {
  DEFAULT_HOMEWORK_MINS,
  HOMEWORK_SLOT_OPTIONS,
  MAX_TUITIONS,
  schoolHours,
  TUITION_EARLIEST,
  TUITION_LATEST,
  tuitionsOf,
} from './core/engine';
import { AGE_MODES } from './core/types';
import { clock } from './clock';
import { emptyData, read, replaceAll, write } from './db';
import { badRequest, conflict, invalidField } from './errors';
import { copy, insertTasks, localToday, newId, studentDay, subjectInfoOf, upsertLog } from './queries';
import { datesheetLabel, datesheetPapers, planPapers } from './study';
import { bool, dateKey, intIn, list, oneOf, text, timeOfDay, unique } from './validate';

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
const clock24 = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SHARE_ITEMS = ['hours', 'streak', 'coverage', 'tests', 'marks'];

/** One tuition from the form: optional name, its days, and "HH:MM" start and end. */
function cleanTuition(tuition, index, all) {
  const field = (name) => `tuitions.${index}.${name}`;
  const name = tuition?.name === undefined || tuition.name === null ? '' : text(tuition.name, field('name'), { min: 0, max: 40 });
  const label = name || (all.length > 1 ? `Tuition ${index + 1}` : 'tuition');
  const days = list(tuition?.days, field('days'), { min: 1, max: 6, message: `Pick the days for ${label}` });
  return {
    name,
    days: unique(days.map((day) => intIn(day, 1, 6, field('days')))).sort((a, b) => a - b),
    start: toMinutes(timeOfDay(tuition.start, field('start'))),
    end: toMinutes(timeOfDay(tuition.end, field('end'))),
  };
}

/**
 * School hours ("HH:MM") and the list of tuitions. Fields left out keep `current`'s value
 * (the saved profile when editing later). Everything is checked together, since moving school
 * can make a tuition that was fine clash with it.
 */
function cleanTimings(input, current = {}) {
  const minutes = (field, fallback) => (input[field] === undefined ? fallback : toMinutes(timeOfDay(input[field], field)));
  const next = {
    schoolStart: minutes('schoolStart', current.schoolStart),
    schoolEnd: minutes('schoolEnd', current.schoolEnd),
    tuitions:
      input.tuitions === undefined
        ? tuitionsOf(current)
        : list(input.tuitions, 'tuitions', { max: MAX_TUITIONS, message: 'Add tuitions one by one' }).map(cleanTuition),
  };
  if (next.schoolEnd <= next.schoolStart) throw invalidField('schoolEnd', 'School has to end after it starts');

  const labelOf = (index) => next.tuitions[index].name || (next.tuitions.length > 1 ? `Tuition ${index + 1}` : 'Tuition');
  next.tuitions.forEach((tuition, index) => {
    const field = (name) => `tuitions.${index}.${name}`;
    const label = labelOf(index);
    if (tuition.end <= tuition.start) throw invalidField(field('end'), `${label} has to end after it starts`);
    if (tuition.start < TUITION_EARLIEST || tuition.end > TUITION_LATEST) {
      throw invalidField(field('start'), `${label} has to be between ${clock24(TUITION_EARLIEST)} and ${clock24(TUITION_LATEST)}`);
    }
    for (const day of tuition.days) {
      const school = schoolHours(next, day);
      if (tuition.start < school.end && tuition.end > school.start) {
        throw invalidField(field('start'), `${label} on ${WEEKDAY_NAMES[day]} clashes with school (${clock24(school.start)} to ${clock24(school.end)})`);
      }
      next.tuitions.forEach((other, otherIndex) => {
        if (otherIndex <= index || !other.days.includes(day)) return;
        if (tuition.start < other.end && tuition.end > other.start) {
          throw invalidField(field('start'), `${label} and ${labelOf(otherIndex)} overlap on ${WEEKDAY_NAMES[day]}`);
        }
      });
    }
  });
  return next;
}

/** Tuitions as the screens get them: times in minutes after midnight. */
const tuitionsDto = (profile) => tuitionsOf(profile).map(({ name, days, start, end }) => ({ name, days: [...days], start, end }));

/* Same limits as the server's syllabus catalogue. */
const BOARD_CODE = /^[a-z][a-z0-9-]{1,31}$/;
const SUBJECT_ID = /^[a-z][a-z0-9]{1,23}$/;
export const MAX_CUSTOM_SUBJECTS = 6;
const CUSTOM_SUBJECT_ID = new RegExp(`^custom[1-${MAX_CUSTOM_SUBJECTS}]$`);
const MAX_CUSTOM_CHAPTERS = 40;
const MAX_CATALOG_SUBJECTS = 40;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const FALLBACK_COLOR = '#8E8E93';
/** Chapters of a subject the student added themselves start at medium difficulty. */
const CUSTOM_CHAPTER_DIFFICULTY = 2;

/* ---------- Profile ---------- */

function profileDto(profile, today) {
  return copy({
    name: profile.name,
    cls: profile.cls ?? null,
    board: profile.board,
    boardName: profile.boardName ?? profile.board,
    examShortName: profile.examShortName ?? null,
    level: profile.level ?? null,
    levelName: profile.levelName ?? null,
    syllabusYear: profile.syllabusYear ?? null,
    timezone: profile.timezone,
    subjects: profile.subjects,
    subjectInfo: subjectInfoOf(profile),
    schoolStart: profile.schoolStart,
    schoolEnd: profile.schoolEnd,
    tuitions: tuitionsDto(profile),
    dailyLimitMins: profile.dailyLimitMins,
    homeworkMins: profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS,
    weeklyGoalMins: profile.weeklyGoalMins,
    ageMode: profile.ageMode,
    examSeason: profile.examSeason,
    sharing: profile.sharing,
    isDemo: profile.isDemo,
    today,
  });
}

export function getProfile() {
  const { profile, today } = studentDay(read());
  return profileDto(profile, today);
}

const TIMING_FIELDS = ['schoolStart', 'schoolEnd', 'tuitions'];

/**
 * Change name, age mode, exam season, the daily homework slot, what is shared, school hours
 * ("HH:MM"), or the whole list of tuitions (`[{ name, days, start, end }]`, times "HH:MM").
 * Tasks already planned keep their days; each day is laid out around the new timings the
 * next time it is shown.
 */
export function updateProfile(patch) {
  if (!patch || !Object.keys(patch).length) throw badRequest('Send at least one field to change');
  write((draft) => {
    const { profile } = studentDay(draft);
    if (TIMING_FIELDS.some((field) => patch[field] !== undefined)) {
      Object.assign(profile, cleanTimings(patch, profile));
      // Older plans kept one set of tuition days and times; the list replaces them.
      delete profile.tuitionDays;
      delete profile.tuitionStart;
      delete profile.tuitionEnd;
    }
    if (patch.name !== undefined) profile.name = text(patch.name, 'name', { max: 60, required: 'Enter your name' });
    if (patch.homeworkMins !== undefined) profile.homeworkMins = oneOf(patch.homeworkMins, HOMEWORK_SLOT_OPTIONS, 'homeworkMins');
    if (patch.ageMode !== undefined) profile.ageMode = oneOf(patch.ageMode, AGE_MODES, 'ageMode');
    if (patch.examSeason !== undefined) profile.examSeason = bool(patch.examSeason, 'examSeason');
    if (patch.sharing) {
      if (patch.sharing.parent !== undefined) profile.sharing.parent = bool(patch.sharing.parent, 'parent');
      if (patch.sharing.groups !== undefined) profile.sharing.groups = bool(patch.sharing.groups, 'groups');
      for (const [item, on] of Object.entries(patch.sharing.items ?? {})) {
        oneOf(item, SHARE_ITEMS, 'items');
        profile.sharing.items[item] = bool(on, item);
      }
    }
  });
  return getProfile();
}

/* ---------- First-time setup ---------- */

const PRIORITIES = ['high', 'medium', 'low'];
const amount = (value, max) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : undefined);
const shortText = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** Keeps only what is set, so the saved planner stays small. */
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== false));

/**
 * A chapter's details beyond name and difficulty, as the exam syllabus sends them: its unit,
 * whether it is important, weightage and marks, and its topics. Shown to the student; the
 * planner itself works on chapters. Anything that doesn't look right is dropped, not fatal.
 */
function chapterDetails(chapter) {
  const topics = Array.isArray(chapter?.topics)
    ? chapter.topics.slice(0, 80).flatMap((topic) => {
        const name = shortText(topic?.name, 160);
        if (!name) return [];
        const subtopics = Array.isArray(topic.subtopics)
          ? topic.subtopics.slice(0, 50).flatMap((sub) => {
              const subName = shortText(sub?.name, 160);
              return subName ? [compact({ name: subName, important: sub.important === true })] : [];
            })
          : [];
        return [compact({ name, important: topic.important === true, weightage: amount(topic.weightage, 100), marks: amount(topic.marks, 1000), priority: PRIORITIES.includes(topic.priority) ? topic.priority : undefined, subtopics: subtopics.length ? subtopics : undefined })];
      })
    : [];
  return compact({
    unit: shortText(chapter?.unit, 120),
    important: chapter?.important === true,
    weightage: amount(chapter?.weightage, 100),
    marks: amount(chapter?.marks, 1000),
    priority: PRIORITIES.includes(chapter?.priority) ? chapter.priority : undefined,
    grade: Number.isInteger(chapter?.grade) && chapter.grade >= 1 && chapter.grade <= 12 ? chapter.grade : undefined,
    topics: topics.length ? topics : undefined,
  });
}

/**
 * The subjects as downloaded from the server's syllabus catalogue. Chapter keys are
 * `<subject>-<n>` (1-based), the same rule the server uses, so ticked chapters line up.
 */
function cleanCatalog(catalog) {
  const subjects = list(catalog, 'catalog', { min: 1, max: MAX_CATALOG_SUBJECTS, message: 'That class has no subjects yet' });
  return subjects.map((subject) => {
    if (typeof subject?.id !== 'string' || !SUBJECT_ID.test(subject.id) || !Array.isArray(subject.chapters)) {
      throw badRequest('The syllabus for this class could not be read. Try again.', 'CATALOG_INVALID');
    }
    return {
      id: subject.id,
      name: text(subject.name, 'catalog', { max: 60 }),
      color: HEX_COLOR.test(subject.color) ? subject.color : FALLBACK_COLOR,
      chapters: subject.chapters.map((chapter, index) => ({
        key: `${subject.id}-${index + 1}`,
        name: text(chapter?.name, 'catalog', { max: 120 }),
        difficulty: [1, 2, 3].includes(chapter?.difficulty) ? chapter.difficulty : 2,
        ...chapterDetails(chapter),
      })),
    };
  });
}

function cleanCustomSubject(custom, index) {
  const field = (name) => `customSubjects.${index}.${name}`;
  if (typeof custom?.id !== 'string' || !CUSTOM_SUBJECT_ID.test(custom.id)) throw invalidField(field('id'), 'Unknown subject');
  if (!HEX_COLOR.test(custom.color)) throw invalidField(field('color'), 'Use a colour like #5AC8FA');
  const chapters = list(custom.chapters, field('chapters'), { min: 1, max: MAX_CUSTOM_CHAPTERS, message: 'Add at least one chapter' });
  return {
    id: custom.id,
    name: text(custom.name, field('name'), { max: 40, required: 'Give the subject a name' }),
    color: custom.color,
    chapters: chapters.map((chapter, n) => text(chapter, `${field('chapters')}.${n}`, { max: 80 })),
  };
}

/**
 * Works out the student's subjects and chapters from the class's catalogue plus any subjects
 * they added. Throws for anything that doesn't fit together.
 */
function resolveSubjects(catalog, chosenIds, customSubjects) {
  const chosen = new Set(chosenIds);
  if (chosen.size !== chosenIds.length) throw badRequest('A subject is listed twice', 'DUPLICATE_SUBJECT');

  const names = new Set(catalog.map((subject) => subject.name.toLowerCase()));
  const customIds = new Set();
  const added = customSubjects.map((custom, index) => {
    const subject = cleanCustomSubject(custom, index);
    if (customIds.has(subject.id)) throw badRequest('Two added subjects share an id', 'DUPLICATE_SUBJECT');
    if (names.has(subject.name.toLowerCase())) throw badRequest(`You already have a subject called ${subject.name}`, 'DUPLICATE_SUBJECT');
    customIds.add(subject.id);
    names.add(subject.name.toLowerCase());
    return subject;
  });
  const catalogIds = new Set(catalog.map((subject) => subject.id));
  for (const id of chosen) {
    if (!catalogIds.has(id) && !customIds.has(id)) throw badRequest(`Unknown subject ${id}`, 'UNKNOWN_SUBJECT');
  }

  const picked = catalog.filter((subject) => chosen.has(subject.id));
  const own = added.filter((subject) => chosen.has(subject.id));
  const subjectInfo = [
    ...picked.map(({ id, name, color }) => ({ id, name, color, custom: false })),
    ...own.map(({ id, name, color }) => ({ id, name, color, custom: true })),
  ];
  const chapters = [
    ...picked.flatMap((subject) => subject.chapters.map((chapter) => ({ ...chapter, subject: subject.id }))),
    ...own.flatMap((subject) =>
      subject.chapters.map((name, index) => ({ key: `${subject.id}-${index + 1}`, subject: subject.id, name, difficulty: CUSTOM_CHAPTER_DIFFICULTY })),
    ),
  ];
  return { subjectInfo, chapters };
}

function validExam(exam, index, { subjects, known, today }) {
  const field = (name) => `exams.${index}.${name}`;
  const name = text(exam.name, field('name'), { max: 80, required: 'Give the test a name' });
  if (!subjects.includes(exam.subject)) throw badRequest(`${name} is for a subject you turned off`, 'SUBJECT_NOT_SELECTED');
  const date = dateKey(exam.date, field('date'));
  if (date <= today) throw badRequest(`${name} must be after today`, 'EXAM_IN_PAST');
  const weight = intIn(exam.weight ?? 20, 1, 100, field('weight'));
  const chapterKeys = unique(list(exam.chapterKeys, field('chapterKeys'), { min: 1, max: 40, message: 'Tick at least one chapter' }));
  if (chapterKeys.some((key) => !key.startsWith(`${exam.subject}-`) || !known.has(key))) {
    throw badRequest(`${name} lists a chapter outside its subject`, 'UNKNOWN_CHAPTER');
  }
  const valid = { subject: exam.subject, name, date, weight, chapterKeys };
  // Papers added from the datesheet keep their exam's name and kind, grouped by series.
  return exam.series ? { ...valid, ...datesheetLabel(exam, `exams.${index}.`) } : valid;
}

/**
 * Creates the profile, chapters, tests and their study slots in one step.
 * `board` is the exam or board code and `catalog` its syllabus from the server
 * (`GET /syllabus/exams/:code/subjects`, or `GET /syllabus/:cls` in earlier versions). `cls` is
 * the school class, or null for exams without classes (JEE, NEET). From here on the student's
 * copy lives only on this device, so later catalogue edits don't change their plan.
 */
export function onboard(body) {
  const result = write((draft) => {
    if (draft.profile) throw conflict('Your planner is already set up', 'ALREADY_ONBOARDED');
    const name = text(body.name, 'name', { max: 60, required: 'Enter your name' });
    if (typeof body.board !== 'string' || !BOARD_CODE.test(body.board)) throw invalidField('board', 'Pick a board');
    const boardName = text(body.boardName ?? body.board, 'boardName', { max: 80 });
    const cls = body.cls === null || body.cls === undefined ? null : intIn(body.cls, 1, 12, 'cls');
    const exam = compact({
      examShortName: shortText(body.examShortName, 16),
      examCategory: shortText(body.examCategory, 32),
      level: shortText(body.level, 24),
      levelName: shortText(body.levelName, 40),
      syllabusVersion: shortText(body.syllabusVersion, 24),
      syllabusYear: shortText(body.syllabusYear, 7),
    });
    const catalog = cleanCatalog(body.catalog);
    const chosenIds = list(body.subjects, 'subjects', { min: 1, max: catalog.length + MAX_CUSTOM_SUBJECTS, message: 'Keep at least one subject' });
    const customSubjects = list(body.customSubjects ?? [], 'customSubjects', { max: MAX_CUSTOM_SUBJECTS });
    const { subjectInfo, chapters } = resolveSubjects(catalog, chosenIds, customSubjects);
    const subjects = subjectInfo.map((subject) => subject.id);
    // School times are required here; a student may have no tuition.
    timeOfDay(body.schoolStart, 'schoolStart');
    timeOfDay(body.schoolEnd, 'schoolEnd');
    const timings = cleanTimings({ ...body, tuitions: body.tuitions ?? [] });
    const dailyLimitMins = oneOf(body.dailyLimitMins, [120, 180, 240], 'dailyLimitMins');
    const homeworkMins = oneOf(body.homeworkMins ?? DEFAULT_HOMEWORK_MINS, HOMEWORK_SLOT_OPTIONS, 'homeworkMins');

    const { today, start } = localToday();
    const known = new Set(chapters.map((chapter) => chapter.key));
    const taught = new Set(list(body.taughtChapterKeys ?? [], 'taughtChapterKeys', { max: 600 }));
    for (const key of taught) if (!known.has(key)) throw badRequest(`Unknown chapter ${key}`, 'UNKNOWN_CHAPTER');
    const exams = list(body.exams ?? [], 'exams', { max: 20 }).map((exam, index) => validExam(exam, index, { subjects, known, today }));

    const profile = {
      name,
      cls,
      board: body.board,
      boardName,
      ...exam,
      timezone: clock.timeZone(),
      subjects,
      subjectInfo,
      ...timings,
      dailyLimitMins,
      homeworkMins,
      weeklyGoalMins: dailyLimitMins * 5,
      // Younger classes get the simpler planner; exams without a class are for older students.
      ageMode: cls !== null && cls <= 8 ? 'simple' : 'deeper',
      examSeason: false,
      sharing: { parent: false, items: { hours: true, streak: true, coverage: true, tests: true, marks: false }, groups: false },
      trackingStart: today,
      isDemo: false,
    };
    draft.profile = profile;
    draft.chapters = chapters.map((chapter, position) => ({
      ...chapter,
      position,
      status: taught.has(chapter.key) ? 'learning' : 'not',
      learnedOn: taught.has(chapter.key) ? addDays(today, -10) : null,
      revisions: taught.has(chapter.key) ? 1 : 0,
      snoozedUntil: null,
    }));
    // Papers from the same exam on the datesheet are stored together, as when added later.
    const groups = new Map();
    for (const { seriesName, kind, ...paper } of exams) {
      const key = seriesName ?? `single-${groups.size}`;
      if (!groups.has(key)) groups.set(key, { label: seriesName ? { seriesName, kind } : null, papers: [] });
      groups.get(key).papers.push(paper);
    }
    draft.exams = [...groups.values()].flatMap(({ label, papers }) =>
      label ? datesheetPapers(draft, label, papers) : papers.map((paper) => ({ id: newId(draft), type: 'unit', ...paper })),
    );
    // Each test fills the calendar with self study, homework and revision slots.
    const planned = planPapers(draft, draft.exams, { profile, today, start });
    return { added: planned.added, firstDate: planned.firstDate };
  });
  return { profile: getProfile(), planned: result.added, firstDate: result.firstDate };
}

/** Colours for subjects the student adds, in turn (the same ones setup uses). */
const CUSTOM_COLORS = ['#5AC8FA', '#FFCC00', '#5856D6', '#A2845E', '#30B0C7', '#FF6482'];

/**
 * Adds a subject after setup: `{ name, chapters: [chapter names] }`. Its chapters start as
 * not started, after every other chapter.
 */
export function addSubject(input) {
  return write((draft) => {
    const { profile } = studentDay(draft);
    const subjects = subjectInfoOf(profile);
    const taken = new Set(subjects.map((subject) => subject.id));
    const id = Array.from({ length: MAX_CUSTOM_SUBJECTS }, (_, index) => `custom${index + 1}`).find((candidate) => !taken.has(candidate));
    if (!id) throw conflict(`You can add up to ${MAX_CUSTOM_SUBJECTS} subjects of your own`, 'TOO_MANY_SUBJECTS');
    const usedColors = new Set(subjects.map((subject) => subject.color));
    const color = CUSTOM_COLORS.find((candidate) => !usedColors.has(candidate)) ?? CUSTOM_COLORS[subjects.length % CUSTOM_COLORS.length];
    const subject = cleanCustomSubject({ name: input?.name, chapters: input?.chapters, id, color }, 0);
    if (subjects.some((existing) => existing.name.toLowerCase() === subject.name.toLowerCase())) {
      throw badRequest(`You already have a subject called ${subject.name}`, 'DUPLICATE_SUBJECT');
    }

    profile.subjectInfo = [...subjects, { id, name: subject.name, color, custom: true }];
    profile.subjects = [...profile.subjects, id];
    const first = draft.chapters.reduce((last, chapter) => Math.max(last, chapter.position + 1), 0);
    draft.chapters.push(
      ...subject.chapters.map((name, index) => ({
        key: `${id}-${index + 1}`,
        subject: id,
        name,
        difficulty: CUSTOM_CHAPTER_DIFFICULTY,
        position: first + index,
        status: 'not',
        learnedOn: null,
        revisions: 0,
        snoozedUntil: null,
      })),
    );
    return { id, name: subject.name, color, chapters: subject.chapters.length };
  });
}

/** Replaces everything with the demo student's realistic week (CBSE Class 9, built into the app). */
export function seedDemo(name) {
  const { today } = localToday();
  const demo = buildDemoData(today, clock.timeZone());
  write((draft) => {
    Object.assign(draft, emptyData(), { seq: draft.seq });
    draft.profile = { ...demo.profile, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'Asha' };
    draft.chapters = demo.chapters;
    draft.exams = demo.exams.map((exam) => ({ id: newId(draft), ...exam }));
    const idByRef = new Map();
    draft.homework = demo.homework.map(({ ref, ...item }) => {
      const id = newId(draft);
      idByRef.set(ref, id);
      return { id, ...item };
    });
    insertTasks(
      draft,
      demo.tasks.map(({ homeworkRef, ...task }) => ({ ...task, homeworkId: homeworkRef ? (idByRef.get(homeworkRef) ?? null) : null })),
    );
    draft.focusSessions = demo.focus.map((session) => ({ id: newId(draft), ...session, createdAt: clock.now().toISOString() }));
    for (const date of demo.restDays) upsertLog(draft, date, { rest: true });
  });
  return { profile: getProfile(), planned: 0, firstDate: null };
}

/** "Start over": deletes every planner record on this device for this account. */
export function wipeAll() {
  replaceAll(emptyData());
  return null;
}
