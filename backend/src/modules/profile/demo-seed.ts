import { addDays, type DateKey } from '../../common/utils/dates.js';
import type { NewChapter } from '../chapters/chapter.repository.js';
import type { NewExam } from '../exams/exam.repository.js';
import type { NewHomework } from '../homework/homework.repository.js';
import type { NewTask } from '../tasks/task.repository.js';
import type { ChapterStatus } from '../planner/planner.types.js';
import {
  catalogChapters,
  SUBJECT_IDS,
  SUBJECTS,
  type SubjectId,
} from '../syllabus/syllabus.data.js';
import type { NewProfile } from './profile.repository.js';

/** Demo student: Class 9 CBSE with a realistic week of work, ported from the prototype. */
const STATUS_BY_NAME: Record<string, ChapterStatus> = {
  'Number Systems': 'mastered',
  Polynomials: 'mastered',
  'Coordinate Geometry': 'revised',
  'Linear Equations in Two Variables': 'revised',
  'Introduction to Euclid’s Geometry': 'revised',
  'Lines and Angles': 'revised',
  Triangles: 'learning',
  Quadrilaterals: 'learning',
  'Matter in Our Surroundings': 'mastered',
  'Is Matter Around Us Pure?': 'revised',
  'Atoms and Molecules': 'learning',
  'Structure of the Atom': 'learning',
  'The Fundamental Unit of Life': 'mastered',
  Tissues: 'revised',
  Motion: 'revised',
  'Force and Laws of Motion': 'revised',
  Gravitation: 'learning',
  'The French Revolution': 'mastered',
  'Socialism in Europe and the Russian Revolution': 'revised',
  'Nazism and the Rise of Hitler': 'learning',
  'India: Size and Location': 'mastered',
  'Physical Features of India': 'revised',
  Drainage: 'learning',
  'What is Democracy? Why Democracy?': 'revised',
  'Constitutional Design': 'learning',
  'The Story of Village Palampur': 'revised',
  'The Fun They Had': 'mastered',
  'The Sound of Music': 'learning',
  'The Little Girl': 'revised',
  'दो बैलों की कथा': 'learning',
  'ल्हासा की ओर': 'revised',
};

const LEARNING_HISTORY: Record<string, { learnedOn: number; revisions: number }> = {
  'maths-7': { learnedOn: -5, revisions: 1 },
  'science-9': { learnedOn: -7, revisions: 1 },
  'sst-1': { learnedOn: -30, revisions: 2 },
  'sst-3': { learnedOn: -1, revisions: 0 },
  'english-2': { learnedOn: -12, revisions: 2 },
};

/** Minutes studied 1…28 days ago. Index 0 is unused. */
const PAST_MINUTES = [
  0, 120, 95, 0, 160, 140, 150, 130, 0, 110, 150, 100, 0, 90, 120, 140, 0, 130, 100, 0, 150, 120,
  110, 90, 0, 140, 130, 100, 120,
];
const REST_DAYS = new Set([4, 9, 17]);
const MISSED_DAYS = new Set([12, 20]);

type DemoHomework = NewHomework & { ref: string };
type DemoTask = Omit<NewTask, 'homeworkId'> & { homeworkRef?: string };

export interface DemoData {
  profile: NewProfile;
  chapters: NewChapter[];
  exams: NewExam[];
  homework: DemoHomework[];
  tasks: DemoTask[];
  focus: { date: DateKey; subject: SubjectId; mins: number }[];
  restDays: DateKey[];
}

