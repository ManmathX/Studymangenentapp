import { addDays, diffDays, weekday } from './core/dates';
import {
  AFTER_SCHOOL_BREAK_OPTIONS,
  afterSchoolBreakOf,
  DAY_END,
  MAX_STUDY_SESSIONS,
  MEAL_LENGTHS,
  MEALS,
  mealsOf,
  isSlotKey,
  STUDY_END_OPTIONS,
  WAKE_EARLIEST,
  WAKE_LATEST,
  wakeOf,
  weeklyClash,
} from './core/dayFrame';
import { buildDemoData } from './core/demoSeed';
import {
  DEFAULT_HOMEWORK_MINS,
  HOMEWORK_SLOT_OPTIONS,
  MAX_TUITIONS,
  SATURDAY_MODES,
  schoolHours,
  TUITION_EARLIEST,
  TUITION_LATEST,
  tuitionsOf,
} from './core/engine';
import { REMINDER_KINDS, REMINDER_LEAD_OPTIONS, remindersOf } from './core/reminderSettings';
import { routineOf } from './core/routine';
import { AGE_MODES, EXAM_SERIES } from './core/types';
import { clock } from './clock';
import { emptyData, read, replaceAll, write } from './db';
import { badRequest, conflict, invalidField, notFound } from './errors';
import { copy, insertTasks, localToday, newId, studentDay, subjectInfoOf, upsertLog } from './queries';
import { clearDailyPlanFor, datesheetLabel, datesheetPapers, paperTime, planPapers } from './study';
import { bool, clock24, dateKey, intIn, list, oneOf, text, timeMinutes, unique, WEEKDAY_NAMES } from './validate';

const MIN_SESSION_MINS = 30;

const SHARE_ITEMS = ['hours', 'streak', 'coverage', 'tests', 'marks'];

/** Turns reminder kinds on or off (`{ slots: false }`) and sets how early slot reminders come (`leadMins`). */
function cleanReminders(input, profile) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidField('reminders', 'Send the reminders to change');
  const next = remindersOf(profile);
  for (const [key, value] of Object.entries(input)) {
    if (key === 'leadMins') next.leadMins = oneOf(value, REMINDER_LEAD_OPTIONS, 'reminders.leadMins');
    else if (REMINDER_KINDS.includes(key)) next[key] = bool(value, `reminders.${key}`);
    else throw invalidField('reminders', `Unknown reminder ${key}`);
  }
  return next;
}

/** One tuition from the form: optional name, its days, and "HH:MM" start and end. */
function cleanTuition(tuition, index, all) {
  const field = (name) => `tuitions.${index}.${name}`;
  const name = tuition?.name === undefined || tuition.name === null ? '' : text(tuition.name, field('name'), { min: 0, max: 40 });
  const label = name || (all.length > 1 ? `Tuition ${index + 1}` : 'tuition');
  const days = list(tuition?.days, field('days'), { min: 1, max: 7, message: `Pick the days for ${label}` });
  return {
    name,
    days: unique(days.map((day) => intIn(day, 0, 6, field('days')))).sort((a, b) => a - b),
    start: timeMinutes(tuition.start, field('start')),
    end: timeMinutes(tuition.end, field('end')),
  };
}

/** One self-study session from the form: "HH:MM" start and end. */
function cleanSession(session, index) {
  const field = (name) => `studySessions.${index}.${name}`;
  return { start: timeMinutes(session?.start, field('start')), end: timeMinutes(session?.end, field('end')) };
}

/**
 * School hours ("HH:MM"), Saturdays, the list of tuitions, the student's own study sessions
 * and their stop time. Fields left out keep `current`'s value (the saved profile when editing
 * later). Everything is checked together, since moving school can make a tuition or a timed
 * habit that was fine clash with it.
 */
/** At least this much sleep between the sleep time and waking up (teens need 8 to 10 hours). */
const MIN_SLEEP_MINS = 7 * 60;
/** Lunch on days without school, and dinner, must fall in sensible hours. */
const MEAL_WINDOWS = { breakfast: [WAKE_EARLIEST, 11 * 60], lunch: [11 * 60, 15 * 60 + 30], dinner: [18 * 60, 22 * 60] };
const MEAL_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

