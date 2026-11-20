import { chaptersApi, dashboardApi, examsApi, habitsApi, homeworkApi, planApi, profileApi, syllabusApi } from './api/endpoints';

/** Cache keys and loaders for each piece of screen data. */
export const resources = {
  today: { key: 'today', load: dashboardApi.today },
  progress: { key: 'progress', load: dashboardApi.progress },
  habits: { key: 'habits', load: dashboardApi.habits },
  sharing: { key: 'sharing', load: dashboardApi.sharing },
  profile: { key: 'profile', load: profileApi.get },
  planStrip: { key: 'planStrip', load: () => planApi.strip(14) },
  planDay: (date) => ({ key: `planDay:${date}`, load: () => planApi.day(date) }),
  exams: { key: 'exams', load: examsApi.upcoming },
  homeworkSummary: { key: 'homeworkSummary', load: homeworkApi.summary },
  homeworkOpen: { key: 'homeworkOpen', load: () => homeworkApi.page('open', 1, 100).then((page) => page.data) },
  bag: { key: 'bag', load: () => habitsApi.bag() },
  chapters: (subject) => ({ key: `chapters:${subject}`, load: () => chaptersApi.list(subject) }),
  proposal: (chapterKey) => ({ key: `proposal:${chapterKey}`, load: () => chaptersApi.proposal(chapterKey) }),
  syllabusClasses: { key: 'syllabusClasses', load: syllabusApi.classes },
  syllabus: (cls) => ({ key: `syllabus:${cls}`, load: () => syllabusApi.forClass(cls) }),
};
