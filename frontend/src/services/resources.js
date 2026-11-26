import { chaptersApi, dashboardApi, examsApi, habitsApi, homeworkApi, planApi, profileApi } from '../data/api';
import { setKnownSubjects } from '../store/subjectStore';
import { syllabusApi } from './api/endpoints';

/** The profile also tells every screen the names and colours of the student's subjects. */
const loadProfile = () =>
  profileApi.get().then((profile) => {
    setKnownSubjects(profile.subjectInfo);
    return profile;
  });

/** Cache keys and loaders for each piece of screen data. */
export const resources = {
  today: { key: 'today', load: dashboardApi.today },
  progress: { key: 'progress', load: dashboardApi.progress },
  habits: { key: 'habits', load: dashboardApi.habits },
  sharing: { key: 'sharing', load: dashboardApi.sharing },
  profile: { key: 'profile', load: loadProfile },
  planStrip: { key: 'planStrip', load: () => planApi.strip(14) },
  planDay: (date) => ({ key: `planDay:${date}`, load: () => planApi.day(date) }),
  exams: { key: 'exams', load: examsApi.upcoming },
  homeworkSummary: { key: 'homeworkSummary', load: homeworkApi.summary },
  homeworkOpen: { key: 'homeworkOpen', load: () => homeworkApi.page('open', 1, 100).then((page) => page.data) },
  bag: { key: 'bag', load: () => habitsApi.bag() },
  allChapters: { key: 'chapters:all', load: () => chaptersApi.list() },
  chapters: (subject) => ({ key: `chapters:${subject}`, load: () => chaptersApi.list(subject) }),
  proposal: (chapterKey) => ({ key: `proposal:${chapterKey}`, load: () => chaptersApi.proposal(chapterKey) }),
  examCategories: { key: 'examCategories', load: syllabusApi.categories },
  examCatalog: { key: 'examCatalog', load: syllabusApi.exams },
  /** `{ exam, level, labels, version, subjects }` for one exam (and level). */
  examSyllabus: (code, level) => ({ key: `examSyllabus:${code}:${level ?? ''}`, load: () => syllabusApi.examSubjects(code, level) }),
};
