/**
 * What a new catalogue starts with, besides the CBSE and ICSE syllabus
 * (standard-catalog.data.ts): the exam categories, and the setup of common competitive exams.
 *
 * Competitive exams come with their conducting body, eligibility, languages and subjects, and
 * an empty draft syllabus. Students don't see them until an admin fills in the syllabus and
 * publishes it. Details describe the 2025 sessions; admins update them as they change.
 */
import { slugify } from '../../common/utils/text.js';
import type { CategoryRecord, ExamLevel, ExamStructure, Region } from './catalog.types.js';
import type { NewExam } from './exam.repository.js';
import { RESERVED_SUBJECT_ID_PATTERN } from './syllabus.data.js';

/** Where legacy boards are filed, and where new school boards usually go. */
export const SCHOOL_BOARDS_CATEGORY = 'school-boards';

export const DEFAULT_CATEGORIES: CategoryRecord[] = [
  {
    code: SCHOOL_BOARDS_CATEGORY,
    name: 'School Boards',
    description: 'CBSE, ICSE and state boards',
    group: 'board',
  },
  {
    code: 'engineering',
    name: 'Engineering Entrance',
    description: 'JEE Main, JEE Advanced and other engineering entrance exams',
    group: 'exam',
  },
  {
    code: 'medical',
    name: 'Medical Entrance',
    description: 'NEET UG and other medical entrance exams',
    group: 'exam',
  },
  {
    code: 'university',
    name: 'University Entrance',
    description: 'CUET and other university entrance tests',
    group: 'exam',
  },
  {
    code: 'government',
    name: 'Government Exams',
    description: 'UPSC, NDA and other government exams',
    group: 'exam',
  },
  {
    code: 'olympiads',
    name: 'Olympiads',
    description: 'Science, mathematics and other olympiads',
    group: 'exam',
  },
  { code: 'other', name: 'Other Exams', description: 'Any other exam', group: 'exam' },
].map((category, position) => ({
  ...category,
  group: category.group as CategoryRecord['group'],
  position,
  isActive: true,
}));

/** Colours handed to subjects in turn; admins can change them. */
export const SUBJECT_PALETTE = [
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FFCC00',
  '#5856D6',
  '#A2845E',
  '#30B0C7',
  '#FF6482',
  '#64D2FF',
];

/** Colours for well-known subjects, so a subject looks the same in every exam. */
const SUBJECT_COLORS: Record<string, string> = {
  physics: '#5856D6',
  chemistry: '#30B0C7',
  mathematics: '#007AFF',
  maths: '#007AFF',
  biology: '#34C759',
  english: '#AF52DE',
};

export const EXAM_PALETTE = ['#007AFF', '#AF52DE', '#34C759', '#FF9500', '#FF2D55', '#5856D6'];

export function colorFor(text: string, palette = EXAM_PALETTE): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
}

export const subjectColor = (subjectId: string, index: number) =>
  SUBJECT_COLORS[subjectId] ?? SUBJECT_PALETTE[index % SUBJECT_PALETTE.length]!;