/** Breakfast, lunch and dinner: `{ at: "HH:MM", mins }` each; meals left out keep `current`'s. */
function cleanMeals(input, current, wake, sleep) {
  const meals = mealsOf(current);
  for (const meal of MEALS) {
    const patch = input?.[meal];
    if (patch === undefined) continue;
    const field = (name) => `meals.${meal}.${name}`;
    const at = patch.at === undefined ? meals[meal].at : timeMinutes(patch.at, field('at'));
    const mins = patch.mins === undefined ? meals[meal].mins : oneOf(patch.mins, MEAL_LENGTHS[meal], field('mins'));
    const [from, to] = MEAL_WINDOWS[meal];
    if (at < from || at > to) throw invalidField(field('at'), `${MEAL_NAMES[meal]} has to be between ${clock24(from)} and ${clock24(to)}`);
    meals[meal] = { at, mins };
  }
  if (meals.breakfast.at < wake) throw invalidField('meals.breakfast.at', `Breakfast has to be after you wake up (${clock24(wake)})`);
  if (meals.dinner.at + meals.dinner.mins > sleep) throw invalidField('meals.dinner.at', `Dinner has to finish before you sleep (${clock24(sleep)})`);
  return meals;
}

function cleanTimings(input, current = {}) {
  const minutes = (field, fallback) => (input[field] === undefined ? fallback : timeMinutes(input[field], field));
  const wakeAt = input.wakeAt === undefined ? wakeOf(current) : timeMinutes(input.wakeAt, 'wakeAt');
  if (wakeAt < WAKE_EARLIEST || wakeAt > WAKE_LATEST) throw invalidField('wakeAt', `Pick a wake-up time between ${clock24(WAKE_EARLIEST)} and ${clock24(WAKE_LATEST)}`);
  const next = {
    wakeAt,
    afterSchoolBreakMins:
      input.afterSchoolBreakMins === undefined ? afterSchoolBreakOf(current) : oneOf(input.afterSchoolBreakMins, AFTER_SCHOOL_BREAK_OPTIONS, 'afterSchoolBreakMins'),
    schoolWeek: current.schoolWeek ?? {},
    schoolStart: minutes('schoolStart', current.schoolStart),
    schoolEnd: minutes('schoolEnd', current.schoolEnd),
    saturday: input.saturday === undefined ? (current.saturday ?? 'half') : oneOf(input.saturday, SATURDAY_MODES, 'saturday'),
    tuitions:
      input.tuitions === undefined
        ? tuitionsOf(current)
        : list(input.tuitions, 'tuitions', { max: MAX_TUITIONS, message: 'Add tuitions one by one' }).map(cleanTuition),
    studyEnd: input.studyEnd === undefined ? (current.studyEnd ?? DAY_END) : oneOf(timeMinutes(input.studyEnd, 'studyEnd'), STUDY_END_OPTIONS, 'studyEnd'),
    studySessions:
      input.studySessions === undefined
        ? (current.studySessions ?? [])
        : list(input.studySessions, 'studySessions', { max: MAX_STUDY_SESSIONS, message: 'Add study sessions one by one' })
            .map(cleanSession)
            .sort((a, b) => a.start - b.start),
  };
  if (next.schoolEnd <= next.schoolStart) throw invalidField('schoolEnd', 'School has to end after it starts');
  if (24 * 60 - next.studyEnd + next.wakeAt < MIN_SLEEP_MINS) {
    throw invalidField('wakeAt', `That leaves less than ${MIN_SLEEP_MINS / 60} hours of sleep. Teens need 8 to 10 hours.`);
  }
  if (next.schoolStart < next.wakeAt) throw invalidField('schoolStart', `School starts before you wake up (${clock24(next.wakeAt)})`);
  next.meals = cleanMeals(input.meals, current, next.wakeAt, next.studyEnd);
  next.studySessions.forEach((session, index) => {
    const field = (name) => `studySessions.${index}.${name}`;
    if (session.end - session.start < MIN_SESSION_MINS) throw invalidField(field('end'), `A study session needs at least ${MIN_SESSION_MINS} minutes`);
    if (session.start < next.wakeAt) throw invalidField(field('start'), `Start study sessions after you wake up (${clock24(next.wakeAt)})`);
    if (session.end > next.studyEnd) throw invalidField(field('end'), `End study sessions by ${clock24(next.studyEnd)}, when you sleep`);
    const before = next.studySessions[index - 1];
    if (before && session.start < before.end) throw invalidField(field('start'), 'Your two study sessions overlap');
  });

  const labelOf = (index) => next.tuitions[index].name || (next.tuitions.length > 1 ? `Tuition ${index + 1}` : 'Tuition');
  next.tuitions.forEach((tuition, index) => {
    const field = (name) => `tuitions.${index}.${name}`;
    const label = labelOf(index);
    if (tuition.end <= tuition.start) throw invalidField(field('end'), `${label} has to end after it starts`);
    if (tuition.start < TUITION_EARLIEST || tuition.end > TUITION_LATEST) {
      throw invalidField(field('start'), `${label} has to be between ${clock24(TUITION_EARLIEST)} and ${clock24(TUITION_LATEST)}`);
    }
    if (tuition.start < next.wakeAt) throw invalidField(field('start'), `${label} starts before you wake up (${clock24(next.wakeAt)})`);
    if (tuition.end > next.studyEnd) throw invalidField(field('end'), `${label} ends after you sleep (${clock24(next.studyEnd)})`);
    for (const day of tuition.days) {
      const school = schoolHours(next, day);
      if (school && tuition.start < school.end && tuition.end > school.start) {
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
  // A habit with a set time must still fit around school and every tuition.
  for (const habit of Array.isArray(current.routine) ? current.routine : []) {
    if (!Number.isInteger(habit.at)) continue;
    const clash = weeklyClash(next, { days: habit.days, start: habit.at, end: habit.at + habit.mins }, { habits: false });
    if (clash) {
      const field = clash.kind === 'tuition' ? `tuitions.${clash.index}.start` : 'schoolStart';
      throw invalidField(field, `${habit.name} on ${WEEKDAY_NAMES[clash.day]} clashes with ${clash.label} (${clock24(clash.start)} to ${clock24(clash.end)}). Change the habit’s time first.`);
    }
  }
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
    saturday: profile.saturday ?? 'half',
    tuitions: tuitionsDto(profile),
    studyEnd: profile.studyEnd ?? DAY_END,
    studySessions: (profile.studySessions ?? []).map(({ start, end }) => ({ start, end })),
    wakeAt: wakeOf(profile),
    meals: mealsOf(profile),
    afterSchoolBreakMins: afterSchoolBreakOf(profile),
    schoolWeek: copy(profile.schoolWeek ?? {}),
    timingChanges: copy((profile.timingChanges ?? []).filter((change) => change.to >= today)),
    periods: copy(profile.periods ?? {}),
    holidays: (profile.holidays ?? []).map(({ id, name, from, to }) => ({ id, name, from, to })),
    dailyLimitMins: profile.dailyLimitMins,
    homeworkMins: profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS,
    weeklyGoalMins: profile.weeklyGoalMins,
    ageMode: profile.ageMode,
    examSeason: profile.examSeason,
    sharing: profile.sharing,
    reminders: remindersOf(profile),
    isDemo: profile.isDemo,
    today,
  });
}

export function getProfile() {
  const { profile, today } = studentDay(read());
  return profileDto(profile, today);
}

const TIMING_FIELDS = ['schoolStart', 'schoolEnd', 'saturday', 'tuitions', 'studyEnd', 'studySessions', 'wakeAt', 'meals', 'afterSchoolBreakMins'];

/**
 * Change name, age mode, exam season, the daily homework slot, what is shared, school hours
 * ("HH:MM"), Saturdays (`half`, `full`, `off`, `alternate`), the whole list of tuitions
 * (`[{ name, days, start, end }]`, times "HH:MM", days 0 = Sunday … 6 = Saturday), the stop
 * time (`studyEnd`) or up to two self-study sessions (`studySessions: [{ start, end }]`).
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
    if (patch.periods !== undefined) profile.periods = cleanPeriods(patch.periods, profile);
    if (patch.homeworkMins !== undefined) profile.homeworkMins = oneOf(patch.homeworkMins, HOMEWORK_SLOT_OPTIONS, 'homeworkMins');
    if (patch.ageMode !== undefined) profile.ageMode = oneOf(patch.ageMode, AGE_MODES, 'ageMode');
    if (patch.examSeason !== undefined) profile.examSeason = bool(patch.examSeason, 'examSeason');
    if (patch.reminders !== undefined) profile.reminders = cleanReminders(patch.reminders, profile);
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
  if (!exam.series) return valid;
  // Papers added from the datesheet keep their exam's name and kind, grouped by series; a
  // half-yearly or final also keeps its paper time and whether school is only for papers.
  const label = datesheetLabel(exam, `exams.${index}.`);
  const timing = EXAM_SERIES[label.kind]
    ? { ...paperTime(exam), ...(exam.studyLeave === undefined ? {} : { studyLeave: bool(exam.studyLeave, `exams.${index}.studyLeave`) }) }
    : {};
  return { ...valid, ...label, timing };
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
    timeMinutes(body.schoolStart, 'schoolStart');
    timeMinutes(body.schoolEnd, 'schoolEnd');
    const timings = cleanTimings({ ...body, tuitions: body.tuitions ?? [] });
    // There is no daily study limit any more; an older app may still send one, and it only sets the weekly goal.
    const dailyLimitMins = body.dailyLimitMins === undefined ? 180 : oneOf(body.dailyLimitMins, [120, 180, 240], 'dailyLimitMins');
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
    for (const { seriesName, kind, timing, ...paper } of exams) {
      const key = seriesName ?? `single-${groups.size}`;
      if (!groups.has(key)) groups.set(key, { label: seriesName ? { seriesName, kind } : null, timing: timing ?? {}, papers: [] });
      groups.get(key).papers.push(paper);
    }
    draft.exams = [...groups.values()].flatMap(({ label, timing, papers }) =>
      label ? datesheetPapers(draft, label, papers, timing) : papers.map((paper) => ({ id: newId(draft), type: 'unit', ...paper })),
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

/* ---------- Class timetable and timing changes ---------- */

const MAX_PERIODS = 10;

/** The class timetable: `{ [weekday]: [subject ids in period order] }` (0 = Sunday … 6 = Saturday). */
function cleanPeriods(input, profile) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidField('periods', 'Send the periods for each weekday');
  const periods = {};
  for (const [key, subjects] of Object.entries(input)) {
    const day = intIn(Number(key), 0, 6, 'periods');
    const list_ = list(subjects, `periods.${day}`, { max: MAX_PERIODS, message: 'Add periods one by one' });
    for (const subject of list_) if (!profile.subjects.includes(subject)) throw invalidField(`periods.${day}`, 'Pick periods from your subjects');
    if (list_.length) periods[day] = list_;
  }
  return periods;
}

/** What a change sets school to: hours ("HH:MM" start and end), or `{ off: true }`. */
function cleanSchoolChange(school, wake, sleep) {
  if (school?.off === true) return { off: true };
  const start = timeMinutes(school?.start, 'school.start');
  const end = timeMinutes(school?.end, 'school.end');
  if (end <= start) throw invalidField('school.end', 'School has to end after it starts');
  if (start < wake) throw invalidField('school.start', `School starts before you wake up (${clock24(wake)})`);
  if (end > sleep) throw invalidField('school.end', 'School has to end before you sleep');
  return { start, end };
}

/** Monday of the week of `date`, and the first day of its month. */
const weekStartOf = (date) => addDays(date, -((weekday(date) + 6) % 7));
const monthEndOf = (date) => addDays(`${addDays(`${date.slice(0, 7)}-01`, 31).slice(0, 7)}-01`, -1);

export const TIMING_SCOPES = ['day', 'week', 'month', 'weekday', 'always'];

/**
 * Changes school (and, for one day, tuition) timings from the calendar. `scope` says for how
 * long: 'day' (just `date`), 'week' (its Monday to Sunday), 'month' (its whole month),
 * 'weekday' (every such weekday from now on) or 'always' (every school day from now on).
 * `school` is `{ start, end }` ("HH:MM") or `{ off: true }`; `tuitions` (day only) replaces that
 * day's tuitions (`[{ name, start, end }]`). The latest change wins where changes overlap.
 */
export function changeTimings(input) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const date = dateKey(input?.date, 'date');
    if (date < today) throw badRequest('Pick today or a later day', 'DATE_IN_PAST');
    const scope = oneOf(input?.scope, TIMING_SCOPES, 'scope');
    const wake = wakeOf(profile);
    const sleep = profile.studyEnd ?? DAY_END;
    const school = input?.school === undefined || input?.school === null ? null : cleanSchoolChange(input.school, wake, sleep);
    let tuitions = null;
    if (input?.tuitions !== undefined && input?.tuitions !== null) {
      if (scope !== 'day') throw badRequest('Tuition times can be changed for one day at a time', 'TUITIONS_FOR_ONE_DAY');
      tuitions = list(input.tuitions, 'tuitions', { max: MAX_TUITIONS, message: 'Add tuitions one by one' }).map((tuition, index) => {
        const field = (name) => `tuitions.${index}.${name}`;
        const name = tuition?.name ? text(tuition.name, field('name'), { min: 0, max: 40 }) : '';
        const start = timeMinutes(tuition?.start, field('start'));
        const end = timeMinutes(tuition?.end, field('end'));
        if (end <= start) throw invalidField(field('end'), `${name || 'Tuition'} has to end after it starts`);
        if (start < wake || end > sleep) throw invalidField(field('start'), `${name || 'Tuition'} has to be between waking up and sleep`);
        return { name, start, end };
      });
      tuitions.forEach((tuition, index) => {
        if (school && !school.off && tuition.start < school.end && tuition.end > school.start) throw invalidField(`tuitions.${index}.start`, `${tuition.name || 'Tuition'} clashes with school that day`);
        const other = tuitions.find((item, at) => at > index && tuition.start < item.end && tuition.end > item.start);
        if (other) throw invalidField(`tuitions.${index}.start`, `${tuition.name || 'Tuition'} and ${other.name || 'another tuition'} overlap`);
      });
    }
    if (!school && !tuitions) throw badRequest('Change the school or tuition times', 'NOTHING_TO_CHANGE');

    if (scope === 'weekday' || scope === 'always') {
      if (!school) throw badRequest('Only school times can be changed for every week', 'SCHOOL_ONLY');
      const next = { ...profile };
      if (scope === 'weekday') next.schoolWeek = { ...(profile.schoolWeek ?? {}), [weekday(date)]: school };
      else if (school.off) throw badRequest('To stop school on every day, add a holiday instead', 'USE_A_HOLIDAY');
      else Object.assign(next, { schoolStart: school.start, schoolEnd: school.end });
      // The weekly timetable must still fit every tuition and timed habit.
      Object.assign(profile, cleanTimings({}, next));
      return { scope, weekday: weekday(date), school: copy(school) };
    }
    const from = scope === 'day' ? date : scope === 'week' ? maxDate(weekStartOf(date), today) : maxDate(`${date.slice(0, 7)}-01`, today);
    const to = scope === 'day' ? date : scope === 'week' ? addDays(weekStartOf(date), 6) : monthEndOf(date);
    const change = { id: newId(draft), scope, from, to, school, tuitions };
    // Changes that are over are forgotten.
    profile.timingChanges = [...(profile.timingChanges ?? []).filter((item) => item.to >= today), change];
    return copy(change);
  });
}

