import { create } from 'zustand';
import { SUBJECT_IDS } from '../theme/tokens';

const initialDraft = () => ({
  cls: null,
  subjects: [...SUBJECT_IDS],
  taught: {},
  exams: [],
  schoolStart: '07:45',
  schoolEnd: '13:45',
  tuitionDays: [1, 3, 5],
  dailyLimitMins: 180,
});

/** The set-up answers, kept across the five steps until "Build my plan". */
export const useOnboardingStore = create((set) => ({
  draft: initialDraft(),
  update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  setClass: (cls) => set((state) => ({ draft: { ...state.draft, cls, taught: {}, exams: [] } })),
  toggleSubject: (subject) =>
    set((state) => {
      const on = state.draft.subjects.includes(subject);
      const next = on ? state.draft.subjects.filter((id) => id !== subject) : [...state.draft.subjects, subject];
      return { draft: { ...state.draft, subjects: SUBJECT_IDS.filter((id) => next.includes(id)) } };
    }),
  toggleTaught: (key) =>
    set((state) => ({ draft: { ...state.draft, taught: { ...state.draft.taught, [key]: !state.draft.taught[key] } } })),
  addExam: (exam) => set((state) => ({ draft: { ...state.draft, exams: [...state.draft.exams, exam] } })),
  removeExam: (id) => set((state) => ({ draft: { ...state.draft, exams: state.draft.exams.filter((exam) => exam.id !== id) } })),
  toggleTuition: (day) =>
    set((state) => {
      const days = state.draft.tuitionDays;
      return { draft: { ...state.draft, tuitionDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort() } };
    }),
  reset: () => set({ draft: initialDraft() }),
}));
