/**
 * Static reference data: CBSE subjects, NCERT chapters with difficulty (1 easy … 3 hard),
 * a weekly school timetable and bag items. Ported from the product prototype.
 */
export const SUBJECT_IDS = ['maths', 'science', 'sst', 'english', 'hindi'] as const;
export type BuiltInSubjectId = (typeof SUBJECT_IDS)[number];

/**
 * Subject ids are short lowercase slugs. Admins define them per board and class in the
 * syllabus catalogue (`maths`, `physics`, `odia`…). Students can also add subjects the
 * catalogue lacks during setup; those get the reserved ids `custom1` … `custom6` and keep
 * their own chapter list on the student's chapters.
 */
export type SubjectId = string;
export const MAX_CUSTOM_SUBJECTS = 6;
export const SUBJECT_ID_PATTERN = /^[a-z][a-z0-9]{1,23}$/;
export const CUSTOM_SUBJECT_ID_PATTERN = new RegExp(`^custom[1-${MAX_CUSTOM_SUBJECTS}]$`);
/** Catalogue subjects may not use the `custom<n>` ids kept for student-added subjects. */
export const RESERVED_SUBJECT_ID_PATTERN = /^custom\d*$/;
/** Chapters are keyed `<subject>-<n>`, 1-based, e.g. `maths-3` or `custom1-12`. */
export const CHAPTER_KEY_PATTERN = /^[a-z][a-z0-9]{1,23}-\d{1,2}$/;
export const MAX_CHAPTERS_PER_SUBJECT = 60;

export interface SubjectInfo {
  id: SubjectId;
  name: string;
  color: string;
}

export function isBuiltInSubject(id: string): id is BuiltInSubjectId {
  return (SUBJECT_IDS as readonly string[]).includes(id);
}

/** Display name for a subject: the student's own copy first, then the built-in name. */
export function subjectName(id: SubjectId, known: readonly SubjectInfo[] = []): string {
  const own = known.find((subject) => subject.id === id);
  if (own) return own.name;
  return isBuiltInSubject(id) ? SUBJECTS[id].name : 'Other subject';
}

export const SUBJECTS: Record<BuiltInSubjectId, SubjectInfo> = {
  maths: { id: 'maths', name: 'Maths', color: '#007AFF' },
  science: { id: 'science', name: 'Science', color: '#34C759' },
  sst: { id: 'sst', name: 'Social Science', color: '#FF9500' },
  english: { id: 'english', name: 'English', color: '#AF52DE' },
  hindi: { id: 'hindi', name: 'Hindi', color: '#FF2D55' },
};

type ChapterList = readonly (readonly [name: string, difficulty: 1 | 2 | 3])[];

export const SUPPORTED_CLASSES = [9, 10] as const;
export type SupportedClass = (typeof SUPPORTED_CLASSES)[number];
export const ALL_CLASSES = [6, 7, 8, 9, 10, 11, 12] as const;