const maxDate = (a, b) => (a > b ? a : b);

/** Removes a timing change: those days follow the normal timetable again. */
export function removeTimingChange(id) {
  write((draft) => {
    const { profile } = studentDay(draft);
    const changes = profile.timingChanges ?? [];
    if (!changes.some((change) => change.id === id)) throw notFound('That change was not found', 'TIMING_CHANGE_NOT_FOUND');
    profile.timingChanges = changes.filter((change) => change.id !== id);
  });
  return null;
}

/** Makes a weekday follow the normal school times again. */
export function resetSchoolDay(day) {
  return write((draft) => {
    const { profile } = studentDay(draft);
    intIn(day, 0, 6, 'day');
    const { [day]: _removed, ...rest } = profile.schoolWeek ?? {};
    const next = { ...profile, schoolWeek: rest };
    Object.assign(profile, cleanTimings({}, next));
    return copy(profile.schoolWeek);
  });
}

/* ---------- Moving, resizing and removing slots ---------- */

const SLOT_MAX_MINS = 240;

/**
 * Edits a slot or routine block from the calendar: move it (`start` "HH:MM"), change its length
 * (`mins`), or remove it (`removed: true`), for one day (`scope: 'day'`, the default) or every
 * day (`scope: 'always'`). `key` is 'breakfast', 'lunch', 'dinner', 'break', 'homework', 'study',
 * 'night' or 'habit:<id>'. Self study can only be removed: it is the free time that is left.
 * The days it changes are planned afresh.
 */
