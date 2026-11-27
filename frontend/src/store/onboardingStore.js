import { create } from 'zustand';
import { newTuition } from '../utils/tuitions';

/** Matches the API: up to 6 added subjects (`custom1` … `custom6`), 40 chapters each. */
export const MAX_CUSTOM_SUBJECTS = 6;
export const MAX_CUSTOM_CHAPTERS = 40;
const CUSTOM_COLORS = ['#5AC8FA', '#FFCC00', '#5856D6', '#A2845E', '#30B0C7', '#FF6482'];

const initialDraft = () => ({
  /** What the student wants to be called. Starts as their Google name; they can change it. */
  name: null,
  /** The exam or board picked (its code; called `board` because phones always stored it so). */
  board: null,
  boardName: null,
  /** Short name, category and labels of the exam, for headings ("JEE Main", "Class"). */
  exam: null,
  /** `{ key, name, grade? }` when the exam has levels (classes, stages), else null. */
  level: null,
  /** The school class: the level's grade, or null for exams without classes. */
  cls: null,
  /** Catalogue subjects the student switched off. Everything else in the class is on. */
  turnedOff: [],
  /** Subjects the student added: { id, name, color, chapters: [chapter names] }. */
  customSubjects: [],
  taught: {},
  exams: [],
  schoolStart: '07:45',
  schoolEnd: '13:45',
  /** Saturdays: 'half', 'full', 'alternate' (2nd and 4th off) or 'off'. */
  saturday: 'half',
  /** Tuition form rows (see utils/tuitions.js). */
  tuitions: [newTuition({ days: [1, 3, 5], start: '16:00', end: '17:30' })],
  dailyLimitMins: 180,
});

const forSubject = (subject) => (key) => key.startsWith(`${subject}-`);

/** Drops ticked chapters and draft tests of one subject (its chapter list changed or it went away). */
function forgetSubject(draft, subject) {
  const belongs = forSubject(subject);
  return {
    ...draft,
    taught: Object.fromEntries(Object.entries(draft.taught).filter(([key]) => !belongs(key))),
    exams: draft.exams.filter((exam) => exam.subject !== subject),
  };
}

function nextCustomId(customSubjects) {
  for (let n = 1; n <= MAX_CUSTOM_SUBJECTS; n += 1) {
    const id = `custom${n}`;
    if (!customSubjects.some((subject) => subject.id === id)) return id;
  }
  return null;
}

/** True once an exam is picked, and a level too if the exam has levels. */
export const examChosen = (draft) => Boolean(draft.board && (!draft.exam?.hasLevels || draft.level));

/** The set-up answers, kept across the five steps until "Build my plan". */
export const useOnboardingStore = create((set) => ({
  draft: initialDraft(),
  update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  /** Picks an exam (as `GET /syllabus/exams` lists it). Subjects, ticks and tests start over. */
  setExam: (exam) =>
    set((state) => {
      if (exam && state.draft.board === exam.code) return state;
      const info = exam
        ? { code: exam.code, shortName: exam.shortName, category: exam.category, categoryGroup: exam.categoryGroup, levelLabel: exam.levelLabel, unitLabel: exam.unitLabel, hasLevels: exam.levels.length > 0, color: exam.color, logoUrl: exam.logoUrl }
        : null;
      return { draft: { ...state.draft, board: exam?.code ?? null, boardName: exam?.name ?? null, exam: info, level: null, cls: null, turnedOff: [], taught: {}, exams: [] } };
    }),
  /** Picks a level of the exam: `{ key, name, grade? }`. */
  setLevel: (level) =>
    set((state) =>
      state.draft.level?.key === level.key
        ? state
        : { draft: { ...state.draft, level: { key: level.key, name: level.name, ...(level.grade ? { grade: level.grade } : {}) }, cls: level.grade ?? null, turnedOff: [], taught: {}, exams: [] } },
    ),
  toggleSubject: (subject) =>
    set((state) => {
      const off = state.draft.turnedOff;
      return { draft: { ...state.draft, turnedOff: off.includes(subject) ? off.filter((id) => id !== subject) : [...off, subject] } };
    }),
  /** Adds a subject, or replaces the one with the same id. Returns the saved subject. */
  saveCustomSubject: ({ id, name, chapters }) => {
    let saved = null;
    set((state) => {
      const list = state.draft.customSubjects;
      const existing = list.find((subject) => subject.id === id);
      if (existing) {
        saved = { ...existing, name, chapters };
        const sameChapters = existing.chapters.join('\n') === chapters.join('\n');
        const draft = sameChapters ? state.draft : forgetSubject(state.draft, id);
        return { draft: { ...draft, customSubjects: list.map((subject) => (subject.id === id ? saved : subject)) } };
      }
      const newId = nextCustomId(list);
      if (!newId) return state;
      const used = new Set(list.map((subject) => subject.color));
      const color = CUSTOM_COLORS.find((candidate) => !used.has(candidate)) ?? CUSTOM_COLORS[list.length % CUSTOM_COLORS.length];
      saved = { id: newId, name, color, chapters };
      // A freed-up id may still have leftovers from the subject that had it before.
      return { draft: { ...forgetSubject(state.draft, newId), customSubjects: [...list, saved] } };
    });
    return saved;
  },
  removeCustomSubject: (id) =>
    set((state) => {
      const draft = forgetSubject(state.draft, id);
      return { draft: { ...draft, customSubjects: draft.customSubjects.filter((subject) => subject.id !== id) } };
    }),
  toggleTaught: (key) =>
    set((state) => ({ draft: { ...state.draft, taught: { ...state.draft.taught, [key]: !state.draft.taught[key] } } })),
  addExam: (exam) => set((state) => ({ draft: { ...state.draft, exams: [...state.draft.exams, exam] } })),
  updateExam: (exam) => set((state) => ({ draft: { ...state.draft, exams: state.draft.exams.map((item) => (item.id === exam.id ? exam : item)) } })),
  /** Adds one exam's papers to the draft datesheet, replacing the papers in `replaceIds` (when editing). */
  saveSeries: (papers, replaceIds = []) =>
    set((state) => ({ draft: { ...state.draft, exams: [...state.draft.exams.filter((exam) => !replaceIds.includes(exam.id)), ...papers] } })),
  removeExams: (ids) => set((state) => ({ draft: { ...state.draft, exams: state.draft.exams.filter((exam) => !ids.includes(exam.id)) } })),
  removeExam: (id) => set((state) => ({ draft: { ...state.draft, exams: state.draft.exams.filter((exam) => exam.id !== id) } })),
  reset: () => set({ draft: initialDraft() }),
}));

/** An added subject in the same shape as a catalogue subject, chapters keyed `<id>-<n>`. */
export function customAsCatalog(subject) {
  return {
    id: subject.id,
    name: subject.name,
    color: subject.color,
    custom: true,
    chapters: subject.chapters.map((name, index) => ({ key: `${subject.id}-${index + 1}`, name, difficulty: 2 })),
  };
}

/** Every subject in setup: the class's catalogue followed by the student's own. */
export function draftCatalog(draft, syllabus = []) {
  return [...syllabus.map((subject) => ({ ...subject, custom: false })), ...draft.customSubjects.map(customAsCatalog)];
}

/** Only the subjects the student takes. */
export function chosenSubjects(draft, syllabus = []) {
  return draftCatalog(draft, syllabus).filter((subject) => subject.custom || !draft.turnedOff.includes(subject.id));
}
