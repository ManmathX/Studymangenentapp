import { create } from 'zustand';

/** Matches the API: up to 6 added subjects (`custom1` … `custom6`), 40 chapters each. */
export const MAX_CUSTOM_SUBJECTS = 6;
export const MAX_CUSTOM_CHAPTERS = 40;
const CUSTOM_COLORS = ['#5AC8FA', '#FFCC00', '#5856D6', '#A2845E', '#30B0C7', '#FF6482'];

const initialDraft = () => ({
  board: 'cbse',
  boardName: 'CBSE',
  cls: null,
  /** Catalogue subjects the student switched off. Everything else in the class is on. */
  turnedOff: [],
  /** Subjects the student added: { id, name, color, chapters: [chapter names] }. */
  customSubjects: [],
  taught: {},
  exams: [],
  schoolStart: '07:45',
  schoolEnd: '13:45',
  tuitionDays: [1, 3, 5],
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

/** The set-up answers, kept across the five steps until "Build my plan". */
export const useOnboardingStore = create((set) => ({
  draft: initialDraft(),
  update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  setBoard: (board, boardName) =>
    set((state) => (state.draft.board === board ? state : { draft: { ...state.draft, board, boardName, cls: null, turnedOff: [], taught: {}, exams: [] } })),
  setClass: (cls) => set((state) => (state.draft.cls === cls ? state : { draft: { ...state.draft, cls, turnedOff: [], taught: {}, exams: [] } })),
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
  removeExam: (id) => set((state) => ({ draft: { ...state.draft, exams: state.draft.exams.filter((exam) => exam.id !== id) } })),
  toggleTuition: (day) =>
    set((state) => {
      const days = state.draft.tuitionDays;
      return { draft: { ...state.draft, tuitionDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort() } };
    }),
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