export function editSlot(input) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const key = input?.key;
    if (typeof key !== 'string' || !isSlotKey(key)) throw invalidField('key', 'Pick a slot to change');
    if (key.startsWith('habit:') && !routineOf(profile).some((habit) => `habit:${habit.id}` === key)) throw notFound('That habit isn’t in your routine', 'HABIT_NOT_FOUND');
    const scope = oneOf(input.scope ?? 'day', ['day', 'always'], 'scope');
    const date = scope === 'day' ? dateKey(input.date, 'date') : '*';
    if (scope === 'day' && date < today) throw badRequest('Pick today or a later day', 'DATE_IN_PAST');
    let edit;
    if (input.removed === true) {
      edit = { removed: true };
    } else {
      if (key === 'study') throw badRequest('Self study is the free time that is left: move the other slots, or remove it for the day', 'STUDY_CANNOT_MOVE');
      const start = timeMinutes(input.start, 'start');
      const mins = input.mins === undefined || input.mins === null ? undefined : intIn(input.mins, 5, SLOT_MAX_MINS, 'mins');
      const wake = wakeOf(profile);
      const sleep = profile.studyEnd ?? DAY_END;
      if (start < wake) throw invalidField('start', `That is before you wake up (${clock24(wake)})`);
      if (start + (mins ?? 0) > sleep || start >= sleep) throw invalidField('start', `That runs into your sleep time (${clock24(sleep)})`);
      edit = { start, ...(mins ? { mins } : {}) };
    }
    const edits = profile.slotEdits ?? {};
    // Day edits that are over are forgotten.
    const kept = Object.fromEntries(Object.entries(edits).filter(([day]) => day === '*' || day >= today));
    kept[date] = { ...(kept[date] ?? {}), [key]: edit };
    profile.slotEdits = kept;
    replanFrom(draft, scope === 'day' ? date : today, scope === 'day' ? date : null);
    return { key, scope, date: scope === 'day' ? date : null, ...copy(edit) };
  });
}

