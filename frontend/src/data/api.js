import { exportBackup, parseBackup, restoreBackup } from './backup';
import {
  bag,
  createHomework,
  homeworkSummary,
  logFocus,
  pageHomework,
  removeHomework,
  saveCheckin,
  saveRoutines,
  setBagItem,
  setHomeworkDone,
  takeRestDay,
} from './daily';
import { habitsDashboard, progressDashboard, sharingDashboard, todayDashboard } from './dashboards';
import { addSubject, getProfile, onboard, seedDemo, updateProfile, wipeAll } from './setup';
import {
  acceptAll,
  acceptSuggestion,
  acceptTask,
  addRevision,
  autoSchedule,
  createExam,
  createExamSeries,
  examSeriesDraft,
  listChapters,
  listExams,
  moveTaskToBestDay,
  planDay,
  planStrip,
  removeExam,
  saveSuggestionForLater,
  scheduleChapter,
  scheduleProposal,
  setChapterStatus,
  setExamResult,
  skipSuggestion,
  skipTask,
  snoozeChapter,
  swapSuggestion,
  swapTask,
  updateExam,
  updateTask,
} from './study';

/**
 * Every planner operation the screens use, grouped by feature. The student's data lives only
 * on this device, never on the server; each call returns a Promise and rejects with an
 * AppError, so screens treat them like any other async action. Only sign-in and the board's
 * syllabus catalogue come from the server (see services/api/endpoints.js).
 */
const op =
  (fn) =>
  (...args) =>
    Promise.resolve().then(() => fn(...args));

export const profileApi = {
  onboard: op(onboard),
  loadDemo: op(seedDemo),
  get: op(getProfile),
  update: op(updateProfile),
  addSubject: op(addSubject),
  wipe: op(wipeAll),
};

export const dashboardApi = {
  today: op(todayDashboard),
  progress: op(progressDashboard),
  habits: op(habitsDashboard),
  sharing: op(sharingDashboard),
};

export const planApi = {
  strip: op((days) => planStrip(undefined, days)),
  day: op(planDay),
  autoSchedule: op(autoSchedule),
  acceptAll: op(acceptAll),
};

export const chaptersApi = {
  list: op((subject) => listChapters(subject ? { subject } : {})),
  setStatus: op(setChapterStatus),
  proposal: op(scheduleProposal),
  schedule: op(scheduleChapter),
  addRevision: op(addRevision),
  snooze: op(snoozeChapter),
};

export const tasksApi = {
  update: op(updateTask),
  accept: op(acceptTask),
  skip: op(skipTask),
  swap: op(swapTask),
  move: op(moveTaskToBestDay),
};

export const suggestionsApi = {
  accept: op((id) => acceptSuggestion(id)),
  later: op(saveSuggestionForLater),
  skip: op(skipSuggestion),
  swap: op(swapSuggestion),
};

export const examsApi = {
  upcoming: op(listExams),
  create: op(createExam),
  update: op(updateExam),
  setResult: op(setExamResult),
  remove: op(removeExam),
  seriesDraft: op(examSeriesDraft),
  createSeries: op(createExamSeries),
};

export const homeworkApi = {
  page: op(pageHomework),
  summary: op(homeworkSummary),
  create: op(createHomework),
  setDone: op(setHomeworkDone),
  remove: op(removeHomework),
};

export const habitsApi = {
  logFocus: op(logFocus),
  takeRestDay: op(takeRestDay),
  saveCheckin: op(saveCheckin),
  saveRoutines: op(saveRoutines),
  bag: op((date) => bag(date)),
  setBagItem: op(setBagItem),
};

export const backupApi = {
  export: op(exportBackup),
  parse: op(parseBackup),
  restore: op(restoreBackup),
};