export const SYLLABUS: Record<SupportedClass, Record<BuiltInSubjectId, ChapterList>> = {
  9: {
    maths: [
      ['Number Systems', 2],
      ['Polynomials', 2],
      ['Coordinate Geometry', 1],
      ['Linear Equations in Two Variables', 2],
      ['Introduction to Euclid’s Geometry', 1],
      ['Lines and Angles', 2],
      ['Triangles', 3],
      ['Quadrilaterals', 2],
      ['Circles', 3],
      ['Heron’s Formula', 1],
      ['Surface Areas and Volumes', 2],
      ['Statistics', 1],
    ],
    science: [
      ['Matter in Our Surroundings', 1],
      ['Is Matter Around Us Pure?', 2],
      ['Atoms and Molecules', 3],
      ['Structure of the Atom', 2],
      ['The Fundamental Unit of Life', 2],
      ['Tissues', 1],
      ['Motion', 3],
      ['Force and Laws of Motion', 3],
      ['Gravitation', 3],
      ['Work and Energy', 2],
      ['Sound', 2],
      ['Improvement in Food Resources', 1],
    ],
    sst: [
      ['The French Revolution', 2],
      ['Socialism in Europe and the Russian Revolution', 3],
      ['Nazism and the Rise of Hitler', 2],
      ['Forest Society and Colonialism', 2],
      ['Pastoralists in the Modern World', 2],
      ['India: Size and Location', 1],
      ['Physical Features of India', 2],
      ['Drainage', 2],
      ['Climate', 2],
      ['Natural Vegetation and Wildlife', 1],
      ['Population', 1],
      ['What is Democracy? Why Democracy?', 1],
      ['Constitutional Design', 2],
      ['Electoral Politics', 2],
      ['Working of Institutions', 3],
      ['Democratic Rights', 2],
      ['The Story of Village Palampur', 1],
      ['People as Resource', 1],
      ['Poverty as a Challenge', 2],
      ['Food Security in India', 2],
    ],
    english: [
      ['The Fun They Had', 1],
      ['The Sound of Music', 1],
      ['The Little Girl', 1],
      ['A Truly Beautiful Mind', 2],
      ['The Snake and the Mirror', 1],
      ['My Childhood', 1],
      ['Reach for the Top', 1],
      ['Kathmandu', 1],
      ['If I Were You', 2],
    ],
    hindi: [
      ['दो बैलों की कथा', 2],
      ['ल्हासा की ओर', 2],
      ['उपभोक्तावाद की संस्कृति', 3],
      ['साँवले सपनों की याद', 2],
      ['प्रेमचंद के फटे जूते', 2],
      ['मेरे बचपन के दिन', 2],
    ],
  },
  10: {
    maths: [
      ['Real Numbers', 2],
      ['Polynomials', 2],
      ['Pair of Linear Equations in Two Variables', 3],
      ['Quadratic Equations', 3],
      ['Arithmetic Progressions', 2],
      ['Triangles', 3],
      ['Coordinate Geometry', 2],
      ['Introduction to Trigonometry', 3],
      ['Some Applications of Trigonometry', 2],
      ['Circles', 2],
      ['Areas Related to Circles', 2],
      ['Surface Areas and Volumes', 2],
      ['Statistics', 2],
      ['Probability', 1],
    ],
    science: [
      ['Chemical Reactions and Equations', 2],
      ['Acids, Bases and Salts', 2],
      ['Metals and Non-metals', 2],
      ['Carbon and its Compounds', 3],
      ['Life Processes', 3],
      ['Control and Coordination', 2],
      ['How do Organisms Reproduce?', 2],
      ['Heredity', 2],
      ['Light: Reflection and Refraction', 3],
      ['The Human Eye and the Colourful World', 2],
      ['Electricity', 3],
      ['Magnetic Effects of Electric Current', 2],
      ['Our Environment', 1],
    ],
    sst: [
      ['The Rise of Nationalism in Europe', 3],
      ['Nationalism in India', 3],
      ['The Making of a Global World', 3],
      ['The Age of Industrialisation', 2],
      ['Print Culture and the Modern World', 2],
      ['Resources and Development', 2],
      ['Forest and Wildlife Resources', 1],
      ['Water Resources', 1],
      ['Agriculture', 2],
      ['Minerals and Energy Resources', 2],
      ['Manufacturing Industries', 2],
      ['Lifelines of National Economy', 2],
      ['Power Sharing', 1],
      ['Federalism', 2],
      ['Gender, Religion and Caste', 2],
      ['Political Parties', 2],
      ['Outcomes of Democracy', 1],
      ['Development', 1],
      ['Sectors of the Indian Economy', 2],
      ['Money and Credit', 2],
      ['Globalisation and the Indian Economy', 2],
    ],
    english: [
      ['A Letter to God', 1],
      ['Nelson Mandela: Long Walk to Freedom', 2],
      ['Two Stories about Flying', 1],
      ['From the Diary of Anne Frank', 2],
      ['Glimpses of India', 1],
      ['Mijbil the Otter', 1],
      ['Madam Rides the Bus', 1],
      ['The Sermon at Benares', 1],
      ['The Proposal', 2],
    ],
    hindi: [
      ['नेताजी का चश्मा', 2],
      ['बालगोबिन भगत', 2],
      ['लखनवी अंदाज़', 2],
      ['नौबतखाने में इबादत', 3],
      ['संस्कृति', 3],
    ],
  },
};

export type PeriodId = BuiltInSubjectId | 'lab' | 'pe' | 'computer' | 'art' | 'library';

/** Periods per weekday (1 = Monday … 6 = Saturday). Sunday has no school. */
export const TIMETABLE: Record<number, readonly PeriodId[]> = {
  1: ['english', 'maths', 'science', 'hindi', 'sst', 'maths', 'pe', 'computer'],
  2: ['maths', 'science', 'english', 'sst', 'hindi', 'lab', 'lab', 'art'],
  3: ['science', 'maths', 'hindi', 'english', 'sst', 'maths', 'library', 'pe'],
  4: ['maths', 'english', 'science', 'sst', 'hindi', 'computer', 'lab', 'lab'],
  5: ['hindi', 'maths', 'science', 'english', 'sst', 'maths', 'art', 'pe'],
  6: ['maths', 'science', 'english', 'sst', 'hindi'],
};

export const PERIOD_LABELS: Record<Exclude<PeriodId, BuiltInSubjectId>, string> = {
  lab: 'Science lab',
  pe: 'PE',
  computer: 'Computer',
  art: 'Art',
  library: 'Library',
};

export const BAG_EXTRAS: Record<Exclude<PeriodId, BuiltInSubjectId>, string> = {
  lab: 'Lab coat and practical file',
  pe: 'PE shoes and house T-shirt',
  computer: 'Computer notebook',
  art: 'Sketchbook and colours',
  library: 'Library book to return',
};

export const ROUTINES = {
  morning: ['Look at today’s plan', 'Pack the bag from the checklist', 'Do one revision nudge'],
  evening: [
    'Tick off what you finished',
    'Move anything that slipped',
    'Pick tomorrow’s first task',
  ],
} as const;

export function isSupportedClass(value: number): value is SupportedClass {
  return (SUPPORTED_CLASSES as readonly number[]).includes(value);
}

export function isSubjectPeriod(period: PeriodId): period is BuiltInSubjectId {
  return isBuiltInSubject(period);
}

export interface CatalogChapter {
  key: string;
  subject: SubjectId;
  name: string;
  difficulty: 1 | 2 | 3;
}

/** Chapters for one class, keyed `<subject>-<n>` (1-based) like the prototype. */
export function catalogChapters(
  cls: SupportedClass,
  subjects: readonly BuiltInSubjectId[] = SUBJECT_IDS,
): CatalogChapter[] {
  return subjects.flatMap((subject) =>
    SYLLABUS[cls][subject].map(([name, difficulty], index) => ({
      key: `${subject}-${index + 1}`,
      subject,
      name,
      difficulty,
    })),
  );
}