/** Puts a slot back as usual, for one day or every day. */
export function resetSlot(input) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const key = input?.key;
    if (typeof key !== 'string' || !isSlotKey(key)) throw invalidField('key', 'Pick a slot to change');
    const scope = oneOf(input.scope ?? 'day', ['day', 'always'], 'scope');
    const date = scope === 'day' ? dateKey(input.date, 'date') : '*';
    const edits = profile.slotEdits ?? {};
    if (!edits[date]?.[key]) throw notFound('That slot is already as usual', 'SLOT_NOT_EDITED');
    const { [key]: _gone, ...rest } = edits[date];
    profile.slotEdits = { ...edits, [date]: rest };
    if (!Object.keys(rest).length) delete profile.slotEdits[date];
    replanFrom(draft, scope === 'day' ? date : today, scope === 'day' ? date : null);
    return null;
  });
}

/**
 * The open daily plan for a day (or every day from `from` when `only` is null) is planned again
 * next time Today opens, around the changed slots. Rest days stay rest days (that is in their log).
 */
function replanFrom(draft, from, only) {
  const dates = Object.keys(draft.dailyPlan ?? {}).filter((date) => (only ? date === only : date >= from));
  for (const date of dates) clearDailyPlanFor(draft, date, { rest: false });
}

/* ---------- Holidays and breaks ---------- */