export function buildDemoData(today: DateKey, timezone: string): DemoData {
  const d = (offset: number) => addDays(today, offset);

  const chapters: NewChapter[] = catalogChapters(9).map((chapter, position) => {
    const history = LEARNING_HISTORY[chapter.key];
    return {
      ...chapter,
      position,
      status: STATUS_BY_NAME[chapter.name] ?? 'not',
      learnedOn: history ? d(history.learnedOn) : null,
      revisions: history?.revisions ?? 0,
      snoozedUntil: null,
    };
  });

  const exams: NewExam[] = [
    {
      subject: 'maths',
      name: 'Maths periodic test 2',
      date: d(6),
      weight: 20,
      chapterKeys: ['maths-6', 'maths-7', 'maths-8'],
    },
    {
      subject: 'science',
      name: 'Science periodic test 2',
      date: d(9),
      weight: 20,
      chapterKeys: ['science-3', 'science-4', 'science-9'],
    },
    {
      subject: 'english',
      name: 'English periodic test 2',
      date: d(13),
      weight: 20,
      chapterKeys: ['english-2', 'english-3', 'english-4'],
    },
  ];

  const hw = (
    ref: string,
    subject: SubjectId,
    title: string,
    due: number,
    teacher: string,
    note: string,
    mins: number,
    difficulty: number,
    weight: number,
    doneOn?: number,
  ): DemoHomework => ({
    ref,
    subject,
    title,
    due: d(due),
    teacher,
    note,
    mins,
    difficulty,
    weight,
    done: doneOn !== undefined,
    doneOn: doneOn !== undefined ? d(doneOn) : null,
  });
  const homework: DemoHomework[] = [
    hw(
      'hw1',
      'science',
      'Gravitation: exercise questions 1 to 8',
      1,
      'Mrs Kulkarni',
      'Write the formula first in every numerical. Units carry marks.',
      40,
      2,
      5,
    ),
    hw(
      'hw2',
      'maths',
      'Exercise 7.2, questions 1 to 6',
      2,
      'Ms Iyer',
      'Draw neat figures with a pencil and scale.',
      35,
      3,
      5,
    ),
    hw(
      'hw3',
      'english',
      'Diary entry as Evelyn Glennie (120 to 150 words)',
      3,
      'Mr D’Souza',
      'Follow the format: date, day, time, then signature.',
      30,
      1,
      5,
    ),
    hw(
      'hw5',
      'hindi',
      'दो बैलों की कथा: प्रश्न 1–5',
      4,
      'Mrs Sharma',
      'उत्तर साफ़ और पूरे वाक्यों में लिखें।',
      30,
      2,
      5,
    ),
    hw(
      'hw4',
      'sst',
      'Project: outline map of Indian rivers',
      6,
      'Mr Rao',
      'A4 outline map. Label ten rivers in blue ink.',
      90,
      2,
      10,
    ),
    hw(
      'hw6',
      'maths',
      'Exercise 7.1, all questions',
      -1,
      'Ms Iyer',
      'Show each congruence rule you use.',
      40,
      2,
      5,
      -1,
    ),
    hw(
      'hw7',
      'science',
      'Activity 9.1 write-up',
      -1,
      'Mrs Kulkarni',
      'Add a labelled diagram.',
      25,
      1,
      5,
      -2,
    ),
    hw('hw8', 'english', 'Grammar worksheet: modals', -2, 'Mr D’Souza', '', 20, 1, 5, -3),
  ];

  const t = (
    date: number,
    subject: SubjectId,
    title: string,
    kind: NewTask['kind'],
    mins: number,
    deadline: number,
    score: number,
    extra: Partial<DemoTask> = {},
  ): DemoTask => ({
    date: d(date),
    subject,
    title,
    kind,
    mins,
    deadline: d(deadline),
    score,
    source: 'me',
    status: 'accepted',
    done: false,
    chapterKey: null,
    why: '',
    ...extra,
  });
  const tasks: DemoTask[] = [
    t(-1, 'science', 'Atoms and Molecules: mole concept questions', 'practice', 30, 8, 5, {
      chapterKey: 'science-3',
    }),
    t(0, 'maths', 'Triangles: revise the SAS, ASA, SSS and RHS rules', 'revision', 30, 5, 10, {
      chapterKey: 'maths-7',
      done: true,
    }),
    t(0, 'science', 'Gravitation: exercise questions 1 to 8', 'homework', 40, 0, 9, {
      homeworkRef: 'hw1',
    }),
    t(0, 'english', 'The Sound of Music, Part II: read and make notes', 'revision', 35, 12, 2, {
      chapterKey: 'english-2',
      source: 'app',
    }),
    t(0, 'sst', 'River map: label the first five rivers', 'homework', 25, 5, 3, {
      homeworkRef: 'hw4',
    }),
    t(1, 'maths', 'Exercise 7.2, questions 1 to 6', 'homework', 35, 1, 8, { homeworkRef: 'hw2' }),
    t(1, 'hindi', 'दो बैलों की कथा: प्रश्न 1–5', 'homework', 30, 3, 3, { homeworkRef: 'hw5' }),
    t(2, 'english', 'Diary entry as Evelyn Glennie', 'homework', 30, 2, 4, { homeworkRef: 'hw3' }),
    t(2, 'maths', 'Quadrilaterals: theorems and Exercise 8.1', 'revision', 45, 5, 7, {
      chapterKey: 'maths-8',
    }),
    t(2, 'science', 'Structure of the Atom: Bohr model and valency', 'revision', 50, 8, 5, {
      chapterKey: 'science-4',
    }),
    t(2, 'sst', 'Constitutional Design: notes on the Constituent Assembly', 'revision', 40, 10, 2),
    t(2, 'hindi', 'व्याकरण: उपसर्ग और प्रत्यय अभ्यास', 'practice', 30, 9, 1),
    t(3, 'maths', 'Circles: read sections 9.1 and 9.2', 'revision', 40, 12, 2),
    t(3, 'sst', 'Drainage: lakes and river pollution', 'revision', 30, 10, 2),
  ];

  const focus: DemoData['focus'] = [{ date: today, subject: 'maths', mins: 25 }];
  const restDays: DateKey[] = [];
  for (let daysAgo = 1; daysAgo <= 28; daysAgo += 1) {
    if (REST_DAYS.has(daysAgo)) restDays.push(d(-daysAgo));
    else if (!MISSED_DAYS.has(daysAgo)) {
      focus.push({
        date: d(-daysAgo),
        subject: SUBJECT_IDS[daysAgo % SUBJECT_IDS.length] ?? 'maths',
        mins: PAST_MINUTES[daysAgo] || 110,
      });
    }
  }

  const profile: NewProfile = {
    cls: 9,
    board: 'cbse',
    boardName: 'CBSE',
    timezone,
    subjects: [...SUBJECT_IDS],
    subjectInfo: SUBJECT_IDS.map((id) => ({ ...SUBJECTS[id], custom: false })),
    schoolStart: 465,
    schoolEnd: 825,
    tuitionDays: [1, 3, 5],
    tuitionStart: 960,
    tuitionEnd: 1050,
    dailyLimitMins: 180,
    weeklyGoalMins: 900,
    ageMode: 'deeper',
    examSeason: false,
    sharing: {
      parent: true,
      items: { hours: true, streak: true, coverage: true, tests: true, marks: false },
      groups: false,
    },
    trackingStart: d(-28),
    isDemo: true,
  };

  return { profile, chapters, exams, homework, tasks, focus, restDays };
}
