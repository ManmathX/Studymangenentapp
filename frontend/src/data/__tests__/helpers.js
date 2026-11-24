import { __files } from 'expo-file-system';
import { setClockForTests } from '../clock';
import { loadData, persistNow, resetForTests } from '../db';

/** Wednesday 18 Nov 2026, 11:30 in Asia/Kolkata: before the 19:00 cut-off, so "start" is today. */
export const NOW = new Date('2026-11-18T06:00:00.000Z');
export const TODAY = '2026-11-18';

export const ONBOARDING = {
  name: 'Asha',
  cls: 9,
  subjects: ['maths', 'science', 'sst', 'english', 'hindi'],
  taughtChapterKeys: ['maths-1', 'maths-2', 'science-1'],
  exams: [{ subject: 'maths', name: 'Periodic test 2', date: '2026-11-28', weight: 20, chapterKeys: ['maths-1', 'maths-2', 'maths-3'] }],
  schoolStart: '07:45',
  schoolEnd: '13:45',
  tuitionDays: [1, 3, 5],
  dailyLimitMins: 180,
};

/** A fresh, empty planner on a pinned clock. */
export async function freshPlanner() {
  __files.clear();
  resetForTests();
  setClockForTests(NOW);
  await loadData();
}

/** Moves the pinned clock forward by whole days. */
export const advanceDays = (days) => setClockForTests(new Date(NOW.getTime() + days * 86_400_000));

/** Saves now and returns what is on "disk". */
export async function savedDocument() {
  await persistNow();
  return JSON.parse(__files.get('file:///documents/planner.json'));
}