/** A subject id from its name: "General Studies I" → "generalstudiesi". Never `custom…`. */
export function newSubjectId(name: string, taken: ReadonlySet<string>): string {
  let base = slugify(name, '').slice(0, 20);
  if (!/^[a-z]/.test(base)) base = `s${base}`;
  if (base.length < 2 || RESERVED_SUBJECT_ID_PATTERN.test(base))
    base = `subject${base}`.slice(0, 20);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}${n}`;
  return candidate;
}

export const classLevels = (from: number, to: number): ExamLevel[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    key: String(from + i),
    name: `Class ${from + i}`,
    grade: from + i,
  }));

const SCHOOL_STRUCTURE: ExamStructure = {
  levelLabel: 'Class',
  levels: classLevels(6, 12),
  useUnits: false,
  unitLabel: 'Unit',
  useTopics: true,
  useSubtopics: false,
};

/** A school board with classes 6–12, like every board the catalogue had before exams. */
export function schoolBoardExam(input: {
  code: string;
  name: string;
  region: Region;
  position: number;
  shortName?: string;
  state?: string;
  description?: string;
  conductingBody?: string;
  languages?: string[];
  color?: string;
  levels?: ExamLevel[];
}): NewExam {
  const structure = structuredClone(SCHOOL_STRUCTURE);
  if (input.levels) structure.levels = input.levels;
  return {
    code: input.code,
    name: input.name,
    shortName:
      input.shortName ??
      (input.name.length <= 16 ? input.name : input.code.toUpperCase().slice(0, 16)),
    category: SCHOOL_BOARDS_CATEGORY,
    description: input.description ?? '',
    color: input.color ?? colorFor(input.code),
    logo: null,
    conductingBody: input.conductingBody ?? '',
    region: input.region,
    state: input.state ?? '',
    eligibility: '',
    targetGrades: structure.levels.flatMap((level) => (level.grade ? [level.grade] : [])),
    structure,
    languages: input.languages ?? [],
    isActive: true,
    position: input.position,
    settings: {},
  };
}

export const STANDARD_BOARDS = [
  schoolBoardExam({
    code: 'cbse',
    name: 'CBSE',
    region: 'national',
    position: 0,
    description: 'Central Board of Secondary Education, NCERT textbooks',
    conductingBody: 'Central Board of Secondary Education',
    languages: ['English', 'Hindi'],
    color: '#007AFF',
  }),
  schoolBoardExam({
    code: 'icse',
    name: 'ICSE',
    region: 'national',
    position: 1,
    description: 'ICSE (classes 6–10) and ISC (classes 11–12)',
    conductingBody: 'Council for the Indian School Certificate Examinations',
    languages: ['English'],
    color: '#AF52DE',
  }),
];

/**
 * State school boards (and J&K and NIOS), set up with classes and an empty draft syllabus.
 * Students see a board once an admin fills in its syllabus and publishes it. States whose
 * schools follow CBSE (Arunachal Pradesh, Sikkim, most union territories) are not listed.
 * Where classes 11–12 have their own body, both are named. Names as of 2025; admins can edit.
 */
const STATE_BOARD_LIST: {
  state: string;
  shortName: string;
  name: string;
  conductingBody: string;
  languages: string[];
}[] = [
  {
    state: 'Andhra Pradesh',
    shortName: 'AP Board',
    name: 'Andhra Pradesh Board (BSEAP)',
    conductingBody:
      'Board of Secondary Education, Andhra Pradesh; Board of Intermediate Education (classes 11–12)',
    languages: ['Telugu', 'English'],
  },
  {
    state: 'Assam',
    shortName: 'ASSEB',
    name: 'Assam Board (ASSEB)',
    conductingBody: 'Assam State School Education Board',
    languages: ['Assamese', 'Bengali', 'English'],
  },
  {
    state: 'Bihar',
    shortName: 'BSEB',
    name: 'Bihar Board (BSEB)',
    conductingBody: 'Bihar School Examination Board',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Chhattisgarh',
    shortName: 'CGBSE',
    name: 'Chhattisgarh Board (CGBSE)',
    conductingBody: 'Chhattisgarh Board of Secondary Education',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Goa',
    shortName: 'GBSHSE',
    name: 'Goa Board (GBSHSE)',
    conductingBody: 'Goa Board of Secondary and Higher Secondary Education',
    languages: ['English', 'Konkani', 'Marathi'],
  },
  {
    state: 'Gujarat',
    shortName: 'GSEB',
    name: 'Gujarat Board (GSEB)',
    conductingBody: 'Gujarat Secondary and Higher Secondary Education Board',
    languages: ['Gujarati', 'English', 'Hindi'],
  },
  {
    state: 'Haryana',
    shortName: 'BSEH',
    name: 'Haryana Board (BSEH)',
    conductingBody: 'Board of School Education Haryana',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Himachal Pradesh',
    shortName: 'HPBOSE',
    name: 'Himachal Pradesh Board (HPBOSE)',
    conductingBody: 'Himachal Pradesh Board of School Education',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Jammu and Kashmir',
    shortName: 'JKBOSE',
    name: 'Jammu and Kashmir Board (JKBOSE)',
    conductingBody: 'Jammu and Kashmir Board of School Education',
    languages: ['English', 'Urdu', 'Hindi'],
  },
  {
    state: 'Jharkhand',
    shortName: 'JAC',
    name: 'Jharkhand Board (JAC)',
    conductingBody: 'Jharkhand Academic Council',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Karnataka',
    shortName: 'KSEAB',
    name: 'Karnataka Board (KSEAB)',
    conductingBody: 'Karnataka School Examination and Assessment Board',
    languages: ['Kannada', 'English'],
  },
  {
    state: 'Kerala',
    shortName: 'Kerala Board',
    name: 'Kerala Board (SSLC, HSE)',
    conductingBody:
      'Kerala Board of Public Examinations; Directorate of Higher Secondary Education (classes 11–12)',
    languages: ['Malayalam', 'English'],
  },
  {
    state: 'Madhya Pradesh',
    shortName: 'MPBSE',
    name: 'Madhya Pradesh Board (MPBSE)',
    conductingBody: 'Board of Secondary Education, Madhya Pradesh',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Maharashtra',
    shortName: 'MSBSHSE',
    name: 'Maharashtra Board (MSBSHSE)',
    conductingBody: 'Maharashtra State Board of Secondary and Higher Secondary Education',
    languages: ['Marathi', 'English', 'Hindi'],
  },
  {
    state: 'Manipur',
    shortName: 'BOSEM',
    name: 'Manipur Board (BOSEM)',
    conductingBody:
      'Board of Secondary Education, Manipur; Council of Higher Secondary Education (classes 11–12)',
    languages: ['English', 'Manipuri'],
  },
  {
    state: 'Meghalaya',
    shortName: 'MBOSE',
    name: 'Meghalaya Board (MBOSE)',
    conductingBody: 'Meghalaya Board of School Education',
    languages: ['English'],
  },
  {
    state: 'Mizoram',
    shortName: 'MBSE',
    name: 'Mizoram Board (MBSE)',
    conductingBody: 'Mizoram Board of School Education',
    languages: ['English', 'Mizo'],
  },
  {
    state: 'Nagaland',
    shortName: 'NBSE',
    name: 'Nagaland Board (NBSE)',
    conductingBody: 'Nagaland Board of School Education',
    languages: ['English'],
  },
  {
    state: 'Odisha',
    shortName: 'BSE Odisha',
    name: 'Odisha Board (BSE, CHSE)',
    conductingBody:
      'Board of Secondary Education, Odisha; Council of Higher Secondary Education (classes 11–12)',
    languages: ['Odia', 'English'],
  },
  {
    state: 'Punjab',
    shortName: 'PSEB',
    name: 'Punjab Board (PSEB)',
    conductingBody: 'Punjab School Education Board',
    languages: ['Punjabi', 'English', 'Hindi'],
  },
  {
    state: 'Rajasthan',
    shortName: 'RBSE',
    name: 'Rajasthan Board (RBSE)',
    conductingBody: 'Board of Secondary Education, Rajasthan',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Tamil Nadu',
    shortName: 'TN Board',
    name: 'Tamil Nadu State Board',
    conductingBody: 'Directorate of Government Examinations, Tamil Nadu',
    languages: ['Tamil', 'English'],
  },
  {
    state: 'Telangana',
    shortName: 'BSE Telangana',
    name: 'Telangana Board (BSE, TGBIE)',
    conductingBody:
      'Board of Secondary Education, Telangana; Telangana Board of Intermediate Education (classes 11–12)',
    languages: ['Telugu', 'English', 'Urdu'],
  },
  {
    state: 'Tripura',
    shortName: 'TBSE',
    name: 'Tripura Board (TBSE)',
    conductingBody: 'Tripura Board of Secondary Education',
    languages: ['Bengali', 'English'],
  },
  {
    state: 'Uttar Pradesh',
    shortName: 'UP Board',
    name: 'Uttar Pradesh Board (UPMSP)',
    conductingBody: 'Uttar Pradesh Madhyamik Shiksha Parishad',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'Uttarakhand',
    shortName: 'UBSE',
    name: 'Uttarakhand Board (UBSE)',
    conductingBody: 'Uttarakhand Board of School Education',
    languages: ['Hindi', 'English'],
  },
  {
    state: 'West Bengal',
    shortName: 'WBBSE',
    name: 'West Bengal Board (WBBSE, WBCHSE)',
    conductingBody:
      'West Bengal Board of Secondary Education; West Bengal Council of Higher Secondary Education (classes 11–12)',
    languages: ['Bengali', 'English'],
  },
];

/** More boards for every database: NIOS, then the state boards A–Z (see STATE_BOARD_LIST). */
export const MORE_BOARDS: NewExam[] = [
  schoolBoardExam({
    code: 'nios',
    name: 'NIOS',
    shortName: 'NIOS',
    region: 'national',
    position: 2,
    description: 'National Institute of Open Schooling: secondary and senior secondary courses',
    conductingBody: 'National Institute of Open Schooling',
    languages: ['English', 'Hindi'],
    levels: [
      { key: '10', name: 'Secondary (Class 10)', grade: 10 },
      { key: '12', name: 'Senior Secondary (Class 12)', grade: 12 },
    ],
  }),
  ...STATE_BOARD_LIST.map((board, index) =>
    schoolBoardExam({
      code: slugify(board.state, '-'),
      name: board.name,
      shortName: board.shortName,
      region: 'state',
      state: board.state,
      position: 3 + index,
      description: `State board of ${board.state}`,
      conductingBody: board.conductingBody,
      languages: board.languages,
    }),
  ),
];

const NTA_LANGUAGES = [
  'English',
  'Hindi',
  'Assamese',
  'Bengali',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Odia',
  'Punjabi',
  'Tamil',
  'Telugu',
  'Urdu',
];

interface CompetitiveExam {
  exam: NewExam;
  /** Subjects of the first draft, per level ('' when the exam has no levels). */
  subjects: { level: string; name: string; units?: string[] }[];
}

function competitive(
  exam: Omit<NewExam, 'logo' | 'isActive' | 'settings' | 'state' | 'region'> & {
    region?: Region;
  },
  subjects: CompetitiveExam['subjects'],
): CompetitiveExam {
  return {
    exam: {
      region: 'national',
      state: '',
      logo: null,
      isActive: true,
      settings: {},
      ...exam,
    },
    subjects,
  };
}

const noLevels = (unitLabel = 'Unit', useSubtopics = false): ExamStructure => ({
  levelLabel: 'Level',
  levels: [],
  useUnits: true,
  unitLabel,
  useTopics: true,
  useSubtopics,
});

const each = (names: string[], extra: { level?: string } = {}) =>
  names.map((name) => ({ level: extra.level ?? '', name }));

export const COMPETITIVE_EXAMS: CompetitiveExam[] = [
  competitive(
    {
      code: 'jee-main',
      name: 'JEE Main',
      shortName: 'JEE Main',
      category: 'engineering',
      description:
        'Joint Entrance Examination (Main): admission to NITs, IIITs and other engineering colleges, and the qualifier for JEE Advanced.',
      color: '#FF9500',
      conductingBody: 'National Testing Agency (NTA)',
      eligibility: 'Passed or appearing in Class 12 with Physics, Chemistry and Mathematics.',
      targetGrades: [11, 12],
      structure: noLevels(),
      languages: NTA_LANGUAGES,
      position: 0,
    },
    each(['Physics', 'Chemistry', 'Mathematics']),
  ),
  competitive(
    {
      code: 'jee-advanced',
      name: 'JEE Advanced',
      shortName: 'JEE Adv',
      category: 'engineering',
      description: 'Admission to the IITs. Open to the top candidates of JEE Main Paper 1.',
      color: '#FF3B30',
      conductingBody: 'One of the IITs, in turn each year',
      eligibility: 'Qualify in JEE Main Paper 1; Class 12 with Physics, Chemistry and Mathematics.',
      targetGrades: [11, 12],
      structure: noLevels(),
      languages: ['English', 'Hindi'],
      position: 1,
    },
    each(['Physics', 'Chemistry', 'Mathematics']),
  ),
  competitive(
    {
      code: 'neet-ug',
      name: 'NEET UG',
      shortName: 'NEET',
      category: 'medical',
      description:
        'National Eligibility cum Entrance Test (UG): admission to MBBS, BDS, AYUSH and other medical courses.',
      color: '#34C759',
      conductingBody: 'National Testing Agency (NTA)',
      eligibility: 'Passed or appearing in Class 12 with Physics, Chemistry, Biology and English.',
      targetGrades: [11, 12],
      structure: noLevels(),
      languages: NTA_LANGUAGES,
      position: 0,
    },
    [
      ...each(['Physics', 'Chemistry']),
      { level: '', name: 'Biology', units: ['Botany', 'Zoology'] },
    ],
  ),
  competitive(
    {
      code: 'cuet-ug',
      name: 'CUET UG',
      shortName: 'CUET',
      category: 'university',
      description:
        'Common University Entrance Test (UG): admission to central and many state and private universities.',
      color: '#5856D6',
      conductingBody: 'National Testing Agency (NTA)',
      eligibility: 'Passed or appearing in Class 12. Each university sets its own subject rules.',
      targetGrades: [12],
      structure: noLevels('Section'),
      languages: NTA_LANGUAGES,
      position: 0,
    },
    [
      ...each(['English']),
      ...each(['General Test']),
      ...each([
        'Physics',
        'Chemistry',
        'Mathematics',
        'Biology',
        'Accountancy',
        'Business Studies',
        'Economics',
        'History',
        'Political Science',
        'Geography',
      ]),
    ],
  ),
  competitive(
    {
      code: 'upsc-cse',
      name: 'UPSC Civil Services',
      shortName: 'UPSC CSE',
      category: 'government',
      description: 'Civil Services Examination for the IAS, IPS, IFS and other central services.',
      color: '#A2845E',
      conductingBody: 'Union Public Service Commission (UPSC)',
      eligibility: 'A graduate degree. Age and attempt limits depend on the category.',
      targetGrades: [],
      structure: {
        levelLabel: 'Stage',
        levels: [
          { key: 'prelims', name: 'Prelims' },
          { key: 'mains', name: 'Mains' },
        ],
        useUnits: true,
        unitLabel: 'Section',
        useTopics: true,
        useSubtopics: true,
      },
      languages: ['English', 'Hindi'],
      position: 0,
    },
    [
      ...each(['General Studies'], { level: 'prelims' }),
      ...each(['CSAT'], { level: 'prelims' }),
      { level: 'mains', name: 'Essay' },
      { level: 'mains', name: 'General Studies I' },
      { level: 'mains', name: 'General Studies II' },
      { level: 'mains', name: 'General Studies III' },
      { level: 'mains', name: 'General Studies IV' },
      { level: 'mains', name: 'Optional Subject' },
    ],
  ),
  competitive(
    {
      code: 'nda',
      name: 'NDA',
      shortName: 'NDA',
      category: 'government',
      description: 'National Defence Academy and Naval Academy entrance, held twice a year.',
      color: '#30B0C7',
      conductingBody: 'Union Public Service Commission (UPSC)',
      eligibility:
        'Passed or appearing in Class 12 (Physics and Mathematics for the Air Force and Navy wings).',
      targetGrades: [11, 12],
      structure: noLevels('Section'),
      languages: ['English', 'Hindi'],
      position: 1,
    },
    [...each(['Mathematics']), ...each(['English', 'General Knowledge'])],
  ),
  olympiad(
    'nso',
    'National Science Olympiad',
    'NSO',
    ['Logical Reasoning', 'Science', 'Achievers Section'],
    0,
  ),
  olympiad(
    'imo',
    'International Mathematics Olympiad',
    'IMO',
    ['Logical Reasoning', 'Mathematical Reasoning', 'Everyday Mathematics', 'Achievers Section'],
    1,
  ),
];

function olympiad(
  code: string,
  name: string,
  shortName: string,
  subjects: string[],
  position: number,
): CompetitiveExam {
  const levels = classLevels(6, 12);
  return competitive(
    {
      code,
      name,
      shortName,
      category: 'olympiads',
      description: `${name} by the Science Olympiad Foundation, held in schools.`,
      color: colorFor(code),
      conductingBody: 'Science Olympiad Foundation (SOF)',
      eligibility: 'Students of classes 1–12 whose school registers them.',
      targetGrades: [6, 7, 8, 9, 10, 11, 12],
      structure: { ...SCHOOL_STRUCTURE, levels },
      languages: ['English'],
      position,
    },
    levels.flatMap((level) => each(subjects, { level: level.key })),
  );
}