export const MAX_HOLIDAYS = 30;
const MAX_HOLIDAY_DAYS = 92;

/**
 * Adds a holiday or break (`{ name, from, to }`; `to` defaults to `from`). There is no school
 * on those days, so they are planned like a Sunday; tuitions and habits still happen.
 */
export function addHoliday(input) {
  return write((draft) => {
    const { profile, today } = studentDay(draft);
    const name = text(input?.name, 'name', { max: 40, required: 'Name the holiday, for example "Diwali break"' });
    const from = dateKey(input?.from, 'from');
    const to = input?.to === undefined || input?.to === null ? from : dateKey(input.to, 'to');
    if (to < from) throw invalidField('to', 'The last day can’t be before the first day');
    if (diffDays(from, to) >= MAX_HOLIDAY_DAYS) throw invalidField('to', `Keep one break under ${MAX_HOLIDAY_DAYS} days`);
    if (to < today) throw badRequest('That holiday is already over', 'HOLIDAY_IN_PAST');
    const holidays = profile.holidays ?? [];
    if (holidays.length >= MAX_HOLIDAYS) throw conflict(`You can keep up to ${MAX_HOLIDAYS} holidays`, 'TOO_MANY_HOLIDAYS');
    const holiday = { id: newId(draft), name, from, to };
    profile.holidays = [...holidays, holiday].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    return copy(holiday);
  });
}

/** Removes a holiday; those days have school again. */
export function removeHoliday(id) {
  write((draft) => {
    const { profile } = studentDay(draft);
    const holidays = profile.holidays ?? [];
    if (!holidays.some((holiday) => holiday.id === id)) throw notFound('Holiday not found', 'HOLIDAY_NOT_FOUND');
    profile.holidays = holidays.filter((holiday) => holiday.id !== id);
  });
  return null;
}

/** "Start over": deletes every planner record on this device for this account. */
export function wipeAll() {
  replaceAll(emptyData());
  return null;
}
