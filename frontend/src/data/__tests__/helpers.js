import { __files } from 'expo-file-system';
import { setClockForTests } from '../clock';
import { catalogChapters, SUBJECT_IDS, SUBJECTS } from '../core/syllabus';
import { loadData, persistNow, resetForTests } from '../db';

/** Wednesday 18 Nov 2026, 11:30 in Asia/Kolkata: before the 19:00 cut-off, so "start" is today. */
export const NOW = new Date('2026-11-18T06:00:00.000Z');
export const TODAY = '2026-11-18';

/** The signed-in account whose planner is open, and where its file lives. */
export const OWNER = '665f1c2b9a1e4b0012345678';
export const plannerFile = (owner = OWNER) => `file:///documents/planner-${owner}.json`;

/** CBSE Class 9 as the server's syllabus catalogue sends it (`GET /syllabus/9?board=cbse`). */
export const CATALOG = SUBJECT_IDS.map((id) => ({
  ...SUBJECTS[id],
  chapters: catalogChapters(9, [id]).map(({ key, name, difficulty }) => ({ key, name, difficulty })),
}));

export const ONBOARDING = {
  name: 'Asha',
  board: 'cbse',
  boardName: 'CBSE',
  cls: 9,
  catalog: CATALOG,
  subjects: ['maths', 'science', 'sst', 'english', 'hindi'],
  taughtChapterKeys: ['maths-1', 'maths-2', 'science-1'],
  exams: [{ subject: 'maths', name: 'Periodic test 2', date: '2026-11-28', weight: 20, chapterKeys: ['maths-1', 'maths-2', 'maths-3'] }],
  schoolStart: '07:45',
  schoolEnd: '13:45',
  tuitions: [{ name: '', days: [1, 3, 5], start: '16:00', end: '17:30' }],
  dailyLimitMins: 180,
};

/** A fresh, empty planner on a pinned clock, open for OWNER. */
export async function freshPlanner() {
  __files.clear();
  resetForTests();
  setClockForTests(NOW);
  await loadData(OWNER);
}

/** Moves the pinned clock forward by whole days. */
export const advanceDays = (days) => setClockForTests(new Date(NOW.getTime() + days * 86_400_000));

/** Saves now and returns what is on "disk". */
export async function savedDocument(owner = OWNER) {
  await persistNow();
  return JSON.parse(__files.get(plannerFile(owner)));
}
