import { addDays } from './core/dates';
import { buildDemoData } from './core/demoSeed';
import { DEFAULT_HOMEWORK_MINS, HOMEWORK_SLOT_OPTIONS } from './core/engine';
import { ALL_CLASSES, catalogChapters, isSupportedClass, SUBJECT_IDS, SUBJECTS } from './core/syllabus';
import { AGE_MODES } from './core/types';
import { clock } from './clock';
import { emptyData, read, replaceAll, write } from './db';
import { badRequest, conflict, invalidField, notFound } from './errors';
import { copy, insertTasks, localToday, newId, studentDay, upsertLog } from './queries';
import { planForExam } from './study';
import { bool, dateKey, intIn, list, oneOf, text, timeOfDay, unique } from './validate';

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const SHARE_ITEMS = ['hours', 'streak', 'coverage', 'tests', 'marks'];

/* ---------- Syllabus ---------- */

export function syllabusClasses() {
  return ALL_CLASSES.map((cls) => ({ cls, available: isSupportedClass(cls) }));
}

export function syllabusFor(cls) {
  if (!isSupportedClass(cls)) throw notFound('That class is not available yet', 'CLASS_NOT_AVAILABLE');
  const chapters = catalogChapters(cls);
  return SUBJECT_IDS.map((id) => ({
    ...SUBJECTS[id],
    chapters: chapters.filter((chapter) => chapter.subject === id).map(({ key, name, difficulty }) => ({ key, name, difficulty })),
  }));
}

/* ---------- Profile ---------- */

function profileDto(profile, today) {
  return copy({
    name: profile.name,
    cls: profile.cls,
    board: profile.board,
    timezone: profile.timezone,
    subjects: profile.subjects,
    schoolStart: profile.schoolStart,
    schoolEnd: profile.schoolEnd,
    tuitionDays: profile.tuitionDays,
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

/** Change name, age mode, exam season, the daily homework slot or what a parent summary includes. */
export function updateProfile(patch) {
  if (!patch || !Object.keys(patch).length) throw badRequest('Send at least one field to change');
  write((draft) => {
    const { profile } = studentDay(draft);
    if (patch.name !== undefined) profile.name = text(patch.name, 'name', { max: 60, required: 'Enter your name' });
    if (patch.homeworkMins !== undefined) profile.homeworkMins = oneOf(patch.homeworkMins, HOMEWORK_SLOT_OPTIONS, 'homeworkMins');
    if (patch.ageMode !== undefined) profile.ageMode = oneOf(patch.ageMode, AGE_MODES, 'ageMode');
    if (patch.examSeason !== undefined) profile.examSeason = bool(patch.examSeason, 'examSeason');
    if (patch.sharing) {
      if (patch.sharing.parent !== undefined) profile.sharing.parent = bool(patch.sharing.parent, 'parent');
      for (const [item, on] of Object.entries(patch.sharing.items ?? {})) {
        oneOf(item, SHARE_ITEMS, 'items');
        profile.sharing.items[item] = bool(on, item);
      }
    }
  });
  return getProfile();
}

/* ---------- First-time setup ---------- */

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
  return { subject: exam.subject, name, date, weight, chapterKeys };
}

/** Creates the profile, chapters, tests and first suggested study blocks in one step. */
export function onboard(body) {
  const result = write((draft) => {
    if (draft.profile) throw conflict('Your planner is already set up', 'ALREADY_ONBOARDED');
    const name = text(body.name, 'name', { max: 60, required: 'Enter your name' });
    intIn(body.cls, 6, 12, 'cls');
    if (!isSupportedClass(body.cls)) throw badRequest('That class is not available yet', 'CLASS_NOT_AVAILABLE');
    const chosen = list(body.subjects, 'subjects', { min: 1, max: SUBJECT_IDS.length, message: 'Keep at least one subject' });
    for (const subject of chosen) oneOf(subject, SUBJECT_IDS, 'subjects');
    const subjects = SUBJECT_IDS.filter((id) => chosen.includes(id));
    const schoolStart = toMinutes(timeOfDay(body.schoolStart, 'schoolStart'));
    const schoolEnd = toMinutes(timeOfDay(body.schoolEnd, 'schoolEnd'));
    if (schoolEnd <= schoolStart) throw invalidField('schoolEnd', 'School has to end after it starts');
    const tuitionDays = unique(list(body.tuitionDays ?? [], 'tuitionDays', { max: 6 }).map((day) => intIn(day, 1, 6, 'tuitionDays'))).sort();
    const dailyLimitMins = oneOf(body.dailyLimitMins, [120, 180, 240], 'dailyLimitMins');
    const homeworkMins = oneOf(body.homeworkMins ?? DEFAULT_HOMEWORK_MINS, HOMEWORK_SLOT_OPTIONS, 'homeworkMins');

    const { today, start } = localToday();
    const catalog = catalogChapters(body.cls, subjects);
    const known = new Set(catalog.map((chapter) => chapter.key));
    const taught = new Set(body.taughtChapterKeys ?? []);
    for (const key of taught) if (!known.has(key)) throw badRequest(`Unknown chapter ${key}`, 'UNKNOWN_CHAPTER');
    const exams = list(body.exams ?? [], 'exams', { max: 20 }).map((exam, index) => validExam(exam, index, { subjects, known, today }));

    const profile = {
      name,
      cls: body.cls,
      board: 'CBSE',
      timezone: clock.timeZone(),
      subjects,
      schoolStart,
      schoolEnd,
      tuitionDays,
      dailyLimitMins,
      homeworkMins,
      weeklyGoalMins: dailyLimitMins * 5,
      ageMode: body.cls <= 8 ? 'simple' : 'deeper',
      examSeason: false,
      sharing: { parent: false, items: { hours: true, streak: true, coverage: true, tests: true, marks: false }, groups: false },
      trackingStart: today,
      isDemo: false,
    };
    draft.profile = profile;
    draft.chapters = catalog.map((chapter, position) => ({
      ...chapter,
      position,
      status: taught.has(chapter.key) ? 'learning' : 'not',
      learnedOn: taught.has(chapter.key) ? addDays(today, -10) : null,
      revisions: taught.has(chapter.key) ? 1 : 0,
      snoozedUntil: null,
    }));
    draft.exams = exams.map((exam) => ({ id: newId(draft), ...exam }));
    // Each test fills the calendar with self study, homework and revision slots, soonest test first.
    const ctx = { profile, today, start };
    const plans = [...draft.exams].sort((a, b) => (a.date < b.date ? -1 : 1)).map((exam) => planForExam(draft, exam, ctx));
    const firstDates = plans.map((plan) => plan.firstDate).filter(Boolean).sort();
    return { added: plans.reduce((sum, plan) => sum + plan.added, 0), firstDate: firstDates[0] ?? null };
  });
  return { profile: getProfile(), planned: result.added, firstDate: result.firstDate };
}

/** Replaces everything with the demo student's realistic week. */
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

/** "Start over": deletes every planner record on this device. */
export function wipeAll() {
  replaceAll(emptyData());
  return null;
}
